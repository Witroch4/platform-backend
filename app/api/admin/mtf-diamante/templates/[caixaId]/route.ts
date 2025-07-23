
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// GET: Lista todos os templates de uma caixa
export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const templates = await db.whatsAppTemplate.findMany({
      where: { caixaEntradaId: caixaId },
      select: {
        id: true,
        templateId: true,
        name: true,
        status: true,
        category: true,
        language: true,
      },
      orderBy: { name: 'asc' },
    });

    // Formatar para o formato esperado pelo frontend
    const formattedTemplates = templates.map(template => ({
      id: template.templateId,
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
    // Simplificando os campos por agora
    const { id, name, category, components, language } = body;

    if (!name || !category || !components) {
      return NextResponse.json({ error: 'Nome, categoria e componentes são obrigatórios' }, { status: 400 });
    }
    
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
        where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
        return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    const savedTemplate = await db.whatsAppTemplate.upsert({
      where: { id: id || '' },
      update: {
        name,
        category,
        components,
        language: language || 'pt_BR',
      },
      create: {
        name,
        category,
        components,
        language: language || 'pt_BR',
        caixaEntradaId: caixaId,
        usuarioChatwitId: usuarioChatwit.id,
        // Campos obrigatórios com valores padrão
        templateId: `local_${new Date().getTime()}`,
        status: 'APPROVED',
      },
    });

    return NextResponse.json(savedTemplate, { status: 201 });
  } catch (error) {
    console.error(`Erro ao criar/atualizar template:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
