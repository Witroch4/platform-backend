import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { AiAgentType, LinkedColumn, AiProvider } from '@prisma/client';
import {
  AgentBlueprintPayload,
  AgentToolConfig,
  OutputParserConfig,
  listAgentBlueprints,
  createAgentBlueprint,
  getAgentBlueprint,
} from '@/lib/ai-agents/blueprints';

function unauthorized() {
  return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
}

function coerceAgentType(value: unknown): AiAgentType {
  if (typeof value !== 'string') {
    return AiAgentType.CUSTOM;
  }
  const upper = value.toUpperCase() as keyof typeof AiAgentType;
  if (upper in AiAgentType) {
    return AiAgentType[upper];
  }
  return AiAgentType.CUSTOM;
}

function coerceLinkedColumn(value: unknown): LinkedColumn | null {
  if (value === null || value === undefined || value === '_none') return null;
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase() as keyof typeof LinkedColumn;
  if (upper in LinkedColumn) {
    return LinkedColumn[upper];
  }
  return null;
}

function coerceAiProvider(value: unknown): AiProvider | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase() as keyof typeof AiProvider;
  if (upper in AiProvider) {
    return AiProvider[upper];
  }
  return null;
}

function parseMaybeJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

async function readPayload(request: NextRequest): Promise<AgentBlueprintPayload | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return null;

  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  const model = typeof body['model'] === 'string' ? body['model'].trim() : '';
  const agentType = coerceAgentType(body['agentType']);

  if (!name || !model) return null;

  let toolset: AgentToolConfig[] | null = [];
  if ('toolset' in body) {
    if (body['toolset'] === null) {
      toolset = null;
    } else {
      const parsed = parseMaybeJson<AgentToolConfig[]>(body['toolset']);
      if (parsed === undefined) return null;
      toolset = parsed;
    }
  }

  let outputParser = undefined as OutputParserConfig | null | undefined;
  if ('outputParser' in body) {
    if (body['outputParser'] === null) {
      outputParser = null;
    } else {
      const parsed = parseMaybeJson<OutputParserConfig>(body['outputParser']);
      if (parsed === undefined) return null;
      outputParser = parsed;
    }
  }

  let memory = undefined as Record<string, unknown> | null | undefined;
  if ('memory' in body) {
    if (body['memory'] === null) {
      memory = null;
    } else {
      const parsed = parseMaybeJson<Record<string, unknown>>(body['memory']);
      if (parsed === undefined) return null;
      memory = parsed;
    }
  }

  let canvasState = undefined as any;
  if ('canvasState' in body) {
    if (body['canvasState'] === null) {
      canvasState = null;
    } else {
      const parsed = parseMaybeJson<any>(body['canvasState']);
      if (parsed === undefined) return null;
      canvasState = parsed;
    }
  }

  let metadata = undefined as Record<string, unknown> | null | undefined;
  if ('metadata' in body) {
    if (body['metadata'] === null) {
      metadata = null;
    } else {
      const parsed = parseMaybeJson<Record<string, unknown>>(body['metadata']);
      if (parsed === undefined) return null;
      metadata = parsed;
    }
  }

  // Engine Híbrida: linkedColumn e defaultProvider
  const linkedColumn = 'linkedColumn' in body ? coerceLinkedColumn(body['linkedColumn']) : undefined;
  const defaultProvider = 'defaultProvider' in body ? coerceAiProvider(body['defaultProvider']) : undefined;

  const payload: AgentBlueprintPayload = {
    name,
    description: typeof body['description'] === 'string' ? body['description'].trim() : undefined,
    agentType,
    icon: typeof body['icon'] === 'string' ? body['icon'] : undefined,
    model,
    temperature: typeof body['temperature'] === 'number' ? body['temperature'] : undefined,
    topP: typeof body['topP'] === 'number' ? body['topP'] : undefined,
    maxOutputTokens: typeof body['maxOutputTokens'] === 'number' ? body['maxOutputTokens'] : undefined,
    systemPrompt: typeof body['systemPrompt'] === 'string' ? body['systemPrompt'] : undefined,
    instructions: typeof body['instructions'] === 'string' ? body['instructions'] : undefined,
    toolset,
    outputParser,
    memory,
    canvasState,
    metadata,
    linkedColumn,
    defaultProvider,
  };

  return payload;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const blueprint = await getAgentBlueprint(session.user.id, id);
    if (!blueprint) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }
    return NextResponse.json({ blueprint });
  }

  const blueprints = await listAgentBlueprints(session.user.id);
  return NextResponse.json({ blueprints });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  try {
    const blueprint = await createAgentBlueprint(session.user.id, payload);
    return NextResponse.json({ blueprint }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar blueprint de agente', error);
    return NextResponse.json({ error: 'Não foi possível criar o agente' }, { status: 500 });
  }
}
