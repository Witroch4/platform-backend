"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.ConflictError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.ApiError = exports.API_ERROR_CODES = void 0;
exports.createSuccessResponse = createSuccessResponse;
exports.createErrorResponse = createErrorResponse;
exports.handleApiError = handleApiError;
exports.validateInput = validateInput;
exports.withValidation = withValidation;
exports.calculatePagination = calculatePagination;
exports.paginateArray = paginateArray;
exports.applySorting = applySorting;
exports.applyFilters = applyFilters;
exports.applySearch = applySearch;
exports.checkRateLimit = checkRateLimit;
exports.cleanupRateLimit = cleanupRateLimit;
const server_1 = require("next/server");
const zod_1 = require("zod");
// Error codes
exports.API_ERROR_CODES = {
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
};
// Custom error classes
class ApiError extends Error {
    code;
    statusCode;
    details;
    constructor(message, code, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
class ValidationError extends ApiError {
    constructor(message, details) {
        super(message, exports.API_ERROR_CODES.VALIDATION_ERROR, 400, details);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends ApiError {
    constructor(resource, id) {
        const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
        super(message, exports.API_ERROR_CODES.NOT_FOUND, 404);
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized') {
        super(message, exports.API_ERROR_CODES.UNAUTHORIZED, 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden') {
        super(message, exports.API_ERROR_CODES.FORBIDDEN, 403);
    }
}
exports.ForbiddenError = ForbiddenError;
class ConflictError extends ApiError {
    constructor(message, details) {
        super(message, exports.API_ERROR_CODES.CONFLICT, 409, details);
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends ApiError {
    constructor(limit, window) {
        super(`Rate limit exceeded: ${limit} requests per ${window}s`, exports.API_ERROR_CODES.RATE_LIMIT_EXCEEDED, 429, { limit, window });
    }
}
exports.RateLimitError = RateLimitError;
/**
 * Create a standardized success response
 */
function createSuccessResponse(data, statusCode = 200) {
    const response = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
    };
    return server_1.NextResponse.json(response, { status: statusCode });
}
/**
 * Create a standardized error response
 */
function createErrorResponse(code, message, statusCode = 500, details) {
    const response = {
        success: false,
        error: {
            code,
            message,
            details,
            timestamp: new Date().toISOString(),
        },
    };
    return server_1.NextResponse.json(response, { status: statusCode });
}
/**
 * Handle API errors with proper formatting and logging
 */
function handleApiError(error, defaultMessage = 'An error occurred', context) {
    console.error('[API Error]', {
        error,
        defaultMessage,
        context,
        timestamp: new Date().toISOString(),
    });
    // Handle known API errors
    if (error instanceof ApiError) {
        return createErrorResponse(error.code, error.message, error.statusCode, error.details);
    }
    // Handle Zod validation errors
    if (error instanceof zod_1.z.ZodError) {
        return createErrorResponse(exports.API_ERROR_CODES.VALIDATION_ERROR, 'Invalid input data', 400, {
            validationErrors: error.errors.map(err => ({
                path: err.path.join('.'),
                message: err.message,
                code: err.code,
            })),
        });
    }
    // Handle generic errors
    if (error instanceof Error) {
        return createErrorResponse(exports.API_ERROR_CODES.INTERNAL_SERVER_ERROR, error.message || defaultMessage, 500);
    }
    // Handle unknown errors
    return createErrorResponse(exports.API_ERROR_CODES.INTERNAL_SERVER_ERROR, defaultMessage, 500);
}
/**
 * Validate input using Zod schema
 */
function validateInput(schema, data) {
    try {
        return schema.parse(data);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
function withValidation(schema) {
    return async (request) => {
        try {
            const body = await request.json();
            return validateInput(schema, body);
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                throw new ValidationError('Invalid JSON in request body');
            }
            throw error;
        }
    };
}
function calculatePagination(params) {
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
function paginateArray(items, page, limit) {
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
function applySorting(items, sortBy, sortOrder = 'asc') {
    return items.sort((a, b) => {
        const aValue = getNestedValue(a, sortBy);
        const bValue = getNestedValue(b, sortBy);
        if (aValue === bValue)
            return 0;
        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            comparison = aValue.localeCompare(bValue);
        }
        else if (typeof aValue === 'number' && typeof bValue === 'number') {
            comparison = aValue - bValue;
        }
        else if (aValue instanceof Date && bValue instanceof Date) {
            comparison = aValue.getTime() - bValue.getTime();
        }
        else {
            // Fallback to string comparison
            comparison = String(aValue).localeCompare(String(bValue));
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });
}
/**
 * Get nested object value by path
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}
/**
 * Filter helper
 */
function applyFilters(items, filters) {
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
function applySearch(items, searchTerm, searchFields) {
    if (!searchTerm)
        return items;
    const searchLower = searchTerm.toLowerCase();
    return items.filter(item => {
        return searchFields.some(field => {
            const value = getNestedValue(item, field);
            return value && String(value).toLowerCase().includes(searchLower);
        });
    });
}
const rateLimitStore = new Map();
function checkRateLimit(key, config) {
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
function cleanupRateLimit() {
    const now = Date.now();
    rateLimitStore.forEach((value, key) => {
        if (value.resetTime <= now) {
            rateLimitStore.delete(key);
        }
    });
}
// Cleanup rate limit store every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupRateLimit, 5 * 60 * 1000);
}
