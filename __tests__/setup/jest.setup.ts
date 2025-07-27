/**
 * Jest setup file for sistema-refatoracao-prisma tests
 * Configures global test environment and utilities
 */

import { jest } from '@jest/globals';

// Import centralized mocks
import './mocks';

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveCorrelationId(received: any) {
    const hasCorrelationId = received && 
      typeof received.correlationId === 'string' && 
      received.correlationId.match(/^\d+-[a-z0-9]+$/);
    
    if (hasCorrelationId) {
      return {
        message: () => `expected object not to have valid correlation ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected object to have valid correlation ID`,
        pass: false,
      };
    }
  },
  
  toBeValidWhatsAppCredentials(received: any) {
    const isValid = received &&
      typeof received.whatsappApiKey === 'string' &&
      typeof received.phoneNumberId === 'string' &&
      typeof received.businessId === 'string' &&
      received.whatsappApiKey.length > 0 &&
      received.phoneNumberId.length > 0 &&
      received.businessId.length > 0;
    
    if (isValid) {
      return {
        message: () => `expected object not to be valid WhatsApp credentials`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected object to be valid WhatsApp credentials`,
        pass: false,
      };
    }
  },
});

// Global test configuration
beforeAll(() => {
  // Set timezone for consistent date testing
  process.env.TZ = 'America/Sao_Paulo';
  
  // Increase timeout for performance tests
  jest.setTimeout(30000);
  
  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset modules to ensure clean state
  jest.resetModules();
  
  // Clear any timers
  jest.clearAllTimers();
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
  
  // Clear any remaining timers
  jest.clearAllTimers();
});

afterAll(() => {
  // Final cleanup
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// Global utilities for tests
global.testUtils = {
  // Create mock correlation ID
  createMockCorrelationId: () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Create mock WhatsApp credentials
  createMockCredentials: (overrides = {}) => ({
    whatsappApiKey: 'test-api-key',
    phoneNumberId: '123456789',
    businessId: 'business123',
    ...overrides,
  }),
  
  // Create mock webhook payload
  createMockWebhookPayload: (overrides = {}) => ({
    originalDetectIntentRequest: {
      payload: {
        inbox_id: '4',
        contact_phone: '+5511999999999',
        interaction_type: 'intent',
        wamid: 'wamid.test123',
        whatsapp_api_key: 'test-api-key',
        phone_number_id: '123456789',
        business_id: 'business123',
        contact_source: 'chatwit',
        message_id: 12345,
        account_id: 1,
        account_name: 'Test Account',
        ...overrides.payload,
      },
    },
    queryResult: {
      intent: {
        displayName: 'test.intent',
      },
      ...overrides.queryResult,
    },
    ...overrides,
  }),
  
  // Wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock job data
  createMockJobData: (type: string, data: any) => ({
    id: 'job-123',
    name: `test-${type}-job`,
    data: {
      type,
      data,
    },
    attemptsMade: 1,
    opts: { attempts: 3 },
  }),
};

// Type declarations for global utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveCorrelationId(): R;
      toBeValidWhatsAppCredentials(): R;
    }
  }
  
  var testUtils: {
    createMockCorrelationId(): string;
    createMockCredentials(overrides?: any): any;
    createMockWebhookPayload(overrides?: any): any;
    waitFor(ms: number): Promise<void>;
    createMockJobData(type: string, data: any): any;
  };
}

export {};