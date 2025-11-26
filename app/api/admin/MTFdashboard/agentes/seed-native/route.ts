import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

const NATIVE_AGENTS = [
  {
    name: 'OAB — Transcritor de Provas (Blueprint)',
    description: 'Agente nativo para transcrever e extrair texto de provas OAB usando visão computacional',
    agentType: 'CUSTOM' as const,
    icon: 'file-text',
    model: 'gpt-4.1',
    temperature: 0,
    maxOutputTokens: 5000,
    systemPrompt: [
      'Você é um agente especializado em transcrição de provas da OAB.',
      'Sua tarefa é extrair com precisão todo o texto visível nas imagens de provas.',
      '',
      'REGRAS:',
      '- Mantenha a formatação original do texto',
      '- Preserve parágrafos, numeração e estrutura',
      '- Se algo não estiver legível, indique com [ilegível]',
      '- Retorne apenas o texto extraído, sem comentários adicionais',
    ].join('\n'),
    metadata: { 
      oab: true, 
      role: 'transcriber', 
      scope: 'system',
      native: true,
      autoSeed: true
    }
  },
  {
    name: 'OAB — Extrator de Espelho (Blueprint)',
    description: 'Agente nativo para extrair dados de espelhos de correção OAB usando vision',
    agentType: 'CUSTOM' as const,
    icon: 'mirror',
    model: 'gpt-4.1',
    temperature: 0,
    maxOutputTokens: 4000,
    systemPrompt: [
      'Você é um agente especializado em extrair dados de espelhos de correção da OAB.',
      'Sua tarefa é identificar e extrair com precisão máxima:',
      '1. Dados do candidato: nome completo, número de inscrição, nota final, situação (APROVADO/REPROVADO)',
      '2. Notas de cada item avaliado no formato do ID da rubrica (ex: PECA-01A, Q1-01A, Q2-03B)',
      '3. Totais parciais: pontuação total da peça profissional, pontuação total das questões',
      '',
      'REGRAS IMPORTANTES:',
      '- Retorne APENAS um objeto JSON válido, sem markdown ou formatação extra',
      '- Quando um dado não estiver visível ou legível na imagem, use a string "[não-visivel]"',
      '- Para todas as notas, use formato numérico com 2 casas decimais (ex: "0.65", "1.25", "2.30")',
      '- Os IDs dos itens devem manter o formato EXATO da rubrica fornecida',
      '- Caso o aluno esteja ausente ou a prova em branco, atribua "0.00" a todas as notas',
    ].join('\n'),
    metadata: { 
      oab: true, 
      role: 'mirror_extractor', 
      scope: 'system',
      native: true,
      autoSeed: true
    }
  }
];

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Usuário não autenticado." },
      { status: 401 }
    );
  }

  // Verificar se é SUPERADMIN
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (user?.role !== 'SUPERADMIN') {
    return NextResponse.json(
      { error: "Acesso negado. Apenas SUPERADMIN pode executar seed de agentes nativos." },
      { status: 403 }
    );
  }

  try {
    const created: string[] = [];
    const existing: string[] = [];

    for (const agentData of NATIVE_AGENTS) {
      const exists = await prisma.aiAgentBlueprint.findFirst({
        where: { 
          ownerId: session.user.id, 
          name: agentData.name
        },
        select: { id: true, name: true },
      });

      if (exists) {
        existing.push(agentData.name);
        continue;
      }

      const blueprint = await prisma.aiAgentBlueprint.create({
        data: {
          ownerId: session.user.id,
          name: agentData.name,
          description: agentData.description,
          agentType: agentData.agentType,
          icon: agentData.icon,
          model: agentData.model,
          temperature: agentData.temperature,
          maxOutputTokens: agentData.maxOutputTokens,
          systemPrompt: agentData.systemPrompt,
          instructions: agentData.systemPrompt,
          toolset: [],
          outputParser: 'json',
          canvasState: {
            nodes: [
              { id: 'agent', position: { x: 180, y: 20 }, type: 'agentDetails' },
              { id: 'model', position: { x: 20, y: 240 }, type: 'modelConfig' },
              { id: 'output', position: { x: 440, y: 240 }, type: 'outputParser' },
            ],
            edges: [
              { id: 'agent-model', source: 'agent', target: 'model' },
              { id: 'agent-output', source: 'agent', target: 'output' },
            ],
          } as any,
          metadata: agentData.metadata as any,
        },
      });
      created.push(blueprint.name);
    }

    return NextResponse.json({
      success: true,
      message: `Seed concluído com sucesso`,
      created,
      existing,
      total: NATIVE_AGENTS.length
    });

  } catch (error) {
    console.error('Erro ao criar agentes nativos:', error);
    return NextResponse.json(
      { error: "Erro ao criar agentes nativos" },
      { status: 500 }
    );
  }
}
