/**
 * Tests for Structured Logger
 */

import { StructuredLogger, aiLogger, LogContext } from '../../../../lib/ai-integration/utils/logger';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new StructuredLogger({
      service: 'test-service',
      version: '1.0.0',
      environment: 'test',
      logLevel: 'debug',
    });
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('basic logging', () => {
    it('should log info messages with structured format', () => {
      const context: Partial<LogContext> = {
        traceId: 'test-trace-123',
        accountId: 1,
        conversationId: 123,
        stage: 'webhook',
      };

      logger.info('Test message', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"traceId":"test-trace-123"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"service":"test-service"')
      );
    });

    it('should respect log levels', () => {
      const warnLogger = new StructuredLogger({
        service: 'test',
        logLevel: 'warn',
      });

      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const infoSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      warnLogger.debug('Debug message');
      warnLogger.info('Info message');
      warnLogger.warn('Warn message');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should log errors with stack traces', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');

      logger.errorWithStack('Error occurred', error, {
        traceId: 'test-trace',
        stage: 'generate',
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Error occurred"')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Test error"')
      );

      errorSpy.mockRestore();
    });
  });

  describe('convenience methods', () => {
    it('should use correct stage for webhook logging', () => {
      logger.webhook('Webhook received', { traceId: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"stage":"webhook"')
      );
    });

    it('should use correct stage for queue logging', () => {
      logger.queue('Job enqueued', { traceId: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"stage":"queue"')
      );
    });

    it('should log performance with duration', () => {
      const startTime = Date.now() - 100;
      logger.performance('Operation completed', startTime, {
        traceId: 'test',
        stage: 'classify',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"duration":')
      );
    });
  });

  describe('child logger', () => {
    it('should inherit context from parent', () => {
      const parentContext = {
        traceId: 'parent-trace',
        accountId: 123,
      };

      const childLogger = logger.child(parentContext);
      childLogger.info('Child message', { stage: 'deliver' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"traceId":"parent-trace"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"accountId":123')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"stage":"deliver"')
      );
    });

    it('should allow child context to override parent', () => {
      const parentContext = { traceId: 'parent-trace', stage: 'webhook' as const };
      const childLogger = logger.child(parentContext);

      childLogger.info('Child message', { stage: 'queue' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"stage":"queue"')
      );
    });
  });

  describe('default logger', () => {
    it('should be properly configured', () => {
      expect(aiLogger).toBeInstanceOf(StructuredLogger);
    });

    it('should use environment variables for configuration', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'error';

      const envLogger = new StructuredLogger({
        service: 'test',
      });

      // Should not log info when level is error
      const infoSpy = jest.spyOn(console, 'log').mockImplementation();
      envLogger.info('Should not log');
      expect(infoSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
      process.env.LOG_LEVEL = originalEnv;
    });
  });
});