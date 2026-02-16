#!/usr/bin/env tsx
/**
 * TURBO Mode Performance Optimization Script
 * Runs comprehensive performance optimization for TURBO mode
 * Based on requirements 3.5, 5.6, 10.2
 */

import {
	runCompletePerformanceOptimization,
	optimizeFeatureFlagQueries,
	optimizeParallelProcessingParameters,
	simulateLoadTesting,
	verifySystemStability,
} from "@/lib/turbo-mode/performance-optimizer";
import log from "@/lib/utils/logger";

async function main() {
	console.log("⚡ TURBO Mode Performance Optimization");
	console.log("=====================================");

	try {
		const args = process.argv.slice(2);

		if (args.includes("--database-only")) {
			console.log("🗄️ Running Database Optimization Only");
			const result = await optimizeFeatureFlagQueries();
			console.log(`Success: ${result.success ? "✅" : "❌"}`);
			console.log("Optimizations:");
			result.optimizations.forEach((opt) => console.log(`  ✅ ${opt}`));
			if (result.errors.length > 0) {
				console.log("Errors:");
				result.errors.forEach((error) => console.log(`  ❌ ${error}`));
			}
			process.exit(result.success ? 0 : 1);
		}

		if (args.includes("--parallel-only")) {
			console.log("⚙️ Running Parallel Processing Optimization Only");
			const result = await optimizeParallelProcessingParameters();
			console.log(`Success: ${result.success ? "✅" : "❌"}`);
			console.log("\nCurrent Configuration:");
			console.log(JSON.stringify(result.currentConfig, null, 2));
			console.log("\nOptimized Configuration:");
			console.log(JSON.stringify(result.optimizedConfig, null, 2));
			console.log("\nRecommendations:");
			result.recommendations.forEach((rec) => console.log(`  💡 ${rec}`));
			process.exit(result.success ? 0 : 1);
		}

		if (args.includes("--load-test")) {
			const concurrentUsers = parseInt(args.find((arg) => arg.startsWith("--users="))?.split("=")[1] || "10");
			console.log(`🔥 Running Load Test with ${concurrentUsers} concurrent users`);
			const result = await simulateLoadTesting(concurrentUsers);
			console.log(`Success: ${result.success ? "✅" : "❌"}`);
			console.log("\nMetrics:");
			console.log(`  Total Requests: ${result.metrics.totalRequests}`);
			console.log(`  Successful: ${result.metrics.successfulRequests}`);
			console.log(`  Failed: ${result.metrics.failedRequests}`);
			console.log(`  Average Response Time: ${result.metrics.averageResponseTime.toFixed(2)}ms`);
			console.log(`  Max Response Time: ${result.metrics.maxResponseTime}ms`);
			console.log(`  Min Response Time: ${result.metrics.minResponseTime}ms`);
			console.log(`  Throughput: ${result.metrics.throughput.toFixed(2)} req/s`);
			if (result.errors.length > 0) {
				console.log("\nErrors:");
				result.errors.forEach((error) => console.log(`  ❌ ${error}`));
			}
			process.exit(result.success ? 0 : 1);
		}

		if (args.includes("--stability-test")) {
			console.log("🛡️ Running System Stability Test");
			const result = await verifySystemStability();
			console.log(`Success: ${result.success ? "✅" : "❌"}`);
			console.log("\nStability Tests:");
			Object.entries(result.tests).forEach(([test, status]) => {
				console.log(`  ${test}: ${status ? "✅" : "❌"}`);
			});
			if (result.errors.length > 0) {
				console.log("\nErrors:");
				result.errors.forEach((error) => console.log(`  ❌ ${error}`));
			}
			process.exit(result.success ? 0 : 1);
		}

		// Run complete optimization by default
		console.log("🚀 Running Complete Performance Optimization");
		const result = await runCompletePerformanceOptimization();

		console.log("\n📊 Optimization Results");
		console.log("=======================");
		console.log(`Overall Success: ${result.success ? "✅" : "❌"}`);

		console.log("\n✨ Applied Optimizations:");
		result.optimizations.forEach((opt) => console.log(`  ✅ ${opt}`));

		console.log("\n💡 Recommendations:");
		result.recommendations.forEach((rec) => console.log(`  💡 ${rec}`));

		console.log("\n📈 Performance Metrics:");
		console.log("Database Queries:");
		console.log(`  Feature Flag Queries: ${result.metrics.databaseQueries.featureFlagQueries}`);
		console.log(`  User Lookup Queries: ${result.metrics.databaseQueries.userLookupQueries}`);
		console.log(`  Lead Processing Queries: ${result.metrics.databaseQueries.leadProcessingQueries}`);
		console.log(`  Average Query Time: ${result.metrics.databaseQueries.averageQueryTime.toFixed(2)}ms`);

		console.log("\nRedis Operations:");
		console.log(`  Cache Hits: ${result.metrics.redisOperations.cacheHits}`);
		console.log(`  Cache Misses: ${result.metrics.redisOperations.cacheMisses}`);
		console.log(`  Hit Rate: ${(result.metrics.redisOperations.hitRate * 100).toFixed(1)}%`);
		console.log(`  Average Response Time: ${result.metrics.redisOperations.averageResponseTime.toFixed(2)}ms`);

		console.log("\nTURBO Mode Operations:");
		console.log(`  Parallel Processing Jobs: ${result.metrics.turboModeOperations.parallelProcessingJobs}`);
		console.log(`  Sequential Fallbacks: ${result.metrics.turboModeOperations.sequentialFallbacks}`);
		console.log(`  Average Processing Time: ${result.metrics.turboModeOperations.averageProcessingTime.toFixed(2)}ms`);
		console.log(`  Error Rate: ${(result.metrics.turboModeOperations.errorRate * 100).toFixed(2)}%`);

		process.exit(result.success ? 0 : 1);
	} catch (error) {
		console.error("❌ Performance optimization failed:", error);
		log.error("Performance optimization script failed", { error });
		process.exit(1);
	}
}

// Show help if requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log("TURBO Mode Performance Optimization Script");
	console.log("==========================================");
	console.log("");
	console.log("Usage: npm run optimize:turbo-mode [options]");
	console.log("");
	console.log("Options:");
	console.log("  --database-only     Run database optimization only");
	console.log("  --parallel-only     Run parallel processing optimization only");
	console.log("  --load-test         Run load testing only");
	console.log("  --users=N           Number of concurrent users for load test (default: 10)");
	console.log("  --stability-test    Run system stability test only");
	console.log("  --help, -h          Show this help message");
	console.log("");
	console.log("Examples:");
	console.log("  npm run optimize:turbo-mode");
	console.log("  npm run optimize:turbo-mode -- --database-only");
	console.log("  npm run optimize:turbo-mode -- --load-test --users=20");
	console.log("  npm run optimize:turbo-mode -- --stability-test");
	process.exit(0);
}

main();
