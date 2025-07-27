import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// POST: Cria ou atualiza um mapeamento
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id: mappingId, intentName, templateId, mensagemInterativaId, interactiveMessageId, unifiedTemplateId, inboxId } = body;

    // Count how many response types are provided
    const responseCount = [templateId, mensagemInterativaId, interactiveMessageId, unifiedTemplateId].filter(Boolean).length;

    if (!intentName || !inboxId || responseCount === 0) {
      return NextResponse.json({ error: 'Intenção, caixa e uma resposta (template unificado, template legado ou mensagem) são obrigatórios.' }, { status: 400 });
    }
    
    if (responseCount > 1) {
        return NextResponse.json({ error: 'Escolha apenas uma resposta: template unificado, template legado ou mensagem interativa.' }, { status: 400 });
    }

    const data = {
      intentName,
      caixaEntradaId: inboxId,
      // New unified template system (priority)
      unifiedTemplateId: unifiedTemplateId || null,
      // Legacy support
      templateId: templateId || null,
      mensagemInterativaId: mensagemInterativaId || null,
      // New interactive message system
      interactiveMessageId: interactiveMessageId || null,
    };

    const savedMapping = await db.mapeamentoIntencao.upsert({
      where: { id: mappingId || '' },
      update: data,
      create: data,
    });

    return NextResponse.json(savedMapping, { status: 201 });
  } catch (error) {
    console.error('Erro ao salvar mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE: Remove um mapeamento
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get('id');

    if (!mappingId) {
      return NextResponse.json({ error: 'ID do mapeamento é obrigatório' }, { status: 400 });
    }

    await db.mapeamentoIntencao.delete({
      where: { id: mappingId }
    });

    return NextResponse.json({ success: true, message: 'Mapeamento excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 