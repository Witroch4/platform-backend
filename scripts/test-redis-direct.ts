/**
 * Test Redis connection directly
 */

import Redis from "ioredis";

const testRedisConfig = {
	host: "localhost",
	port: 6380,
	db: 15,
	password: undefined,
	maxRetriesPerRequest: 3,
	lazyConnect: false,
	connectTimeout: 5000,
	enableOfflineQueue: true,
	enableReadyCheck: true,
};

async function testRedisConnection() {
	console.log("🔍 Testing Redis connection directly...");
	console.log("Config:", testRedisConfig);

	const redis = new Redis(testRedisConfig);

	try {
		const result = await redis.ping();
		console.log("✅ Redis ping result:", result);

		await redis.set("test:key", "test:value");
		const value = await redis.get("test:key");
		console.log("✅ Redis set/get test:", { key: "test:key", value });

		await redis.del("test:key");
		console.log("✅ Redis connection successful!");
	} catch (error) {
		console.error("❌ Redis connection failed:", error);
	} finally {
		redis.disconnect();
	}
}

if (require.main === module) {
	testRedisConnection();
}
