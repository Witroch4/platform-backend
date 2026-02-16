/**
 * SocialWise Flow utilities
 * Centralized exports for all SocialWise optimization components
 */

// Clamps and validation utilities
export {
	clampTitle,
	clampBody,
	validatePayloadFormat,
	clampPayload,
	clampButtonData,
	validateChannelLimits,
	CHANNEL_LIMITS,
	type ButtonData,
	type ClampedButtonData,
} from "./clamps";

// Intent catalog utilities
export {
	extractIntentSlug,
	checkIntentExists,
	validateIntentPayloads,
	clearIntentCache,
	getIntentCacheStats,
} from "./intent-catalog";

// WhatsApp formatter utilities
export {
	buildButtons as buildWhatsAppButtons,
	buildNumberedTextFallback as buildWhatsAppTextFallback,
	validateWhatsAppMessage,
	createButtonOptions as createWhatsAppButtonOptions,
	buildSimpleInteractiveMessage as buildSimpleWhatsAppMessage,
	type WhatsAppButtonOptions,
	type WhatsAppMessage,
	type WhatsAppInteractiveMessage,
	type WhatsAppTextMessage,
} from "./whatsapp-formatter";

// Instagram formatter utilities
export {
	buildInstagramButtons,
	buildInstagramTextFallback,
	validateInstagramMessage,
	createInstagramButtonOptions,
	buildSimpleInstagramMessage,
	type InstagramButtonOptions,
	type InstagramMessage,
	type InstagramTextMessage,
} from "./instagram-formatter";

// Import InstagramButtonTemplate from types
export type { InstagramButtonTemplate } from "../../types/interactive-messages";

// Classification system utilities
export {
	classifyIntent,
	classifyIntentEmbeddingFirst,
	classifyIntentRouterLLM,
	type ClassificationResult,
	type EmbeddingSearchResult,
} from "../socialwise-flow/classification";

// Re-export IntentCandidate from the correct location
export type { IntentCandidate, AgentConfig } from "@/services/openai";

// Re-export existing utilities
export * from "./assistant";
export * from "./intent";
export * from "./templates";
