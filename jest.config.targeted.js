/**
 * Jest Configuration for Targeted Backend and Frontend Tests
 * Optimized configuration for testing refactored worker architecture and unified data model
 * Requirements: 7.3, 8.1, 8.2
 */

const nextJest = require("next/jest");

const createJestConfig = nextJest({
	// Provide the path to your Next.js app to load next.config.js and .env files
	dir: "./",
});

// Custom Jest configuration for targeted tests
const customJestConfig = {
	// Test environment
	testEnvironment: "jsdom",

	// Setup files
	setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

	// Module name mapping for path aliases and static assets
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
		"^@/components/(.*)$": "<rootDir>/components/$1",
		"^@/lib/(.*)$": "<rootDir>/lib/$1",
		"^@/app/(.*)$": "<rootDir>/app/$1",
		"^@/worker/(.*)$": "<rootDir>/worker/$1",
		"^@/types/(.*)$": "<rootDir>/types/$1",
		// Mock static assets
		"\\.(css|less|scss|sass)$": "identity-obj-proxy",
		"\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
			"<rootDir>/__mocks__/fileMock.js",
	},

	// Test patterns for targeted tests (allow all tests in these directories)
	testMatch: [
		"<rootDir>/__tests__/unit/**/*.test.{ts,tsx}",
		"<rootDir>/__tests__/integration/**/*.test.{ts,tsx}",
		"<rootDir>/__tests__/frontend/**/*.test.{ts,tsx}",
	],

	// Coverage configuration (disabled for now to focus on test functionality)
	collectCoverage: false,
	coverageDirectory: "<rootDir>/coverage/targeted",
	coverageReporters: ["text", "lcov", "html", "json"],

	// Coverage thresholds for targeted components
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80,
		},
		// Specific thresholds for key files
		"./worker/webhook.worker.ts": {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
		},
		"./worker/WebhookWorkerTasks/respostaRapida.worker.task.ts": {
			branches: 85,
			functions: 85,
			lines: 85,
			statements: 85,
		},
		"./worker/WebhookWorkerTasks/persistencia.worker.task.ts": {
			branches: 85,
			functions: 85,
			lines: 85,
			statements: 85,
		},
		"./app/api/admin/mtf-diamante/dialogflow/webhook/route.ts": {
			branches: 85,
			functions: 85,
			lines: 85,
			statements: 85,
		},
	},

	// Files to collect coverage from
	collectCoverageFrom: [
		// Backend worker files
		"worker/webhook.worker.ts",
		"worker/WebhookWorkerTasks/**/*.ts",
		"lib/queue/**/*.ts",
		"lib/cache/**/*.ts",
		"app/api/admin/mtf-diamante/dialogflow/webhook/route.ts",

		// Frontend component files
		"app/admin/mtf-diamante/components/TemplatesTab/**/*.tsx",
		"app/admin/mtf-diamante/context/SwrProvider.tsx",

		// Exclude test files and node_modules
		"!**/*.test.{ts,tsx}",
		"!**/*.spec.{ts,tsx}",
		"!**/node_modules/**",
		"!**/.next/**",
		"!**/coverage/**",
		"!**/*.d.ts",
	],

	// Transform configuration
	transform: {
		"^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["next/babel"] }],
	},

	// Module file extensions
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

	// Test timeout for integration tests
	testTimeout: 30000,

	// Verbose output for detailed test results
	verbose: true,

	// Clear mocks between tests
	clearMocks: true,

	// Restore mocks after each test
	restoreMocks: true,

	// Reset modules between tests
	resetModules: true,

	// Global setup and teardown
	globalSetup: "<rootDir>/__tests__/setup/global-setup.js",
	globalTeardown: "<rootDir>/__tests__/setup/global-teardown.js",

	// Test environment options
	testEnvironmentOptions: {
		url: "http://localhost:3000",
	},

	// Ignore patterns
	testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/coverage/", "<rootDir>/dist/"],

	// Watch plugins for development (commented out to avoid dependency issues)
	// watchPlugins: [
	//   'jest-watch-typeahead/filename',
	//   'jest-watch-typeahead/testname',
	// ],

	// Error handling
	errorOnDeprecated: true,

	// Performance monitoring
	detectOpenHandles: true,
	forceExit: true,

	// Parallel execution
	maxWorkers: "50%",

	// Cache configuration
	cache: false, // Disable cache for consistent test runs

	// Reporter configuration (simplified to avoid dependency issues)
	reporters: ["default"],

	// Custom test results processor (commented out to avoid issues)
	// testResultsProcessor: '<rootDir>/__tests__/processors/test-results-processor.js',
};

// Export the Jest configuration
module.exports = createJestConfig(customJestConfig);
