import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';
import axios from 'axios';

// GET - Listar agentes
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [AgentesDialogflow] Iniciando busca de agentes...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [AgentesDialogflow] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const caixaId = searchParams.get('caixaId');

    if (!caixaId) {
      console.log('❌ [AgentesDialogflow] ID da caixa não fornecido');
      return NextResponse.json({ error: 'ID da caixa é obrigatório' }, { status: 400 });
    }

    console.log('👤 [AgentesDialogflow] Usuário autenticado:', session.user.id);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    const agentes = await prisma.agenteDialogflow.findMany({
      where: { 
        usuarioChatwitId: usuarioChatwit.id,
        caixaId: caixaId
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📋 [AgentesDialogflow] Agentes encontrados:', agentes.length);

    return NextResponse.json({ agentes });
  } catch (error: any) {
    console.error('❌ [AgentesDialogflow] Erro ao buscar agentes:', error);
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}

// POST - Criar novo agente
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [AgentesDialogflow] Iniciando criação de agente...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [AgentesDialogflow] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    console.log('📝 [AgentesDialogflow] Dados recebidos:', {
      nome: body.nome,
      projectId: body.projectId,
      region: body.region,
      caixaId: body.caixaId,
      credentialsLength: body.credentials?.length || 0
    });

    const { nome, projectId, credentials, region, caixaId } = body;

    // Validar campos obrigatórios
    if (!nome || !projectId || !credentials || !caixaId) {
      console.log('❌ [AgentesDialogflow] Campos obrigatórios não preenchidos');
      return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Verificar se a caixa pertence ao usuário
    const caixa = await prisma.caixaEntrada.findFirst({
      where: {
        id: caixaId,
        usuarioChatwitId: usuarioChatwit.id
      }
    });

    if (!caixa) {
      console.log('❌ [AgentesDialogflow] Caixa não encontrada');
      return NextResponse.json({ error: 'Caixa não encontrada' }, { status: 404 });
    }

    // Validar JSON das credenciais
    let parsedCredentials;
    try {
      parsedCredentials = JSON.parse(credentials);
      console.log('✅ [AgentesDialogflow] Credenciais JSON válidas');
    } catch {
      console.log('❌ [AgentesDialogflow] Credenciais JSON inválidas');
      return NextResponse.json({ error: 'Credenciais inválidas - JSON malformado' }, { status: 400 });
    }

    // Criar agente no banco
    console.log('💾 [AgentesDialogflow] Salvando agente no banco...');
    
    const agente = await prisma.agenteDialogflow.create({
      data: {
        nome,
        projectId,
        credentials,
        region: region || 'global',
        usuarioChatwitId: usuarioChatwit.id,
        caixaId
      }
    });

    console.log('✅ [AgentesDialogflow] Agente criado com sucesso:', agente.id);

    return NextResponse.json({ 
      message: 'Agente criado com sucesso',
      agente
    });
  } catch (error: any) {
    console.error('❌ [AgentesDialogflow] Erro ao criar agente:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Deletar agente
export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ [AgentesDialogflow] Iniciando exclusão de agente...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [AgentesDialogflow] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agenteId = searchParams.get('id');

    if (!agenteId) {
      console.log('❌ [AgentesDialogflow] ID do agente não fornecido');
      return NextResponse.json({ error: 'ID do agente é obrigatório' }, { status: 400 });
    }

    console.log('🔍 [AgentesDialogflow] Buscando agente:', agenteId);

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
        id: agenteId,
        usuarioChatwitId: usuarioChatwit.id 
      },
      include: {
        caixa: true
      }
    });

    if (!agente) {
      console.log('❌ [AgentesDialogflow] Agente não encontrado');
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    // Deletar hook no Chatwit se existir
    if (agente.hookId && agente.caixa.chatwitAccountId) {
      try {
        console.log('🔗 [AgentesDialogflow] Deletando hook no Chatwit...');
        
        const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
          where: { appUserId: session.user.id },
          select: { chatwitAccessToken: true }
        });

        if (usuarioChatwit?.chatwitAccessToken) {
          await axios.delete(
            `https://app.chatwoot.com/api/v1/accounts/${agente.caixa.chatwitAccountId}/integrations/hooks/${agente.hookId}`,
            {
              headers: {
                'api_access_token': usuarioChatwit.chatwitAccessToken
              }
            }
          );
          console.log('✅ [AgentesDialogflow] Hook deletado com sucesso');
        }
      } catch (apiError: any) {
        console.error('❌ [AgentesDialogflow] Erro ao deletar hook:', apiError.message);
        // Continuar mesmo se falhar
      }
    }

    // Deletar agente do banco
    await prisma.agenteDialogflow.delete({
      where: { id: agenteId }
    });

    console.log('✅ [AgentesDialogflow] Agente deletado com sucesso');

    return NextResponse.json({ message: 'Agente deletado com sucesso' });
  } catch (error: any) {
    console.error('❌ [AgentesDialogflow] Erro ao deletar agente:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: error.message 
    }, { status: 500 });
  }
} 