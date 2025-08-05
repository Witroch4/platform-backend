// Local: /api/admin/dialogflow/agentes
import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
import { auth } from '@/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { nome, projectId, credentials, region, inboxId } = body;

    // Debug: Log dos dados recebidos
    console.log('🔍 [Agentes] Dados recebidos para criação:', {
      nome,
      projectId: projectId ? `${projectId.substring(0, 10)}...` : 'não informado',
      region,
      inboxId
    });

    if (!nome || !projectId || !credentials || !inboxId) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando: nome, projectId, credentials e inboxId' }, { status: 400 });
    }

    // Buscar o usuário Chatwit correspondente ao usuário logado
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado. Configure primeiro o token de acesso.' }, { status: 404 });
    }

    const newAgente = await prisma.agenteDialogflow.create({
      data: {
        nome,
        projectId,
        credentials,
        region: region || 'global',
        inboxId,
        usuarioChatwitId: usuarioChatwit.id, // Usar o ID do UsuarioChatwit, não do User
      },
    });

    console.log('✅ [Agentes] Agente criado com sucesso:', {
      id: newAgente.id,
      nome: newAgente.nome,
      region: newAgente.region,
      projectId: newAgente.projectId
    });

    return NextResponse.json({ message: 'Agente criado com sucesso', agente: newAgente }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar agente:', error);
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, nome, projectId, credentials, region } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do agente é obrigatório' }, { status: 400 });
    }

    // Medida de segurança: verificar se o agente pertence ao usuário logado
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado.' }, { status: 404 });
    }

    const agenteExistente = await prisma.agenteDialogflow.findFirst({
      where: {
        id,
        usuarioChatwitId: usuarioChatwit.id,
      },
    });

    if (!agenteExistente) {
      return NextResponse.json(
        { error: 'Agente não encontrado ou não pertence ao usuário' },
        { status: 404 }
      );
    }

    // Log para depuração do corpo da requisição
    console.log('Corpo recebido para atualização do agente:', body);

    // Construir objeto de atualização apenas com campos fornecidos que não sejam nulos nem indefinidos
    const dataToUpdate = Object.fromEntries(
      Object.entries({ nome, projectId, credentials, region }).filter(
        ([_, value]) => value !== undefined && value !== null
      )
    );

    // Se nada for enviado para atualização, retorna o agente existente sem fazer nada.
    if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ message: 'Nenhum dado fornecido para atualização.', agente: agenteExistente });
    }

    const updatedAgente = await prisma.agenteDialogflow.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ message: 'Agente atualizado com sucesso', agente: updatedAgente });
  } catch (error: any) {
    console.error('Erro ao atualizar agente:', error);
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
    try {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
  
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
  
      if (!id) {
        return NextResponse.json({ error: 'ID do agente é obrigatório' }, { status: 400 });
      }
  
      // Buscar o usuário Chatwit correspondente ao usuário logado
      const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
        where: { appUserId: session.user.id }
      });

      if (!usuarioChatwit) {
        return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
      }

      // Adicional: Verificar se o agente pertence ao usuário logado antes de deletar
      const agente = await prisma.agenteDialogflow.findFirst({
        where: {
          id,
          usuarioChatwitId: usuarioChatwit.id,
        },
      });
  
      if (!agente) {
        return NextResponse.json({ error: 'Agente não encontrado ou não pertence ao usuário' }, { status: 404 });
      }
  
      await prisma.agenteDialogflow.delete({
        where: { id },
      });
  
      return NextResponse.json({ message: 'Agente excluído com sucesso' });
    } catch (error: any) {
      console.error('Erro ao excluir agente:', error);
      return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
    }
  }