import { FeatureFlagManager } from '@/lib/feature-flags/feature-flag-manager';
import { RollbackManager } from '@/lib/feature-flags/rollback-manager';
import { ABTestingManager } from '@/lib/feature-flags/ab-testing-manager';
import { FeedbackCollector } from '@/lib/feedback/feedback-collector';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('ioredis');

const mockPrisma = {
  featureFlag: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  userFeedback: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
} as any;

const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  hgetall: jest.fn(),
  hincrby: jest.fn(),
  hincrbyfloat: jest.fn(),
  lpush: jest.fn(),
  lrange: jest.fn(),
  keys: jest.fn(),
  expire: jest.fn(),
} as any;

describe('Feature Flag System', () => {
  let featureFlagManager: FeatureFlagManager;
  let rollbackManager: RollbackManager;
  let abTestManager: ABTestingManager;
  let feedbackCollector: FeedbackCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instances
    (FeatureFlagManager as any).instance = null;
    (RollbackManager as any).instance = null;
    (ABTestingManager as any).instance = null;
    (FeedbackCollector as any).instance = null;

    featureFlagManager = FeatureFlagManager.getInstance(mockPrisma, mockRedis);
    rollbackManager = RollbackManager.getInstance(mockPrisma, mockRedis);
    abTestManager = ABTestingManager.getInstance(mockPrisma, mockRedis);
    feedbackCollector = FeedbackCollector.getInstance(mockPrisma, mockRedis);
  });

  describe('FeatureFlagManager', () => {
    it('should create and store a feature flag', async () => {
      const mockFlag = {
        id: 'test-id',
        name: 'TEST_FLAG',
        description: 'Test flag',
        enabled: true,
        rolloutPercentage: 50,
        conditions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
      };

      mockPrisma.featureFlag.upsert.mockResolvedValue(mockFlag);

      const result = await featureFlagManager.setFeatureFlag(
        'TEST_FLAG',
        true,
        50,
        {},
        'test-user'
      );

      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: { name: 'TEST_FLAG' },
        update: {
          enabled: true,
          rolloutPercentage: 50,
          conditions: {},
          updatedAt: expect.any(Date),
        },
        create: {
          name: 'TEST_FLAG',
          description: 'Feature flag for TEST_FLAG',
          enabled: true,
          rolloutPercentage: 50,
          conditions: {},
          createdBy: 'test-user',
        },
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'feature_flag:TEST_FLAG',
        300,
        JSON.stringify(mockFlag)
      );

      expect(result).toEqual(mockFlag);
    });

    it('should evaluate feature flag correctly', async () => {
      const mockFlag = {
        id: 'test-id',
        name: 'TEST_FLAG',
        enabled: true,
        rolloutPercentage: 100,
        conditions: {},
      };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFlag);
      mockRedis.get.mockResolvedValue(null);

      const evaluation = await featureFlagManager.evaluate('TEST_FLAG', 'user123');

      expect(evaluation.enabled).toBe(true);
      expect(evaluation.reason).toBe('All checks passed');
    });

    it('should handle rollout percentage correctly', async () => {
      const mockFlag = {
        id: 'test-id',
        name: 'TEST_FLAG',
        enabled: true,
        rolloutPercentage: 0, // 0% rollout
        conditions: {},
      };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFlag);
      mockRedis.get.mockResolvedValue(null);

      const evaluation = await featureFlagManager.evaluate('TEST_FLAG', 'user123');

      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('Outside rollout percentage');
    });
  });

  describe('RollbackManager', () => {
    it('should create a rollback plan', async () => {
      // Mock getAllFlags method
      const mockGetAllFlags = jest.fn().mockResolvedValue([
        {
          name: 'TEST_FLAG',
          enabled: true,
          rolloutPercentage: 100,
          conditions: {},
        },
      ]);
      
      // Mock the FeatureFlagManager instance
      (featureFlagManager as any).getAllFlags = mockGetAllFlags;

      const plan = await rollbackManager.createRollbackPlan(
        'Test Rollback',
        'Test rollback plan',
        ['TEST_FLAG'],
        'test-user'
      );

      expect(plan.name).toBe('Test Rollback');
      expect(plan.flags).toHaveLength(1);
      expect(plan.flags[0].flagName).toBe('TEST_FLAG');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should execute emergency rollback', async () => {
      // Mock getAllFlags method
      const mockGetAllFlags = jest.fn().mockResolvedValue([
        {
          name: 'TEST_FLAG',
          enabled: true,
          rolloutPercentage: 100,
          conditions: {},
        },
      ]);
      
      // Mock the FeatureFlagManager instance and its methods
      (featureFlagManager as any).getAllFlags = mockGetAllFlags;
      (featureFlagManager as any).setFeatureFlag = jest.fn().mockResolvedValue({});

      // Mock Redis to return the rollback plan
      const mockPlan = {
        id: 'test-plan-id',
        name: 'Emergency Rollback',
        flags: [
          {
            flagName: 'TEST_FLAG',
            previousState: { enabled: true, rolloutPercentage: 100, conditions: {} },
            rollbackState: { enabled: false, rolloutPercentage: 0, conditions: {} },
          },
        ],
      };
      
      mockRedis.get.mockResolvedValue(JSON.stringify(mockPlan));

      const execution = await rollbackManager.emergencyRollback(
        ['TEST_FLAG'],
        'Emergency test',
        'test-user'
      );

      expect(execution.success).toBe(true);
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'rollback_executions',
        expect.stringContaining('test-user')
      );
    });
  });

  describe('ABTestingManager', () => {
    it('should create an A/B test', async () => {
      mockPrisma.featureFlag.upsert = jest.fn().mockResolvedValue({});

      const test = await abTestManager.createABTest(
        'Test A/B Test',
        'Test description',
        'Test hypothesis',
        {
          control: {
            name: 'Control',
            description: 'Control variant',
            percentage: 50,
            config: { feature: false },
          },
          treatment: {
            name: 'Treatment',
            description: 'Treatment variant',
            percentage: 50,
            config: { feature: true },
          },
        },
        [
          {
            name: 'conversion_rate',
            type: 'CONVERSION',
            description: 'Conversion rate',
            primaryMetric: true,
          },
        ]
      );

      expect(test.name).toBe('Test A/B Test');
      expect(test.status).toBe('DRAFT');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should assign users to variants consistently', async () => {
      const mockTest = {
        id: 'test-123',
        status: 'RUNNING',
        variants: {
          control: { percentage: 50 },
          treatment: { percentage: 50 },
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockTest));
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.hincrby.mockResolvedValue(1);

      const assignment1 = await abTestManager.assignUserToVariant('test-123', 'user1');
      const assignment2 = await abTestManager.assignUserToVariant('test-123', 'user1');

      // Same user should get same variant
      expect(assignment1.variant).toBe(assignment2.variant);
    });
  });

  describe('FeedbackCollector', () => {
    it('should submit feedback successfully', async () => {
      const mockFeedback = {
        id: 'feedback-123',
        userId: 'user123',
        type: 'BUG_REPORT',
        category: 'ui',
        title: 'Test Bug',
        description: 'Test bug description',
        severity: 'MEDIUM',
        status: 'OPEN',
        metadata: {},
        systemContext: {
          userAgent: 'test-agent',
          url: 'test-url',
          timestamp: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userFeedback.create.mockResolvedValue(mockFeedback);

      const result = await feedbackCollector.submitFeedback(
        'user123',
        'BUG_REPORT',
        'ui',
        'Test Bug',
        'Test bug description',
        'MEDIUM'
      );

      expect(mockPrisma.userFeedback.create).toHaveBeenCalled();
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'feedback_queue',
        expect.stringContaining('user123')
      );
      expect(result.title).toBe('Test Bug');
    });

    it('should submit feature flag feedback', async () => {
      mockPrisma.userFeedback.create.mockResolvedValue({});
      mockPrisma.userFeedback.update.mockResolvedValue({});

      const result = await feedbackCollector.submitFeatureFlagFeedback(
        'user123',
        'TEST_FLAG',
        true,
        'treatment',
        'POSITIVE',
        'Great feature!'
      );

      expect(mockPrisma.userFeedback.create).toHaveBeenCalled();
      expect(mockPrisma.userFeedback.update).toHaveBeenCalled();
      expect(mockRedis.hincrby).toHaveBeenCalledWith(
        'feature_flag_feedback:TEST_FLAG',
        'positive',
        1
      );
    });

    it('should analyze feedback sentiment', async () => {
      const feedback = {
        id: 'test-id',
        userId: 'user123',
        type: 'BUG_REPORT' as const,
        category: 'ui',
        title: 'This is terrible and slow',
        description: 'The system is broken and awful',
        severity: 'HIGH' as const,
        status: 'OPEN' as const,
        metadata: {},
        systemContext: {
          userAgent: 'test',
          url: 'test',
          timestamp: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const analysis = await feedbackCollector.analyzeFeedback(feedback);

      expect(analysis.sentiment).toBe('NEGATIVE');
      expect(analysis.urgency).toBeGreaterThan(5);
      expect(analysis.actionRequired).toBe(true);
      expect(analysis.keywords).toContain('terrible');
    });
  });
});

describe('Integration Tests', () => {
  it('should handle feature flag rollback with feedback', async () => {
    // Reset singletons
    (FeatureFlagManager as any).instance = null;
    (RollbackManager as any).instance = null;
    (FeedbackCollector as any).instance = null;

    const featureFlagManager = FeatureFlagManager.getInstance(mockPrisma, mockRedis);
    const rollbackManager = RollbackManager.getInstance(mockPrisma, mockRedis);
    const feedbackCollector = FeedbackCollector.getInstance(mockPrisma, mockRedis);

    // Mock FeatureFlagManager methods
    (featureFlagManager as any).getAllFlags = jest.fn().mockResolvedValue([
      { name: 'TEST_FLAG', enabled: true, rolloutPercentage: 100, conditions: {} },
    ]);
    (featureFlagManager as any).setFeatureFlag = jest.fn().mockResolvedValue({});

    // Mock Redis to return rollback plan
    const mockPlan = {
      id: 'integration-test-plan',
      name: 'Emergency Rollback',
      flags: [
        {
          flagName: 'TEST_FLAG',
          previousState: { enabled: true, rolloutPercentage: 100, conditions: {} },
          rollbackState: { enabled: false, rolloutPercentage: 0, conditions: {} },
        },
      ],
    };
    
    mockRedis.get.mockResolvedValue(JSON.stringify(mockPlan));
    mockPrisma.userFeedback.create.mockResolvedValue({});
    mockPrisma.userFeedback.update.mockResolvedValue({});

    // Submit negative feedback about feature flag
    await feedbackCollector.submitFeatureFlagFeedback(
      'user123',
      'TEST_FLAG',
      true,
      undefined,
      'NEGATIVE',
      'This feature is causing issues'
    );

    // Execute rollback
    const execution = await rollbackManager.emergencyRollback(
      ['TEST_FLAG'],
      'Negative user feedback',
      'system'
    );

    expect(execution.success).toBe(true);
    expect(mockRedis.lpush).toHaveBeenCalledWith(
      'system_alerts',
      expect.stringContaining('ROLLBACK_EXECUTED')
    );
  });
});