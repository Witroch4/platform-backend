/**
 * Threshold Tuning Service with Negative Examples Support
 * Requirements: 8.3, 8.4, 6.1
 */

import { getPrismaInstance } from "@/lib/connections";
import type { PrismaClient } from "@prisma/client";
import { embeddingGenerator } from './embedding-generator';
import { similaritySearchService } from './similarity-search';

export interface ROCPoint {
  threshold: number;
  truePositiveRate: number;
  falsePositiveRate: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface ThresholdRecommendation {
  recommendedThreshold: number;
  confidence: number;
  metrics: {
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
  };
  rocCurve: ROCPoint[];
}

export interface NegativeExample {
  id: string;
  intentId: string;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationResult {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export class ThresholdTunerService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaInstance();
  }

  /**
   * Add negative example for an intent
   */
  async addNegativeExample(
    intentId: string,
    text: string
  ): Promise<NegativeExample> {
    try {
      // Generate embedding for the negative example
      const embeddingResult = await embeddingGenerator.generateEmbedding(text);
      const embeddingVector = `[${embeddingResult.values.join(',')}]`;

      // Store negative example
      const negativeExample = await this.prisma.$queryRaw<Array<{
        id: string;
        intentId: string;
        text: string;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        INSERT INTO "NegativeExample" (id, "intentId", text, embedding, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${intentId}, ${text}, ${embeddingVector}::vector, NOW(), NOW())
        RETURNING id, "intentId", text, "createdAt", "updatedAt"
      `;

      const result = negativeExample[0];

      console.log('Negative example added:', {
        id: result.id,
        intentId,
        text: text.substring(0, 50) + '...',
      });

      return {
        id: result.id,
        intentId: result.intentId,
        text: result.text,
        embedding: embeddingResult.values,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    } catch (error) {
      console.error('Failed to add negative example:', error);
      throw new Error(`Failed to add negative example: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove negative example
   */
  async removeNegativeExample(negativeExampleId: string): Promise<void> {
    try {
      await this.prisma.negativeExample.delete({
        where: { id: negativeExampleId },
      });

      console.log('Negative example removed:', { id: negativeExampleId });
    } catch (error) {
      console.error('Failed to remove negative example:', error);
      throw new Error(`Failed to remove negative example: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get negative examples for an intent
   */
  async getNegativeExamples(intentId: string): Promise<NegativeExample[]> {
    try {
      const examples = await this.prisma.$queryRaw<Array<{
        id: string;
        intentId: string;
        text: string;
        embedding: string;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        SELECT id, "intentId", text, embedding::text, "createdAt", "updatedAt"
        FROM "NegativeExample"
        WHERE "intentId" = ${intentId}
        ORDER BY "createdAt" DESC
      `;

      return examples.map((example: any) => ({
        id: example.id,
        intentId: example.intentId,
        text: example.text,
        embedding: JSON.parse(example.embedding.replace(/[\[\]]/g, '').split(',').map((n: string) => n.trim())),
        createdAt: example.createdAt,
        updatedAt: example.updatedAt,
      }));
    } catch (error) {
      console.error('Failed to get negative examples:', error);
      throw new Error(`Failed to get negative examples: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate ROC curve for threshold tuning
   */
  async generateROCCurve(
    intentId: string,
    positiveExamples: string[],
    testThresholds?: number[]
  ): Promise<ROCPoint[]> {
    const thresholds = testThresholds || [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
    const rocPoints: ROCPoint[] = [];

    try {
      // Get negative examples
      const negativeExamples = await this.getNegativeExamples(intentId);

      if (negativeExamples.length === 0) {
        throw new Error('No negative examples found for intent. Add negative examples first.');
      }

      // Generate embeddings for positive examples
      const positiveEmbeddings = await embeddingGenerator.generateEmbeddings(positiveExamples);

      // Test each threshold
      for (const threshold of thresholds) {
        let truePositives = 0;
        let falseNegatives = 0;
        let trueNegatives = 0;
        let falsePositives = 0;

        // Test positive examples
        for (const embedding of positiveEmbeddings) {
          const searchResult = await similaritySearchService.searchSimilarIntents({
            embedding: embedding.values,
            threshold,
          });

          const intentFound = searchResult.results.find(r => r.intent === intentId);
          if (intentFound) {
            truePositives++;
          } else {
            falseNegatives++;
          }
        }

        // Test negative examples
        for (const negExample of negativeExamples) {
          const searchResult = await similaritySearchService.searchSimilarIntents({
            embedding: negExample.embedding,
            threshold,
          });

          const intentFound = searchResult.results.find(r => r.intent === intentId);
          if (intentFound) {
            falsePositives++;
          } else {
            trueNegatives++;
          }
        }

        // Calculate metrics
        const truePositiveRate = truePositives / (truePositives + falseNegatives) || 0;
        const falsePositiveRate = falsePositives / (falsePositives + trueNegatives) || 0;
        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositiveRate;
        const f1Score = (2 * precision * recall) / (precision + recall) || 0;

        rocPoints.push({
          threshold,
          truePositiveRate,
          falsePositiveRate,
          precision,
          recall,
          f1Score,
        });
      }

      return rocPoints.sort((a, b) => a.threshold - b.threshold);
    } catch (error) {
      console.error('Failed to generate ROC curve:', error);
      throw new Error(`Failed to generate ROC curve: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recommend optimal threshold based on ROC analysis
   */
  async recommendThreshold(
    intentId: string,
    positiveExamples: string[],
    optimizationTarget: 'f1' | 'precision' | 'recall' = 'f1'
  ): Promise<ThresholdRecommendation> {
    try {
      const rocCurve = await this.generateROCCurve(intentId, positiveExamples);

      if (rocCurve.length === 0) {
        throw new Error('No ROC points generated');
      }

      // Find optimal threshold based on target metric
      let bestPoint = rocCurve[0];
      let bestScore = this.getOptimizationScore(bestPoint, optimizationTarget);

      for (const point of rocCurve) {
        const score = this.getOptimizationScore(point, optimizationTarget);
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }

      // Calculate confidence based on the difference between best and second-best
      const sortedPoints = rocCurve
        .map(p => ({ point: p, score: this.getOptimizationScore(p, optimizationTarget) }))
        .sort((a, b) => b.score - a.score);

      const confidence = sortedPoints.length > 1 
        ? Math.min(1, (sortedPoints[0].score - sortedPoints[1].score) * 2)
        : 0.5;

      return {
        recommendedThreshold: bestPoint.threshold,
        confidence,
        metrics: {
          precision: bestPoint.precision,
          recall: bestPoint.recall,
          f1Score: bestPoint.f1Score,
          accuracy: this.calculateAccuracy(bestPoint),
        },
        rocCurve,
      };
    } catch (error) {
      console.error('Failed to recommend threshold:', error);
      throw new Error(`Failed to recommend threshold: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate current threshold performance
   */
  async validateThreshold(
    intentId: string,
    threshold: number,
    positiveExamples: string[]
  ): Promise<ValidationResult> {
    try {
      const negativeExamples = await this.getNegativeExamples(intentId);
      const positiveEmbeddings = await embeddingGenerator.generateEmbeddings(positiveExamples);

      let truePositives = 0;
      let falseNegatives = 0;
      let trueNegatives = 0;
      let falsePositives = 0;

      // Test positive examples
      for (const embedding of positiveEmbeddings) {
        const searchResult = await similaritySearchService.searchSimilarIntents({
          embedding: embedding.values,
          threshold,
        });

        const intentFound = searchResult.results.find(r => r.intent === intentId);
        if (intentFound) {
          truePositives++;
        } else {
          falseNegatives++;
        }
      }

      // Test negative examples
      for (const negExample of negativeExamples) {
        const searchResult = await similaritySearchService.searchSimilarIntents({
          embedding: negExample.embedding,
          threshold,
        });

        const intentFound = searchResult.results.find(r => r.intent === intentId);
        if (intentFound) {
          falsePositives++;
        } else {
          trueNegatives++;
        }
      }

      const total = truePositives + falsePositives + trueNegatives + falseNegatives;
      const accuracy = (truePositives + trueNegatives) / total || 0;
      const precision = truePositives / (truePositives + falsePositives) || 0;
      const recall = truePositives / (truePositives + falseNegatives) || 0;
      const f1Score = (2 * precision * recall) / (precision + recall) || 0;

      return {
        truePositives,
        falsePositives,
        trueNegatives,
        falseNegatives,
        accuracy,
        precision,
        recall,
        f1Score,
      };
    } catch (error) {
      console.error('Failed to validate threshold:', error);
      throw new Error(`Failed to validate threshold: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get intent rejection metrics
   */
  async getIntentRejectionMetrics(
    timeRange?: { from: Date; to: Date }
  ): Promise<{
    totalAttempts: number;
    rejectedAttempts: number;
    rejectionRate: number;
    rejectionsByIntent: Array<{ intent: string; rejections: number; attempts: number; rate: number }>;
  }> {
    try {
      const whereClause = timeRange ? {
        createdAt: {
          gte: timeRange.from,
          lte: timeRange.to,
        },
      } : {};

      const totalAttempts = await this.prisma.intentHitLog.count({
        where: whereClause,
      });

      const rejectedAttempts = await this.prisma.intentHitLog.count({
        where: {
          ...whereClause,
          chosen: false,
        },
      });

      const rejectionRate = totalAttempts > 0 ? rejectedAttempts / totalAttempts : 0;

      // Get rejections by intent
      const rejectionsByIntentRaw = await this.prisma.intentHitLog.groupBy({
        by: ['candidateName'],
        where: whereClause,
        _count: {
          candidateName: true,
        },
        _sum: {
          similarity: true,
        },
      });

      const rejectionsByIntent = rejectionsByIntentRaw.map((item: any) => {
        const attempts = item._count.candidateName;
        const chosen = item._sum.chosen || 0;
        const rejections = attempts - chosen;
        const rate = attempts > 0 ? rejections / attempts : 0;

        return {
          intent: item.candidateName,
          rejections,
          attempts,
          rate,
        };
      }).sort((a: any, b: any) => b.rate - a.rate);

      return {
        totalAttempts,
        rejectedAttempts,
        rejectionRate,
        rejectionsByIntent,
      };
    } catch (error) {
      console.error('Failed to get intent rejection metrics:', error);
      throw new Error(`Failed to get intent rejection metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get optimization score based on target metric
   */
  private getOptimizationScore(point: ROCPoint, target: 'f1' | 'precision' | 'recall'): number {
    switch (target) {
      case 'f1':
        return point.f1Score;
      case 'precision':
        return point.precision;
      case 'recall':
        return point.recall;
      default:
        return point.f1Score;
    }
  }

  /**
   * Calculate accuracy from ROC point
   */
  private calculateAccuracy(point: ROCPoint): number {
    // This is a simplified accuracy calculation
    // In practice, you'd need the actual counts to calculate true accuracy
    return (point.truePositiveRate + (1 - point.falsePositiveRate)) / 2;
  }
}

// Export singleton instance
export const thresholdTunerService = new ThresholdTunerService();