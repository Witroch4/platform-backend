import { NextResponse } from 'next/server';
import { z } from 'zod';

// Standard API response interfaces
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Error codes
export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  QUEUE_NOT_FOUND: 'QUEUE_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
} as const;

// Custom error classes
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, API_ERROR_CODES.VALIDATION_ERROR, 400, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, API_ERROR_CODES.NOT_FOUND, 404);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, API_ERROR_CODES.UNAUTHORIZED, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, API_ERROR_CODES.FORBIDDEN, 403);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, API_ERROR_CODES.CONFLICT, 409, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(limit: number, window: number) {
    super(
      `Rate limit exceeded: ${limit} requests per ${window}s`,
      API_ERROR_CODES.RATE_LIMIT_EXCEEDED,
      429,
      { limit, window }
    );
  }
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200
): NextResponse {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  statusCode: number = 500,
  details?: any
): NextResponse {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Handle API errors with proper formatting and logging
 */
export function handleApiError(
  error: unknown,
  defaultMessage: string = 'An error occurred',
  context?: Record<string, any>
): NextResponse {
  console.error('[API Error]', {
    error,
    defaultMessage,
    context,
    timestamp: new Date().toISOString(),
  });

  // Handle known API errors
  if (error instanceof ApiError) {
    return createErrorResponse(
      error.code,
      error.message,
      error.statusCode,
      error.details
    );
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return createErrorResponse(
      API_ERROR_CODES.VALIDATION_ERROR,
      'Invalid input data',
      400,
      {
        validationErrors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      }
    );
  }

  // Handle generic errors
  if (error instanceof Error) {
    return createErrorResponse(
      API_ERROR_CODES.INTERNAL_SERVER_ERROR,
      error.message || defaultMessage,
      500
    );
  }

  // Handle unknown errors
  return createErrorResponse(
    API_ERROR_CODES.INTERNAL_SERVER_ERROR,
    defaultMessage,
    500
  );
}

/**
 * Validate input using Zod schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid input data', {
        validationErrors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    }
    throw error;
  }
}

/**
 * Middleware to validate request body
 */
export function withValidation<T>(schema: z.ZodSchema<T>) {
  return async (request: Request): Promise<T> => {
    try {
      const body = await request.json();
      return validateInput(schema, body);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ValidationError('Invalid JSON in request body');
      }
      throw error;
    }
  };
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  page: number;
  limit: number;
  total: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  startIndex: number;
  endIndex: number;
}

export function calculatePagination(params: PaginationParams): PaginationResult {
  const { page, limit, total } = params;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    startIndex,
    endIndex,
  };
}

/**
 * Apply pagination to an array
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  limit: number
): {
  items: T[];
  pagination: PaginationResult;
} {
  const pagination = calculatePagination({
    page,
    limit,
    total: items.length,
  });

  const paginatedItems = items.slice(pagination.startIndex, pagination.endIndex);

  return {
    items: paginatedItems,
    pagination,
  };
}

/**
 * Sort helper
 */
export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export function applySorting<T>(
  items: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'asc'
): T[] {
  return items.sort((a, b) => {
    const aValue = getNestedValue(a, sortBy);
    const bValue = getNestedValue(b, sortBy);

    if (aValue === bValue) return 0;

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else if (aValue instanceof Date && bValue instanceof Date) {
      comparison = aValue.getTime() - bValue.getTime();
    } else {
      // Fallback to string comparison
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });
}

/**
 * Get nested object value by path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Filter helper
 */
export function applyFilters<T>(
  items: T[],
  filters: Record<string, any>
): T[] {
  return items.filter(item => {
    return Object.entries(filters).every(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return true; // Skip empty filters
      }

      const itemValue = getNestedValue(item, key);

      if (Array.isArray(value)) {
        return value.includes(itemValue);
      }

      if (typeof value === 'string' && typeof itemValue === 'string') {
        return itemValue.toLowerCase().includes(value.toLowerCase());
      }

      return itemValue === value;
    });
  });
}

/**
 * Search helper
 */
export function applySearch<T>(
  items: T[],
  searchTerm: string,
  searchFields: string[]
): T[] {
  if (!searchTerm) return items;

  const searchLower = searchTerm.toLowerCase();

  return items.filter(item => {
    return searchFields.some(field => {
      const value = getNestedValue(item, field);
      return value && String(value).toLowerCase().includes(searchLower);
    });
  });
}

/**
 * Rate limiting helper
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: Date } {
  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const resetTime = new Date(windowStart + config.windowMs);

  const current = rateLimitStore.get(key);

  if (!current || current.resetTime <= now) {
    // New window or expired
    rateLimitStore.set(key, { count: 1, resetTime: resetTime.getTime() });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
    };
  }

  if (current.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime,
    };
  }

  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: config.maxRequests - current.count,
    resetTime,
  };
}

/**
 * Cleanup expired rate limit entries
 */
export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup rate limit store every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimit, 5 * 60 * 1000);
}