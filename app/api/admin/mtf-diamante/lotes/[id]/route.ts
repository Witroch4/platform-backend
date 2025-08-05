import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
import { auth } from '@/auth';

// PATCH - Atualizar lote
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { numero, nome, valor, dataInicio, dataFim, isActive } = body;

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Buscar configuração MTF Diamante do usuário
    const mtfConfig = await prisma.mtfDiamanteConfig.findUnique({
      where: { userId: session.user.id }
    });

    if (!mtfConfig) {
      return NextResponse.json({ error: 'Configuração MTF Diamante não encontrada' }, { status: 404 });
    }

    // Buscar variável do lote
    const loteVariavel = await prisma.mtfDiamanteVariavel.findFirst({
      where: { 
        configId: mtfConfig.id,
        chave: `lote_${id}`
      }
    });

    if (!loteVariavel) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
    }

    // Preparar dados para atualização
    const loteData = loteVariavel.valor as any || {};
    
    if (nome !== undefined) loteData.nome = nome;
    if (valor !== undefined) loteData.valor = Number.parseFloat(valor.replace(/[^\d,]/g, '').replace(',', '.'));
    if (dataInicio !== undefined) loteData.dataInicio = new Date(dataInicio);
    if (dataFim !== undefined) loteData.dataFim = new Date(dataFim);
    if (isActive !== undefined) loteData.ativo = isActive;
    if (numero !== undefined) loteData.numero = numero;

    // Atualizar variável do lote
    const loteAtualizado = await prisma.mtfDiamanteVariavel.update({
      where: { id: loteVariavel.id },
      data: { valor: loteData }
    });

    return NextResponse.json({ 
      message: 'Lote atualizado com sucesso',
      lote: {
        id: loteAtualizado.id,
        numero: loteData.numero || 1,
        nome: loteData.nome,
        valor: `R$ ${loteData.valor?.toFixed(2).replace('.', ',') || '0,00'}`,
        dataInicio: loteData.dataInicio,
        dataFim: loteData.dataFim,
        isActive: loteData.ativo
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Excluir lote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Buscar configuração MTF Diamante do usuário
    const mtfConfig = await prisma.mtfDiamanteConfig.findUnique({
      where: { userId: session.user.id }
    });

    if (!mtfConfig) {
      return NextResponse.json({ error: 'Configuração MTF Diamante não encontrada' }, { status: 404 });
    }

    // Buscar variável do lote
    const loteVariavel = await prisma.mtfDiamanteVariavel.findFirst({
      where: { 
        configId: mtfConfig.id,
        chave: `lote_${id}`
      }
    });

    if (!loteVariavel) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
    }

    // Excluir variável do lote
    await prisma.mtfDiamanteVariavel.delete({
      where: { id: loteVariavel.id }
    });

    return NextResponse.json({ 
      message: 'Lote excluído com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}