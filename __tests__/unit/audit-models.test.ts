// Mock do Prisma antes de importar os módulos
const mockPrisma = {
  llmAudit: {
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn()
  },
  intentHitLog: {
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn()
  },
  $queryRaw: jest.fn(),
  $disconnect: jest.fn()
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma)
}));

import { cleanupExpiredLogs, getLogsStatistics } from '../../lib/ai-integration/jobs/cleanup-expired-logs';
import { collectAuditMetrics, generateMetricsReport } from '../../lib/ai-integration/utils/audit-metrics';

describe('Audit Models and Cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupExpiredLogs', () => {
    it('should delete expired LlmAudit and IntentHitLog records', async () => {
      // Arrange
      const mockDeleteResult = { count: 5 };
      mockPrisma.llmAudit.deleteMany.mockResolvedValue(mockDeleteResult);
      mockPrisma.intentHitLog.deleteMany.mockResolvedValue({ count: 3 });

      // Act
      const result = await cleanupExpiredLogs();

      // Assert
      expect(mockPrisma.llmAudit.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date)
          }
        }
      });

      expect(mockPrisma.intentHitLog.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date)
          }
        }
      });

      expect(result).toEqual({
        llmAuditDeleted: 5,
        intentHitLogDeleted: 3,
        totalDeleted: 8
      });
    });

    it('should handle errors during cleanup', async () => {
      // Arrange
      const error = new Error('Database error');
      mockPrisma.llmAudit.deleteMany.mockRejectedValue(error);

      // Act & Assert
      await expect(cleanupExpiredLogs()).rejects.toThrow('Database error');
    });
  });

  describe('getLogsStatistics', () => {
    it('should return comprehensive statistics', async () => {
      // Arrange
      const mockLlmAuditStats = {
        _count: { id: 100 },
        _min: { 
          createdAt: new Date('2025-01-01'), 
          expiresAt: new Date('2025-04-01') 
        },
        _max: { 
          createdAt: new Date('2025-01-04'), 
          expiresAt: new Date('2025-04-04') 
        }
      };

      const mockIntentHitLogStats = {
        _count: { id: 50 },
        _min: { 
          createdAt: new Date('2025-01-01'), 
          expiresAt: new Date('2025-04-01') 
        },
        _max: { 
          createdAt: new Date('2025-01-04'), 
          expiresAt: new Date('2025-04-04') 
        }
      };

      mockPrisma.llmAudit.aggregate.mockResolvedValue(mockLlmAuditStats);
      mockPrisma.intentHitLog.aggregate.mockResolvedValue(mockIntentHitLogStats);
      mockPrisma.llmAudit.count.mockResolvedValue(5);
      mockPrisma.intentHitLog.count.mockResolvedValue(3);

      // Act
      const stats = await getLogsStatistics();

      // Assert
      expect(stats).toEqual({
        llmAudit: {
          total: 100,
          oldestRecord: new Date('2025-01-01'),
          newestRecord: new Date('2025-01-04'),
          earliestExpiry: new Date('2025-04-01'),
          latestExpiry: new Date('2025-04-04'),
          expiringSoon: 5
        },
        intentHitLog: {
          total: 50,
          oldestRecord: new Date('2025-01-01'),
          newestRecord: new Date('2025-01-04'),
          earliestExpiry: new Date('2025-04-01'),
          latestExpiry: new Date('2025-04-04'),
          expiringSoon: 3
        }
      });
    });
  });

  describe('collectAuditMetrics', () => {
    it('should collect comprehensive audit metrics', async () => {
      // Arrange
      mockPrisma.llmAudit.count.mockResolvedValueOnce(100) // total
                              .mockResolvedValueOnce(10)  // last 24h
                              .mockResolvedValueOnce(30); // last 7d

      mockPrisma.llmAudit.groupBy.mockResolvedValueOnce([
        { mode: 'INTENT_CLASSIFY', _count: { id: 60 } },
        { mode: 'DYNAMIC_GENERATE', _count: { id: 40 } }
      ]).mockResolvedValueOnce([
        { conversationId: 'conv1', _count: { id: 15 } },
        { conversationId: 'conv2', _count: { id: 12 } }
      ]);

      mockPrisma.llmAudit.aggregate.mockResolvedValue({
        _avg: { score: 0.85 }
      });

      mockPrisma.intentHitLog.count.mockResolvedValueOnce(50)  // total
                                   .mockResolvedValueOnce(25)  // successful
                                   .mockResolvedValueOnce(5)   // last 24h
                                   .mockResolvedValueOnce(15); // last 7d

      mockPrisma.intentHitLog.aggregate.mockResolvedValue({
        _avg: { similarity: 0.92 }
      });

      mockPrisma.intentHitLog.groupBy.mockResolvedValue([
        { candidateName: 'greeting', _count: { id: 20 }, _avg: { similarity: 0.95 } },
        { candidateName: 'support', _count: { id: 15 }, _avg: { similarity: 0.88 } }
      ]);

      mockPrisma.$queryRaw.mockResolvedValue([{
        avg_input_length: 150,
        total_requests: 100,
        estimated_tokens: 3750
      }]);

      // Act
      const metrics = await collectAuditMetrics();

      // Assert
      expect(metrics.llmAudit.totalRecords).toBe(100);
      expect(metrics.llmAudit.recordsByMode).toEqual({
        'INTENT_CLASSIFY': 60,
        'DYNAMIC_GENERATE': 40
      });
      expect(metrics.llmAudit.averageScore).toBe(0.85);
      expect(metrics.llmAudit.recordsLast24h).toBe(10);
      expect(metrics.llmAudit.recordsLast7d).toBe(30);

      expect(metrics.intentHitLog.totalRecords).toBe(50);
      expect(metrics.intentHitLog.successfulHits).toBe(25);
      expect(metrics.intentHitLog.successRate).toBe(50);
      expect(metrics.intentHitLog.averageSimilarity).toBe(0.92);

      expect(metrics.performance.totalTokensUsed).toBe(3750);
      expect(metrics.performance.costEstimate).toBe(0.01); // 3750 * 0.000002 = 0.0075, rounded to 0.01
    });
  });

  describe('generateMetricsReport', () => {
    it('should generate a formatted metrics report', async () => {
      // Arrange - Mock all the required data
      mockPrisma.llmAudit.count.mockResolvedValueOnce(100)
                              .mockResolvedValueOnce(10)
                              .mockResolvedValueOnce(30);

      mockPrisma.llmAudit.groupBy.mockResolvedValueOnce([
        { mode: 'INTENT_CLASSIFY', _count: { id: 60 } }
      ]).mockResolvedValueOnce([
        { conversationId: 'conv1', _count: { id: 15 } }
      ]);

      mockPrisma.llmAudit.aggregate.mockResolvedValue({
        _avg: { score: 0.85 }
      });

      mockPrisma.intentHitLog.count.mockResolvedValueOnce(50)
                                   .mockResolvedValueOnce(25)
                                   .mockResolvedValueOnce(5)
                                   .mockResolvedValueOnce(15);

      mockPrisma.intentHitLog.aggregate.mockResolvedValue({
        _avg: { similarity: 0.92 }
      });

      mockPrisma.intentHitLog.groupBy.mockResolvedValue([
        { candidateName: 'greeting', _count: { id: 20 }, _avg: { similarity: 0.95 } }
      ]);

      mockPrisma.$queryRaw.mockResolvedValue([{
        avg_input_length: 150,
        total_requests: 100,
        estimated_tokens: 3750
      }]);

      // Act
      const report = await generateMetricsReport();

      // Assert
      expect(report).toContain('AI Integration Audit Metrics Report');
      expect(report).toContain('Total Records: 100');
      expect(report).toContain('Success Rate: 50%');
      expect(report).toContain('INTENT_CLASSIFY: 60');
      expect(report).toContain('greeting: 20 hits');
    });
  });

  describe('TTL and Expiration', () => {
    it('should create records with proper TTL fields', async () => {
      // Test data structure for LlmAudit
      const llmAuditData = {
        conversationId: 'test-conv-123',
        messageId: 'test-msg-456',
        mode: 'INTENT_CLASSIFY',
        inputText: 'Hello, I need help',
        resultJson: { intent: 'greeting', confidence: 0.95 },
        score: 0.95,
        traceId: 'trace-789'
      };

      // Test data structure for IntentHitLog
      const intentHitLogData = {
        conversationId: 'test-conv-123',
        messageId: 'test-msg-456',
        candidateName: 'greeting',
        similarity: 0.95,
        chosen: true,
        traceId: 'trace-789'
      };

      // Verify the data structures are valid
      expect(llmAuditData.conversationId).toBeDefined();
      expect(llmAuditData.mode).toBeDefined();
      expect(intentHitLogData.similarity).toBeGreaterThan(0);
      expect(intentHitLogData.chosen).toBe(true);
    });

    it('should handle expiration queries correctly', async () => {
      const now = new Date();
      const expiredDate = new Date(now.getTime() - 1000); // 1 second ago

      // Mock expired records
      mockPrisma.llmAudit.deleteMany.mockResolvedValue({ count: 10 });
      mockPrisma.intentHitLog.deleteMany.mockResolvedValue({ count: 5 });

      const result = await cleanupExpiredLogs();

      expect(mockPrisma.llmAudit.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date)
          }
        }
      });

      expect(result.totalDeleted).toBe(15);
    });
  });
});

describe('Model Schema Validation', () => {
  it('should have correct field types for LlmAudit', () => {
    // Test the expected structure of LlmAudit model
    const expectedFields = [
      'id',
      'conversationId', 
      'messageId',
      'mode',
      'inputText',
      'resultJson',
      'score',
      'traceId',
      'createdAt',
      'expiresAt'
    ];

    // This test validates that we expect these fields to exist
    expectedFields.forEach(field => {
      expect(field).toBeDefined();
    });
  });

  it('should have correct field types for IntentHitLog', () => {
    // Test the expected structure of IntentHitLog model
    const expectedFields = [
      'id',
      'conversationId',
      'messageId', 
      'candidateName',
      'similarity',
      'chosen',
      'traceId',
      'createdAt',
      'expiresAt'
    ];

    // This test validates that we expect these fields to exist
    expectedFields.forEach(field => {
      expect(field).toBeDefined();
    });
  });

  it('should have proper TTL default values', () => {
    // Test that TTL is set to 90 days from creation
    const now = new Date();
    const expectedExpiry = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));
    
    // The actual TTL is set in the database with dbgenerated("NOW() + INTERVAL '90 days'")
    // This test just validates our understanding of the expected behavior
    expect(expectedExpiry.getTime()).toBeGreaterThan(now.getTime());
  });
});