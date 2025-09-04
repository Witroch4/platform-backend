/**
 * Integration Example: Cost Tracking and Quality Evaluation
 * Demonstrates how to use the cost tracking and evaluation systems together
 */

import { createRequestCostTracker, RequestCostTracker } from './request-cost-tracker';
import { runQualityEvaluation, EvaluationReport } from './evaluation-pipeline';
import { AgentConfig } from '@/services/openai';
import { createLogger } from '@/lib/utils/logger';

const integrationLogger = createLogger('SocialWise-Integration');

/**
 * Example: Complete SocialWise Flow request with cost tracking
 */
export async function processRequestWithCostTracking(
  requestId: string,
  userText: string,
  context: {
    sessionId?: string;
    inboxId?: string;
    userId?: string;
    channelType: string;
  },
  agent: AgentConfig
): Promise<{
  response: any;
  costBreakdown: any;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  
  // Initialize cost tracker
  const costTracker = createRequestCostTracker({
    enableDetailedTracking: true,
    enableBudgetAlerts: true,
    enableOptimizationRecommendations: true,
    costThresholds: {
      dailyBudget: 50.0,
      monthlyBudget: 1000.0,
      alertThreshold: 80
    }
  });

  try {
    // Start cost tracking
    await costTracker.startRequest(requestId, {
      sessionId: context.sessionId,
      inboxId: context.inboxId,
      userId: context.userId,
      band: undefined, // Will be determined by classification
      strategy: undefined
    });

    integrationLogger.info('Started request processing with cost tracking', {
      requestId,
      userText: userText.substring(0, 50),
      userId: context.userId
    });

    // Step 1: Track embedding cost for classification
    await costTracker.trackEmbeddingCost(
      requestId,
      userText.length,
      'text-embedding-3-small'
    );

    // Step 2: Simulate classification (in real implementation, this would call the actual classification)
    const classificationResult = {
      band: 'SOFT' as const,
      score: 0.72,
      candidates: [
        { slug: 'consulta_juridica', name: 'Consulta Jurídica', desc: 'Consulta geral', score: 0.72 }
      ],
      strategy: 'warmup_buttons' as const
    };

    // Step 3: Track LLM costs based on band processing
    if (classificationResult.band === 'SOFT') {
      // Track short titles generation
      await costTracker.trackLLMCost(requestId, 'shortTitles', {
        model: agent.model,
        inputTokens: 150,
        outputTokens: 50,
        reasoningTokens: agent.model.includes('gpt-5') ? 25 : undefined
      });

      // Track warmup buttons generation
      await costTracker.trackLLMCost(requestId, 'warmupButtons', {
        model: agent.model,
        inputTokens: 200,
        outputTokens: 80,
        reasoningTokens: agent.model.includes('gpt-5') ? 40 : undefined
      });
    } else if (classificationResult.band === 'HARD') {
      // Track optional microcopy enhancement
      await costTracker.trackLLMCost(requestId, 'microcopy', {
        model: agent.model,
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: agent.model.includes('gpt-5') ? 15 : undefined
      });
    } else if (classificationResult.band === 'LOW') {
      // Track domain topics generation
      await costTracker.trackLLMCost(requestId, 'domainTopics', {
        model: agent.model,
        inputTokens: 120,
        outputTokens: 60,
        reasoningTokens: agent.model.includes('gpt-5') ? 20 : undefined
      });
    }

    // Step 4: Generate response (simulated)
    const response = {
      type: 'warmup_buttons',
      response_text: 'Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?',
      buttons: [
        { title: 'Direito Civil', payload: '@consulta_direito_civil' },
        { title: 'Direito Consumidor', payload: '@consulta_direito_consumidor' },
        { title: 'Direito Família', payload: '@consulta_direito_familia' }
      ]
    };

    // Step 5: Finalize cost tracking
    const processingTimeMs = Date.now() - startTime;
    const costBreakdown = await costTracker.finalizeRequest(requestId, processingTimeMs);

    integrationLogger.info('Request processed successfully with cost tracking', {
      requestId,
      processingTimeMs,
      totalCost: costBreakdown?.totalCost || 0,
      band: classificationResult.band
    });

    return {
      response,
      costBreakdown,
      processingTimeMs
    };

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    
    integrationLogger.error('Request processing failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs
    });

    // Still finalize cost tracking to capture partial costs
    const costBreakdown = await costTracker.finalizeRequest(requestId, processingTimeMs);

    throw error;
  }
}

/**
 * Example: Run quality evaluation with cost analysis
 */
export async function runQualityEvaluationWithCostAnalysis(
  agent: AgentConfig,
  userId: string
): Promise<{
  evaluationReport: EvaluationReport;
  costAnalysis: {
    totalEvaluationCost: number;
    averageCostPerExample: number;
    costByBand: Record<string, number>;
    recommendations: string[];
  };
}> {
  integrationLogger.info('Starting quality evaluation with cost analysis', {
    userId,
    agentModel: agent.model
  });

  // Run quality evaluation
  const evaluationReport = await runQualityEvaluation(agent, userId, {
    sampleSize: 30, // Smaller sample for cost efficiency
    includePerformanceTest: true,
    enableCaching: true
  });

  // Simulate cost analysis based on evaluation results
  const costAnalysis = analyzeCostsFromEvaluation(evaluationReport, agent);

  integrationLogger.info('Quality evaluation with cost analysis completed', {
    userId,
    totalExamples: evaluationReport.totalExamples,
    overallAccuracy: evaluationReport.qualityMetrics.overallClassificationAccuracy,
    totalCost: costAnalysis.totalEvaluationCost,
    regressionDetected: evaluationReport.regressionDetected
  });

  return {
    evaluationReport,
    costAnalysis
  };
}

/**
 * Analyze costs from evaluation results
 */
function analyzeCostsFromEvaluation(
  report: EvaluationReport,
  agent: AgentConfig
): {
  totalEvaluationCost: number;
  averageCostPerExample: number;
  costByBand: Record<string, number>;
  recommendations: string[];
} {
  // Estimate costs based on model and operations
  const modelCosts = getModelCosts(agent.model);
  
  let totalCost = 0;
  const costByBand: Record<string, number> = {};

  // Calculate costs for each band
  for (const [band, results] of Object.entries(report.bandResults)) {
    let bandCost = 0;

    // Embedding cost (all examples)
    const embeddingCost = results.total * modelCosts.embedding;
    bandCost += embeddingCost;

    // LLM costs based on band
    if (band === 'HARD') {
      // Optional microcopy
      bandCost += results.total * modelCosts.microcopy * 0.5; // 50% get microcopy
    } else if (band === 'SOFT') {
      // Short titles + warmup buttons
      bandCost += results.total * (modelCosts.shortTitles + modelCosts.warmupButtons);
    } else if (band === 'LOW') {
      // Domain topics
      bandCost += results.total * modelCosts.domainTopics;
    }

    costByBand[band] = bandCost;
    totalCost += bandCost;
  }

  const averageCostPerExample = report.totalExamples > 0 ? totalCost / report.totalExamples : 0;

  // Generate cost optimization recommendations
  const recommendations: string[] = [];

  if (averageCostPerExample > 0.05) {
    recommendations.push('Average cost per example is high. Consider using smaller models or aggressive caching.');
  }

  if (costByBand.SOFT && costByBand.SOFT > totalCost * 0.6) {
    recommendations.push('SOFT band processing is expensive. Consider degrading to deterministic responses under load.');
  }

  if (report.qualityMetrics.averageResponseTime > 500) {
    recommendations.push('Response times are slow. Implement more aggressive caching to reduce LLM calls.');
  }

  if (agent.model.includes('gpt-5') && !agent.model.includes('nano')) {
    recommendations.push('Consider using gpt-5-nano for cost optimization while maintaining quality.');
  }

  return {
    totalEvaluationCost: totalCost,
    averageCostPerExample,
    costByBand,
    recommendations
  };
}

/**
 * Get estimated costs for different models and operations
 */
function getModelCosts(model: string): {
  embedding: number;
  microcopy: number;
  shortTitles: number;
  warmupButtons: number;
  domainTopics: number;
} {
  // Base costs (estimated, in USD)
  const baseCosts = {
    embedding: 0.0001, // ~$0.0001 per embedding
    microcopy: 0.002,  // ~$0.002 per microcopy generation
    shortTitles: 0.003, // ~$0.003 per short titles batch
    warmupButtons: 0.004, // ~$0.004 per warmup buttons
    domainTopics: 0.002  // ~$0.002 per domain topics
  };

  // Adjust costs based on model
  let multiplier = 1.0;
  
  if (model.includes('gpt-5')) {
    if (model.includes('nano')) {
      multiplier = 0.5; // GPT-5 Nano is cheaper
    } else if (model.includes('mini')) {
      multiplier = 0.8; // GPT-5 Mini is moderately priced
    } else {
      multiplier = 2.0; // Full GPT-5 is more expensive
    }
  } else if (model.includes('gpt-4')) {
    if (model.includes('mini')) {
      multiplier = 0.3; // GPT-4 Mini is very cheap
    } else {
      multiplier = 1.5; // GPT-4 is expensive
    }
  }

  return {
    embedding: baseCosts.embedding,
    microcopy: baseCosts.microcopy * multiplier,
    shortTitles: baseCosts.shortTitles * multiplier,
    warmupButtons: baseCosts.warmupButtons * multiplier,
    domainTopics: baseCosts.domainTopics * multiplier
  };
}

/**
 * Example: Budget monitoring and alerting
 */
export async function monitorBudgetAndQuality(
  userId: string,
  agent: AgentConfig
): Promise<{
  budgetStatus: {
    dailyUsage: number;
    monthlyUsage: number;
    alertsTriggered: string[];
  };
  qualityStatus: {
    lastEvaluationDate: string | null;
    regressionDetected: boolean;
    recommendedActions: string[];
  };
}> {
  const costTracker = createRequestCostTracker();

  // Get cost analytics for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const analytics = await costTracker.getCostAnalytics(userId, {
    start: thirtyDaysAgo,
    end: new Date()
  });

  // Calculate daily and monthly usage
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const dailyRequests = analytics.topCostlyRequests.filter(
    r => r.timestamp >= startOfDay
  );
  const monthlyRequests = analytics.topCostlyRequests.filter(
    r => r.timestamp >= startOfMonth
  );

  const dailyUsage = dailyRequests.reduce((sum, r) => sum + r.cost, 0);
  const monthlyUsage = monthlyRequests.reduce((sum, r) => sum + r.cost, 0);

  // Check for budget alerts
  const alertsTriggered: string[] = [];
  const dailyBudget = 50.0; // $50 daily budget
  const monthlyBudget = 1000.0; // $1000 monthly budget

  if (dailyUsage > dailyBudget * 0.8) {
    alertsTriggered.push(`Daily budget 80% exceeded: $${dailyUsage.toFixed(2)} / $${dailyBudget}`);
  }

  if (monthlyUsage > monthlyBudget * 0.8) {
    alertsTriggered.push(`Monthly budget 80% exceeded: $${monthlyUsage.toFixed(2)} / $${monthlyBudget}`);
  }

  // Check quality status (simulated)
  const qualityStatus = {
    lastEvaluationDate: new Date().toISOString(),
    regressionDetected: false,
    recommendedActions: [] as string[]
  };

  if (analytics.averageCostPerRequest > 0.1) {
    qualityStatus.recommendedActions.push('High average cost per request detected. Run quality evaluation to check for inefficiencies.');
  }

  if (analytics.requestCount > 1000 && analytics.averageCostPerRequest > 0.05) {
    qualityStatus.recommendedActions.push('High volume with elevated costs. Consider implementing more aggressive caching.');
  }

  return {
    budgetStatus: {
      dailyUsage,
      monthlyUsage,
      alertsTriggered
    },
    qualityStatus
  };
}

/**
 * Example usage and testing
 */
export async function runIntegrationExample(): Promise<void> {
  const agent: AgentConfig = {
    model: 'gpt-5-nano-2025-08-07',
    reasoningEffort: 'minimal',
    verbosity: 'low',
    tempSchema: 0.1,
    tempCopy: 0.3
  } as AgentConfig;

  const userId = 'example-user-123';

  try {
    integrationLogger.info('Starting integration example');

    // Example 1: Process a request with cost tracking
    const requestResult = await processRequestWithCostTracking(
      'req-123',
      'Preciso de ajuda com um problema de direito do consumidor',
      {
        sessionId: 'session-123',
        inboxId: 'inbox-123',
        userId,
        channelType: 'whatsapp'
      },
      agent
    );

    integrationLogger.info('Request processed', {
      totalCost: requestResult.costBreakdown?.totalCost || 0,
      processingTime: requestResult.processingTimeMs
    });

    // Example 2: Run quality evaluation with cost analysis
    const evaluationResult = await runQualityEvaluationWithCostAnalysis(agent, userId);

    integrationLogger.info('Quality evaluation completed', {
      overallAccuracy: evaluationResult.evaluationReport.qualityMetrics.overallClassificationAccuracy,
      totalEvaluationCost: evaluationResult.costAnalysis.totalEvaluationCost,
      regressionDetected: evaluationResult.evaluationReport.regressionDetected
    });

    // Example 3: Monitor budget and quality
    const monitoringResult = await monitorBudgetAndQuality(userId, agent);

    integrationLogger.info('Budget and quality monitoring completed', {
      dailyUsage: monitoringResult.budgetStatus.dailyUsage,
      monthlyUsage: monitoringResult.budgetStatus.monthlyUsage,
      alertsCount: monitoringResult.budgetStatus.alertsTriggered.length,
      recommendedActionsCount: monitoringResult.qualityStatus.recommendedActions.length
    });

    integrationLogger.info('Integration example completed successfully');

  } catch (error) {
    integrationLogger.error('Integration example failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}