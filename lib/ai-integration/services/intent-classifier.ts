/**
 * Intent Classification Service
 * Requirements: 3.1, 3.2, 3.3, 6.1
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { getPrismaInstance } from "@/lib/connections";
type PrismaClient = ReturnType<typeof getPrismaInstance>;
import { EmbeddingGenerator } from "./embedding-generator";
import { SimilaritySearchService } from "./similarity-search";
import { IntentClassificationResult } from "../types/intent";

import aiLogger from "../../log";

export interface IntentClassifierConfig {
  defaultThreshold: number;
  maxCandidates: number;
  enableMetrics: boolean;
  auditEnabled: boolean;
  auditTtlDays: number;
}

export interface ClassificationOptions {
  traceId?: string;
  accountId?: number;
  conversationId?: number;
  messageId?: string;
  customThreshold?: number;
  skipCache?: boolean;
}

export interface ClassificationMetrics {
  totalClassifications: number;
  successfulClassifications: number;
  rejectedByThreshold: number;
  averageLatency: number;
  cacheHitRate: number;
}

export class IntentClassifier {
  private embeddingGenerator: EmbeddingGenerator;
  private similaritySearch: SimilaritySearchService;
  private prisma: PrismaClient;
  private redis: Redis;
  private config: IntentClassifierConfig;

  constructor(
    embeddingGenerator: EmbeddingGenerator,
    similaritySearch: SimilaritySearchService,
    prisma: PrismaClient,
    redis: Redis,
    config: Partial<IntentClassifierConfig> = {}
  ) {
    this.embeddingGenerator = embeddingGenerator;
    this.similaritySearch = similaritySearch;
    this.prisma = prisma;
    this.redis = redis;
    this.config = {
      defaultThreshold: 0.8,
      maxCandidates: 10,
      enableMetrics: true,
      auditEnabled: true,
      auditTtlDays: 90,
      ...config,
    };
  }

  /**
   * Classify intent for given text
   */
  async classifyIntent(
    text: string,
    options: ClassificationOptions = {}
  ): Promise<IntentClassificationResult> {
    const startTime = Date.now();
    const {
      traceId,
      accountId,
      conversationId,
      messageId,
      customThreshold,
      skipCache = false,
    } = options;

    const threshold = customThreshold || this.config.defaultThreshold;

    try {
      // Step 1: Generate embedding for input text
      aiLogger.debug("Starting intent classification", {
        traceId,
        accountId,
        conversationId,
        messageId,
        textLength: text.length,
        threshold,
      });

      const embedding = await this.embeddingGenerator.generateEmbedding(text, {
        normalize: true,
        trim: true,
        lowercase: false,
        removeExtraSpaces: true
      });

      // Step 2: Perform similarity search
      const searchResult = await this.similaritySearch.searchSimilarIntents({
        embedding: embedding.values,
        threshold,
        limit: this.config.maxCandidates
      });

      // Step 3: Apply threshold-based decision making
      const bestMatch =
        searchResult.candidates.length > 0 ? searchResult.candidates[0] : null;
      const classified = !!bestMatch;

      const result: IntentClassificationResult = {
        intent: bestMatch?.name,
        score: bestMatch?.similarity || 0,
        candidates: searchResult.candidates.map((candidate) => ({
          name: candidate.name,
          similarity: candidate.similarity,
        })),
        threshold,
        classified,
      };

      const totalLatency = Date.now() - startTime;

      // Step 4: Log comprehensive audit trail
      if (this.config.auditEnabled && conversationId && messageId) {
        await this.createAuditLog({
          conversationId: conversationId.toString(),
          messageId: messageId.toString(),
          mode: "INTENT_CLASSIFY",
          inputText: this.maskPII(text),
          resultJson: result,
          score: result.score,
          traceId,
        });
      }

      // Step 5: Update metrics
      if (this.config.enableMetrics) {
        await this.updateMetrics({
          classified,
          latency: totalLatency,
          cached: false,
          traceId,
        });
      }

      aiLogger.info("Intent classification completed", {
        traceId,
        accountId,
        conversationId,
        messageId,
        classified,
        intentName: result.intent,
        score: result.score,
        candidatesFound: result.candidates.length,
        totalLatencyMs: totalLatency,
      });

      return result;
    } catch (error) {
      const totalLatency = Date.now() - startTime;

      aiLogger.error("Intent classification failed", {
        traceId,
        accountId,
        conversationId,
        messageId,
        error: error instanceof Error ? error.message : "Unknown error",
        totalLatencyMs: totalLatency,
      });

      // Return failed classification result
      return {
        intent: undefined,
        score: 0,
        candidates: [],
        threshold,
        classified: false,
      };
    }
  }

  /**
   * Batch classify multiple texts
   */
  async classifyBatch(
    texts: string[],
    options: ClassificationOptions = {}
  ): Promise<IntentClassificationResult[]> {
    const startTime = Date.now();
    const { traceId, accountId } = options;

    try {
      aiLogger.info("Starting batch intent classification", {
        traceId,
        accountId,
        batchSize: texts.length,
      });

      // Generate embeddings for all texts
      const embeddings = await Promise.all(
        texts.map((text) =>
          this.embeddingGenerator.generateEmbedding(text, {
            normalize: true,
            trim: true,
            lowercase: false,
            removeExtraSpaces: true
          })
        )
      );
      const results: IntentClassificationResult[] = [];

      // Classify each text
      for (let i = 0; i < texts.length; i++) {
        const embedding = embeddings[i];

        // Perform similarity search for this embedding
        const searchResult = await this.similaritySearch.searchSimilarIntents({
          embedding: embedding.values,
          threshold: options.customThreshold || this.config.defaultThreshold,
          limit: this.config.maxCandidates
        });

        const bestMatch =
          searchResult.candidates.length > 0
            ? searchResult.candidates[0]
            : null;
        const classified = !!bestMatch;

        results.push({
          intent: bestMatch?.name,
          score: bestMatch?.similarity || 0,
          candidates: searchResult.candidates.map((candidate) => ({
            name: candidate.name,
            similarity: candidate.similarity,
          })),
          threshold: options.customThreshold || this.config.defaultThreshold,
          classified,
        });
      }

      const totalLatency = Date.now() - startTime;

      aiLogger.info("Batch intent classification completed", {
        traceId,
        accountId,
        batchSize: texts.length,
        classifiedCount: results.filter((r) => r.classified).length,
        totalLatencyMs: totalLatency,
        averageLatencyMs: totalLatency / texts.length,
      });

      return results;
    } catch (error) {
      const totalLatency = Date.now() - startTime;

      aiLogger.error("Batch intent classification failed", {
        traceId,
        accountId,
        batchSize: texts.length,
        error: error instanceof Error ? error.message : "Unknown error",
        totalLatencyMs: totalLatency,
      });

      // Return failed results for all texts
      return texts.map(() => ({
        intent: undefined,
        score: 0,
        candidates: [],
        threshold: options.customThreshold || this.config.defaultThreshold,
        classified: false,
      }));
    }
  }

  /**
   * Get classification metrics
   */
  async getMetrics(
    options: { traceId?: string } = {}
  ): Promise<ClassificationMetrics> {
    const { traceId } = options;

    try {
      const metricsKey = "ai:intent:metrics";
      const metrics = await this.redis.hgetall(metricsKey);

      return {
        totalClassifications: parseInt(metrics.totalClassifications || "0"),
        successfulClassifications: parseInt(
          metrics.successfulClassifications || "0"
        ),
        rejectedByThreshold: parseInt(metrics.rejectedByThreshold || "0"),
        averageLatency: parseFloat(metrics.averageLatency || "0"),
        cacheHitRate: parseFloat(metrics.cacheHitRate || "0"),
      };
    } catch (error) {
      aiLogger.error("Failed to get classification metrics", {
        traceId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        totalClassifications: 0,
        successfulClassifications: 0,
        rejectedByThreshold: 0,
        averageLatency: 0,
        cacheHitRate: 0,
      };
    }
  }

  /**
   * Reset metrics
   */
  async resetMetrics(options: { traceId?: string } = {}): Promise<void> {
    const { traceId } = options;

    try {
      const metricsKey = "ai:intent:metrics";
      await this.redis.del(metricsKey);

      aiLogger.info("Intent classification metrics reset", { traceId });
    } catch (error) {
      aiLogger.error("Failed to reset classification metrics", {
        traceId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(data: {
    conversationId: string;
    messageId: string;
    mode: "INTENT_CLASSIFY";
    inputText: string;
    resultJson: any;
    score?: number;
    traceId?: string;
  }): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.config.auditTtlDays);

      await this.prisma.llmAudit.create({
        data: {
          ...data,
          accountId: '1', // Default account ID - should be passed from options
          expiresAt,
        },
      });
    } catch (error) {
      // Don't throw on audit logging failures
      aiLogger.warn("Failed to create audit log", {
        traceId: data.traceId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Update classification metrics
   */
  private async updateMetrics(data: {
    classified: boolean;
    latency: number;
    cached: boolean;
    traceId?: string;
  }): Promise<void> {
    try {
      const metricsKey = "ai:intent:metrics";
      const pipeline = this.redis.pipeline();

      // Increment counters
      pipeline.hincrby(metricsKey, "totalClassifications", 1);

      if (data.classified) {
        pipeline.hincrby(metricsKey, "successfulClassifications", 1);
      } else {
        pipeline.hincrby(metricsKey, "rejectedByThreshold", 1);
      }

      // Update latency (simple moving average)
      pipeline.hget(metricsKey, "averageLatency");
      pipeline.hget(metricsKey, "totalClassifications");

      const results = await pipeline.exec();

      if (results) {
        const currentAvg = parseFloat(
          (results[results.length - 2]?.[1] as string) || "0"
        );
        const totalCount = parseInt(
          (results[results.length - 1]?.[1] as string) || "1"
        );

        // Calculate new average
        const newAvg =
          (currentAvg * (totalCount - 1) + data.latency) / totalCount;

        await this.redis.hset(metricsKey, "averageLatency", newAvg.toString());
      }

      // Update cache hit rate
      if (data.cached) {
        await this.redis.hincrby(metricsKey, "cacheHits", 1);
      }

      // Set expiry for metrics (24 hours)
      await this.redis.expire(metricsKey, 86400);
    } catch (error) {
      // Don't throw on metrics failures
      aiLogger.warn("Failed to update classification metrics", {
        traceId: data.traceId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Mask PII in text for audit logging
   */
  private maskPII(text: string): string {
    // Basic PII masking - phone numbers and emails
    return text
      .replace(/\b\d{10,11}\b/g, "***PHONE***") // Phone numbers
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        "***EMAIL***"
      ) // Emails
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***CPF***") // CPF
      .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "***CNPJ***"); // CNPJ
  }
}

/**
 * Factory function to create intent classifier
 */
export function createIntentClassifier(
  embeddingGenerator: EmbeddingGenerator,
  similaritySearch: SimilaritySearchService,
  prisma: PrismaClient,
  redis: Redis,
  config: Partial<IntentClassifierConfig> = {}
): IntentClassifier {
  return new IntentClassifier(
    embeddingGenerator,
    similaritySearch,
    prisma,
    redis,
    config
  );
}
