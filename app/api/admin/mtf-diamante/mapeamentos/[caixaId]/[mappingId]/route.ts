import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// DELETE: Exclui um mapeamento de intenção
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ caixaId: string; mappingId: string }> }) {
  const { mappingId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!mappingId) {
        return NextResponse.json({ error: 'ID do mapeamento é obrigatório' }, { status: 400 });
    }

    await db.mapeamentoIntencao.delete({
      where: { id: mappingId },
    });

    return NextResponse.json({ message: 'Mapeamento excluído com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Erro ao excluir mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 