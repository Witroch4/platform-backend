/**
 * Credentials Fallback Resolver
 * Implements intelligent credential resolution with loop detection and caching
 * Follows the fallback chain: ChatwitInbox -> fallbackParaInbox -> WhatsAppGlobalConfig -> Environment
 */

import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

export interface WhatsAppCredentials {
	whatsappApiKey: string;
	phoneNumberId: string;
	whatsappBusinessAccountId: string;
	graphApiBaseUrl: string;
	source: "inbox" | "fallback_inbox" | "global_config" | "environment";
	resolvedFromInboxId?: string;
}

export interface CredentialResolutionResult {
	credentials: WhatsAppCredentials | null;
	fallbackChain: string[];
	loopDetected: boolean;
	cacheHit: boolean;
	resolutionTimeMs: number;
}

export class CredentialsFallbackResolver {
	private static readonly MAX_FALLBACK_DEPTH = 5;
	private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
	private static credentialsCache = new Map<
		string,
		{
			credentials: WhatsAppCredentials | null;
			timestamp: number;
			fallbackChain: string[];
		}
	>();

	/**
	 * Resolve credentials for an inbox with comprehensive fallback logic
	 * @param inboxId - The ChatwitInbox ID (internal database ID, not external inboxId)
	 * @param visited - Set of visited inbox IDs for loop detection
	 * @returns Promise<CredentialResolutionResult>
	 */
	static async resolveCredentials(
		inboxId: string,
		visited: Set<string> = new Set(),
	): Promise<CredentialResolutionResult> {
		const startTime = Date.now();
		const fallbackChain: string[] = [];

		console.log(`[CredentialResolver] Starting resolution for inboxId: ${inboxId}`);

		// Check cache first
		const cacheKey = `credentials:${inboxId}`;
		const cached = this.credentialsCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
			console.log(`[CredentialResolver] Cache hit for inboxId: ${inboxId}`);
			return {
				credentials: cached.credentials,
				fallbackChain: cached.fallbackChain,
				loopDetected: false,
				cacheHit: true,
				resolutionTimeMs: Date.now() - startTime,
			};
		}

		try {
			const result = await this.resolveCredentialsRecursive(inboxId, visited, fallbackChain);

			// Cache the result
			this.credentialsCache.set(cacheKey, {
				credentials: result.credentials,
				timestamp: Date.now(),
				fallbackChain: result.fallbackChain,
			});

			return {
				...result,
				cacheHit: false,
				resolutionTimeMs: Date.now() - startTime,
			};
		} catch (error) {
			console.error(`[CredentialResolver] Error resolving credentials for inboxId: ${inboxId}`, error);
			return {
				credentials: null,
				fallbackChain,
				loopDetected: false,
				cacheHit: false,
				resolutionTimeMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Recursive credential resolution with loop detection
	 */
	private static async resolveCredentialsRecursive(
		inboxId: string,
		visited: Set<string>,
		fallbackChain: string[],
	): Promise<Omit<CredentialResolutionResult, "cacheHit" | "resolutionTimeMs">> {
		// Loop detection
		if (visited.has(inboxId)) {
			console.warn(
				`[CredentialResolver] Loop detected in fallback chain: ${Array.from(visited).join(" -> ")} -> ${inboxId}`,
			);
			return {
				credentials: null,
				fallbackChain,
				loopDetected: true,
			};
		}

		// Max depth protection
		if (visited.size >= this.MAX_FALLBACK_DEPTH) {
			console.warn(
				`[CredentialResolver] Max fallback depth (${this.MAX_FALLBACK_DEPTH}) reached for inboxId: ${inboxId}`,
			);
			return {
				credentials: null,
				fallbackChain,
				loopDetected: false,
			};
		}

		visited.add(inboxId);
		fallbackChain.push(inboxId);

		// Fetch the ChatwitInbox with related data
		const chatwitInbox = await prisma.chatwitInbox.findUnique({
			where: { id: inboxId },
			include: {
				fallbackParaInbox: true,
				usuarioChatwit: {
					include: {
						configuracaoGlobalWhatsApp: true,
					},
				},
			},
		});

		if (!chatwitInbox) {
			console.log(`[CredentialResolver] ChatwitInbox not found: ${inboxId}`);
			return {
				credentials: null,
				fallbackChain,
				loopDetected: false,
			};
		}

		console.log(`[CredentialResolver] Processing inbox: ${chatwitInbox.nome} (${inboxId})`);

		// Check if this inbox has its own credentials
		if (this.hasCompleteCredentials(chatwitInbox)) {
			console.log(`[CredentialResolver] Found complete credentials in inbox: ${inboxId}`);
			return {
				credentials: {
					whatsappApiKey: chatwitInbox.whatsappApiKey!,
					phoneNumberId: chatwitInbox.phoneNumberId!,
					whatsappBusinessAccountId: chatwitInbox.whatsappBusinessAccountId!,
					graphApiBaseUrl: "https://graph.facebook.com/v22.0",
					source: "inbox",
					resolvedFromInboxId: inboxId,
				},
				fallbackChain,
				loopDetected: false,
			};
		}

		// Try fallback to another inbox
		if (chatwitInbox.fallbackParaInboxId) {
			console.log(`[CredentialResolver] Following fallback chain: ${inboxId} -> ${chatwitInbox.fallbackParaInboxId}`);
			const fallbackResult = await this.resolveCredentialsRecursive(
				chatwitInbox.fallbackParaInboxId,
				new Set(visited), // Create new Set to avoid modifying the original
				[...fallbackChain], // Create new array to avoid modifying the original
			);

			if (fallbackResult.credentials) {
				return {
					credentials: {
						...fallbackResult.credentials,
						source: "fallback_inbox",
						resolvedFromInboxId: chatwitInbox.fallbackParaInboxId,
					},
					fallbackChain: fallbackResult.fallbackChain,
					loopDetected: fallbackResult.loopDetected,
				};
			}
		}

		// Try WhatsAppGlobalConfig
		if (chatwitInbox.usuarioChatwit?.configuracaoGlobalWhatsApp) {
			const globalConfig = chatwitInbox.usuarioChatwit.configuracaoGlobalWhatsApp;
			console.log(`[CredentialResolver] Using WhatsAppGlobalConfig for user: ${chatwitInbox.usuarioChatwitId}`);

			return {
				credentials: {
					whatsappApiKey: globalConfig.whatsappApiKey,
					phoneNumberId: globalConfig.phoneNumberId,
					whatsappBusinessAccountId: globalConfig.whatsappBusinessAccountId,
					graphApiBaseUrl: globalConfig.graphApiBaseUrl,
					source: "global_config",
				},
				fallbackChain,
				loopDetected: false,
			};
		}

		// Final fallback to environment variables
		console.log(`[CredentialResolver] Using environment variables as final fallback`);
		const envCredentials = this.getEnvironmentCredentials();

		if (envCredentials) {
			return {
				credentials: envCredentials,
				fallbackChain,
				loopDetected: false,
			};
		}

		// No credentials found
		console.log(`[CredentialResolver] No credentials found for inboxId: ${inboxId}`);
		return {
			credentials: null,
			fallbackChain,
			loopDetected: false,
		};
	}

	/**
	 * Check if an inbox has complete credentials
	 */
	private static hasCompleteCredentials(inbox: any): boolean {
		return !!(inbox.whatsappApiKey && inbox.phoneNumberId && inbox.whatsappBusinessAccountId);
	}

	/**
	 * Get credentials from environment variables
	 */
	private static getEnvironmentCredentials(): WhatsAppCredentials | null {
		const whatsappApiKey = process.env.WHATSAPP_TOKEN;
		const phoneNumberId = process.env.FROM_PHONE_NUMBER_ID;
		const whatsappBusinessAccountId = process.env.WHATSAPP_BUSINESS_ID;

		if (whatsappApiKey && phoneNumberId && whatsappBusinessAccountId) {
			return {
				whatsappApiKey,
				phoneNumberId,
				whatsappBusinessAccountId,
				graphApiBaseUrl: "https://graph.facebook.com/v22.0",
				source: "environment",
			};
		}

		return null;
	}

	/**
	 * Resolve credentials by external inbox ID (from webhook payload)
	 * This is the main entry point for webhook processing
	 */
	static async resolveCredentialsByExternalInboxId(externalInboxId: string): Promise<CredentialResolutionResult> {
		console.log(`[CredentialResolver] Resolving credentials for external inboxId: ${externalInboxId}`);

		try {
			// Find the ChatwitInbox by external inboxId
			const chatwitInbox = await prisma.chatwitInbox.findFirst({
				where: { inboxId: externalInboxId },
			});

			if (!chatwitInbox) {
				console.log(`[CredentialResolver] No ChatwitInbox found for external inboxId: ${externalInboxId}`);
				return {
					credentials: null,
					fallbackChain: [],
					loopDetected: false,
					cacheHit: false,
					resolutionTimeMs: 0,
				};
			}

			// Use the internal ID for resolution
			return await this.resolveCredentials(chatwitInbox.id);
		} catch (error) {
			console.error(`[CredentialResolver] Error resolving credentials by external inboxId: ${externalInboxId}`, error);
			return {
				credentials: null,
				fallbackChain: [],
				loopDetected: false,
				cacheHit: false,
				resolutionTimeMs: 0,
			};
		}
	}

	/**
	 * Invalidate cache for a specific inbox
	 */
	static invalidateCache(inboxId: string): void {
		const cacheKey = `credentials:${inboxId}`;
		this.credentialsCache.delete(cacheKey);
		console.log(`[CredentialResolver] Cache invalidated for inboxId: ${inboxId}`);
	}

	/**
	 * Clear all cached credentials
	 */
	static clearCache(): void {
		this.credentialsCache.clear();
		console.log(`[CredentialResolver] All credential cache cleared`);
	}

	/**
	 * Get cache statistics
	 */
	static getCacheStats(): {
		size: number;
		entries: Array<{ inboxId: string; age: number; source: string }>;
	} {
		const now = Date.now();
		const entries = Array.from(this.credentialsCache.entries()).map(([key, value]) => ({
			inboxId: key.replace("credentials:", ""),
			age: now - value.timestamp,
			source: value.credentials?.source || "null",
		}));

		return {
			size: this.credentialsCache.size,
			entries,
		};
	}

	/**
	 * Validate fallback chain configuration for an inbox
	 * Useful for admin interfaces to detect potential issues
	 */
	static async validateFallbackChain(inboxId: string): Promise<{
		isValid: boolean;
		issues: string[];
		chain: string[];
	}> {
		const issues: string[] = [];
		const chain: string[] = [];
		const visited = new Set<string>();

		try {
			await this.validateFallbackChainRecursive(inboxId, visited, chain, issues);
		} catch (error) {
			issues.push(`Error validating fallback chain: ${error instanceof Error ? error.message : "Unknown error"}`);
		}

		return {
			isValid: issues.length === 0,
			issues,
			chain,
		};
	}

	/**
	 * Recursive fallback chain validation
	 */
	private static async validateFallbackChainRecursive(
		inboxId: string,
		visited: Set<string>,
		chain: string[],
		issues: string[],
	): Promise<void> {
		if (visited.has(inboxId)) {
			issues.push(`Loop detected: ${chain.join(" -> ")} -> ${inboxId}`);
			return;
		}

		if (visited.size >= this.MAX_FALLBACK_DEPTH) {
			issues.push(`Max fallback depth exceeded: ${this.MAX_FALLBACK_DEPTH}`);
			return;
		}

		visited.add(inboxId);
		chain.push(inboxId);

		const chatwitInbox = await prisma.chatwitInbox.findUnique({
			where: { id: inboxId },
			include: {
				fallbackParaInbox: true,
				usuarioChatwit: {
					include: {
						configuracaoGlobalWhatsApp: true,
					},
				},
			},
		});

		if (!chatwitInbox) {
			issues.push(`Inbox not found: ${inboxId}`);
			return;
		}

		// Check if this inbox has credentials or valid fallback
		const hasCredentials = this.hasCompleteCredentials(chatwitInbox);
		const hasFallback = !!chatwitInbox.fallbackParaInboxId;
		const hasGlobalConfig = !!chatwitInbox.usuarioChatwit?.configuracaoGlobalWhatsApp;

		if (!hasCredentials && !hasFallback && !hasGlobalConfig) {
			issues.push(`Inbox ${inboxId} has no credentials, fallback, or global config`);
		}

		// Continue validation if there's a fallback
		if (hasFallback && chatwitInbox.fallbackParaInboxId) {
			await this.validateFallbackChainRecursive(chatwitInbox.fallbackParaInboxId, new Set(visited), [...chain], issues);
		}
	}
}
