/**
 * Intelligent Intent Classification System for SocialWise Flow
 * Implements embedding-first classification with performance bands and degradation strategies
 * (versão multi-vetor: centroide + aliases do Redis, fallback DB)
 * 
 * Alteração solicitada:
 * - A banda LOW foi removida e substituída pela banda ROUTER (strategy: "router_llm").
 * - Quando score for insuficiente, ou não houver candidatos, ou ocorrer degradação/erro,
 *   roteamos para o Router LLM em vez de sugerir tópicos fixos.
 */

import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { embeddingGenerator } from "@/lib/ai-integration/services/embedding-generator";
import { createLogger } from "@/lib/utils/logger";
import { IntentCandidate, AgentConfig } from "@/services/openai";

import {
  selectDegradationStrategy,
  shouldDegrade,
  determineFailurePoint,
  DegradationContext,
} from "./degradation-strategies";

// -----------------------------
// Config & Consts
// -----------------------------
const classificationLogger = createLogger("SocialWise-Classification");
const OPENAI_EMBED_MODEL = "text-embedding-3-small"; // 1536 dims

// Legal keywords that should force SOFT band even with low embedding scores
const LEGAL_KEYWORDS = [
  "mandado de segurança", "ms",
  "habeas corpus", "habeas data",
  "recurso", "recurso de multa", "multa de trânsito", "detran",
  "indenização", "ação judicial", "processo", "petição", "liminar",
  "direito", "advogado", "justiça", "tribunal", "juiz",
  "código", "lei", "constituição", "estatuto"
];

/**
 * Check if text contains legal keywords that should promote to SOFT band
 */
function checkLegalKeywords(text: string): boolean {
  const t = (text || "").toLowerCase();
  return LEGAL_KEYWORDS.some(k => t.includes(k));
}

// -----------------------------
// Types
// -----------------------------
export interface ClassificationResult {
  band: "HARD" | "SOFT" | "ROUTER";
  score: number;
  candidates: IntentCandidate[];
  strategy:
    | "direct_map"
    | "warmup_buttons"
    | "domain_topics"
    | "router_llm"
    | "direct_map_degraded"
    | "warmup_buttons_degraded"
    | "domain_topics_degraded"
    | "domain_topics_error";
  metrics: {
    embedding_ms?: number;
    llm_warmup_ms?: number;
    route_total_ms: number;
  };
}

export interface EmbeddingSearchResult {
  intent: string;
  score: number;
  description?: string;
  metadata?: Record<string, any>;
}

interface ScoredIntent {
  slug: string;
  name: string;
  desc: string;
  score: number;
  threshold: number;
  meta?: Record<string, any>;
}

// -----------------------------
// Math & Normalization helpers
// -----------------------------
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function l2norm(v: number[]) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; }
function l2normalize(v: number[]) { const n = l2norm(v); return v.map(x => x / n); }

/** Normalização idêntica à da rota (para casar vetores) */
function normalizeText(t: string) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -----------------------------
// Embedding generation (HTTP direto, com timeout por chamada)
// -----------------------------
async function embedText(
  text: string,
  _timeoutMs = 1000 // mantemos a assinatura; o generator já tem timeout próprio
): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const emb = await embeddingGenerator.generateEmbedding(text, {
      normalize: true, trim: true, lowercase: true, removeExtraSpaces: true,
    });
    return l2normalize(emb.values); // ← HIT/MISS automaticamente cacheado no Redis
  } catch (error: any) {
    classificationLogger.warn("Embedding generation failed (cached path)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// -----------------------------
// Redis loaders (centroide + aliases) com fallback DB
// -----------------------------
type IntentRow = {
  id: string;
  name: string;
  description: string | null;
  similarityThreshold: number | null;
  embedding: number[] | null; // legado: centroide salvo no Postgres
};

async function loadIntentVectors(intent: IntentRow) {
  const redis = getRedisInstance();
  try {
    const key = `ai:intent:${intent.id}:emb`;
    const h = await redis.hgetall(key); // { model, centroid, aliases, aliases_text, updatedAt }
    if (h && h.centroid && h.aliases) {
      const centroid = JSON.parse(h.centroid) as number[];
      const aliases = JSON.parse(h.aliases) as number[][];
      const aliasTexts = h.aliases_text ? (JSON.parse(h.aliases_text) as string[]) : [];
      if (Array.isArray(centroid) && Array.isArray(aliases)) {
        return { centroid, aliases, aliasTexts, source: "redis" as const };
      }
    }
  } catch (e: any) {
    classificationLogger.warn("Failed to load vectors from Redis", {
      id: intent.id,
      err: e?.message || e,
    });
  }
  // Fallback para o vetor legado do DB (centroide)
  if (Array.isArray(intent.embedding) && intent.embedding.length) {
    return { centroid: intent.embedding as number[], aliases: [] as number[][], aliasTexts: [], source: "db" as const };
  }
  return null;
}

// -----------------------------
// Keyword fallback (mantido para degradação)
// -----------------------------
function performKeywordMatching(
  userText: string,
  intents: IntentRow[]
): IntentCandidate[] {
  const text = userText.toLowerCase();
  const matches: Array<{ intent: IntentRow; score: number }> = [];

  for (const intent of intents) {
    let score = 0;
    const name = (intent.name || "").toLowerCase();
    const desc = (intent.description || "").toLowerCase();

    const keywords = [...name.split(/\s+/), ...desc.split(/\s+/)].filter(k => k.length > 2);
    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 0.1;
    }
    if (text.includes(name)) score += 0.3;

    if (score > 0) matches.push({ intent, score });
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => ({
      slug: m.intent.name,
      name: m.intent.name,
      desc: m.intent.description || "",
      score: Math.min(m.score, 0.6),
    }));
}

// -----------------------------
// Embedding search (multi-vetor + degradação)
// -----------------------------
async function searchSimilarIntents(
  userText: string,
  userId: string,
  embeddingTimeoutMs?: number,
  context?: { channelType: string; inboxId: string; traceId?: string }
): Promise<{ candidates: IntentCandidate[]; searchMs: number; degraded?: boolean }> {
  const t0 = Date.now();
  const prisma = getPrismaInstance();

  try {
    // Intents ativas com *algum* embedding salvo (DB) para o usuário
    const intents: IntentRow[] = await (prisma as any).intent.findMany({
      where: { createdById: userId, isActive: true, embedding: { not: null } },
      select: { id: true, name: true, description: true, similarityThreshold: true, embedding: true },
    });

    if (!intents.length) {
      return { candidates: [], searchMs: Date.now() - t0 };
    }

    // 0) Alias direct hit: evita chamada de embedding quando a frase contém um alias
    const normText = normalizeText(userText);
    let bestHit: { intent: IntentRow; alias: string } | null = null;
    for (const it of intents) {
      const pack = await loadIntentVectors(it);
      if (!pack || !Array.isArray(pack.aliasTexts) || !pack.aliasTexts.length) continue;
      for (const a of pack.aliasTexts) {
        const na = normalizeText(a);
        if (na && normText.includes(na)) {
          if (!bestHit || na.length > normalizeText(bestHit.alias).length) {
            bestHit = { intent: it, alias: a };
          }
        }
      }
    }
    if (bestHit) {
      classificationLogger.info("Alias direct hit (no embedding call)", {
        intent: bestHit.intent.name,
        alias: bestHit.alias,
      });
      return {
        candidates: [{
          slug: bestHit.intent.name,
          name: bestHit.intent.name,
          desc: bestHit.intent.description || "",
          score: 0.95, // confiança alta por match textual
          threshold: typeof bestHit.intent.similarityThreshold === "number"
            ? bestHit.intent.similarityThreshold : 0.8,
        }],
        searchMs: Date.now() - t0,
        degraded: false,
      };
    }

    // 1) (somente se não bateu alias) gerar embedding da query
    const timeoutMs = embeddingTimeoutMs || 1500;
    const qVec = await embedText(userText, timeoutMs);

    if (!qVec) {
      classificationLogger.warn("Embedding generation failed, using keyword fallback", {
        userText: userText.substring(0, 50),
        userId,
        traceId: context?.traceId,
      });
      const keywordCandidates = performKeywordMatching(userText, intents);
      return { candidates: keywordCandidates, searchMs: Date.now() - t0, degraded: true };
    }

    const scored: ScoredIntent[] = [];
    for (const it of intents) {
      const pack = await loadIntentVectors(it);
      if (!pack) continue;

      const centroid = pack.centroid;
      const aliases = pack.aliases || [];

      let base = cosineSimilarity(qVec, centroid);
      let aliasMax = -Infinity;
      let aliasIdx = -1;

      for (let i = 0; i < aliases.length; i++) {
        const s = cosineSimilarity(qVec, aliases[i]);
        if (s > aliasMax) {
          aliasMax = s;
          aliasIdx = i;
        }
      }

      const score = Math.max(base, aliasMax);
      scored.push({
        slug: it.name,
        name: it.name,
        desc: it.description || "",
        score: isFinite(score) ? score : 0,
        threshold: typeof it.similarityThreshold === "number" ? it.similarityThreshold : 0.8,
        meta: {
          source: (pack as any).source,
          base,
          aliasMax: isFinite(aliasMax) ? aliasMax : undefined,
          aliasIdx: aliasIdx >= 0 ? aliasIdx : undefined,
        }
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const searchMs = Date.now() - t0;

    if (scored.length) {
      const top = scored[0];
      classificationLogger.info("Embedding search completed", {
        userText: userText.substring(0, 50),
        candidatesFound: scored.length,
        topScore: top.score,
        searchMs,
      });
      classificationLogger.debug("Top candidate meta", top.meta);
    }

    const candidates: IntentCandidate[] = scored.slice(0, 5).map(s => ({
      slug: s.slug,
      name: s.name,
      desc: s.desc,
      score: s.score,
      threshold: s.threshold,
    }));

    return { candidates, searchMs };
  } catch (error) {
    classificationLogger.error("Embedding search failed", {
      error: error instanceof Error ? error.message : String(error),
      traceId: context?.traceId,
    });

    if (shouldDegrade(error) && context) {
      const degradationContext: DegradationContext = {
        userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined,
      };
      classificationLogger.info("Applying degradation strategy for embedding search failure", {
        failurePoint: degradationContext.failurePoint,
        traceId: context.traceId,
      });
    }

    return { candidates: [], searchMs: Date.now() - t0, degraded: true };
  }
}

// -----------------------------
// Public API (bands + degradation)
// -----------------------------
export async function classifyIntentEmbeddingFirst(
  userText: string,
  userId: string,
  agent: AgentConfig,
  context?: { channelType: string; inboxId: string; traceId?: string }
): Promise<ClassificationResult> {
  const startTime = Date.now();

  try {
    // Step 1: Embedding search with degradation support
    const { candidates, searchMs, degraded } = await searchSimilarIntents(
      userText,
      userId,
      agent.warmupDeadlineMs, // usar timeout configurável do assistente
      context
    );

    // -----------------------------
    // Alteração: SEMPRE rotear para ROUTER quando não houver intenção forte
    // -----------------------------
    if (candidates.length === 0) {
      // Nenhum candidato → route to router (em vez de LOW/domain_topics)
      return {
        band: "ROUTER",
        score: 0,
        candidates: [],
        strategy: "router_llm",
        metrics: { embedding_ms: searchMs, route_total_ms: Date.now() - startTime },
      };
    }

    const topCandidate = candidates[0];
    const score = typeof topCandidate?.score === "number" ? topCandidate.score : 0;

    // Ajuste de thresholds conforme modo
    const scoreThresholds = degraded
      ? { hard: 0.5, soft: 0.3 }     // keyword fallback
      : { hard: 0.8, soft: 0.65 };   // embedding normal

    // HARD band permanece igual
    if (score >= scoreThresholds.hard) {
      return {
        band: "HARD",
        score,
        candidates: [topCandidate],
        strategy: degraded ? "direct_map_degraded" : "direct_map",
        metrics: { embedding_ms: searchMs, route_total_ms: Date.now() - startTime },
      };
    }

    // SOFT band (warmup buttons) permanece igual
    if (score >= scoreThresholds.soft) {
      return {
        band: "SOFT",
        score,
        candidates: candidates.slice(0, 3),
        strategy: degraded ? "warmup_buttons_degraded" : "warmup_buttons",
        metrics: { embedding_ms: searchMs, route_total_ms: Date.now() - startTime },
      };
    }

    // Promotion por palavras-chave legais continua existindo
    const hasLegalKeywords = checkLegalKeywords(userText);
    if (hasLegalKeywords && score >= 0.4) {
      classificationLogger.info("Legal keywords detected - promoting to SOFT band", {
        userText: userText.substring(0, 50),
        score,
        traceId: context?.traceId
      });
      return {
        band: "SOFT",
        score: Math.max(score, 0.65),
        candidates: candidates.slice(0, 3),
        strategy: degraded ? "warmup_buttons_degraded" : "warmup_buttons",
        metrics: { embedding_ms: searchMs, route_total_ms: Date.now() - startTime },
      };
    }

    // Caso contrário → ROUTER (substitui LOW)
    return {
      band: "ROUTER",
      score,
      candidates: candidates.slice(0, 3), // passa hints para o Router LLM se desejarem
      strategy: "router_llm",
      metrics: { embedding_ms: searchMs, route_total_ms: Date.now() - startTime },
    };
  } catch (error) {
    classificationLogger.error("Classification failed", {
      error: error instanceof Error ? error.message : String(error),
      traceId: context?.traceId,
    });

    if (shouldDegrade(error) && context) {
      const degradationContext: DegradationContext = {
        userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined,
      };
      classificationLogger.info("Classification failed, routing to Router LLM", {
        failurePoint: degradationContext.failurePoint,
        traceId: context.traceId,
      });
    }

    // Em erro → também ROUTER
    return {
      band: "ROUTER",
      score: 0,
      candidates: [],
      strategy: "router_llm",
      metrics: { embedding_ms: 0, route_total_ms: Date.now() - startTime },
    };
  }
}

/**
 * Router LLM classification for embedipreview=false mode
 * (Mantido; pode ser usado quando você quiser bypassar embeddings)
 */
export async function classifyIntentRouterLLM(
  userText: string,
  agent: AgentConfig
): Promise<ClassificationResult> {
  const startTime = Date.now();
  return {
    band: "ROUTER",
    score: 1.0,
    candidates: [],
    strategy: "router_llm",
    metrics: { route_total_ms: Date.now() - startTime },
  };
}

/**
 * Main classification entry point with degradation support
 */
export async function classifyIntent(
  userText: string,
  userId: string,
  agent: AgentConfig,
  embedipreview = true,
  context?: { channelType: string; inboxId: string; traceId?: string }
): Promise<ClassificationResult> {
  if (!embedipreview) {
    return classifyIntentRouterLLM(userText, agent);
  }
  return classifyIntentEmbeddingFirst(userText, userId, agent, context);
}
