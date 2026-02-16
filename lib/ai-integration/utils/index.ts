// AI Integration utilities
// These will be implemented in subsequent tasks

export * from "./logger";
export * from "./log-aggregation";
export * from "./pii-redaction";
export * from "./metrics";
export * from "./metrics-middleware";
export * from "./slo-measurement";
export * from "./synthetic-probes";
export * from "./payload-sampling";
export * from "./queue-lag-monitor";
// Export text normalization functions explicitly to avoid conflicts
export {
	collapseWhitespace,
	normalizeAccents,
	applyTitleCase,
	smartTruncate,
	isValidHttpsUrl,
	isDomainAllowed,
	normalizeText,
	makeUniqueTitles,
	removeDuplicateTitles,
	// Prefix text normalization versions to avoid conflicts
	removeInvisibleCharacters as removeInvisibleCharsBasic,
	limitConsecutiveEmojis as limitConsecutiveEmojisBasic,
} from "./text-normalization";

export * from "./domain-validation";
export * from "./content-validation";
export * from "./button-deduplication";
export * from "./locale-normalization";

// Export emoji normalization functions explicitly
export {
	EMOJI_CATEGORIES,
	normalizeWhitespace,
	countEmojis,
	extractEmojis,
	removeEmojis,
	replaceEmojisWithText,
	validateEmojiUsage,
	normalizeForChannelUX,
	getEmojiStats,
	suggestEmojiReplacements,
	// Use advanced versions as default
	removeInvisibleCharacters,
	limitConsecutiveEmojis,
} from "./emoji-normalization";
// export * from './hmac-validator';
// export * from './rate-limiter';
// export * from './idempotency';
// export * from './tracing';
