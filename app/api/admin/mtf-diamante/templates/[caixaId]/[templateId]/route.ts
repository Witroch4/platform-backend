import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// DELETE: Exclui um template de WhatsApp
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ inboxId: string, templateId: string }> }) {
  const { templateId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!templateId) {
        return NextResponse.json({ error: 'ID do template é obrigatório' }, { status: 400 });
    }

    // Verificar se o template não está sendo usado em um mapeamento
    const mapping = await db.mapeamentoIntencao.findFirst({
        where: { templateId: templateId }
    });

    if (mapping) {
        return NextResponse.json({ error: 'Este template está em uso por um mapeamento e não pode ser excluído.' }, { status: 409 });
    }

    await db.template.delete({
      where: { id: templateId },
    });

    return NextResponse.json({ message: 'Template excluído com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Erro ao excluir template:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 