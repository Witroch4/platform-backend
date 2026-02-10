import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';

// GET: Lista todos os flows de uma caixa de entrada
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caixaId: string }> }
) {
  const { caixaId } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const prisma = getPrismaInstance();

    // Buscar a ChatwitInbox para obter o inboxId externo
    const chatwitInbox = await prisma.chatwitInbox.findUnique({
      where: { id: caixaId },
      select: { inboxId: true },
    });

    if (!chatwitInbox) {
      return NextResponse.json({ error: 'Caixa de entrada não encontrada' }, { status: 404 });
    }

    // Buscar flows ativos da inbox
    const flows = await prisma.flow.findMany({
      where: {
        inboxId: caixaId,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ flows });
  } catch (error) {
    console.error('[Flows API] Erro ao buscar flows:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
