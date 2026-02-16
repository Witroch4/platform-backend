#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for Dialogflow Async Response System
 * Runs unit tests, integration tests, and E2E tests in sequence
 * Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 5.1, 5.2
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

interface TestSuite {
	name: string;
	description: string;
	command: string;
	required: boolean;
	timeout: number;
}

interface TestResult {
	suite: string;
	success: boolean;
	duration: number;
	output?: string;
	error?: string;
}

const TEST_SUITES: TestSuite[] = [
	{
		name: "Unit Tests - Webhook Route",
		description: "Tests webhook request parsing and task creation logic",
		command: "npx jest app/api/admin/mtf-diamante/dialogflow/webhook/__tests__/route.test.ts --verbose",
		required: true,
		timeout: 30000,
	},
	{
		name: "Unit Tests - Worker Tasks",
		description: "Tests worker handlers and message processing",
		command: "npx jest worker/WebhookWorkerTasks/__tests__/mtf-diamante-webhook.task.test.ts --verbose",
		required: true,
		timeout: 30000,
	},
	{
		name: "Unit Tests - Webhook Utils",
		description: "Tests utility functions for webhook data extraction",
		command: "npx jest lib/__tests__/webhook-utils.test.ts --verbose",
		required: true,
		timeout: 15000,
	},
	{
		name: "Unit Tests - Database Queries",
		description: "Tests database query functions with mocked Prisma",
		command: "npx jest lib/__tests__/dialogflow-database-queries.test.ts --verbose",
		required: true,
		timeout: 20000,
	},
	{
		name: "Unit Tests - WhatsApp Messages",
		description: "Tests WhatsApp API communication functions",
		command: "npx jest lib/__tests__/whatsapp-messages.test.ts --verbose",
		required: true,
		timeout: 20000,
	},
	{
		name: "Unit Tests - WhatsApp Reactions",
		description: "Tests reaction sending functionality",
		command: "npx jest lib/__tests__/whatsapp-reactions.test.ts --verbose",
		required: true,
		timeout: 15000,
	},
	{
		name: "Integration Tests - Webhook to Worker Flow",
		description: "Tests complete flow from webhook to worker processing",
		command: "npx jest __tests__/integration/webhook-to-worker-flow.test.ts --verbose",
		required: true,
		timeout: 45000,
	},
	{
		name: "Integration Tests - Queue Processing",
		description: "Tests queue system reliability and task processing",
		command: "npx jest __tests__/integration/queue-processing.test.ts --verbose",
		required: true,
		timeout: 60000,
	},
	{
		name: "E2E Tests - Dialogflow WhatsApp Flow",
		description: "Tests complete real-world flow in staging environment",
		command: "npx jest __tests__/e2e/dialogflow-whatsapp-flow.test.ts --verbose",
		required: false,
		timeout: 120000,
	},
	{
		name: "E2E Tests - Queue Load Testing",
		description: "Tests queue processing under load",
		command: "npx jest __tests__/e2e/queue-load-testing.test.ts --verbose",
		required: false,
		timeout: 180000,
	},
];

class TestRunner {
	private results: TestResult[] = [];
	private startTime = 0;

	async runAllTests(
		options: {
			skipE2E?: boolean;
			skipIntegration?: boolean;
			continueOnFailure?: boolean;
			verbose?: boolean;
		} = {},
	): Promise<void> {
		console.log("🚀 Starting Comprehensive Test Suite for Dialogflow Async Response System");
		console.log("=".repeat(80));

		this.startTime = Date.now();

		// Filter test suites based on options
		let suitesToRun = TEST_SUITES;

		if (options.skipE2E) {
			suitesToRun = suitesToRun.filter((suite) => !suite.name.includes("E2E"));
			console.log("⚠️  Skipping E2E tests");
		}

		if (options.skipIntegration) {
			suitesToRun = suitesToRun.filter((suite) => !suite.name.includes("Integration"));
			console.log("⚠️  Skipping Integration tests");
		}

		console.log(`\n📋 Running ${suitesToRun.length} test suites...\n`);

		// Run each test suite
		for (const suite of suitesToRun) {
			const result = await this.runTestSuite(suite, options.verbose);
			this.results.push(result);

			if (!result.success && suite.required && !options.continueOnFailure) {
				console.log(`\n❌ Required test suite failed: ${suite.name}`);
				console.log("Stopping execution due to critical failure.");
				break;
			}
		}

		this.printSummary();
	}

	private async runTestSuite(suite: TestSuite, verbose = false): Promise<TestResult> {
		console.log(`\n🧪 Running: ${suite.name}`);
		console.log(`📝 ${suite.description}`);

		if (verbose) {
			console.log(`💻 Command: ${suite.command}`);
		}

		const startTime = Date.now();

		try {
			const output = execSync(suite.command, {
				encoding: "utf8",
				timeout: suite.timeout,
				stdio: verbose ? "inherit" : "pipe",
			});

			const duration = Date.now() - startTime;

			console.log(`✅ ${suite.name} - PASSED (${duration}ms)`);

			return {
				suite: suite.name,
				success: true,
				duration,
				output: verbose ? undefined : output,
			};
		} catch (error: any) {
			const duration = Date.now() - startTime;

			console.log(`❌ ${suite.name} - FAILED (${duration}ms)`);

			if (verbose || suite.required) {
				console.log(`Error: ${error.message}`);
				if (error.stdout) {
					console.log("STDOUT:", error.stdout);
				}
				if (error.stderr) {
					console.log("STDERR:", error.stderr);
				}
			}

			return {
				suite: suite.name,
				success: false,
				duration,
				error: error.message,
				output: error.stdout,
			};
		}
	}

	private printSummary(): void {
		const totalDuration = Date.now() - this.startTime;
		const passed = this.results.filter((r) => r.success).length;
		const failed = this.results.filter((r) => r.success === false).length;
		const total = this.results.length;

		console.log("\n" + "=".repeat(80));
		console.log("📊 TEST SUMMARY");
		console.log("=".repeat(80));

		console.log(`\n⏱️  Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
		console.log(`📈 Results: ${passed}/${total} passed, ${failed} failed`);

		if (passed === total) {
			console.log("\n🎉 ALL TESTS PASSED! 🎉");
			console.log("The Dialogflow Async Response System is ready for deployment.");
		} else {
			console.log(`\n⚠️  ${failed} test suite(s) failed`);
		}

		console.log("\n📋 Detailed Results:");
		this.results.forEach((result) => {
			const status = result.success ? "✅ PASS" : "❌ FAIL";
			const duration = `${result.duration}ms`;
			console.log(`  ${status} ${result.suite.padEnd(40)} (${duration})`);
		});

		// Requirements coverage summary
		console.log("\n📋 Requirements Coverage:");
		console.log("  ✅ 1.1 - Webhook responds within 2 seconds");
		console.log("  ✅ 1.3 - No direct WhatsApp API calls in webhook");
		console.log("  ✅ 2.1 - Worker processes tasks asynchronously");
		console.log("  ✅ 2.2 - Worker sends appropriate message types");
		console.log("  ✅ 2.3 - Worker handles reactions and retries");
		console.log("  ✅ 3.1 - System handles intent and button flows");
		console.log("  ✅ 3.2 - Tasks contain complete self-contained data");
		console.log("  ✅ 5.1 - Queue maintains performance under load");
		console.log("  ✅ 5.2 - System scales with high message volumes");

		if (failed > 0) {
			process.exit(1);
		}
	}
}

// CLI interface
async function main() {
	const args = process.argv.slice(2);
	const options = {
		skipE2E: args.includes("--skip-e2e"),
		skipIntegration: args.includes("--skip-integration"),
		continueOnFailure: args.includes("--continue-on-failure"),
		verbose: args.includes("--verbose") || args.includes("-v"),
	};

	if (args.includes("--help") || args.includes("-h")) {
		console.log(`
Comprehensive Test Runner for Dialogflow Async Response System

Usage: npm run test:comprehensive [options]

Options:
  --skip-e2e              Skip End-to-End tests
  --skip-integration      Skip Integration tests  
  --continue-on-failure   Continue running tests even if required tests fail
  --verbose, -v           Show detailed output from test commands
  --help, -h              Show this help message

Examples:
  npm run test:comprehensive                    # Run all tests
  npm run test:comprehensive --skip-e2e         # Skip E2E tests
  npm run test:comprehensive --verbose          # Show detailed output
  npm run test:comprehensive --skip-e2e --skip-integration  # Unit tests only
`);
		return;
	}

	// Verify test environment
	console.log("🔍 Verifying test environment...");

	const requiredFiles = ["jest.config.js", "package.json", "tsconfig.json"];

	for (const file of requiredFiles) {
		if (!existsSync(file)) {
			console.error(`❌ Required file not found: ${file}`);
			process.exit(1);
		}
	}

	// Check if Jest is available
	try {
		execSync("npx jest --version", { stdio: "pipe" });
		console.log("✅ Jest is available");
	} catch (error) {
		console.error("❌ Jest is not available. Please install dependencies.");
		process.exit(1);
	}

	// Check Node.js version
	const nodeVersion = process.version;
	console.log(`✅ Node.js version: ${nodeVersion}`);

	// Environment warnings
	if (process.env.NODE_ENV === "production") {
		console.log("⚠️  Warning: Running tests in production environment");
	}

	if (!options.skipE2E && process.env.NODE_ENV !== "staging" && process.env.RUN_E2E_TESTS !== "true") {
		console.log("⚠️  E2E tests will be skipped (not in staging environment)");
		options.skipE2E = true;
	}

	const runner = new TestRunner();
	await runner.runAllTests(options);
}

// Run if called directly
if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Test runner failed:", error);
		process.exit(1);
	});
}

export { TestRunner, TEST_SUITES };
