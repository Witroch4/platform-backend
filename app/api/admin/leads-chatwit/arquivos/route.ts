import { NextResponse, type NextRequest } from 'next/server';
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from '@/lib/prisma';
import log from '@/lib/log';

const prismaClient = new PrismaClient();

// Constante para o nome do bucket do MinIO
const BUCKET_NAME = process.env.S3Bucket || 'chatwit-social';

// Interface para representar um arquivo
interface ArquivoDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  leadId: string;
  fileType: string;
  dataUrl: string;
  pdfConvertido: string | null;
  lead?: {
    name: string | null;
    id: string;
    nomeReal: string | null;
  };
}

/**
 * GET - Lista arquivos de um lead ou de todos os leads de um usuário
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const usuarioId = url.searchParams.get("usuarioId");
    
    if (!leadId && !usuarioId) {
      return NextResponse.json(
        { error: "ID do lead ou ID do usuário é obrigatório" },
        { status: 400 }
      );
    }
    
    let arquivos: ArquivoDTO[] = [];
    
    if (leadId) {
      // Buscar arquivos de um lead específico
      const results = await prismaClient.arquivoLeadOab.findMany({
        where: { leadOabDataId: leadId },
        orderBy: { createdAt: "desc" },
      });
      arquivos = results.map(({ leadOabDataId, ...arquivo }) => ({
        ...arquivo,
        leadId: leadOabDataId,
      }));
    } else if (usuarioId) {
      // Buscar leads do usuário
      const leads = await prismaClient.leadOabData.findMany({
        where: { usuarioChatwitId: usuarioId },
        select: { id: true },
      });

      const leadIds = leads.map(lead => lead.id);

      // Buscar arquivos de todos os leads do usuário
      const results = await prismaClient.arquivoLeadOab.findMany({
        where: { leadOabDataId: { in: leadIds } },
        orderBy: { createdAt: "desc" },
        include: {
          leadOabData: {
            select: {
              id: true,
              nomeReal: true,
            },
          },
        },
      });
      arquivos = results.map(({ leadOabDataId, leadOabData, ...arquivo }) => ({
        ...arquivo,
        leadId: leadOabDataId,
        lead: leadOabData
          ? { id: leadOabData.id, nomeReal: leadOabData.nomeReal, name: null }
          : undefined,
      }));
    }
    
    return NextResponse.json({ arquivos });
  } catch (error) {
    console.error("[API Arquivos] Erro ao listar arquivos:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar arquivos" },
      { status: 500 }
    );
  }
}

/**
 * POST - Adiciona um novo arquivo para um lead
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { leadId, fileType, dataUrl } = await request.json();
    
    // Valide os dados recebidos
    if (!leadId || !fileType || !dataUrl) {
      return NextResponse.json(
        { error: "ID do lead, tipo do arquivo e URL do arquivo são obrigatórios" },
        { status: 400 }
      );
    }
    
    // Verifique se o lead existe
    const lead = await prismaClient.leadOabData.findUnique({
      where: { id: leadId },
    });
    
    if (!lead) {
      return NextResponse.json(
        { error: "Lead não encontrado" },
        { status: 404 }
      );
    }
    
    // Adicione o arquivo
    const arquivo = await prismaClient.arquivoLeadOab.create({
      data: {
        leadOabDataId: leadId,
        fileType,
        dataUrl,
      },
    });
    
    return NextResponse.json({
      success: true,
      arquivo,
    });
  } catch (error) {
    console.error("[API Arquivos] Erro ao adicionar arquivo:", error);
    return NextResponse.json(
      { error: "Erro interno ao adicionar arquivo" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove um arquivo
 */
export async function DELETE(request: NextRequest) {
  try {
    // Usando a nova forma de autenticação do NextAuth v5
    const session = await auth();
    if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const arquivoId = searchParams.get('id');
    const type = searchParams.get('type'); // 'arquivo', 'pdf', 'imagem'
    const leadId = searchParams.get('leadId');

    if (!arquivoId && !leadId) {
      return NextResponse.json({ error: 'ID do arquivo ou do lead é obrigatório' }, { status: 400 });
    }

    // Se for um arquivo específico
    if (arquivoId && type === 'arquivo') {
      const arquivo = await prismaClient.arquivoLeadOab.findUnique({
        where: { id: arquivoId },
      });

      if (!arquivo) {
        return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
      }

      try {
        // Tentar remover do MinIO se a URL contiver objstoreapi
        if (arquivo.dataUrl && arquivo.dataUrl.includes('objstoreapi')) {
          const objectName = arquivo.dataUrl.split('/').pop();
          if (objectName) {
            try {
              // Importação dinâmica do client MinIO para evitar erros se não estiver disponível
              const { MinioClient } = await import('@/lib/minio');
              const minioClient = new MinioClient();
              await minioClient.removeObject(BUCKET_NAME, objectName);
              log.info(`[ArquivoDelete] Arquivo removido do MinIO: ${objectName}`);
            } catch (minioError) {
              log.error(`[ArquivoDelete] Erro ao remover arquivo do MinIO: ${minioError}`);
              // Continua mesmo com erro no MinIO
            }
          }
        }
      } catch (error) {
        log.error(`[ArquivoDelete] Erro ao processar remoção do MinIO: ${error}`);
        // Continua mesmo com erro no MinIO
      }

      // Delete do banco
      await prismaClient.arquivoLeadOab.delete({
        where: { id: arquivoId },
      });

      log.info(`[ArquivoDelete] Arquivo excluído com sucesso: ${arquivoId}`);
      return NextResponse.json({ success: true, message: 'Arquivo excluído com sucesso' });
    }

    // Se for um PDF unificado
    if (leadId && type === 'pdf') {
      const lead = await prismaClient.leadOabData.findUnique({
        where: { id: leadId },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
      }

      if (lead.pdfUnificado && lead.pdfUnificado.includes('objstoreapi')) {
        try {
          const objectName = lead.pdfUnificado.split('/').pop();
          if (objectName) {
            try {
              // Importação dinâmica do client MinIO
              const { MinioClient } = await import('@/lib/minio');
              const minioClient = new MinioClient();
              await minioClient.removeObject(BUCKET_NAME, objectName);
              log.info(`[ArquivoDelete] PDF unificado removido do MinIO: ${objectName}`);
            } catch (minioError) {
              log.error(`[ArquivoDelete] Erro ao remover PDF unificado do MinIO: ${minioError}`);
              // Continua mesmo com erro no MinIO
            }
          }
        } catch (error) {
          log.error(`[ArquivoDelete] Erro ao processar remoção do PDF do MinIO: ${error}`);
          // Continua mesmo com erro no MinIO
        }
      }

      // Atualiza o lead para remover a referência ao PDF
      await prismaClient.leadOabData.update({
        where: { id: leadId },
        data: { pdfUnificado: null },
      });

      log.info(`[ArquivoDelete] PDF unificado excluído com sucesso para o lead: ${leadId}`);
      return NextResponse.json({ success: true, message: 'PDF unificado excluído com sucesso' });
    }

    // Se for imagens convertidas
    if (leadId && type === 'imagem') {
      const lead = await prismaClient.leadOabData.findUnique({
        where: { id: leadId },
        include: {
          arquivos: true
        }
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
      }

      // Remove as URLs de imagens convertidas de todos os arquivos do lead
      for (const arquivo of lead.arquivos) {
        if (arquivo.pdfConvertido && arquivo.pdfConvertido.includes('objstoreapi')) {
          try {
            const objectName = arquivo.pdfConvertido.split('/').pop();
            if (objectName) {
              try {
                // Importação dinâmica do client MinIO
                const { MinioClient } = await import('@/lib/minio');
                const minioClient = new MinioClient();
                await minioClient.removeObject(BUCKET_NAME, objectName);
                log.info(`[ArquivoDelete] Imagem convertida removida do MinIO: ${objectName}`);
              } catch (minioError) {
                log.error(`[ArquivoDelete] Erro ao remover imagem convertida do MinIO: ${minioError}`);
                // Continua mesmo com erro no MinIO
              }
            }
          } catch (error) {
            log.error(`[ArquivoDelete] Erro ao processar remoção de imagem do MinIO: ${error}`);
            // Continua mesmo com erro no MinIO
          }
        }
      }

      // Atualiza os arquivos para remover as referências às imagens
      await prismaClient.arquivoLeadOab.updateMany({
        where: { leadOabDataId: leadId },
        data: { pdfConvertido: null },
      });

      log.info(`[ArquivoDelete] Imagens convertidas excluídas com sucesso para o lead: ${leadId}`);
      return NextResponse.json({ success: true, message: 'Imagens convertidas excluídas com sucesso' });
    }

    return NextResponse.json({ error: 'Tipo de exclusão inválido' }, { status: 400 });
  } catch (error) {
    log.error(`[ArquivoDelete] Erro ao excluir arquivo: ${error}`);
    return NextResponse.json({ error: 'Erro ao excluir arquivo', details: error }, { status: 500 });
  }
}

/**
 * PATCH - Atualiza um arquivo (ex: adiciona URL do PDF convertido)
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const { id, pdfConvertido } = await request.json();
    
    // Valide os dados recebidos
    if (!id) {
      return NextResponse.json(
        { error: "ID do arquivo é obrigatório" },
        { status: 400 }
      );
    }
    
    // Atualize o arquivo
    const arquivo = await prismaClient.arquivoLeadOab.update({
      where: { id },
      data: {
        ...(pdfConvertido !== undefined && { pdfConvertido }),
      },
    });
    
    return NextResponse.json({
      success: true,
      arquivo,
    });
  } catch (error) {
    console.error("[API Arquivos] Erro ao atualizar arquivo:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar arquivo" },
      { status: 500 }
    );
  }
} 