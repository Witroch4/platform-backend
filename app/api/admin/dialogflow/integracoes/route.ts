import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';
import axios from 'axios';

// GET - Listar integrações
export async function GET() {
  try {
    console.log('🔍 [DialogflowIntegracoes] Iniciando busca de integrações...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [DialogflowIntegracoes] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    console.log('👤 [DialogflowIntegracoes] Usuário autenticado:', session.user.id);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    const integracoes = await prisma.integracaoDialogflow.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📋 [DialogflowIntegracoes] Integrações encontradas:', integracoes.length);

    return NextResponse.json({ integracoes });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DialogflowIntegracoes] Erro ao buscar integrações:', err);
    return NextResponse.json({ error: 'Erro interno', details: err.message }, { status: 500 });
  }
}

// POST - Criar nova integração
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [DialogflowIntegracoes] Iniciando criação de integração...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [DialogflowIntegracoes] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    console.log('📝 [DialogflowIntegracoes] Dados recebidos:', {
      nome: body.nome,
      accountId: body.accountId,
      projectId: body.projectId,
      region: body.region,
      inboxId: body.inboxId,
      inboxName: body.inboxName,
      credentialsLength: body.credentials?.length || 0
    });

    const { nome, accountId, projectId, credentials, region, inboxId, inboxName } = body;

    // Validar campos obrigatórios
    if (!nome || !accountId || !projectId || !credentials) {
      console.log('❌ [DialogflowIntegracoes] Campos obrigatórios não preenchidos');
      return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
    }

    // Validar JSON das credenciais
    let parsedCredentials;
    try {
      parsedCredentials = JSON.parse(credentials);
      console.log('✅ [DialogflowIntegracoes] Credenciais JSON válidas');
    } catch {
      console.log('❌ [DialogflowIntegracoes] Credenciais JSON inválidas');
      return NextResponse.json({ error: 'Credenciais inválidas - JSON malformado' }, { status: 400 });
    }

    // Criar hook na API do Chatwit se inbox foi selecionado
    let hookId = null;
    if (inboxId && accountId) {
      try {
        console.log('🔗 [DialogflowIntegracoes] Criando hook no Chatwit...');
        
        // Buscar o token do usuário Chatwit
        const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
          where: { appUserId: session.user.id },
          select: { chatwitAccessToken: true }
        });

        if (!usuarioChatwit?.chatwitAccessToken) {
          console.log('❌ [DialogflowIntegracoes] Token de acesso não encontrado');
          return NextResponse.json({ error: 'Token de acesso não configurado' }, { status: 400 });
        }

        console.log('🔑 [DialogflowIntegracoes] Token encontrado, criando hook...');

        // Primeiro, listar as integrações disponíveis para encontrar o Dialogflow
        const integracoesResponse = await axios.get(
          `https://app.chatwoot.com/api/v1/accounts/${accountId}/integrations/apps`,
          {
            headers: {
              'api_access_token': usuarioChatwit.chatwitAccessToken
            }
          }
        );

        console.log('📋 [DialogflowIntegracoes] Integrações disponíveis:', integracoesResponse.data);

        // Procurar pela integração do Dialogflow
        const dialogflowApp = integracoesResponse.data.payload?.find((app: any) => 
          app.name?.toLowerCase().includes('dialogflow') || 
          app.id === 'dialogflow'
        );

        if (!dialogflowApp) {
          console.log('❌ [DialogflowIntegracoes] Integração Dialogflow não encontrada no Chatwit');
          return NextResponse.json({ error: 'Integração Dialogflow não disponível no Chatwit' }, { status: 400 });
        }

        console.log('✅ [DialogflowIntegracoes] App Dialogflow encontrado:', dialogflowApp);

        // Criar o hook
        const hookData = {
          app_id: dialogflowApp.id,
          inbox_id: parseInt(inboxId),
          status: 1, // Ativo
          settings: {
            project_id: projectId,
            credentials: parsedCredentials
          }
        };

        console.log('📤 [DialogflowIntegracoes] Criando hook com dados:', {
          app_id: hookData.app_id,
          inbox_id: hookData.inbox_id,
          status: hookData.status,
          project_id: projectId
        });

        const hookResponse = await axios.post(
          `https://app.chatwoot.com/api/v1/accounts/${accountId}/integrations/hooks`,
          hookData,
          {
            headers: {
              'api_access_token': usuarioChatwit.chatwitAccessToken,
              'Content-Type': 'application/json'
            }
          }
        );

        hookId = hookResponse.data.id;
        console.log('✅ [DialogflowIntegracoes] Hook criado com sucesso, ID:', hookId);

      } catch (apiError) {
        const err = apiError as Error & { response?: any };
        console.error('❌ [DialogflowIntegracoes] Erro ao criar hook no Chatwit:', {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data
        });
        
        // Não falhar a criação da integração se o hook falhar
        console.log('⚠️ [DialogflowIntegracoes] Continuando sem hook...');
      }
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Criar integração no banco
    console.log('💾 [DialogflowIntegracoes] Salvando integração no banco...');
    
    const integracao = await prisma.integracaoDialogflow.create({
      data: {
        nome,
        chatwitAccountId: accountId, // Usar chatwitAccountId
        projectId,
        credentials,
        region: region || 'global',
        inboxId,
        inboxName,
        hookId: hookId?.toString(),
        usuarioChatwitId: usuarioChatwit.id
      }
    });

    console.log('✅ [DialogflowIntegracoes] Integração criada com sucesso:', integracao.id);

    return NextResponse.json({ 
      message: 'Integração criada com sucesso',
      integracao,
      hookId
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DialogflowIntegracoes] Erro ao criar integração:', err);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: err.message 
    }, { status: 500 });
  }
}

// DELETE - Deletar integração
export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ [DialogflowIntegracoes] Iniciando exclusão de integração...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [DialogflowIntegracoes] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const integracaoId = searchParams.get('id');

    if (!integracaoId) {
      console.log('❌ [DialogflowIntegracoes] ID da integração não fornecido');
      return NextResponse.json({ error: 'ID da integração é obrigatório' }, { status: 400 });
    }

    console.log('🔍 [DialogflowIntegracoes] Buscando integração:', integracaoId);

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
        id: integracaoId,
        usuarioChatwitId: usuarioChatwit.id 
      }
    });

    if (!integracao) {
      console.log('❌ [DialogflowIntegracoes] Integração não encontrada');
      return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 });
    }

    // Deletar hook no Chatwit se existir
    if (integracao.hookId && integracao.chatwitAccountId) {
      try {
        console.log('🔗 [DialogflowIntegracoes] Deletando hook no Chatwit...');
        
        const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
          where: { appUserId: session.user.id },
          select: { chatwitAccessToken: true }
        });

        if (usuarioChatwit?.chatwitAccessToken) {
          await axios.delete(
            `https://app.chatwoot.com/api/v1/accounts/${integracao.chatwitAccountId}/integrations/hooks/${integracao.hookId}`,
            {
              headers: {
                'api_access_token': usuarioChatwit.chatwitAccessToken
              }
            }
          );
          console.log('✅ [DialogflowIntegracoes] Hook deletado com sucesso');
        }
      } catch (apiError) {
        const err = apiError as Error & { response?: any };
        console.error('❌ [DialogflowIntegracoes] Erro ao deletar hook:', err.message);
        // Continuar mesmo se falhar
      }
    }

    // Deletar integração do banco
    await prisma.integracaoDialogflow.delete({
      where: { id: integracaoId }
    });

    console.log('✅ [DialogflowIntegracoes] Integração deletada com sucesso');

    return NextResponse.json({ message: 'Integração deletada com sucesso' });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DialogflowIntegracoes] Erro ao deletar integração:', err);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: err.message 
    }, { status: 500 });
  }
} 