
import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';

// GET: Lista todos os templates de uma caixa
export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const templates = await getPrismaInstance().template.findMany({
      where: { inboxId: caixaId },
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
export async function POST(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      name,
      type: rawType,
      text,
      language,
    } = body;

    if (!name || !text) {
      return NextResponse.json({ error: 'Nome e texto são obrigatórios' }, { status: 400 });
    }

    const type =
      rawType === 'template'
        ? 'WHATSAPP_OFFICIAL'
        : rawType === 'interactive_message'
          ? 'INTERACTIVE_MESSAGE'
          : rawType as 'WHATSAPP_OFFICIAL' | 'INTERACTIVE_MESSAGE' | 'AUTOMATION_REPLY';

    const savedTemplate = await getPrismaInstance().template.upsert({
      where: { id: id || '' },
      update: {
        name,
        type,
        simpleReplyText: text,
        language: language || 'pt_BR',
      },
      create: {
        name,
        type,
        simpleReplyText: text,
        language: language || 'pt_BR',
        inboxId: caixaId,
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
