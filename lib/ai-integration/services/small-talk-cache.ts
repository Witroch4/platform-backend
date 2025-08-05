/**
 * Small-talk Cache Service
 * Implements requirements 15.1, 15.3
 */

import { createHash } from 'crypto';

interface CachedResponse {
  text: string;
  buttons?: Array<{
    title: string;
    id: string;
  }>;
  timestamp: number;
  hitCount: number;
}

interface SmallTalkCacheConfig {
  ttlMs: number;
  maxEntries: number;
  enabled: boolean;
}

export class SmallTalkCache {
  private cache: Map<string, CachedResponse> = new Map();
  private config: SmallTalkCacheConfig;

  // Common small-talk patterns that should be cached
  private smallTalkPatterns = [
    /^(oi|olá|ola|hey|hi|hello)!?$/i,
    /^(bom dia|boa tarde|boa noite)!?$/i,
    /^(tchau|bye|até logo|falou)!?$/i,
    /^(obrigad[oa]|valeu|thanks)!?$/i,
    /^(tudo bem|como vai|tudo bom)\??$/i,
    /^(ok|okay|beleza|certo)!?$/i,
    /^(sim|não|nao|yes|no)!?$/i,
    /^(haha|rsrs|kkk|lol)!?$/i,
  ];

  constructor(config?: Partial<SmallTalkCacheConfig>) {
    this.config = {
      ttlMs: config?.ttlMs || 30 * 60 * 1000, // 30 minutes
      maxEntries: config?.maxEntries || 1000,
      enabled: config?.enabled ?? true,
    };

    // Clean up expired entries periodically
    setInterval(() => this.cleanup(), this.config.ttlMs / 2);
  }

  /**
   * Check if message is small-talk and should be cached
   */
  isSmallTalk(message: string): boolean {
    if (!this.config.enabled) return false;

    const normalizedMessage = this.normalizeText(message);
    
    // Check against small-talk patterns
    return this.smallTalkPatterns.some(pattern => pattern.test(normalizedMessage));
  }

  /**
   * Get cached response if available
   */
  getCachedResponse(
    message: string, 
    channel: string, 
    accountId: number
  ): CachedResponse | null {
    if (!this.config.enabled || !this.isSmallTalk(message)) {
      return null;
    }

    const cacheKey = this.generateCacheKey(message, channel, accountId);
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.config.ttlMs) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Increment hit count
    cached.hitCount++;
    
    return cached;
  }

  /**
   * Cache a response for small-talk
   */
  cacheResponse(
    message: string,
    channel: string,
    accountId: number,
    response: { text: string; buttons?: Array<{ title: string; id: string }> }
  ): void {
    if (!this.config.enabled || !this.isSmallTalk(message)) {
      return;
    }

    const cacheKey = this.generateCacheKey(message, channel, accountId);
    
    // Check cache size limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(cacheKey, {
      text: response.text,
      buttons: response.buttons,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(message: string, channel: string, accountId: number): string {
    const normalizedMessage = this.normalizeText(message);
    const data = `${normalizedMessage}:${channel}:${accountId}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Normalize text for consistent caching
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.config.ttlMs) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * Evict oldest entry when cache is full
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, entry) => sum + entry.hitCount, 0);
    const avgHits = entries.length > 0 ? totalHits / entries.length : 0;

    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      totalHits,
      averageHits: Math.round(avgHits * 100) / 100,
      enabled: this.config.enabled,
      ttlMs: this.config.ttlMs,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmallTalkCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get predefined small-talk responses
   */
  getSmallTalkResponses(message: string, channel: string) {
    const normalizedMessage = this.normalizeText(message);
    
    // Greeting responses
    if (/^(oi|ola|hey|hi|hello)/.test(normalizedMessage)) {
      return {
        text: 'Olá! Como posso ajudar você hoje?',
        buttons: [
          { title: 'Suporte', id: 'support' },
          { title: 'Vendas', id: 'sales' },
        ],
      };
    }

    // Good morning/afternoon/evening
    if (/^bom dia/.test(normalizedMessage)) {
      return {
        text: 'Bom dia! Em que posso ajudá-lo?',
        buttons: [
          { title: 'Ajuda', id: 'help' },
          { title: 'Contato', id: 'contact' },
        ],
      };
    }

    if (/^boa tarde/.test(normalizedMessage)) {
      return {
        text: 'Boa tarde! Como posso ser útil?',
        buttons: [
          { title: 'Informações', id: 'info' },
          { title: 'Suporte', id: 'support' },
        ],
      };
    }

    if (/^boa noite/.test(normalizedMessage)) {
      return {
        text: 'Boa noite! Posso ajudá-lo com algo?',
        buttons: [
          { title: 'Urgente', id: 'urgent' },
          { title: 'Normal', id: 'normal' },
        ],
      };
    }

    // Thanks
    if (/^(obrigad|valeu|thanks)/.test(normalizedMessage)) {
      return {
        text: 'De nada! Fico feliz em ajudar. Precisa de mais alguma coisa?',
        buttons: [
          { title: 'Sim', id: 'yes_more_help' },
          { title: 'Não', id: 'no_more_help' },
        ],
      };
    }

    // How are you
    if (/^(tudo bem|como vai|tudo bom)/.test(normalizedMessage)) {
      return {
        text: 'Tudo bem, obrigado! E você, como posso ajudar?',
        buttons: [
          { title: 'Preciso de ajuda', id: 'need_help' },
          { title: 'Só cumprimentando', id: 'just_greeting' },
        ],
      };
    }

    // Simple confirmations
    if (/^(ok|okay|beleza|certo)/.test(normalizedMessage)) {
      return {
        text: 'Perfeito! Há mais alguma coisa em que posso ajudar?',
        buttons: [
          { title: 'Sim', id: 'yes_more' },
          { title: 'Não', id: 'no_more' },
        ],
      };
    }

    // Yes/No
    if (/^sim/.test(normalizedMessage)) {
      return {
        text: 'Ótimo! Como posso ajudar você?',
        buttons: [
          { title: 'Suporte', id: 'support' },
          { title: 'Informações', id: 'info' },
        ],
      };
    }

    if (/^(nao|não|no)/.test(normalizedMessage)) {
      return {
        text: 'Tudo bem! Se precisar de ajuda, estarei aqui.',
        buttons: [
          { title: 'Obrigado', id: 'thanks' },
        ],
      };
    }

    // Goodbye
    if (/^(tchau|bye|ate logo|falou)/.test(normalizedMessage)) {
      return {
        text: 'Até logo! Foi um prazer ajudar. Volte sempre!',
      };
    }

    // Laughter
    if (/^(haha|rsrs|kkk|lol)/.test(normalizedMessage)) {
      return {
        text: '😊 Fico feliz que esteja bem-humorado! Como posso ajudar?',
        buttons: [
          { title: 'Preciso de ajuda', id: 'need_help' },
          { title: 'Só brincando', id: 'just_joking' },
        ],
      };
    }

    // Default small-talk response
    return {
      text: 'Entendi! Como posso ajudar você hoje?',
      buttons: [
        { title: 'Suporte', id: 'support' },
        { title: 'Informações', id: 'info' },
      ],
    };
  }
}

/**
 * Factory function to create small-talk cache
 */
export function createSmallTalkCache(config?: Partial<SmallTalkCacheConfig>): SmallTalkCache {
  const defaultConfig: Partial<SmallTalkCacheConfig> = {
    ttlMs: parseInt(process.env.SMALL_TALK_CACHE_TTL || '1800000'), // 30 minutes
    maxEntries: parseInt(process.env.SMALL_TALK_CACHE_MAX_ENTRIES || '1000'),
    enabled: process.env.SMALL_TALK_CACHE_ENABLED !== 'false',
  };

  return new SmallTalkCache({ ...defaultConfig, ...config });
}