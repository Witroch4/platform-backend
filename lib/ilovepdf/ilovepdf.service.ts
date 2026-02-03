import ILovePDF from '@ilovepdf/ilovepdf-nodejs';
import ILovePDFFile from '@ilovepdf/ilovepdf-nodejs/ILovePDFFile';
import { uploadToMinIO } from '../minio';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Carrega variáveis de ambiente do Next
const publicKey: string = process.env.ILOVEPDF_PUBLIC_KEY || '';
const secretKey: string = process.env.ILOVEPDF_SECRET_KEY || '';

/**
 * Instância global do iLovePDF
 */
export const ilovePDFInstance = new ILovePDF(publicKey, secretKey);

/**
 * Salva um buffer em um arquivo temporário e retorna o caminho.
 * Usa exclusivamente a pasta "temp" na raiz do projeto.
 */
export async function saveTempFile(buffer: Buffer, extension: string): Promise<string> {
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
        } catch (permError) {
          console.warn('[iLovePDF] Aviso: Não foi possível definir permissões para o diretório temp:', permError);
        }
      } catch (error: unknown) {
        console.error('[iLovePDF] Erro ao criar diretório temporário:', error);
        throw new Error(`Não foi possível criar o diretório temporário na raiz do projeto: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fileName = `${uuidv4()}.${extension}`;
    const filePath = path.join(tempDir, fileName);
    console.log(`[iLovePDF] Salvando arquivo temporário: ${filePath} (${buffer.length} bytes)`);
    await fs.promises.writeFile(filePath, buffer);
    console.log(`[iLovePDF] Arquivo temporário salvo com sucesso: ${filePath}`);
    return filePath;
  } catch (error: unknown) {
    console.error('[iLovePDF] Erro ao salvar arquivo temporário:', error);
    throw new Error(`Falha ao salvar arquivo temporário: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Unifica múltiplos arquivos em um único PDF.
 */
export async function unifyFilesToPdf(fileUrls: string[]): Promise<Buffer> {
  try {
    console.log(`[iLovePDF] Iniciando unificação de ${fileUrls.length} arquivos em PDF`);
    if (fileUrls.length === 1) {
      const fileUrl = fileUrls[0];
      console.log(`[iLovePDF] Apenas um arquivo para processar: ${fileUrl}`);
      if (isPdf(fileUrl)) {
        console.log(`[iLovePDF] Arquivo único já é PDF, retornando diretamente`);
        return await downloadUrlAsBuffer(fileUrl);
      } else if (isImage(fileUrl)) {
        console.log(`[iLovePDF] Arquivo único é uma imagem, convertendo para PDF`);
        return await convertImageToPdf(fileUrl);
      } else if (isOfficeFile(fileUrl)) {
        console.log(`[iLovePDF] Arquivo único é um documento Office, convertendo para PDF`);
        return await convertOfficeToPdf(fileUrl);
      }
    }
    const mergeTask = ilovePDFInstance.newTask('merge');
    await mergeTask.start();
    console.log(`[iLovePDF] Tarefa de mesclagem iniciada`);

    const processedFiles: string[] = [];
    const failedFiles: { url: string; error: string }[] = [];

    for (let i = 0; i < fileUrls.length; i++) {
      const fileUrl = fileUrls[i];
      try {
        console.log(`[iLovePDF] Processando arquivo ${i + 1}/${fileUrls.length}: ${fileUrl}`);
        let fileBuffer: Buffer;
        if (isPdf(fileUrl)) {
          console.log(`[iLovePDF] Arquivo ${i + 1} é um PDF, baixando diretamente`);
          fileBuffer = await downloadUrlAsBuffer(fileUrl);
        } else if (isImage(fileUrl)) {
          console.log(`[iLovePDF] Arquivo ${i + 1} é uma imagem, convertendo para PDF`);
          fileBuffer = await convertImageToPdf(fileUrl);
        } else if (isOfficeFile(fileUrl)) {
          console.log(`[iLovePDF] Arquivo ${i + 1} é um documento Office, convertendo para PDF`);
          fileBuffer = await convertOfficeToPdf(fileUrl);
        } else {
          console.log(`[iLovePDF] Arquivo ${i + 1} não é PDF, imagem ou Office conhecido. Tentando baixar e processar como PDF`);
          fileBuffer = await downloadUrlAsBuffer(fileUrl);
        }
        console.log(`[iLovePDF] Arquivo ${i + 1} baixado/convertido com sucesso: ${fileBuffer.length} bytes`);
        const tempFilePath = await saveTempFile(fileBuffer, 'pdf');
        console.log(`[iLovePDF] Arquivo ${i + 1} salvo em arquivo temporário: ${tempFilePath}`);
        const pdfFile = new ILovePDFFile(tempFilePath);
        await mergeTask.addFile(pdfFile);
        console.log(`[iLovePDF] Arquivo ${i + 1} adicionado à tarefa de mesclagem`);
        processedFiles.push(fileUrl);
      } catch (error: unknown) {
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
  } catch (error: any) {
    console.error('[iLovePDF] Erro ao unificar arquivos em PDF:', error);
    throw new Error(`Falha ao unificar arquivos em PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Converte uma imagem em PDF usando a tool "imagepdf".
 */
export async function convertImageToPdf(imageUrl: string): Promise<Buffer> {
  try {
    console.log(`[iLovePDF] Iniciando conversão de imagem para PDF: ${imageUrl}`);
    const imagePdfTask = ilovePDFInstance.newTask('imagepdf');
    await imagePdfTask.start();
    console.log(`[iLovePDF] Tarefa de conversão de imagem iniciada`);
    console.log(`[iLovePDF] Baixando imagem: ${imageUrl}`);
    const imageBuffer = await downloadUrlAsBuffer(imageUrl);
    console.log(`[iLovePDF] Imagem baixada com sucesso: ${imageBuffer.length} bytes`);
    const tempFilePath = await saveTempFile(imageBuffer, 'jpg');
    console.log(`[iLovePDF] Imagem salva em arquivo temporário: ${tempFilePath}`);
    const imageFile = new ILovePDFFile(tempFilePath);
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
    } catch (error: unknown) {
      console.error(`[iLovePDF] Erro ao excluir arquivo temporário ${tempFilePath}:`, error);
    }
    return Buffer.from(pdfBuf);
  } catch (error: any) {
    console.error('[iLovePDF] Erro ao converter imagem em PDF:', error);
    throw new Error(`Falha ao converter imagem em PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verifica se a URL é de uma imagem com base na extensão.
 */
export function isImage(url: string): boolean {
  try {
    if (!url) return false;
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase() || '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif'];
    return imageExtensions.includes(extension);
  } catch (error: unknown) {
    console.error(`[iLovePDF] Erro ao verificar se URL é imagem: ${url}`, error);
    const ext = url.toLowerCase();
    return ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png');
  }
}

/**
 * Baixa arquivo remoto como Buffer (usando fetch).
 */
export async function downloadUrlAsBuffer(url: string): Promise<Buffer> {
  try {
    console.log(`[iLovePDF] Tentando baixar arquivo: ${url}`);
    if (!url || !url.startsWith('http')) {
      throw new Error(`URL inválida: ${url}`);
    }
    if (url.includes('objstore.witdev.com.br')) {
      console.warn(`[iLovePDF] URL com endpoint incorreto detectada: ${url}`);
      url = url.replace('objstore.witdev.com.br', process.env.S3_ENDPOINT || 'objstoreapi.witdev.com.br');
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
      const isOfficeContentType =
        contentType.includes('application/vnd.openxmlformats-officedocument') ||
        contentType.includes('application/vnd.ms-') ||
        contentType.includes('application/msword') ||
        contentType.includes('application/vnd.oasis.opendocument');
      if (isOfficeContentType) {
        console.log(`[iLovePDF] Detectado arquivo Office pelo tipo de conteúdo: ${contentType}`);
      }
    }
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (error: any) {
    console.error('[iLovePDF] Erro ao baixar arquivo:', error);
    throw new Error(`Falha ao baixar arquivo: ${url}. Erro: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Salva o PDF unificado no MinIO e retorna a URL.
 */
export async function savePdfToMinIO(pdfBuffer: Buffer, fileName: string): Promise<string> {
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
    const response = await uploadToMinIO(pdfBuffer, fileName, 'application/pdf');
    console.log(`[iLovePDF] PDF enviado com sucesso para o MinIO: ${response.url}`);
    return response.url;
  } catch (error: any) {
    console.error('[iLovePDF] Erro ao salvar PDF no MinIO:', error);
    throw new Error(`Falha ao salvar PDF no MinIO: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Função completa para unificar arquivos e salvar no MinIO.
 * Recebe URLs de arquivos, unifica em PDF e salva no MinIO.
 * Retorna a URL do PDF unificado.
 */
export async function unifyAndSavePdf(fileUrls: string[], fileName: string): Promise<string> {
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
  } catch (error: any) {
    console.error('[iLovePDF] Erro ao unificar e salvar PDF:', error);
    throw new Error(`Falha ao unificar e salvar PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Converte um arquivo Office (DOC, DOCX, PPT, PPTX, XLS, XLSX, etc.) em PDF.
 */
export async function convertOfficeToPdf(officeUrl: string): Promise<Buffer> {
  try {
    console.log(`[iLovePDF] Iniciando conversão de arquivo Office para PDF: ${officeUrl}`);
    const officePdfTask = ilovePDFInstance.newTask('officepdf');
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
    } catch (error: unknown) {
      console.warn(`[iLovePDF] Não foi possível determinar a extensão do arquivo, usando .docx como padrão`);
    }
    const tempFilePath = await saveTempFile(officeBuffer, extension);
    console.log(`[iLovePDF] Arquivo Office salvo em arquivo temporário: ${tempFilePath}`);
    const officeFile = new ILovePDFFile(tempFilePath);
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
    } catch (error: any) {
      console.error(`[iLovePDF] Erro ao excluir arquivo temporário ${tempFilePath}:`, error);
    }
    return Buffer.from(pdfBuf);
  } catch (error: unknown) {
    console.error('[iLovePDF] Erro ao converter arquivo Office em PDF:', error);
    throw new Error(`Falha ao converter arquivo Office em PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verifica se a URL é de um arquivo Office com base na extensão.
 */
export function isOfficeFile(url: string): boolean {
  try {
    if (!url) return false;
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase() || '';
    const officeExtensions = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods'];
    return officeExtensions.includes(extension);
  } catch (error: unknown) {
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
export function isPdf(url: string): boolean {
  try {
    if (!url) return false;
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase() || '';
    return extension === 'pdf';
  } catch (error: unknown) {
    console.error(`[iLovePDF] Erro ao verificar se URL é PDF: ${url}`, error);
    return url.toLowerCase().endsWith('.pdf');
  }
}
