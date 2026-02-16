/**
 * Safety and Prompt-Injection Guards
 * Implements requirements 12.2, 3.4
 */

interface SafetyCheckResult {
	safe: boolean;
	violations: string[];
	sanitizedContent?: string;
}

interface ContentPolicyConfig {
	allowedDomains: string[];
	prohibitedTerms: string[];
	maxExternalLinks: number;
	enablePiiDetection: boolean;
}

export class SafetyGuards {
	private config: ContentPolicyConfig;

	constructor(config?: Partial<ContentPolicyConfig>) {
		this.config = {
			allowedDomains: config?.allowedDomains || [],
			prohibitedTerms: config?.prohibitedTerms || [
				"senha",
				"password",
				"cartão",
				"card",
				"token",
				"api_key",
				"secret",
				"private",
				"confidencial",
			],
			maxExternalLinks: config?.maxExternalLinks || 1,
			enablePiiDetection: config?.enablePiiDetection ?? true,
		};
	}

	/**
	 * Validate LLM response for safety violations
	 */
	validateResponse(content: string, buttons?: Array<{ title: string; id: string; url?: string }>): SafetyCheckResult {
		const violations: string[] = [];
		let sanitizedContent = content;

		// Check for prohibited terms
		const prohibitedCheck = this.checkProhibitedTerms(content);
		if (!prohibitedCheck.safe) {
			violations.push(...prohibitedCheck.violations);
		}

		// Check for external URLs
		const urlCheck = this.checkExternalUrls(content, buttons);
		if (!urlCheck.safe) {
			violations.push(...urlCheck.violations);
			sanitizedContent = urlCheck.sanitizedContent || content;
		}

		// Check for markdown/formatting
		const markdownCheck = this.checkMarkdownFormatting(sanitizedContent);
		if (!markdownCheck.safe) {
			violations.push(...markdownCheck.violations);
			sanitizedContent = markdownCheck.sanitizedContent || sanitizedContent;
		}

		// Check for PII
		if (this.config.enablePiiDetection) {
			const piiCheck = this.checkPiiExposure(sanitizedContent);
			if (!piiCheck.safe) {
				violations.push(...piiCheck.violations);
				sanitizedContent = piiCheck.sanitizedContent || sanitizedContent;
			}
		}

		// Check for commitment/promise language
		const commitmentCheck = this.checkCommitmentLanguage(sanitizedContent);
		if (!commitmentCheck.safe) {
			violations.push(...commitmentCheck.violations);
		}

		return {
			safe: violations.length === 0,
			violations,
			sanitizedContent: violations.length > 0 ? sanitizedContent : undefined,
		};
	}

	/**
	 * Check for prohibited terms
	 */
	private checkProhibitedTerms(content: string): SafetyCheckResult {
		const violations: string[] = [];
		const lowerContent = content.toLowerCase();

		for (const term of this.config.prohibitedTerms) {
			if (lowerContent.includes(term.toLowerCase())) {
				violations.push(`Prohibited term detected: ${term}`);
			}
		}

		return { safe: violations.length === 0, violations };
	}

	/**
	 * Check for external URLs and validate against allowlist
	 */
	private checkExternalUrls(
		content: string,
		buttons?: Array<{ title: string; id: string; url?: string }>,
	): SafetyCheckResult {
		const violations: string[] = [];
		let sanitizedContent = content;

		// URL regex pattern
		const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
		const urls = content.match(urlRegex) || [];

		// Check button URLs
		const buttonUrls = buttons?.filter((btn) => btn.url).map((btn) => btn.url!) || [];
		const allUrls = [...urls, ...buttonUrls];

		let externalUrlCount = 0;

		for (const url of allUrls) {
			const domain = this.extractDomain(url);

			if (domain && !this.isDomainAllowed(domain)) {
				externalUrlCount++;
				violations.push(`External URL not in allowlist: ${domain}`);

				// Remove unauthorized URLs from content
				sanitizedContent = sanitizedContent.replace(url, "[link removido]");
			}
		}

		if (externalUrlCount > this.config.maxExternalLinks) {
			violations.push(`Too many external links: ${externalUrlCount} (max: ${this.config.maxExternalLinks})`);
		}

		return {
			safe: violations.length === 0,
			violations,
			sanitizedContent: violations.length > 0 ? sanitizedContent : undefined,
		};
	}

	/**
	 * Check for markdown formatting
	 */
	private checkMarkdownFormatting(content: string): SafetyCheckResult {
		const violations: string[] = [];
		let sanitizedContent = content;

		// Common markdown patterns
		const markdownPatterns = [
			{ pattern: /\*\*(.*?)\*\*/g, replacement: "$1", name: "bold" },
			{ pattern: /\*(.*?)\*/g, replacement: "$1", name: "italic" },
			{ pattern: /`(.*?)`/g, replacement: "$1", name: "code" },
			{ pattern: /#{1,6}\s/g, replacement: "", name: "headers" },
			{ pattern: /\[(.*?)\]\((.*?)\)/g, replacement: "$1", name: "links" },
			{ pattern: /^\s*[-*+]\s/gm, replacement: "", name: "lists" },
			{ pattern: /^\s*\d+\.\s/gm, replacement: "", name: "numbered lists" },
		];

		let hasMarkdown = false;

		for (const { pattern, replacement, name } of markdownPatterns) {
			if (pattern.test(content)) {
				hasMarkdown = true;
				violations.push(`Markdown formatting detected: ${name}`);
				sanitizedContent = sanitizedContent.replace(pattern, replacement);
			}
		}

		return {
			safe: !hasMarkdown,
			violations,
			sanitizedContent: hasMarkdown ? sanitizedContent : undefined,
		};
	}

	/**
	 * Check for PII exposure
	 */
	private checkPiiExposure(content: string): SafetyCheckResult {
		const violations: string[] = [];
		let sanitizedContent = content;

		// PII patterns
		const piiPatterns = [
			{
				pattern: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g,
				replacement: "[CPF]",
				name: "CPF",
			},
			{
				pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
				replacement: "[CARTÃO]",
				name: "Credit Card",
			},
			{
				pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
				replacement: "[EMAIL]",
				name: "Email",
			},
			{
				pattern: /(?:\+55\s?)?(?:\(?[1-9]{2}\)?\s?)?9?[0-9]{4}[-\s]?[0-9]{4}/g,
				replacement: "[TELEFONE]",
				name: "Phone",
			},
		];

		for (const { pattern, replacement, name } of piiPatterns) {
			if (pattern.test(content)) {
				violations.push(`PII detected: ${name}`);
				sanitizedContent = sanitizedContent.replace(pattern, replacement);
			}
		}

		return {
			safe: violations.length === 0,
			violations,
			sanitizedContent: violations.length > 0 ? sanitizedContent : undefined,
		};
	}

	/**
	 * Check for commitment/promise language
	 */
	private checkCommitmentLanguage(content: string): SafetyCheckResult {
		const violations: string[] = [];
		const lowerContent = content.toLowerCase();

		const commitmentPhrases = [
			"garantimos que",
			"prometo que",
			"vou resolver",
			"será resolvido",
			"garantia de",
			"comprometo-me",
			"asseguro que",
			"certamente será",
			"definitivamente",
			"com certeza será",
		];

		for (const phrase of commitmentPhrases) {
			if (lowerContent.includes(phrase)) {
				violations.push(`Commitment language detected: "${phrase}"`);
			}
		}

		return { safe: violations.length === 0, violations };
	}

	/**
	 * Extract domain from URL
	 */
	private extractDomain(url: string): string | null {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname.toLowerCase();
		} catch {
			return null;
		}
	}

	/**
	 * Check if domain is in allowlist
	 */
	private isDomainAllowed(domain: string): boolean {
		if (this.config.allowedDomains.length === 0) {
			return true; // If no allowlist configured, allow all
		}

		return this.config.allowedDomains.some(
			(allowed) => domain === allowed.toLowerCase() || domain.endsWith(`.${allowed.toLowerCase()}`),
		);
	}

	/**
	 * Validate system prompt for injection attempts
	 */
	validateSystemPrompt(prompt: string): SafetyCheckResult {
		const violations: string[] = [];

		// Check for prompt injection patterns
		const injectionPatterns = [
			/ignore\s+(?:previous|above|all)\s+(?:instructions?|prompts?|rules?)/i,
			/forget\s+(?:everything|all|previous)/i,
			/new\s+(?:instructions?|task|role|system)/i,
			/you\s+are\s+now\s+(?:a|an)/i,
			/act\s+as\s+(?:a|an)/i,
			/pretend\s+(?:to\s+be|you\s+are)/i,
			/roleplay\s+as/i,
			/simulate\s+(?:a|an)/i,
			/override\s+(?:previous|system|default)/i,
			/disregard\s+(?:previous|above|system)/i,
		];

		for (const pattern of injectionPatterns) {
			if (pattern.test(prompt)) {
				violations.push(`Potential prompt injection detected: ${pattern.source}`);
			}
		}

		return { safe: violations.length === 0, violations };
	}

	/**
	 * Validate user input for injection attempts
	 */
	validateUserInput(input: string): SafetyCheckResult {
		const violations: string[] = [];

		// Check for system-like commands
		const systemCommands = [
			/\/system\s/i,
			/\/assistant\s/i,
			/\/user\s/i,
			/\/prompt\s/i,
			/\/instruction\s/i,
			/<\|system\|>/i,
			/<\|assistant\|>/i,
			/<\|user\|>/i,
		];

		for (const pattern of systemCommands) {
			if (pattern.test(input)) {
				violations.push(`System command detected: ${pattern.source}`);
			}
		}

		// Check for excessive length (potential DoS)
		if (input.length > 10000) {
			violations.push(`Input too long: ${input.length} characters (max: 10000)`);
		}

		return { safe: violations.length === 0, violations };
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ContentPolicyConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): ContentPolicyConfig {
		return { ...this.config };
	}
}

/**
 * Factory function to create safety guards with default config
 */
export function createSafetyGuards(config?: Partial<ContentPolicyConfig>): SafetyGuards {
	const defaultConfig: Partial<ContentPolicyConfig> = {
		allowedDomains: process.env.ALLOWED_DOMAINS?.split(",") || [],
		prohibitedTerms: process.env.PROHIBITED_TERMS?.split(",") || undefined,
		maxExternalLinks: parseInt(process.env.MAX_EXTERNAL_LINKS || "1"),
		enablePiiDetection: process.env.ENABLE_PII_DETECTION !== "false",
	};

	return new SafetyGuards({ ...defaultConfig, ...config });
}
