/**
 * PGVector Similarity Search Service
 * Requirements: 3.1, 3.2, 6.1, 6.2
 */

import { getPrismaInstance } from "@/lib/connections";
import type { PrismaClient } from "@prisma/client";
import { 
  SimilaritySearchParams, 
  SimilaritySearchResult, 
  IntentCandidate,
  IntentHit 
} from '../types/intent';

export interface SimilaritySearchConfig {
  defaultThreshold: number;
  maxCandidates: number;
  enableAuditLogging: boolean;
}

export interface SearchMetrics {
  searchDuration: number;
  candidatesFound: number;
  candidatesAboveThreshold: number;
  topSimilarity: number;
}

export class SimilaritySearchService {
  private prisma: PrismaClient;
  private config: SimilaritySearchConfig;

  constructor(config?: Partial<SimilaritySearchConfig>) {
    this.config = {
      defaultThreshold: 0.8,
      maxCandidates: 10,
      enableAuditLogging: true,
      ...config,
    };

    this.prisma = getPrismaInstance();
  }

  /**
   * Perform vector similarity search using PGVector
   */
  async searchSimilarIntents(
    params: SimilaritySearchParams,
    traceId?: string
  ): Promise<{
    results: SimilaritySearchResult[];
    candidates: IntentCandidate[];
    metrics: SearchMetrics;
  }> {
    const startTime = Date.now();
    const threshold = params.threshold || this.config.defaultThreshold;
    const limit = params.limit || this.config.maxCandidates;

    try {
      // Convert embedding array to vector string for PostgreSQL
      const embeddingVector = `[${params.embedding.join(',')}]`;

      // Perform similarity search using raw SQL with PGVector
      const candidates = await this.prisma.$queryRaw<Array<{
        id: string;
        name: string;
        description: string | null;
        actionType: string;
        templateId: string | null;
        similarityThreshold: number;
        similarity: number;
      }>>`
        SELECT 
          id,
          name,
          description,
          "actionType",
          "templateId",
          "similarityThreshold",
          1 - (embedding <=> ${embeddingVector}::vector) as similarity
        FROM "Intent"
        ORDER BY embedding <=> ${embeddingVector}::vector
        LIMIT ${limit}
      `;

      const searchDuration = Date.now() - startTime;

      // Filter candidates by threshold and convert to proper types
      const validCandidates: IntentCandidate[] = candidates.map(candidate => ({
        name: candidate.name,
        similarity: candidate.similarity,
        threshold: candidate.similarityThreshold,
        actionType: candidate.actionType,
        templateId: candidate.templateId || undefined,
      }));

      // Filter results that meet the threshold
      const results: SimilaritySearchResult[] = validCandidates
        .filter(candidate => candidate.similarity >= threshold)
        .map(candidate => ({
          intent: candidate.name,
          similarity: candidate.similarity,
          actionType: candidate.actionType,
          templateId: candidate.templateId,
        }));

      const metrics: SearchMetrics = {
        searchDuration,
        candidatesFound: validCandidates.length,
        candidatesAboveThreshold: results.length,
        topSimilarity: validCandidates.length > 0 ? validCandidates[0].similarity : 0,
      };

      // Log search metrics
      console.log('Similarity search completed:', {
        threshold,
        candidatesFound: metrics.candidatesFound,
        candidatesAboveThreshold: metrics.candidatesAboveThreshold,
        searchDuration: metrics.searchDuration,
        traceId,
      });

      return {
        results,
        candidates: validCandidates,
        metrics,
      };
    } catch (error) {
      console.error('Similarity search failed:', error);
      throw new Error(`Similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Log intent classification attempt for audit purposes
   */
  async logIntentHit(
    conversationId: string,
    messageId: string,
    candidates: IntentCandidate[],
    chosenIntent?: string,
    traceId?: string
  ): Promise<void> {
    if (!this.config.enableAuditLogging) {
      return;
    }

    try {
      const hitLogs = candidates.map(candidate => ({
        conversationId,
        messageId,
        candidateName: candidate.name,
        similarity: candidate.similarity,
        chosen: candidate.name === chosenIntent,
        traceId,
        accountId: '1', // Default account ID
        intentId: (candidate as any).id || 'unknown', // Use candidate ID or default
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      }));

      await this.prisma.intentHitLog.createMany({
        data: hitLogs,
      });

      console.log('Intent hit logged:', {
        conversationId,
        messageId,
        candidatesCount: candidates.length,
        chosenIntent,
        traceId,
      });
    } catch (error) {
      console.error('Failed to log intent hit:', error);
      // Don't throw error for audit logging failures
    }
  }

  /**
   * Get intent classification statistics
   */
  async getClassificationStats(
    accountId?: number,
    timeRange?: { from: Date; to: Date }
  ): Promise<{
    totalAttempts: number;
    successfulClassifications: number;
    topIntents: Array<{ intent: string; count: number; avgSimilarity: number }>;
    avgSimilarity: number;
  }> {
    try {
      const whereClause = {
        ...(timeRange && {
          createdAt: {
            gte: timeRange.from,
            lte: timeRange.to,
          },
        }),
      };

      // Get total attempts
      const totalAttempts = await this.prisma.intentHitLog.count({
        where: whereClause,
      });

      // Get successful classifications
      const successfulClassifications = await this.prisma.intentHitLog.count({
        where: {
          ...whereClause,
          chosen: true,
        },
      });

      // Get top intents
      const topIntentsRaw = await this.prisma.intentHitLog.groupBy({
        by: ['candidateName'],
        where: {
          ...whereClause,
          chosen: true,
        },
        _count: {
          candidateName: true,
        },
        _avg: {
          similarity: true,
        },
        orderBy: {
          _count: {
            candidateName: 'desc',
          },
        },
        take: 10,
      });

      const topIntents = topIntentsRaw.map(item => ({
        intent: item.candidateName,
        count: item._count.candidateName,
        avgSimilarity: item._avg.similarity || 0,
      }));

      // Get average similarity
      const avgSimilarityResult = await this.prisma.intentHitLog.aggregate({
        where: whereClause,
        _avg: {
          similarity: true,
        },
      });

      return {
        totalAttempts,
        successfulClassifications,
        topIntents,
        avgSimilarity: avgSimilarityResult._avg.similarity || 0,
      };
    } catch (error) {
      console.error('Failed to get classification stats:', error);
      throw new Error(`Failed to get classification stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find similar intents by name (for admin interface)
   */
  async findIntentsByName(
    query: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    name: string;
    description: string | null;
    actionType: string;
    similarityThreshold: number;
  }>> {
    try {
      const intents = await this.prisma.intent.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          actionType: true,
          similarityThreshold: true,
        },
        take: limit,
        orderBy: {
          name: 'asc',
        },
      });

      return intents;
    } catch (error) {
      console.error('Failed to find intents by name:', error);
      throw new Error(`Failed to find intents by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update intent similarity threshold
   */
  async updateIntentThreshold(
    intentId: string,
    threshold: number
  ): Promise<void> {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }

    try {
      await this.prisma.intent.update({
        where: { id: intentId },
        data: { similarityThreshold: threshold },
      });

      console.log('Intent threshold updated:', { intentId, threshold });
    } catch (error) {
      console.error('Failed to update intent threshold:', error);
      throw new Error(`Failed to update intent threshold: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get intent performance metrics for threshold tuning
   */
  async getIntentPerformanceMetrics(
    intentName: string,
    timeRange?: { from: Date; to: Date }
  ): Promise<{
    totalHits: number;
    chosenCount: number;
    rejectedCount: number;
    avgSimilarity: number;
    maxSimilarity: number;
    minSimilarity: number;
    similarityDistribution: Array<{ range: string; count: number }>;
  }> {
    try {
      const whereClause = {
        candidateName: intentName,
        ...(timeRange && {
          createdAt: {
            gte: timeRange.from,
            lte: timeRange.to,
          },
        }),
      };

      const totalHits = await this.prisma.intentHitLog.count({
        where: whereClause,
      });

      const chosenCount = await this.prisma.intentHitLog.count({
        where: {
          ...whereClause,
          chosen: true,
        },
      });

      const rejectedCount = totalHits - chosenCount;

      const aggregateResult = await this.prisma.intentHitLog.aggregate({
        where: whereClause,
        _avg: { similarity: true },
        _max: { similarity: true },
        _min: { similarity: true },
      });

      // Get similarity distribution
      const hits = await this.prisma.intentHitLog.findMany({
        where: whereClause,
        select: { similarity: true },
      });

      const similarityDistribution = this.calculateSimilarityDistribution(
        hits.map(h => h.similarity)
      );

      return {
        totalHits,
        chosenCount,
        rejectedCount,
        avgSimilarity: aggregateResult._avg.similarity || 0,
        maxSimilarity: aggregateResult._max.similarity || 0,
        minSimilarity: aggregateResult._min.similarity || 0,
        similarityDistribution,
      };
    } catch (error) {
      console.error('Failed to get intent performance metrics:', error);
      throw new Error(`Failed to get intent performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate similarity distribution for threshold tuning
   */
  private calculateSimilarityDistribution(
    similarities: number[]
  ): Array<{ range: string; count: number }> {
    const ranges = [
      { min: 0.0, max: 0.2, label: '0.0-0.2' },
      { min: 0.2, max: 0.4, label: '0.2-0.4' },
      { min: 0.4, max: 0.6, label: '0.4-0.6' },
      { min: 0.6, max: 0.8, label: '0.6-0.8' },
      { min: 0.8, max: 1.0, label: '0.8-1.0' },
    ];

    return ranges.map(range => ({
      range: range.label,
      count: similarities.filter(s => s >= range.min && s < range.max).length,
    }));
  }
}

// Export singleton instance
export const similaritySearchService = new SimilaritySearchService();