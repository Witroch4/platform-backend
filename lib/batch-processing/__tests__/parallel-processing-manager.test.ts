/**
 * Unit tests for Parallel Processing Manager
 * Tests parallel processing coordination and error handling
 */

import { ParallelProcessingManager, ProcessingTask } from '../parallel-processing-manager';
import { getTurboModeService } from '@/lib/feature-flags/turbo-mode-service';
import { getRedisInstance } from '@/lib/connections';
import log from '@/lib/utils/logger';

// Mock dependencies
jest.mock('@/lib/feature-flags/turbo-mode-service');
jest.mock('@/lib/connections');
jest.mock('@/lib/utils/logger');

const mockRedis = {
  sadd: jest.fn(),
  srem: jest.fn(),
  scard: jest.fn(),
  smembers: jest.fn(),
  lrange: jest.fn(),
  lpush: jest.fn(),
  ltrim: jest.fn(),
};

const mockTurboModeService = {
  checkUserEligibility: jest.fn(),
};

describe('ParallelProcessingManager', () => {
  let parallelManager: ParallelProcessingManager;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    
    (getRedisInstance as jest.Mock).mockReturnValue(mockRedis);
    (getTurboModeService as jest.Mock).mockReturnValue(mockTurboModeService);
    
    parallelManager = ParallelProcessingManager.getInstance();
  });

  describe('processInParallel', () => {
    const mockTasks: ProcessingTask[] = [
      {
        id: 'task-1',
        leadId: 'lead-1',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'data1' },
        createdAt: new Date()
      },
      {
        id: 'task-2',
        leadId: 'lead-2',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'data2' },
        createdAt: new Date()
      }
    ];

    const mockProcessor = jest.fn();

    it('should process tasks in parallel when TURBO mode is available', async () => {
      // Mock TURBO mode eligibility
      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        reason: 'All checks passed',
        config: {
          enabled: true,
          maxParallelLeads: 10,
          resourceThreshold: 80,
          timeoutMs: 300000
        }
      });

      // Mock successful processing
      mockProcessor
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const results = await parallelManager.processInParallel(
        mockTasks,
        mockProcessor,
        userId
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe('result1');
      expect(results[1].success).toBe(true);
      expect(results[1].result).toBe('result2');

      expect(mockProcessor).toHaveBeenCalledTimes(2);
      expect(log.info).toHaveBeenCalledWith(
        '[ParallelProcessing] Starting parallel processing',
        expect.objectContaining({
          userId,
          totalTasks: 2,
          batchSize: 2
        })
      );
    });

    it('should fallback to sequential processing when TURBO mode is not available', async () => {
      // Mock TURBO mode not eligible
      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: false,
        reason: 'TURBO mode disabled'
      });

      // Mock successful processing
      mockProcessor
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const results = await parallelManager.processInParallel(
        mockTasks,
        mockProcessor,
        userId
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      expect(log.warn).toHaveBeenCalledWith(
        '[ParallelProcessing] TURBO mode not available, falling back to sequential',
        expect.objectContaining({
          userId,
          reason: 'TURBO mode disabled'
        })
      );
    });

    it('should handle processing errors gracefully', async () => {
      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        config: {
          enabled: true,
          maxParallelLeads: 10,
          timeoutMs: 300000
        }
      });

      // Mock one success, one failure (with retries)
      mockProcessor
        .mockResolvedValueOnce('result1')
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockRejectedValueOnce(new Error('Processing failed'));

      const results = await parallelManager.processInParallel(
        mockTasks,
        mockProcessor,
        userId
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Processing failed');
    });

    it('should process multiple batches when needed', async () => {
      const largeMockTasks: ProcessingTask[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i + 1}`,
        leadId: `lead-${i + 1}`,
        type: 'pdf_unification',
        priority: 1,
        data: { test: `data${i + 1}` },
        createdAt: new Date()
      }));

      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        config: {
          enabled: true,
          maxParallelLeads: 5,
          timeoutMs: 300000
        }
      });

      // Mock all tasks to succeed
      for (let i = 0; i < 10; i++) {
        mockProcessor.mockResolvedValueOnce(`Success ${i + 1}`);
      }

      const results = await parallelManager.processInParallel(
        largeMockTasks,
        mockProcessor,
        userId
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockProcessor).toHaveBeenCalledTimes(10);
    });

    it('should handle complete processing failure', async () => {
      mockTurboModeService.checkUserEligibility.mockRejectedValue(
        new Error('Service unavailable')
      );

      const results = await parallelManager.processInParallel(
        mockTasks,
        mockProcessor,
        userId
      );

      expect(results).toHaveLength(2);
      expect(log.error).toHaveBeenCalledWith(
        '[ParallelProcessing] Parallel processing failed, falling back to sequential',
        expect.objectContaining({
          userId,
          error: expect.any(Error)
        })
      );
    });
  });

  describe('processSequentially', () => {
    const mockTasks: ProcessingTask[] = [
      {
        id: 'task-1',
        leadId: 'lead-1',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'data1' },
        createdAt: new Date()
      },
      {
        id: 'task-2',
        leadId: 'lead-2',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'data2' },
        createdAt: new Date()
      }
    ];

    const mockProcessor = jest.fn();

    it('should process tasks sequentially', async () => {
      mockProcessor
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const results = await parallelManager.processSequentially(
        mockTasks,
        mockProcessor
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe('result1');
      expect(results[1].success).toBe(true);
      expect(results[1].result).toBe('result2');

      expect(mockProcessor).toHaveBeenCalledTimes(2);
      expect(log.info).toHaveBeenCalledWith(
        '[ParallelProcessing] Sequential task completed',
        expect.objectContaining({
          taskId: 'task-1',
          leadId: 'lead-1'
        })
      );
    });

    it('should handle sequential processing errors', async () => {
      mockProcessor
        .mockResolvedValueOnce('result1')
        .mockRejectedValueOnce(new Error('Processing failed'));

      const results = await parallelManager.processSequentially(
        mockTasks,
        mockProcessor
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Processing failed');

      expect(log.error).toHaveBeenCalledWith(
        '[ParallelProcessing] Sequential task failed',
        expect.objectContaining({
          taskId: 'task-2',
          leadId: 'lead-2',
          error: expect.any(Error)
        })
      );
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      const mockResults = [
        JSON.stringify({
          taskId: 'task-1',
          success: true,
          processingTime: 1000
        }),
        JSON.stringify({
          taskId: 'task-2',
          success: false,
          processingTime: 2000
        }),
        JSON.stringify({
          taskId: 'task-3',
          success: true,
          processingTime: 1500
        })
      ];

      mockRedis.scard.mockResolvedValue(2); // 2 active processes
      mockRedis.lrange.mockResolvedValue(mockResults);

      const stats = await parallelManager.getProcessingStats();

      expect(stats.totalTasks).toBe(3);
      expect(stats.completedTasks).toBe(2);
      expect(stats.failedTasks).toBe(1);
      expect(stats.averageProcessingTime).toBe(1500); // (1000 + 2000 + 1500) / 3
      expect(stats.parallelEfficiency).toBe(66.66666666666666); // (2/3) * 100
    });

    it('should handle stats errors', async () => {
      mockRedis.scard.mockRejectedValue(new Error('Redis error'));

      const stats = await parallelManager.getProcessingStats();

      expect(stats.totalTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
      expect(stats.failedTasks).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
      expect(stats.parallelEfficiency).toBe(0);

      expect(log.error).toHaveBeenCalledWith(
        '[ParallelProcessing] Error getting processing stats',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('cancelActiveProcesses', () => {
    it('should cancel all active processes for a user', async () => {
      const activeProcessIds = ['process-1', 'process-2', 'process-3'];
      mockRedis.smembers.mockResolvedValue(activeProcessIds);
      
      // Mock the activeProcesses map to have these processes
      const parallelManagerInstance = parallelManager as any;
      parallelManagerInstance.activeProcesses.set('process-1', { id: 'process-1' });
      parallelManagerInstance.activeProcesses.set('process-2', { id: 'process-2' });
      parallelManagerInstance.activeProcesses.set('process-3', { id: 'process-3' });

      await parallelManager.cancelActiveProcesses(userId);

      expect(mockRedis.smembers).toHaveBeenCalledWith('turbo_mode_active_processes');
      expect(mockRedis.srem).toHaveBeenCalledTimes(3);
      
      expect(log.info).toHaveBeenCalledWith(
        '[ParallelProcessing] Active processes cancelled',
        {
          userId,
          cancelledProcesses: 3
        }
      );
    });

    it('should handle cancellation errors', async () => {
      mockRedis.smembers.mockRejectedValue(new Error('Redis error'));

      await parallelManager.cancelActiveProcesses(userId);

      expect(log.error).toHaveBeenCalledWith(
        '[ParallelProcessing] Error cancelling active processes',
        expect.objectContaining({
          userId,
          error: expect.any(Error)
        })
      );
    });
  });

  describe('timeout and retry logic', () => {
    it('should handle task timeout', async () => {
      const mockTask: ProcessingTask = {
        id: 'timeout-task',
        leadId: 'timeout-lead',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'timeout' },
        createdAt: new Date()
      };

      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        config: {
          enabled: true,
          maxParallelLeads: 10,
          timeoutMs: 100 // Very short timeout
        }
      });

      // Mock processor that takes longer than timeout
      const slowProcessor = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result'), 200))
      );

      const results = await parallelManager.processInParallel(
        [mockTask],
        slowProcessor,
        userId
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('timeout');
    });

    it('should retry failed tasks', async () => {
      const mockTask: ProcessingTask = {
        id: 'retry-task',
        leadId: 'retry-lead',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'retry' },
        createdAt: new Date()
      };

      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        config: {
          enabled: true,
          maxParallelLeads: 10,
          timeoutMs: 5000
        }
      });

      // Mock processor that fails twice then succeeds
      const retryProcessor = jest.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValueOnce('Success on attempt 3');

      const results = await parallelManager.processInParallel(
        [mockTask],
        retryProcessor,
        userId
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe('Success on attempt 3');
      expect(retryProcessor).toHaveBeenCalledTimes(3);
    });

    it('should fail after maximum retries', async () => {
      const mockTask: ProcessingTask = {
        id: 'fail-task',
        leadId: 'fail-lead',
        type: 'pdf_unification',
        priority: 1,
        data: { test: 'fail' },
        createdAt: new Date()
      };

      mockTurboModeService.checkUserEligibility.mockResolvedValue({
        eligible: true,
        config: {
          enabled: true,
          maxParallelLeads: 10,
          timeoutMs: 5000
        }
      });

      // Mock processor that always fails
      const failingProcessor = jest.fn()
        .mockRejectedValue(new Error('Always fails'));

      const results = await parallelManager.processInParallel(
        [mockTask],
        failingProcessor,
        userId
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Always fails');
      expect(failingProcessor).toHaveBeenCalledTimes(3); // Max retries
    });
  });
});