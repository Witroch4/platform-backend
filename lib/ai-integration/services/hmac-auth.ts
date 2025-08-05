/**
 * HMAC Authentication Service
 * Based on requirements 12.1, 13.1
 */

import crypto from 'crypto';
import { WebhookValidationResult } from '../types/webhook';

export class HmacAuthService {
  private readonly secret: string;
  private readonly timestampWindow: number; // seconds

  constructor(secret: string, timestampWindow: number = 300) { // 5 minutes
    if (!secret) {
      throw new Error('HMAC secret is required');
    }
    this.secret = secret;
    this.timestampWindow = timestampWindow;
  }

  /**
   * Validate HMAC signature with timing-safe comparison
   * String canônica: timestamp + '.' + rawBody
   */
  validateSignature(
    rawBody: string,
    signature: string,
    timestamp: string,
    version: string = 'v1'
  ): WebhookValidationResult {
    try {
      // Validate version
      if (version !== 'v1') {
        return {
          isValid: false,
          error: `Unsupported signature version: ${version}`,
        };
      }

      // Validate timestamp format
      const timestampNum = parseInt(timestamp, 10);
      if (isNaN(timestampNum)) {
        return {
          isValid: false,
          error: 'Invalid timestamp format',
        };
      }

      // Validate timestamp window (±5 min)
      const now = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(now - timestampNum);
      
      if (timeDiff > this.timestampWindow) {
        return {
          isValid: false,
          error: `Timestamp outside allowed window. Diff: ${timeDiff}s, Max: ${this.timestampWindow}s`,
          timestamp: timestampNum,
        };
      }

      // Create canonical string: timestamp + '.' + rawBody
      const canonicalString = `${timestamp}.${rawBody}`;
      
      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(canonicalString, 'utf8')
        .digest('hex');

      // Remove 'sha256=' prefix if present
      const cleanSignature = signature.startsWith('sha256=') 
        ? signature.slice(7) 
        : signature;

      // Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(cleanSignature, 'hex')
      );

      if (!isValid) {
        return {
          isValid: false,
          error: 'HMAC signature mismatch',
          timestamp: timestampNum,
        };
      }

      return {
        isValid: true,
        timestamp: timestampNum,
      };

    } catch (error) {
      return {
        isValid: false,
        error: `HMAC validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate HMAC signature for testing purposes
   */
  generateSignature(rawBody: string, timestamp?: string): { signature: string; timestamp: string } {
    const ts = timestamp || Math.floor(Date.now() / 1000).toString();
    const canonicalString = `${ts}.${rawBody}`;
    
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(canonicalString, 'utf8')
      .digest('hex');

    return {
      signature: `sha256=${signature}`,
      timestamp: ts,
    };
  }

  /**
   * Check if timestamp is within allowed window
   */
  isTimestampValid(timestamp: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(now - timestamp);
    return timeDiff <= this.timestampWindow;
  }
}

// Singleton instance
let hmacAuthInstance: HmacAuthService | null = null;

export function getHmacAuthService(): HmacAuthService {
  if (!hmacAuthInstance) {
    const secret = process.env.CHATWIT_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('CHATWIT_WEBHOOK_SECRET environment variable is required');
    }
    
    const timestampWindow = process.env.HMAC_TIMESTAMP_WINDOW 
      ? parseInt(process.env.HMAC_TIMESTAMP_WINDOW, 10)
      : 300; // 5 minutes default

    hmacAuthInstance = new HmacAuthService(secret, timestampWindow);
  }
  
  return hmacAuthInstance;
}

// Reset singleton for testing
export function resetHmacAuthService(): void {
  hmacAuthInstance = null;
}