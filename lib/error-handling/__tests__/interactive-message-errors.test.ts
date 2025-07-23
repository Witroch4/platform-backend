// Tests for Interactive Message Error Handling System
// Comprehensive test coverage for error handling, logging, and recovery

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { 
  InteractiveMessageErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  errorHandler,
  handleApiCall,
  handleValidation,
  withErrorBoundary
} from '../interactive-message-errors';

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    success: jest.fn()
  }
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('InteractiveMessageErrorHandler', () => {
  let handler: InteractiveMessageErrorHandler;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    handler = new InteractiveMessageErrorHandler({
      enableLogging: true,
      enableToasts: false, // Disable toasts for testing
      enableRetry: true,
      maxRetryAttempts: 3,
      retryDelay: 100,
      logLevel: 'error'
    });

    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorageMock.getItem.mockReturnValue('[]');
    localStorageMock.setItem.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('handleError', () => {
    it('should handle basic JavaScript errors', () => {
      const error = new Error('Test error message');
      const context = {
        userId: 'user123',
        action: 'test_action',
        component: 'test_component'
      };

      const structuredError = handler.handleError(error, context);

      expect(structuredError.id).toBeDefined();
      expect(structuredError.category).toBe(ErrorCategory.SERVER);
      expect(structuredError.code).toBe('UNKNOWN_ERROR');
      expect(structuredError.message).toContain('Test error message');
      expect(structuredError.context).toEqual(context);
      expect(structuredError.timestamp).toBeInstanceOf(Date);
    });

    it('should categorize validation errors correctly', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      (error as any).code = 'VALIDATION_REQUIRED_FIELD';
      (error as any).validationErrors = [{ field: 'name', message: 'Required' }];

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.VALIDATION);
      expect(structuredError.code).toBe('VALIDATION_REQUIRED_FIELD');
      expect(structuredError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(structuredError.details).toHaveProperty('validationErrors');
    });

    it('should categorize network errors correctly', () => {
      const error = new TypeError('fetch is not defined');
      
      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.NETWORK);
      expect(structuredError.code).toBe('NETWORK_CONNECTION_FAILED');
      expect(structuredError.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should categorize HTTP errors correctly', () => {
      const error = new Error('Unauthorized');
      (error as any).status = 401;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(structuredError.code).toBe('AUTH_UNAUTHORIZED');
      expect(structuredError.severity).toBe(ErrorSeverity.HIGH);
      expect(structuredError.details.httpStatus).toBe(401);
    });

    it('should handle 403 Forbidden errors', () => {
      const error = new Error('Forbidden');
      (error as any).status = 403;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(structuredError.code).toBe('AUTH_FORBIDDEN');
    });

    it('should handle 404 Not Found errors', () => {
      const error = new Error('Not Found');
      (error as any).status = 404;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(structuredError.code).toBe('BUSINESS_RESOURCE_NOT_FOUND');
    });

    it('should handle 409 Conflict errors', () => {
      const error = new Error('Conflict');
      (error as any).status = 409;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(structuredError.code).toBe('BUSINESS_CONFLICT');
    });

    it('should handle 429 Rate Limited errors', () => {
      const error = new Error('Too Many Requests');
      (error as any).status = 429;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.SERVER);
      expect(structuredError.code).toBe('SERVER_RATE_LIMITED');
    });

    it('should handle 5xx Server errors', () => {
      const error = new Error('Internal Server Error');
      (error as any).status = 500;

      const structuredError = handler.handleError(error);

      expect(structuredError.category).toBe(ErrorCategory.SERVER);
      expect(structuredError.code).toBe('SERVER_INTERNAL_ERROR');
      expect(structuredError.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should generate recovery actions based on error category', () => {
      const networkError = new TypeError('fetch failed');
      const structuredError = handler.handleError(networkError);

      expect(structuredError.recoveryActions).toBeDefined();
      expect(structuredError.recoveryActions!.length).toBeGreaterThan(0);
      expect(structuredError.recoveryActions![0].type).toBe('retry');
    });
  });

  describe('handleApiError', () => {
    it('should handle API response errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          message: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: ['Name is required']
        })
      } as any;

      const structuredError = await handler.handleApiError(mockResponse);

      expect(structuredError.code).toBe('VALIDATION_FAILED');
      expect(structuredError.details.httpStatus).toBe(400);
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle API responses that cannot be parsed as JSON', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      } as any;

      const structuredError = await handler.handleApiError(mockResponse);

      expect(structuredError.message).toContain('HTTP 500');
      expect(structuredError.details.httpStatus).toBe(500);
    });
  });

  describe('handleValidationError', () => {
    it('should handle validation errors with details', () => {
      const validationErrors = [
        { field: 'name', message: 'Name is required', code: 'REQUIRED' },
        { field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' }
      ];

      const structuredError = handler.handleValidationError(validationErrors);

      expect(structuredError.code).toBe('VALIDATION_FAILED');
      expect(structuredError.category).toBe(ErrorCategory.VALIDATION);
      expect(structuredError.details.validationErrors).toEqual(validationErrors);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await handler.withRetry(operation, 'test_op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      // Mock isRetryableError to return true for network errors
      const originalIsRetryable = (handler as any).isRetryableError;
      (handler as any).isRetryableError = jest.fn().mockReturnValue(true);

      const result = await handler.withRetry(operation, 'test_op');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);

      // Restore original method
      (handler as any).isRetryableError = originalIsRetryable;
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Validation error'));

      // Mock isRetryableError to return false for validation errors
      const originalIsRetryable = (handler as any).isRetryableError;
      (handler as any).isRetryableError = jest.fn().mockReturnValue(false);

      await expect(handler.withRetry(operation, 'test_op')).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);

      // Restore original method
      (handler as any).isRetryableError = originalIsRetryable;
    });

    it('should fail after max retry attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));

      // Mock isRetryableError to return true
      const originalIsRetryable = (handler as any).isRetryableError;
      (handler as any).isRetryableError = jest.fn().mockReturnValue(true);

      await expect(handler.withRetry(operation, 'test_op')).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(3); // maxRetryAttempts

      // Restore original method
      (handler as any).isRetryableError = originalIsRetryable;
    });
  });

  describe('logging', () => {
    it('should log errors based on severity', () => {
      const criticalError = new Error('Critical error');
      (criticalError as any).code = 'SERVER_INTERNAL_ERROR';

      handler.handleError(criticalError);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CRITICAL ERROR]',
        expect.objectContaining({
          code: 'SERVER_INTERNAL_ERROR',
          severity: ErrorSeverity.CRITICAL
        })
      );
    });

    it('should store logs in localStorage', () => {
      const error = new Error('Test error');
      
      handler.handleError(error);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'error_logs',
        expect.stringContaining('Test error')
      );
    });

    it('should limit stored logs to 100 entries', () => {
      // Mock existing logs
      const existingLogs = Array(100).fill(0).map((_, i) => ({ id: i, message: `Error ${i}` }));
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existingLogs));

      const error = new Error('New error');
      handler.handleError(error);

      const setItemCall = localStorageMock.setItem.mock.calls.find(call => call[0] === 'error_logs');
      const storedLogs = JSON.parse(setItemCall![1]);
      
      expect(storedLogs).toHaveLength(100);
      expect(storedLogs[storedLogs.length - 1].message).toContain('New error');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors', () => {
      const networkError = new TypeError('fetch failed');
      expect((handler as any).isRetryableError(networkError)).toBe(true);
    });

    it('should identify retryable HTTP 5xx errors', () => {
      const serverError = new Error('Server error');
      (serverError as any).status = 500;
      expect((handler as any).isRetryableError(serverError)).toBe(true);
    });

    it('should identify retryable rate limit errors', () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).status = 429;
      expect((handler as any).isRetryableError(rateLimitError)).toBe(true);
    });

    it('should identify non-retryable validation errors', () => {
      const validationError = new Error('Validation failed');
      (validationError as any).status = 400;
      expect((handler as any).isRetryableError(validationError)).toBe(false);
    });

    it('should identify non-retryable authentication errors', () => {
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      expect((handler as any).isRetryableError(authError)).toBe(false);
    });
  });
});

describe('Utility functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleApiCall', () => {
    it('should handle successful API calls', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      };
      const apiCall = jest.fn().mockResolvedValue(mockResponse);

      const result = await handleApiCall(apiCall);

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('should handle failed API calls with retry', async () => {
      const mockFailedResponse = {
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Server error' })
      };
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      };

      const apiCall = jest.fn()
        .mockResolvedValueOnce(mockFailedResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      const result = await handleApiCall(apiCall);

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleValidation', () => {
    it('should handle successful validation', () => {
      const validationFn = jest.fn().mockReturnValue({ isValid: true });
      
      const result = handleValidation(validationFn);
      
      expect(result).toEqual({ isValid: true });
      expect(validationFn).toHaveBeenCalledTimes(1);
    });

    it('should handle validation errors', () => {
      const validationError = new Error('Validation failed');
      const validationFn = jest.fn().mockImplementation(() => {
        throw validationError;
      });

      expect(() => handleValidation(validationFn)).toThrow();
    });
  });

  describe('withErrorBoundary', () => {
    it('should handle successful operations', () => {
      const operation = jest.fn().mockReturnValue('success');
      
      const result = withErrorBoundary(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation errors', () => {
      const error = new Error('Operation failed');
      const operation = jest.fn().mockImplementation(() => {
        throw error;
      });

      expect(() => withErrorBoundary(operation)).toThrow();
    });
  });
});

describe('Global error handler', () => {
  it('should be properly initialized', () => {
    expect(errorHandler).toBeInstanceOf(InteractiveMessageErrorHandler);
  });

  it('should handle errors consistently', () => {
    const error = new Error('Test error');
    const structuredError = errorHandler.handleError(error);

    expect(structuredError.id).toBeDefined();
    expect(structuredError.timestamp).toBeInstanceOf(Date);
    expect(structuredError.message).toBeDefined();
  });
});