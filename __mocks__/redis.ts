// __mocks__/redis.ts
// Simple Redis client mock for Jest
const mockRedisClient = {
	connect: jest.fn().mockResolvedValue(undefined),
	disconnect: jest.fn().mockResolvedValue(undefined),
	ping: jest.fn().mockResolvedValue("PONG"),
	keys: jest.fn().mockResolvedValue([]),
	on: jest.fn(),
	get: jest.fn().mockResolvedValue(null),
	set: jest.fn().mockResolvedValue("OK"),
};

export function createClient(_: any) {
	return mockRedisClient;
}

export default { createClient };
