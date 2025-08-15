const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Cost System Tests',
  testMatch: [
    '<rootDir>/__tests__/unit/cost/**/*.test.ts',
    '<rootDir>/__tests__/integration/cost/**/*.test.ts',
  ],
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup/jest.setup.ts',
    '<rootDir>/__tests__/cost/setup.ts',
  ],
  testTimeout: 30000, // Longer timeout for integration tests
  maxWorkers: 2, // Limit workers for database tests
};