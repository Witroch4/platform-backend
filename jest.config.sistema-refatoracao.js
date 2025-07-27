/**
 * Jest configuration for sistema-refatoracao-prisma test suite
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Multiple test environments
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/__tests__/unit/**/*.test.ts',
        '<rootDir>/__tests__/integration/**/*.test.ts',
        '<rootDir>/__tests__/performance/**/*.test.ts',
        '<rootDir>/__tests__/e2e/**/*.test.ts',
      ],
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/__tests__/frontend/**/*.test.tsx',
        '<rootDir>/__tests__/frontend/**/*.test.ts',
      ],
      setupFilesAfterEnv: [
        '<rootDir>/__tests__/setup/jest.setup.ts',
        '<rootDir>/__tests__/setup/jsdom.setup.ts',
      ],
    },
  ],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.tsx',
  ],
  
  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/worker/(.*)$': '<rootDir>/worker/$1',
    '^@/types/(.*)$': '<rootDir>/types/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup/jest.setup.ts'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'app/api/**/*.ts',
    'lib/**/*.ts',
    'worker/**/*.ts',
    '!**/*.d.ts',
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/node_modules/**',
    '!**/coverage/**',
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
  ],
  
  // Test timeout (can be overridden per test)
  testTimeout: 30000,
  
  // Timeout configuration by test type
  testTimeout: {
    unit: 10000,      // 10s for unit tests
    integration: 30000, // 30s for integration tests
    performance: 60000, // 60s for performance tests
    e2e: 120000,       // 120s for e2e tests
  },
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/__tests__/setup/global-setup.js',
  globalTeardown: '<rootDir>/__tests__/setup/global-teardown.js',
  
  // Test results processor
  testResultsProcessor: '<rootDir>/__tests__/processors/test-results-processor.js',
  
  // Error handling
  errorOnDeprecated: true,
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: true,
  
  // Parallel execution
  maxWorkers: '50%',
  
  // Cache
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
};