/**
 * Intelligent Intent Classification System for SocialWise Flow
 * Implements embedding-first classification with performance bands and degradation strategies
 */

import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import { IntentCandidate, AgentConfig } from "@/services/openai";

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
import {
  selectDegradationStrategy,
  shouldDegrade,
  determineFailurePoint,
  DegradationContext,
} from "./degradation-strategies";

const classificationLogger = createLogger("SocialWise-Classification");

export interface ClassificationResult {
  band: "HARD" | "SOFT" | "LOW" | "ROUTER";
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
}

/**
 * Cosine similarity calculation for embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
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

/**
 * Generate embedding for text using OpenAI API with timeout and degradation
 */
async function embedText(
  text: string,
  timeoutMs = 1000 // Reduzido de 2000ms para 1000ms
): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536, // Reduzir dimensões para acelerar
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      classificationLogger.warn("Embedding API error", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data: any = await response.json();
    const embedding: any = data?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? (embedding as number[]) : null;
  } catch (error: any) {
    clearTimeout(timeout);

    if (error.name === "AbortError") {
      classificationLogger.warn("Embedding generation timed out", {
        timeoutMs,
      });
    } else {
      classificationLogger.warn("Embedding generation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

/**
 * Search for similar intents using embeddings with degradation support
 */
async function searchSimilarIntents(
  userText: string,
  userId: string,
  embeddingTimeoutMs?: number,
  context?: { channelType: string; inboxId: string; traceId?: string }
): Promise<{
  candidates: IntentCandidate[];
  searchMs: number;
  degraded?: boolean;
}> {
  const startTime = Date.now();

  try {
    const prisma = getPrismaInstance();

    // Get user's active intents with embeddings
    const intents = await (prisma as any).intent.findMany({
      where: {
        createdById: userId,
        isActive: true,
        embedding: { not: null },
      },
      select: {
        id: true,
        name: true,
        description: true,
        similarityThreshold: true,
        embedding: true,
      },
    });

    const candidates = intents.filter(
      (i: any) => Array.isArray(i.embedding) && i.embedding.length > 0
    );

    if (candidates.length === 0) {
      return { candidates: [], searchMs: Date.now() - startTime };
    }

    // Generate embedding for user text with configurable timeout
    const timeoutMs = embeddingTimeoutMs || 1500; // Default 1.5s if not specified
    const queryEmbedding = await embedText(userText, timeoutMs);

    if (!queryEmbedding) {
      // Degradation: Embedding failed, use keyword-based fallback
      classificationLogger.warn(
        "Embedding generation failed, using keyword fallback",
        {
          userText: userText.substring(0, 50),
          userId,
          traceId: context?.traceId,
        }
      );

      const keywordCandidates = performKeywordMatching(userText, candidates);
      return {
        candidates: keywordCandidates,
        searchMs: Date.now() - startTime,
        degraded: true,
      };
    }

    // Calculate similarities and sort by score
    const scored: ScoredIntent[] = candidates
      .map((intent: any): ScoredIntent => {
        const score = cosineSimilarity(
          queryEmbedding,
          intent.embedding as number[]
        );
        const threshold =
          typeof intent.similarityThreshold === "number"
            ? intent.similarityThreshold
            : 0.8;

        return {
          slug: intent.name,
          name: intent.name,
          desc: intent.description,
          score,
          threshold,
        };
      })
      .sort((a: ScoredIntent, b: ScoredIntent) => b.score - a.score);

    const searchMs = Date.now() - startTime;

    classificationLogger.info("Embedding search completed", {
      userText: userText.substring(0, 50),
      candidatesFound: scored.length,
      topScore: scored[0]?.score || 0,
      searchMs,
    });

    return { candidates: scored.slice(0, 5), searchMs };
  } catch (error) {
    classificationLogger.error("Embedding search failed", {
      error: error instanceof Error ? error.message : String(error),
      traceId: context?.traceId,
    });

    // Apply degradation strategy if error should be degraded
    if (shouldDegrade(error) && context) {
      const degradationContext: DegradationContext = {
        userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined,
      };

      classificationLogger.info(
        "Applying degradation strategy for embedding search failure",
        {
          failurePoint: degradationContext.failurePoint,
          traceId: context.traceId,
        }
      );
    }

    return { candidates: [], searchMs: Date.now() - startTime, degraded: true };
  }
}

/**
 * Keyword-based fallback matching when embeddings fail
 */
function performKeywordMatching(
  userText: string,
  intents: any[]
): IntentCandidate[] {
  const text = userText.toLowerCase();
  const matches: Array<{ intent: any; score: number }> = [];

  for (const intent of intents) {
    let score = 0;
    const name = (intent.name || "").toLowerCase();
    const desc = (intent.description || "").toLowerCase();

    // Simple keyword matching
    const keywords = [...name.split(/\s+/), ...desc.split(/\s+/)].filter(
      (k) => k.length > 2
    );

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 0.1;
      }
    }

    // Boost score for exact name matches
    if (text.includes(name)) {
      score += 0.3;
    }

    if (score > 0) {
      matches.push({ intent, score });
    }
  }

  // Sort by score and convert to IntentCandidate format
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((match) => ({
      slug: match.intent.name,
      name: match.intent.name,
      desc: match.intent.description,
      score: Math.min(match.score, 0.6), // Cap keyword matching scores
    }));
}

/**
 * Classify intent using embedding-first approach with performance bands and degradation
 */
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
      agent.warmupDeadlineMs, // 🔧 CORREÇÃO: Usar timeout configurável do assistente
      context
    );

    if (candidates.length === 0) {
      return {
        band: "LOW",
        score: 0,
        candidates: [],
        strategy: degraded ? "domain_topics_degraded" : "domain_topics",
        metrics: {
          embedding_ms: searchMs,
          route_total_ms: Date.now() - startTime,
        },
      };
    }

    const topCandidate = candidates[0];
    const score =
      typeof topCandidate?.score === "number" ? topCandidate.score : 0;

    // Adjust score bands if using degraded keyword matching
    const scoreThresholds = degraded
      ? { hard: 0.5, soft: 0.3 } // Lower thresholds for keyword matching
      : { hard: 0.8, soft: 0.65 }; // Normal thresholds for embedding similarity

    // Step 2: Determine performance band based on score
    if (score >= scoreThresholds.hard) {
      // HARD band: Direct mapping with optional microcopy
      return {
        band: "HARD",
        score,
        candidates: [topCandidate],
        strategy: degraded ? "direct_map_degraded" : "direct_map",
        metrics: {
          embedding_ms: searchMs,
          route_total_ms: Date.now() - startTime,
        },
      };
    } else if (score >= scoreThresholds.soft) {
      // SOFT band: Aquecimento com Botões
      return {
        band: "SOFT",
        score,
        candidates: candidates.slice(0, 3), // Top 3 for warmup buttons
        strategy: degraded ? "warmup_buttons_degraded" : "warmup_buttons",
        metrics: {
          embedding_ms: searchMs,
          route_total_ms: Date.now() - startTime,
        },
      };
    } else {
      // Check for legal keywords promotion to SOFT band
      const hasLegalKeywords = checkLegalKeywords(userText);
      
      if (hasLegalKeywords && score >= 0.4) { // Lower threshold for legal keywords
        classificationLogger.info("Legal keywords detected - promoting to SOFT band", {
          userText: userText.substring(0, 50),
          score,
          traceId: context?.traceId
        });
        
        return {
          band: "SOFT",
          score: Math.max(score, 0.65), // Boost score for legal keywords
          candidates: candidates.slice(0, 3),
          strategy: degraded ? "warmup_buttons_degraded" : "warmup_buttons",
          metrics: {
            embedding_ms: searchMs,
            route_total_ms: Date.now() - startTime,
          },
        };
      }
      
      // LOW band: Domain topics suggestion
      return {
        band: "LOW",
        score,
        candidates: candidates.slice(0, 3),
        strategy: degraded ? "domain_topics_degraded" : "domain_topics",
        metrics: {
          embedding_ms: searchMs,
          route_total_ms: Date.now() - startTime,
        },
      };
    }
  } catch (error) {
    classificationLogger.error("Classification failed", {
      error: error instanceof Error ? error.message : String(error),
      traceId: context?.traceId,
    });

    // Apply degradation strategy for classification failures
    if (shouldDegrade(error) && context) {
      const degradationContext: DegradationContext = {
        userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined,
      };

      classificationLogger.info(
        "Classification failed, using degradation strategy",
        {
          failurePoint: degradationContext.failurePoint,
          traceId: context.traceId,
        }
      );
    }

    return {
      band: "LOW",
      score: 0,
      candidates: [],
      strategy: "domain_topics_error",
      metrics: {
        embedding_ms: 0,
        route_total_ms: Date.now() - startTime,
      },
    };
  }
}

/**
 * Router LLM classification for embedipreview=false mode
 */
export async function classifyIntentRouterLLM(
  userText: string,
  agent: AgentConfig
): Promise<ClassificationResult> {
  const startTime = Date.now();

  return {
    band: "ROUTER",
    score: 1.0, // Router always has full confidence in its decision
    candidates: [],
    strategy: "router_llm",
    metrics: {
      route_total_ms: Date.now() - startTime,
    },
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
