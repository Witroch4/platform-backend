
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// GET: Lista todos os templates de uma caixa
export async function GET(request: NextRequest, { params }: { params: Promise<{ inboxId: string }> }) {
  const { inboxId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const templates = await db.template.findMany({
      where: { inboxId: inboxId },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        language: true,
      },
      orderBy: { name: 'asc' },
    });

    // Formatar para o formato esperado pelo frontend
    const formattedTemplates = templates.map(template => ({
      id: template.id,
      name: template.name,
    }));

    return NextResponse.json(formattedTemplates);
  } catch (error) {
    console.error(`Erro ao buscar templates:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST: Cria ou atualiza um template
export async function POST(request: NextRequest, { params }: { params: Promise<{ inboxId: string }> }) {
  const { inboxId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    // Simplificando os campos por agora
    const { id, name, category, components, language } = body;

    if (!name || !category || !components) {
      return NextResponse.json({ error: 'Nome, categoria e componentes são obrigatórios' }, { status: 400 });
    }

    const savedTemplate = await db.template.upsert({
      where: { id: id || '' },
      update: {
        name,
        type: category as any,
        simpleReplyText: components,
        language: language || 'pt_BR',
      },
      create: {
        name,
        type: category as any,
        simpleReplyText: components,
        language: language || 'pt_BR',
        inboxId: inboxId,
        createdById: session.user.id,
        status: 'APPROVED',
      },
    });

    return NextResponse.json(savedTemplate, { status: 201 });
  } catch (error) {
    console.error(`Erro ao criar/atualizar template:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
