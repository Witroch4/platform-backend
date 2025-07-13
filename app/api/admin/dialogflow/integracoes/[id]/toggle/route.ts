import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';
import axios from 'axios';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('🔄 [DialogflowToggle] Iniciando toggle de integração:', id);
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [DialogflowToggle] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Buscar a integração
    const integracao = await prisma.integracaoDialogflow.findFirst({
      where: { 
        id: id,
        usuarioChatwitId: usuarioChatwit.id 
      }
    });

    if (!integracao) {
      console.log('❌ [DialogflowToggle] Integração não encontrada');
      return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 });
    }

    const novoStatus = !integracao.ativo;
    console.log('🔄 [DialogflowToggle] Alterando status de', integracao.ativo, 'para', novoStatus);

    // Atualizar hook no Chatwit se existir
    if (integracao.hookId && integracao.chatwitAccountId) {
      try {
        console.log('🔗 [DialogflowToggle] Atualizando hook no Chatwit...');
        
        const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
          where: { appUserId: session.user.id },
          select: { chatwitAccessToken: true }
        });

        if (usuarioChatwit?.chatwitAccessToken) {
          await axios.patch(
            `https://app.chatwoot.com/api/v1/accounts/${integracao.chatwitAccountId}/integrations/hooks/${integracao.hookId}`,
            {
              status: novoStatus ? 1 : 0
            },
            {
              headers: {
                'api_access_token': usuarioChatwit.chatwitAccessToken,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ [DialogflowToggle] Hook atualizado com sucesso');
        }
      } catch (apiError) {
        const err = apiError as Error & { response?: any };
        return NextResponse.json({
          message: err.message,
          status: err.response?.status,
          data: err.response?.data
        }, { status: 500 });
      }
    }

    // Atualizar integração no banco
    const integracaoAtualizada = await prisma.integracaoDialogflow.update({
      where: { id: id },
      data: { ativo: novoStatus }
    });

    console.log('✅ [DialogflowToggle] Integração atualizada com sucesso');

    return NextResponse.json({ 
      message: `Integração ${novoStatus ? 'ativada' : 'desativada'} com sucesso`,
      integracao: integracaoAtualizada
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: 'Erro interno', details: err.message }, { status: 500 });
  }
} 