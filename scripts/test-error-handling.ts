#!/usr/bin/env tsx

// Comprehensive test runner for error handling and validation
// Runs all tests related to error handling, validation, and recovery

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

interface TestResult {
	name: string;
	passed: boolean;
	duration: number;
	output: string;
	error?: string;
}

interface TestSuite {
	name: string;
	tests: TestResult[];
	totalPassed: number;
	totalFailed: number;
	totalDuration: number;
}

class ErrorHandlingTestRunner {
	private testSuites: TestSuite[] = [];
	private startTime: number = Date.now();

	// Test configurations
	private readonly testConfigs = [
		{
			name: "Interactive Message Validation",
			path: "lib/validation/__tests__/interactive-message-validation.test.ts",
			description: "Tests for comprehensive validation logic",
		},
		{
			name: "Error Handling System",
			path: "lib/error-handling/__tests__/interactive-message-errors.test.ts",
			description: "Tests for error handling, logging, and recovery",
		},
		{
			name: "Validation Hook",
			path: "app/admin/mtf-diamante/hooks/__tests__/useInteractiveMessageValidation.test.ts",
			description: "Tests for React validation hook",
		},
		{
			name: "API Error Handling",
			path: "app/api/admin/mtf-diamante/messages-with-reactions/__tests__/error-handling.test.ts",
			description: "Integration tests for API error handling",
		},
	];

	async runAllTests(): Promise<void> {
		console.log("🚀 Starting Error Handling and Validation Test Suite");
		console.log("=".repeat(60));
		console.log();

		for (const config of this.testConfigs) {
			await this.runTestSuite(config);
		}

		this.printSummary();
	}

	private async runTestSuite(config: { name: string; path: string; description: string }): Promise<void> {
		console.log(`📋 Running: ${config.name}`);
		console.log(`📝 Description: ${config.description}`);
		console.log(`📁 Path: ${config.path}`);
		console.log();

		const testSuite: TestSuite = {
			name: config.name,
			tests: [],
			totalPassed: 0,
			totalFailed: 0,
			totalDuration: 0,
		};

		// Check if test file exists
		if (!existsSync(config.path)) {
			console.log(`❌ Test file not found: ${config.path}`);
			console.log();
			return;
		}

		const startTime = Date.now();

		try {
			// Run Jest for specific test file
			const command = `npx jest ${config.path} --verbose --no-cache --detectOpenHandles`;
			const output = execSync(command, {
				encoding: "utf8",
				timeout: 60000, // 60 second timeout
				env: { ...process.env, NODE_ENV: "test" },
			});

			const duration = Date.now() - startTime;

			// Parse Jest output to extract test results
			const testResults = this.parseJestOutput(output);

			testSuite.tests = testResults;
			testSuite.totalPassed = testResults.filter((t) => t.passed).length;
			testSuite.totalFailed = testResults.filter((t) => !t.passed).length;
			testSuite.totalDuration = duration;

			console.log(`✅ ${config.name} completed`);
			console.log(`   Passed: ${testSuite.totalPassed}, Failed: ${testSuite.totalFailed}`);
			console.log(`   Duration: ${duration}ms`);
		} catch (error: any) {
			const duration = Date.now() - startTime;

			console.log(`❌ ${config.name} failed`);
			console.log(`   Error: ${error.message}`);
			console.log(`   Duration: ${duration}ms`);

			// Try to parse error output for individual test results
			const testResults = this.parseJestOutput(error.stdout || error.message);

			testSuite.tests = testResults;
			testSuite.totalPassed = testResults.filter((t) => t.passed).length;
			testSuite.totalFailed = testResults.filter((t) => !t.passed).length;
			testSuite.totalDuration = duration;
		}

		this.testSuites.push(testSuite);
		console.log();
	}

	private parseJestOutput(output: string): TestResult[] {
		const results: TestResult[] = [];
		const lines = output.split("\n");

		let currentTest = "";
		let testPassed = false;
		let testOutput = "";

		for (const line of lines) {
			// Match test descriptions
			if (line.includes("✓") || line.includes("✗")) {
				if (currentTest) {
					results.push({
						name: currentTest,
						passed: testPassed,
						duration: 0, // Jest doesn't provide individual test durations in this format
						output: testOutput.trim(),
					});
				}

				currentTest = line.replace(/^\s*[✓✗]\s*/, "").trim();
				testPassed = line.includes("✓");
				testOutput = "";
			} else if (currentTest) {
				testOutput += line + "\n";
			}
		}

		// Add the last test if exists
		if (currentTest) {
			results.push({
				name: currentTest,
				passed: testPassed,
				duration: 0,
				output: testOutput.trim(),
			});
		}

		return results;
	}

	private printSummary(): void {
		const totalDuration = Date.now() - this.startTime;
		const totalTests = this.testSuites.reduce((sum, suite) => sum + suite.tests.length, 0);
		const totalPassed = this.testSuites.reduce((sum, suite) => sum + suite.totalPassed, 0);
		const totalFailed = this.testSuites.reduce((sum, suite) => sum + suite.totalFailed, 0);

		console.log("📊 TEST SUMMARY");
		console.log("=".repeat(60));
		console.log();

		// Print suite-by-suite results
		for (const suite of this.testSuites) {
			const status = suite.totalFailed === 0 ? "✅" : "❌";
			console.log(`${status} ${suite.name}`);
			console.log(`   Tests: ${suite.tests.length} | Passed: ${suite.totalPassed} | Failed: ${suite.totalFailed}`);
			console.log(`   Duration: ${suite.totalDuration}ms`);

			// Show failed tests
			if (suite.totalFailed > 0) {
				const failedTests = suite.tests.filter((t) => !t.passed);
				for (const test of failedTests) {
					console.log(`   ❌ ${test.name}`);
				}
			}
			console.log();
		}

		// Overall summary
		console.log("🎯 OVERALL RESULTS");
		console.log("-".repeat(40));
		console.log(`Total Test Suites: ${this.testSuites.length}`);
		console.log(`Total Tests: ${totalTests}`);
		console.log(`Passed: ${totalPassed}`);
		console.log(`Failed: ${totalFailed}`);
		console.log(`Success Rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%`);
		console.log(`Total Duration: ${totalDuration}ms`);
		console.log();

		// Coverage recommendations
		this.printCoverageRecommendations();

		// Exit with appropriate code
		if (totalFailed > 0) {
			console.log("❌ Some tests failed. Please review and fix the issues.");
			process.exit(1);
		} else {
			console.log("✅ All tests passed! Error handling and validation systems are working correctly.");
			process.exit(0);
		}
	}

	private printCoverageRecommendations(): void {
		console.log("💡 COVERAGE RECOMMENDATIONS");
		console.log("-".repeat(40));

		const recommendations = [
			"Ensure all error scenarios are covered in validation tests",
			"Test edge cases for field validation (empty strings, null values, etc.)",
			"Verify error recovery actions work as expected",
			"Test API error handling with various HTTP status codes",
			"Validate that logging captures all necessary error context",
			"Test retry mechanisms for transient failures",
			"Ensure user-friendly error messages are displayed correctly",
			"Test validation hook behavior with rapid state changes",
			"Verify database transaction rollbacks work properly",
			"Test error handling in concurrent scenarios",
		];

		recommendations.forEach((rec, index) => {
			console.log(`${index + 1}. ${rec}`);
		});
		console.log();
	}

	// Method to run specific test categories
	async runValidationTests(): Promise<void> {
		const validationConfigs = this.testConfigs.filter((config) => config.name.toLowerCase().includes("validation"));

		console.log("🔍 Running Validation Tests Only");
		console.log("=".repeat(40));
		console.log();

		for (const config of validationConfigs) {
			await this.runTestSuite(config);
		}

		this.printSummary();
	}

	async runErrorHandlingTests(): Promise<void> {
		const errorConfigs = this.testConfigs.filter((config) => config.name.toLowerCase().includes("error"));

		console.log("🚨 Running Error Handling Tests Only");
		console.log("=".repeat(40));
		console.log();

		for (const config of errorConfigs) {
			await this.runTestSuite(config);
		}

		this.printSummary();
	}

	async runApiTests(): Promise<void> {
		const apiConfigs = this.testConfigs.filter((config) => config.name.toLowerCase().includes("api"));

		console.log("🌐 Running API Tests Only");
		console.log("=".repeat(40));
		console.log();

		for (const config of apiConfigs) {
			await this.runTestSuite(config);
		}

		this.printSummary();
	}
}

// CLI interface
async function main() {
	const args = process.argv.slice(2);
	const runner = new ErrorHandlingTestRunner();

	switch (args[0]) {
		case "validation":
			await runner.runValidationTests();
			break;
		case "errors":
			await runner.runErrorHandlingTests();
			break;
		case "api":
			await runner.runApiTests();
			break;
		case "all":
		default:
			await runner.runAllTests();
			break;
	}
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
	console.error("❌ Uncaught Exception:", error);
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
	process.exit(1);
});

// Run the main function
if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Test runner failed:", error);
		process.exit(1);
	});
}

export { ErrorHandlingTestRunner };
