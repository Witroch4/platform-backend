// services/openai-components/session-manager.ts
import OpenAI from "openai";
import { getRedisInstance } from "@/lib/connections";
import { AgentConfig, ChannelType } from "../types";

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
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const SESSION_TTL_DEV_SECONDS = 30; // 30 segundos para devs
const LOCK_TTL_SECONDS = 5; // lock curto

// Session IDs dos desenvolvedores para TTL reduzido
const DEV_SESSION_IDS = new Set([
  "9296550493690812",
  "1002859634954741", 
  "558597550136"
]);

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

async function setSessionPointer(key: string, value: string, sessionId?: string): Promise<void> {
  // Determinar TTL baseado se é dev ou não
  const isDevSession = sessionId && DEV_SESSION_IDS.has(sessionId);
  const ttl = isDevSession ? SESSION_TTL_DEV_SECONDS : SESSION_TTL_SECONDS;
  
  if (isDevSession) {
    console.log(`🔧 DEV SESSION: Usando TTL de ${SESSION_TTL_DEV_SECONDS}s para sessionId ${sessionId}`);
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
  signal?: AbortSignal
): Promise<SessionEnsureResult> {
  // 🔍 DEBUG: Log ensureSession início
  console.log("🔐 ENSURE SESSION - Iniciando:", {
    sessionId: params.sessionId,
    model: params.agent.model,
    channel: params.channel,
    hasInstructions: !!params.agent.instructions
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
  newResponseId: string
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


