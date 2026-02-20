// services/openai-components/session-manager.ts
import OpenAI from "openai";
import { getRedisInstance } from "@/lib/connections";
import { AgentConfig, ChannelType } from "../types";

// ============ CONVERSATION HISTORY STRATEGY ============
/**
 * Estratégia de gerenciamento de histórico de conversa:
 *
 * - "manual": Histórico salvo no Redis, reconstruído manualmente em cada chamada.
 *   Funciona com qualquer LLM (OpenAI, Gemini, Claude, Groq, etc.)
 *
 * - "openai_native": Usa previous_response_id da OpenAI Responses API.
 *   OpenAI gerencia contexto internamente, menos tokens enviados.
 *   SOMENTE funciona com OpenAI Responses API.
 */
export type HistoryStrategy = "manual" | "openai_native";

/**
 * Obtém a estratégia de histórico configurada via ENV.
 * Default: "manual" (compatível com qualquer LLM)
 */
export function getHistoryStrategy(): HistoryStrategy {
	// Support both new and old env var names (old name deprecated)
	const strategy = (process.env.OPENAI_HISTORY_STRATEGY || process.env.CONVERSATION_HISTORY_STRATEGY) as HistoryStrategy;
	if (strategy === "openai_native") {
		return "openai_native";
	}
	return "manual"; // default
}

/**
 * Verifica se deve usar o modo nativo da OpenAI (previous_response_id)
 */
export function isOpenAINativeStrategy(): boolean {
	return getHistoryStrategy() === "openai_native";
}

// Pequeno hash determinístico (FNV-1a) para derivar a sessão de (modelo+capitão)
function hashShort(s: string): string {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

const sessionState = new Map<string, string>(); // Fallback local — dev/CI
const historyState = new Map<string, ConversationMessage[]>(); // Fallback local para histórico
// Default TTL values (used when agent config is not available)
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const DEFAULT_SESSION_TTL_DEV_SECONDS = 30; // 30 segundos para devs (sessionPointer)
const HISTORY_TTL_DEV_SECONDS = 60 * 5; // 5 minutos para histórico em dev (mais tempo para testar)
const LOCK_TTL_SECONDS = 5; // lock curto
const MAX_HISTORY_MESSAGES = 20; // Limite de mensagens no histórico

// Session TTL configuration from agent
export interface SessionTtlConfig {
	sessionTtlSeconds?: number; // General TTL (default 24h)
	sessionTtlDevSeconds?: number; // Dev TTL (default 5min)
}

// Interface para mensagens do histórico de conversa
export interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

// Session IDs dos desenvolvedores para TTL reduzido
const DEV_SESSION_IDS = new Set(["9296550493690812", "1002859634954741", "558597550136"]);

async function getSessionPointer(key: string): Promise<string | undefined> {
	const redis = getRedisInstance?.();
	if (redis) {
		try {
			return await redis.get(key);
		} catch (error) {
			console.warn("Redis get failed, using fallback", error);
		}
	}
	return sessionState.get(key);
}

async function setSessionPointer(
	key: string,
	value: string,
	sessionId?: string,
	ttlConfig?: SessionTtlConfig,
): Promise<void> {
	// Determinar TTL baseado se é dev ou não + config do agente
	const isDevSession = sessionId && DEV_SESSION_IDS.has(sessionId);

	// Use agent config TTL if provided, otherwise use defaults
	const generalTtl = ttlConfig?.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
	const devTtl = ttlConfig?.sessionTtlDevSeconds ?? DEFAULT_SESSION_TTL_DEV_SECONDS;
	const ttl = isDevSession ? devTtl : generalTtl;

	if (isDevSession) {
		console.log(`🔧 DEV SESSION: Usando TTL de ${devTtl}s para sessionId ${sessionId} (config do agente)`);
	}

	const redis = getRedisInstance?.();
	if (redis) {
		try {
			await redis.setex(key, ttl, value);
		} catch (error) {
			console.warn("Redis set failed, using fallback", error);
		}
	}
	sessionState.set(key, value);
}

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const redis = getRedisInstance?.();
	if (!redis) return fn(); // sem Redis, executa direto

	const lockKey = `lock:${key}`;
	const ok = await redis.set(lockKey, "1", "NX", "EX", LOCK_TTL_SECONDS);
	if (!ok) {
		throw new Error(`Sessão ${key} em uso por outro processo`);
	}
	try {
		return await fn();
	} finally {
		await redis.del(lockKey);
	}
}

export interface SessionEnsureResult {
	responseId: string | undefined;
	isNewSession: boolean;
}

export interface SessionParams {
	sessionId: string;
	agent: AgentConfig;
	channel: ChannelType;
}

export async function ensureSession(
	params: SessionParams,
	createMasterPrompt: (channel: ChannelType) => string,
	signal?: AbortSignal,
): Promise<SessionEnsureResult> {
	// 🔍 DEBUG: Log ensureSession início
	console.log("🔐 ENSURE SESSION - Iniciando:", {
		sessionId: params.sessionId,
		model: params.agent.model,
		channel: params.channel,
		hasInstructions: !!params.agent.instructions,
	});

	// Chave única baseada apenas no sessionId do webhook
	const sessionKey = `session:${params.sessionId}`;

	console.log("🔐 ENSURE SESSION - Chave da sessão:", sessionKey);

	const existing = await getSessionPointer(sessionKey);
	if (existing) {
		console.log("🔐 ENSURE SESSION - Sessão existente encontrada:", existing);
		return { responseId: existing, isNewSession: false };
	}

	console.log("🚀 SINGLE-CALL OPTIMIZATION - Nova sessão, retornando undefined para single-call");
	// Para otimização single-call: não criar sessão prévia, deixar que seja criada na primeira chamada real
	return { responseId: undefined, isNewSession: true };
}

export async function updateSessionPointer(
	sessionId: string,
	model: string,
	channel: ChannelType,
	instructions: string,
	newResponseId: string,
): Promise<void> {
	const sessionKey = `session:${sessionId}`;
	await setSessionPointer(sessionKey, newResponseId, sessionId);
}

// Verifica se já há ponteiro de sessão para esse sessionId
export async function hasSessionPointer(sessionId: string): Promise<boolean> {
	const sessionKey = `session:${sessionId}`;
	const existing = await getSessionPointer(sessionKey);
	return !!existing;
}

// ============ GERENCIAMENTO DE HISTÓRICO DE CONVERSA ============

/**
 * Recupera o histórico de conversa de uma sessão.
 *
 * SEMPRE lê do Redis independente da estratégia (manual ou openai_native).
 * O Redis é a fonte universal de histórico — usado por qualquer modelo (OpenAI, Gemini, etc.)
 * No modo openai_native, a OpenAI TAMBÉM usa previous_response_id em paralelo.
 */
export async function getSessionHistory(
	sessionId: string,
	maxMessages: number = MAX_HISTORY_MESSAGES,
): Promise<ConversationMessage[]> {
	const historyKey = `sessionHistory:${sessionId}`;
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			const data = await redis.get(historyKey);
			if (data) {
				const history: ConversationMessage[] = JSON.parse(data);
				return history.slice(-maxMessages);
			}
		} catch (error) {
			console.warn("[SessionHistory] Redis get failed, using fallback:", error);
		}
	}

	// Fallback para memória local
	const localHistory = historyState.get(historyKey) ?? [];
	return localHistory.slice(-maxMessages);
}

/**
 * Adiciona uma mensagem ao histórico da sessão.
 *
 * SEMPRE salva no Redis independente da estratégia (manual ou openai_native).
 * O Redis é a fonte universal de histórico — garante que qualquer modelo
 * (incluindo modelos degradados como Gemini Flash) tenha acesso ao contexto.
 * No modo openai_native, a OpenAI TAMBÉM usa previous_response_id em paralelo.
 */
export async function appendToHistory(sessionId: string, message: ConversationMessage): Promise<void> {
	const historyKey = `sessionHistory:${sessionId}`;
	const isDevSession = DEV_SESSION_IDS.has(sessionId);
	// Histórico usa TTL maior que sessionPointer para persistir contexto
	const ttl = isDevSession ? HISTORY_TTL_DEV_SECONDS : DEFAULT_SESSION_TTL_SECONDS;

	// Recupera histórico existente (força busca direta, não usa getSessionHistory que verifica estratégia)
	let history = await getSessionHistoryDirect(sessionId, MAX_HISTORY_MESSAGES * 2);

	// Adiciona nova mensagem
	history.push(message);

	// Mantém apenas as últimas MAX_HISTORY_MESSAGES mensagens
	if (history.length > MAX_HISTORY_MESSAGES) {
		history = history.slice(-MAX_HISTORY_MESSAGES);
	}

	const redis = getRedisInstance?.();
	if (redis) {
		try {
			await redis.setex(historyKey, ttl, JSON.stringify(history));
			if (isDevSession) {
				console.log(`🔧 DEV SESSION HISTORY: Salvo ${history.length} mensagens com TTL ${ttl}s`);
			}
		} catch (error) {
			console.warn("[SessionHistory] Redis set failed, using fallback:", error);
		}
	}

	// Sempre atualiza fallback local também
	historyState.set(historyKey, history);
}

/**
 * Busca direta do histórico (ignora estratégia).
 * Usado internamente por appendToHistory no modo manual.
 */
async function getSessionHistoryDirect(
	sessionId: string,
	maxMessages: number = MAX_HISTORY_MESSAGES,
): Promise<ConversationMessage[]> {
	const historyKey = `sessionHistory:${sessionId}`;
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			const data = await redis.get(historyKey);
			if (data) {
				const history: ConversationMessage[] = JSON.parse(data);
				return history.slice(-maxMessages);
			}
		} catch (error) {
			console.warn("[SessionHistory] Redis get failed, using fallback:", error);
		}
	}

	const localHistory = historyState.get(historyKey) ?? [];
	return localHistory.slice(-maxMessages);
}

/**
 * Limpa o histórico de uma sessão
 */
export async function clearSessionHistory(sessionId: string): Promise<void> {
	const historyKey = `sessionHistory:${sessionId}`;
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			await redis.del(historyKey);
		} catch (error) {
			console.warn("[SessionHistory] Redis del failed:", error);
		}
	}

	historyState.delete(historyKey);
}

// ============ INTERACTIVE MESSAGE CONTEXT ============
/**
 * Armazena o contexto da última mensagem interativa enviada para uma sessão.
 * Usado para enriquecer interações subsequentes (cliques de botão ou texto digitado).
 */

// Default interactive context TTL (used when agent config not available)
const DEFAULT_INTERACTIVE_CONTEXT_TTL_SECONDS = 60 * 60; // 1 hora
const DEFAULT_INTERACTIVE_CONTEXT_TTL_DEV_SECONDS = 60 * 5; // 5 min para dev

export interface InteractiveMessageContext {
	bodyText: string;
	intentSlug?: string;
	timestamp: number;
	buttons?: Array<{ title: string; payload: string }>;
}

/**
 * Store interactive message context with configurable TTL from agent settings.
 * @param sessionId - The session identifier
 * @param context - The interactive message context to store
 * @param ttlConfig - Optional TTL configuration from agent (sessionTtlSeconds, sessionTtlDevSeconds)
 */
export async function storeInteractiveMessageContext(
	sessionId: string,
	context: InteractiveMessageContext,
	ttlConfig?: SessionTtlConfig,
): Promise<void> {
	const key = `session:${sessionId}:interactiveContext`;
	const isDevSession = DEV_SESSION_IDS.has(sessionId);

	// Use agent config TTL if provided, otherwise use defaults
	const generalTtl = ttlConfig?.sessionTtlSeconds ?? DEFAULT_INTERACTIVE_CONTEXT_TTL_SECONDS;
	const devTtl = ttlConfig?.sessionTtlDevSeconds ?? DEFAULT_INTERACTIVE_CONTEXT_TTL_DEV_SECONDS;
	const ttl = isDevSession ? devTtl : generalTtl;

	const redis = getRedisInstance?.();
	if (redis) {
		try {
			await redis.setex(key, ttl, JSON.stringify(context));
			if (isDevSession) {
				console.log(`🔧 DEV INTERACTIVE CONTEXT: Stored for ${sessionId} with TTL ${ttl}s (agent config)`);
			}
		} catch (error) {
			console.warn("[InteractiveContext] Redis set failed:", error);
		}
	}
}

export async function getInteractiveMessageContext(sessionId: string): Promise<InteractiveMessageContext | null> {
	const key = `session:${sessionId}:interactiveContext`;
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			const data = await redis.get(key);
			if (data) {
				return JSON.parse(data) as InteractiveMessageContext;
			}
		} catch (error) {
			console.warn("[InteractiveContext] Redis get failed:", error);
		}
	}

	return null;
}

export async function clearInteractiveMessageContext(sessionId: string): Promise<void> {
	const key = `session:${sessionId}:interactiveContext`;
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			await redis.del(key);
		} catch (error) {
			console.warn("[InteractiveContext] Redis del failed:", error);
		}
	}
}
