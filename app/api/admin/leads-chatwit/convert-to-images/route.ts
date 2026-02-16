import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { uploadToMinIOWithRetry } from "@/lib/minio";
import axios from "axios";
import type { Readable } from "stream";
import { randomUUID } from "crypto";
import { isValidUrl, sanitizeUrl } from "@/lib/utils/url";
import { fromBuffer } from "pdf2pic";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

// Constantes de otimização
const UPLOAD_CONCURRENCY = 6; // Uploads simultâneos

const execPromise = promisify(exec);

// Criar um logger simples sem depender da biblioteca
const log = {
	info: (message: string) => console.log(`[PDF-TO-IMAGE] INFO: ${message}`),
	error: (message: string) => console.error(`[PDF-TO-IMAGE] ERROR: ${message}`),
	warn: (message: string) => console.warn(`[PDF-TO-IMAGE] WARN: ${message}`),
};

interface PDF2PicOptions {
	density: number;
	savename: string;
	savedir: string;
	format: string;
	size: string | number;
}

/**
 * Converte um stream para um buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}

// Função para converter PDF para imagens usando ImageMagick diretamente
async function convertPdfToImagesWithImageMagick(pdfBuffer: Buffer, options: PDF2PicOptions): Promise<string[]> {
	try {
		log.info(`Iniciando conversão de PDF para imagens com ImageMagick (${pdfBuffer.length} bytes)`);

		// Configuração para a conversão
		const density = options.density || 300;
		const format = options.format || "png";
		const tmpDir = options.savedir || "/tmp";
		const baseName = options.savename || `pdf-${randomUUID()}`;

		// Garantir que o diretório temporário exista
		try {
			await fs.promises.access(tmpDir);
		} catch (error) {
			// Diretório não existe, tentar criá-lo
			log.info(`Diretório temporário ${tmpDir} não existe, criando...`);
			await fs.promises.mkdir(tmpDir, { recursive: true });
		}

		// Salvar o PDF em um arquivo temporário
		const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
		await fs.promises.writeFile(pdfPath, pdfBuffer);
		log.info(`PDF temporário salvo em: ${pdfPath} (${pdfBuffer.length} bytes)`);

		// Verificar o arquivo PDF
		try {
			const { stdout: pdfInfo } = await execPromise(
				`pdfinfo ${pdfPath} || echo "Não foi possível ler informações do PDF"`,
			);
			log.info(`Informações do PDF: ${pdfInfo.substring(0, 200)}...`);
		} catch (error) {
			log.warn(`Não foi possível obter informações do PDF: ${error}`);
		}

		// Criar o diretório de saída
		const outputDir = path.join(tmpDir, baseName);
		try {
			await fs.promises.mkdir(outputDir, { recursive: true });
			log.info(`Diretório de saída criado: ${outputDir}`);
		} catch (err) {
			log.warn(`Erro ao criar diretório: ${err}`);
			// Tentativa alternativa - usar diretório temporário diretamente
			log.info("Usando diretório temporário diretamente");
		}

		// Nome base para os arquivos de saída (sem extensão)
		const outputBaseName = path.join(outputDir, `page`);

		// Comando para converter PDF em imagens usando GhostScript com otimizações
		// Flags de otimização:
		// -dNumRenderingThreads=4: Paraleliza rendering em múltiplos cores
		// -c "100000000 setvirtualmemory": Aloca memória virtual (evita swap)
		// -dBufferSpace=500000000: Buffer de 500MB para melhor performance
		const gsCommand = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r${density} -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -dNumRenderingThreads=4 -dBufferSpace=500000000 -sOutputFile=${outputBaseName}-%d.${format} ${pdfPath}`;
		log.info(`Executando comando GhostScript: ${gsCommand}`);

		try {
			// Tentar usar Ghostscript diretamente
			const { stdout: gsStdout, stderr: gsStderr } = await execPromise(gsCommand);
			if (gsStderr) {
				log.warn(`Avisos do GhostScript: ${gsStderr}`);
			}
			log.info(`GhostScript concluído: ${gsStdout}`);
		} catch (gsError) {
			// Se falhar, tenta ImageMagick
			log.warn(`GhostScript falhou: ${gsError}, tentando ImageMagick...`);

			// Tentativa 2: Abordagem com convert do ImageMagick
			const convertCommand = `convert -density ${density} "${pdfPath}" -quality 100 "${outputBaseName}-%d.${format}"`;
			log.info(`Executando comando ImageMagick: ${convertCommand}`);

			try {
				const { stdout, stderr } = await execPromise(convertCommand);
				if (stderr) {
					log.warn(`Avisos do ImageMagick: ${stderr}`);
				}
				log.info(`ImageMagick concluído: ${stdout}`);
			} catch (convertError) {
				// Se falhar, tenta com magick do ImageMagick 7
				log.warn(`Convert falhou: ${convertError}, tentando com 'magick'...`);

				// Tentativa 3: Abordagem com magick do ImageMagick 7+
				const magickCommand = `magick -density ${density} "${pdfPath}" -quality 100 "${outputBaseName}-%d.${format}"`;
				log.info(`Executando comando Magick: ${magickCommand}`);

				const { stdout, stderr } = await execPromise(magickCommand);
				if (stderr) {
					log.warn(`Avisos do Magick: ${stderr}`);
				}
				log.info(`Magick concluído: ${stdout}`);
			}
		}

		// Listar arquivos no diretório para ver o que foi gerado
		log.info(`Listando arquivos em ${outputDir}`);
		const files = await fs.promises.readdir(outputDir);
		log.info(`Arquivos gerados: ${files.join(", ")}`);

		if (files.length === 0) {
			log.error(`Nenhum arquivo gerado na conversão. Verificando política do ImageMagick...`);
			try {
				const { stdout: policy } = await execPromise(
					`cat /etc/ImageMagick*/policy.xml || echo "Arquivo de política não encontrado"`,
				);
				log.info(`Política do ImageMagick: ${policy.substring(0, 500)}...`);
			} catch (policyError) {
				log.warn(`Não foi possível ler a política do ImageMagick: ${policyError}`);
			}
			throw new Error("Nenhum arquivo foi gerado durante a conversão do PDF para imagem");
		}

		// Salvar arquivos no MinIO - UPLOAD PARALELO COM LIMITE DE CONCORRÊNCIA
		const convertedImagesUrls: string[] = [];

		// Filtrar apenas arquivos de imagem e preparar para upload
		const imageFiles = files.filter((file) => file.endsWith(`.${format}`));
		log.info(`Preparando upload paralelo de ${imageFiles.length} imagens (concorrência: ${UPLOAD_CONCURRENCY})`);

		// Processar uploads em batches para limitar concorrência
		for (let i = 0; i < imageFiles.length; i += UPLOAD_CONCURRENCY) {
			const batch = imageFiles.slice(i, i + UPLOAD_CONCURRENCY);

			// Preparar arquivos do batch
			const batchUploads = await Promise.all(
				batch.map(async (file) => {
					const filePath = path.join(outputDir, file);
					const fileBuffer = await fs.promises.readFile(filePath);
					const fileName = `${baseName}_${file.replace(/%d/, Date.now().toString())}`;
					return { filePath, fileBuffer, fileName, file };
				}),
			);

			// Upload paralelo do batch
			const batchResults = await Promise.all(
				batchUploads.map(async ({ filePath, fileBuffer, fileName }) => {
					log.info(`Fazendo upload da imagem para MinIO: ${fileName} (${fileBuffer.length} bytes)`);
					const uploadResult = await uploadToMinIOWithRetry(
						fileBuffer,
						fileName,
						`image/${format}`,
						3, // maxRetries
						true, // generateThumbnail
					);
					log.info(`Imagem carregada no MinIO: ${uploadResult.url}`);

					// Remover arquivo temporário
					try {
						await fs.promises.unlink(filePath);
						log.info(`Arquivo temporário removido: ${filePath}`);
					} catch (unlinkError) {
						log.warn(`Não foi possível excluir arquivo temporário ${filePath}: ${unlinkError}`);
					}

					return uploadResult.url;
				}),
			);

			convertedImagesUrls.push(...batchResults);
			log.info(
				`Batch ${Math.floor(i / UPLOAD_CONCURRENCY) + 1}/${Math.ceil(imageFiles.length / UPLOAD_CONCURRENCY)} concluído`,
			);
		}

		// Remover o PDF temporário
		try {
			await fs.promises.unlink(pdfPath);
			log.info(`PDF temporário removido: ${pdfPath}`);
			// Remover o diretório temporário
			await fs.promises.rmdir(outputDir);
			log.info(`Diretório temporário removido: ${outputDir}`);
		} catch (unlinkError) {
			log.warn(`Não foi possível excluir arquivos temporários: ${unlinkError}`);
		}

		if (convertedImagesUrls.length === 0) {
			throw new Error("Nenhuma imagem foi convertida com sucesso");
		}

		log.info(`Conversão concluída: ${convertedImagesUrls.length} imagens geradas`);
		return convertedImagesUrls;
	} catch (error) {
		log.error(`Erro ao converter PDF para imagens: ${error}`);
		throw error;
	}
}

// Alias para a função de conversão - tenta primeiro com ImageMagick direto, depois com pdf2pic como fallback
async function convertPdfToImages(pdfBuffer: Buffer, options: PDF2PicOptions): Promise<string[]> {
	try {
		// Tenta usar ImageMagick diretamente
		return await convertPdfToImagesWithImageMagick(pdfBuffer, options);
	} catch (error) {
		log.warn(`Falha ao usar ImageMagick diretamente, tentando com pdf2pic: ${error}`);

		try {
			// Configuração do pdf2pic
			const pdf2picOptions = {
				density: options.density || 300,
				savename: options.savename,
				savedir: options.savedir || "/tmp",
				format: options.format || "png",
				width: typeof options.size === "number" ? options.size : 1024,
			};

			// Criando conversor a partir do buffer - usando ImageMagick em vez de GraphicsMagick
			const converter = fromBuffer(pdfBuffer, pdf2picOptions);

			// Configurando para usar ImageMagick em vez de GraphicsMagick
			converter.setGMClass(true);

			// Converter a primeira página
			const result = await converter(1, { responseType: "buffer" });

			if (!result || !result.buffer) {
				throw new Error("Falha ao converter a primeira página do PDF");
			}

			// Upload para MinIO
			const fileName = `${options.savename}_page1_${Date.now()}.${pdf2picOptions.format}`;
			const uploadResult = await uploadToMinIOWithRetry(result.buffer, fileName, `image/${pdf2picOptions.format}`);

			return [uploadResult.url];
		} catch (pdf2picError) {
			log.error(`Ambos os métodos de conversão falharam: ${pdf2picError}`);
			throw pdf2picError;
		}
	}
}

// Corrigir a relação com ArquivoLeadChatwit usando o nome correto do campo
async function atualizarStatusArquivos(leadId: string, arquivosConvertidos: boolean): Promise<void> {
	try {
		await prisma.arquivoLeadOab.updateMany({
			where: {
				leadOabDataId: leadId,
			},
			data: {
				pdfConvertido: arquivosConvertidos ? "true" : "false",
			},
		});

		log.info(`Status dos arquivos atualizado para o lead ${leadId}: ${arquivosConvertidos}`);
	} catch (error) {
		log.error(`Erro ao atualizar status dos arquivos: ${error}`);
		throw error;
	}
}

// Função para verificar e corrigir URLs do MinIO
function fixMinioUrl(url: string): string {
	try {
		// Verificar se a URL é válida
		if (!url) return url;

		// Correções comuns para URLs do MinIO
		let fixedUrl = url;

		// 1. Corrigir hostname se necessário (objstore -> objstoreapi)
		if (url.includes("objstore.witdev.com.br")) {
			fixedUrl = url.replace("objstore.witdev.com.br", "objstoreapi.witdev.com.br");
			log.info(`URL corrigida (hostname): ${fixedUrl}`);
		}

		// 2. Garantir que a URL tenha protocolo
		if (!fixedUrl.startsWith("http://") && !fixedUrl.startsWith("https://")) {
			fixedUrl = `https://${fixedUrl}`;
			log.info(`URL corrigida (protocolo): ${fixedUrl}`);
		}

		return fixedUrl;
	} catch (error) {
		log.warn(`Erro ao corrigir URL: ${error}`);
		return url; // Em caso de erro, retorna a URL original
	}
}

export async function POST(request: NextRequest) {
	try {
		log.info("Iniciando conversão de PDF para imagens");
		const payload = await request.json();
		const { leadId, pdfUrls: providedPdfUrls } = payload;
		log.info(`Payload recebido: ${JSON.stringify(payload)}`);

		if (!leadId) {
			log.error(`ID do lead não fornecido no payload`);
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		// Se pdfUrls não estiver presente no payload, buscar o PDF unificado do lead no banco de dados
		let pdfUrls = providedPdfUrls;
		if (!pdfUrls || !Array.isArray(pdfUrls) || pdfUrls.length === 0) {
			log.info(`URLs de PDF não fornecidas no payload, buscando PDF unificado do lead ${leadId}`);

			const lead = await prisma.leadOabData.findUnique({
				where: {
					id: leadId,
				},
				select: {
					pdfUnificado: true,
				},
			});

			if (!lead || !lead.pdfUnificado) {
				log.error(`Nenhum PDF unificado encontrado para o lead ${leadId}`);
				return NextResponse.json({ error: "Nenhum PDF unificado encontrado para este lead" }, { status: 404 });
			}

			log.info(`PDF unificado encontrado: ${lead.pdfUnificado}`);
			const correctedPdfUrl = fixMinioUrl(lead.pdfUnificado);
			log.info(`PDF unificado com URL corrigida: ${correctedPdfUrl}`);
			pdfUrls = [correctedPdfUrl];
		}

		log.info(`Processando ${pdfUrls.length} URL(s) de PDF: ${JSON.stringify(pdfUrls)}`);

		const convertedUrls: string[] = [];
		const failedUrls: string[] = [];

		for (const pdfUrl of pdfUrls) {
			try {
				// Validar e sanitizar a URL
				log.info(`Processando URL: ${pdfUrl}`);
				const sanitizedPdfUrl = sanitizeUrl(pdfUrl);
				if (!sanitizedPdfUrl) {
					failedUrls.push(pdfUrl);
					log.error(`URL inválida: ${pdfUrl}`);
					continue;
				}
				log.info(`URL sanitizada: ${sanitizedPdfUrl}`);

				// Verificar se a URL termina com .pdf
				if (!sanitizedPdfUrl.toLowerCase().endsWith(".pdf")) {
					log.warn(`URL não parece ser um PDF: ${sanitizedPdfUrl}`);
				}

				// Configurações para a conversão (ajuste conforme necessário)
				const options = {
					density: 300,
					savename: `pdf-lead${leadId.substring(0, 8)}-${randomUUID().substring(0, 8)}`,
					savedir: "/tmp",
					format: "png",
					size: "1024x768",
				};
				log.info(`Opções de conversão: ${JSON.stringify(options)}`);

				// Baixar o PDF como buffer
				log.info(`Baixando PDF: ${sanitizedPdfUrl}`);
				try {
					const pdfResponse = await axios.get(sanitizedPdfUrl, {
						responseType: "arraybuffer",
						headers: {
							Accept: "application/pdf",
						},
						maxContentLength: 50 * 1024 * 1024, // 50MB max
						timeout: 30000, // 30 segundos timeout
					});

					log.info(
						`PDF baixado: ${pdfResponse.status} ${pdfResponse.statusText}, tamanho: ${pdfResponse.data.byteLength} bytes, tipo: ${pdfResponse.headers["content-type"]}`,
					);

					// Verificar tipo de conteúdo
					const contentType = pdfResponse.headers["content-type"];
					if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
						log.warn(`O arquivo baixado não parece ser um PDF (${contentType}), mas tentaremos converter mesmo assim`);
					}

					const pdfBuffer = Buffer.from(pdfResponse.data);

					// Usar a implementação para converter
					log.info(`Iniciando conversão do PDF com ${pdfBuffer.length} bytes`);
					const imagesUrls = await convertPdfToImages(pdfBuffer, options);
					log.info(`Conversão concluída com sucesso: ${imagesUrls.length} imagens geradas`);

					// Adicionar URLs convertidas
					convertedUrls.push(...imagesUrls);
					log.info(`URLs das imagens convertidas: ${JSON.stringify(imagesUrls)}`);
				} catch (downloadError) {
					log.error(
						`Erro ao baixar PDF: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`,
					);
					if (downloadError instanceof Error && downloadError.stack) {
						log.error(`Stack trace: ${downloadError.stack}`);
					}
					failedUrls.push(pdfUrl);
					continue;
				}
			} catch (error) {
				failedUrls.push(pdfUrl);
				log.error(`Erro ao processar URL ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`);
				if (error instanceof Error && error.stack) {
					log.error(`Stack trace: ${error.stack}`);
				}
			}
		}

		// Atualizar status dos arquivos e armazenar URLs das imagens no lead
		if (convertedUrls.length > 0) {
			log.info(`Atualizando status dos arquivos para ${leadId}`);

			try {
				// Atualizar o status dos arquivos
				await atualizarStatusArquivos(leadId, true);

				// Armazenar URLs das imagens no campo imagensConvertidas
				const updateResult = await prisma.leadOabData.update({
					where: { id: leadId },
					data: {
						imagensConvertidas: JSON.stringify(convertedUrls),
					},
				});

				log.info(`Lead atualizado com URLs das imagens convertidas: ${JSON.stringify(convertedUrls)}`);
			} catch (updateError) {
				log.error(`Erro ao atualizar lead: ${updateError}`);
			}
		} else {
			log.warn(`Nenhum arquivo convertido com sucesso para o lead ${leadId}`);
		}

		const response = {
			success: convertedUrls.length > 0,
			imageUrls: convertedUrls, // Garantir compatibilidade
			convertedUrls, // Manter compatibilidade
			failedUrls,
			message: `${convertedUrls.length} PDFs convertidos com sucesso. ${failedUrls.length} falhas.`,
		};
		log.info(`Resposta: ${JSON.stringify(response)}`);

		return NextResponse.json(response);
	} catch (error) {
		log.error(`Erro geral na conversão: ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error && error.stack) {
			log.error(`Stack trace: ${error.stack}`);
		}
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
			where: {
				leadOabDataId: leadId,
			},
			select: {
				id: true,
				dataUrl: true,
				fileType: true,
				pdfConvertido: true,
			},
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
