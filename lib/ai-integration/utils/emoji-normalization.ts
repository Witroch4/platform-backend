/**
 * Advanced emoji and whitespace normalization utilities
 * Requirements: 9.1
 */

/**
 * Comprehensive emoji ranges for better detection
 */
const EMOJI_RANGES = [
	// Basic Emoticons
	{ start: 0x1f600, end: 0x1f64f, name: "Emoticons" },
	// Miscellaneous Symbols and Pictographs
	{ start: 0x1f300, end: 0x1f5ff, name: "Misc Symbols and Pictographs" },
	// Transport and Map Symbols
	{ start: 0x1f680, end: 0x1f6ff, name: "Transport and Map" },
	// Regional Indicator Symbols (Flags)
	{ start: 0x1f1e0, end: 0x1f1ff, name: "Regional Indicators" },
	// Supplemental Symbols and Pictographs
	{ start: 0x1f900, end: 0x1f9ff, name: "Supplemental Symbols" },
	// Symbols and Pictographs Extended-A
	{ start: 0x1fa70, end: 0x1faff, name: "Extended Symbols A" },
	// Miscellaneous Symbols
	{ start: 0x2600, end: 0x26ff, name: "Misc Symbols" },
	// Dingbats
	{ start: 0x2700, end: 0x27bf, name: "Dingbats" },
	// Enclosed Alphanumeric Supplement
	{ start: 0x1f100, end: 0x1f1ff, name: "Enclosed Alphanumeric" },
	// Geometric Shapes Extended
	{ start: 0x1f780, end: 0x1f7ff, name: "Geometric Shapes Extended" },
];

/**
 * Common emoji categories for WhatsApp/Instagram UX
 */
export const EMOJI_CATEGORIES = {
	faces: [
		"😀",
		"😃",
		"😄",
		"😁",
		"😆",
		"😅",
		"😂",
		"🤣",
		"😊",
		"😇",
		"🙂",
		"🙃",
		"😉",
		"😌",
		"😍",
		"🥰",
		"😘",
		"😗",
		"😙",
		"😚",
		"😋",
		"😛",
		"😝",
		"😜",
		"🤪",
		"🤨",
		"🧐",
		"🤓",
		"😎",
		"🤩",
		"🥳",
	],
	gestures: [
		"👍",
		"👎",
		"👌",
		"🤌",
		"🤏",
		"✌️",
		"🤞",
		"🤟",
		"🤘",
		"🤙",
		"👈",
		"👉",
		"👆",
		"🖕",
		"👇",
		"☝️",
		"👏",
		"🙌",
		"👐",
		"🤲",
		"🤝",
		"🙏",
	],
	hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝"],
	activities: [
		"⚽",
		"🏀",
		"🏈",
		"⚾",
		"🥎",
		"🎾",
		"🏐",
		"🏉",
		"🥏",
		"🎱",
		"🪀",
		"🏓",
		"🏸",
		"🏒",
		"🏑",
		"🥍",
		"🏏",
		"🪃",
		"🥅",
		"⛳",
	],
	food: [
		"🍎",
		"🍊",
		"🍋",
		"🍌",
		"🍉",
		"🍇",
		"🍓",
		"🫐",
		"🍈",
		"🍒",
		"🍑",
		"🥭",
		"🍍",
		"🥥",
		"🥝",
		"🍅",
		"🍆",
		"🥑",
		"🥦",
		"🥬",
	],
	travel: [
		"🚗",
		"🚕",
		"🚙",
		"🚌",
		"🚎",
		"🏎️",
		"🚓",
		"🚑",
		"🚒",
		"🚐",
		"🛻",
		"🚚",
		"🚛",
		"🚜",
		"🏍️",
		"🛵",
		"🚲",
		"🛴",
		"🛹",
		"🛼",
	],
};

/**
 * Zero-width and invisible characters to remove
 */
const INVISIBLE_CHARS = [
	"\u200B", // Zero Width Space
	"\u200C", // Zero Width Non-Joiner
	"\u200D", // Zero Width Joiner
	"\u2060", // Word Joiner
	"\uFEFF", // Byte Order Mark
	"\u00AD", // Soft Hyphen
	"\u034F", // Combining Grapheme Joiner
	"\u061C", // Arabic Letter Mark
	"\u180E", // Mongolian Vowel Separator
	"\u2000", // En Quad
	"\u2001", // Em Quad
	"\u2002", // En Space
	"\u2003", // Em Space
	"\u2004", // Three-Per-Em Space
	"\u2005", // Four-Per-Em Space
	"\u2006", // Six-Per-Em Space
	"\u2007", // Figure Space
	"\u2008", // Punctuation Space
	"\u2009", // Thin Space
	"\u200A", // Hair Space
	"\u202F", // Narrow No-Break Space
	"\u205F", // Medium Mathematical Space
	"\u3000", // Ideographic Space
];

/**
 * Create regex pattern for emoji detection
 */
function createEmojiRegex(): RegExp {
	const ranges = EMOJI_RANGES.map(
		(range) => `\\u{${range.start.toString(16).toUpperCase()}}-\\u{${range.end.toString(16).toUpperCase()}}`,
	).join("");

	return new RegExp(`[${ranges}]`, "gu");
}

/**
 * Remove all invisible characters from text
 * Requirements: 9.1
 */
export function removeInvisibleCharacters(text: string): string {
	if (!text) return "";

	let cleaned = text;

	// Remove specific invisible characters
	INVISIBLE_CHARS.forEach((char) => {
		cleaned = cleaned.replace(new RegExp(char, "g"), "");
	});

	// Remove other control characters (except common ones like \n, \t)
	cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");

	return cleaned;
}

/**
 * Normalize whitespace characters
 * Requirements: 9.1
 */
export function normalizeWhitespace(
	text: string,
	options: {
		collapseSpaces?: boolean;
		trimEnds?: boolean;
		preserveLineBreaks?: boolean;
		maxConsecutiveSpaces?: number;
	} = {},
): string {
	if (!text) return "";

	const { collapseSpaces = true, trimEnds = true, preserveLineBreaks = false, maxConsecutiveSpaces = 1 } = options;

	let normalized = text;

	// Replace various whitespace characters with regular spaces
	normalized = normalized.replace(/[\t\f\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ");

	if (collapseSpaces) {
		if (preserveLineBreaks) {
			// Collapse spaces but preserve line breaks
			normalized = normalized.replace(/[^\S\n]+/g, " ");
			// Limit consecutive spaces
			if (maxConsecutiveSpaces > 0) {
				const spacePattern = new RegExp(` {${maxConsecutiveSpaces + 1},}`, "g");
				normalized = normalized.replace(spacePattern, " ".repeat(maxConsecutiveSpaces));
			}
		} else {
			// Collapse all whitespace including line breaks
			normalized = normalized.replace(/\s+/g, " ");
		}
	}

	if (trimEnds) {
		normalized = normalized.trim();
	}

	return normalized;
}

/**
 * Count emojis in text
 * Requirements: 9.1
 */
export function countEmojis(text: string): number {
	if (!text) return 0;

	const emojiRegex = createEmojiRegex();
	const matches = text.match(emojiRegex);
	return matches ? matches.length : 0;
}

/**
 * Extract all emojis from text
 * Requirements: 9.1
 */
export function extractEmojis(text: string): string[] {
	if (!text) return [];

	const emojiRegex = createEmojiRegex();
	const matches = text.match(emojiRegex);
	return matches || [];
}

/**
 * Limit consecutive emojis in text
 * Requirements: 9.1
 */
export function limitConsecutiveEmojis(text: string, maxConsecutive: number = 3): string {
	if (!text || maxConsecutive <= 0) return text;

	const emojiRegex = createEmojiRegex();

	// Find sequences of consecutive emojis
	return text.replace(new RegExp(`(${emojiRegex.source})+`, "gu"), (match) => {
		const emojis = [...match];
		if (emojis.length > maxConsecutive) {
			return emojis.slice(0, maxConsecutive).join("");
		}
		return match;
	});
}

/**
 * Remove all emojis from text
 * Requirements: 9.1
 */
export function removeEmojis(text: string): string {
	if (!text) return "";

	const emojiRegex = createEmojiRegex();
	return text.replace(emojiRegex, "");
}

/**
 * Replace emojis with text descriptions
 * Requirements: 9.1
 */
export function replaceEmojisWithText(text: string): string {
	if (!text) return "";

	const emojiToText: Record<string, string> = {
		"😀": "[sorrindo]",
		"😃": "[sorrindo]",
		"😄": "[sorrindo]",
		"😁": "[sorrindo]",
		"😆": "[rindo]",
		"😅": "[rindo]",
		"😂": "[rindo muito]",
		"🤣": "[rindo muito]",
		"😊": "[feliz]",
		"😍": "[apaixonado]",
		"🥰": "[apaixonado]",
		"😘": "[beijinho]",
		"😎": "[legal]",
		"🤩": "[impressionado]",
		"😢": "[triste]",
		"😭": "[chorando]",
		"😡": "[bravo]",
		"🤬": "[muito bravo]",
		"😱": "[assustado]",
		"🤔": "[pensando]",
		"🙄": "[revirando os olhos]",
		"👍": "[joinha]",
		"👎": "[não gostei]",
		"👌": "[ok]",
		"✌️": "[paz]",
		"🤞": "[dedos cruzados]",
		"👏": "[palmas]",
		"🙌": "[celebrando]",
		"🙏": "[obrigado]",
		"❤️": "[coração]",
		"💔": "[coração partido]",
		"💕": "[amor]",
		"🔥": "[fogo]",
		"⭐": "[estrela]",
		"✨": "[brilhando]",
		"💯": "[cem por cento]",
	};

	let result = text;
	Object.entries(emojiToText).forEach(([emoji, description]) => {
		result = result.replace(new RegExp(emoji, "g"), description);
	});

	// Replace remaining emojis with generic placeholder
	const emojiRegex = createEmojiRegex();
	result = result.replace(emojiRegex, "[emoji]");

	return result;
}

/**
 * Validate emoji usage for WhatsApp/Instagram UX
 * Requirements: 9.1
 */
export function validateEmojiUsage(
	text: string,
	options: {
		maxTotal?: number;
		maxConsecutive?: number;
		allowedCategories?: string[];
		channel?: "whatsapp" | "instagram";
	} = {},
): {
	isValid: boolean;
	issues: string[];
	suggestions: string[];
	emojiCount: number;
} {
	const { maxTotal = 10, maxConsecutive = 3, allowedCategories = [], channel = "whatsapp" } = options;

	const issues: string[] = [];
	const suggestions: string[] = [];

	const emojiCount = countEmojis(text);
	const emojis = extractEmojis(text);

	// Check total emoji count
	if (emojiCount > maxTotal) {
		issues.push(`Too many emojis: ${emojiCount} (max ${maxTotal})`);
		suggestions.push(`Reduce emoji count to ${maxTotal} or fewer`);
	}

	// Check consecutive emojis
	const emojiRegex = createEmojiRegex();
	const consecutiveMatches = text.match(new RegExp(`(${emojiRegex.source}){${maxConsecutive + 1},}`, "gu"));
	if (consecutiveMatches) {
		issues.push(`Too many consecutive emojis (max ${maxConsecutive})`);
		suggestions.push(`Limit consecutive emojis to ${maxConsecutive}`);
	}

	// Check category restrictions
	if (allowedCategories.length > 0) {
		const allowedEmojis = allowedCategories.flatMap(
			(cat) => EMOJI_CATEGORIES[cat as keyof typeof EMOJI_CATEGORIES] || [],
		);
		const disallowedEmojis = emojis.filter((emoji) => !allowedEmojis.includes(emoji));

		if (disallowedEmojis.length > 0) {
			issues.push(`Disallowed emojis found: ${disallowedEmojis.join(", ")}`);
			suggestions.push(`Use only emojis from allowed categories: ${allowedCategories.join(", ")}`);
		}
	}

	// Channel-specific recommendations
	if (channel === "whatsapp") {
		if (emojiCount > 5) {
			suggestions.push("Consider reducing emojis for better WhatsApp readability");
		}
	} else if (channel === "instagram") {
		if (emojiCount > 8) {
			suggestions.push("Consider reducing emojis for better Instagram readability");
		}
	}

	return {
		isValid: issues.length === 0,
		issues,
		suggestions,
		emojiCount,
	};
}

/**
 * Normalize text for WhatsApp/Instagram UX
 * Requirements: 9.1
 */
export function normalizeForChannelUX(
	text: string,
	channel: "whatsapp" | "instagram" = "whatsapp",
): {
	normalized: string;
	changes: string[];
} {
	if (!text) return { normalized: "", changes: [] };

	const changes: string[] = [];
	let normalized = text;

	// Remove invisible characters
	const withoutInvisible = removeInvisibleCharacters(normalized);
	if (withoutInvisible !== normalized) {
		changes.push("Removed invisible characters");
		normalized = withoutInvisible;
	}

	// Normalize whitespace
	const withNormalizedSpaces = normalizeWhitespace(normalized, {
		collapseSpaces: true,
		trimEnds: true,
		preserveLineBreaks: true,
		maxConsecutiveSpaces: 2,
	});
	if (withNormalizedSpaces !== normalized) {
		changes.push("Normalized whitespace");
		normalized = withNormalizedSpaces;
	}

	// Limit consecutive emojis
	const maxEmojis = channel === "whatsapp" ? 3 : 4;
	const withLimitedEmojis = limitConsecutiveEmojis(normalized, maxEmojis);
	if (withLimitedEmojis !== normalized) {
		changes.push(`Limited consecutive emojis to ${maxEmojis}`);
		normalized = withLimitedEmojis;
	}

	// Validate emoji usage
	const emojiValidation = validateEmojiUsage(normalized, {
		maxTotal: channel === "whatsapp" ? 8 : 12,
		maxConsecutive: maxEmojis,
		channel,
	});

	if (!emojiValidation.isValid) {
		changes.push(...emojiValidation.suggestions);
	}

	return { normalized, changes };
}

/**
 * Get emoji statistics for text
 * Requirements: 9.1
 */
export function getEmojiStats(text: string): {
	totalEmojis: number;
	uniqueEmojis: number;
	emojiDensity: number;
	maxConsecutive: number;
	categories: Record<string, number>;
	emojis: string[];
} {
	if (!text) {
		return {
			totalEmojis: 0,
			uniqueEmojis: 0,
			emojiDensity: 0,
			maxConsecutive: 0,
			categories: {},
			emojis: [],
		};
	}

	const emojis = extractEmojis(text);
	const uniqueEmojis = [...new Set(emojis)];
	const textLength = text.length;
	const emojiDensity = textLength > 0 ? (emojis.length / textLength) * 100 : 0;

	// Calculate max consecutive emojis
	const emojiRegex = createEmojiRegex();
	const consecutiveMatches = text.match(new RegExp(`(${emojiRegex.source})+`, "gu")) || [];
	const maxConsecutive = Math.max(0, ...consecutiveMatches.map((match) => [...match].length));

	// Categorize emojis
	const categories: Record<string, number> = {};
	Object.entries(EMOJI_CATEGORIES).forEach(([category, categoryEmojis]) => {
		const count = emojis.filter((emoji) => categoryEmojis.includes(emoji)).length;
		if (count > 0) {
			categories[category] = count;
		}
	});

	return {
		totalEmojis: emojis.length,
		uniqueEmojis: uniqueEmojis.length,
		emojiDensity: Math.round(emojiDensity * 100) / 100,
		maxConsecutive,
		categories,
		emojis: uniqueEmojis,
	};
}

/**
 * Suggest emoji replacements for better UX
 * Requirements: 9.1
 */
export function suggestEmojiReplacements(
	text: string,
	channel: "whatsapp" | "instagram" = "whatsapp",
): {
	suggestions: Array<{
		original: string;
		replacement: string;
		reason: string;
	}>;
	optimizedText: string;
} {
	const suggestions: Array<{
		original: string;
		replacement: string;
		reason: string;
	}> = [];

	let optimizedText = text;

	// Replace less common emojis with more universally supported ones
	const replacements: Record<string, { replacement: string; reason: string }> = {
		"🤪": { replacement: "😜", reason: "Better cross-platform support" },
		"🥳": { replacement: "🎉", reason: "More universally recognized" },
		"🤩": { replacement: "😍", reason: "Better cross-platform support" },
		"🥺": { replacement: "😢", reason: "More universally supported" },
		"🤬": { replacement: "😡", reason: "More appropriate for business" },
		"💀": { replacement: "😵", reason: "More appropriate tone" },
	};

	Object.entries(replacements).forEach(([original, { replacement, reason }]) => {
		if (text.includes(original)) {
			suggestions.push({ original, replacement, reason });
			optimizedText = optimizedText.replace(new RegExp(original, "g"), replacement);
		}
	});

	return { suggestions, optimizedText };
}
