/**
 * OpenAI Structured Output Client
 * Implements requirements 3.3, 3.4, 7.3, 7.4
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { openaiChatWithCost } from '@/lib/cost/openai-wrapper';
import { 
  LlmConfig, 
  LlmResponse, 
  CircuitBreakerState,
  LlmPromptContext 
} from '../types/llm';

interface OpenAIClientConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  retryAttempts: number;
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringWindow: number;
  };
}

interface StructuredOutputOptions<T> {
  schema: z.ZodSchema<T>;
  systemPrompt: string;
  userPrompt: string;
  context?: LlmPromptContext;
  economicMode?: boolean;
}

export class OpenAIStructuredClient {
  private client: OpenAI;
  private config: OpenAIClientConfig;
  private circuitBreaker: CircuitBreakerState;
  private failureWindow: number[] = [];

  constructor(config: OpenAIClientConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
    });

    this.circuitBreaker = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
  }

  /**
   * Generate structured output using OpenAI with circuit breaker protection
   */
  async generateStructuredOutput<T>(
    options: StructuredOutputOptions<T>
  ): Promise<LlmResponse<T>> {
    const startTime = Date.now();

    // Check circuit breaker state
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() < this.circuitBreaker.nextAttemptTime) {
        return {
          success: false,
          error: 'Circuit breaker is OPEN',
          tokensUsed: 0,
          model: this.config.model,
          latencyMs: Date.now() - startTime,
          cached: false,
        };
      } else {
        // Transition to HALF_OPEN
        this.circuitBreaker.state = 'HALF_OPEN';
      }
    }

    try {
      const result = await this.executeWithRetry(options);
      
      // Success - reset circuit breaker if needed
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.resetCircuitBreaker();
      }

      return {
        success: true,
        result: result.data,
        tokensUsed: result.tokensUsed,
        model: this.config.model,
        latencyMs: Date.now() - startTime,
        cached: false,
      };

    } catch (error) {
      this.recordFailure();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        model: this.config.model,
        latencyMs: Date.now() - startTime,
        cached: false,
      };
    }
  }

  /**
   * Execute OpenAI call with retry logic
   */
  private async executeWithRetry<T>(
    options: StructuredOutputOptions<T>
  ): Promise<{ data: T; tokensUsed: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          // Jittered exponential backoff
          const baseDelay = Math.pow(2, attempt - 1) * 1000;
          const jitter = Math.random() * 0.1 * baseDelay;
          const delay = baseDelay + jitter;
          
          await this.sleep(delay);
        }

        const response = await openaiChatWithCost(
          this.client,
          this.config.model,
          [
            {
              role: 'system',
              content: options.systemPrompt,
            },
            {
              role: 'user',
              content: options.userPrompt,
            },
          ],
          {
            traceId: `structured-output-${Date.now()}`,
            intent: 'structured_output',
            ...options.context
          }
        );

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in OpenAI response');
        }

        let parsedContent: any;
        try {
          parsedContent = JSON.parse(content);
        } catch (parseError) {
          throw new Error(`Failed to parse JSON response: ${parseError}`);
        }

        // Validate against schema
        const validatedData = options.schema.parse(parsedContent);

        return {
          data: validatedData,
          tokensUsed: response.usage?.total_tokens || 0,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw lastError;
        }

        // If this is the last attempt, throw the error
        if (attempt === this.config.retryAttempts) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error?.status) {
      // 429 (rate limit) and 5xx errors are retryable
      return error.status === 429 || (error.status >= 500 && error.status < 600);
    }

    // Network errors are retryable
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(): void {
    const now = Date.now();
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = now;

    // Add to failure window
    this.failureWindow.push(now);
    
    // Clean old failures outside monitoring window
    const windowStart = now - this.config.circuitBreaker.monitoringWindow;
    this.failureWindow = this.failureWindow.filter(time => time > windowStart);

    // Check if we should open the circuit breaker
    if (this.failureWindow.length >= this.config.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.nextAttemptTime = now + this.config.circuitBreaker.recoveryTimeout;
    }
  }

  /**
   * Reset circuit breaker on success
   */
  private resetCircuitBreaker(): void {
    this.circuitBreaker = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
    this.failureWindow = [];
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Convert Zod schema to JSON Schema for OpenAI
   */
  private zodToJsonSchema(schema: z.ZodSchema): any {
    // Basic conversion for common Zod types
    // This is a simplified implementation - in production you might want to use
    // a library like zod-to-json-schema for more complete conversion
    
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodSchema);
        
        // Check if field is required (not optional)
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };
    }

    if (schema instanceof z.ZodString) {
      const result: any = { type: 'string' };
      
      // Add constraints if they exist
      if ((schema as any)._def.checks) {
        for (const check of (schema as any)._def.checks) {
          if (check.kind === 'max') {
            result.maxLength = check.value;
          }
          if (check.kind === 'min') {
            result.minLength = check.value;
          }
        }
      }
      
      return result;
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    // Fallback for unsupported types
    return { type: 'string' };
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for the OpenAI client
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple test call to check if API is reachable
      const response = await openaiChatWithCost(
        this.client,
        this.config.model,
        [{ role: 'user', content: 'test' }],
        {
          traceId: `health-check-${Date.now()}`,
          intent: 'health_check'
        }
      );
      
      return !!response.choices[0];
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create OpenAI client with default config
 */
export function createOpenAIClient(overrides?: Partial<OpenAIClientConfig>): OpenAIStructuredClient {
  const defaultConfig: OpenAIClientConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL_LLM || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '10000'),
    retryAttempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
    circuitBreaker: {
      failureThreshold: parseInt(process.env.OPENAI_CB_FAILURE_THRESHOLD || '5'),
      recoveryTimeout: parseInt(process.env.OPENAI_CB_RECOVERY_TIMEOUT || '30000'),
      monitoringWindow: parseInt(process.env.OPENAI_CB_MONITORING_WINDOW || '60000'),
    },
  };

  const config = { ...defaultConfig, ...overrides };
  return new OpenAIStructuredClient(config);
}