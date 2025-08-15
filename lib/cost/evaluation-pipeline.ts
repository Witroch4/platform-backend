/**
 * Automated Evaluation Pipeline for SocialWise Flow
 * Implements quality evaluation and regression detection for PT-BR legal domain
 */

import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import { classifyIntent } from "@/lib/socialwise-flow/classification";
import { PerformanceBandProcessor } from "@/lib/socialwise-flow/performance-bands";
import { AgentConfig } from "@/services/openai";
import {
  EvaluationExample,
  QualityMetrics,
  QUALITY_THRESHOLDS,
  LEGAL_EVALUATION_DATASET,
  getExamplesByBand,
  validateDataset
} from "./evaluation-dataset";

const evaluationLogger = createLogger("SocialWise-Evaluation");

export interface EvaluationResult {
  exampleId: string;
  userText: string;
  expectedBand: string;
  actualBand: string;
  expectedScore?: number;
  actualScore: number;
  correct: boolean;
  responseTimeMs: number;
  error?: string;
  generatedContent?: {
    introduction_text?: string;
    buttons?: Array<{ title: string; payload: string }>;
  };
}

export interface EvaluationReport {
  timestamp: string;
  totalExamples: number;
  successfulEvaluations: number;
  failedEvaluations: number;
  qualityMetrics: QualityMetrics;
  bandResults: {
    HARD: { total: number; correct: number; accuracy: number };
    SOFT: { total: number; correct: number; accuracy: number };
    LOW: { total: number; correct: number; accuracy: number };
  };
  performanceMetrics: {
    averageResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
  };
  regressionDetected: boolean;
  recommendations: string[];
  detailedResults: EvaluationResult[];
}

export interface EvaluationConfig {
  sampleSize?: number;
  includePerformanceTest?: boolean;
  enableCaching?: boolean;
  timeoutMs?: number;
  agent: AgentConfig;
  userId: string;
}

/**
 * Main evaluation pipeline class
 */
export class EvaluationPipeline {
  private prisma = getPrismaInstance();
  private redis = getRedisInstance();
  private processor: PerformanceBandProcessor;

  constructor(private config: EvaluationConfig) {
    this.processor = new PerformanceBandProcessor(config.agent);
  }

  /**
   * Run complete evaluation pipeline
   */
  async runEvaluation(): Promise<EvaluationReport> {
    const startTime = Date.now();
    evaluationLogger.info("Starting evaluation pipeline", {
      sampleSize: this.config.sampleSize,
      userId: this.config.userId
    });

    // Validate dataset integrity first
    const datasetValidation = validateDataset();
    if (!datasetValidation.valid) {
      throw new Error(`Dataset validation failed: ${datasetValidation.errors.join(', ')}`);
    }

    // Select evaluation examples
    const examples = this.selectEvaluationExamples();
    evaluationLogger.info(`Selected ${examples.length} examples for evaluation`);

    // Run evaluations
    const results: EvaluationResult[] = [];
    const errors: string[] = [];

    for (const example of examples) {
      try {
        const result = await this.evaluateExample(example);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Example ${example.id}: ${errorMessage}`);
        evaluationLogger.error("Evaluation failed for example", {
          exampleId: example.id,
          error: errorMessage
        });
      }
    }

    // Generate evaluation report
    const report = this.generateReport(results, errors);
    
    // Store evaluation results
    await this.storeEvaluationResults(report);

    const totalTime = Date.now() - startTime;
    evaluationLogger.info("Evaluation pipeline completed", {
      totalTime,
      successfulEvaluations: results.length,
      failedEvaluations: errors.length
    });

    return report;
  }

  /**
   * Evaluate a single example
   */
  private async evaluateExample(example: EvaluationExample): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      // Classify the user text
      const classification = await classifyIntent(
        example.userText,
        this.config.userId,
        this.config.agent,
        true, // embedipreview = true for evaluation
        {
          channelType: 'whatsapp',
          inboxId: 'eval_inbox',
          traceId: `eval_${example.id}`
        }
      );

      const responseTime = Date.now() - startTime;

      // Check if classification is correct
      const correct = classification.band === example.expectedBand;

      // Generate content for SOFT and LOW bands to evaluate UX quality
      let generatedContent: any = undefined;
      if (classification.band === 'SOFT' || classification.band === 'LOW') {
        try {
          // Convert classification result to match performance bands interface
          const compatibleClassification = {
            band: classification.band,
            score: classification.score,
            candidates: classification.candidates,
            strategy: classification.strategy.includes('_degraded') || classification.strategy.includes('_error') 
              ? 'domain_topics' as const // Fallback for degraded strategies
              : classification.strategy as 'direct_map' | 'warmup_buttons' | 'domain_topics' | 'router_llm'
          };
          
          const bandResult = await this.processor.process(example.userText, compatibleClassification);
          if ('introduction_text' in bandResult && 'buttons' in bandResult) {
            generatedContent = {
              introduction_text: bandResult.introduction_text,
              buttons: bandResult.buttons
            };
          }
        } catch (error) {
          evaluationLogger.warn("Failed to generate content for evaluation", {
            exampleId: example.id,
            band: classification.band,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return {
        exampleId: example.id,
        userText: example.userText,
        expectedBand: example.expectedBand,
        actualBand: classification.band,
        expectedScore: example.expectedScore,
        actualScore: classification.score,
        correct,
        responseTimeMs: responseTime,
        generatedContent
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        exampleId: example.id,
        userText: example.userText,
        expectedBand: example.expectedBand,
        actualBand: 'ERROR',
        actualScore: 0,
        correct: false,
        responseTimeMs: responseTime,
        error: errorMessage
      };
    }
  }

  /**
   * Select evaluation examples based on configuration
   */
  private selectEvaluationExamples(): EvaluationExample[] {
    if (this.config.sampleSize && this.config.sampleSize < LEGAL_EVALUATION_DATASET.length) {
      // Stratified sampling to ensure representation from all bands
      const hardExamples = getExamplesByBand('HARD');
      const softExamples = getExamplesByBand('SOFT');
      const lowExamples = getExamplesByBand('LOW');

      const samplePerBand = Math.floor(this.config.sampleSize / 3);
      const remainder = this.config.sampleSize % 3;

      const selected = [
        ...this.randomSample(hardExamples, samplePerBand + (remainder > 0 ? 1 : 0)),
        ...this.randomSample(softExamples, samplePerBand + (remainder > 1 ? 1 : 0)),
        ...this.randomSample(lowExamples, samplePerBand)
      ];

      return selected;
    }

    return [...LEGAL_EVALUATION_DATASET];
  }

  /**
   * Random sample from array
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }

  /**
   * Generate comprehensive evaluation report
   */
  private generateReport(results: EvaluationResult[], errors: string[]): EvaluationReport {
    const successfulResults = results.filter(r => !r.error);
    const failedResults = results.filter(r => r.error);

    // Calculate band-specific metrics
    const bandResults = {
      HARD: this.calculateBandMetrics(successfulResults, 'HARD'),
      SOFT: this.calculateBandMetrics(successfulResults, 'SOFT'),
      LOW: this.calculateBandMetrics(successfulResults, 'LOW')
    };

    // Calculate performance metrics
    const responseTimes = successfulResults.map(r => r.responseTimeMs);
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    const p95ResponseTime = responseTimes.length > 0
      ? this.calculatePercentile(responseTimes, 0.95)
      : 0;

    const errorRate = results.length > 0 ? failedResults.length / results.length : 0;

    // Calculate quality metrics
    const qualityMetrics: QualityMetrics = {
      hardBandAccuracy: bandResults.HARD.accuracy,
      softBandCTR: this.calculateSoftBandCTR(successfulResults),
      lowBandValidTopics: this.calculateLowBandValidTopics(successfulResults),
      overallClassificationAccuracy: successfulResults.length > 0 
        ? successfulResults.filter(r => r.correct).length / successfulResults.length 
        : 0,
      averageResponseTime,
      errorRate
    };

    // Detect regressions
    const regressionDetected = this.detectRegressions(qualityMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(qualityMetrics, bandResults);

    return {
      timestamp: new Date().toISOString(),
      totalExamples: results.length,
      successfulEvaluations: successfulResults.length,
      failedEvaluations: failedResults.length,
      qualityMetrics,
      bandResults,
      performanceMetrics: {
        averageResponseTime,
        p95ResponseTime,
        errorRate
      },
      regressionDetected,
      recommendations,
      detailedResults: results
    };
  }

  /**
   * Calculate metrics for a specific band
   */
  private calculateBandMetrics(results: EvaluationResult[], band: string) {
    const bandResults = results.filter(r => r.expectedBand === band);
    const correctResults = bandResults.filter(r => r.correct);

    return {
      total: bandResults.length,
      correct: correctResults.length,
      accuracy: bandResults.length > 0 ? correctResults.length / bandResults.length : 0
    };
  }

  /**
   * Calculate SOFT band click-through rate (simulated)
   * In real implementation, this would track actual user interactions
   */
  private calculateSoftBandCTR(results: EvaluationResult[]): number {
    const softResults = results.filter(r => 
      r.expectedBand === 'SOFT' && 
      r.generatedContent?.buttons && 
      r.generatedContent.buttons.length > 0
    );

    if (softResults.length === 0) return 0;

    // Simulate CTR based on button quality
    let totalCTR = 0;
    for (const result of softResults) {
      const buttons = result.generatedContent?.buttons || [];
      // Quality heuristic: buttons with legal keywords and proper format
      const qualityScore = buttons.reduce((score, button) => {
        const hasLegalKeywords = /direito|consulta|ação|recurso|indenização/i.test(button.title);
        const properFormat = button.payload.match(/^@[a-z0-9_]+$/);
        const appropriateLength = button.title.length <= 20 && button.title.length >= 5;
        
        return score + (hasLegalKeywords ? 0.3 : 0) + (properFormat ? 0.2 : 0) + (appropriateLength ? 0.1 : 0);
      }, 0) / buttons.length;

      // Simulate CTR based on quality (0.2 to 0.6 range)
      const simulatedCTR = Math.min(0.6, Math.max(0.2, qualityScore));
      totalCTR += simulatedCTR;
    }

    return totalCTR / softResults.length;
  }

  /**
   * Calculate LOW band valid topics percentage
   */
  private calculateLowBandValidTopics(results: EvaluationResult[]): number {
    const lowResults = results.filter(r => 
      r.expectedBand === 'LOW' && 
      r.generatedContent?.buttons
    );

    if (lowResults.length === 0) return 0;

    const validTopics = [
      'direito civil', 'direito consumidor', 'direito família', 'direito trabalhista',
      'direito previdenciário', 'direito criminal', 'direito tributário', 
      'direito imobiliário', 'direito trânsito', 'consulta'
    ];

    let validCount = 0;
    for (const result of lowResults) {
      const buttons = result.generatedContent?.buttons || [];
      const hasValidTopics = buttons.some(button => 
        validTopics.some(topic => 
          button.title.toLowerCase().includes(topic) || 
          button.payload.toLowerCase().includes(topic.replace(' ', '_'))
        )
      );
      
      if (hasValidTopics) validCount++;
    }

    return validCount / lowResults.length;
  }

  /**
   * Calculate percentile from array of numbers
   */
  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Detect quality regressions
   */
  private detectRegressions(metrics: QualityMetrics): boolean {
    return (
      metrics.hardBandAccuracy < QUALITY_THRESHOLDS.HARD_BAND_ACCURACY ||
      metrics.softBandCTR < QUALITY_THRESHOLDS.SOFT_BAND_CTR ||
      metrics.lowBandValidTopics < QUALITY_THRESHOLDS.LOW_BAND_VALID_TOPICS ||
      metrics.overallClassificationAccuracy < QUALITY_THRESHOLDS.OVERALL_ACCURACY ||
      metrics.averageResponseTime > QUALITY_THRESHOLDS.MAX_RESPONSE_TIME ||
      metrics.errorRate > QUALITY_THRESHOLDS.MAX_ERROR_RATE
    );
  }

  /**
   * Generate improvement recommendations
   */
  private generateRecommendations(
    metrics: QualityMetrics, 
    bandResults: any
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.hardBandAccuracy < QUALITY_THRESHOLDS.HARD_BAND_ACCURACY) {
      recommendations.push(
        `HARD band accuracy (${(metrics.hardBandAccuracy * 100).toFixed(1)}%) below threshold (${(QUALITY_THRESHOLDS.HARD_BAND_ACCURACY * 100)}%). Consider improving embedding quality or adjusting similarity thresholds.`
      );
    }

    if (metrics.softBandCTR < QUALITY_THRESHOLDS.SOFT_BAND_CTR) {
      recommendations.push(
        `SOFT band CTR (${(metrics.softBandCTR * 100).toFixed(1)}%) below threshold (${(QUALITY_THRESHOLDS.SOFT_BAND_CTR * 100)}%). Improve UX writing prompts for better button engagement.`
      );
    }

    if (metrics.lowBandValidTopics < QUALITY_THRESHOLDS.LOW_BAND_VALID_TOPICS) {
      recommendations.push(
        `LOW band valid topics (${(metrics.lowBandValidTopics * 100).toFixed(1)}%) below threshold (${(QUALITY_THRESHOLDS.LOW_BAND_VALID_TOPICS * 100)}%). Review legal domain topic generation.`
      );
    }

    if (metrics.averageResponseTime > QUALITY_THRESHOLDS.MAX_RESPONSE_TIME) {
      recommendations.push(
        `Average response time (${metrics.averageResponseTime.toFixed(0)}ms) exceeds threshold (${QUALITY_THRESHOLDS.MAX_RESPONSE_TIME}ms). Optimize embedding search or LLM call timeouts.`
      );
    }

    if (metrics.errorRate > QUALITY_THRESHOLDS.MAX_ERROR_RATE) {
      recommendations.push(
        `Error rate (${(metrics.errorRate * 100).toFixed(1)}%) exceeds threshold (${(QUALITY_THRESHOLDS.MAX_ERROR_RATE * 100)}%). Improve error handling and fallback strategies.`
      );
    }

    if (bandResults.SOFT.accuracy < 0.7) {
      recommendations.push(
        "SOFT band accuracy is low. Consider adjusting score thresholds or improving candidate selection logic."
      );
    }

    if (bandResults.LOW.accuracy < 0.8) {
      recommendations.push(
        "LOW band accuracy is low. Review fallback topic generation and keyword matching strategies."
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("All quality metrics are within acceptable thresholds. System performance is optimal.");
    }

    return recommendations;
  }

  /**
   * Store evaluation results in database
   */
  private async storeEvaluationResults(report: EvaluationReport): Promise<void> {
    try {
      // Store in Redis for quick access
      const cacheKey = `evaluation:report:${Date.now()}`;
      await this.redis.setex(cacheKey, 86400, JSON.stringify(report)); // 24h TTL

      // Store summary in database (commented out until Prisma schema is updated)
      // await this.prisma.evaluationReport.create({
      //   data: {
      //     timestamp: new Date(report.timestamp),
      //     totalExamples: report.totalExamples,
      //     successfulEvaluations: report.successfulEvaluations,
      //     failedEvaluations: report.failedEvaluations,
      //     hardBandAccuracy: report.qualityMetrics.hardBandAccuracy,
      //     softBandCTR: report.qualityMetrics.softBandCTR,
      //     lowBandValidTopics: report.qualityMetrics.lowBandValidTopics,
      //     overallAccuracy: report.qualityMetrics.overallClassificationAccuracy,
      //     averageResponseTime: report.qualityMetrics.averageResponseTime,
      //     errorRate: report.qualityMetrics.errorRate,
      //     regressionDetected: report.regressionDetected,
      //     recommendations: report.recommendations,
      //     detailedResults: report.detailedResults as any
      //   }
      // });

      evaluationLogger.info("Evaluation results stored successfully", {
        cacheKey,
        regressionDetected: report.regressionDetected
      });
    } catch (error) {
      evaluationLogger.error("Failed to store evaluation results", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Run evaluation pipeline with default configuration
 */
export async function runQualityEvaluation(
  agent: AgentConfig,
  userId: string,
  options: Partial<EvaluationConfig> = {}
): Promise<EvaluationReport> {
  const config: EvaluationConfig = {
    sampleSize: 50, // Default sample size
    includePerformanceTest: true,
    enableCaching: true,
    timeoutMs: 5000,
    agent,
    userId,
    ...options
  };

  const pipeline = new EvaluationPipeline(config);
  return await pipeline.runEvaluation();
}

/**
 * Get latest evaluation report from cache
 */
export async function getLatestEvaluationReport(): Promise<EvaluationReport | null> {
  try {
    const redis = getRedisInstance();
    const keys = await redis.keys('evaluation:report:*');
    
    if (keys.length === 0) return null;

    // Get the most recent report
    const latestKey = keys.sort().pop();
    if (!latestKey) return null;

    const reportData = await redis.get(latestKey);
    return reportData ? JSON.parse(reportData) : null;
  } catch (error) {
    evaluationLogger.error("Failed to get latest evaluation report", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}