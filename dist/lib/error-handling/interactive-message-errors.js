"use strict";
// Comprehensive error handling system for Interactive Messages
// Provides structured error handling, logging, and user-friendly error messages
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.InteractiveMessageErrorHandler = exports.ErrorSeverity = exports.ErrorCategory = void 0;
exports.handleApiCall = handleApiCall;
exports.handleValidation = handleValidation;
exports.withErrorBoundary = withErrorBoundary;
const sonner_1 = require("sonner");
// Error types and categories
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION"] = "VALIDATION";
    ErrorCategory["NETWORK"] = "NETWORK";
    ErrorCategory["SERVER"] = "SERVER";
    ErrorCategory["AUTHENTICATION"] = "AUTHENTICATION";
    ErrorCategory["AUTHORIZATION"] = "AUTHORIZATION";
    ErrorCategory["BUSINESS_LOGIC"] = "BUSINESS_LOGIC";
    ErrorCategory["MEDIA_UPLOAD"] = "MEDIA_UPLOAD";
    ErrorCategory["WEBHOOK"] = "WEBHOOK";
    ErrorCategory["DATABASE"] = "DATABASE";
    ErrorCategory["EXTERNAL_API"] = "EXTERNAL_API";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "LOW";
    ErrorSeverity["MEDIUM"] = "MEDIUM";
    ErrorSeverity["HIGH"] = "HIGH";
    ErrorSeverity["CRITICAL"] = "CRITICAL";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
// Default configuration
const DEFAULT_CONFIG = {
    enableLogging: true,
    enableToasts: true,
    enableRetry: true,
    maxRetryAttempts: 3,
    retryDelay: 1000,
    logLevel: 'error'
};
// Error code mappings to user-friendly messages
const ERROR_MESSAGES = {
    // Validation errors
    'VALIDATION_REQUIRED_FIELD': {
        message: 'Required field is missing',
        userMessage: 'Por favor, preencha todos os campos obrigatórios.',
        severity: ErrorSeverity.MEDIUM
    },
    'VALIDATION_INVALID_LENGTH': {
        message: 'Field length exceeds limit',
        userMessage: 'O texto excede o limite de caracteres permitido.',
        severity: ErrorSeverity.MEDIUM
    },
    'VALIDATION_INVALID_FORMAT': {
        message: 'Field format is invalid',
        userMessage: 'O formato do campo está inválido.',
        severity: ErrorSeverity.MEDIUM
    },
    'VALIDATION_DUPLICATE_VALUE': {
        message: 'Duplicate value detected',
        userMessage: 'Valor duplicado detectado. Por favor, use valores únicos.',
        severity: ErrorSeverity.MEDIUM
    },
    // Network errors
    'NETWORK_CONNECTION_FAILED': {
        message: 'Network connection failed',
        userMessage: 'Falha na conexão. Verifique sua internet e tente novamente.',
        severity: ErrorSeverity.HIGH
    },
    'NETWORK_TIMEOUT': {
        message: 'Request timeout',
        userMessage: 'A operação demorou muito para responder. Tente novamente.',
        severity: ErrorSeverity.HIGH
    },
    'NETWORK_OFFLINE': {
        message: 'Device is offline',
        userMessage: 'Você está offline. Verifique sua conexão com a internet.',
        severity: ErrorSeverity.HIGH
    },
    // Server errors
    'SERVER_INTERNAL_ERROR': {
        message: 'Internal server error',
        userMessage: 'Erro interno do servidor. Nossa equipe foi notificada.',
        severity: ErrorSeverity.CRITICAL
    },
    'SERVER_SERVICE_UNAVAILABLE': {
        message: 'Service temporarily unavailable',
        userMessage: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
        severity: ErrorSeverity.HIGH
    },
    'SERVER_RATE_LIMITED': {
        message: 'Rate limit exceeded',
        userMessage: 'Muitas tentativas. Aguarde um momento antes de tentar novamente.',
        severity: ErrorSeverity.MEDIUM
    },
    // Authentication/Authorization errors
    'AUTH_UNAUTHORIZED': {
        message: 'User not authenticated',
        userMessage: 'Sessão expirada. Por favor, faça login novamente.',
        severity: ErrorSeverity.HIGH
    },
    'AUTH_FORBIDDEN': {
        message: 'Access forbidden',
        userMessage: 'Você não tem permissão para realizar esta ação.',
        severity: ErrorSeverity.HIGH
    },
    'AUTH_TOKEN_EXPIRED': {
        message: 'Authentication token expired',
        userMessage: 'Sua sessão expirou. Por favor, faça login novamente.',
        severity: ErrorSeverity.HIGH
    },
    // Business logic errors
    'BUSINESS_INVALID_MESSAGE_TYPE': {
        message: 'Invalid message type for operation',
        userMessage: 'Tipo de mensagem inválido para esta operação.',
        severity: ErrorSeverity.MEDIUM
    },
    'BUSINESS_MESSAGE_NOT_FOUND': {
        message: 'Message not found',
        userMessage: 'Mensagem não encontrada.',
        severity: ErrorSeverity.MEDIUM
    },
    'BUSINESS_CAIXA_NOT_FOUND': {
        message: 'Caixa not found',
        userMessage: 'Caixa de entrada não encontrada.',
        severity: ErrorSeverity.MEDIUM
    },
    'BUSINESS_DUPLICATE_BUTTON_ID': {
        message: 'Duplicate button ID',
        userMessage: 'IDs de botão devem ser únicos.',
        severity: ErrorSeverity.MEDIUM
    },
    // Media upload errors
    'MEDIA_UPLOAD_FAILED': {
        message: 'Media upload failed',
        userMessage: 'Falha no upload da mídia. Tente novamente.',
        severity: ErrorSeverity.MEDIUM
    },
    'MEDIA_INVALID_TYPE': {
        message: 'Invalid media type',
        userMessage: 'Tipo de mídia não suportado.',
        severity: ErrorSeverity.MEDIUM
    },
    'MEDIA_FILE_TOO_LARGE': {
        message: 'File size exceeds limit',
        userMessage: 'Arquivo muito grande. Tamanho máximo permitido excedido.',
        severity: ErrorSeverity.MEDIUM
    },
    // Database errors
    'DATABASE_CONNECTION_ERROR': {
        message: 'Database connection error',
        userMessage: 'Erro de conexão com o banco de dados. Tente novamente.',
        severity: ErrorSeverity.CRITICAL
    },
    'DATABASE_CONSTRAINT_VIOLATION': {
        message: 'Database constraint violation',
        userMessage: 'Violação de restrição de dados. Verifique os dados inseridos.',
        severity: ErrorSeverity.MEDIUM
    },
    'DATABASE_TRANSACTION_FAILED': {
        message: 'Database transaction failed',
        userMessage: 'Falha na transação. As alterações foram revertidas.',
        severity: ErrorSeverity.HIGH
    },
    // External API errors
    'WHATSAPP_API_ERROR': {
        message: 'WhatsApp API error',
        userMessage: 'Erro na API do WhatsApp. Tente novamente.',
        severity: ErrorSeverity.HIGH
    },
    'WHATSAPP_RATE_LIMITED': {
        message: 'WhatsApp API rate limited',
        userMessage: 'Limite de requisições do WhatsApp atingido. Aguarde um momento.',
        severity: ErrorSeverity.MEDIUM
    },
    'DIALOGFLOW_API_ERROR': {
        message: 'Dialogflow API error',
        userMessage: 'Erro na integração com Dialogflow. Tente novamente.',
        severity: ErrorSeverity.HIGH
    }
};
// Main error handler class
class InteractiveMessageErrorHandler {
    config;
    retryAttempts = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // Handle any error and convert to structured format
    handleError(error, context) {
        const structuredError = this.createStructuredError(error, context);
        // Log the error
        if (this.config.enableLogging) {
            this.logError(structuredError);
        }
        // Show user notification
        if (this.config.enableToasts) {
            this.showErrorToast(structuredError);
        }
        return structuredError;
    }
    // Handle API errors specifically
    handleApiError(response, context) {
        return response.json().then(errorData => {
            const error = new Error(errorData.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.code = errorData.code;
            error.details = errorData.details;
            return this.handleError(error, context);
        }).catch(() => {
            // If we can't parse the error response, create a generic error
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            return this.handleError(error, context);
        });
    }
    // Handle validation errors
    handleValidationError(validationErrors, context) {
        const error = new Error('Validation failed');
        error.code = 'VALIDATION_FAILED';
        error.validationErrors = validationErrors;
        return this.handleError(error, context);
    }
    // Retry mechanism
    async withRetry(operation, operationId, context) {
        const maxAttempts = this.config.maxRetryAttempts;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await operation();
                // Reset retry count on success
                this.retryAttempts.delete(operationId);
                return result;
            }
            catch (error) {
                lastError = error;
                // Check if error is retryable
                if (!this.isRetryableError(error) || attempt === maxAttempts) {
                    break;
                }
                // Update retry count
                this.retryAttempts.set(operationId, attempt);
                // Wait before retry
                await this.delay(this.config.retryDelay * attempt);
            }
        }
        // All retries failed, handle the error
        throw this.handleError(lastError, context);
    }
    // Create structured error from any error type
    createStructuredError(error, context) {
        const errorId = this.generateErrorId();
        const timestamp = new Date();
        // Determine error category and code
        let category = ErrorCategory.SERVER;
        let code = 'UNKNOWN_ERROR';
        let details = {};
        if (error.name === 'ValidationError' || error.code?.startsWith('VALIDATION_')) {
            category = ErrorCategory.VALIDATION;
            code = error.code || 'VALIDATION_FAILED';
            details = { validationErrors: error.validationErrors };
        }
        else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            category = ErrorCategory.NETWORK;
            code = 'NETWORK_CONNECTION_FAILED';
        }
        else if (error.status) {
            // HTTP errors
            if (error.status === 401) {
                category = ErrorCategory.AUTHENTICATION;
                code = 'AUTH_UNAUTHORIZED';
            }
            else if (error.status === 403) {
                category = ErrorCategory.AUTHORIZATION;
                code = 'AUTH_FORBIDDEN';
            }
            else if (error.status === 404) {
                category = ErrorCategory.BUSINESS_LOGIC;
                code = 'BUSINESS_RESOURCE_NOT_FOUND';
            }
            else if (error.status === 409) {
                category = ErrorCategory.BUSINESS_LOGIC;
                code = 'BUSINESS_CONFLICT';
            }
            else if (error.status === 429) {
                category = ErrorCategory.SERVER;
                code = 'SERVER_RATE_LIMITED';
            }
            else if (error.status >= 500) {
                category = ErrorCategory.SERVER;
                code = 'SERVER_INTERNAL_ERROR';
            }
        }
        else if (error.code) {
            code = error.code;
            // Try to determine category from code
            if (code.startsWith('VALIDATION_'))
                category = ErrorCategory.VALIDATION;
            else if (code.startsWith('AUTH_'))
                category = ErrorCategory.AUTHENTICATION;
            else if (code.startsWith('BUSINESS_'))
                category = ErrorCategory.BUSINESS_LOGIC;
            else if (code.startsWith('MEDIA_'))
                category = ErrorCategory.MEDIA_UPLOAD;
            else if (code.startsWith('DATABASE_'))
                category = ErrorCategory.DATABASE;
            else if (code.startsWith('WHATSAPP_') || code.startsWith('DIALOGFLOW_'))
                category = ErrorCategory.EXTERNAL_API;
        }
        // Get error messages
        const errorInfo = ERROR_MESSAGES[code] || {
            message: error.message || 'Unknown error occurred',
            userMessage: 'Ocorreu um erro inesperado. Tente novamente.',
            severity: ErrorSeverity.MEDIUM
        };
        // Add additional details
        if (error.details)
            details = { ...details, ...error.details };
        if (error.status)
            details.httpStatus = error.status;
        if (error.response)
            details.response = error.response;
        return {
            id: errorId,
            category,
            severity: errorInfo.severity,
            code,
            message: errorInfo.message,
            userMessage: errorInfo.userMessage,
            details,
            timestamp,
            context,
            stack: error.stack,
            recoveryActions: this.generateRecoveryActions(category, code, context)
        };
    }
    // Generate recovery actions based on error type
    generateRecoveryActions(category, code, context) {
        const actions = [];
        switch (category) {
            case ErrorCategory.NETWORK:
                actions.push({
                    label: 'Tentar novamente',
                    action: () => window.location.reload(),
                    type: 'retry'
                });
                break;
            case ErrorCategory.AUTHENTICATION:
                actions.push({
                    label: 'Fazer login novamente',
                    action: () => { window.location.href = '/auth/signin'; },
                    type: 'redirect'
                });
                break;
            case ErrorCategory.VALIDATION:
                actions.push({
                    label: 'Revisar dados',
                    action: () => {
                        // Focus on first invalid field if possible
                        const firstError = document.querySelector('[data-error="true"]');
                        if (firstError)
                            firstError.focus();
                    },
                    type: 'custom'
                });
                break;
            case ErrorCategory.MEDIA_UPLOAD:
                actions.push({
                    label: 'Tentar upload novamente',
                    action: async () => {
                        // Trigger file upload again
                        const fileInput = document.querySelector('input[type="file"]');
                        if (fileInput)
                            fileInput.click();
                    },
                    type: 'retry'
                });
                break;
            default:
                actions.push({
                    label: 'Tentar novamente',
                    action: () => window.location.reload(),
                    type: 'retry'
                });
                break;
        }
        return actions;
    }
    // Log error based on severity and configuration
    logError(error) {
        const logData = {
            id: error.id,
            category: error.category,
            severity: error.severity,
            code: error.code,
            message: error.message,
            context: error.context,
            details: error.details,
            timestamp: error.timestamp.toISOString(),
            stack: error.stack
        };
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
                console.error('[CRITICAL ERROR]', logData);
                // Send to external logging service
                this.sendToExternalLogger(logData, 'error');
                break;
            case ErrorSeverity.HIGH:
                console.error('[HIGH ERROR]', logData);
                this.sendToExternalLogger(logData, 'error');
                break;
            case ErrorSeverity.MEDIUM:
                console.warn('[MEDIUM ERROR]', logData);
                if (this.config.logLevel === 'warn' || this.config.logLevel === 'info' || this.config.logLevel === 'debug') {
                    this.sendToExternalLogger(logData, 'warn');
                }
                break;
            case ErrorSeverity.LOW:
                console.info('[LOW ERROR]', logData);
                if (this.config.logLevel === 'info' || this.config.logLevel === 'debug') {
                    this.sendToExternalLogger(logData, 'info');
                }
                break;
        }
    }
    // Show user-friendly toast notification
    showErrorToast(error) {
        const toastOptions = {
            duration: this.getToastDuration(error.severity),
            action: error.recoveryActions && error.recoveryActions.length > 0 ? {
                label: error.recoveryActions[0].label,
                onClick: error.recoveryActions[0].action
            } : undefined
        };
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.HIGH:
                sonner_1.toast.error(error.userMessage, toastOptions);
                break;
            case ErrorSeverity.MEDIUM:
                sonner_1.toast.warning(error.userMessage, toastOptions);
                break;
            case ErrorSeverity.LOW:
                sonner_1.toast.info(error.userMessage, toastOptions);
                break;
        }
    }
    // Utility methods
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getToastDuration(severity) {
        switch (severity) {
            case ErrorSeverity.CRITICAL: return 10000; // 10 seconds
            case ErrorSeverity.HIGH: return 7000; // 7 seconds
            case ErrorSeverity.MEDIUM: return 5000; // 5 seconds
            case ErrorSeverity.LOW: return 3000; // 3 seconds
            default: return 5000;
        }
    }
    isRetryableError(error) {
        // Network errors are generally retryable
        if (error.name === 'TypeError' && error.message.includes('fetch'))
            return true;
        // HTTP 5xx errors are retryable
        if (error.status >= 500)
            return true;
        // Rate limiting is retryable
        if (error.status === 429)
            return true;
        // Timeout errors are retryable
        if (error.code === 'NETWORK_TIMEOUT')
            return true;
        return false;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async sendToExternalLogger(logData, level) {
        try {
            // In a real application, you would send this to your logging service
            // For now, we'll just store it in localStorage for debugging
            const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
            logs.push({ ...logData, level });
            // Keep only last 100 logs
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }
            localStorage.setItem('error_logs', JSON.stringify(logs));
        }
        catch (error) {
            console.error('Failed to send log to external service:', error);
        }
    }
}
exports.InteractiveMessageErrorHandler = InteractiveMessageErrorHandler;
// Global error handler instance
exports.errorHandler = new InteractiveMessageErrorHandler();
// Utility functions for common error scenarios
function handleApiCall(apiCall, context) {
    return exports.errorHandler.withRetry(async () => {
        const response = await apiCall();
        if (!response.ok) {
            throw await exports.errorHandler.handleApiError(response, context);
        }
        return response.json();
    }, `api_${context?.action || 'call'}_${Date.now()}`, context);
}
function handleValidation(validationFn, context) {
    try {
        return validationFn();
    }
    catch (error) {
        throw exports.errorHandler.handleValidationError(error, context);
    }
}
function withErrorBoundary(operation, context) {
    try {
        return operation();
    }
    catch (error) {
        throw exports.errorHandler.handleError(error, context);
    }
}
