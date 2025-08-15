/**
 * SocialWise Flow Replay Protection Service
 * Based on requirements 4.2, 4.5
 */

import { getRedisInstance } from '@/lib/connections';
import { validateNonce, NonceType } from '../schemas/payload';

export interface ReplayProtectionResult {
  allowed: boolean;
  error?: string;
}

export class SocialWiseReplayProtectionService {
  private readonly redis: any;
  private readonly ttl: number; // seconds

  constructor(ttl: number = 300) { // 5 minutes default
    this.redis = getRedisInstance();
    this.ttl = ttl;
  }

  /**
   * Generate nonce key for replay protection
   * Format: sw:nonce:{nonce}
   */
  private generateNonceKey(nonce: string): string {
    return `sw:nonce:${nonce}`;
  }

  /**
   * Check if nonce has been used before and mark it as used
   * Returns true if allowed (nonce is new), false if replay detected
   */
  async checkAndMarkNonce(nonce: string): Promise<ReplayProtectionResult> {
    try {
      // Validate nonce format first
      const validation = validateNonce(nonce);
      if (!validation.success) {
        return {
          allowed: false,
          error: validation.error || 'Invalid nonce format',
        };
      }

      const key = this.generateNonceKey(nonce);
      
      // SETNX with TTL - returns 1 if key was set (new nonce), 0 if key already exists (replay)
      const result = await this.redis.set(key, '1', 'EX', this.ttl, 'NX');
      
      if (result === null) {
        // Key already exists - replay detected
        return {
          allowed: false,
          error: 'Replay detected: nonce already used',
        };
      }

      // New nonce - allowed
      return {
        allowed: true,
      };

    } catch (error) {
      console.error('Replay protection check failed:', error);
      
      // Fail open for availability - allow request if Redis is down
      return {
        allowed: true,
      };
    }
  }

  /**
   * Check if nonce exists without marking it as used
   */
  async nonceExists(nonce: string): Promise<boolean> {
    try {
      const validation = validateNonce(nonce);
      if (!validation.success) {
        return false;
      }

      const key = this.generateNonceKey(nonce);
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check nonce existence:', error);
      return false;
    }
  }

  /**
   * Remove nonce (for testing/cleanup)
   */
  async removeNonce(nonce: string): Promise<void> {
    try {
      const key = this.generateNonceKey(nonce);
      await this.redis.del(key);
    } catch (error) {
      console.error('Failed to remove nonce:', error);
      throw error;
    }
  }

  /**
   * Get TTL for a nonce
   */
  async getNonceTTL(nonce: string): Promise<number> {
    try {
      const key = this.generateNonceKey(nonce);
      return await this.redis.ttl(key);
    } catch (error) {
      console.error('Failed to get nonce TTL:', error);
      return -1;
    }
  }

  /**
   * Extract nonce from request headers
   * Looks for X-Nonce header or nonce query parameter
   */
  extractNonceFromRequest(request: Request): string | null {
    try {
      // Check X-Nonce header first
      const headerNonce = request.headers.get('x-nonce');
      if (headerNonce) {
        return headerNonce.trim();
      }

      // Check nonce query parameter
      const url = new URL(request.url);
      const queryNonce = url.searchParams.get('nonce');
      if (queryNonce) {
        return queryNonce.trim();
      }

      return null;
    } catch (error) {
      console.error('Failed to extract nonce from request:', error);
      return null;
    }
  }
}