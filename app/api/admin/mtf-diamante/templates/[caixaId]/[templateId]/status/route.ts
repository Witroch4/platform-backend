import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';

/**
 * Obtém as configurações da API do WhatsApp do usuário
 */
async function getWhatsAppApiConfig(userId: string) {
  try {
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: userId },
      include: {
        configuracaoGlobalWhatsApp: true,
      },
    });

    if (usuarioChatwit?.configuracaoGlobalWhatsApp) {
      const config = usuarioChatwit.configuracaoGlobalWhatsApp;
      return {
        fbGraphApiBase: config.graphApiBaseUrl,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappApiKey,
      };
    }

    return {
      fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID,
      whatsappToken: process.env.WHATSAPP_TOKEN,
    };
  } catch (error) {
    console.error('[TemplateStatus] Erro ao buscar config:', error);
    return {
      fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID,
      whatsappToken: process.env.WHATSAPP_TOKEN,
    };
  }
}

/**
 * GET /api/admin/mtf-diamante/templates/[caixaId]/[templateId]/status
 *
 * Consulta o status de um template específico na Meta API e sincroniza com o banco.
 *
 * @param caixaId - O ID da caixa (inbox)
 * @param templateId - O ID do template na Meta (metaTemplateId)
 * @returns { success, status, name, category, qualityScore, rejectionReason, previousStatus, statusChanged }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caixaId: string; templateId: string }> }
) {
  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }

    const { templateId } = await params;

    if (!templateId) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório.' },
        { status: 400 }
      );
    }

    console.log(`[TemplateStatus] Verificando status do template: ${templateId}`);

    // Buscar configuração do WhatsApp
    const config = await getWhatsAppApiConfig(session.user.id);

    if (!config.whatsappToken) {
      return NextResponse.json(
        { error: 'Credenciais do WhatsApp não configuradas.' },
        { status: 400 }
      );
    }

    // Buscar template no banco de dados
    const dbTemplate = await getPrismaInstance().template.findFirst({
      where: {
        whatsappOfficialInfo: {
          metaTemplateId: templateId,
        },
        createdById: session.user.id,
      },
      include: {
        whatsappOfficialInfo: true,
      },
    });

    const previousStatus = dbTemplate?.whatsappOfficialInfo?.status || 'UNKNOWN';

    // Consultar a Meta API
    const metaUrl = `${config.fbGraphApiBase}/${templateId}?fields=id,name,status,category,language,quality_score,rejected_reason,components`;

    console.log(`[TemplateStatus] Consultando Meta API: ${metaUrl}`);

    let metaResponse;
    try {
      metaResponse = await axios.get(metaUrl, {
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
    } catch (apiError: any) {
      if (apiError.response?.status === 404) {
        return NextResponse.json(
          { error: 'Template não encontrado na Meta.' },
          { status: 404 }
        );
      }
      console.error('[TemplateStatus] Erro na Meta API:', apiError.response?.data || apiError.message);
      throw apiError;
    }

    const metaData = metaResponse.data;
    console.log(`[TemplateStatus] Resposta da Meta:`, {
      id: metaData.id,
      name: metaData.name,
      status: metaData.status,
      category: metaData.category,
    });

    const newStatus = metaData.status;
    const statusChanged = previousStatus !== newStatus;

    // Atualizar o status no banco se mudou
    if (statusChanged && dbTemplate?.whatsappOfficialInfo) {
      console.log(`[TemplateStatus] Status mudou: ${previousStatus} -> ${newStatus}`);

      await getPrismaInstance().whatsAppOfficialInfo.update({
        where: { id: dbTemplate.whatsappOfficialInfo.id },
        data: {
          status: newStatus,
          qualityScore: metaData.quality_score?.score || null,
          components: metaData.components || dbTemplate.whatsappOfficialInfo.components,
        },
      });

      // Também atualizar o status no Template principal
      await getPrismaInstance().template.update({
        where: { id: dbTemplate.id },
        data: {
          status: newStatus,
        },
      });

      console.log(`[TemplateStatus] Status atualizado no banco de dados.`);
    }

    return NextResponse.json({
      success: true,
      templateId: metaData.id,
      name: metaData.name,
      status: newStatus,
      category: metaData.category,
      language: metaData.language,
      qualityScore: metaData.quality_score?.score || null,
      rejectionReason: metaData.rejected_reason || null,
      previousStatus,
      statusChanged,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[TemplateStatus] Erro:', error.message || error);

    if (error.response?.data?.error) {
      const metaError = error.response.data.error;
      return NextResponse.json(
        {
          error: `Erro da Meta API: ${metaError.message}`,
          code: metaError.code,
        },
        { status: error.response.status || 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao verificar status do template.' },
      { status: 500 }
    );
  }
}
