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
    console.log('🔄 [AgenteToggle] Iniciando toggle de agente:', id);
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [AgenteToggle] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Buscar o agente
    const agente = await prisma.agenteDialogflow.findFirst({
      where: { 
        id: id,
        usuarioChatwitId: usuarioChatwit.id 
      },
      include: {
        caixa: true
      }
    });

    if (!agente) {
      console.log('❌ [AgenteToggle] Agente não encontrado');
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    const novoStatus = !agente.ativo;
    console.log('🔄 [AgenteToggle] Alterando status de', agente.ativo, 'para', novoStatus);

    // Se está ativando, desativar todos os outros agentes da mesma caixa
    if (novoStatus) {
      console.log('🔄 [AgenteToggle] Desativando outros agentes da caixa:', agente.caixaId);
      
      // Buscar outros agentes ativos da mesma caixa
      const outrosAgentesAtivos = await prisma.agenteDialogflow.findMany({
        where: {
          caixaId: agente.caixaId,
          ativo: true,
          id: { not: id }
        },
        include: {
          caixa: true
        }
      });

      // Desativar hooks dos outros agentes no Chatwit
      for (const outroAgente of outrosAgentesAtivos) {
        if (outroAgente.hookId && outroAgente.caixa.chatwitAccountId) {
          try {
            console.log('🔗 [AgenteToggle] Desativando hook do agente:', outroAgente.nome);
            
            // Buscar configurações do usuário Chatwit
            const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
              where: { appUserId: session.user.id },
              select: {
                chatwitAccessToken: true,
              }
            });

            if (usuarioChatwit?.chatwitAccessToken) {
              await axios.patch(
                `https://app.chatwoot.com/api/v1/accounts/${outroAgente.caixa.chatwitAccountId}/integrations/hooks/${outroAgente.hookId}`,
                {
                  status: 0 // Desativar
                },
                {
                  headers: {
                    'api_access_token': usuarioChatwit.chatwitAccessToken,
                    'Content-Type': 'application/json'
                  }
                }
              );
              console.log('✅ [AgenteToggle] Hook desativado com sucesso');
            }
          } catch (apiError: any) {
            console.error('❌ [AgenteToggle] Erro ao desativar hook:', apiError.message);
          }
        }
      }

      // Desativar outros agentes no banco
      await prisma.agenteDialogflow.updateMany({
        where: {
          caixaId: agente.caixaId,
          id: { not: id }
        },
        data: { ativo: false }
      });

      console.log('✅ [AgenteToggle] Outros agentes desativados');
    }

    // Criar ou atualizar hook no Chatwit
    let hookId = agente.hookId;
    
    if (novoStatus) {
      // Ativando - criar hook se não existir
      if (!hookId) {
        try {
          console.log('🔗 [AgenteToggle] Criando hook no Chatwit...');
          
          // Buscar configurações do usuário Chatwit
          const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
            where: { appUserId: session.user.id },
            select: {
              chatwitAccessToken: true,
            }
          });

          if (!usuarioChatwit?.chatwitAccessToken) {
            console.log('❌ [AgenteToggle] Token de acesso não encontrado');
            return NextResponse.json({ error: 'Token de acesso não configurado' }, { status: 400 });
          }

          // Buscar integrações disponíveis
          const integracoesResponse = await axios.get(
            `https://app.chatwoot.com/api/v1/accounts/${agente.caixa.chatwitAccountId}/integrations/apps`,
            {
              headers: {
                'api_access_token': usuarioChatwit.chatwitAccessToken
              }
            }
          );

          const dialogflowApp = integracoesResponse.data.payload?.find((app: any) => 
            app.name?.toLowerCase().includes('dialogflow') || 
            app.id === 'dialogflow'
          );

          if (!dialogflowApp) {
            console.log('❌ [AgenteToggle] Integração Dialogflow não encontrada');
            return NextResponse.json({ error: 'Integração Dialogflow não disponível' }, { status: 400 });
          }

          const parsedCredentials = JSON.parse(agente.credentials);
          const hookData = {
            app_id: dialogflowApp.id,
            inbox_id: parseInt(agente.caixa.inboxId),
            status: 1,
            settings: {
              project_id: agente.projectId,
              credentials: parsedCredentials
            }
          };

          const hookResponse = await axios.post(
            `https://app.chatwoot.com/api/v1/accounts/${agente.caixa.chatwitAccountId}/integrations/hooks`,
            hookData,
            {
              headers: {
                'api_access_token': usuarioChatwit.chatwitAccessToken,
                'Content-Type': 'application/json'
              }
            }
          );

          hookId = hookResponse.data.id;
          console.log('✅ [AgenteToggle] Hook criado com sucesso, ID:', hookId);

        } catch (apiError: any) {
          console.error('❌ [AgenteToggle] Erro ao criar hook:', {
            message: apiError.message,
            status: apiError.response?.status,
            data: apiError.response?.data
          });
          
          return NextResponse.json({ 
            error: 'Erro ao criar integração no Chatwit',
            details: apiError.response?.data || apiError.message
          }, { status: 500 });
        }
      } else {
        // Hook existe, apenas ativar
        try {
          console.log('🔗 [AgenteToggle] Ativando hook existente...');
          
          // Buscar configurações do usuário Chatwit
          const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
            where: { appUserId: session.user.id },
            select: {
              chatwitAccessToken: true,
            }
          });

          if (usuarioChatwit?.chatwitAccessToken) {
            await axios.patch(
              `https://app.chatwoot.com/api/v1/accounts/${agente.caixa.chatwitAccountId}/integrations/hooks/${hookId}`,
              {
                status: 1
              },
              {
                headers: {
                  'api_access_token': usuarioChatwit.chatwitAccessToken,
                  'Content-Type': 'application/json'
                }
              }
            );
            console.log('✅ [AgenteToggle] Hook ativado com sucesso');
          }
        } catch (apiError: any) {
          console.error('❌ [AgenteToggle] Erro ao ativar hook:', apiError.message);
        }
      }
    } else {
      // Desativando - desativar hook se existir
      if (hookId) {
        try {
          console.log('🔗 [AgenteToggle] Desativando hook...');
          
          // Buscar configurações do usuário Chatwit
          const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
            where: { appUserId: session.user.id },
            select: {
              chatwitAccessToken: true,
            }
          });

          if (usuarioChatwit?.chatwitAccessToken) {
            await axios.patch(
              `https://app.chatwoot.com/api/v1/accounts/${agente.caixa.chatwitAccountId}/integrations/hooks/${hookId}`,
              {
                status: 0
              },
              {
                headers: {
                  'api_access_token': usuarioChatwit.chatwitAccessToken,
                  'Content-Type': 'application/json'
                }
              }
            );
            console.log('✅ [AgenteToggle] Hook desativado com sucesso');
          }
        } catch (apiError: any) {
          console.error('❌ [AgenteToggle] Erro ao desativar hook:', apiError.message);
        }
      }
    }

    // Atualizar agente no banco
    const agenteAtualizado = await prisma.agenteDialogflow.update({
      where: { id: id },
      data: { 
        ativo: novoStatus,
        hookId: hookId?.toString()
      }
    });

    console.log('✅ [AgenteToggle] Agente atualizado com sucesso');

    return NextResponse.json({ 
      message: `Agente ${novoStatus ? 'ativado' : 'desativado'} com sucesso`,
      agente: agenteAtualizado
    });
  } catch (error: any) {
    console.error('❌ [AgenteToggle] Erro ao alterar status:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: error.message 
    }, { status: 500 });
  }
} 