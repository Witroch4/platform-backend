/**
 * OpenAI Embedding Generation Service
 * Requirements: 3.1, 3.2, 8.1
 */

import OpenAI from 'openai';
import { getRedisInstance } from '@/lib/connections';
import { EmbeddingVector } from '../types/intent';

export interface EmbeddingGeneratorConfig {
  model: string;
  timeout: number;
  maxRetries: number;
  cacheEnabled: boolean;
  cacheTtl: number;
}

export interface TextPreprocessingOptions {
  normalize: boolean;
  trim: boolean;
  lowercase: boolean;
  removeExtraSpaces: boolean;
}

export class EmbeddingGenerator {
  private openai: OpenAI;
  private redis: any;
  private config: EmbeddingGeneratorConfig;

  constructor(config?: Partial<EmbeddingGeneratorConfig>) {
    this.config = {
      model: process.env.OPENAI_MODEL_EMBEDDING || 'text-embedding-3-small',
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '10000'),
      maxRetries: 3,
      cacheEnabled: true,
      cacheTtl: 3600, // 1 hour
      ...config,
    };

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });

    this.redis = getRedisInstance();
  }

  /**
   * Generate embedding for text with preprocessing and caching
   */
  async generateEmbedding(
    text: string,
    options?: TextPreprocessingOptions
  ): Promise<EmbeddingVector> {
    // Preprocess text
    const processedText = this.preprocessText(text, options);
    
    // Check cache first if enabled
    if (this.config.cacheEnabled) {
      const cached = await this.getCachedEmbedding(processedText);
      if (cached) {
        return cached;
      }
    }

    try {
      // Generate embedding via OpenAI
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: processedText,
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;
      
      const result: EmbeddingVector = {
        dimensions: embedding.length,
        values: embedding,
        model: this.config.model,
        generatedAt: new Date(),
      };

      // Cache the result if enabled
      if (this.config.cacheEnabled) {
        await this.cacheEmbedding(processedText, result);
      }

      return result;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(
    texts: string[],
    options?: TextPreprocessingOptions
  ): Promise<EmbeddingVector[]> {
    const processedTexts = texts.map(text => this.preprocessText(text, options));
    
    // Check cache for all texts
    const results: (EmbeddingVector | null)[] = [];
    const uncachedIndices: number[] = [];
    
    if (this.config.cacheEnabled) {
      for (let i = 0; i < processedTexts.length; i++) {
        const cached = await this.getCachedEmbedding(processedTexts[i]);
        if (cached) {
          results[i] = cached;
        } else {
          results[i] = null;
          uncachedIndices.push(i);
        }
      }
    } else {
      results.fill(null);
      uncachedIndices.push(...Array.from({ length: texts.length }, (_, i) => i));
    }

    // Generate embeddings for uncached texts
    if (uncachedIndices.length > 0) {
      try {
        const uncachedTexts = uncachedIndices.map(i => processedTexts[i]);
        
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: uncachedTexts,
          encoding_format: 'float',
        });

        // Process results
        for (let i = 0; i < uncachedIndices.length; i++) {
          const originalIndex = uncachedIndices[i];
          const embedding = response.data[i].embedding;
          
          const result: EmbeddingVector = {
            dimensions: embedding.length,
            values: embedding,
            model: this.config.model,
            generatedAt: new Date(),
          };

          results[originalIndex] = result;

          // Cache the result
          if (this.config.cacheEnabled) {
            await this.cacheEmbedding(processedTexts[originalIndex], result);
          }
        }
      } catch (error) {
        console.error('Failed to generate batch embeddings:', error);
        throw new Error(`Batch embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return results as EmbeddingVector[];
  }

  /**
   * Preprocess text for embedding generation
   */
  private preprocessText(
    text: string,
    options: TextPreprocessingOptions = {
      normalize: true,
      trim: true,
      lowercase: false,
      removeExtraSpaces: true
    }
  ): string {
    const {
      normalize = true,
      trim = true,
      lowercase = false,
      removeExtraSpaces = true,
    } = options;

    let processed = text;

    if (trim) {
      processed = processed.trim();
    }

    if (normalize) {
      // Unicode normalization (NFkC as mentioned in design)
      processed = processed.normalize('NFKC');
    }

    if (lowercase) {
      processed = processed.toLowerCase();
    }

    if (removeExtraSpaces) {
      // Remove extra whitespace and normalize spaces
      processed = processed.replace(/\s+/g, ' ');
    }

    return processed;
  }

  /**
   * Get cached embedding from Redis
   */
  private async getCachedEmbedding(text: string): Promise<EmbeddingVector | null> {
    try {
      const cacheKey = this.getCacheKey(text);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as EmbeddingVector;
      }
    } catch (error) {
      console.warn('Failed to get cached embedding:', error);
    }
    
    return null;
  }

  /**
   * Cache embedding in Redis
   */
  private async cacheEmbedding(text: string, embedding: EmbeddingVector): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(text);
      await this.redis.setex(
        cacheKey,
        this.config.cacheTtl,
        JSON.stringify(embedding)
      );
    } catch (error) {
      console.warn('Failed to cache embedding:', error);
    }
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    // Use a hash of the text and model for the cache key
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`${this.config.model}:${text}`)
      .digest('hex');
    
    return `embedding:${hash}`;
  }

  /**
   * Clear embedding cache
   */
  async clearCache(): Promise<void> {
    try {
      const pattern = 'embedding:*';
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.warn('Failed to clear embedding cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ totalKeys: number; memoryUsage: string }> {
    try {
      const pattern = 'embedding:*';
      const keys = await this.redis.keys(pattern);
      const memory = await this.redis.memory('usage', pattern);
      
      return {
        totalKeys: keys.length,
        memoryUsage: `${Math.round(memory / 1024)} KB`,
      };
    } catch (error) {
      console.warn('Failed to get cache stats:', error);
      return { totalKeys: 0, memoryUsage: '0 KB' };
    }
  }
}

// Export singleton instance
export const embeddingGenerator = new EmbeddingGenerator();