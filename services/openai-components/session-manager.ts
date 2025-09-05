// services/openai-components/session-manager.ts
import OpenAI from "openai";
import { getRedisInstance } from "@/lib/connections";
import { AgentConfig, ChannelType } from "./types";

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
const LOCK_TTL_SECONDS = 5; // lock curto

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

async function setSessionPointer(key: string, value: string): Promise<void> {
  const redis = getRedisInstance?.();
  if (redis) {
    try {
      await redis.setex(key, SESSION_TTL_SECONDS, value);
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

  // Monta chave única: sessionId + model + hash(instructions + channel)
  const identity = `${params.agent.model}:${params.channel}:${params.agent.instructions || 'default'}`;
  const identityHash = hashShort(identity);
  const sessionKey = `session:${params.sessionId}:${identityHash}`;
  
  console.log("🔐 ENSURE SESSION - Chave da sessão:", sessionKey);
  
  const existing = await getSessionPointer(sessionKey);
  if (existing) {
    console.log("🔐 ENSURE SESSION - Sessão existente encontrada:", existing);
    return { responseId: existing, isNewSession: false };
  }

  console.log("🔐 ENSURE SESSION - Criando nova sessão...");

  const result = await withLock(sessionKey, async () => {
    // Double-check após adquirir lock
    const recheck = await getSessionPointer(sessionKey);
    if (recheck) {
      console.log("🔐 ENSURE SESSION - Sessão criada durante lock:", recheck);
      return { responseId: recheck, isNewSession: false };
    }

    // Cria sessão inicial com OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    try {
      const init = await client.responses.create(
        {
          model: params.agent.model,
          input: [
            { role: "developer", content: createMasterPrompt(params.channel) },
            { role: "developer", content: params.agent.instructions || "Você é um assistente especializado." },
          ],
          store: true,
        },
        { signal } as any
      );

      const responseId = init.id;
      await setSessionPointer(sessionKey, responseId);
      console.log(`🔐 ENSURE SESSION - Criada nova sessão: ${sessionKey} -> ${responseId}`);
      return { responseId, isNewSession: true };
    } catch (error) {
      console.error(`🔐 ENSURE SESSION - Erro ao criar sessão ${sessionKey}:`, error);
      return { responseId: undefined, isNewSession: true }; // Erro = tratado como nova sessão
    }
  });

  return result;
}

export async function updateSessionPointer(
  sessionId: string,
  model: string,
  channel: ChannelType,
  instructions: string,
  newResponseId: string
): Promise<void> {
  const identity = `${model}:${channel}:${instructions || 'default'}`;
  const identityHash = hashShort(identity);
  const sessionKey = `session:${sessionId}:${identityHash}`;
  
  await setSessionPointer(sessionKey, newResponseId);
}