/**
 * Unit tests for TURBO Mode Service
 * Tests flag evaluation logic and user eligibility checking
 */

import { TurboModeService } from '../turbo-mode-service';
import { FeatureFlagManager } from '../feature-flag-manager';
import { getPrismaInstance, getRedisInstance } from '@/lib/connections';
import log from '@/lib/utils/logger';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/lib/utils/logger');
jest.mock('../feature-flag-manager');

const mockPrisma = {
  featureFlag: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  userFeatureFlagOverride: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scard: jest.fn(),
  smembers: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  llen: jest.fn(),
};

const mockFlagManager = {
  setFeatureFlag: jest.fn(),
  evaluate: jest.fn(),
  getFeatureFlag: jest.fn(),
  getAllFlags: jest.fn(),
  getInstance: jest.fn(),
};

describe('TurboModeService', () => {
  let turboModeService: TurboModeService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    (getPrismaInstance as jest.Mock).mockReturnValue(mockPrisma);
    (getRedisInstance as jest.Mock).mockReturnValue(mockRedis);
    (FeatureFlagManager.getInstance as jest.Mock).mockReturnValue(mockFlagManager);
    
    turboModeService = TurboModeService.getInstance();
  });

  describe('initializeTurboModeFlag', () => {
    it('should initialize TURBO mode flag with correct settings', async () => {
      mockFlagManager.setFeatureFlag.mockResolvedValue({
        id: 'test-flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE',
        enabled: false
      });

      await turboModeService.initializeTurboModeFlag();

      expect(mockFlagManager.setFeatureFlag).toHaveBeenCalledWith(
        'BATCH_PROCESSING_TURBO_MODE',
        false,
        0,
        expect.objectContaining({
          category: 'processing',
          userSpecific: true,
          systemCritical: false,
          maxParallelLeads: 10,
          resourceThreshold: 80,
          timeoutMs: 300000
        }),
        'turbo-mode-init'
      );

      expect(log.info).toHaveBeenCalledWith(
        '[TurboMode] TURBO mode feature flag initialized',
        expect.objectContaining({
          flagName: 'BATCH_PROCESSING_TURBO_MODE',
          enabled: false,
          rollout: 0
        })
      );
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Database connection failed');
      mockFlagManager.setFeatureFlag.mockRejectedValue(error);

      await expect(turboModeService.initializeTurboModeFlag()).rejects.toThrow(error);

      expect(log.error).toHaveBeenCalledWith(
        '[TurboMode] Failed to initialize TURBO mode flag',
        { error }
      );
    });
  });

  describe('isTurboModeEnabled', () => {
    const userId = 'test-user-123';

    it('should return true when user has enabled override', async () => {
      mockRedis.get.mockResolvedValue('true');

      const result = await turboModeService.isTurboModeEnabled(userId);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`turbo_mode_override:${userId}`);
      expect(log.info).toHaveBeenCalledWith(
        '[TurboMode] User override found',
        { userId, enabled: true }
      );
    });

    it('should return false when user has disabled override', async () => {
      mockRedis.get.mockResolvedValue('false');

      const result = await turboModeService.isTurboModeEnabled(userId);

      expect(result).toBe(false);
      expect(log.info).toHaveBeenCalledWith(
        '[TurboMode] User override found',
        { userId, enabled: false }
      );
    });

    it('should check global flag when no user override exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.userFeatureFlagOverride.findFirst.mockResolvedValue(null);
      mockFlagManager.evaluate.mockResolvedValue({
        enabled: true,
        reason: 'Global flag enabled'
      });

      const result = await turboModeService.isTurboModeEnabled(userId);

      expect(result).toBe(true);
      expect(mockFlagManager.evaluate).toHaveBeenCalledWith(
        'BATCH_PROCESSING_TURBO_MODE',
        userId,
        undefined,
        { userId }
      );
    });

    it('should return false on error', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.userFeatureFlagOverride.findFirst.mockResolvedValue(null);
      mockFlagManager.evaluate.mockRejectedValue(new Error('Redis error'));

      const result = await turboModeService.isTurboModeEnabled(userId);

      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith(
        '[TurboMode] Error checking TURBO mode status',
        expect.objectContaining({ userId })
      );
    });
  });

  describe('checkUserEligibility', () => {
    const userId = 'test-user-123';

    it('should return eligible when all checks pass', async () => {
      // Mock TURBO mode enabled
      mockRedis.get.mockResolvedValue('true');
      
      // Mock system resources available
      mockRedis.scard.mockResolvedValue(5); // 5 active processes
      mockRedis.llen.mockResolvedValue(10); // 10 items in queue
      
      // Mock config
      mockFlagManager.getAllFlags.mockResolvedValue([{
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE',
        enabled: true,
        metadata: {
          maxParallelLeads: 10,
          resourceThreshold: 80,
          timeoutMs: 300000
        }
      }]);

      const result = await turboModeService.checkUserEligibility(userId);

      expect(result.eligible).toBe(true);
      expect(result.reason).toBe('All eligibility checks passed');
      expect(result.config).toBeDefined();
      expect(result.config?.maxParallelLeads).toBe(10);
    });

    it('should return not eligible when TURBO mode is disabled', async () => {
      mockRedis.get.mockResolvedValue('false');

      const result = await turboModeService.checkUserEligibility(userId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('TURBO mode not enabled for user');
      expect(result.config).toBeUndefined();
    });

    it('should return not eligible when system resources are constrained', async () => {
      // Mock TURBO mode enabled
      mockRedis.get.mockResolvedValue('true');
      
      // Mock system resources constrained
      mockRedis.scard.mockResolvedValue(10); // 10 active processes (at limit)
      
      // Mock config
      mockFlagManager.getAllFlags.mockResolvedValue([{
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE',
        enabled: true,
        metadata: {
          maxParallelLeads: 10,
          resourceThreshold: 80
        }
      }]);

      const result = await turboModeService.checkUserEligibility(userId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('System resources constrained');
    });

    it('should handle eligibility check errors gracefully', async () => {
      // Mock TURBO mode check to fail completely
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      mockPrisma.userFeatureFlagOverride.findFirst.mockRejectedValue(new Error('DB error'));
      mockFlagManager.evaluate.mockRejectedValue(new Error('Flag error'));

      const result = await turboModeService.checkUserEligibility(userId);

      // Should return not eligible but not crash
      expect(result.eligible).toBe(false);
      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('enableTurboModeForUser', () => {
    const userId = 'test-user-123';
    const adminUserId = 'admin-456';
    const reason = 'Premium user upgrade';

    it('should enable TURBO mode for user', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE'
      });
      
      mockPrisma.userFeatureFlagOverride.upsert.mockResolvedValue({
        id: 'override-id',
        userId,
        enabled: true
      });

      await turboModeService.enableTurboModeForUser(userId, adminUserId, reason);

      expect(mockPrisma.userFeatureFlagOverride.upsert).toHaveBeenCalledWith({
        where: {
          userId_flagId: {
            userId,
            flagId: 'flag-id'
          }
        },
        update: {
          enabled: true,
          updatedAt: expect.any(Date)
        },
        create: {
          userId,
          flagId: 'flag-id',
          enabled: true,
          createdBy: adminUserId
        }
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `turbo_mode_override:${userId}`,
        300,
        'true'
      );

      expect(log.info).toHaveBeenCalledWith(
        '[TurboMode] TURBO mode enabled for user',
        { userId, adminUserId, reason }
      );
    });

    it('should handle enable errors', async () => {
      const error = new Error('Database error');
      mockPrisma.featureFlag.findUnique.mockRejectedValue(error);

      await expect(
        turboModeService.enableTurboModeForUser(userId, adminUserId, reason)
      ).rejects.toThrow(error);

      expect(log.error).toHaveBeenCalledWith(
        '[TurboMode] Failed to enable TURBO mode for user',
        expect.objectContaining({ userId, adminUserId, error })
      );
    });
  });

  describe('disableTurboModeForUser', () => {
    const userId = 'test-user-123';
    const adminUserId = 'admin-456';
    const reason = 'Subscription expired';

    it('should disable TURBO mode for user', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE'
      });
      
      mockPrisma.userFeatureFlagOverride.upsert.mockResolvedValue({
        id: 'override-id',
        userId,
        enabled: false
      });

      await turboModeService.disableTurboModeForUser(userId, adminUserId, reason);

      expect(mockPrisma.userFeatureFlagOverride.upsert).toHaveBeenCalledWith({
        where: {
          userId_flagId: {
            userId,
            flagId: 'flag-id'
          }
        },
        update: {
          enabled: false,
          updatedAt: expect.any(Date)
        },
        create: {
          userId,
          flagId: 'flag-id',
          enabled: false,
          createdBy: adminUserId
        }
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `turbo_mode_override:${userId}`,
        300,
        'false'
      );

      expect(log.info).toHaveBeenCalledWith(
        '[TurboMode] TURBO mode disabled for user',
        { userId, adminUserId, reason }
      );
    });
  });

  describe('checkSystemResources', () => {
    it('should return available when resources are within limits', async () => {
      mockRedis.scard.mockResolvedValue(5); // 5 active processes
      mockRedis.llen.mockResolvedValue(10); // 10 items in queue
      
      mockFlagManager.getAllFlags.mockResolvedValue([{
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE',
        enabled: true,
        metadata: {
          maxParallelLeads: 10,
          resourceThreshold: 80
        }
      }]);

      const result = await turboModeService.checkSystemResources();

      expect(result.available).toBe(true);
      expect(result.reason).toBe('Resources available');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.activeProcesses).toBe(5);
    });

    it('should return unavailable when active processes exceed limit', async () => {
      mockRedis.scard.mockResolvedValue(10); // 10 active processes (at limit)
      
      mockFlagManager.getAllFlags.mockResolvedValue([{
        id: 'flag-id',
        name: 'BATCH_PROCESSING_TURBO_MODE',
        enabled: true,
        metadata: {
          maxParallelLeads: 10,
          resourceThreshold: 80
        }
      }]);

      const result = await turboModeService.checkSystemResources();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Maximum parallel processes reached');
    });

    it('should handle resource check errors gracefully', async () => {
      // Mock all Redis operations to fail
      mockRedis.scard.mockRejectedValue(new Error('Redis error'));
      mockRedis.llen.mockRejectedValue(new Error('Redis error'));
      mockFlagManager.getAllFlags.mockRejectedValue(new Error('Config error'));

      const result = await turboModeService.checkSystemResources();

      // Should not crash and return a valid response structure
      expect(result).toBeDefined();
      expect(typeof result.available).toBe('boolean');
      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
      expect(result.metrics).toBeDefined();
    });
  });

  describe('getTurboModeStats', () => {
    it('should return correct statistics', async () => {
      mockPrisma.userFeatureFlagOverride.findMany.mockResolvedValue([
        { userId: 'user1', enabled: true },
        { userId: 'user2', enabled: false },
        { userId: 'user3', enabled: true }
      ]);

      // Mock all Redis calls for resource metrics
      mockRedis.scard.mockResolvedValue(3); // 3 active processes
      mockRedis.llen.mockResolvedValue(5); // 5 items in queue

      const result = await turboModeService.getTurboModeStats();

      expect(result.totalUsers).toBe(3);
      expect(result.enabledUsers).toBe(2);
      expect(result.activeProcesses).toBe(3);
      expect(result.resourceUtilization).toBeDefined();
    });

    it('should handle stats errors', async () => {
      mockPrisma.userFeatureFlagOverride.findMany.mockRejectedValue(
        new Error('Database error')
      );

      const result = await turboModeService.getTurboModeStats();

      expect(result.totalUsers).toBe(0);
      expect(result.enabledUsers).toBe(0);
      expect(result.activeProcesses).toBe(0);
      expect(log.error).toHaveBeenCalledWith(
        '[TurboMode] Error getting TURBO mode stats',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('getTurboModeConfig', () => {
    it('should return config from flag metadata', async () => {
      mockFlagManager.getAllFlags.mockResolvedValue([
        {
          id: 'flag-id',
          name: 'BATCH_PROCESSING_TURBO_MODE',
          enabled: true,
          metadata: {
            maxParallelLeads: 15,
            resourceThreshold: 90,
            timeoutMs: 600000,
            fallbackOnError: false
          }
        }
      ]);

      const result = await turboModeService.getTurboModeConfig();

      expect(result.enabled).toBe(true);
      expect(result.maxParallelLeads).toBe(15);
      expect(result.resourceThreshold).toBe(90);
      expect(result.timeoutMs).toBe(600000);
      expect(result.fallbackOnError).toBe(false);
    });

    it('should return default config when flag not found', async () => {
      mockFlagManager.getAllFlags.mockResolvedValue([]);

      const result = await turboModeService.getTurboModeConfig();

      expect(result.enabled).toBe(false);
      expect(result.maxParallelLeads).toBe(10);
      expect(result.resourceThreshold).toBe(80);
      expect(result.timeoutMs).toBe(300000);
      expect(result.fallbackOnError).toBe(true);
    });

    it('should handle config errors', async () => {
      mockFlagManager.getAllFlags.mockRejectedValue(new Error('Config error'));

      const result = await turboModeService.getTurboModeConfig();

      expect(result).toEqual({
        enabled: false,
        maxParallelLeads: 10,
        resourceThreshold: 80,
        fallbackOnError: true,
        timeoutMs: 300000
      });

      expect(log.error).toHaveBeenCalledWith(
        '[TurboMode] Error getting TURBO mode config',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});