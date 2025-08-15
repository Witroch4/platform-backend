/**
 * Intelligent Intent Classification System for SocialWise Flow
 * Implements embedding-first classification with score band logic and Router LLM fallback
 */

import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';
import { getRedisInstance } from '@/lib/connections';

const classificationLogger = createLogger('SocialWise-Classification');

// ===== INTERFACES =====

interface IntentWithEmbedding {
  id: string;
  name: string;
  description: string | null;
  embedding: number[] | null;
  similarityThreshold?: number | null;
}

export interface IntentCandidate {
  slug: string;
  name: string;
  description: string;
  score: number;
  shortTitle?: string;
}

export interface ClassificationResult {
  band: 'HARD' | 'SOFT' | 'LOW';
  score: number;
  candidates: IntentCandidate[];
  strategy: 'direct_map' | 'warmup_buttons' | 'domain_topics';
  embeddingMs?: number;
  cacheHit?: boolean;
}

export interface RouterDecision {
  mode: 'intent' | 'chat';
  intent_payload?: string;
  introduction_text?: string;
  buttons?: Array<{
    title: string;
    payload: string;
  }>;
  text?: string;
}

export interface ClassificationConfig {
  hardThreshold: number; // ≥0.80
  softThreshold: number; // ≥0.65
  maxCandidates: number; // Default: 5
  cacheEmbeddingsTtl: number; // Default: 24h in seconds
  cacheClassificationTtl: number; // Default: 10m in seconds
  embeddingTimeout: number; // Default: 2000ms
}

export interface AgentClassificationConfig {
  embedipreview: boolean; // true = embedding-first, false = LLM-first
  model: string;
  developer?: string;
  instructions?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high';
  tempSchema?: number; // Temperature for structured outputs
  tempCopy?: number; // Temperature for microcopy
}

// ===== CONSTANTS =====

const DEFAULT_CONFIG: ClassificationConfig = {
  hardThreshold: 0.80,
  softThreshold: 0.65,
  maxCandidates: 5,
  cacheEmbeddingsTtl: 24 * 60 * 60, // 24 hours
  cacheClassificationTtl: 10 * 60, // 10 minutes
  embeddingTimeout: 2000, // 2 seconds
};

const DEFAULT_AGENT_CONFIG: AgentClassificationConfig = {
  embedipreview: true,
  model: 'gpt-4o-mini',
  reasoningEffort: 'minimal',
  verbosity: 'low',
  tempSchema: 0.1,
  tempCopy: 0.4,
};

// ===== UTILITY FUNCTIONS =====

/**
 * Normalizes text for consistent embedding and caching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Creates a hash for cache keys (simple implementation)
 */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  const minLength = Math.min(a.length, b.length);
  
  for (let i = 0; i < minLength; i++) {
    const valA = a[i] || 0;
    const valB = b[i] || 0;
    
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Executes operation with timeout and abort signal
 */
async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    classificationLogger.warn(`Operation aborted after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  try {
    const result = await operation(controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError' || controller.signal.aborted) {
      classificationLogger.warn(`Operation timed out after ${timeoutMs}ms`);
      return null;
    }
    throw error;
  }
}

// ===== EMBEDDING FUNCTIONS =====

/**
 * Gets embedding for text using OpenAI API with caching
 */
async function getEmbedding(
  text: string,
  config: ClassificationConfig,
  cacheKey?: string
): Promise<{ embedding: number[] | null; fromCache: boolean; durationMs: number }> {
  const startTime = Date.now();
  const redis = getRedisInstance();
  
  // Try cache first if key provided
  if (cacheKey && redis) {
    try {
      const cached = await redis.get(`emb:${cacheKey}`);
      if (cached) {
        const embedding = JSON.parse(cached);
        if (Array.isArray(embedding) && embedding.length > 0) {
          return {
            embedding,
            fromCache: true,
            durationMs: Date.now() - startTime
          };
        }
      }
    } catch (error) {
      classificationLogger.warn('Cache read error for embedding:', error);
    }
  }

  // Get fresh embedding with timeout
  const embedding = await withTimeout(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data?.data?.[0]?.embedding || null;
  }, config.embeddingTimeout);

  const durationMs = Date.now() - startTime;

  // Cache the result if successful and cache key provided
  if (embedding && cacheKey && redis) {
    try {
      await redis.setex(
        `emb:${cacheKey}`,
        config.cacheEmbeddingsTtl,
        JSON.stringify(embedding)
      );
    } catch (error) {
      classificationLogger.warn('Cache write error for embedding:', error);
    }
  }

  return {
    embedding,
    fromCache: false,
    durationMs
  };
}

/**
 * Pre-warms embeddings for all intents in an inbox
 */
export async function prewarmEmbeddings(
  inboxId: string,
  userId?: string,
  config: ClassificationConfig = DEFAULT_CONFIG
): Promise<{ processed: number; cached: number; errors: number }> {
  const prisma = getPrismaInstance();
  let processed = 0;
  let cached = 0;
  let errors = 0;

  try {
    // Get all active intents for the user/inbox
    const intents: IntentWithEmbedding[] = await (prisma as any).intent.findMany({
      where: {
        createdById: userId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        embedding: true,
      },
    });

    classificationLogger.info(`Pre-warming embeddings for ${intents.length} intents`, {
      inboxId,
      userId,
      intentCount: intents.length
    });

    for (const intent of intents) {
      try {
        processed++;
        
        // Skip if already has embedding
        if (Array.isArray(intent.embedding) && intent.embedding.length > 0) {
          cached++;
          continue;
        }

        // Generate embedding for intent description or name
        const text = intent.description || intent.name || '';
        if (!text.trim()) continue;

        const normalizedText = normalizeText(text);
        const cacheKey = `${hashText(normalizedText)}:${inboxId}`;
        
        const result = await getEmbedding(normalizedText, config, cacheKey);
        
        if (result.embedding) {
          // Update intent with embedding
          await (prisma as any).intent.update({
            where: { id: intent.id },
            data: { embedding: result.embedding },
          });
          
          if (result.fromCache) cached++;
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        classificationLogger.error(`Error pre-warming embedding for intent ${intent.id}:`, error);
      }
    }

    classificationLogger.info('Pre-warming completed', {
      inboxId,
      processed,
      cached,
      errors
    });

    return { processed, cached, errors };
  } catch (error) {
    classificationLogger.error('Error in pre-warming embeddings:', error);
    return { processed, cached, errors };
  }
}

// ===== CLASSIFICATION FUNCTIONS =====

/**
 * Performs embedding-first classification with score band logic
 */
export async function classifyWithEmbeddings(
  userText: string,
  inboxId: string,
  userId?: string,
  config: ClassificationConfig = DEFAULT_CONFIG
): Promise<ClassificationResult | null> {
  const startTime = Date.now();
  
  try {
    const prisma = getPrismaInstance();
    const redis = getRedisInstance();
    
    // Normalize input text
    const normalizedText = normalizeText(userText);
    if (!normalizedText.trim()) {
      return null;
    }

    // Check classification cache first
    const classificationCacheKey = `classify:${hashText(normalizedText)}:${inboxId}`;
    if (redis) {
      try {
        const cached = await redis.get(classificationCacheKey);
        if (cached) {
          const result = JSON.parse(cached);
          result.cacheHit = true;
          result.embeddingMs = Date.now() - startTime;
          return result;
        }
      } catch (error) {
        classificationLogger.warn('Classification cache read error:', error);
      }
    }

    // Get user's active intents with embeddings
    const intents: IntentWithEmbedding[] = await (prisma as any).intent.findMany({
      where: {
        createdById: userId,
        isActive: true,
        embedding: { not: null },
      },
      select: {
        id: true,
        name: true,
        description: true,
        embedding: true,
        similarityThreshold: true,
      },
    });

    if (intents.length === 0) {
      classificationLogger.info('No intents with embeddings found', { inboxId, userId });
      return null;
    }

    // Get embedding for user text
    const embeddingCacheKey = `${hashText(normalizedText)}:${inboxId}`;
    const embeddingResult = await getEmbedding(normalizedText, config, embeddingCacheKey);
    
    if (!embeddingResult.embedding) {
      classificationLogger.warn('Failed to get embedding for user text', { userText: normalizedText });
      return null;
    }

    // Calculate similarities and create candidates
    const candidates: IntentCandidate[] = intents
      .map((intent: IntentWithEmbedding) => {
        const score = cosineSimilarity(embeddingResult.embedding!, intent.embedding as number[]);
        return {
          slug: intent.name,
          name: intent.name,
          description: intent.description || '',
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, config.maxCandidates);

    // Determine score band and strategy
    const topScore = candidates[0]?.score || 0;
    let band: 'HARD' | 'SOFT' | 'LOW';
    let strategy: 'direct_map' | 'warmup_buttons' | 'domain_topics';

    if (topScore >= config.hardThreshold) {
      band = 'HARD';
      strategy = 'direct_map';
    } else if (topScore >= config.softThreshold) {
      band = 'SOFT';
      strategy = 'warmup_buttons';
    } else {
      band = 'LOW';
      strategy = 'domain_topics';
    }

    const result: ClassificationResult = {
      band,
      score: topScore,
      candidates,
      strategy,
      embeddingMs: Date.now() - startTime,
      cacheHit: false,
    };

    // Cache the classification result
    if (redis) {
      try {
        await redis.setex(
          classificationCacheKey,
          config.cacheClassificationTtl,
          JSON.stringify(result)
        );
      } catch (error) {
        classificationLogger.warn('Classification cache write error:', error);
      }
    }

    classificationLogger.info('Classification completed', {
      band,
      strategy,
      topScore: topScore.toFixed(4),
      candidatesCount: candidates.length,
      embeddingMs: result.embeddingMs,
      fromCache: embeddingResult.fromCache
    });

    return result;
  } catch (error) {
    classificationLogger.error('Error in embedding classification:', error);
    return null;
  }
}

/**
 * Router LLM for embedipreview=false mode
 * Makes LLM-first decision between intent and chat modes
 */
export async function routerLLM(
  userText: string,
  agent: AgentClassificationConfig,
  timeoutMs: number = 3000
): Promise<RouterDecision | null> {
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      classificationLogger.warn('No OpenAI API key available for Router LLM');
      return null;
    }
    const systemPrompt = `You are a conversational router for a legal chatbot assistant.

Your task is to decide whether the user's message should be:
1. "intent" - Route to specific legal service/intent
2. "chat" - Engage in open conversation to understand needs better

INSTRUCTIONS:
- If the user mentions specific legal terms, services, or clear requests → use "intent" mode
- If the user is vague, greeting, or needs clarification → use "chat" mode
- For "intent" mode: provide intent_payload (e.g., "@mandado_seguranca") and optional buttons
- For "chat" mode: provide engaging text response and helpful buttons

${agent.developer ? `\nAgent Context:\n${agent.developer}` : ''}
${agent.instructions ? `\nSpecific Instructions:\n${agent.instructions}` : ''}

Respond with valid JSON only:
{
  "mode": "intent" | "chat",
  "intent_payload": "@intent_name" (only for intent mode),
  "introduction_text": "friendly response text",
  "buttons": [{"title": "Button Text", "payload": "@intent_or_action"}],
  "text": "conversational response" (only for chat mode)
}`;

    const response = await withTimeout(async (signal) => {
      const apiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: agent.model,
          instructions: systemPrompt,
          input: [
            {
              role: 'user',
              content: [{ type: 'text', text: userText }],
            },
          ],
          stream: false,
          store: false,
          temperature: agent.tempSchema || 0.1,
          reasoning: agent.reasoningEffort ? { effort: agent.reasoningEffort } : undefined,
        }),
        signal,
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        classificationLogger.error(`Router LLM API error: ${apiResponse.status} - ${errorText}`);
        throw new Error(`Router LLM API error: ${apiResponse.status}`);
      }

      return await apiResponse.json();
    }, timeoutMs);

    if (!response) {
      classificationLogger.warn('Router LLM timed out');
      return null;
    }

    // Extract response text from various possible formats
    let outputText = '';
    
    if (response.output_text) {
      outputText = response.output_text;
    } else if (response.output && Array.isArray(response.output)) {
      // Handle array format: output[0].content[*]
      const firstOutput = response.output[0];
      if (firstOutput?.content && Array.isArray(firstOutput.content)) {
        const textContent = firstOutput.content.find((c: any) => 
          c.type === 'output_text' || c.type === 'text'
        );
        if (textContent?.text) {
          outputText = textContent.text;
        } else if (textContent?.value) {
          outputText = textContent.value;
        }
      }
    } else if (response.choices && Array.isArray(response.choices)) {
      // Handle OpenAI chat completion format
      const firstChoice = response.choices[0];
      if (firstChoice?.message?.content) {
        outputText = firstChoice.message.content;
      }
    }

    if (!outputText) {
      classificationLogger.warn('No output text from Router LLM');
      return null;
    }

    // Parse JSON response
    try {
      const decision = JSON.parse(outputText) as RouterDecision;
      
      // Validate required fields
      if (!decision.mode || !['intent', 'chat'].includes(decision.mode)) {
        throw new Error('Invalid mode in router decision');
      }

      classificationLogger.info('Router LLM decision', {
        mode: decision.mode,
        hasIntentPayload: !!decision.intent_payload,
        hasButtons: !!decision.buttons?.length,
        hasText: !!decision.text
      });

      return decision;
    } catch (parseError) {
      classificationLogger.error('Failed to parse Router LLM JSON response:', {
        error: parseError,
        rawOutput: outputText
      });
      return null;
    }
  } catch (error) {
    classificationLogger.error('Error in Router LLM:', error);
    return null;
  }
}

/**
 * Main classification entry point that handles both embedding-first and LLM-first modes
 */
export async function classifyIntent(
  userText: string,
  inboxId: string,
  userId?: string,
  agentConfig: AgentClassificationConfig = DEFAULT_AGENT_CONFIG,
  classificationConfig: ClassificationConfig = DEFAULT_CONFIG
): Promise<ClassificationResult | RouterDecision | null> {
  const startTime = Date.now();
  
  try {
    classificationLogger.info('Starting intent classification', {
      embedipreview: agentConfig.embedipreview,
      model: agentConfig.model,
      textLength: userText.length,
      inboxId,
      userId
    });

    if (agentConfig.embedipreview) {
      // Embedding-first mode
      const result = await classifyWithEmbeddings(
        userText,
        inboxId,
        userId,
        classificationConfig
      );
      
      if (result) {
        classificationLogger.info('Embedding classification completed', {
          band: result.band,
          strategy: result.strategy,
          score: result.score.toFixed(4),
          totalMs: Date.now() - startTime
        });
      }
      
      return result;
    } else {
      // LLM-first mode (Router LLM)
      const decision = await routerLLM(userText, agentConfig);
      
      if (decision) {
        classificationLogger.info('Router LLM completed', {
          mode: decision.mode,
          totalMs: Date.now() - startTime
        });
      }
      
      return decision;
    }
  } catch (error) {
    classificationLogger.error('Error in intent classification:', error);
    return null;
  }
}

// ===== CACHE MANAGEMENT =====

/**
 * Clears classification cache for specific inbox or globally
 */
export async function clearClassificationCache(inboxId?: string): Promise<number> {
  const redis = getRedisInstance();
  if (!redis) return 0;

  try {
    const pattern = inboxId ? `classify:*:${inboxId}` : 'classify:*';
    const keys = await redis.keys(pattern);
    
    if (keys.length === 0) return 0;
    
    await redis.del(...keys);
    
    classificationLogger.info('Classification cache cleared', {
      inboxId,
      keysDeleted: keys.length
    });
    
    return keys.length;
  } catch (error) {
    classificationLogger.error('Error clearing classification cache:', error);
    return 0;
  }
}

/**
 * Gets classification cache statistics
 */
export async function getClassificationCacheStats(inboxId?: string): Promise<{
  classificationKeys: number;
  embeddingKeys: number;
  totalSize: number;
}> {
  const redis = getRedisInstance();
  if (!redis) return { classificationKeys: 0, embeddingKeys: 0, totalSize: 0 };

  try {
    const classifyPattern = inboxId ? `classify:*:${inboxId}` : 'classify:*';
    const embeddingPattern = inboxId ? `emb:*:${inboxId}` : 'emb:*';
    
    const [classificationKeys, embeddingKeys] = await Promise.all([
      redis.keys(classifyPattern),
      redis.keys(embeddingPattern),
    ]);

    return {
      classificationKeys: classificationKeys.length,
      embeddingKeys: embeddingKeys.length,
      totalSize: classificationKeys.length + embeddingKeys.length,
    };
  } catch (error) {
    classificationLogger.error('Error getting cache stats:', error);
    return { classificationKeys: 0, embeddingKeys: 0, totalSize: 0 };
  }
}