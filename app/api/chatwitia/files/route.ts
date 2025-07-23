// app/api/chatwitia/files/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { openaiService } from '@/services/openai';
import { uploadFileWithAssistants } from '@/services/assistantsFileHandler';
import type { FilePurpose } from '@/services/openai';
import { db } from '@/lib/db';
import { uploadToMinIO } from '@/lib/minio';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/* =========================================================================
   POST /api/chatwitia/files
   =========================================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';

    // JSON → extração de PDF existente
    if (contentType.includes('application/json')) {
      const { fileId, prompt = 'Extract the content from the PDF.' } = await req.json();
      if (!fileId) {
        return NextResponse.json({ error: 'fileId missing' }, { status: 400 });
      }
      const text = await openaiService.extractPdfWithAssistant(fileId, prompt);
      return NextResponse.json({ text, fileId });
    }

    // multipart/form-data → upload
    const form = await req.formData();
    const file     = form.get('file') as File | null;
    let purpose    = (form.get('purpose') as FilePurpose) || 'vision';
    const extract  = form.get('extract') === 'true';
    const prompt   = (form.get('prompt') as string) || 'Extract the content from the PDF.';
    const sessionId = form.get('sessionId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Detectar se é PDF e garantir purpose correto conforme recomendações atuais da OpenAI
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      // PDFs devem sempre usar 'user_data' conforme recomendação atual da OpenAI
      purpose = 'user_data';
      console.log(`PDF detectado (${file.name}), definindo purpose: user_data`);
    } else if (purpose === 'vision' && isPdf) {
      purpose = 'user_data';
    }
    if (isPdf && purpose === 'user_data' && file.size > 32 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF too large (32 MB max).' }, { status: 413 });
    }

    // 🔧 REMOVIDO: Upload desnecessário para MinIO
    // O arquivo já deveria estar no MinIO vindo da rota /api/upload
    // Vamos buscar primeiro se já existe no banco
    
    // 1️⃣ Buscar arquivo existente no banco
    let dbFile = await db.chatFile.findFirst({
      where: { 
        sessionId: sessionId || undefined, 
        filename: file.name, 
        fileType: file.type 
      }
    });

    let storageUrl: string;
    let thumbnail_url: string | undefined;

    if (!dbFile) {
      // 🔧 NOVO: Só fazer upload para MinIO se realmente não existir
      console.log(`Arquivo ${file.name} não encontrado no banco, fazendo upload para MinIO`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadResult = await uploadToMinIO(buffer, file.name, file.type, true);
      storageUrl = uploadResult.url;
      thumbnail_url = uploadResult.thumbnail_url;

      // Criar registro no banco
      const fileData: any = {
        storageUrl,
        thumbnail_url,
        filename: file.name,
        fileType: file.type,
        purpose,
        status: 'stored',
      };
      
      if (sessionId) {
        fileData.sessionId = sessionId;
      }
      
      dbFile = await db.chatFile.create({
        data: fileData
      });
      console.log(`Novo arquivo criado no banco: ${dbFile.id}`);
    } else {
      // Arquivo já existe, usar URLs do banco
      storageUrl = dbFile.storageUrl;
      thumbnail_url = dbFile.thumbnail_url || undefined;
      console.log(`Arquivo ${file.name} já existe no banco: ${dbFile.id}`);
    }

    // 2️⃣ Sincronização com OpenAI
    let uploaded: any = null;

    // Sempre sincronizar arquivos (principalmente PDFs) com OpenAI 
    // Apenas imagens inline podem ficar sem sincronização
    if (purpose !== 'vision' || isPdf) {
      if (dbFile.openaiFileId) {
        uploaded = { id: dbFile.openaiFileId };
        console.log(`Arquivo já tem openaiFileId: ${uploaded.id}`);
      } else {
        try {
          console.log(`Sincronizando arquivo ${file.name} com OpenAI usando purpose: ${purpose}`);
          uploaded = purpose === 'assistants'
            ? await uploadFileWithAssistants(file, purpose)
            : await openaiService.uploadFile(file, { purpose });
    
          await db.chatFile.update({
            where: { id: dbFile.id },
            data: {
              openaiFileId: uploaded.id,
              status:       'synced',
              syncedAt:     new Date(),
            }
          });
          console.log(`Arquivo sincronizado, openaiFileId: ${uploaded.id}`);
        } catch (error) {
          console.error('Erro ao sincronizar com OpenAI:', error);
          return NextResponse.json({ 
            error: 'Falha ao sincronizar com OpenAI',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
          }, { status: 500 });
        }
      }
    }

    // 3️⃣ Extração opcional de PDF
    if (extract && isPdf && uploaded?.id) {
      const text = await openaiService.extractPdfWithAssistant(uploaded.id, prompt);
      return NextResponse.json({
        fileId:       uploaded.id,
        storageUrl,
        thumbnail_url,
        filename:     file.name,
        mime_type:    file.type,
        text,
      });
    }

    // 4️⃣ Resposta final
    return NextResponse.json({
      fileId:       uploaded?.id    ?? null,
      internalId:   dbFile.id,       // deixa explícito pro front
      openaiFileId: uploaded?.id    ?? null,  // explicitamente inclui o openaiFileId
      storageUrl,
      thumbnail_url,
      filename:     file.name,
      mime_type:    file.type,
      status:       dbFile.status,
    });

  } catch (err: any) {
    console.error('files POST error', err);
    return NextResponse.json({ error: err.message || 'Upload error' }, { status: 500 });
  }
}

/* =========================================================================
   GET /api/chatwitia/files
   =========================================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const url       = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const purpose   = url.searchParams.get('purpose') as FilePurpose | null;

    const files = await db.chatFile.findMany({
      where: {
        sessionId: sessionId ?? undefined,
        ...(purpose ? { purpose } : {}),
      }
    });

    return NextResponse.json({ data: files });

  } catch (err: any) {
    console.error('files GET error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
