export type AgentTypeId = "TOOLS" | "OPENAI_FUNCTIONS" | "PLAN_AND_EXECUTE" | "REACT" | "CUSTOM";

// Engine Híbrida: tipos de coluna vinculada e provedor de IA
export type LinkedColumnType = "PROVA_CELL" | "ESPELHO_CELL" | "ANALISE_CELL" | "RECURSO_CELL";
export type AiProviderType = "OPENAI" | "GEMINI";

// Gemini 3: Níveis de raciocínio (thinkingLevel)
// - Flash: minimal, low, medium, high
// - Pro: low, high
export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

// OpenAI GPT-5+: Níveis de esforço de raciocínio (reasoningEffort)
// - gpt-5.1: none (padrão), low, medium, high
// - gpt-5-pro: apenas high
// - modelos após gpt-5.1-codex-max: inclui xhigh
export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentToolDefinition {
	key: string;
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
}

export interface OutputParserTemplate {
	id: string;
	name: string;
	schemaType: "json_schema" | "zod" | "structured";
	description?: string;
	schema: string;
}

export interface AgentTypeDescriptor {
	id: AgentTypeId;
	label: string;
	description: string;
	capabilities?: string[];
}

export interface AgentToolConfig {
	key: string;
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	defaults?: Record<string, unknown>;
	enabled?: boolean;
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
	nodes?: unknown[];
	edges?: unknown[];
	viewport?: Record<string, unknown>;
}

export interface AgentBlueprint {
	id: string;
	ownerId?: string;
	name: string;
	description?: string;
	agentType: AgentTypeId;
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
	// Engine Híbrida
	linkedColumn?: LinkedColumnType | null;
	defaultProvider?: AiProviderType | null;
	// Gemini 3: nível de raciocínio (minimal, low, medium, high)
	thinkingLevel?: GeminiThinkingLevel | null;
	// OpenAI GPT-5+: esforço de raciocínio (none, minimal, low, medium, high, xhigh)
	reasoningEffort?: OpenAIReasoningEffort | null;
	createdAt: string;
	updatedAt: string;
}

export interface AgentBlueprintDraft extends Omit<AgentBlueprint, "id" | "createdAt" | "updatedAt"> {
	id?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface AgentCatalogPayload {
	agentTypes: AgentTypeDescriptor[];
	tools: AgentToolDefinition[];
	models: Array<{ value: string; label: string }>;
	structuredOutputExamples: OutputParserTemplate[];
}
