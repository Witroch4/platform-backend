// app/api/admin/leads-chatwit/upload-files/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { uploadToMinIO } from '@/lib/minio';

const prisma = getPrismaInstance();

/**
 * POST - Faz upload de arquivos para MinIO e adiciona no banco de dados associado ao lead
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const leadId = formData.get('leadId') as string;
    const files = formData.getAll('files') as File[];

    if (!leadId) {
      return NextResponse.json(
        { error: 'ID do lead é obrigatório' },
        { status: 400 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum arquivo fornecido' },
        { status: 400 }
      );
    }

    // Verificar se o lead existe
    const lead = await prisma.leadOabData.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead não encontrado' },
        { status: 404 }
      );
    }

    // Upload de cada arquivo para o MinIO e salvamento no banco
    const uploadedFiles = [];

    for (const file of files) {
      try {
        // Converter File para Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Fazer upload para MinIO usando a função existente
        const uploadResult = await uploadToMinIO(
          buffer,
          file.name,
          file.type || 'application/octet-stream',
          true // Gerar thumbnail se for imagem
        );

        console.log(`[Upload Files] Arquivo ${file.name} enviado para: ${uploadResult.url}`);

        // Salvar no banco de dados
        const arquivo = await prisma.arquivoLeadOab.create({
          data: {
            leadOabDataId: leadId,
            fileType: file.type || 'application/octet-stream',
            dataUrl: uploadResult.url,
          },
        });

        uploadedFiles.push({
          id: arquivo.id,
          fileType: arquivo.fileType,
          dataUrl: arquivo.dataUrl,
          originalName: file.name,
          thumbnailUrl: uploadResult.thumbnail_url,
        });

        console.log(`[Upload Files] Registro criado no banco para ${file.name}`);
      } catch (uploadError) {
        console.error(`[Upload Files] Erro ao fazer upload de ${file.name}:`, uploadError);
        // Continua com os próximos arquivos mesmo se um falhar
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'Falha ao fazer upload de todos os arquivos' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `${uploadedFiles.length} arquivo(s) enviado(s) com sucesso`,
        files: uploadedFiles,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Upload Files] Erro ao processar upload:', error);
    return NextResponse.json(
      { error: 'Erro interno ao fazer upload de arquivos' },
      { status: 500 }
    );
  }
}
