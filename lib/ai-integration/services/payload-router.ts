/**
 * Namespaced Payload Router Service
 * Requirements: 4.4, 5.4, 13.1
 */

import { z } from 'zod';

export type PayloadNamespace = 'intent' | 'flow' | 'help';

export interface ParsedPayload {
  namespace: PayloadNamespace;
  slug: string;
  originalPayload: string;
  isValid: boolean;
}

export interface RouteAction {
  type: 'intent' | 'flow' | 'help' | 'unknown';
  target: string;
  metadata?: Record<string, any>;
}

export interface RoutingRule {
  namespace: PayloadNamespace;
  slug: string;
  action: RouteAction;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingMetrics {
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  routesByNamespace: Record<PayloadNamespace, number>;
  routesByStatus: Record<'success' | 'failed' | 'unknown', number>;
}

// Zod schemas for payload validation
const PayloadNamespaceSchema = z.enum(['intent', 'flow', 'help']);

const NamespacedPayloadSchema = z.string().regex(
  /^(intent|flow|help):([a-zA-Z0-9_-]+)$/,
  'Payload must follow format: namespace:slug (e.g., intent:track_order)'
);

export class PayloadRouterService {
  private routingTable: Map<string, RoutingRule> = new Map();
  private metrics: RoutingMetrics = {
    totalRoutes: 0,
    successfulRoutes: 0,
    failedRoutes: 0,
    routesByNamespace: {
      intent: 0,
      flow: 0,
      help: 0,
    },
    routesByStatus: {
      success: 0,
      failed: 0,
      unknown: 0,
    },
  };

  constructor() {
    this.initializeDefaultRoutes();
  }

  /**
   * Parse namespaced payload
   */
  parsePayload(payload: string): ParsedPayload {
    try {
      const validation = NamespacedPayloadSchema.safeParse(payload);
      
      if (!validation.success) {
        return {
          namespace: 'intent', // default fallback
          slug: payload,
          originalPayload: payload,
          isValid: false,
        };
      }

      const match = payload.match(/^(intent|flow|help):([a-zA-Z0-9_-]+)$/);
      if (!match) {
        return {
          namespace: 'intent',
          slug: payload,
          originalPayload: payload,
          isValid: false,
        };
      }

      const [, namespace, slug] = match;

      return {
        namespace: namespace as PayloadNamespace,
        slug,
        originalPayload: payload,
        isValid: true,
      };
    } catch (error) {
      console.error('Failed to parse payload:', error);
      return {
        namespace: 'intent',
        slug: payload,
        originalPayload: payload,
        isValid: false,
      };
    }
  }

  /**
   * Route payload to appropriate action
   */
  async routePayload(
    payload: string,
    context?: {
      conversationId?: string;
      accountId?: number;
      channel?: string;
    }
  ): Promise<{
    action: RouteAction;
    success: boolean;
    error?: string;
  }> {
    this.metrics.totalRoutes++;

    try {
      const parsed = this.parsePayload(payload);
      
      if (!parsed.isValid) {
        this.metrics.failedRoutes++;
        this.metrics.routesByStatus.failed++;
        
        console.warn('Invalid payload format:', {
          payload,
          context,
        });

        return {
          action: {
            type: 'unknown',
            target: 'fallback',
            metadata: { reason: 'invalid_format', originalPayload: payload },
          },
          success: false,
          error: 'Invalid payload format',
        };
      }

      // Look up routing rule
      const routeKey = `${parsed.namespace}:${parsed.slug}`;
      const rule = this.routingTable.get(routeKey);

      if (!rule || !rule.enabled) {
        this.metrics.failedRoutes++;
        this.metrics.routesByStatus.unknown++;

        console.warn('No routing rule found:', {
          payload,
          routeKey,
          context,
        });

        return {
          action: {
            type: parsed.namespace === 'intent' ? 'intent' : 'unknown',
            target: parsed.slug,
            metadata: { 
              reason: 'no_rule_found', 
              namespace: parsed.namespace,
              slug: parsed.slug,
            },
          },
          success: false,
          error: 'No routing rule found',
        };
      }

      // Execute routing
      this.metrics.successfulRoutes++;
      this.metrics.routesByNamespace[parsed.namespace]++;
      this.metrics.routesByStatus.success++;

      console.log('Payload routed successfully:', {
        payload,
        action: rule.action,
        context,
      });

      return {
        action: rule.action,
        success: true,
      };
    } catch (error) {
      this.metrics.failedRoutes++;
      this.metrics.routesByStatus.failed++;

      console.error('Failed to route payload:', error);
      return {
        action: {
          type: 'unknown',
          target: 'error',
          metadata: { reason: 'routing_error', error: error instanceof Error ? error.message : 'Unknown error' },
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add or update routing rule
   */
  addRoutingRule(rule: Omit<RoutingRule, 'createdAt' | 'updatedAt'>): void {
    const routeKey = `${rule.namespace}:${rule.slug}`;
    const now = new Date();

    const fullRule: RoutingRule = {
      ...rule,
      createdAt: this.routingTable.has(routeKey) 
        ? this.routingTable.get(routeKey)!.createdAt 
        : now,
      updatedAt: now,
    };

    this.routingTable.set(routeKey, fullRule);

    console.log('Routing rule added/updated:', {
      routeKey,
      action: rule.action,
      enabled: rule.enabled,
    });
  }

  /**
   * Remove routing rule
   */
  removeRoutingRule(namespace: PayloadNamespace, slug: string): boolean {
    const routeKey = `${namespace}:${slug}`;
    const removed = this.routingTable.delete(routeKey);

    if (removed) {
      console.log('Routing rule removed:', { routeKey });
    }

    return removed;
  }

  /**
   * Get routing rule
   */
  getRoutingRule(namespace: PayloadNamespace, slug: string): RoutingRule | undefined {
    const routeKey = `${namespace}:${slug}`;
    return this.routingTable.get(routeKey);
  }

  /**
   * List all routing rules
   */
  listRoutingRules(
    filters?: {
      namespace?: PayloadNamespace;
      enabled?: boolean;
    }
  ): RoutingRule[] {
    const rules = Array.from(this.routingTable.values());

    return rules
      .filter(rule => {
        if (filters?.namespace && rule.namespace !== filters.namespace) {
          return false;
        }
        if (filters?.enabled !== undefined && rule.enabled !== filters.enabled) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Enable/disable routing rule
   */
  toggleRoutingRule(namespace: PayloadNamespace, slug: string, enabled: boolean): boolean {
    const routeKey = `${namespace}:${slug}`;
    const rule = this.routingTable.get(routeKey);

    if (!rule) {
      return false;
    }

    rule.enabled = enabled;
    rule.updatedAt = new Date();
    this.routingTable.set(routeKey, rule);

    console.log('Routing rule toggled:', {
      routeKey,
      enabled,
    });

    return true;
  }

  /**
   * Validate payload format
   */
  validatePayloadFormat(payload: string): {
    isValid: boolean;
    errors: string[];
    suggestions?: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Check basic format
    if (!payload.includes(':')) {
      errors.push('Payload must contain a colon (:) separator');
      suggestions.push('Use format: namespace:slug (e.g., intent:track_order)');
    } else {
      const parts = payload.split(':');
      
      if (parts.length !== 2) {
        errors.push('Payload must have exactly one colon separator');
        suggestions.push('Use format: namespace:slug (e.g., intent:track_order)');
      } else {
        const [namespace, slug] = parts;

        // Validate namespace
        if (!['intent', 'flow', 'help'].includes(namespace)) {
          errors.push(`Invalid namespace: ${namespace}. Must be one of: intent, flow, help`);
          suggestions.push('Use valid namespace: intent:, flow:, or help:');
        }

        // Validate slug
        if (!slug || slug.length === 0) {
          errors.push('Slug cannot be empty');
          suggestions.push('Provide a slug after the colon (e.g., intent:track_order)');
        } else if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
          errors.push('Slug can only contain letters, numbers, underscores, and hyphens');
          suggestions.push('Use only alphanumeric characters, underscores, and hyphens in slug');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Generate payload suggestions based on available routes
   */
  generatePayloadSuggestions(
    partialPayload: string,
    limit: number = 5
  ): string[] {
    const suggestions: string[] = [];
    const rules = Array.from(this.routingTable.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      const payload = `${rule.namespace}:${rule.slug}`;
      
      if (payload.toLowerCase().includes(partialPayload.toLowerCase())) {
        suggestions.push(payload);
        
        if (suggestions.length >= limit) {
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Get routing metrics
   */
  getMetrics(): RoutingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset routing metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRoutes: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      routesByNamespace: {
        intent: 0,
        flow: 0,
        help: 0,
      },
      routesByStatus: {
        success: 0,
        failed: 0,
        unknown: 0,
      },
    };
  }

  /**
   * Initialize default routing rules
   */
  private initializeDefaultRoutes(): void {
    // Default intent routes
    this.addRoutingRule({
      namespace: 'intent',
      slug: 'track_order',
      action: {
        type: 'intent',
        target: 'track_order',
        metadata: { description: 'Track order status' },
      },
      enabled: true,
      priority: 100,
    });

    this.addRoutingRule({
      namespace: 'intent',
      slug: 'payment_help',
      action: {
        type: 'intent',
        target: 'payment_help',
        metadata: { description: 'Payment assistance' },
      },
      enabled: true,
      priority: 100,
    });

    this.addRoutingRule({
      namespace: 'intent',
      slug: 'cancel_order',
      action: {
        type: 'intent',
        target: 'cancel_order',
        metadata: { description: 'Cancel order request' },
      },
      enabled: true,
      priority: 100,
    });

    // Default flow routes
    this.addRoutingRule({
      namespace: 'flow',
      slug: 'onboarding',
      action: {
        type: 'flow',
        target: 'onboarding_flow',
        metadata: { description: 'User onboarding flow' },
      },
      enabled: true,
      priority: 90,
    });

    this.addRoutingRule({
      namespace: 'flow',
      slug: 'support_escalation',
      action: {
        type: 'flow',
        target: 'support_escalation_flow',
        metadata: { description: 'Escalate to human support' },
      },
      enabled: true,
      priority: 90,
    });

    // Default help routes
    this.addRoutingRule({
      namespace: 'help',
      slug: 'faq',
      action: {
        type: 'help',
        target: 'faq_system',
        metadata: { description: 'Frequently asked questions' },
      },
      enabled: true,
      priority: 80,
    });

    this.addRoutingRule({
      namespace: 'help',
      slug: 'contact',
      action: {
        type: 'help',
        target: 'contact_info',
        metadata: { description: 'Contact information' },
      },
      enabled: true,
      priority: 80,
    });

    console.log('Default routing rules initialized:', {
      totalRules: this.routingTable.size,
    });
  }
}

// Export singleton instance
export const payloadRouterService = new PayloadRouterService();