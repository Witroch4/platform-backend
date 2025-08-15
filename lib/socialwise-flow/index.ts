/**
 * SocialWise Flow - UX Writing and Contextual Button Generation
 * Main exports for the SocialWise Flow optimization system
 */

// Core UX Writing Service
export { UXWritingService, createUXWritingService } from "./ux-writing-service";

// Legal domain prompts and analysis
export {
  LEGAL_TERMS,
  LEGAL_ACTIONS,
  PROMPT_TEMPLATES,
  analyzeLegalContext,
  generateLegalContextPrompt,
  buildWarmupButtonsPrompt,
  buildShortTitlesPrompt,
  buildDomainTopicsPrompt,
  getHumanizedTitle,
  FALLBACK_TITLES,
} from "./ux-writing";

// Text clamping and validation utilities
export {
  clampTitle,
  clampBody,
  validatePayload,
  sanitizePayload,
  validateIntentExists,
  validateButton,
  clampButton,
  CHANNEL_LIMITS,
} from "./clamps";

// Channel-specific formatting
export {
  buildWhatsAppButtons,
  buildInstagramButtons,
  buildChannelResponse,
  buildDefaultLegalTopics,
  buildFallbackResponse,
  logChannelResponse,
  type ButtonOption,
  type ChannelResponse,
} from "./channel-formatting";

// Re-export types from OpenAI service for convenience
export type {
  IntentCandidate,
  WarmupButtonsResponse,
  RouterDecision,
  AgentConfig,
} from "@/services/openai";
