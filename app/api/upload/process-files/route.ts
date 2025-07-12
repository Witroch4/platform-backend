import { NextResponse } from 'next/server';
import { uploadToMinIO } from '@/lib/minio';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import type { UploadPurpose } from '@/app/components/ChatInputForm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fromBuffer } from 'pdf2pic';

const execPromise = promisify(exec);

// Logger simples
const log = {
  info: (message: string) => console.log(`[PROCESS-FILES] INFO: ${message}`),
  error: (message: string) => console.error(`[PROCESS-FILES] ERROR: ${message}`),
  warn: (message: string) => console.warn(`[PROCESS-FILES] WARN: ${message}`)
};

interface PDF2PicOptions {
  density: number;
  savename: string;
  savedir: string;
  format: string;
  size: string | number;
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
      log.info(`Diretório temporário ${tmpDir} não existe, criando...`);
      await fs.promises.mkdir(tmpDir, { recursive: true });
    }
    
    // Salvar o PDF em um arquivo temporário
    const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
    await fs.promises.writeFile(pdfPath, pdfBuffer);
    log.info(`PDF temporário salvo em: ${pdfPath} (${pdfBuffer.length} bytes)`);
    
    // Criar o diretório de saída
    const outputDir = path.join(tmpDir, baseName);
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
      log.info(`Diretório de saída criado: ${outputDir}`);
    } catch (err) {
      log.warn(`Erro ao criar diretório: ${err}`);
    }
    
    // Nome base para os arquivos de saída (sem extensão)
    const outputBaseName = path.join(outputDir, `page`);
    
    // Comando para converter PDF em imagens usando ImageMagick
    // Tentativa 1: Abordagem com ghostscript diretamente
    const gsCommand = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r${density} -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -sOutputFile=${outputBaseName}-%d.${format} ${pdfPath}`;
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
    log.info(`Arquivos gerados: ${files.join(', ')}`);
    
    if (files.length === 0) {
      throw new Error("Nenhum arquivo foi gerado durante a conversão do PDF para imagem");
    }
    
    // Salvar arquivos no MinIO
    const convertedImagesUrls: string[] = [];
    
    for (const file of files) {
      if (file.endsWith(`.${format}`)) {
        const filePath = path.join(outputDir, file);
        const fileBuffer = await fs.promises.readFile(filePath);
        
        // Upload para MinIO
        const fileName = `${baseName}_${file}`;
        log.info(`Fazendo upload da imagem para MinIO: ${fileName} (${fileBuffer.length} bytes)`);
        
        const uploadResult = await uploadToMinIO(
          fileBuffer,
          fileName,
          `image/${format}`,
          true // Gerar thumbnail
        );
        
        log.info(`Imagem carregada no MinIO: ${uploadResult.url}`);
        convertedImagesUrls.push(uploadResult.url);
        
        // Remover arquivo temporário
        try {
          await fs.promises.unlink(filePath);
          log.info(`Arquivo temporário removido: ${filePath}`);
        } catch (unlinkError) {
          log.warn(`Não foi possível excluir arquivo temporário ${filePath}: ${unlinkError}`);
        }
      }
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
      throw new Error('Nenhuma imagem foi convertida com sucesso');
    }
    
    log.info(`Conversão concluída: ${convertedImagesUrls.length} imagens geradas`);
    return convertedImagesUrls;
  } catch (error) {
    log.error(`Erro ao converter PDF para imagens: ${error}`);
    throw error;
  }
}

// Função de conversão com fallback
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
        width: typeof options.size === 'number' ? options.size : 1024
      };
      
      // Criando conversor a partir do buffer
      const converter = fromBuffer(pdfBuffer, pdf2picOptions);
      
      // Converter a primeira página
      const result = await converter(1, { responseType: "buffer" });
      
      if (!result || !result.buffer) {
        throw new Error("Falha ao converter a primeira página do PDF");
      }
      
      // Upload para MinIO
      const fileName = `${options.savename}_page1_${Date.now()}.${pdf2picOptions.format}`;
      const uploadResult = await uploadToMinIO(
        result.buffer,
        fileName,
        `image/${pdf2picOptions.format}`,
        true
      );
      
      return [uploadResult.url];
    } catch (pdf2picError) {
      log.error(`Ambos os métodos de conversão falharam: ${pdf2picError}`);
      throw pdf2picError;
    }
  }
}

export async function POST(request: Request) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    // Extrair o FormData da request
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const purpose = (formData.get('purpose') as UploadPurpose) || 'vision';
    const sessionId = formData.get('sessionId') as string || null;
    
    // 🔧 NOVO: Controle inteligente de conversão baseado no tipo de sessão
    let convertToImages: boolean;
    const explicitConvertToImages = formData.get('convertToImages');
    
    if (explicitConvertToImages !== null) {
      // Se foi explicitamente definido, usar o valor
      convertToImages = explicitConvertToImages === 'true';
    } else {
      // 🔧 NOVO: Padrão específico apenas para espelhos padrão
      const isEspelhoPadraoSession = sessionId?.startsWith('espelho-padrao-');
      // Para espelhos padrão: false (PDF bruto), outros casos: true (imagens)
      convertToImages = !isEspelhoPadraoSession; 
    }
    
    log.info(`Processando arquivo para purpose: ${purpose}, sessionId: ${sessionId}, convertToImages: ${convertToImages} (padrão automático: ${explicitConvertToImages === null})`);

    if (!file) {
      log.error('Nenhum arquivo enviado');
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    // Converter o arquivo para um buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const mimeType = file.type;
    
    // Verificar se é PDF ou imagem
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isImage = mimeType.startsWith('image/');
    
    log.info(`Arquivo: ${fileName}, tipo: ${mimeType}, é PDF: ${isPdf}, é imagem: ${isImage}`);

    const imageUrls: string[] = [];
    const savedImages: any[] = [];
    let pdfUrl: string | null = null;

    if (isPdf) {
      if (convertToImages) {
      // Converter PDF em imagens
      log.info('Iniciando conversão de PDF para imagens...');
      
      const options = {
        density: 300,
        savename: `pdf-upload-${randomUUID().substring(0, 8)}`,
        savedir: "/tmp",
        format: "png",
        size: "1024x768"
      };
      
      try {
        const convertedUrls = await convertPdfToImages(buffer, options);
        imageUrls.push(...convertedUrls);
        log.info(`PDF convertido em ${convertedUrls.length} imagens`);
        
        // Salvar cada imagem convertida no banco
        if (sessionId) {
          for (let i = 0; i < convertedUrls.length; i++) {
            const imageUrl = convertedUrls[i];
            
            // Não salvar na tabela GeneratedImage se for um upload de espelho
            if (!sessionId.startsWith('espelho-')) {
            const savedImage = await db.generatedImage.create({
              data: {
                userId: session.user.id!,
                sessionId: sessionId,
                prompt: `PDF convertido: ${fileName} - Página ${i + 1}`,
                model: 'pdf-conversion',
                imageUrl: imageUrl,
                thumbnailUrl: imageUrl.replace('.png', '_thumb.png'),
                mimeType: 'image/png',
                size: `page-${i + 1}`,
                quality: 'converted',
              }
            });
            
            savedImages.push(savedImage);
            log.info(`Imagem da página ${i + 1} salva no banco: ${savedImage.id}`);
            } else {
              log.info(`Imagem da página ${i + 1} não salva no banco (upload de espelho)`);
            }
          }
        }
        
      } catch (conversionError) {
        log.error(`Erro na conversão do PDF: ${conversionError}`);
        throw new Error(`Falha ao converter PDF: ${conversionError}`);
        }
      } else {
        // Enviar PDF bruto para MinIO
        log.info('Fazendo upload do PDF bruto para MinIO...');
        
        try {
          const uploadResult = await uploadToMinIO(buffer, fileName, mimeType, true);
          pdfUrl = uploadResult.url;
          log.info(`PDF bruto enviado para MinIO: ${pdfUrl}`);
          
          // Salvar PDF no banco se necessário
          if (sessionId && !sessionId.startsWith('espelho-')) {
            const savedFile = await db.generatedImage.create({
              data: {
                userId: session.user.id!,
                sessionId: sessionId,
                prompt: `PDF carregado: ${fileName}`,
                model: 'pdf-upload',
                imageUrl: pdfUrl,
                thumbnailUrl: uploadResult.thumbnail_url,
                mimeType: mimeType,
                size: `${buffer.length}`,
                quality: 'original',
              }
            });
            
            savedImages.push(savedFile);
            log.info(`PDF salvo no banco: ${savedFile.id}`);
          } else {
            log.info(`PDF não salvo no banco (upload de espelho)`);
          }
          
        } catch (uploadError) {
          log.error(`Erro no upload do PDF: ${uploadError}`);
          throw new Error(`Falha ao fazer upload do PDF: ${uploadError}`);
        }
      }
      
    } else if (isImage) {
      // Para imagens, fazer upload direto
      log.info('Fazendo upload direto da imagem...');
      
      const uploadResult = await uploadToMinIO(buffer, fileName, mimeType, true);
      imageUrls.push(uploadResult.url);
      
      // Salvar imagem no banco
      if (sessionId) {
        // Não salvar na tabela GeneratedImage se for um upload de espelho
        if (!sessionId.startsWith('espelho-')) {
        const savedImage = await db.generatedImage.create({
          data: {
            userId: session.user.id!,
            sessionId: sessionId,
            prompt: `Imagem carregada: ${fileName}`,
            model: 'image-upload',
            imageUrl: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnail_url,
            mimeType: mimeType,
            size: `${buffer.length}`,
            quality: 'original',
          }
        });
        
        savedImages.push(savedImage);
        log.info(`Imagem salva no banco: ${savedImage.id}`);
        } else {
          log.info(`Imagem não salva no banco (upload de espelho)`);
        }
      }
      
    } else {
      throw new Error('Tipo de arquivo não suportado. Apenas PDFs e imagens são aceitos para conversão.');
    }

    // Resposta adaptada para suportar PDF bruto
    const response = {
      success: true,
      file_type: isPdf ? 'pdf' : 'image',
      convert_to_images: convertToImages,
      purpose: purpose,
      saved_images: savedImages,
    };

    if (isPdf && convertToImages) {
      // PDF convertido em imagens
      return NextResponse.json({
        ...response,
        images_count: imageUrls.length,
        image_urls: imageUrls,
        message: `PDF convertido em ${imageUrls.length} imagem(ns) com sucesso`
      });
    } else if (isPdf && !convertToImages) {
      // PDF bruto
      return NextResponse.json({
        ...response,
        pdf_url: pdfUrl,
        file_url: pdfUrl,
        message: 'PDF processado com sucesso (sem conversão)'
      });
    } else {
      // Imagem
      return NextResponse.json({
        ...response,
        images_count: imageUrls.length,
        image_urls: imageUrls,
        message: 'Imagem processada com sucesso'
    });
    }

  } catch (error: any) {
    log.error(`Erro ao processar arquivo: ${error.message}`);
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao processar arquivo',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Método não permitido' },
    { status: 405 }
  );
} 