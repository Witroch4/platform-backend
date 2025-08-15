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
  type ClampedButtonData
} from './clamps';

// Intent catalog utilities
export {
  extractIntentSlug,
  checkIntentExists,
  validateIntentPayloads,
  clearIntentCache,
  getIntentCacheStats
} from './intent-catalog';

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
  type WhatsAppTextMessage
} from './whatsapp-formatter';

// Instagram formatter utilities
export {
  buildInstagramButtons,
  buildFacebookTextFallback,
  validateInstagramMessage,
  createInstagramButtonOptions,
  buildSimpleInstagramMessage,
  buildInstagramGenericTemplate,
  type InstagramButtonOptions,
  type InstagramMessage,
  type InstagramButtonTemplate,
  type FacebookTextMessage,
  type InstagramGenericTemplate
} from './instagram-formatter';

// Classification system utilities
export {
  classifyWithEmbeddings,
  routerLLM,
  classifyIntent,
  prewarmEmbeddings,
  clearClassificationCache,
  getClassificationCacheStats,
  type ClassificationResult,
  type RouterDecision,
  type ClassificationConfig,
  type AgentClassificationConfig,
  type IntentCandidate
} from './classification';

// Re-export existing utilities
export * from './assistant';
export * from './intent';
export * from './templates';