import { type NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
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

    // Verificar se o lote existe e pertence ao usuário
    const loteExistente = await prisma.loteOab.findFirst({
      where: { 
        id: id,
        usuarioChatwitId: usuarioChatwit.id 
      }
    });

    if (!loteExistente) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
    }

    // Preparar dados para atualização
    const updateData: any = {};
    
    if (nome !== undefined) updateData.nome = nome;
    if (valor !== undefined) {
      updateData.valor = Number.parseFloat(valor.replace(/[^\d,]/g, '').replace(',', '.'));
    }
    if (dataInicio !== undefined) updateData.dataInicio = new Date(dataInicio);
    if (dataFim !== undefined) updateData.dataFim = new Date(dataFim);
    if (isActive !== undefined) updateData.ativo = isActive;

    // Atualizar lote
    const loteAtualizado = await prisma.loteOab.update({
      where: { id: id },
      data: updateData
    });

    return NextResponse.json({ 
      message: 'Lote atualizado com sucesso',
      lote: {
        id: loteAtualizado.id,
        numero: numero || 1,
        nome: loteAtualizado.nome,
        valor: `R$ ${loteAtualizado.valor.toFixed(2).replace('.', ',')}`,
        dataInicio: loteAtualizado.dataInicio,
        dataFim: loteAtualizado.dataFim,
        isActive: loteAtualizado.ativo
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

    // Verificar se o lote existe e pertence ao usuário
    const loteExistente = await prisma.loteOab.findFirst({
      where: { 
        id: id,
        usuarioChatwitId: usuarioChatwit.id 
      }
    });

    if (!loteExistente) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
    }

    // Excluir lote
    await prisma.loteOab.delete({
      where: { id: id }
    });

    return NextResponse.json({ 
      message: 'Lote excluído com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}