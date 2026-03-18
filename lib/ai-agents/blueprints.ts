import { Prisma, AiAgentType, LinkedColumn, AiProvider } from "@prisma/client";
import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

const BLUEPRINT_CACHE_TTL_MS = 60_000;

type BlueprintCacheEntry = {
	value: AgentBlueprint | null;
	expiresAt: number;
};

const blueprintRuntimeCache = new Map<string, BlueprintCacheEntry>();

function getBlueprintCacheKey(linkedColumn: LinkedColumn, provider?: AiProvider): string {
	return provider ? `${linkedColumn}:${provider}` : linkedColumn;
}

function readBlueprintCache(linkedColumn: LinkedColumn, provider?: AiProvider): AgentBlueprint | null | undefined {
	const key = getBlueprintCacheKey(linkedColumn, provider);
	const cached = blueprintRuntimeCache.get(key);
	if (!cached) return undefined;
	if (cached.expiresAt <= Date.now()) {
		blueprintRuntimeCache.delete(key);
		return undefined;
	}
	return cached.value;
}

function writeBlueprintCache(linkedColumn: LinkedColumn, value: AgentBlueprint | null, provider?: AiProvider): AgentBlueprint | null {
	blueprintRuntimeCache.set(getBlueprintCacheKey(linkedColumn, provider), {
		value,
		expiresAt: Date.now() + BLUEPRINT_CACHE_TTL_MS,
	});
	return value;
}

export function invalidateAgentBlueprintCache(linkedColumn?: LinkedColumn | null): void {
	if (!linkedColumn) {
		blueprintRuntimeCache.clear();
		return;
	}

	for (const key of blueprintRuntimeCache.keys()) {
		if (key === linkedColumn || key.startsWith(`${linkedColumn}:`)) {
			blueprintRuntimeCache.delete(key);
		}
	}
}

export interface AgentToolConfig {
	key: string;
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	defaults?: Record<string, unknown>;
}

export interface OutputParserConfig {
	schemaType: "json_schema" | "zod" | "structured";
	name?: string;
	description?: string;
	schema: string;
	strict?: boolean;
	autoFixFormat?: boolean;
}

export interface AgentCanvasState {
	nodes: unknown[];
	edges: unknown[];
	viewport?: Record<string, unknown>;
}

export interface AgentBlueprintPayload {
	name: string;
	description?: string;
	agentType: AiAgentType;
	icon?: string;
	model: string;
	temperature?: number | null;
	topP?: number | null;
	maxOutputTokens?: number | null;
	systemPrompt?: string | null;
	instructions?: string | null;
	toolset?: AgentToolConfig[] | null;
	outputParser?: OutputParserConfig | null;
	memory?: Record<string, unknown> | null;
	canvasState?: AgentCanvasState | null;
	metadata?: Record<string, unknown> | null;
	// Engine Híbrida: vinculação de agente a coluna da tabela
	linkedColumn?: LinkedColumn | null;
	defaultProvider?: AiProvider | null;
	// Reasoning / Thinking
	thinkingLevel?: string | null;
	reasoningEffort?: string | null;
}

export interface AgentBlueprint extends AgentBlueprintPayload {
	id: string;
	ownerId: string;
	linkedColumn?: LinkedColumn | null;
	defaultProvider?: AiProvider | null;
	createdAt: Date;
	updatedAt: Date;
}

const selectBlueprint = {
	id: true,
	ownerId: true,
	name: true,
	description: true,
	agentType: true,
	icon: true,
	model: true,
	temperature: true,
	topP: true,
	maxOutputTokens: true,
	systemPrompt: true,
	instructions: true,
	toolset: true,
	outputParser: true,
	memory: true,
	canvasState: true,
	metadata: true,
	linkedColumn: true,
	defaultProvider: true,
	thinkingLevel: true,
	reasoningEffort: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.AiAgentBlueprintSelect;

type RawBlueprint = Prisma.AiAgentBlueprintGetPayload<{ select: typeof selectBlueprint }>;

function asJson<T>(value: Prisma.JsonValue | null | undefined): T | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as T;
		} catch {
			return null;
		}
	}
	return value as T;
}

function serializeJson(value: unknown): Prisma.InputJsonValue | undefined {
	if (value === null || value === undefined) return undefined;
	return value as Prisma.InputJsonValue;
}

function mapBlueprint(raw: RawBlueprint): AgentBlueprint {
	return {
		id: raw.id,
		ownerId: raw.ownerId,
		name: raw.name,
		description: raw.description ?? undefined,
		agentType: raw.agentType,
		icon: raw.icon ?? undefined,
		model: raw.model,
		temperature: raw.temperature ?? undefined,
		topP: raw.topP ?? undefined,
		maxOutputTokens: raw.maxOutputTokens ?? undefined,
		systemPrompt: raw.systemPrompt ?? undefined,
		instructions: raw.instructions ?? undefined,
		toolset: asJson<AgentToolConfig[]>(raw.toolset) ?? undefined,
		outputParser: asJson<OutputParserConfig>(raw.outputParser) ?? undefined,
		memory: asJson<Record<string, unknown>>(raw.memory) ?? undefined,
		canvasState: asJson<AgentCanvasState>(raw.canvasState) ?? undefined,
		metadata: asJson<Record<string, unknown>>(raw.metadata) ?? undefined,
		linkedColumn: raw.linkedColumn ?? undefined,
		defaultProvider: raw.defaultProvider ?? undefined,
		thinkingLevel: raw.thinkingLevel ?? undefined,
		reasoningEffort: raw.reasoningEffort ?? undefined,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
	};
}

function ensureAgentType(agentType: string | AiAgentType): AiAgentType {
	if (Object.values(AiAgentType).includes(agentType as AiAgentType)) {
		return agentType as AiAgentType;
	}
	return AiAgentType.CUSTOM;
}

export async function listAgentBlueprints(ownerId: string): Promise<AgentBlueprint[]> {
	const rows = await prisma.aiAgentBlueprint.findMany({
		where: { ownerId },
		orderBy: { updatedAt: "desc" },
		select: selectBlueprint,
	});
	return rows.map(mapBlueprint);
}

export async function getAgentBlueprint(ownerId: string, id: string): Promise<AgentBlueprint | null> {
	const row = await prisma.aiAgentBlueprint.findFirst({
		where: { ownerId, id },
		select: selectBlueprint,
	});
	return row ? mapBlueprint(row) : null;
}

export async function createAgentBlueprint(ownerId: string, payload: AgentBlueprintPayload): Promise<AgentBlueprint> {
	const data: Prisma.AiAgentBlueprintCreateArgs["data"] = {
		ownerId,
		name: payload.name,
		description: payload.description ?? null,
		agentType: ensureAgentType(payload.agentType),
		icon: payload.icon ?? null,
		model: payload.model,
		temperature: payload.temperature ?? null,
		topP: payload.topP ?? null,
		maxOutputTokens: payload.maxOutputTokens ?? null,
		systemPrompt: payload.systemPrompt ?? null,
		instructions: payload.instructions ?? null,
		toolset: serializeJson(payload.toolset) ?? Prisma.JsonNull,
		outputParser: serializeJson(payload.outputParser) ?? Prisma.JsonNull,
		memory: serializeJson(payload.memory) ?? Prisma.JsonNull,
		canvasState: serializeJson(payload.canvasState) ?? Prisma.JsonNull,
		metadata: serializeJson(payload.metadata) ?? Prisma.JsonNull,
		linkedColumn: payload.linkedColumn ?? null,
		defaultProvider: payload.defaultProvider ?? null,
		thinkingLevel: payload.thinkingLevel ?? null,
		reasoningEffort: payload.reasoningEffort ?? null,
	};

	const created = await prisma.aiAgentBlueprint.create({ data, select: selectBlueprint });
	invalidateAgentBlueprintCache(payload.linkedColumn ?? null);
	return mapBlueprint(created);
}

export async function updateAgentBlueprint(
	ownerId: string,
	id: string,
	payload: Partial<AgentBlueprintPayload>,
): Promise<AgentBlueprint | null> {
	const existing = await prisma.aiAgentBlueprint.findFirst({ where: { ownerId, id } });
	if (!existing) return null;

	const data: Prisma.AiAgentBlueprintUpdateArgs["data"] = {};

	if (payload.name !== undefined) data.name = payload.name;
	if (payload.description !== undefined) data.description = payload.description;
	if (payload.agentType !== undefined) data.agentType = ensureAgentType(payload.agentType);
	if (payload.icon !== undefined) data.icon = payload.icon;
	if (payload.model !== undefined) data.model = payload.model;
	if (payload.temperature !== undefined) data.temperature = payload.temperature;
	if (payload.topP !== undefined) data.topP = payload.topP;
	if (payload.maxOutputTokens !== undefined) data.maxOutputTokens = payload.maxOutputTokens;
	if (payload.systemPrompt !== undefined) data.systemPrompt = payload.systemPrompt;
	if (payload.instructions !== undefined) data.instructions = payload.instructions;
	if (payload.toolset !== undefined) data.toolset = serializeJson(payload.toolset) ?? Prisma.JsonNull;
	if (payload.outputParser !== undefined) data.outputParser = serializeJson(payload.outputParser) ?? Prisma.JsonNull;
	if (payload.memory !== undefined) data.memory = serializeJson(payload.memory) ?? Prisma.JsonNull;
	if (payload.canvasState !== undefined) data.canvasState = serializeJson(payload.canvasState) ?? Prisma.JsonNull;
	if (payload.metadata !== undefined) data.metadata = serializeJson(payload.metadata) ?? Prisma.JsonNull;
	if (payload.linkedColumn !== undefined) data.linkedColumn = payload.linkedColumn;
	if (payload.defaultProvider !== undefined) data.defaultProvider = payload.defaultProvider;
	if (payload.thinkingLevel !== undefined) data.thinkingLevel = payload.thinkingLevel;
	if (payload.reasoningEffort !== undefined) data.reasoningEffort = payload.reasoningEffort;

	const updated = await prisma.aiAgentBlueprint.update({
		where: { id: existing.id },
		data,
		select: selectBlueprint,
	});

	invalidateAgentBlueprintCache(existing.linkedColumn ?? payload.linkedColumn ?? null);
	if (payload.linkedColumn && payload.linkedColumn !== existing.linkedColumn) {
		invalidateAgentBlueprintCache(payload.linkedColumn);
	}

	return mapBlueprint(updated);
}

export async function deleteAgentBlueprint(ownerId: string, id: string): Promise<boolean> {
	const existing = await prisma.aiAgentBlueprint.findFirst({ where: { ownerId, id }, select: { id: true, linkedColumn: true } });
	if (!existing) return false;
	await prisma.aiAgentBlueprint.delete({ where: { id: existing.id } });
	invalidateAgentBlueprintCache(existing.linkedColumn ?? null);
	return true;
}

// ============================================================================
// ENGINE HÍBRIDA: Funções para busca de agentes por coluna vinculada
// ============================================================================

/**
 * Busca o blueprint ativo vinculado a uma coluna específica.
 * Prioridade: 1) Blueprint com linkedColumn definido, 2) Fallback por nome/metadata
 */
export async function getAgentBlueprintByLinkedColumn(linkedColumn: LinkedColumn): Promise<AgentBlueprint | null> {
	const cached = readBlueprintCache(linkedColumn);
	if (cached !== undefined) {
		return cached;
	}

	// 1) Buscar por linkedColumn diretamente
	const directMatch = await prisma.aiAgentBlueprint.findFirst({
		where: { linkedColumn },
		orderBy: { updatedAt: "desc" },
		select: selectBlueprint,
	});

	if (directMatch) {
		return writeBlueprintCache(linkedColumn, mapBlueprint(directMatch));
	}

	// 2) Fallback: buscar por metadata ou nome (compatibilidade com agentes existentes)
	const roleMap: Record<LinkedColumn, string> = {
		PROVA_CELL: "transcriber",
		ESPELHO_CELL: "mirror_extractor",
		ANALISE_CELL: "analyzer",
		RECURSO_CELL: "resource_generator",
		ESPELHO_PADRAO_CELL: "rubric_extractor",
	};
	const namePatterns: Record<LinkedColumn, string[]> = {
		PROVA_CELL: ["Transcrição", "Transcricao", "Transcritor", "Prova"],
		ESPELHO_CELL: ["Espelho", "Mirror", "Extrator"],
		ANALISE_CELL: ["Análise", "Analise", "Analyzer"],
		RECURSO_CELL: ["Recurso", "Resource"],
		ESPELHO_PADRAO_CELL: ["Espelho Padrão", "Gabarito", "Rubric Extractor"],
	};

	const role = roleMap[linkedColumn];
	const patterns = namePatterns[linkedColumn] || [];

	const fallback = await prisma.aiAgentBlueprint.findFirst({
		where: {
			OR: [
				// Buscar por role na metadata
				...(role ? [{ metadata: { path: ["role"], equals: role } }] : []),
				// Buscar por padrões de nome
				...patterns.map((pattern) => ({
					name: { contains: pattern, mode: "insensitive" as const },
				})),
			],
		},
		orderBy: { updatedAt: "desc" },
		select: selectBlueprint,
	});

	return writeBlueprintCache(linkedColumn, fallback ? mapBlueprint(fallback) : null);
}

/**
 * Busca blueprint vinculado a uma coluna E com defaultProvider específico.
 * Usado para respeitar a seleção do usuário no frontend (GPT vs Gemini).
 */
export async function getAgentBlueprintByLinkedColumnAndProvider(
	linkedColumn: LinkedColumn,
	provider: AiProvider,
): Promise<AgentBlueprint | null> {
	const cached = readBlueprintCache(linkedColumn, provider);
	if (cached !== undefined) {
		return cached;
	}

	const directMatch = await prisma.aiAgentBlueprint.findFirst({
		where: { linkedColumn, defaultProvider: provider },
		orderBy: { updatedAt: "desc" },
		select: selectBlueprint,
	});

	return writeBlueprintCache(linkedColumn, directMatch ? mapBlueprint(directMatch) : null, provider);
}

/**
 * Lista todos os blueprints disponíveis para uma coluna específica.
 */
export async function listAgentBlueprintsForColumn(linkedColumn: LinkedColumn): Promise<AgentBlueprint[]> {
	const rows = await prisma.aiAgentBlueprint.findMany({
		where: { linkedColumn },
		orderBy: { updatedAt: "desc" },
		select: selectBlueprint,
	});
	return rows.map(mapBlueprint);
}

/**
 * Verifica se um modelo é do Gemini (para injeção de instruções técnicas)
 */
export function isGeminiModel(model: string): boolean {
	return model.toLowerCase().startsWith("gemini");
}

/**
 * Instruções técnicas para Gemini 3 com Agentic Vision
 * Injeta automaticamente quando o modelo selecionado é Gemini
 */
export const GEMINI_AGENTIC_VISION_INSTRUCTIONS = `
[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI 3 AGENTIC VISION]

Fase de Visão Ativa:
- Você TEM acesso à execução de código Python via a ferramenta 'code_execution'.
- É OBRIGATÓRIO: Se houver trechos de caligrafia ilegível, borrada ou duvidosa, você DEVE gerar e executar um script Python para:
  1. Recortar (crop) a área específica da imagem
  2. Aplicar zoom na região problemática
  3. Reanalisar com maior resolução
- Não tente adivinhar sem investigar. Use a ferramenta de execução de código para manipular a imagem.
- Para cada região duvidosa, execute o loop: Pensar → Agir (crop/zoom) → Observar → Decidir

Comportamento do "Escrivão":
1. Fase de Visão: Identifique todas as regiões de texto
2. Fase de Investigação: Para regiões difíceis, use code_execution para zoom
3. Fase de Transcrição: Transcreva 100% Ipsis Litteris - se o aluno errou, mantenha o erro
4. Fase de Verificação: Revise a transcrição final

IMPORTANTE: A precisão é mais importante que a velocidade. Investigue cada caractere duvidoso.
`.trim();
