/**
 * Secure Cache Key Namespacing System for SocialWise Flow
 * 
 * Implements secure cache key generation with HMAC-SHA256 for user text
 * and proper namespacing to prevent collisions and ensure security.
 * 
 * Key Format: sw:{env}:acc{id}:inb{id}:agt{id}:ms:{model}:pv{version}:chan:{type}:ep:{bool}
 */

import { createHmac } from 'crypto';

// Environment detection
function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}

// Cache key configuration
export interface CacheKeyConfig {
  accountId: string;
  inboxId: string;
  agentId: string;
  model: string;
  promptVersion: string;
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  embedipreview: boolean;
}

// Cache key types for different operations
export type CacheKeyType = 
  | 'classify'     // Classification results
  | 'warmup'       // Warmup buttons
  | 'stitle'       // Short titles
  | 'confirm'      // Microcopy confirmation
  | 'emb'          // Embeddings
  | 'idem'         // Idempotency
  | 'nonce'        // Anti-replay nonces
  | 'rate'         // Rate limiting
  | 'health';      // Health checks

// TTL constants (in seconds)
export const CACHE_TTL = {
  CLASSIFY: 10 * 60,        // 10 minutes
  WARMUP: 12 * 60,          // 12 minutes (10-15m range)
  STITLE: 30 * 24 * 60 * 60, // 30 days
  CONFIRM: 20 * 60,         // 20 minutes (15-30m range)
  EMBEDDING: 24 * 60 * 60,  // 24 hours
  IDEMPOTENCY: 24 * 60 * 60, // 24 hours
  NONCE: 5 * 60,            // 5 minutes
  RATE_LIMIT: 60 * 60,      // 1 hour
  HEALTH: 5 * 60,           // 5 minutes
} as const;

/**
 * Secure cache key builder with HMAC-SHA256 for user text
 */
export class SocialWiseCacheKeyBuilder {
  private readonly hmacSecret: string;
  private readonly keyPrefix: string;

  constructor() {
    // Use environment-specific HMAC secret
    this.hmacSecret = process.env.SOCIALWISE_CACHE_HMAC_SECRET || 
      process.env.NEXTAUTH_SECRET || 
      'fallback-secret-for-development-only';
    
    // Skip validation during build process or when NEXTAUTH_SECRET is available
    const isBuildProcess = process.env.NEXT_PHASE === 'phase-production-build' || 
                           process.env.CI === 'true' ||
                           !process.env.DATABASE_URL;
    
    if (this.hmacSecret === 'fallback-secret-for-development-only' && 
        getEnvironment() === 'production' && 
        !isBuildProcess) {
      throw new Error('SOCIALWISE_CACHE_HMAC_SECRET must be set in production');
    }

    // Environment-specific prefix
    this.keyPrefix = `sw:${getEnvironment()}`;
  }

  /**
   * Generate secure hash for user text (never store PII in cache keys)
   */
  private hashUserText(text: string): string {
    if (!text || typeof text !== 'string') {
      throw new Error('User text must be a non-empty string');
    }

    // Normalize text before hashing (lowercase, trim, normalize spaces)
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Create HMAC-SHA256 hash
    const hmac = createHmac('sha256', this.hmacSecret);
    hmac.update(normalizedText, 'utf8');
    
    // Return first 16 characters of hex digest for reasonable key length
    return hmac.digest('hex').substring(0, 16);
  }

  /**
   * Build namespace prefix for cache keys
   */
  private buildNamespace(config: CacheKeyConfig): string {
    // Validate required fields
    if (!config.accountId || !config.inboxId || !config.agentId) {
      throw new Error('accountId, inboxId, and agentId are required');
    }

    if (!config.model || !config.promptVersion || !config.channelType) {
      throw new Error('model, promptVersion, and channelType are required');
    }

    // Build namespace: sw:{env}:acc{id}:inb{id}:agt{id}:ms:{model}:pv{version}:chan:{type}:ep:{bool}
    return [
      this.keyPrefix,
      `acc${config.accountId}`,
      `inb${config.inboxId}`,
      `agt${config.agentId}`,
      `ms:${config.model}`,
      `pv${config.promptVersion}`,
      `chan:${config.channelType}`,
      `ep:${config.embedipreview ? 'true' : 'false'}`
    ].join(':');
  }

  /**
   * Generate classification cache key
   * Format: {namespace}:classify:{H(text)}
   */
  buildClassificationKey(config: CacheKeyConfig, userText: string): string {
    const namespace = this.buildNamespace(config);
    const textHash = this.hashUserText(userText);
    return `${namespace}:classify:${textHash}`;
  }

  /**
   * Generate warmup buttons cache key
   * Format: {namespace}:warmup:{H(text+candidates)}
   */
  buildWarmupKey(
    config: CacheKeyConfig, 
    userText: string, 
    candidates: Array<{ slug: string; desc?: string }>
  ): string {
    const namespace = this.buildNamespace(config);
    
    // Create combined text for hashing (user text + candidate slugs)
    const candidateText = candidates
      .map(c => c.slug)
      .sort() // Sort for consistent hashing
      .join('|');
    const combinedText = `${userText}|${candidateText}`;
    
    const textHash = this.hashUserText(combinedText);
    return `${namespace}:warmup:${textHash}`;
  }

  /**
   * Generate short title cache key
   * Format: {namespace}:stitle:{slug}
   */
  buildShortTitleKey(config: CacheKeyConfig, intentSlug: string): string {
    if (!intentSlug || typeof intentSlug !== 'string') {
      throw new Error('Intent slug must be a non-empty string');
    }

    const namespace = this.buildNamespace(config);
    // Intent slugs are not PII, so no hashing needed
    const cleanSlug = intentSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `${namespace}:stitle:${cleanSlug}`;
  }

  /**
   * Generate microcopy confirmation cache key
   * Format: {namespace}:confirm:{H(text+intent)}
   */
  buildConfirmationKey(
    config: CacheKeyConfig, 
    userText: string, 
    intentSlug: string
  ): string {
    const namespace = this.buildNamespace(config);
    
    // Combine user text with intent for hashing
    const combinedText = `${userText}|${intentSlug}`;
    const textHash = this.hashUserText(combinedText);
    
    return `${namespace}:confirm:${textHash}`;
  }

  /**
   * Generate embedding cache key
   * Format: {namespace}:emb:{H(text)}
   */
  buildEmbeddingKey(config: CacheKeyConfig, text: string): string {
    const namespace = this.buildNamespace(config);
    const textHash = this.hashUserText(text);
    return `${namespace}:emb:${textHash}`;
  }

  /**
   * Generate idempotency cache key (WAMID-based)
   * Format: {namespace}:idem:{wamid}
   */
  buildIdempotencyKey(config: CacheKeyConfig, wamid: string): string {
    if (!wamid || typeof wamid !== 'string') {
      throw new Error('WAMID must be a non-empty string');
    }

    const namespace = this.buildNamespace(config);
    // WAMIDs are not PII and are already unique identifiers
    const cleanWamid = wamid.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${namespace}:idem:${cleanWamid}`;
  }

  /**
   * Generate nonce-based anti-replay cache key
   * Format: {namespace}:nonce:{nonce}
   */
  buildNonceKey(config: CacheKeyConfig, nonce: string): string {
    if (!nonce || typeof nonce !== 'string') {
      throw new Error('Nonce must be a non-empty string');
    }

    const namespace = this.buildNamespace(config);
    // Nonces are not PII and should be unique
    const cleanNonce = nonce.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${namespace}:nonce:${cleanNonce}`;
  }

  /**
   * Generate rate limiting cache key
   * Format: {namespace}:rate:{identifier}
   */
  buildRateLimitKey(config: CacheKeyConfig, identifier: string): string {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Rate limit identifier must be a non-empty string');
    }

    const namespace = this.buildNamespace(config);
    // Hash identifier to avoid storing potential PII
    const identifierHash = this.hashUserText(identifier);
    return `${namespace}:rate:${identifierHash}`;
  }

  /**
   * Generate health check cache key
   * Format: {namespace}:health:{component}
   */
  buildHealthKey(config: CacheKeyConfig, component: string): string {
    if (!component || typeof component !== 'string') {
      throw new Error('Health component must be a non-empty string');
    }

    const namespace = this.buildNamespace(config);
    const cleanComponent = component.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `${namespace}:health:${cleanComponent}`;
  }

  /**
   * Parse cache key to extract components (for debugging/monitoring)
   */
  parseKey(cacheKey: string): {
    environment: string;
    accountId: string;
    inboxId: string;
    agentId: string;
    model: string;
    promptVersion: string;
    channelType: string;
    embedipreview: boolean;
    keyType: string;
    identifier: string;
  } | null {
    try {
      const parts = cacheKey.split(':');
      
      if (parts.length < 9 || parts[0] !== 'sw') {
        return null;
      }

      return {
        environment: parts[1],
        accountId: parts[2].replace('acc', ''),
        inboxId: parts[3].replace('inb', ''),
        agentId: parts[4].replace('agt', ''),
        model: parts[5].replace('ms:', ''),
        promptVersion: parts[6].replace('pv', ''),
        channelType: parts[7].replace('chan:', '') as any,
        embedipreview: parts[8].replace('ep:', '') === 'true',
        keyType: parts[9] || '',
        identifier: parts.slice(10).join(':') || '',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate cache key format
   */
  validateKey(cacheKey: string): boolean {
    const parsed = this.parseKey(cacheKey);
    return parsed !== null;
  }

  /**
   * Get TTL for cache key type
   */
  getTTL(keyType: CacheKeyType): number {
    switch (keyType) {
      case 'classify': return CACHE_TTL.CLASSIFY;
      case 'warmup': return CACHE_TTL.WARMUP;
      case 'stitle': return CACHE_TTL.STITLE;
      case 'confirm': return CACHE_TTL.CONFIRM;
      case 'emb': return CACHE_TTL.EMBEDDING;
      case 'idem': return CACHE_TTL.IDEMPOTENCY;
      case 'nonce': return CACHE_TTL.NONCE;
      case 'rate': return CACHE_TTL.RATE_LIMIT;
      case 'health': return CACHE_TTL.HEALTH;
      default:
        throw new Error(`Unknown cache key type: ${keyType}`);
    }
  }

  /**
   * Generate cache key with automatic TTL
   */
  buildKeyWithTTL(
    keyType: CacheKeyType,
    config: CacheKeyConfig,
    ...args: any[]
  ): { key: string; ttl: number } {
    let key: string;

    switch (keyType) {
      case 'classify':
        key = this.buildClassificationKey(config, args[0]);
        break;
      case 'warmup':
        key = this.buildWarmupKey(config, args[0], args[1]);
        break;
      case 'stitle':
        key = this.buildShortTitleKey(config, args[0]);
        break;
      case 'confirm':
        key = this.buildConfirmationKey(config, args[0], args[1]);
        break;
      case 'emb':
        key = this.buildEmbeddingKey(config, args[0]);
        break;
      case 'idem':
        key = this.buildIdempotencyKey(config, args[0]);
        break;
      case 'nonce':
        key = this.buildNonceKey(config, args[0]);
        break;
      case 'rate':
        key = this.buildRateLimitKey(config, args[0]);
        break;
      case 'health':
        key = this.buildHealthKey(config, args[0]);
        break;
      default:
        throw new Error(`Unknown cache key type: ${keyType}`);
    }

    return {
      key,
      ttl: this.getTTL(keyType),
    };
  }
}

// Global instance
export const socialWiseCacheKeyBuilder = new SocialWiseCacheKeyBuilder();

// Utility functions for common operations
export function buildCacheKey(
  keyType: CacheKeyType,
  config: CacheKeyConfig,
  ...args: any[]
): { key: string; ttl: number } {
  return socialWiseCacheKeyBuilder.buildKeyWithTTL(keyType, config, ...args);
}

export function parseCacheKey(cacheKey: string) {
  return socialWiseCacheKeyBuilder.parseKey(cacheKey);
}

export function validateCacheKey(cacheKey: string): boolean {
  return socialWiseCacheKeyBuilder.validateKey(cacheKey);
}