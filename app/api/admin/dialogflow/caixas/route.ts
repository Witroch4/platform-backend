import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';

// GET - Listar caixas configuradas
export async function GET() {
  try {
    console.log('🔍 [CaixasEntrada] Iniciando busca de caixas...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [CaixasEntrada] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    console.log('👤 [CaixasEntrada] Usuário autenticado:', session.user.id);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    const caixas = await prisma.caixaEntrada.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      include: {
        agentes: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📋 [CaixasEntrada] Caixas encontradas:', caixas.length);

    return NextResponse.json({ caixas });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [CaixasEntrada] Erro ao buscar caixas:', error);
    return NextResponse.json({ error: 'Erro interno', details: err.message }, { status: 500 });
  }
}

// POST - Criar nova caixa
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [CaixasEntrada] Iniciando criação de caixa...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [CaixasEntrada] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    console.log('📝 [CaixasEntrada] Dados recebidos:', {
      nome: body.nome,
      accountId: body.accountId,
      inboxId: body.inboxId,
      inboxName: body.inboxName,
      channelType: body.channelType
    });

    const { nome, accountId, inboxId, inboxName, channelType } = body;

    // Validar campos obrigatórios
    if (!nome || !accountId || !inboxId || !inboxName || !channelType) {
      console.log('❌ [CaixasEntrada] Campos obrigatórios não preenchidos');
      return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Verificar se a caixa já existe
    const caixaExistente = await prisma.caixaEntrada.findFirst({
      where: {
        usuarioChatwitId: usuarioChatwit.id,
        inboxId: inboxId
      }
    });

    if (caixaExistente) {
      console.log('❌ [CaixasEntrada] Caixa já configurada');
      return NextResponse.json({ error: 'Esta caixa de entrada já está configurada' }, { status: 400 });
    }

    // Criar caixa no banco
    console.log('💾 [CaixasEntrada] Salvando caixa no banco...');
    
    const caixa = await prisma.caixaEntrada.create({
      data: {
        nome,
        chatwitAccountId: accountId, // Usar chatwitAccountId
        inboxId,
        inboxName,
        channelType,
        usuarioChatwitId: usuarioChatwit.id
      },
      include: {
        agentes: true
      }
    });

    console.log('✅ [CaixasEntrada] Caixa criada com sucesso:', caixa.id);

    return NextResponse.json({ 
      message: 'Caixa configurada com sucesso',
      caixa
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [CaixasEntrada] Erro ao criar caixa:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: err.message 
    }, { status: 500 });
  }
}

// DELETE - Deletar caixa
export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ [CaixasEntrada] Iniciando exclusão de caixa...');
    
    const session = await auth();
    if (!session?.user?.id) {
      console.log('❌ [CaixasEntrada] Usuário não autorizado');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const caixaId = searchParams.get('id');

    if (!caixaId) {
      console.log('❌ [CaixasEntrada] ID da caixa não fornecido');
      return NextResponse.json({ error: 'ID da caixa é obrigatório' }, { status: 400 });
    }

    console.log('🔍 [CaixasEntrada] Buscando caixa:', caixaId);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Buscar a caixa
    const caixa = await prisma.caixaEntrada.findFirst({
      where: { 
        id: caixaId,
        usuarioChatwitId: usuarioChatwit.id 
      }
    });

    if (!caixa) {
      console.log('❌ [CaixasEntrada] Caixa não encontrada');
      return NextResponse.json({ error: 'Caixa não encontrada' }, { status: 404 });
    }

    // Deletar caixa do banco (os agentes serão deletados automaticamente)
    await prisma.caixaEntrada.delete({
      where: { id: caixaId }
    });

    console.log('✅ [CaixasEntrada] Caixa deletada com sucesso');

    return NextResponse.json({ message: 'Caixa deletada com sucesso' });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [CaixasEntrada] Erro ao deletar caixa:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: err.message 
    }, { status: 500 });
  }
} 