"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ilovePDFInstance = void 0;
exports.saveTempFile = saveTempFile;
exports.unifyFilesToPdf = unifyFilesToPdf;
exports.convertImageToPdf = convertImageToPdf;
exports.isImage = isImage;
exports.downloadUrlAsBuffer = downloadUrlAsBuffer;
exports.savePdfToMinIO = savePdfToMinIO;
exports.unifyAndSavePdf = unifyAndSavePdf;
exports.convertOfficeToPdf = convertOfficeToPdf;
exports.isOfficeFile = isOfficeFile;
exports.isPdf = isPdf;
const ilovepdf_nodejs_1 = __importDefault(require("@ilovepdf/ilovepdf-nodejs"));
const ILovePDFFile_1 = __importDefault(require("@ilovepdf/ilovepdf-nodejs/ILovePDFFile"));
const minio_1 = require("../minio");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
// Carrega variáveis de ambiente do Next
const publicKey = process.env.ILOVEPDF_PUBLIC_KEY || '';
const secretKey = process.env.ILOVEPDF_SECRET_KEY || '';
/**
 * Instância global do iLovePDF
 */
exports.ilovePDFInstance = new ilovepdf_nodejs_1.default(publicKey, secretKey);
/**
 * Salva um buffer em um arquivo temporário e retorna o caminho.
 * Usa exclusivamente a pasta "temp" na raiz do projeto.
 */
async function saveTempFile(buffer, extension) {
    try {
        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer vazio ou inválido');
        }
        const tempDir = path.join(process.cwd(), 'temp');
        console.log(`[iLovePDF] Diretório temporário: ${tempDir}`);
        if (!fs.existsSync(tempDir)) {
            console.log(`[iLovePDF] Criando diretório temporário: ${tempDir}`);
            try {
                fs.mkdirSync(tempDir, { recursive: true });
                console.log(`[iLovePDF] Diretório temporário criado com sucesso`);
                try {
                    fs.chmodSync(tempDir, 0o777);
                    console.log(`[iLovePDF] Permissões do diretório temporário definidas com sucesso`);
                }
                catch (permError) {
                    console.warn('[iLovePDF] Aviso: Não foi possível definir permissões para o diretório temp:', permError);
                }
            }
            catch (error) {
                console.error('[iLovePDF] Erro ao criar diretório temporário:', error);
                throw new Error(`Não foi possível criar o diretório temporário na raiz do projeto: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const fileName = `${(0, uuid_1.v4)()}.${extension}`;
        const filePath = path.join(tempDir, fileName);
        console.log(`[iLovePDF] Salvando arquivo temporário: ${filePath} (${buffer.length} bytes)`);
        await fs.promises.writeFile(filePath, buffer);
        console.log(`[iLovePDF] Arquivo temporário salvo com sucesso: ${filePath}`);
        return filePath;
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao salvar arquivo temporário:', error);
        throw new Error(`Falha ao salvar arquivo temporário: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Unifica múltiplos arquivos em um único PDF.
 */
async function unifyFilesToPdf(fileUrls) {
    try {
        console.log(`[iLovePDF] Iniciando unificação de ${fileUrls.length} arquivos em PDF`);
        if (fileUrls.length === 1) {
            const fileUrl = fileUrls[0];
            console.log(`[iLovePDF] Apenas um arquivo para processar: ${fileUrl}`);
            if (isPdf(fileUrl)) {
                console.log(`[iLovePDF] Arquivo único já é PDF, retornando diretamente`);
                return await downloadUrlAsBuffer(fileUrl);
            }
            else if (isImage(fileUrl)) {
                console.log(`[iLovePDF] Arquivo único é uma imagem, convertendo para PDF`);
                return await convertImageToPdf(fileUrl);
            }
            else if (isOfficeFile(fileUrl)) {
                console.log(`[iLovePDF] Arquivo único é um documento Office, convertendo para PDF`);
                return await convertOfficeToPdf(fileUrl);
            }
        }
        const mergeTask = exports.ilovePDFInstance.newTask('merge');
        await mergeTask.start();
        console.log(`[iLovePDF] Tarefa de mesclagem iniciada`);
        const processedFiles = [];
        const failedFiles = [];
        for (let i = 0; i < fileUrls.length; i++) {
            const fileUrl = fileUrls[i];
            try {
                console.log(`[iLovePDF] Processando arquivo ${i + 1}/${fileUrls.length}: ${fileUrl}`);
                let fileBuffer;
                if (isPdf(fileUrl)) {
                    console.log(`[iLovePDF] Arquivo ${i + 1} é um PDF, baixando diretamente`);
                    fileBuffer = await downloadUrlAsBuffer(fileUrl);
                }
                else if (isImage(fileUrl)) {
                    console.log(`[iLovePDF] Arquivo ${i + 1} é uma imagem, convertendo para PDF`);
                    fileBuffer = await convertImageToPdf(fileUrl);
                }
                else if (isOfficeFile(fileUrl)) {
                    console.log(`[iLovePDF] Arquivo ${i + 1} é um documento Office, convertendo para PDF`);
                    fileBuffer = await convertOfficeToPdf(fileUrl);
                }
                else {
                    console.log(`[iLovePDF] Arquivo ${i + 1} não é PDF, imagem ou Office conhecido. Tentando baixar e processar como PDF`);
                    fileBuffer = await downloadUrlAsBuffer(fileUrl);
                }
                console.log(`[iLovePDF] Arquivo ${i + 1} baixado/convertido com sucesso: ${fileBuffer.length} bytes`);
                const tempFilePath = await saveTempFile(fileBuffer, 'pdf');
                console.log(`[iLovePDF] Arquivo ${i + 1} salvo em arquivo temporário: ${tempFilePath}`);
                const pdfFile = new ILovePDFFile_1.default(tempFilePath);
                await mergeTask.addFile(pdfFile);
                console.log(`[iLovePDF] Arquivo ${i + 1} adicionado à tarefa de mesclagem`);
                processedFiles.push(fileUrl);
            }
            catch (error) {
                console.error(`[iLovePDF] Erro ao processar arquivo ${i + 1}: ${fileUrl}`, error);
                failedFiles.push({ url: fileUrl, error: error instanceof Error ? error.message : String(error) });
            }
        }
        if (processedFiles.length === 0) {
            throw new Error(`Nenhum arquivo pôde ser processado. Falhas: ${JSON.stringify(failedFiles)}`);
        }
        console.log(`[iLovePDF] Processando mesclagem de ${processedFiles.length} arquivos...`);
        await mergeTask.process();
        console.log(`[iLovePDF] Mesclagem processada com sucesso`);
        console.log(`[iLovePDF] Baixando PDF resultante...`);
        const pdfBuf = await mergeTask.download();
        console.log(`[iLovePDF] PDF resultante baixado com sucesso: ${pdfBuf.length} bytes`);
        return Buffer.from(pdfBuf);
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao unificar arquivos em PDF:', error);
        throw new Error(`Falha ao unificar arquivos em PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Converte uma imagem em PDF usando a tool "imagepdf".
 */
async function convertImageToPdf(imageUrl) {
    try {
        console.log(`[iLovePDF] Iniciando conversão de imagem para PDF: ${imageUrl}`);
        const imagePdfTask = exports.ilovePDFInstance.newTask('imagepdf');
        await imagePdfTask.start();
        console.log(`[iLovePDF] Tarefa de conversão de imagem iniciada`);
        console.log(`[iLovePDF] Baixando imagem: ${imageUrl}`);
        const imageBuffer = await downloadUrlAsBuffer(imageUrl);
        console.log(`[iLovePDF] Imagem baixada com sucesso: ${imageBuffer.length} bytes`);
        const tempFilePath = await saveTempFile(imageBuffer, 'jpg');
        console.log(`[iLovePDF] Imagem salva em arquivo temporário: ${tempFilePath}`);
        const imageFile = new ILovePDFFile_1.default(tempFilePath);
        await imagePdfTask.addFile(imageFile);
        console.log(`[iLovePDF] Imagem adicionada à tarefa de conversão`);
        console.log(`[iLovePDF] Processando conversão de imagem para PDF...`);
        await imagePdfTask.process();
        console.log(`[iLovePDF] Conversão processada com sucesso`);
        console.log(`[iLovePDF] Baixando PDF resultante...`);
        const pdfBuf = await imagePdfTask.download();
        console.log(`[iLovePDF] PDF resultante baixado com sucesso: ${pdfBuf.length} bytes`);
        try {
            await fs.promises.unlink(tempFilePath);
            console.log(`[iLovePDF] Arquivo temporário excluído: ${tempFilePath}`);
        }
        catch (error) {
            console.error(`[iLovePDF] Erro ao excluir arquivo temporário ${tempFilePath}:`, error);
        }
        return Buffer.from(pdfBuf);
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao converter imagem em PDF:', error);
        throw new Error(`Falha ao converter imagem em PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Verifica se a URL é de uma imagem com base na extensão.
 */
function isImage(url) {
    try {
        if (!url)
            return false;
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = pathname.split('.').pop()?.toLowerCase() || '';
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif'];
        return imageExtensions.includes(extension);
    }
    catch (error) {
        console.error(`[iLovePDF] Erro ao verificar se URL é imagem: ${url}`, error);
        const ext = url.toLowerCase();
        return ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png');
    }
}
/**
 * Baixa arquivo remoto como Buffer (usando fetch).
 */
async function downloadUrlAsBuffer(url) {
    try {
        console.log(`[iLovePDF] Tentando baixar arquivo: ${url}`);
        if (!url || !url.startsWith('http')) {
            throw new Error(`URL inválida: ${url}`);
        }
        if (url.includes('objstore.witdev.com.br')) {
            console.warn(`[iLovePDF] URL com endpoint incorreto detectada: ${url}`);
            url = url.replace('objstore.witdev.com.br', process.env.S3Endpoint || 'objstoreapi.witdev.com.br');
            console.log(`[iLovePDF] URL corrigida: ${url}`);
        }
        const resp = await fetch(url, {
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Chatwit-Social/1.0'
            }
        });
        if (!resp.ok) {
            console.error(`[iLovePDF] Erro ao baixar arquivo. Status: ${resp.status}, URL: ${url}`);
            throw new Error(`Falha ao baixar arquivo (status ${resp.status}): ${url}`);
        }
        const contentType = resp.headers.get('content-type');
        console.log(`[iLovePDF] Arquivo baixado com sucesso. Tipo: ${contentType}, URL: ${url}`);
        if (contentType) {
            const isOfficeContentType = contentType.includes('application/vnd.openxmlformats-officedocument') ||
                contentType.includes('application/vnd.ms-') ||
                contentType.includes('application/msword') ||
                contentType.includes('application/vnd.oasis.opendocument');
            if (isOfficeContentType) {
                console.log(`[iLovePDF] Detectado arquivo Office pelo tipo de conteúdo: ${contentType}`);
            }
        }
        const arrayBuf = await resp.arrayBuffer();
        return Buffer.from(arrayBuf);
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao baixar arquivo:', error);
        throw new Error(`Falha ao baixar arquivo: ${url}. Erro: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Salva o PDF unificado no MinIO e retorna a URL.
 */
async function savePdfToMinIO(pdfBuffer, fileName) {
    try {
        console.log(`[iLovePDF] Iniciando upload de PDF para o MinIO: ${fileName} (${pdfBuffer.length} bytes)`);
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Buffer de PDF vazio ou inválido');
        }
        if (!fileName) {
            fileName = `pdf_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
            console.log(`[iLovePDF] Nome de arquivo não fornecido, usando nome padrão: ${fileName}`);
        }
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            fileName = `${fileName}.pdf`;
            console.log(`[iLovePDF] Adicionada extensão .pdf ao nome do arquivo: ${fileName}`);
        }
        const response = await (0, minio_1.uploadToMinIO)(pdfBuffer, fileName, 'application/pdf');
        console.log(`[iLovePDF] PDF enviado com sucesso para o MinIO: ${response.url}`);
        return response.url;
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao salvar PDF no MinIO:', error);
        throw new Error(`Falha ao salvar PDF no MinIO: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Função completa para unificar arquivos e salvar no MinIO.
 * Recebe URLs de arquivos, unifica em PDF e salva no MinIO.
 * Retorna a URL do PDF unificado.
 */
async function unifyAndSavePdf(fileUrls, fileName) {
    try {
        console.log(`[iLovePDF] Iniciando processo de unificação e salvamento de ${fileUrls.length} arquivos com nome "${fileName}"`);
        if (!fileUrls || fileUrls.length === 0) {
            throw new Error('Nenhum arquivo fornecido para unificação');
        }
        if (!fileName) {
            fileName = `unificado_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
            console.log(`[iLovePDF] Nome de arquivo não fornecido, usando nome padrão: ${fileName}`);
        }
        console.log(`[iLovePDF] Unificando ${fileUrls.length} arquivos em PDF...`);
        const pdfBuffer = await unifyFilesToPdf(fileUrls);
        console.log(`[iLovePDF] Arquivos unificados com sucesso: ${pdfBuffer.length} bytes`);
        console.log(`[iLovePDF] Salvando PDF unificado no MinIO: ${fileName}`);
        const pdfUrl = await savePdfToMinIO(pdfBuffer, fileName);
        console.log(`[iLovePDF] PDF salvo com sucesso no MinIO: ${pdfUrl}`);
        return pdfUrl;
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao unificar e salvar PDF:', error);
        throw new Error(`Falha ao unificar e salvar PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Converte um arquivo Office (DOC, DOCX, PPT, PPTX, XLS, XLSX, etc.) em PDF.
 */
async function convertOfficeToPdf(officeUrl) {
    try {
        console.log(`[iLovePDF] Iniciando conversão de arquivo Office para PDF: ${officeUrl}`);
        const officePdfTask = exports.ilovePDFInstance.newTask('officepdf');
        await officePdfTask.start();
        console.log(`[iLovePDF] Tarefa de conversão de Office iniciada`);
        console.log(`[iLovePDF] Baixando arquivo Office: ${officeUrl}`);
        const officeBuffer = await downloadUrlAsBuffer(officeUrl);
        console.log(`[iLovePDF] Arquivo Office baixado com sucesso: ${officeBuffer.length} bytes`);
        let extension = 'docx';
        try {
            const urlObj = new URL(officeUrl);
            const pathname = urlObj.pathname;
            const fileExtension = pathname.split('.').pop()?.toLowerCase();
            if (fileExtension && ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods'].includes(fileExtension)) {
                extension = fileExtension;
            }
        }
        catch (error) {
            console.warn(`[iLovePDF] Não foi possível determinar a extensão do arquivo, usando .docx como padrão`);
        }
        const tempFilePath = await saveTempFile(officeBuffer, extension);
        console.log(`[iLovePDF] Arquivo Office salvo em arquivo temporário: ${tempFilePath}`);
        const officeFile = new ILovePDFFile_1.default(tempFilePath);
        await officePdfTask.addFile(officeFile);
        console.log(`[iLovePDF] Arquivo Office adicionado à tarefa de conversão`);
        console.log(`[iLovePDF] Processando conversão de Office para PDF...`);
        await officePdfTask.process();
        console.log(`[iLovePDF] Conversão processada com sucesso`);
        console.log(`[iLovePDF] Baixando PDF resultante...`);
        const pdfBuf = await officePdfTask.download();
        console.log(`[iLovePDF] PDF resultante baixado com sucesso: ${pdfBuf.length} bytes`);
        try {
            await fs.promises.unlink(tempFilePath);
            console.log(`[iLovePDF] Arquivo temporário excluído: ${tempFilePath}`);
        }
        catch (error) {
            console.error(`[iLovePDF] Erro ao excluir arquivo temporário ${tempFilePath}:`, error);
        }
        return Buffer.from(pdfBuf);
    }
    catch (error) {
        console.error('[iLovePDF] Erro ao converter arquivo Office em PDF:', error);
        throw new Error(`Falha ao converter arquivo Office em PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Verifica se a URL é de um arquivo Office com base na extensão.
 */
function isOfficeFile(url) {
    try {
        if (!url)
            return false;
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = pathname.split('.').pop()?.toLowerCase() || '';
        const officeExtensions = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods'];
        return officeExtensions.includes(extension);
    }
    catch (error) {
        console.error(`[iLovePDF] Erro ao verificar se URL é arquivo Office: ${url}`, error);
        const ext = url.toLowerCase();
        return ext.endsWith('.doc') || ext.endsWith('.docx') ||
            ext.endsWith('.ppt') || ext.endsWith('.pptx') ||
            ext.endsWith('.xls') || ext.endsWith('.xlsx') ||
            ext.endsWith('.odt') || ext.endsWith('.odp') || ext.endsWith('.ods');
    }
}
/**
 * Verifica se a URL é de um arquivo PDF com base na extensão.
 */
function isPdf(url) {
    try {
        if (!url)
            return false;
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = pathname.split('.').pop()?.toLowerCase() || '';
        return extension === 'pdf';
    }
    catch (error) {
        console.error(`[iLovePDF] Erro ao verificar se URL é PDF: ${url}`, error);
        return url.toLowerCase().endsWith('.pdf');
    }
}
