// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
require('@testing-library/jest-dom');

// Mock Next.js environment
Object.defineProperty(global, 'Request', {
  value: class MockRequest {
    constructor(url, options = {}) {
      Object.defineProperty(this, 'url', { value: url, writable: false });
      this.method = options.method || 'GET';
      this.headers = new Map(Object.entries(options.headers || {}));
      this._body = options.body;
    }

    async json() {
      return JSON.parse(this._body || '{}');
    }
  }
});

Object.defineProperty(global, 'Response', {
  value: class MockResponse {
    constructor(body, options = {}) {
      this.body = body;
      this.status = options.status || 200;
      this.headers = new Map(Object.entries(options.headers || {}));
    }

    async json() {
      return JSON.parse(this.body || '{}');
    }
  }
});

// Mock NextRequest specifically
jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    constructor(url, options = {}) {
      Object.defineProperty(this, 'url', { value: url, writable: false });
      this.method = options.method || 'POST';
      this.headers = new Map(Object.entries(options.headers || {}));
      this._body = options.body;
    }

    async json() {
      return JSON.parse(this._body || '{}');
    }
  },
  NextResponse: {
    json: (data, options = {}) => ({
      status: options.status || 200,
      json: async () => data,
      data
    })
  }
}));

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  // Only log if it's a test-related message
  if (args.some(arg => typeof arg === 'string' && (arg.includes('Test') || arg.includes('PASS') || arg.includes('FAIL')))) {
    originalConsoleLog(...args);
  }
};

console.error = (...args) => {
  // Only log errors if they're not expected test errors
  if (!args.some(arg => typeof arg === 'string' && arg.includes('Expected'))) {
    originalConsoleError(...args);
  }
};