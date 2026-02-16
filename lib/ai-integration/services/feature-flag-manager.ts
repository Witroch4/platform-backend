/**
 * Feature Flag Manager
 * Integrates feature flags with AI processing pipeline
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { FeatureFlagService } from "./feature-flag-service";
import { FeatureFlagContext, AI_FEATURE_FLAGS, AIFeatureFlag } from "../types/feature-flags";
import { FeatureFlagConfig } from "../types/job-data";
import log from "@/lib/log";

export class FeatureFlagManager {
	private flagService: FeatureFlagService;

	constructor(redis: Redis) {
		this.flagService = new FeatureFlagService(redis);
	}

	/**
	 * Get feature flag configuration for AI processing
	 */
	async getAIFeatureFlags(context: FeatureFlagContext): Promise<FeatureFlagConfig> {
		try {
			const [intentsEnabled, dynamicLlmEnabled, interactiveMessagesEnabled, economicModeEnabled, budgetControlEnabled] =
				await Promise.all([
					this.flagService.isEnabled(AI_FEATURE_FLAGS.INTENTS_ENABLED, context),
					this.flagService.isEnabled(AI_FEATURE_FLAGS.DYNAMIC_LLM_ENABLED, context),
					this.flagService.isEnabled(AI_FEATURE_FLAGS.INTERACTIVE_MESSAGES_ENABLED, context),
					this.flagService.isEnabled(AI_FEATURE_FLAGS.ECONOMIC_MODE_ENABLED, context),
					this.flagService.isEnabled(AI_FEATURE_FLAGS.BUDGET_CONTROL_ENABLED, context),
				]);

			return {
				intentsEnabled,
				dynamicLlmEnabled,
				interactiveMessagesEnabled,
				economicModeEnabled,
				budgetControlEnabled,
			};
		} catch (error) {
			log.error("Error getting AI feature flags", { context, error });

			// Return safe defaults
			return {
				intentsEnabled: false,
				dynamicLlmEnabled: false,
				interactiveMessagesEnabled: false,
				economicModeEnabled: false,
				budgetControlEnabled: false,
			};
		}
	}

	/**
	 * Check if a specific AI feature is enabled
	 */
	async isAIFeatureEnabled(feature: AIFeatureFlag, context: FeatureFlagContext): Promise<boolean> {
		return this.flagService.isEnabled(feature, context);
	}

	/**
	 * Create feature flag context from job data
	 */
	createContextFromJobData(params: {
		accountId: number;
		inboxId?: number;
		conversationId?: number;
		channel?: "whatsapp" | "instagram" | "messenger";
	}): FeatureFlagContext {
		return {
			accountId: params.accountId,
			inboxId: params.inboxId,
			conversationId: params.conversationId,
			channel: params.channel,
		};
	}

	/**
	 * Enable feature flag for account (admin operation)
	 */
	async enableForAccount(flagId: string, accountId: number, reason: string, userId: string): Promise<void> {
		await this.flagService.override({
			flagId,
			accountId,
			enabled: true,
			reason,
			createdBy: userId,
		});

		log.info("Feature flag enabled for account", { flagId, accountId, reason, userId });
	}

	/**
	 * Disable feature flag for account (admin operation)
	 */
	async disableForAccount(flagId: string, accountId: number, reason: string, userId: string): Promise<void> {
		await this.flagService.override({
			flagId,
			accountId,
			enabled: false,
			reason,
			createdBy: userId,
		});

		log.info("Feature flag disabled for account", { flagId, accountId, reason, userId });
	}

	/**
	 * Enable feature flag for inbox (admin operation)
	 */
	async enableForInbox(
		flagId: string,
		accountId: number,
		inboxId: number,
		reason: string,
		userId: string,
	): Promise<void> {
		await this.flagService.override({
			flagId,
			accountId,
			inboxId,
			enabled: true,
			reason,
			createdBy: userId,
		});

		log.info("Feature flag enabled for inbox", { flagId, accountId, inboxId, reason, userId });
	}

	/**
	 * Disable feature flag for inbox (admin operation)
	 */
	async disableForInbox(
		flagId: string,
		accountId: number,
		inboxId: number,
		reason: string,
		userId: string,
	): Promise<void> {
		await this.flagService.override({
			flagId,
			accountId,
			inboxId,
			enabled: false,
			reason,
			createdBy: userId,
		});

		log.info("Feature flag disabled for inbox", { flagId, accountId, inboxId, reason, userId });
	}

	/**
	 * Remove override (revert to default behavior)
	 */
	async removeOverride(flagId: string, accountId?: number, inboxId?: number): Promise<void> {
		await this.flagService.removeOverride(flagId, accountId, inboxId);

		log.info("Feature flag override removed", { flagId, accountId, inboxId });
	}

	/**
	 * Get feature flag metrics for monitoring
	 */
	async getMetrics(flagId: string) {
		return this.flagService.getMetrics(flagId);
	}

	/**
	 * Perform gradual rollout (increase percentage)
	 */
	async performGradualRollout(
		flagId: string,
		targetPercentage: number,
		incrementPercentage: number = 5,
	): Promise<void> {
		const flag = await this.flagService.getFlag(flagId);
		if (!flag) {
			throw new Error(`Flag ${flagId} not found`);
		}

		const currentPercentage = flag.rolloutPercentage;
		const newPercentage = Math.min(targetPercentage, currentPercentage + incrementPercentage);

		await this.flagService.updateFlag(flagId, {
			rolloutPercentage: newPercentage,
		});

		log.info("Gradual rollout performed", {
			flagId,
			currentPercentage,
			newPercentage,
			targetPercentage,
		});

		// Check error rate and rollback if needed
		const metrics = await this.getMetrics(flagId);
		const errorRate = metrics.evaluations > 0 ? metrics.errorCount / metrics.evaluations : 0;

		if (errorRate > 0.01) {
			// 1% error rate threshold
			await this.flagService.updateFlag(flagId, {
				rolloutPercentage: currentPercentage,
			});

			log.warn("Rollback performed due to high error rate", {
				flagId,
				errorRate,
				rolledBackTo: currentPercentage,
			});
		}
	}

	/**
	 * Emergency kill switch - disable flag immediately
	 */
	async emergencyDisable(flagId: string, reason: string, userId: string): Promise<void> {
		await this.flagService.updateFlag(flagId, {
			enabled: false,
			updatedBy: userId,
		});

		// Also create a global override to ensure it's disabled
		await this.flagService.override({
			flagId,
			enabled: false,
			reason: `EMERGENCY: ${reason}`,
			createdBy: userId,
		});

		log.warn("Emergency kill switch activated", { flagId, reason, userId });
	}

	/**
	 * Get all AI feature flags status for an account
	 */
	async getAccountFeatureFlagStatus(accountId: number, inboxId?: number): Promise<Record<string, boolean>> {
		const context = this.createContextFromJobData({ accountId, inboxId });

		const results: Record<string, boolean> = {};

		for (const [key, flagId] of Object.entries(AI_FEATURE_FLAGS)) {
			try {
				results[key] = await this.flagService.isEnabled(flagId, context);
			} catch (error) {
				log.error("Error checking feature flag", { flagId, accountId, inboxId, error });
				results[key] = false;
			}
		}

		return results;
	}

	/**
	 * Validate feature flag configuration
	 */
	validateFeatureFlagConfig(config: FeatureFlagConfig): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// Business logic validation
		if (config.economicModeEnabled && !config.budgetControlEnabled) {
			errors.push("Economic mode requires budget control to be enabled");
		}

		if (config.interactiveMessagesEnabled && !config.dynamicLlmEnabled) {
			errors.push("Interactive messages require dynamic LLM to be enabled");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}
