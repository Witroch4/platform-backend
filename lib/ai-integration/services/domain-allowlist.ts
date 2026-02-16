/**
 * Domain allowlist management for Instagram web_url buttons
 * Requirements: 9.1, 9.4
 */

import { validateUrl } from "../utils/domain-validation";

export interface DomainAllowlistConfig {
	accountId: number;
	allowedDomains: string[];
	requireHttps: boolean;
	lastUpdated: Date;
	updatedBy?: string;
}

export interface DomainValidationResult {
	isValid: boolean;
	domain: string | null;
	errors: string[];
	warnings: string[];
}

/**
 * Default allowed domains for all accounts
 * These are considered safe and commonly used domains
 */
const DEFAULT_ALLOWED_DOMAINS = [
	// Social platforms
	"instagram.com",
	"facebook.com",
	"twitter.com",
	"linkedin.com",
	"youtube.com",
	"tiktok.com",

	// E-commerce platforms
	"shopify.com",
	"mercadolivre.com.br",
	"mercadolibre.com",
	"amazon.com.br",
	"amazon.com",
	"magazineluiza.com.br",
	"americanas.com.br",
	"submarino.com.br",

	// Payment platforms
	"pagseguro.uol.com.br",
	"mercadopago.com.br",
	"paypal.com",
	"stripe.com",

	// Common business domains
	"google.com",
	"microsoft.com",
	"apple.com",

	// Brazilian domains
	"gov.br",
	"com.br",
	"org.br",
	"net.br",
];

/**
 * In-memory cache for domain allowlists
 * In production, this would be replaced with Redis or database cache
 */
const domainAllowlistCache = new Map<number, DomainAllowlistConfig>();

/**
 * Get domain allowlist for a specific account
 * Requirements: 9.1, 9.4
 */
export async function getDomainAllowlistForAccount(accountId: number): Promise<string[]> {
	// Check cache first
	const cached = domainAllowlistCache.get(accountId);
	if (cached && isConfigValid(cached)) {
		return cached.allowedDomains;
	}

	// TODO: In production, query database for account-specific domains
	// For now, return default domains
	const config: DomainAllowlistConfig = {
		accountId,
		allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
		requireHttps: true,
		lastUpdated: new Date(),
	};

	// Cache the result
	domainAllowlistCache.set(accountId, config);

	return config.allowedDomains;
}

/**
 * Update domain allowlist for a specific account
 * Requirements: 9.1, 9.4
 */
export async function updateDomainAllowlistForAccount(
	accountId: number,
	domains: string[],
	updatedBy?: string,
): Promise<void> {
	// Validate domains before saving
	const validatedDomains = domains.map((domain) => normalizeDomain(domain));
	const invalidDomains = validatedDomains.filter((domain) => !isValidDomain(domain));

	if (invalidDomains.length > 0) {
		throw new Error(`Invalid domains: ${invalidDomains.join(", ")}`);
	}

	const config: DomainAllowlistConfig = {
		accountId,
		allowedDomains: validatedDomains,
		requireHttps: true,
		lastUpdated: new Date(),
		updatedBy,
	};

	// Update cache
	domainAllowlistCache.set(accountId, config);

	// TODO: In production, save to database
	console.log(`Updated domain allowlist for account ${accountId}:`, validatedDomains);
}

/**
 * Add domain to account's allowlist
 * Requirements: 9.1, 9.4
 */
export async function addDomainToAllowlist(accountId: number, domain: string, updatedBy?: string): Promise<void> {
	const currentDomains = await getDomainAllowlistForAccount(accountId);
	const normalizedDomain = normalizeDomain(domain);

	if (!isValidDomain(normalizedDomain)) {
		throw new Error(`Invalid domain: ${domain}`);
	}

	if (!currentDomains.includes(normalizedDomain)) {
		const updatedDomains = [...currentDomains, normalizedDomain];
		await updateDomainAllowlistForAccount(accountId, updatedDomains, updatedBy);
	}
}

/**
 * Remove domain from account's allowlist
 * Requirements: 9.1, 9.4
 */
export async function removeDomainFromAllowlist(accountId: number, domain: string, updatedBy?: string): Promise<void> {
	const currentDomains = await getDomainAllowlistForAccount(accountId);
	const normalizedDomain = normalizeDomain(domain);

	const updatedDomains = currentDomains.filter((d) => d !== normalizedDomain);

	if (updatedDomains.length !== currentDomains.length) {
		await updateDomainAllowlistForAccount(accountId, updatedDomains, updatedBy);
	}
}

/**
 * Validate URL against account's domain allowlist
 * Requirements: 9.1, 9.4
 */
export async function validateUrlForAccount(url: string, accountId: number): Promise<DomainValidationResult> {
	const allowedDomains = await getDomainAllowlistForAccount(accountId);

	const validation = validateUrl(url, {
		allowedDomains,
		requireHttps: true,
	});

	let domain: string | null = null;
	try {
		const urlObj = new URL(url);
		domain = urlObj.hostname;
	} catch {
		// Invalid URL, domain remains null
	}

	return {
		isValid: validation.isValid,
		domain,
		errors: validation.errors,
		warnings: [],
	};
}

/**
 * Batch validate multiple URLs for an account
 * Requirements: 9.1, 9.4
 */
export async function validateUrlsForAccount(
	urls: string[],
	accountId: number,
): Promise<Map<string, DomainValidationResult>> {
	const results = new Map<string, DomainValidationResult>();

	// Get allowlist once for all URLs
	const allowedDomains = await getDomainAllowlistForAccount(accountId);

	for (const url of urls) {
		const validation = validateUrl(url, {
			allowedDomains,
			requireHttps: true,
		});

		let domain: string | null = null;
		try {
			const urlObj = new URL(url);
			domain = urlObj.hostname;
		} catch {
			// Invalid URL, domain remains null
		}

		results.set(url, {
			isValid: validation.isValid,
			domain,
			errors: validation.errors,
			warnings: [],
		});
	}

	return results;
}

/**
 * Get domain allowlist statistics for an account
 * Requirements: 9.1, 9.4
 */
export async function getDomainAllowlistStats(accountId: number): Promise<{
	totalDomains: number;
	customDomains: number;
	defaultDomains: number;
	lastUpdated: Date | null;
	updatedBy: string | null;
}> {
	const config = domainAllowlistCache.get(accountId);
	const allowedDomains = await getDomainAllowlistForAccount(accountId);

	const customDomains = allowedDomains.filter((domain) => !DEFAULT_ALLOWED_DOMAINS.includes(domain));

	return {
		totalDomains: allowedDomains.length,
		customDomains: customDomains.length,
		defaultDomains: allowedDomains.length - customDomains.length,
		lastUpdated: config?.lastUpdated || null,
		updatedBy: config?.updatedBy || null,
	};
}

/**
 * Check if domain is in default allowlist
 * Requirements: 9.1, 9.4
 */
export function isDefaultAllowedDomain(domain: string): boolean {
	const normalized = normalizeDomain(domain);
	return DEFAULT_ALLOWED_DOMAINS.some(
		(allowedDomain) => normalized === allowedDomain || normalized.endsWith("." + allowedDomain),
	);
}

/**
 * Get suggestions for commonly used domains
 * Requirements: 9.1, 9.4
 */
export function getDomainSuggestions(category?: string): string[] {
	const suggestions: Record<string, string[]> = {
		social: ["instagram.com", "facebook.com", "twitter.com", "linkedin.com", "youtube.com", "tiktok.com"],
		ecommerce: ["shopify.com", "mercadolivre.com.br", "amazon.com.br", "magazineluiza.com.br"],
		payment: ["pagseguro.uol.com.br", "mercadopago.com.br", "paypal.com", "stripe.com"],
		business: ["google.com", "microsoft.com", "apple.com"],
	};

	if (category && suggestions[category]) {
		return suggestions[category];
	}

	// Return all suggestions if no category specified
	return Object.values(suggestions).flat();
}

/**
 * Normalize domain name
 */
function normalizeDomain(domain: string): string {
	if (!domain) return "";

	// Remove protocol if present
	let normalized = domain.replace(/^https?:\/\//, "");

	// Remove www. prefix
	normalized = normalized.replace(/^www\./, "");

	// Remove trailing slash and path
	normalized = normalized.split("/")[0];

	// Convert to lowercase
	normalized = normalized.toLowerCase();

	return normalized;
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
	if (!domain) return false;

	// Basic domain validation regex
	const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

	return domainRegex.test(domain) && domain.length <= 253;
}

/**
 * Check if cached config is still valid
 */
function isConfigValid(config: DomainAllowlistConfig): boolean {
	const maxAge = 5 * 60 * 1000; // 5 minutes
	return Date.now() - config.lastUpdated.getTime() < maxAge;
}

/**
 * Clear domain allowlist cache for account
 * Requirements: 9.1, 9.4
 */
export function clearDomainAllowlistCache(accountId?: number): void {
	if (accountId) {
		domainAllowlistCache.delete(accountId);
	} else {
		domainAllowlistCache.clear();
	}
}

/**
 * Export default domains for testing
 */
export { DEFAULT_ALLOWED_DOMAINS };
