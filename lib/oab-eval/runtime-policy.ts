import { getConfigValue } from "@/lib/config";
import type { LeadOperationStage } from "./operation-types";

export type OabRuntimeProvider = "OPENAI" | "GEMINI" | "CLAUDE";

export interface OabRuntimePolicy {
	maxOutputTokens: number;
	timeoutMs: number;
	retryAttempts: number;
	retryBaseDelayMs: number;
	retryMaxDelayMs: number;
}

type RuntimeOverrideInput = Partial<{
	maxOutputTokens: number | null;
	timeoutMs: number | null;
	retryAttempts: number | null;
	retryBaseDelayMs: number | null;
	retryMaxDelayMs: number | null;
}>;

const BOOTSTRAP_RUNTIME_DEFAULTS: Record<LeadOperationStage, OabRuntimePolicy> = {
	transcription: {
		maxOutputTokens: 17_000,
		timeoutMs: 120_000,
		retryAttempts: 3,
		retryBaseDelayMs: 2_000,
		retryMaxDelayMs: 10_000,
	},
	mirror: {
		maxOutputTokens: 12_000,
		timeoutMs: 180_000,
		retryAttempts: 3,
		retryBaseDelayMs: 2_000,
		retryMaxDelayMs: 10_000,
	},
	analysis: {
		maxOutputTokens: 16_000,
		timeoutMs: 240_000,
		retryAttempts: 3,
		retryBaseDelayMs: 2_000,
		retryMaxDelayMs: 10_000,
	},
};

function getRuntimeConfigPath(stage: LeadOperationStage, field: string): string {
	return `oab_eval.runtime_defaults.${stage}.${field}`;
}

function resolveRuntimeNumber(
	overrideValue: number | null | undefined,
	configValue: number | undefined,
	fallbackValue: number,
): number {
	if (typeof overrideValue === "number" && Number.isFinite(overrideValue) && overrideValue > 0) {
		return overrideValue;
	}

	if (typeof configValue === "number" && Number.isFinite(configValue) && configValue > 0) {
		return configValue;
	}

	return fallbackValue;
}

export function getBlueprintProviderRuntimeOverrides(
	metadata: unknown,
	provider: OabRuntimeProvider,
): RuntimeOverrideInput {
	if (!metadata || typeof metadata !== "object") {
		return {};
	}

	const providerCache = (metadata as Record<string, unknown>).providerCache;
	if (!providerCache || typeof providerCache !== "object") {
		return {};
	}

	const entry = (providerCache as Record<string, unknown>)[provider];
	if (!entry || typeof entry !== "object") {
		return {};
	}

	return entry as RuntimeOverrideInput;
}

export function resolveOabRuntimePolicy(input: {
	stage: LeadOperationStage;
	provider: OabRuntimeProvider;
	metadata?: unknown;
	explicitMaxOutputTokens?: number | null;
}): OabRuntimePolicy {
	const defaults = BOOTSTRAP_RUNTIME_DEFAULTS[input.stage];
	const providerOverrides = getBlueprintProviderRuntimeOverrides(input.metadata, input.provider);

	const configMaxOutputTokens = getConfigValue<number | undefined>(
		getRuntimeConfigPath(input.stage, "max_output_tokens"),
		undefined,
	);
	const configTimeoutMs = getConfigValue<number | undefined>(getRuntimeConfigPath(input.stage, "timeout_ms"), undefined);
	const configRetryAttempts = getConfigValue<number | undefined>(
		getRuntimeConfigPath(input.stage, "retry_attempts"),
		undefined,
	);
	const configRetryBaseDelayMs = getConfigValue<number | undefined>(
		getRuntimeConfigPath(input.stage, "retry_base_delay_ms"),
		undefined,
	);
	const configRetryMaxDelayMs = getConfigValue<number | undefined>(
		getRuntimeConfigPath(input.stage, "retry_max_delay_ms"),
		undefined,
	);

	return {
		maxOutputTokens: resolveRuntimeNumber(
			providerOverrides.maxOutputTokens ?? input.explicitMaxOutputTokens,
			configMaxOutputTokens,
			defaults.maxOutputTokens,
		),
		timeoutMs: resolveRuntimeNumber(providerOverrides.timeoutMs, configTimeoutMs, defaults.timeoutMs),
		retryAttempts: Math.max(
			1,
			resolveRuntimeNumber(providerOverrides.retryAttempts, configRetryAttempts, defaults.retryAttempts),
		),
		retryBaseDelayMs: Math.max(
			250,
			resolveRuntimeNumber(providerOverrides.retryBaseDelayMs, configRetryBaseDelayMs, defaults.retryBaseDelayMs),
		),
		retryMaxDelayMs: Math.max(
			500,
			resolveRuntimeNumber(providerOverrides.retryMaxDelayMs, configRetryMaxDelayMs, defaults.retryMaxDelayMs),
		),
	};
}
