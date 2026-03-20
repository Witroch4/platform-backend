import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { uploadToMinIOWithRetry } from "@/lib/minio";
import axios from "axios";
import { randomUUID } from "crypto";
import { sanitizeUrl } from "@/lib/utils/url";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const UPLOAD_CONCURRENCY = 6;
const RENDER_PARALLELISM = 3; // Ranges de páginas renderizadas em paralelo

// Post-processing: OpenAI "high" detail caps at 2048×2048; pixels above are wasted
const IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 80;

const execPromise = promisify(exec);

const log = {
	info: (message: string) => console.log(`[PDF-TO-IMAGE] INFO: ${message}`),
	error: (message: string) => console.error(`[PDF-TO-IMAGE] ERROR: ${message}`),
	warn: (message: string) => console.warn(`[PDF-TO-IMAGE] WARN: ${message}`),
};

interface ConvertOptions {
	density: number;
	savename: string;
	savedir: string;
}

/**
 * Obtém número de páginas do PDF usando pdfinfo (poppler-utils)
 */
async function getPageCount(pdfPath: string): Promise<number> {
	try {
		const { stdout } = await execPromise(`pdfinfo "${pdfPath}" 2>/dev/null | grep -i "^Pages:" | awk '{print $2}'`);
		const pages = parseInt(stdout.trim(), 10);
		if (Number.isNaN(pages) || pages <= 0) throw new Error("Não foi possível determinar páginas");
		return pages;
	} catch {
		// Fallback: renderiza todas de uma vez (sem split)
		return 0;
	}
}

/**
 * Renderiza um range de páginas com pdftoppm (tier 0) ou GhostScript (fallback)
 */
async function renderPageRange(
	pdfPath: string,
	outputDir: string,
	firstPage: number,
	lastPage: number,
	density: number,
): Promise<string[]> {
	const outputPrefix = path.join(outputDir, "page");

	// Tier 0: pdftoppm JPEG q90 — 3x mais rápido que PNG encoding (2.8s vs 8.9s por página)
	// JPEG q90 preserva qualidade suficiente para OCR/visão AI de manuscritos
	const rangeFlags = firstPage > 0 ? `-f ${firstPage} -l ${lastPage}` : "";
	const pdftoppmCmd = `pdftoppm -jpeg -jpegopt quality=90 -r ${density} ${rangeFlags} "${pdfPath}" "${outputPrefix}"`;

	try {
		await execPromise(pdftoppmCmd, { timeout: 120_000 });
		const files = (await fs.promises.readdir(outputDir)).filter((f) => f.startsWith("page-") && f.endsWith(".jpg"));
		if (files.length > 0) return files;
		throw new Error("pdftoppm gerou 0 arquivos");
	} catch (pdftoppmError) {
		log.warn(`pdftoppm falhou (range ${firstPage}-${lastPage}): ${pdftoppmError}`);
	}

	// Tier 1: GhostScript JPEG (fallback)
	if (firstPage <= 0) {
		const gsCmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -dJPEGQ=90 -r${density} -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -sOutputFile="${outputPrefix}-%d.jpg" "${pdfPath}"`;
		await execPromise(gsCmd, { timeout: 180_000 });
	} else {
		const gsCmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -dJPEGQ=90 -r${density} -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -dFirstPage=${firstPage} -dLastPage=${lastPage} -sOutputFile="${outputPrefix}-%d.jpg" "${pdfPath}"`;
		await execPromise(gsCmd, { timeout: 180_000 });
	}

	const files = (await fs.promises.readdir(outputDir)).filter((f) => f.startsWith("page-") && f.endsWith(".jpg"));
	if (files.length === 0) {
		throw new Error(`Nenhum arquivo gerado para range ${firstPage}-${lastPage}`);
	}
	return files;
}

/**
 * Extrai número da página do nome do arquivo (suporta pdftoppm e GS naming)
 * pdftoppm: "page-01.jpg", "page-1.jpg"
 * GhostScript: "page-1.jpg"
 */
function extractPageNumber(fileName: string): number {
	const match = fileName.match(/page-(\d+)\./);
	return match ? parseInt(match[1], 10) : 0;
}

/**
 * Resize + recompress rendered page for optimal AI vision model input.
 * Max 2048px longest side (OpenAI caps here), JPEG q80.
 */
async function optimizePageImage(buffer: Buffer): Promise<Buffer> {
	return sharp(buffer)
		.resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.jpeg({ quality: IMAGE_JPEG_QUALITY })
		.toBuffer();
}

/**
 * Upload em batch com concorrência limitada
 */
async function uploadBatch(
	files: string[],
	outputDir: string,
	baseName: string,
	mimeType: string,
): Promise<{ url: string; page: number }[]> {
	const results: { url: string; page: number }[] = [];

	for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
		const batch = files.slice(i, i + UPLOAD_CONCURRENCY);
		const batchResults = await Promise.all(
			batch.map(async (file) => {
				const filePath = path.join(outputDir, file);
				const rawBuffer = await fs.promises.readFile(filePath);
				const optimizedBuffer = await optimizePageImage(rawBuffer);
				log.info(`${file}: ${(rawBuffer.length / 1024).toFixed(0)}KB → ${(optimizedBuffer.length / 1024).toFixed(0)}KB`);
				const fileName = `${baseName}_${file}`;
				const uploadResult = await uploadToMinIOWithRetry(optimizedBuffer, fileName, mimeType, 3, false);

				// Remover temp
				fs.promises.unlink(filePath).catch(() => {});

				return { url: uploadResult.url, page: extractPageNumber(file) };
			}),
		);
		results.push(...batchResults);
	}

	return results;
}

/**
 * Pipeline principal: pdftoppm com rendering paralelo por ranges + upload sobreposto
 */
async function convertPdfToImages(pdfBuffer: Buffer, options: ConvertOptions): Promise<string[]> {
	const startTime = Date.now();
	const { density, savedir, savename } = options;
	const tmpDir = savedir || "/tmp";
	const baseName = savename || `pdf-${randomUUID()}`;
	const mimeType = "image/jpeg";

	// Salvar PDF temporário
	const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
	const outputDir = path.join(tmpDir, baseName);
	await fs.promises.mkdir(outputDir, { recursive: true });
	await fs.promises.writeFile(pdfPath, pdfBuffer);
	log.info(`PDF salvo: ${pdfPath} (${pdfBuffer.length} bytes)`);

	try {
		const totalPages = await getPageCount(pdfPath);
		log.info(`Total de páginas: ${totalPages || "desconhecido"}`);

		let allResults: { url: string; page: number }[] = [];

		if (totalPages > 0 && totalPages > RENDER_PARALLELISM) {
			// Pipeline sobreposto: divide em ranges paralelos, cada range renderiza e faz upload
			const pagesPerRange = Math.ceil(totalPages / RENDER_PARALLELISM);
			const ranges: { first: number; last: number }[] = [];

			for (let i = 0; i < RENDER_PARALLELISM; i++) {
				const first = i * pagesPerRange + 1;
				const last = Math.min((i + 1) * pagesPerRange, totalPages);
				if (first <= totalPages) ranges.push({ first, last });
			}

			log.info(`Rendering paralelo: ${ranges.length} ranges (${ranges.map((r) => `${r.first}-${r.last}`).join(", ")})`);

			// Cada range tem seu próprio outputDir para evitar conflito de nomes
			const rangeResults = await Promise.all(
				ranges.map(async (range, idx) => {
					const rangeDir = path.join(tmpDir, `${baseName}_r${idx}`);
					await fs.promises.mkdir(rangeDir, { recursive: true });

					const files = await renderPageRange(pdfPath, rangeDir, range.first, range.last, density);
					log.info(`Range ${range.first}-${range.last}: ${files.length} imagens renderizadas`);

					// Upload imediato deste range
					const uploaded = await uploadBatch(files, rangeDir, baseName, mimeType);

					// Cleanup range dir
					fs.promises.rm(rangeDir, { recursive: true, force: true }).catch(() => {});

					return uploaded;
				}),
			);

			allResults = rangeResults.flat();
		} else {
			// PDF pequeno ou page count desconhecido — renderiza tudo de uma vez
			const files = await renderPageRange(pdfPath, outputDir, 0, 0, density);
			log.info(`${files.length} imagens renderizadas`);

			allResults = await uploadBatch(files, outputDir, baseName, mimeType);
		}

		// Ordenar por número de página
		allResults.sort((a, b) => a.page - b.page);
		const urls = allResults.map((r) => r.url);

		const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
		log.info(`Conversão concluída: ${urls.length} imagens em ${elapsed}s`);

		if (urls.length === 0) throw new Error("Nenhuma imagem convertida");
		return urls;
	} finally {
		// Cleanup
		fs.promises.unlink(pdfPath).catch(() => {});
		fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => {});
	}
}

// Mantém o campo legado pdfConvertido limpo para evitar estados ambíguos
async function limparMetadadosLegadosDeConversao(leadId: string): Promise<void> {
	try {
		await prisma.arquivoLeadOab.updateMany({
			where: { leadOabDataId: leadId },
			data: { pdfConvertido: null },
		});
		log.info(`Metadados legados de conversão limpos para o lead ${leadId}`);
	} catch (error) {
		log.error(`Erro ao limpar metadados legados de conversão: ${error}`);
		throw error;
	}
}

function fixMinioUrl(url: string): string {
	if (!url) return url;
	let fixedUrl = url;
	if (url.includes("objstore.witdev.com.br")) {
		fixedUrl = url.replace("objstore.witdev.com.br", "objstoreapi.witdev.com.br");
	}
	if (!fixedUrl.startsWith("http://") && !fixedUrl.startsWith("https://")) {
		fixedUrl = `https://${fixedUrl}`;
	}
	return fixedUrl;
}

export async function POST(request: NextRequest) {
	try {
		log.info("Iniciando conversão de PDF para imagens");
		const payload = await request.json();
		const { leadId, pdfUrls: providedPdfUrls } = payload;
		log.info(`Payload recebido: ${JSON.stringify({ leadId })}`);

		if (!leadId) {
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		let pdfUrls = providedPdfUrls;
		if (!pdfUrls || !Array.isArray(pdfUrls) || pdfUrls.length === 0) {
			log.info(`Buscando PDF unificado do lead ${leadId}`);

			const lead = await prisma.leadOabData.findUnique({
				where: { id: leadId },
				select: { pdfUnificado: true },
			});

			if (!lead?.pdfUnificado) {
				return NextResponse.json({ error: "Nenhum PDF unificado encontrado para este lead" }, { status: 404 });
			}

			pdfUrls = [fixMinioUrl(lead.pdfUnificado)];
		}

		log.info(`Processando ${pdfUrls.length} URL(s) de PDF`);

		const convertedUrls: string[] = [];
		const failedUrls: string[] = [];

		for (const pdfUrl of pdfUrls) {
			try {
				const sanitizedPdfUrl = sanitizeUrl(pdfUrl);
				if (!sanitizedPdfUrl) {
					failedUrls.push(pdfUrl);
					log.error(`URL inválida: ${pdfUrl}`);
					continue;
				}

				const options: ConvertOptions = {
					density: 300,
					savename: `pdf-lead${leadId.substring(0, 8)}-${randomUUID().substring(0, 8)}`,
					savedir: "/tmp",
				};

				log.info(`Baixando PDF: ${sanitizedPdfUrl}`);
				const pdfResponse = await axios.get(sanitizedPdfUrl, {
					responseType: "arraybuffer",
					headers: { Accept: "application/pdf" },
					maxContentLength: 50 * 1024 * 1024,
					timeout: 30000,
				});

				log.info(`PDF baixado: ${pdfResponse.status}, ${pdfResponse.data.byteLength} bytes`);

				const pdfBuffer = Buffer.from(pdfResponse.data);
				const imagesUrls = await convertPdfToImages(pdfBuffer, options);
				convertedUrls.push(...imagesUrls);
			} catch (error) {
				failedUrls.push(pdfUrl);
				log.error(`Erro ao processar ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (convertedUrls.length > 0) {
			try {
				await limparMetadadosLegadosDeConversao(leadId);
				await prisma.leadOabData.update({
					where: { id: leadId },
					data: { imagensConvertidas: JSON.stringify(convertedUrls) },
				});
				log.info(`Lead atualizado: ${convertedUrls.length} imagens`);
			} catch (updateError) {
				log.error(`Erro ao atualizar lead: ${updateError}`);
			}
		}

		const response = {
			success: convertedUrls.length > 0,
			imageUrls: convertedUrls,
			convertedUrls,
			failedUrls,
			message: `${convertedUrls.length} PDFs convertidos com sucesso. ${failedUrls.length} falhas.`,
		};

		return NextResponse.json(response);
	} catch (error) {
		log.error(`Erro geral: ${error instanceof Error ? error.message : String(error)}`);
		return NextResponse.json(
			{ error: "Erro ao processar a requisição", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}

export async function GET(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const leadId = url.searchParams.get("leadId");

		if (!leadId) {
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		const arquivos = await prisma.arquivoLeadOab.findMany({
			where: { leadOabDataId: leadId },
			select: { id: true, dataUrl: true, fileType: true, pdfConvertido: true },
		});

		return NextResponse.json({ arquivos });
	} catch (error) {
		log.error(`Erro ao buscar arquivos convertidos: ${error}`);
		return NextResponse.json(
			{ error: "Erro ao buscar arquivos", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
