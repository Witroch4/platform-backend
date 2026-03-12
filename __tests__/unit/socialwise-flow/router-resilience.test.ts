import type { AssistantConfig } from "@/lib/socialwise-flow/processor-components/assistant-config";

const redisStore = new Map<string, string>();

jest.mock("@/lib/connections", () => ({
	getRedisInstance: () => ({
		get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
		set: jest.fn(async (key: string, value: string) => {
			redisStore.set(key, value);
			return "OK";
		}),
		setex: jest.fn(async (key: string, _ttl: number, value: string) => {
			redisStore.set(key, value);
			return "OK";
		}),
		del: jest.fn(async (key: string) => {
			redisStore.delete(key);
			return 1;
		}),
	}),
}));

describe("router resilience helpers", () => {
	beforeEach(() => {
		redisStore.clear();
		jest.resetModules();
	});

	it("caches assistant configuration for 48h and invalidates by version bump", async () => {
		const { getAssistantConfigurationCache, invalidateAssistantConfigurationCache, setAssistantConfigurationCache } =
			await import("@/lib/socialwise-flow/processor-components/assistant-config-cache");

		const sampleConfig: AssistantConfig = {
			assistantId: "asst-1",
			model: "gpt-5-mini",
			provider: "OPENAI",
			fallbackProvider: "GEMINI",
			fallbackModel: "gemini-2.0-flash",
			instructions: "teste",
			developer: "teste",
			embedipreview: false,
			reasoningEffort: "medium",
			verbosity: "low",
			temperature: 0.2,
			topP: 0.9,
			tempSchema: 0.1,
			tempCopy: 0.2,
			maxOutputTokens: 256,
			warmupDeadlineMs: 1000,
			hardDeadlineMs: 15000,
			softDeadlineMs: 30000,
			shortTitleLLM: true,
			toolChoice: "auto",
			proposeHumanHandoff: true,
			disableIntentSuggestion: false,
			inheritFromAgent: true,
			sessionTtlSeconds: 86400,
			sessionTtlDevSeconds: 300,
		};

		await setAssistantConfigurationCache("inbox:1", sampleConfig);
		expect(await getAssistantConfigurationCache("inbox:1")).toMatchObject({
			model: "gpt-5-mini",
			fallbackModel: "gemini-2.0-flash",
		});

		await invalidateAssistantConfigurationCache("unit_test");
		expect(await getAssistantConfigurationCache("inbox:1")).toBeNull();
	});

	it("activates router contingency after 3 deadlines in a short window", async () => {
		const { getRouterContingencyState, recordRouterDeadline, ROUTER_DEADLINE_THRESHOLD } = await import(
			"@/lib/socialwise-flow/processor-components/router-contingency"
		);

		for (let index = 1; index < ROUTER_DEADLINE_THRESHOLD; index++) {
			const result = await recordRouterDeadline("inbox-1", "assistant-1", true);
			expect(result.contingencyActivated).toBe(false);
			expect(result.count).toBe(index);
		}

		const activationResult = await recordRouterDeadline("inbox-1", "assistant-1", true);
		expect(activationResult.contingencyActivated).toBe(true);
		expect(activationResult.count).toBe(ROUTER_DEADLINE_THRESHOLD);

		const state = await getRouterContingencyState("inbox-1", "assistant-1");
		expect(state.active).toBe(true);
		expect(typeof state.expiresAt).toBe("number");
	});

	it("does not activate contingency without a configured fallback model", async () => {
		const { getRouterContingencyState, recordRouterDeadline, ROUTER_DEADLINE_THRESHOLD } = await import(
			"@/lib/socialwise-flow/processor-components/router-contingency"
		);

		for (let index = 0; index < ROUTER_DEADLINE_THRESHOLD; index++) {
			const result = await recordRouterDeadline("inbox-2", "assistant-2", false);
			expect(result.contingencyActivated).toBe(false);
		}

		const state = await getRouterContingencyState("inbox-2", "assistant-2");
		expect(state.active).toBe(false);
	});
});
