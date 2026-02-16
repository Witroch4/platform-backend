/**
 * SocialWise Flow Assistant Configuration Loading
 * Handles loading and merging assistant and inbox configurations with inheritance support
 */

import { createLogger } from "@/lib/utils/logger";
import { getPrismaInstance } from "@/lib/connections";
import { getAssistantForInbox } from "@/lib/socialwise/assistant";

const configLogger = createLogger("SocialWise-Processor-AssistantConfig");

export interface AssistantConfig {
	model: string;
	instructions: string;
	developer: string;
	embedipreview: boolean;
	reasoningEffort: any;
	verbosity: any;
	temperature: number;
	topP?: number | null;
	tempSchema: any;
	tempCopy: any;
	maxOutputTokens: number;
	warmupDeadlineMs: number;
	hardDeadlineMs: number;
	softDeadlineMs: number;
	shortTitleLLM: boolean;
	toolChoice: any;
	proposeHumanHandoff: boolean;
	disableIntentSuggestion: boolean;
	inheritFromAgent: boolean;
	// Session TTL configuration
	sessionTtlSeconds: number;
	sessionTtlDevSeconds: number;
}

/**
 * Load full assistant configuration including SocialWise Flow deadlines
 * Supports inbox-level inheritance from agent configurations
 */
export async function loadAssistantConfiguration(
	inboxId: string,
	chatwitAccountId?: string,
	assistantId?: string,
): Promise<AssistantConfig | null> {
	try {
		const prisma = getPrismaInstance();

		// Get assistant configuration with full details
		let assistant;
		if (assistantId) {
			// Para playground: usar assistantId diretamente
			assistant = await prisma.aiAssistant.findFirst({
				where: {
					id: assistantId,
					isActive: true,
				},
				select: { id: true },
			});
		} else {
			// Para produção: usar getAssistantForInbox
			assistant = await getAssistantForInbox(inboxId, chatwitAccountId);
		}

		if (!assistant) {
			configLogger.warn("No assistant found", { inboxId, assistantId });
			return null;
		}

		// Get full assistant configuration from database
		const fullAssistant = await prisma.aiAssistant.findFirst({
			where: {
				id: assistantId || assistant.id,
				isActive: true,
			},
			select: {
				id: true,
				model: true,
				instructions: true,
				reasoningEffort: true,
				verbosity: true,
				temperature: true,
				topP: true,
				tempSchema: true,
				tempCopy: true,
				maxOutputTokens: true,
				warmupDeadlineMs: true,
				hardDeadlineMs: true,
				softDeadlineMs: true,
				shortTitleLLM: true,
				toolChoice: true,
				embedipreview: true,
				proposeHumanHandoff: true,
				disableIntentSuggestion: true,
				sessionTtlSeconds: true,
				sessionTtlDevSeconds: true,
			},
		});

		if (!fullAssistant) {
			configLogger.warn("Full assistant configuration not found", { assistantId: assistant.id });
			return null;
		}

		// Get inbox configuration to check inheritance settings
		const inbox = await (prisma as any).chatwitInbox.findFirst({
			where: { inboxId },
			select: {
				socialwiseInheritFromAgent: true,
				socialwiseReasoningEffort: true,
				socialwiseVerbosity: true,
				socialwiseTemperature: true,
				socialwiseTempSchema: true,
				socialwiseWarmupDeadlineMs: true,
				socialwiseHardDeadlineMs: true,
				socialwiseSoftDeadlineMs: true,
				socialwiseShortTitleLLM: true,
				socialwiseToolChoice: true,
			},
		});

		// Determine final configuration based on inheritance
		const inheritFromAgent = inbox?.socialwiseInheritFromAgent ?? true;

		const finalConfig: AssistantConfig = {
			model: fullAssistant.model,
			instructions: fullAssistant.instructions || "",
			developer: fullAssistant.instructions || "",
			embedipreview: fullAssistant.embedipreview,

			// Use inbox config if not inheriting, otherwise use assistant config
			reasoningEffort: inheritFromAgent
				? fullAssistant.reasoningEffort
				: inbox?.socialwiseReasoningEffort || fullAssistant.reasoningEffort,

			verbosity: inheritFromAgent ? fullAssistant.verbosity : inbox?.socialwiseVerbosity || fullAssistant.verbosity,

			temperature: inheritFromAgent
				? fullAssistant.temperature
				: inbox?.socialwiseTemperature || fullAssistant.temperature,

			topP: fullAssistant.topP,

			tempSchema: inheritFromAgent ? fullAssistant.tempSchema : inbox?.socialwiseTempSchema || fullAssistant.tempSchema,

			tempCopy: fullAssistant.tempCopy,

			maxOutputTokens: fullAssistant.maxOutputTokens,

			// 🔧 CORREÇÃO: Usar configurações de deadline do assistente/inbox
			warmupDeadlineMs: inheritFromAgent
				? fullAssistant.warmupDeadlineMs
				: inbox?.socialwiseWarmupDeadlineMs || fullAssistant.warmupDeadlineMs,

			hardDeadlineMs: inheritFromAgent
				? fullAssistant.hardDeadlineMs
				: inbox?.socialwiseHardDeadlineMs || fullAssistant.hardDeadlineMs,

			softDeadlineMs: inheritFromAgent
				? fullAssistant.softDeadlineMs
				: inbox?.socialwiseSoftDeadlineMs || fullAssistant.softDeadlineMs,

			shortTitleLLM: inheritFromAgent
				? fullAssistant.shortTitleLLM
				: (inbox?.socialwiseShortTitleLLM ?? fullAssistant.shortTitleLLM),

			toolChoice: inheritFromAgent ? fullAssistant.toolChoice : inbox?.socialwiseToolChoice || fullAssistant.toolChoice,

			// New fields for human handoff and intent suggestion control
			proposeHumanHandoff: fullAssistant.proposeHumanHandoff ?? true,
			disableIntentSuggestion: fullAssistant.disableIntentSuggestion ?? false,

			// Session TTL configuration (per agent)
			sessionTtlSeconds: fullAssistant.sessionTtlSeconds ?? 86400, // 24h default
			sessionTtlDevSeconds: fullAssistant.sessionTtlDevSeconds ?? 300, // 5min default

			inheritFromAgent,
		};

		configLogger.info("Assistant configuration loaded", {
			inboxId,
			assistantId: fullAssistant.id,
			inheritFromAgent,
			warmupDeadlineMs: finalConfig.warmupDeadlineMs,
			hardDeadlineMs: finalConfig.hardDeadlineMs,
			softDeadlineMs: finalConfig.softDeadlineMs,
			model: finalConfig.model,
			reasoningEffort: finalConfig.reasoningEffort,
			verbosity: finalConfig.verbosity,
		});

		return finalConfig;
	} catch (error) {
		configLogger.error("Failed to load assistant configuration", {
			error: error instanceof Error ? error.message : String(error),
			inboxId,
		});
		return null;
	}
}
