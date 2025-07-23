import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// GET: Lista todos os mapeamentos de uma caixa de entrada
export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const mapeamentos = await db.mapeamentoIntencao.findMany({
      where: { caixaEntradaId: caixaId },
      include: {
        // New unified template system
        unifiedTemplate: { 
          select: { 
            id: true, 
            name: true, 
            type: true, 
            description: true,
            isActive: true 
          } 
        },
        // Legacy support during transition
        template: { select: { id: true, name: true } },
        mensagemInterativa: { select: { id: true, nome: true } },
        // New interactive message system
        interactiveMessage: { select: { id: true, name: true } },
      },
      orderBy: { intentName: 'asc' },
    });

    return NextResponse.json(mapeamentos);
  } catch (error) {
    console.error('Erro ao buscar mapeamentos:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST: Cria ou atualiza um mapeamento
export async function POST(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id: mappingId, intentName, templateId, mensagemInterativaId, interactiveMessageId, unifiedTemplateId } = body;

    // Count how many response types are provided
    const responseCount = [templateId, mensagemInterativaId, interactiveMessageId, unifiedTemplateId].filter(Boolean).length;

    if (!intentName || responseCount === 0) {
      return NextResponse.json({ error: 'Intenção e uma resposta (template unificado, template legado ou mensagem) são obrigatórios.' }, { status: 400 });
    }
    
    if (responseCount > 1) {
        return NextResponse.json({ error: 'Escolha apenas uma resposta: template unificado, template legado ou mensagem interativa.' }, { status: 400 });
    }

    const data = {
      intentName,
      caixaEntradaId: caixaId,
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