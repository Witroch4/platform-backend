import { getRedisInstance, getPrismaInstance } from '@/lib/connections';
import type { PrismaClient } from '@prisma/client';
import { FeatureFlagManager } from './feature-flag-manager';

export interface ABTest {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  variants: {
    control: ABTestVariant;
    treatment: ABTestVariant;
  };
  metrics: ABTestMetric[];
  targetSampleSize: number;
  confidenceLevel: number;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  createdBy: string;
}

export interface ABTestVariant {
  name: string;
  description: string;
  percentage: number;
  config: Record<string, any>;
  flagName: string;
}

export interface ABTestMetric {
  name: string;
  type: 'CONVERSION' | 'NUMERIC' | 'DURATION';
  description: string;
  primaryMetric: boolean;
}

export interface ABTestResult {
  testId: string;
  variant: 'control' | 'treatment';
  metrics: {
    [metricName: string]: {
      value: number;
      count: number;
      conversionRate?: number;
    };
  };
  sampleSize: number;
  statisticalSignificance?: {
    pValue: number;
    confidenceInterval: [number, number];
    significant: boolean;
  };
}

export interface ABTestAssignment {
  testId: string;
  userId: string;
  variant: 'control' | 'treatment';
  assignedAt: Date;
  metadata?: Record<string, any>;
}

export class ABTestingManager {
  private static instance: ABTestingManager;
  private prisma: PrismaClient;
  private redis: ReturnType<typeof getRedisInstance>;
  private featureFlagManager: FeatureFlagManager;

  constructor(prisma?: PrismaClient, redis?: ReturnType<typeof getRedisInstance>) {
    if (!prisma) prisma = getPrismaInstance();
    if (!prisma || !redis) {
      throw new Error('Prisma and Redis instances required for first initialization');
    }
    this.prisma = prisma;
    this.redis = redis;
    this.featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
  }

  static getInstance(prisma?: PrismaClient, redis?: ReturnType<typeof getRedisInstance>): ABTestingManager {
    if (!ABTestingManager.instance) {
      if (!prisma || !redis) {
        throw new Error('Prisma and Redis instances required for first initialization');
      }
      ABTestingManager.instance = new ABTestingManager(prisma, redis);
    }
    return ABTestingManager.instance;
  }

  async createABTest(
    name: string,
    description: string,
    hypothesis: string,
    variants: {
      control: Omit<ABTestVariant, 'flagName'>;
      treatment: Omit<ABTestVariant, 'flagName'>;
    },
    metrics: ABTestMetric[],
    targetSampleSize: number = 1000,
    confidenceLevel: number = 0.95,
    createdBy: string = 'system'
  ): Promise<ABTest> {
    const testId = `ab_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create feature flags for variants
    const controlFlagName = `${testId}_control`;
    const treatmentFlagName = `${testId}_treatment`;

    await this.featureFlagManager.setFeatureFlag(
      controlFlagName,
      false, // Start disabled
      variants.control.percentage,
      { variant: 'control', testId, ...variants.control.config },
      createdBy
    );

    await this.featureFlagManager.setFeatureFlag(
      treatmentFlagName,
      false, // Start disabled
      variants.treatment.percentage,
      { variant: 'treatment', testId, ...variants.treatment.config },
      createdBy
    );

    const test: ABTest = {
      id: testId,
      name,
      description,
      hypothesis,
      status: 'DRAFT',
      variants: {
        control: { ...variants.control, flagName: controlFlagName },
        treatment: { ...variants.treatment, flagName: treatmentFlagName },
      },
      metrics,
      targetSampleSize,
      confidenceLevel,
      startDate: new Date(),
      createdAt: new Date(),
      createdBy,
    };

    // Store test configuration
    await this.redis.setex(
      `ab_test:${testId}`,
      60 * 60 * 24 * 90, // 90 days
      JSON.stringify(test)
    );

    console.log(`[ABTest] Created A/B test: ${testId}`);
    return test;
  }

  async startABTest(testId: string, startedBy: string = 'system'): Promise<void> {
    const test = await this.getABTest(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    if (test.status !== 'DRAFT' && test.status !== 'PAUSED') {
      throw new Error(`Cannot start A/B test in status: ${test.status}`);
    }

    // Enable feature flags
    await this.featureFlagManager.setFeatureFlag(
      test.variants.control.flagName,
      true,
      test.variants.control.percentage,
      { variant: 'control', testId, ...test.variants.control.config },
      startedBy
    );

    await this.featureFlagManager.setFeatureFlag(
      test.variants.treatment.flagName,
      true,
      test.variants.treatment.percentage,
      { variant: 'treatment', testId, ...test.variants.treatment.config },
      startedBy
    );

    // Update test status
    test.status = 'RUNNING';
    test.startDate = new Date();

    await this.redis.setex(
      `ab_test:${testId}`,
      60 * 60 * 24 * 90,
      JSON.stringify(test)
    );

    console.log(`[ABTest] Started A/B test: ${testId}`);
  }

  async stopABTest(testId: string, stoppedBy: string = 'system'): Promise<void> {
    const test = await this.getABTest(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    // Disable feature flags
    await this.featureFlagManager.setFeatureFlag(
      test.variants.control.flagName,
      false,
      0,
      {},
      stoppedBy
    );

    await this.featureFlagManager.setFeatureFlag(
      test.variants.treatment.flagName,
      false,
      0,
      {},
      stoppedBy
    );

    // Update test status
    test.status = 'COMPLETED';
    test.endDate = new Date();

    await this.redis.setex(
      `ab_test:${testId}`,
      60 * 60 * 24 * 90,
      JSON.stringify(test)
    );

    console.log(`[ABTest] Stopped A/B test: ${testId}`);
  }

  async assignUserToVariant(
    testId: string,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<ABTestAssignment> {
    const test = await this.getABTest(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    if (test.status !== 'RUNNING') {
      throw new Error(`A/B test ${testId} is not running`);
    }

    // Check if user is already assigned
    const existingAssignment = await this.getUserAssignment(testId, userId);
    if (existingAssignment) {
      return existingAssignment;
    }

    // Determine variant using consistent hashing
    const hash = this.hashString(`${testId}:${userId}`);
    const bucket = hash % 100;
    
    let variant: 'control' | 'treatment';
    if (bucket < test.variants.control.percentage) {
      variant = 'control';
    } else if (bucket < test.variants.control.percentage + test.variants.treatment.percentage) {
      variant = 'treatment';
    } else {
      // User not in test
      throw new Error('User not selected for A/B test');
    }

    const assignment: ABTestAssignment = {
      testId,
      userId,
      variant,
      assignedAt: new Date(),
      metadata,
    };

    // Store assignment
    await this.redis.setex(
      `ab_test_assignment:${testId}:${userId}`,
      60 * 60 * 24 * 90, // 90 days
      JSON.stringify(assignment)
    );

    // Update assignment count
    await this.redis.hincrby(`ab_test_stats:${testId}`, `${variant}_assignments`, 1);

    console.log(`[ABTest] Assigned user ${userId} to variant ${variant} in test ${testId}`);
    return assignment;
  }

  async recordMetric(
    testId: string,
    userId: string,
    metricName: string,
    value: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const assignment = await this.getUserAssignment(testId, userId);
    if (!assignment) {
      console.warn(`[ABTest] User ${userId} not assigned to test ${testId}, skipping metric`);
      return;
    }

    const metricRecord = {
      testId,
      userId,
      variant: assignment.variant,
      metricName,
      value,
      recordedAt: new Date(),
      metadata,
    };

    // Store individual metric record
    await this.redis.lpush(
      `ab_test_metrics:${testId}:${assignment.variant}:${metricName}`,
      JSON.stringify(metricRecord)
    );

    // Update aggregated stats
    const statsKey = `ab_test_stats:${testId}`;
    const variantMetricKey = `${assignment.variant}_${metricName}`;
    
    await this.redis.hincrby(statsKey, `${variantMetricKey}_count`, 1);
    await this.redis.hincrbyfloat(statsKey, `${variantMetricKey}_sum`, value);

    console.log(`[ABTest] Recorded metric ${metricName}=${value} for user ${userId} in test ${testId}`);
  }

  async getABTestResults(testId: string): Promise<{
    control: ABTestResult;
    treatment: ABTestResult;
    comparison: {
      significant: boolean;
      pValue?: number;
      confidenceInterval?: [number, number];
      recommendation: string;
    };
  }> {
    const test = await this.getABTest(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    const stats = await this.redis.hgetall(`ab_test_stats:${testId}`);
    
    const controlResult = await this.calculateVariantResults(testId, 'control', test.metrics, stats);
    const treatmentResult = await this.calculateVariantResults(testId, 'treatment', test.metrics, stats);

    // Calculate statistical significance for primary metric
    const primaryMetric = test.metrics.find(m => m.primaryMetric);
    let comparison = {
      significant: false,
      recommendation: 'Insufficient data for statistical analysis',
    };

    if (primaryMetric && controlResult.sampleSize > 30 && treatmentResult.sampleSize > 30) {
      const controlValue = controlResult.metrics[primaryMetric.name]?.value || 0;
      const treatmentValue = treatmentResult.metrics[primaryMetric.name]?.value || 0;
      
      // Simple statistical test (in production, use proper statistical libraries)
      const improvement = ((treatmentValue - controlValue) / controlValue) * 100;
      
      comparison = {
        significant: Math.abs(improvement) > 5, // Simplified significance test
        recommendation: improvement > 5 
          ? `Treatment variant shows ${improvement.toFixed(2)}% improvement. Consider implementing.`
          : improvement < -5
          ? `Treatment variant shows ${Math.abs(improvement).toFixed(2)}% decrease. Consider stopping.`
          : 'No significant difference detected. Continue testing or stop.',
      };
    }

    return {
      control: controlResult,
      treatment: treatmentResult,
      comparison,
    };
  }

  async getAllABTests(): Promise<ABTest[]> {
    try {
      const keys = await this.redis.keys('ab_test:*');
      const tests: ABTest[] = [];
      
      for (const key of keys) {
        const testData = await this.redis.get(key);
        if (testData) {
          tests.push(JSON.parse(testData));
        }
      }
      
      return tests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error: unknown) {
      console.error('[ABTest] Error getting all A/B tests:', error);
      return [];
    }
  }

  private async getABTest(testId: string): Promise<ABTest | null> {
    try {
      const testData = await this.redis.get(`ab_test:${testId}`);
      return testData ? JSON.parse(testData) : null;
    } catch (error: unknown) {
      console.error(`[ABTest] Error getting test ${testId}:`, error);
      return null;
    }
  }

  private async getUserAssignment(testId: string, userId: string): Promise<ABTestAssignment | null> {
    try {
      const assignmentData = await this.redis.get(`ab_test_assignment:${testId}:${userId}`);
      return assignmentData ? JSON.parse(assignmentData) : null;
    } catch (error: unknown) {
      console.error(`[ABTest] Error getting assignment for user ${userId} in test ${testId}:`, error);
      return null;
    }
  }

  private async calculateVariantResults(
    testId: string,
    variant: 'control' | 'treatment',
    metrics: ABTestMetric[],
    stats: Record<string, string>
  ): Promise<ABTestResult> {
    const result: ABTestResult = {
      testId,
      variant,
      metrics: {},
      sampleSize: parseInt(stats[`${variant}_assignments`] || '0'),
    };

    for (const metric of metrics) {
      const count = parseInt(stats[`${variant}_${metric.name}_count`] || '0');
      const sum = parseFloat(stats[`${variant}_${metric.name}_sum`] || '0');
      
      result.metrics[metric.name] = {
        value: count > 0 ? sum / count : 0,
        count,
      };

      if (metric.type === 'CONVERSION') {
        result.metrics[metric.name].conversionRate = result.sampleSize > 0 
          ? (count / result.sampleSize) * 100 
          : 0;
      }
    }

    return result;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Utility function to create common A/B tests
export async function createWebhookPerformanceTest(): Promise<string> {
  try {
    const prisma = getPrismaInstance();
    const redis = getRedisInstance();
    
    const abTestManager = ABTestingManager.getInstance(prisma, redis);
    
    const test = await abTestManager.createABTest(
      'Webhook Performance Test',
      'Test new webhook processing vs legacy processing',
      'New webhook processing will improve response times by 50%',
      {
        control: {
          name: 'Legacy Webhook',
          description: 'Current webhook processing',
          percentage: 50,
          config: { useNewWebhook: false },
        },
        treatment: {
          name: 'New Webhook',
          description: 'Optimized webhook processing',
          percentage: 50,
          config: { useNewWebhook: true },
        },
      },
      [
        {
          name: 'response_time',
          type: 'DURATION',
          description: 'Webhook response time in milliseconds',
          primaryMetric: true,
        },
        {
          name: 'success_rate',
          type: 'CONVERSION',
          description: 'Successful webhook processing rate',
          primaryMetric: false,
        },
      ],
      2000, // Target sample size
      0.95, // 95% confidence level
      'system-ab-test'
    );

    console.log(`[ABTest] Created webhook performance test: ${test.id}`);
    return test.id;
  } catch (error: unknown) {
    console.error('[ABTest] Error creating webhook performance test:', error);
    throw error;
  }
}