// chatwit-atual/app/api/admin/leads-chatwit/unify/utils.ts
import { PDFDocument } from 'pdf-lib';
import { uploadToMinIO } from '../../../../../lib/minio';

// --- Type Definitions ---
export type Environment = "development" | "production" | "test";

// --- Helper Functions ---

/**
 * Extrai a extensão real da URL ignorando parâmetros HTTP (filename*, filename__, etc)
 */
function extractFileExtension(url: string): string {
    if (!url) return '';
    try {
        // Remover parâmetros da URL (filename*=, filename__, etc)
        let cleanUrl = url.split('?')[0].split('#')[0];

        // Remover sufixos como -filename__, -filename_*, etc
        cleanUrl = cleanUrl.replace(/-filename[_*]+.*$/, '');

        const pathname = new URL(cleanUrl).pathname;
        const extension = pathname.split('.').pop()?.toLowerCase() || '';
        return extension;
    } catch {
        // Fallback: buscar diretamente na string
        let cleanUrl = url.split('?')[0].split('#')[0];
        cleanUrl = cleanUrl.replace(/-filename[_*]+.*$/, '');

        const parts = cleanUrl.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
}

// --- Core Unification Logic ---

/**
 * Interface para resultado de processamento paralelo de arquivo
 */
interface ProcessedFile {
    name: string;
    type: 'pdf' | 'image';
    buffer: Buffer;
    contentType: string;
    success: boolean;
    error?: string;
}

/**
 * Processa um arquivo individual (download + tipo)
 * Otimizado para paralelismo em turbo mode
 */
async function processFileParallel(file: { url: string; name: string }): Promise<ProcessedFile | null> {
    try {
        const extension = extractFileExtension(file.url);
        const imageExtensions = ['jpg', 'jpeg', 'png'];
        const isImageFile = imageExtensions.includes(extension);
        const isPdfFile = extension === 'pdf';

        if (!isImageFile && !isPdfFile && !file.url.includes('fbsbx.com')) {
            console.log(`[PDF-Lib] Tipo de arquivo não suportado: ${file.url}`);
            return null;
        }

        let fileUrl = file.url;
        if (fileUrl.includes('fbsbx.com')) {
            console.log(`[PDF-Lib] Processando URL do Facebook: ${fileUrl}`);
            const assetIdMatch = fileUrl.match(/asset_id=(\d+)/);
            if (assetIdMatch) {
                const assetId = assetIdMatch[1];
                fileUrl = `https://www.facebook.com/messenger_media/?thread_id=${assetId}`;
                console.log(`[PDF-Lib] URL convertida: ${fileUrl}`);
            }
        }

        console.log(`[PDF-Lib] Buscando arquivo em: ${fileUrl}`);
        const response = await fetch(fileUrl);
        if (!response.ok) {
            console.error(`[PDF-Lib] Falha ao buscar arquivo: ${response.statusText}`);
            return null;
        }

        const fileBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || '';
        console.log(`[PDF-Lib] Content-Type do arquivo: ${contentType}`);

        // Determinar tipo baseado em extension + content-type
        let fileType: 'pdf' | 'image' = 'image';
        if (isPdfFile || contentType.includes('pdf')) {
            fileType = 'pdf';
        } else if (!isImageFile && contentType.includes('image/')) {
            fileType = 'image';
        }

        return {
            name: file.name,
            type: fileType,
            buffer: Buffer.from(fileBuffer),
            contentType,
            success: true
        };
    } catch (error) {
        console.error(`[PDF-Lib] Erro ao processar arquivo ${file.name}:`, error);
        return null;
    }
}

/**
 * Processa imagem (JPEG ou PNG) e adiciona à página
 * Detecta tipo pela extensão, não pelo Content-Type (que é frequentemente octet-stream)
 */
async function embedImageToPdf(
    mergedPdf: typeof PDFDocument.prototype,
    buffer: Buffer,
    contentType: string,
    fileName: string
): Promise<void> {
    const extension = extractFileExtension(fileName);

    // Priorizar extensão sobre Content-Type (Content-Type costuma ser octet-stream)
    const isJpeg = extension === 'jpg' || extension === 'jpeg' || contentType.includes('jpeg');
    const isPng = extension === 'png' || contentType.includes('png');

    try {
        let embeddedImage;

        if (isJpeg) {
            embeddedImage = await mergedPdf.embedJpg(buffer);
        } else if (isPng) {
            embeddedImage = await mergedPdf.embedPng(buffer);
        } else {
            // Fallback: tentar JPEG primeiro, se falhar tentar PNG
            try {
                embeddedImage = await mergedPdf.embedJpg(buffer);
            } catch {
                embeddedImage = await mergedPdf.embedPng(buffer);
            }
        }

        const page = mergedPdf.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        const { width: imgWidth, height: imgHeight } = embeddedImage.scale(1);

        const widthRatio = width / imgWidth;
        const heightRatio = height / imgHeight;
        const ratio = Math.min(widthRatio, heightRatio);

        const scaledWidth = imgWidth * ratio;
        const scaledHeight = imgHeight * ratio;

        page.drawImage(embeddedImage, {
            x: (width - scaledWidth) / 2,
            y: (height - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight,
        });

        console.log(`[PDF-Lib] Imagem processada com sucesso: ${fileName}`);
    } catch (error) {
        console.error(`[PDF-Lib] Erro ao processar imagem: ${error}`);
        throw error;
    }
}

/**
 * Unifies multiple files (PDFs and images) into a single PDF using pdf-lib.
 * Otimizado para turbo mode com processamento paralelo de downloads.
 * @param files An array of objects containing the URL and name of the files to merge.
 * @returns A Promise that resolves to the merged PDF as a Buffer.
 */
export async function unifyFilesToPdf(files: { url: string; name: string }[]): Promise<Buffer> {
    try {
        console.log("[PDF-Lib] Starting unification for", files.length, "files (TURBO MODE - Parallel Downloads).");

        // TURBO MODE: Processar todos os downloads em paralelo (até 10x mais rápido)
        const processedFilesPromises = files.map(file => processFileParallel(file));
        const processedFilesResults = await Promise.all(processedFilesPromises);

        // Filtrar arquivos processados com sucesso
        const validFiles = processedFilesResults.filter((file): file is ProcessedFile => file !== null);

        if (validFiles.length === 0) {
            throw new Error("Nenhum arquivo válido encontrado para unificação.");
        }

        console.log(`[PDF-Lib] ${validFiles.length}/${files.length} arquivos processados com sucesso`);

        const mergedPdf = await PDFDocument.create();

        // Processar PDFs e imagens em 2 passagens otimizadas
        // Passagem 1: Adicionar todos os PDFs
        for (const file of validFiles.filter(f => f.type === 'pdf')) {
            try {
                console.log(`[PDF-Lib] Processando como PDF: ${file.name}`);
                const pdf = await PDFDocument.load(file.buffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
                console.log(`[PDF-Lib] Arquivo processado com sucesso: ${file.name}`);
            } catch (error) {
                console.error(`[PDF-Lib] Erro ao processar PDF: ${error}`);
                continue;
            }
        }

        // Passagem 2: Adicionar todas as imagens
        for (const file of validFiles.filter(f => f.type === 'image')) {
            try {
                console.log(`[PDF-Lib] Processando como imagem: ${file.name}`);
                await embedImageToPdf(mergedPdf, file.buffer, file.contentType, file.name);
            } catch (error) {
                console.error(`[PDF-Lib] Erro ao processar imagem: ${error}`);
                continue;
            }
        }

        if (mergedPdf.getPageCount() === 0) {
            throw new Error("Não foi possível processar nenhum dos arquivos fornecidos.");
        }

        console.log(`[PDF-Lib] PDF unificado com ${mergedPdf.getPageCount()} páginas`);
        return Buffer.from(await mergedPdf.save());
    } catch (error) {
        console.error("[PDF-Lib] Erro em unifyFilesToPdf:", error);
        throw error;
    }
}

/**
 * Saves the unified PDF buffer to MinIO storage.
 * @param pdfBuffer The buffer of the final PDF.
 * @param fileName The desired file name for the uploaded PDF.
 * @returns A Promise resolving to the public URL of the uploaded PDF.
 */
export async function savePdfToMinIO(
    pdfBuffer: Buffer,
    fileName: string
): Promise<string> {
    console.log(`[PDF-Lib] Uploading final PDF to MinIO as ${fileName}`);
    if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF buffer is empty and cannot be uploaded.');
    }

    const response = await uploadToMinIO(pdfBuffer, fileName, 'application/pdf');
    console.log(`[PDF-Lib] PDF successfully uploaded: ${response.url}`);
    return response.url;
}