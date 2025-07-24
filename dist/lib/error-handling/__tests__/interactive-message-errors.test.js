"use strict";
// Tests for Interactive Message Error Handling System
// Comprehensive test coverage for error handling, logging, and recovery
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const interactive_message_errors_1 = require("../interactive-message-errors");
// Mock dependencies
globals_1.jest.mock('sonner', () => ({
    toast: {
        error: globals_1.jest.fn(),
        warning: globals_1.jest.fn(),
        info: globals_1.jest.fn(),
        success: globals_1.jest.fn()
    }
}));
// Mock localStorage
const localStorageMock = {
    getItem: globals_1.jest.fn(),
    setItem: globals_1.jest.fn(),
    removeItem: globals_1.jest.fn(),
    clear: globals_1.jest.fn()
};
Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});
(0, globals_1.describe)('InteractiveMessageErrorHandler', () => {
    let handler;
    let consoleSpy;
    (0, globals_1.beforeEach)(() => {
        handler = new interactive_message_errors_1.InteractiveMessageErrorHandler({
            enableLogging: true,
            enableToasts: false, // Disable toasts for testing
            enableRetry: true,
            maxRetryAttempts: 3,
            retryDelay: 100,
            logLevel: 'error'
        });
        consoleSpy = globals_1.jest.spyOn(console, 'error').mockImplementation(() => { });
        localStorageMock.getItem.mockReturnValue('[]');
        localStorageMock.setItem.mockImplementation(() => { });
    });
    (0, globals_1.afterEach)(() => {
        consoleSpy.mockRestore();
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.describe)('handleError', () => {
        (0, globals_1.it)('should handle basic JavaScript errors', () => {
            const error = new Error('Test error message');
            const context = {
                userId: 'user123',
                action: 'test_action',
                component: 'test_component'
            };
            const structuredError = handler.handleError(error, context);
            (0, globals_1.expect)(structuredError.id).toBeDefined();
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.SERVER);
            (0, globals_1.expect)(structuredError.code).toBe('UNKNOWN_ERROR');
            (0, globals_1.expect)(structuredError.message).toContain('Test error message');
            (0, globals_1.expect)(structuredError.context).toEqual(context);
            (0, globals_1.expect)(structuredError.timestamp).toBeInstanceOf(Date);
        });
        (0, globals_1.it)('should categorize validation errors correctly', () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.code = 'VALIDATION_REQUIRED_FIELD';
            error.validationErrors = [{ field: 'name', message: 'Required' }];
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.VALIDATION);
            (0, globals_1.expect)(structuredError.code).toBe('VALIDATION_REQUIRED_FIELD');
            (0, globals_1.expect)(structuredError.severity).toBe(interactive_message_errors_1.ErrorSeverity.MEDIUM);
            (0, globals_1.expect)(structuredError.details).toHaveProperty('validationErrors');
        });
        (0, globals_1.it)('should categorize network errors correctly', () => {
            const error = new TypeError('fetch is not defined');
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.NETWORK);
            (0, globals_1.expect)(structuredError.code).toBe('NETWORK_CONNECTION_FAILED');
            (0, globals_1.expect)(structuredError.severity).toBe(interactive_message_errors_1.ErrorSeverity.HIGH);
        });
        (0, globals_1.it)('should categorize HTTP errors correctly', () => {
            const error = new Error('Unauthorized');
            error.status = 401;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.AUTHENTICATION);
            (0, globals_1.expect)(structuredError.code).toBe('AUTH_UNAUTHORIZED');
            (0, globals_1.expect)(structuredError.severity).toBe(interactive_message_errors_1.ErrorSeverity.HIGH);
            (0, globals_1.expect)(structuredError.details.httpStatus).toBe(401);
        });
        (0, globals_1.it)('should handle 403 Forbidden errors', () => {
            const error = new Error('Forbidden');
            error.status = 403;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.AUTHORIZATION);
            (0, globals_1.expect)(structuredError.code).toBe('AUTH_FORBIDDEN');
        });
        (0, globals_1.it)('should handle 404 Not Found errors', () => {
            const error = new Error('Not Found');
            error.status = 404;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.BUSINESS_LOGIC);
            (0, globals_1.expect)(structuredError.code).toBe('BUSINESS_RESOURCE_NOT_FOUND');
        });
        (0, globals_1.it)('should handle 409 Conflict errors', () => {
            const error = new Error('Conflict');
            error.status = 409;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.BUSINESS_LOGIC);
            (0, globals_1.expect)(structuredError.code).toBe('BUSINESS_CONFLICT');
        });
        (0, globals_1.it)('should handle 429 Rate Limited errors', () => {
            const error = new Error('Too Many Requests');
            error.status = 429;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.SERVER);
            (0, globals_1.expect)(structuredError.code).toBe('SERVER_RATE_LIMITED');
        });
        (0, globals_1.it)('should handle 5xx Server errors', () => {
            const error = new Error('Internal Server Error');
            error.status = 500;
            const structuredError = handler.handleError(error);
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.SERVER);
            (0, globals_1.expect)(structuredError.code).toBe('SERVER_INTERNAL_ERROR');
            (0, globals_1.expect)(structuredError.severity).toBe(interactive_message_errors_1.ErrorSeverity.CRITICAL);
        });
        (0, globals_1.it)('should generate recovery actions based on error category', () => {
            const networkError = new TypeError('fetch failed');
            const structuredError = handler.handleError(networkError);
            (0, globals_1.expect)(structuredError.recoveryActions).toBeDefined();
            (0, globals_1.expect)(structuredError.recoveryActions.length).toBeGreaterThan(0);
            (0, globals_1.expect)(structuredError.recoveryActions[0].type).toBe('retry');
        });
    });
    (0, globals_1.describe)('handleApiError', () => {
        (0, globals_1.it)('should handle API response errors', async () => {
            const mockResponse = {
                ok: false,
                status: 400,
                json: globals_1.jest.fn().mockResolvedValue({
                    message: 'Validation failed',
                    code: 'VALIDATION_FAILED',
                    details: ['Name is required']
                })
            };
            const structuredError = await handler.handleApiError(mockResponse);
            (0, globals_1.expect)(structuredError.code).toBe('VALIDATION_FAILED');
            (0, globals_1.expect)(structuredError.details.httpStatus).toBe(400);
            (0, globals_1.expect)(mockResponse.json).toHaveBeenCalled();
        });
        (0, globals_1.it)('should handle API responses that cannot be parsed as JSON', async () => {
            const mockResponse = {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: globals_1.jest.fn().mockRejectedValue(new Error('Invalid JSON'))
            };
            const structuredError = await handler.handleApiError(mockResponse);
            (0, globals_1.expect)(structuredError.message).toContain('HTTP 500');
            (0, globals_1.expect)(structuredError.details.httpStatus).toBe(500);
        });
    });
    (0, globals_1.describe)('handleValidationError', () => {
        (0, globals_1.it)('should handle validation errors with details', () => {
            const validationErrors = [
                { field: 'name', message: 'Name is required', code: 'REQUIRED' },
                { field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' }
            ];
            const structuredError = handler.handleValidationError(validationErrors);
            (0, globals_1.expect)(structuredError.code).toBe('VALIDATION_FAILED');
            (0, globals_1.expect)(structuredError.category).toBe(interactive_message_errors_1.ErrorCategory.VALIDATION);
            (0, globals_1.expect)(structuredError.details.validationErrors).toEqual(validationErrors);
        });
    });
    (0, globals_1.describe)('withRetry', () => {
        (0, globals_1.it)('should succeed on first attempt', async () => {
            const operation = globals_1.jest.fn().mockResolvedValue('success');
            const result = await handler.withRetry(operation, 'test_op');
            (0, globals_1.expect)(result).toBe('success');
            (0, globals_1.expect)(operation).toHaveBeenCalledTimes(1);
        });
        (0, globals_1.it)('should retry on retryable errors', async () => {
            const operation = globals_1.jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success');
            // Mock isRetryableError to return true for network errors
            const originalIsRetryable = handler.isRetryableError;
            handler.isRetryableError = globals_1.jest.fn().mockReturnValue(true);
            const result = await handler.withRetry(operation, 'test_op');
            (0, globals_1.expect)(result).toBe('success');
            (0, globals_1.expect)(operation).toHaveBeenCalledTimes(3);
            // Restore original method
            handler.isRetryableError = originalIsRetryable;
        });
        (0, globals_1.it)('should not retry on non-retryable errors', async () => {
            const operation = globals_1.jest.fn().mockRejectedValue(new Error('Validation error'));
            // Mock isRetryableError to return false for validation errors
            const originalIsRetryable = handler.isRetryableError;
            handler.isRetryableError = globals_1.jest.fn().mockReturnValue(false);
            await (0, globals_1.expect)(handler.withRetry(operation, 'test_op')).rejects.toThrow();
            (0, globals_1.expect)(operation).toHaveBeenCalledTimes(1);
            // Restore original method
            handler.isRetryableError = originalIsRetryable;
        });
        (0, globals_1.it)('should fail after max retry attempts', async () => {
            const operation = globals_1.jest.fn().mockRejectedValue(new Error('Persistent error'));
            // Mock isRetryableError to return true
            const originalIsRetryable = handler.isRetryableError;
            handler.isRetryableError = globals_1.jest.fn().mockReturnValue(true);
            await (0, globals_1.expect)(handler.withRetry(operation, 'test_op')).rejects.toThrow();
            (0, globals_1.expect)(operation).toHaveBeenCalledTimes(3); // maxRetryAttempts
            // Restore original method
            handler.isRetryableError = originalIsRetryable;
        });
    });
    (0, globals_1.describe)('logging', () => {
        (0, globals_1.it)('should log errors based on severity', () => {
            const criticalError = new Error('Critical error');
            criticalError.code = 'SERVER_INTERNAL_ERROR';
            handler.handleError(criticalError);
            (0, globals_1.expect)(consoleSpy).toHaveBeenCalledWith('[CRITICAL ERROR]', globals_1.expect.objectContaining({
                code: 'SERVER_INTERNAL_ERROR',
                severity: interactive_message_errors_1.ErrorSeverity.CRITICAL
            }));
        });
        (0, globals_1.it)('should store logs in localStorage', () => {
            const error = new Error('Test error');
            handler.handleError(error);
            (0, globals_1.expect)(localStorageMock.setItem).toHaveBeenCalledWith('error_logs', globals_1.expect.stringContaining('Test error'));
        });
        (0, globals_1.it)('should limit stored logs to 100 entries', () => {
            // Mock existing logs
            const existingLogs = Array(100).fill(0).map((_, i) => ({ id: i, message: `Error ${i}` }));
            localStorageMock.getItem.mockReturnValue(JSON.stringify(existingLogs));
            const error = new Error('New error');
            handler.handleError(error);
            const setItemCall = localStorageMock.setItem.mock.calls.find(call => call[0] === 'error_logs');
            const storedLogs = JSON.parse(setItemCall[1]);
            (0, globals_1.expect)(storedLogs).toHaveLength(100);
            (0, globals_1.expect)(storedLogs[storedLogs.length - 1].message).toContain('New error');
        });
    });
    (0, globals_1.describe)('isRetryableError', () => {
        (0, globals_1.it)('should identify retryable network errors', () => {
            const networkError = new TypeError('fetch failed');
            (0, globals_1.expect)(handler.isRetryableError(networkError)).toBe(true);
        });
        (0, globals_1.it)('should identify retryable HTTP 5xx errors', () => {
            const serverError = new Error('Server error');
            serverError.status = 500;
            (0, globals_1.expect)(handler.isRetryableError(serverError)).toBe(true);
        });
        (0, globals_1.it)('should identify retryable rate limit errors', () => {
            const rateLimitError = new Error('Rate limited');
            rateLimitError.status = 429;
            (0, globals_1.expect)(handler.isRetryableError(rateLimitError)).toBe(true);
        });
        (0, globals_1.it)('should identify non-retryable validation errors', () => {
            const validationError = new Error('Validation failed');
            validationError.status = 400;
            (0, globals_1.expect)(handler.isRetryableError(validationError)).toBe(false);
        });
        (0, globals_1.it)('should identify non-retryable authentication errors', () => {
            const authError = new Error('Unauthorized');
            authError.status = 401;
            (0, globals_1.expect)(handler.isRetryableError(authError)).toBe(false);
        });
    });
});
(0, globals_1.describe)('Utility functions', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.describe)('handleApiCall', () => {
        (0, globals_1.it)('should handle successful API calls', async () => {
            const mockResponse = {
                ok: true,
                json: globals_1.jest.fn().mockResolvedValue({ data: 'success' })
            };
            const apiCall = globals_1.jest.fn().mockResolvedValue(mockResponse);
            const result = await (0, interactive_message_errors_1.handleApiCall)(apiCall);
            (0, globals_1.expect)(result).toEqual({ data: 'success' });
            (0, globals_1.expect)(apiCall).toHaveBeenCalledTimes(1);
        });
        (0, globals_1.it)('should handle failed API calls with retry', async () => {
            const mockFailedResponse = {
                ok: false,
                status: 500,
                json: globals_1.jest.fn().mockResolvedValue({ error: 'Server error' })
            };
            const mockSuccessResponse = {
                ok: true,
                json: globals_1.jest.fn().mockResolvedValue({ data: 'success' })
            };
            const apiCall = globals_1.jest.fn()
                .mockResolvedValueOnce(mockFailedResponse)
                .mockResolvedValueOnce(mockSuccessResponse);
            const result = await (0, interactive_message_errors_1.handleApiCall)(apiCall);
            (0, globals_1.expect)(result).toEqual({ data: 'success' });
            (0, globals_1.expect)(apiCall).toHaveBeenCalledTimes(2);
        });
    });
    (0, globals_1.describe)('handleValidation', () => {
        (0, globals_1.it)('should handle successful validation', () => {
            const validationFn = globals_1.jest.fn().mockReturnValue({ isValid: true });
            const result = (0, interactive_message_errors_1.handleValidation)(validationFn);
            (0, globals_1.expect)(result).toEqual({ isValid: true });
            (0, globals_1.expect)(validationFn).toHaveBeenCalledTimes(1);
        });
        (0, globals_1.it)('should handle validation errors', () => {
            const validationError = new Error('Validation failed');
            const validationFn = globals_1.jest.fn().mockImplementation(() => {
                throw validationError;
            });
            (0, globals_1.expect)(() => (0, interactive_message_errors_1.handleValidation)(validationFn)).toThrow();
        });
    });
    (0, globals_1.describe)('withErrorBoundary', () => {
        (0, globals_1.it)('should handle successful operations', () => {
            const operation = globals_1.jest.fn().mockReturnValue('success');
            const result = (0, interactive_message_errors_1.withErrorBoundary)(operation);
            (0, globals_1.expect)(result).toBe('success');
            (0, globals_1.expect)(operation).toHaveBeenCalledTimes(1);
        });
        (0, globals_1.it)('should handle operation errors', () => {
            const error = new Error('Operation failed');
            const operation = globals_1.jest.fn().mockImplementation(() => {
                throw error;
            });
            (0, globals_1.expect)(() => (0, interactive_message_errors_1.withErrorBoundary)(operation)).toThrow();
        });
    });
});
(0, globals_1.describe)('Global error handler', () => {
    (0, globals_1.it)('should be properly initialized', () => {
        (0, globals_1.expect)(interactive_message_errors_1.errorHandler).toBeInstanceOf(interactive_message_errors_1.InteractiveMessageErrorHandler);
    });
    (0, globals_1.it)('should handle errors consistently', () => {
        const error = new Error('Test error');
        const structuredError = interactive_message_errors_1.errorHandler.handleError(error);
        (0, globals_1.expect)(structuredError.id).toBeDefined();
        (0, globals_1.expect)(structuredError.timestamp).toBeInstanceOf(Date);
        (0, globals_1.expect)(structuredError.message).toBeDefined();
    });
});
