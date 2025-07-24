// Comprehensive error handling system for Interactive Messages
// Provides structured error handling, logging, and user-friendly error messages

import { toast } from 'sonner';

// Error types and categories
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  SERVER = 'SERVER',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  MEDIA_UPLOAD = 'MEDIA_UPLOAD',
  WEBHOOK = 'WEBHOOK',
  DATABASE = 'DATABASE',
  EXTERNAL_API = 'EXTERNAL_API'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Structured error interface
export interface StructuredError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  userMessage: string;
  details?: Record<string, any>;
  timestamp: Date;
  context?: {
    userId?: string;
    caixaId?: string;
    messageId?: string;
    action?: string;
    component?: string;
  };
  stack?: string;
  recoveryActions?: RecoveryAction[];
}

// Recovery action interface
export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  type: 'retry' | 'fallback' | 'redirect' | 'custom';
}

// Error handler configuration
export interface ErrorHandlerConfig {
  enableLogging: boolean;
  enableToasts: boolean;
  enableRetry: boolean;
  maxRetryAttempts: number;
  retryDelay: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// Default configuration
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  enableLogging: true,
  enableToasts: true,
  enableRetry: true,
  maxRetryAttempts: 3,
  retryDelay: 1000,
  logLevel: 'error'
};

// Error code mappings to user-friendly messages
const ERROR_MESSAGES: Record<string, { message: string; userMessage: string; severity: ErrorSeverity }> = {
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
export class InteractiveMessageErrorHandler {
  private config: ErrorHandlerConfig;
  private retryAttempts: Map<string, number> = new Map();

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Handle any error and convert to structured format
  handleError(error: any, context?: StructuredError['context']): StructuredError {
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
  handleApiError(response: Response, context?: StructuredError['context']): Promise<StructuredError> {
    return response.json().then(errorData => {
      const error = new Error(errorData.message || `HTTP ${response.status}`);
      (error as any).status = response.status;
      (error as any).code = errorData.code;
      (error as any).details = errorData.details;
      
      return this.handleError(error, context);
    }).catch(() => {
      // If we can't parse the error response, create a generic error
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      
      return this.handleError(error, context);
    });
  }

  // Handle validation errors
  handleValidationError(validationErrors: any[], context?: StructuredError['context']): StructuredError {
    const error = new Error('Validation failed');
    (error as any).code = 'VALIDATION_FAILED';
    (error as any).validationErrors = validationErrors;
    
    return this.handleError(error, context);
  }

  // Retry mechanism
  async withRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    context?: StructuredError['context']
  ): Promise<T> {
    const maxAttempts = this.config.maxRetryAttempts;
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        // Reset retry count on success
        this.retryAttempts.delete(operationId);
        return result;
      } catch (error) {
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
  private createStructuredError(error: any, context?: StructuredError['context']): StructuredError {
    const errorId = this.generateErrorId();
    const timestamp = new Date();

    // Determine error category and code
    let category = ErrorCategory.SERVER;
    let code = 'UNKNOWN_ERROR';
    let details: Record<string, any> = {};

    if (error.name === 'ValidationError' || error.code?.startsWith('VALIDATION_')) {
      category = ErrorCategory.VALIDATION;
      code = error.code || 'VALIDATION_FAILED';
      details = { validationErrors: error.validationErrors };
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      category = ErrorCategory.NETWORK;
      code = 'NETWORK_CONNECTION_FAILED';
    } else if (error.status) {
      // HTTP errors
      if (error.status === 401) {
        category = ErrorCategory.AUTHENTICATION;
        code = 'AUTH_UNAUTHORIZED';
      } else if (error.status === 403) {
        category = ErrorCategory.AUTHORIZATION;
        code = 'AUTH_FORBIDDEN';
      } else if (error.status === 404) {
        category = ErrorCategory.BUSINESS_LOGIC;
        code = 'BUSINESS_RESOURCE_NOT_FOUND';
      } else if (error.status === 409) {
        category = ErrorCategory.BUSINESS_LOGIC;
        code = 'BUSINESS_CONFLICT';
      } else if (error.status === 429) {
        category = ErrorCategory.SERVER;
        code = 'SERVER_RATE_LIMITED';
      } else if (error.status >= 500) {
        category = ErrorCategory.SERVER;
        code = 'SERVER_INTERNAL_ERROR';
      }
    } else if (error.code) {
      code = error.code;
      // Try to determine category from code
      if (code.startsWith('VALIDATION_')) category = ErrorCategory.VALIDATION;
      else if (code.startsWith('AUTH_')) category = ErrorCategory.AUTHENTICATION;
      else if (code.startsWith('BUSINESS_')) category = ErrorCategory.BUSINESS_LOGIC;
      else if (code.startsWith('MEDIA_')) category = ErrorCategory.MEDIA_UPLOAD;
      else if (code.startsWith('DATABASE_')) category = ErrorCategory.DATABASE;
      else if (code.startsWith('WHATSAPP_') || code.startsWith('DIALOGFLOW_')) category = ErrorCategory.EXTERNAL_API;
    }

    // Get error messages
    const errorInfo = ERROR_MESSAGES[code] || {
      message: error.message || 'Unknown error occurred',
      userMessage: 'Ocorreu um erro inesperado. Tente novamente.',
      severity: ErrorSeverity.MEDIUM
    };

    // Add additional details
    if (error.details) details = { ...details, ...error.details };
    if (error.status) details.httpStatus = error.status;
    if (error.response) details.response = error.response;

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
  private generateRecoveryActions(category: ErrorCategory, code: string, context?: StructuredError['context']): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

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
            const firstError = document.querySelector('[data-error="true"]') as HTMLElement;
            if (firstError) firstError.focus();
          },
          type: 'custom'
        });
        break;

      case ErrorCategory.MEDIA_UPLOAD:
        actions.push({
          label: 'Tentar upload novamente',
          action: async () => {
            // Trigger file upload again
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (fileInput) fileInput.click();
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
  private logError(error: StructuredError) {
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
  private showErrorToast(error: StructuredError) {
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
        toast.error(error.userMessage, toastOptions);
        break;
      case ErrorSeverity.MEDIUM:
        toast.warning(error.userMessage, toastOptions);
        break;
      case ErrorSeverity.LOW:
        toast.info(error.userMessage, toastOptions);
        break;
    }
  }

  // Utility methods
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getToastDuration(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 10000; // 10 seconds
      case ErrorSeverity.HIGH: return 7000; // 7 seconds
      case ErrorSeverity.MEDIUM: return 5000; // 5 seconds
      case ErrorSeverity.LOW: return 3000; // 3 seconds
      default: return 5000;
    }
  }

  private isRetryableError(error: any): boolean {
    // Network errors are generally retryable
    if (error.name === 'TypeError' && error.message.includes('fetch')) return true;
    
    // HTTP 5xx errors are retryable
    if (error.status >= 500) return true;
    
    // Rate limiting is retryable
    if (error.status === 429) return true;
    
    // Timeout errors are retryable
    if (error.code === 'NETWORK_TIMEOUT') return true;
    
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendToExternalLogger(logData: any, level: string) {
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
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
  }
}

// Global error handler instance
export const errorHandler = new InteractiveMessageErrorHandler();

// Utility functions for common error scenarios
export function handleApiCall<T>(
  apiCall: () => Promise<Response>,
  context?: StructuredError['context']
): Promise<T> {
  return errorHandler.withRetry(async () => {
    const response = await apiCall();
    
    if (!response.ok) {
      throw await errorHandler.handleApiError(response, context);
    }
    
    return response.json();
  }, `api_${context?.action || 'call'}_${Date.now()}`, context);
}

export function handleValidation(
  validationFn: () => any,
  context?: StructuredError['context']
): any {
  try {
    return validationFn();
  } catch (error) {
    throw errorHandler.handleValidationError(error as any[], context);
  }
}

export function withErrorBoundary<T>(
  operation: () => T,
  context?: StructuredError['context']
): T {
  try {
    return operation();
  } catch (error) {
    throw errorHandler.handleError(error, context);
  }
}