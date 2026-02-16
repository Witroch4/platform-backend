/**
 * IORedis Mock for Testing
 */

class MockRedis {
	private data: Map<string, string> = new Map();
	private connected = false;

	constructor(options?: any) {
		// Mock constructor
		this.options = {
			host: options?.host || "localhost",
			port: options?.port || 6379,
			password: options?.password,
			db: options?.db || 0,
			...options,
		};
	}

	options: any;

	// Connection methods
	async connect() {
		this.connected = true;
		return Promise.resolve();
	}

	disconnect() {
		this.connected = false;
	}

	// Basic Redis operations
	async get(key: string): Promise<string | null> {
		return this.data.get(key) || null;
	}

	async set(key: string, value: string, ...args: any[]): Promise<string> {
		this.data.set(key, value);
		return "OK";
	}

	async del(key: string): Promise<number> {
		const existed = this.data.has(key);
		this.data.delete(key);
		return existed ? 1 : 0;
	}

	async exists(key: string): Promise<number> {
		return this.data.has(key) ? 1 : 0;
	}

	async expire(key: string, seconds: number): Promise<number> {
		// Mock expire - just return 1 if key exists
		return this.data.has(key) ? 1 : 0;
	}

	async ttl(key: string): Promise<number> {
		// Mock TTL - return -1 (no expiry) if key exists
		return this.data.has(key) ? -1 : -2;
	}

	// Sorted set operations for DLQ
	async zadd(key: string, score: number, member: string): Promise<number> {
		this.data.set(`${key}:${member}`, JSON.stringify({ score, member }));
		return 1;
	}

	async zrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]> {
		const members: string[] = [];
		for (const [k, v] of this.data.entries()) {
			if (k.startsWith(`${key}:`)) {
				const data = JSON.parse(v);
				members.push(data.member);
			}
		}
		return members.slice(start, stop + 1);
	}

	async zrangebyscore(key: string, min: number, max: number, ...args: any[]): Promise<string[]> {
		const members: string[] = [];
		for (const [k, v] of this.data.entries()) {
			if (k.startsWith(`${key}:`)) {
				const data = JSON.parse(v);
				if (data.score >= min && data.score <= max) {
					members.push(data.member);
				}
			}
		}
		return members;
	}

	async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
		return this.zrange(key, start, stop).then((result) => result.reverse());
	}

	async zrem(key: string, member: string): Promise<number> {
		const existed = this.data.has(`${key}:${member}`);
		this.data.delete(`${key}:${member}`);
		return existed ? 1 : 0;
	}

	async zcard(key: string): Promise<number> {
		let count = 0;
		for (const k of this.data.keys()) {
			if (k.startsWith(`${key}:`)) {
				count++;
			}
		}
		return count;
	}

	async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
		// Mock implementation
		return 0;
	}

	async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
		let removed = 0;
		const toRemove: string[] = [];

		for (const [k, v] of this.data.entries()) {
			if (k.startsWith(`${key}:`)) {
				const data = JSON.parse(v);
				if (data.score >= min && data.score <= max) {
					toRemove.push(k);
					removed++;
				}
			}
		}

		toRemove.forEach((k) => this.data.delete(k));
		return removed;
	}

	// Event emitter methods
	on(event: string, callback: Function) {
		// Mock event listener
		if (event === "connect") {
			setTimeout(() => callback(), 10);
		}
		return this;
	}

	off(event: string, callback?: Function) {
		return this;
	}

	// Status methods
	get status() {
		return this.connected ? "ready" : "connecting";
	}

	// Ping
	async ping(): Promise<string> {
		return "PONG";
	}
}

export default MockRedis;
