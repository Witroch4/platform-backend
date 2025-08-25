/**
 * Test for Feature Flag database schema extensions
 * Verifies that the new columns and tables work correctly with the singleton connection
 */

import { getPrismaInstance } from '../../lib/connections';

describe('Feature Flag Schema Extensions', () => {
  const prisma = getPrismaInstance();
  let testUser: any;

  beforeAll(async () => {
    // Ensure database connection is ready
    await prisma.$connect();
    
    // Create a test user for foreign key constraints
    testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User'
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.userFeatureFlagOverride.deleteMany();
    await prisma.featureFlagMetrics.deleteMany();
    await prisma.featureFlag.deleteMany();
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    await prisma.$disconnect();
  });

  describe('FeatureFlag model extensions', () => {
    it('should create a feature flag with new columns', async () => {
      const featureFlag = await prisma.featureFlag.create({
        data: {
          name: 'test-batch-turbo-mode',
          description: 'Test feature flag for batch turbo mode',
          enabled: true,
          rolloutPercentage: 50,
          category: 'batch-processing',
          userSpecific: true,
          systemCritical: false,
          metadata: {
            maxBatchSize: 1000,
            timeoutMs: 30000,
            priority: 'high'
          },
          createdBy: testUser.id
        }
      });

      expect(featureFlag).toBeDefined();
      expect(featureFlag.category).toBe('batch-processing');
      expect(featureFlag.userSpecific).toBe(true);
      expect(featureFlag.systemCritical).toBe(false);
      expect(featureFlag.metadata).toEqual({
        maxBatchSize: 1000,
        timeoutMs: 30000,
        priority: 'high'
      });
    });

    it('should use default values for new columns', async () => {
      const featureFlag = await prisma.featureFlag.create({
        data: {
          name: 'test-default-values',
          description: 'Test default values',
          createdBy: testUser.id
        }
      });

      expect(featureFlag.category).toBe('system');
      expect(featureFlag.userSpecific).toBe(false);
      expect(featureFlag.systemCritical).toBe(false);
      expect(featureFlag.metadata).toEqual({});
    });
  });

  describe('UserFeatureFlagOverride model', () => {
    let testFlag: any;

    beforeEach(async () => {
      testFlag = await prisma.featureFlag.create({
        data: {
          name: `test-override-${Date.now()}`,
          description: 'Test flag for overrides',
          createdBy: testUser.id
        }
      });
    });

    it('should create user-specific feature flag override', async () => {
      const override = await prisma.userFeatureFlagOverride.create({
        data: {
          userId: testUser.id,
          flagId: testFlag.id,
          enabled: true,
          createdBy: testUser.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
        }
      });

      expect(override).toBeDefined();
      expect(override.userId).toBe(testUser.id);
      expect(override.flagId).toBe(testFlag.id);
      expect(override.enabled).toBe(true);
      expect(override.expiresAt).toBeDefined();
    });

    it('should enforce unique constraint on userId and flagId', async () => {
      // Create first override
      await prisma.userFeatureFlagOverride.create({
        data: {
          userId: testUser.id,
          flagId: testFlag.id,
          enabled: true,
          createdBy: testUser.id
        }
      });

      // Attempt to create duplicate should fail
      await expect(
        prisma.userFeatureFlagOverride.create({
          data: {
            userId: testUser.id,
            flagId: testFlag.id,
            enabled: false,
            createdBy: testUser.id
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('FeatureFlagMetrics model', () => {
    let testFlag: any;

    beforeEach(async () => {
      testFlag = await prisma.featureFlag.create({
        data: {
          name: `test-metrics-${Date.now()}`,
          description: 'Test flag for metrics',
          createdBy: testUser.id
        }
      });
    });

    it('should create feature flag metrics', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const metrics = await prisma.featureFlagMetrics.create({
        data: {
          flagId: testFlag.id,
          evaluations: 100,
          enabledCount: 75,
          disabledCount: 25,
          averageLatencyMs: 12.5,
          lastEvaluatedAt: new Date(),
          date: today
        }
      });

      expect(metrics).toBeDefined();
      expect(metrics.flagId).toBe(testFlag.id);
      expect(metrics.evaluations).toBe(100);
      expect(metrics.enabledCount).toBe(75);
      expect(metrics.disabledCount).toBe(25);
      expect(metrics.averageLatencyMs).toBe(12.5);
    });

    it('should enforce unique constraint on flagId and date', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Create first metrics entry
      await prisma.featureFlagMetrics.create({
        data: {
          flagId: testFlag.id,
          evaluations: 50,
          enabledCount: 30,
          disabledCount: 20,
          date: today
        }
      });

      // Attempt to create duplicate for same flag and date should fail
      await expect(
        prisma.featureFlagMetrics.create({
          data: {
            flagId: testFlag.id,
            evaluations: 75,
            enabledCount: 45,
            disabledCount: 30,
            date: today
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Relations', () => {
    let testFlag: any;

    beforeEach(async () => {
      testFlag = await prisma.featureFlag.create({
        data: {
          name: `test-relations-${Date.now()}`,
          description: 'Test flag for relations',
          createdBy: testUser.id
        }
      });
    });

    it('should load feature flag with user overrides and metrics', async () => {
      // Create override and metrics
      await prisma.userFeatureFlagOverride.create({
        data: {
          userId: testUser.id,
          flagId: testFlag.id,
          enabled: true,
          createdBy: testUser.id
        }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.featureFlagMetrics.create({
        data: {
          flagId: testFlag.id,
          evaluations: 50,
          enabledCount: 30,
          disabledCount: 20,
          date: today
        }
      });

      // Load flag with relations
      const flagWithRelations = await prisma.featureFlag.findUnique({
        where: { id: testFlag.id },
        include: {
          userOverrides: true,
          metrics: true
        }
      });

      expect(flagWithRelations).toBeDefined();
      expect(flagWithRelations!.userOverrides).toHaveLength(1);
      expect(flagWithRelations!.metrics).toHaveLength(1);
      expect(flagWithRelations!.userOverrides[0].userId).toBe(testUser.id);
      expect(flagWithRelations!.metrics[0].evaluations).toBe(50);
    });
  });
});