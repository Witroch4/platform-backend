/**
 * Tests for Instagram Translation Error Handling
 */

import {
  InstagramTranslationError,
  TemplateNotFoundError,
  MessageTooLongError,
  InvalidChannelError,
  DatabaseError,
  ConversionFailedError,
  ValidationError,
  TimeoutError,
  createTemplateNotFoundError,
  createMessageTooLongError,
  createInvalidChannelError,
  createDatabaseError,
  createConversionFailedError,
  createValidationError,
  createTimeoutError,
  isRetryableError,
  getErrorSeverity,
  ErrorAggregator,
  logError,
  getGlobalErrorSummary,
  clearGlobalErrors,
  attemptRecovery,
  recoveryStrategies,
} from '../instagram-translation-errors';
import { InstagramTranslationErrorCodes } from '../../queue/instagram-translation.queue';

describe('Instagram Translation Error Handling', () => {
  beforeEach(() => {
    clearGlobalErrors();
  });

  describe('Base InstagramTranslationError', () => {
    it('should create error with all properties', () => {
      const error = new InstagramTranslationError(
        'Test error',
        InstagramTranslationErrorCodes.VALIDATION_ERROR,
        'test-correlation-id',
        true,
        { testData: 'value' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(InstagramTranslationErrorCodes.VALIDATION_ERROR);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.retryable).toBe(true);
      expect(error.metadata).toEqual({ testData: 'value' });
      expect(error.name).toBe('InstagramTranslationError');
    });

    it('should serialize to JSON correctly', () => {
      const error = new InstagramTranslationError(
        'Test error',
        InstagramTranslationErrorCodes.DATABASE_ERROR,
        'test-id',
        false,
        { key: 'value' }
      );

      const json = error.toJSON();
      expect(json.name).toBe('InstagramTranslationError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(InstagramTranslationErrorCodes.DATABASE_ERROR);
      expect(json.correlationId).toBe('test-id');
      expect(json.retryable).toBe(false);
      expect(json.metadata).toEqual({ key: 'value' });
      expect(json.timestamp).toBeDefined();
    });

    it('should deserialize from JSON correctly', () => {
      const originalError = new InstagramTranslationError(
        'Original error',
        InstagramTranslationErrorCodes.TIMEOUT_ERROR,
        'original-id',
        true
      );

      const json = originalError.toJSON();
      const deserializedError = InstagramTranslationError.fromJSON(json);

      expect(deserializedError.message).toBe(originalError.message);
      expect(deserializedError.code).toBe(originalError.code);
      expect(deserializedError.correlationId).toBe(originalError.correlationId);
      expect(deserializedError.retryable).toBe(originalError.retryable);
    });
  });

  describe('Specific Error Classes', () => {
    it('should create TemplateNotFoundError correctly', () => {
      const error = new TemplateNotFoundError('test-intent', 'test-inbox', 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND);
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({
        intentName: 'test-intent',
        inboxId: 'test-inbox',
      });
      expect(error.message).toContain('test-intent');
      expect(error.message).toContain('test-inbox');
    });

    it('should create MessageTooLongError correctly', () => {
      const error = new MessageTooLongError(800, 640, 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.MESSAGE_TOO_LONG);
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({
        messageLength: 800,
        maxLength: 640,
      });
      expect(error.message).toContain('800');
      expect(error.message).toContain('640');
    });

    it('should create InvalidChannelError correctly', () => {
      const error = new InvalidChannelError('Channel::Facebook', 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.INVALID_CHANNEL);
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({
        channelType: 'Channel::Facebook',
      });
      expect(error.message).toContain('Channel::Facebook');
    });

    it('should create DatabaseError correctly', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('findTemplate', originalError, 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.DATABASE_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.metadata).toEqual({
        operation: 'findTemplate',
        originalError: 'Connection failed',
      });
      expect(error.message).toContain('findTemplate');
      expect(error.message).toContain('Connection failed');
    });

    it('should create ConversionFailedError correctly', () => {
      const error = new ConversionFailedError('Invalid template', 'test-id', { type: 'generic' });
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.CONVERSION_FAILED);
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({ type: 'generic' });
      expect(error.message).toContain('Invalid template');
    });

    it('should create ValidationError correctly', () => {
      const error = new ValidationError('bodyText', 'Required field missing', 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.VALIDATION_ERROR);
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({
        field: 'bodyText',
        reason: 'Required field missing',
      });
      expect(error.message).toContain('bodyText');
      expect(error.message).toContain('Required field missing');
    });

    it('should create TimeoutError correctly', () => {
      const error = new TimeoutError(5000, 'test-id');
      
      expect(error.code).toBe(InstagramTranslationErrorCodes.TIMEOUT_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.metadata).toEqual({
        timeoutMs: 5000,
      });
      expect(error.message).toContain('5000');
    });
  });

  describe('Error Factory Functions', () => {
    it('should create errors using factory functions', () => {
      const templateError = createTemplateNotFoundError('intent', 'inbox', 'id');
      expect(templateError).toBeInstanceOf(TemplateNotFoundError);

      const messageError = createMessageTooLongError(700);
      expect(messageError).toBeInstanceOf(MessageTooLongError);

      const channelError = createInvalidChannelError('invalid');
      expect(channelError).toBeInstanceOf(InvalidChannelError);

      const dbError = createDatabaseError('op', new Error('test'));
      expect(dbError).toBeInstanceOf(DatabaseError);

      const conversionError = createConversionFailedError('reason');
      expect(conversionError).toBeInstanceOf(ConversionFailedError);

      const validationError = createValidationError('field', 'reason');
      expect(validationError).toBeInstanceOf(ValidationError);

      const timeoutError = createTimeoutError(1000);
      expect(timeoutError).toBeInstanceOf(TimeoutError);
    });
  });

  describe('Error Classification', () => {
    it('should correctly identify retryable errors', () => {
      const retryableError = new DatabaseError('test', new Error('test'));
      const nonRetryableError = new TemplateNotFoundError('intent', 'inbox');

      expect(isRetryableError(retryableError)).toBe(true);
      expect(isRetryableError(nonRetryableError)).toBe(false);
    });

    it('should identify retryable patterns in generic errors', () => {
      const connectionError = new Error('Connection timeout');
      const networkError = new Error('Network unavailable');
      const permanentError = new Error('Invalid syntax');

      expect(isRetryableError(connectionError)).toBe(true);
      expect(isRetryableError(networkError)).toBe(true);
      expect(isRetryableError(permanentError)).toBe(false);
    });

    it('should correctly determine error severity', () => {
      expect(getErrorSeverity(new TemplateNotFoundError('i', 'i'))).toBe('medium');
      expect(getErrorSeverity(new MessageTooLongError(700, 640))).toBe('medium');
      expect(getErrorSeverity(new InvalidChannelError('invalid'))).toBe('medium');
      expect(getErrorSeverity(new ValidationError('field', 'reason'))).toBe('low');
      expect(getErrorSeverity(new DatabaseError('op', new Error('test')))).toBe('high');
      expect(getErrorSeverity(new TimeoutError(1000))).toBe('medium');
      expect(getErrorSeverity(new ConversionFailedError('reason'))).toBe('medium');
    });
  });

  describe('Error Aggregation', () => {
    it('should aggregate errors correctly', () => {
      const aggregator = new ErrorAggregator(10);
      
      const error1 = createTemplateNotFoundError('intent1', 'inbox1', 'id1');
      const error2 = createDatabaseError('op', new Error('test'), 'id2');
      const error3 = createTemplateNotFoundError('intent2', 'inbox2', 'id3');

      aggregator.addError(error1);
      aggregator.addError(error2);
      aggregator.addError(error3);

      const summary = aggregator.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.byCode[InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND]).toBe(2);
      expect(summary.byCode[InstagramTranslationErrorCodes.DATABASE_ERROR]).toBe(1);
      expect(summary.retryable).toBe(1);
      expect(summary.nonRetryable).toBe(2);
      expect(summary.bySeverity.medium).toBe(2);
      expect(summary.bySeverity.high).toBe(1);
    });

    it('should limit stored errors to max count', () => {
      const aggregator = new ErrorAggregator(2);
      
      const error1 = createValidationError('field1', 'reason1', 'id1');
      const error2 = createValidationError('field2', 'reason2', 'id2');
      const error3 = createValidationError('field3', 'reason3', 'id3');

      aggregator.addError(error1);
      aggregator.addError(error2);
      aggregator.addError(error3);

      const summary = aggregator.getSummary();
      expect(summary.total).toBe(2); // Should only keep last 2 errors
    });

    it('should get count by specific error code', () => {
      const aggregator = new ErrorAggregator();
      
      aggregator.addError(createTemplateNotFoundError('i1', 'i1'));
      aggregator.addError(createTemplateNotFoundError('i2', 'i2'));
      aggregator.addError(createDatabaseError('op', new Error('test')));

      expect(aggregator.getCountByCode(InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND)).toBe(2);
      expect(aggregator.getCountByCode(InstagramTranslationErrorCodes.DATABASE_ERROR)).toBe(1);
      expect(aggregator.getCountByCode(InstagramTranslationErrorCodes.VALIDATION_ERROR)).toBe(0);
    });
  });

  describe('Global Error Tracking', () => {
    it('should log and track errors globally', () => {
      const error = createValidationError('test', 'test error', 'test-id');
      
      logError(error);
      
      const summary = getGlobalErrorSummary();
      expect(summary.total).toBe(1);
      expect(summary.byCode[InstagramTranslationErrorCodes.VALIDATION_ERROR]).toBe(1);
    });

    it('should clear global errors', () => {
      const error = createValidationError('test', 'test error', 'test-id');
      logError(error);
      
      expect(getGlobalErrorSummary().total).toBe(1);
      
      clearGlobalErrors();
      
      expect(getGlobalErrorSummary().total).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover with WhatsApp fallback for message too long', async () => {
      const error = createMessageTooLongError(700, 640, 'test-id');
      
      const recovery = await attemptRecovery(error);
      
      expect(recovery.fallbackAction).toBe('whatsapp_only');
    });

    it('should recover with retry for database errors', async () => {
      const error = createDatabaseError('test', new Error('connection failed'), 'test-id');
      
      const recovery = await attemptRecovery(error);
      
      expect(recovery.fallbackAction).toBe('retry');
    });

    it('should recover with skip for template not found', async () => {
      const error = createTemplateNotFoundError('intent', 'inbox', 'test-id');
      
      const recovery = await attemptRecovery(error);
      
      expect(recovery.fallbackAction).toBe('skip');
    });

    it('should recover with graceful degradation for validation errors', async () => {
      const error = createValidationError('field', 'invalid', 'test-id');
      
      const recovery = await attemptRecovery(error);
      
      expect(recovery.fallbackAction).toBe('simple_text');
      expect(recovery.fallbackMessage).toBeDefined();
    });

    it('should handle recovery strategy failures gracefully', async () => {
      // Mock a recovery strategy that throws an error
      const originalStrategy = recoveryStrategies.gracefulDegradation.recover;
      recoveryStrategies.gracefulDegradation.recover = async () => {
        throw new Error('Recovery failed');
      };

      const error = createValidationError('field', 'invalid', 'test-id');
      
      const recovery = await attemptRecovery(error);
      
      expect(recovery.fallbackAction).toBe('skip'); // Should fall back to skip
      
      // Restore original strategy
      recoveryStrategies.gracefulDegradation.recover = originalStrategy;
    });
  });

  describe('Recovery Strategies', () => {
    it('should identify recoverable errors correctly', () => {
      expect(recoveryStrategies.whatsappFallback.canRecover(
        createMessageTooLongError(700, 640)
      )).toBe(true);

      expect(recoveryStrategies.retryStrategy.canRecover(
        createDatabaseError('test', new Error('test'))
      )).toBe(true);

      expect(recoveryStrategies.skipStrategy.canRecover(
        createTemplateNotFoundError('intent', 'inbox')
      )).toBe(true);

      expect(recoveryStrategies.gracefulDegradation.canRecover(
        createValidationError('field', 'reason')
      )).toBe(true);
    });

    it('should not recover non-matching errors', () => {
      const validationError = createValidationError('field', 'reason');
      
      expect(recoveryStrategies.whatsappFallback.canRecover(validationError)).toBe(false);
      expect(recoveryStrategies.retryStrategy.canRecover(validationError)).toBe(false);
      expect(recoveryStrategies.skipStrategy.canRecover(validationError)).toBe(false);
    });
  });
});