/**
 * Centralized text clamping and validation utilities for SocialWise Flow
 * Ensures channel-specific limits are enforced to prevent provider retries
 */

/**
 * Clamps title text to maximum 4 words and 20 characters
 * Used for button titles across all channels
 */
export function clampTitle(text: string, maxChars = 20, maxWords = 4): string {
	if (!text || typeof text !== "string") return "";

	// Clean and normalize whitespace
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return "";

	// Split into words and limit to maxWords
	const words = clean.split(" ").slice(0, maxWords);
	const wordLimited = words.join(" ");

	// If within character limit, return as is
	if (wordLimited.length <= maxChars) {
		return wordLimited;
	}

	// Truncate at character limit, preferring word boundaries
	const truncated = wordLimited.slice(0, maxChars + 1);
	const lastSpace = truncated.lastIndexOf(" ");

	// If we can break at a word boundary, do so
	if (lastSpace > 0 && lastSpace < maxChars) {
		return truncated.slice(0, lastSpace).trim();
	}

	// Otherwise, hard truncate at character limit
	return wordLimited.slice(0, maxChars).trim();
}

/**
 * Clamps body text based on channel type
 * WhatsApp: ≤1024 chars, Instagram: ≤640 chars
 */
export function clampBody(text: string, channelType: "whatsapp" | "instagram" | "facebook"): string {
	if (!text || typeof text !== "string") return "";

	const clean = text.trim();
	if (!clean) return "";

	// Channel-specific limits
	const limits = {
		whatsapp: 1024,
		instagram: 1000,
		facebook: 1000, // Align IG/FB to support Quick Replies text
	};

	const maxChars = limits[channelType] || 1024;

	if (clean.length <= maxChars) {
		return clean;
	}

	// Truncate at character limit, preferring sentence/word boundaries
	const truncated = clean.slice(0, maxChars + 1);

	// Try to break at sentence boundary first
	const lastSentence = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("!"), truncated.lastIndexOf("?"));

	if (lastSentence > maxChars * 0.7) {
		return truncated.slice(0, lastSentence + 1).trim();
	}

	// Fall back to word boundary
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > maxChars * 0.8) {
		return truncated.slice(0, lastSpace).trim();
	}

	// Hard truncate as last resort
	return clean.slice(0, maxChars).trimEnd();
}

/**
 * Validates payload format against required regex pattern
 * Must match ^@[a-z0-9_]+$ for intent payloads
 */
export function validatePayloadFormat(payload: string): boolean {
	if (!payload || typeof payload !== "string") return false;

	const payloadRegex = /^@[a-z0-9_]+$/;
	return payloadRegex.test(payload);
}

/**
 * Clamps payload to channel-specific limits
 * WhatsApp button ID: ≤256 chars, Instagram payload: ≤1000 chars
 */
export function clampPayload(payload: string, channelType: "whatsapp" | "instagram" | "facebook"): string {
	if (!payload || typeof payload !== "string") return "";

	const clean = payload.trim();
	if (!clean) return "";

	// Channel-specific payload limits
	const limits = {
		whatsapp: 256, // WhatsApp button ID limit
		instagram: 1000, // Instagram postback payload limit
		facebook: 1000, // Facebook Messenger payload limit
	};

	const maxChars = limits[channelType] || 256;

	if (clean.length <= maxChars) {
		return clean;
	}

	// Hard truncate for payloads (no word boundary logic needed)
	return clean.slice(0, maxChars);
}

/**
 * Validates and clamps button data for channel-specific requirements
 */
export interface ButtonData {
	title: string;
	payload: string;
}

export interface ClampedButtonData extends ButtonData {
	isValid: boolean;
	originalTitle?: string;
	originalPayload?: string;
}

export function clampButtonData(
	button: ButtonData,
	channelType: "whatsapp" | "instagram" | "facebook",
): ClampedButtonData {
	const originalTitle = button.title;
	const originalPayload = button.payload;

	// Clamp title (same limits for all channels)
	const clampedTitle = clampTitle(button.title);

	// Clamp payload based on channel
	const clampedPayload = clampPayload(button.payload, channelType);

	// Validate payload format
	const isPayloadValid = validatePayloadFormat(clampedPayload);

	// Button is valid if both title and payload are non-empty and payload format is valid
	const isValid = clampedTitle.length > 0 && clampedPayload.length > 0 && isPayloadValid;

	const result: ClampedButtonData = {
		title: clampedTitle,
		payload: clampedPayload,
		isValid,
	};

	// Include original values if they were modified
	if (originalTitle !== clampedTitle) {
		result.originalTitle = originalTitle;
	}

	if (originalPayload !== clampedPayload) {
		result.originalPayload = originalPayload;
	}

	return result;
}

/**
 * Channel-specific limit enforcement to prevent provider retries
 */
export const CHANNEL_LIMITS = {
	whatsapp: {
		buttonTitle: 20,
		buttonId: 256,
		bodyText: 1024,
		maxButtons: 3,
	},
	instagram: {
		buttonTitle: 20,
		payload: 1000,
		bodyText: 1000,
		maxButtons: 13,
	},
	facebook: {
		buttonTitle: 20,
		payload: 1000,
		bodyText: 1000,
		maxButtons: 13,
	},
} as const;

/**
 * Validates that content meets channel-specific limits
 */
export function validateChannelLimits(
	content: {
		title?: string;
		body?: string;
		buttons?: ButtonData[];
	},
	channelType: "whatsapp" | "instagram" | "facebook",
): {
	isValid: boolean;
	violations: string[];
} {
	const violations: string[] = [];
	const limits = CHANNEL_LIMITS[channelType];

	// Check body text limit
	if (content.body && content.body.length > limits.bodyText) {
		violations.push(`Body text exceeds ${limits.bodyText} characters (${content.body.length})`);
	}

	// Check button count
	if (content.buttons && content.buttons.length > limits.maxButtons) {
		violations.push(`Too many buttons: ${content.buttons.length} (max: ${limits.maxButtons})`);
	}

	// Check individual button limits
	if (content.buttons) {
		content.buttons.forEach((button, index) => {
			if (button.title && button.title.length > limits.buttonTitle) {
				violations.push(`Button ${index + 1} title exceeds ${limits.buttonTitle} characters`);
			}

			if (channelType === "whatsapp" && button.payload && button.payload.length > CHANNEL_LIMITS.whatsapp.buttonId) {
				violations.push(`Button ${index + 1} ID exceeds ${CHANNEL_LIMITS.whatsapp.buttonId} characters`);
			}

			if (
				(channelType === "instagram" || channelType === "facebook") &&
				button.payload &&
				button.payload.length > CHANNEL_LIMITS.instagram.payload
			) {
				violations.push(`Button ${index + 1} payload exceeds ${CHANNEL_LIMITS.instagram.payload} characters`);
			}

			if (!validatePayloadFormat(button.payload)) {
				violations.push(`Button ${index + 1} payload format invalid (must match ^@[a-z0-9_]+$)`);
			}
		});
	}

	return {
		isValid: violations.length === 0,
		violations,
	};
}
