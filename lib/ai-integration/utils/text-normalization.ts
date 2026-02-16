/**
 * Text normalization utilities
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

/**
 * Remove Zero Width Space and other invisible characters
 * Requirement: 9.1
 */
export function removeInvisibleCharacters(text: string): string {
	if (!text) return "";

	// Remove ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D), BOM (U+FEFF)
	return text.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Collapse multiple whitespace characters into single spaces
 * Requirement: 9.1
 */
export function collapseWhitespace(text: string): string {
	if (!text) return "";

	// Replace multiple whitespace characters (spaces, tabs, newlines) with single space
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Limit consecutive emojis for better UX
 * Requirement: 9.1
 */
export function limitConsecutiveEmojis(text: string, maxConsecutive: number = 3): string {
	if (!text || maxConsecutive <= 0) return text;

	// Basic emoji ranges (not exhaustive but covers most common ones)
	const emojiRanges = [
		"\u{1F600}-\u{1F64F}", // Emoticons
		"\u{1F300}-\u{1F5FF}", // Misc Symbols and Pictographs
		"\u{1F680}-\u{1F6FF}", // Transport and Map
		"\u{1F1E0}-\u{1F1FF}", // Regional indicators (flags)
		"\u{2600}-\u{26FF}", // Misc symbols
		"\u{2700}-\u{27BF}", // Dingbats
		"\u{1F900}-\u{1F9FF}", // Supplemental Symbols and Pictographs
		"\u{1FA70}-\u{1FAFF}", // Symbols and Pictographs Extended-A
	];

	const emojiPattern = `[${emojiRanges.join("")}]`;
	const consecutiveEmojiRegex = new RegExp(`(${emojiPattern}){${maxConsecutive + 1},}`, "gu");

	return text.replace(consecutiveEmojiRegex, (match) => {
		// Keep only the first maxConsecutive emojis
		const emojis = [...match];
		return emojis.slice(0, maxConsecutive).join("");
	});
}

/**
 * Normalize accents by removing diacritical marks
 * Requirement: 9.1
 */
export function normalizeAccents(text: string): string {
	if (!text) return "";

	// Use NFD (Normalization Form Decomposed) to separate base characters from combining marks
	// Then remove the combining marks (diacritical marks)
	return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Apply title case (first letter uppercase, rest lowercase)
 * Requirement: 9.1
 */
export function applyTitleCase(text: string): string {
	if (!text) return "";

	return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Smart text truncation that preserves word boundaries
 * Requirement: 9.1, 9.2, 9.3, 9.4
 */
export function smartTruncate(text: string, maxLength: number, preserveWords: boolean = true): string {
	if (!text || text.length <= maxLength) return text;

	if (!preserveWords) {
		return text.slice(0, maxLength);
	}

	// Find the last space before the limit
	const truncated = text.slice(0, maxLength);
	const lastSpaceIndex = truncated.lastIndexOf(" ");

	// If no space found or it's too close to the beginning (less than 70% of max length),
	// just truncate at the character limit
	if (lastSpaceIndex === -1 || lastSpaceIndex < maxLength * 0.7) {
		return text.slice(0, maxLength);
	}

	return truncated.slice(0, lastSpaceIndex);
}

/**
 * Validate HTTPS URL
 * Requirement: 9.1, 9.4
 */
export function isValidHttpsUrl(url: string): boolean {
	if (!url) return false;

	try {
		const urlObj = new URL(url);
		return urlObj.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Check if URL domain is in allowlist
 * Requirement: 9.1, 9.4
 */
export function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
	if (!url || !allowedDomains || allowedDomains.length === 0) return true;

	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname.toLowerCase();

		return allowedDomains.some((domain) => {
			const normalizedDomain = domain.toLowerCase();
			return hostname === normalizedDomain || hostname.endsWith("." + normalizedDomain);
		});
	} catch {
		return false;
	}
}

/**
 * Complete text normalization pipeline
 * Requirement: 9.1
 */
export function normalizeText(
	text: string,
	options: {
		removeInvisible?: boolean;
		collapseSpaces?: boolean;
		limitEmojis?: number;
		normalizeAccents?: boolean;
		titleCase?: boolean;
	} = {},
): string {
	if (!text) return "";

	let normalized = text;

	if (options.removeInvisible !== false) {
		normalized = removeInvisibleCharacters(normalized);
	}

	if (options.collapseSpaces !== false) {
		normalized = collapseWhitespace(normalized);
	}

	if (options.limitEmojis && options.limitEmojis > 0) {
		normalized = limitConsecutiveEmojis(normalized, options.limitEmojis);
	}

	if (options.normalizeAccents) {
		normalized = normalizeAccents(normalized);
	}

	if (options.titleCase) {
		normalized = applyTitleCase(normalized);
	}

	return normalized;
}

/**
 * Generate unique titles by appending numbers to duplicates
 * Requirement: 9.2, 9.4
 */
export function makeUniqueTitles<T extends { title: string }>(items: T[]): T[] {
	const titleCounts = new Map<string, number>();

	return items.map((item) => {
		const normalizedTitle = item.title.toLowerCase();
		const count = titleCounts.get(normalizedTitle) || 0;
		titleCounts.set(normalizedTitle, count + 1);

		if (count > 0) {
			return {
				...item,
				title: `${item.title} ${count + 1}`,
			};
		}

		return item;
	});
}

/**
 * Remove duplicate titles (case-insensitive)
 * Requirement: 9.2, 9.4
 */
export function removeDuplicateTitles<T extends { title: string }>(items: T[]): T[] {
	const seen = new Set<string>();

	return items.filter((item) => {
		const normalizedTitle = item.title.toLowerCase();
		if (seen.has(normalizedTitle)) {
			return false;
		}
		seen.add(normalizedTitle);
		return true;
	});
}
