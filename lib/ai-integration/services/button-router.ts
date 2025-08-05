/**
 * Button Router Service
 * Single service mapping namespaced payload (intent:, flow:, help:) → action
 * Requirements: 4.4, 5.4, 13.1
 */

import { payloadRouterService, PayloadNamespace, RouteAction } from './payload-router';

export interface ButtonClickContext {
  conversationId: string;
  messageId: string;
  accountId: number;
  channel: 'whatsapp' | 'instagram' | 'messenger';
  contactId?: string;
  agentId?: string;
  timestamp: Date;
}

export interface ButtonRouteResult {
  action: RouteAction;
  success: boolean;
  executionTime: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ButtonRouteMetrics {
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  avgExecutionTime: number;
  routesByType: Record<string, number>;
  routesByStatus: Record<'success' | 'failed', number>;
  routesByChannel: Record<string, number>;
}

export class ButtonRouterService {
  private metrics: ButtonRouteMetrics = {
    totalRoutes: 0,
    successfulRoutes: 0,
    failedRoutes: 0,
    avgExecutionTime: 0,
    routesByType: {},
    routesByStatus: {
      success: 0,
      failed: 0,
    },
    routesByChannel: {},
  };

  private executionTimes: number[] = [];

  /**
   * Route button click payload to appropriate action
   */
  async routeButtonClick(
    payload: string,
    context: ButtonClickContext
  ): Promise<ButtonRouteResult> {
    const startTime = Date.now();
    this.metrics.totalRoutes++;

    // Update channel metrics
    this.metrics.routesByChannel[context.channel] = 
      (this.metrics.routesByChannel[context.channel] || 0) + 1;

    try {
      console.log('Routing button click:', {
        payload,
        conversationId: context.conversationId,
        channel: context.channel,
        accountId: context.accountId,
      });

      // Use payload router service to handle the routing
      const routeResult = await payloadRouterService.routePayload(payload, {
        conversationId: context.conversationId,
        accountId: context.accountId,
        channel: context.channel,
      });

      const executionTime = Date.now() - startTime;
      this.updateExecutionTime(executionTime);

      if (routeResult.success) {
        this.metrics.successfulRoutes++;
        this.metrics.routesByStatus.success++;
        
        // Update route type metrics
        const routeType = routeResult.action.type;
        this.metrics.routesByType[routeType] = 
          (this.metrics.routesByType[routeType] || 0) + 1;

        console.log('Button click routed successfully:', {
          payload,
          action: routeResult.action,
          executionTime,
          context: {
            conversationId: context.conversationId,
            channel: context.channel,
          },
        });

        return {
          action: routeResult.action,
          success: true,
          executionTime,
          metadata: {
            routedAt: new Date(),
            context,
          },
        };
      } else {
        this.metrics.failedRoutes++;
        this.metrics.routesByStatus.failed++;

        console.warn('Button click routing failed:', {
          payload,
          error: routeResult.error,
          executionTime,
          context,
        });

        return {
          action: routeResult.action,
          success: false,
          executionTime,
          error: routeResult.error,
          metadata: {
            routedAt: new Date(),
            context,
          },
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateExecutionTime(executionTime);
      
      this.metrics.failedRoutes++;
      this.metrics.routesByStatus.failed++;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('Button routing error:', {
        payload,
        error: errorMessage,
        executionTime,
        context,
      });

      return {
        action: {
          type: 'unknown',
          target: 'error',
          metadata: { 
            reason: 'routing_exception',
            error: errorMessage,
          },
        },
        success: false,
        executionTime,
        error: errorMessage,
        metadata: {
          routedAt: new Date(),
          context,
        },
      };
    }
  }

  /**
   * Route multiple button clicks in batch
   */
  async routeButtonClicks(
    payloads: Array<{ payload: string; context: ButtonClickContext }>
  ): Promise<ButtonRouteResult[]> {
    const results: ButtonRouteResult[] = [];

    for (const { payload, context } of payloads) {
      const result = await this.routeButtonClick(payload, context);
      results.push(result);
    }

    console.log('Batch button routing completed:', {
      totalRequests: payloads.length,
      successfulRoutes: results.filter(r => r.success).length,
      failedRoutes: results.filter(r => !r.success).length,
    });

    return results;
  }

  /**
   * Handle WhatsApp button reply
   */
  async handleWhatsAppButtonReply(
    buttonReply: {
      id: string;
      title: string;
    },
    context: ButtonClickContext
  ): Promise<ButtonRouteResult> {
    console.log('Handling WhatsApp button reply:', {
      buttonId: buttonReply.id,
      buttonTitle: buttonReply.title,
      conversationId: context.conversationId,
    });

    return this.routeButtonClick(buttonReply.id, context);
  }

  /**
   * Handle Instagram quick reply
   */
  async handleInstagramQuickReply(
    quickReply: {
      payload: string;
      title?: string;
    },
    context: ButtonClickContext
  ): Promise<ButtonRouteResult> {
    console.log('Handling Instagram quick reply:', {
      payload: quickReply.payload,
      title: quickReply.title,
      conversationId: context.conversationId,
    });

    return this.routeButtonClick(quickReply.payload, context);
  }

  /**
   * Handle Instagram postback
   */
  async handleInstagramPostback(
    postback: {
      payload: string;
      title?: string;
    },
    context: ButtonClickContext
  ): Promise<ButtonRouteResult> {
    console.log('Handling Instagram postback:', {
      payload: postback.payload,
      title: postback.title,
      conversationId: context.conversationId,
    });

    return this.routeButtonClick(postback.payload, context);
  }

  /**
   * Get routing suggestions for button creation
   */
  getButtonSuggestions(
    namespace?: PayloadNamespace,
    limit: number = 10
  ): Array<{
    payload: string;
    title: string;
    description?: string;
    namespace: PayloadNamespace;
    slug: string;
  }> {
    const rules = payloadRouterService.listRoutingRules({
      namespace,
      enabled: true,
    });

    return rules.slice(0, limit).map(rule => ({
      payload: `${rule.namespace}:${rule.slug}`,
      title: this.generateButtonTitle(rule.slug),
      description: rule.action.metadata?.description,
      namespace: rule.namespace,
      slug: rule.slug,
    }));
  }

  /**
   * Validate button payload before use
   */
  validateButtonPayload(payload: string): {
    isValid: boolean;
    errors: string[];
    suggestions?: string[];
    routeExists: boolean;
  } {
    const validation = payloadRouterService.validatePayloadFormat(payload);
    
    // Check if route exists
    const parsed = payloadRouterService.parsePayload(payload);
    const routeExists = parsed.isValid && 
      payloadRouterService.getRoutingRule(parsed.namespace, parsed.slug) !== undefined;

    return {
      ...validation,
      routeExists,
    };
  }

  /**
   * Get button routing metrics
   */
  getMetrics(): ButtonRouteMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed routing analytics
   */
  getRoutingAnalytics(timeRange?: { from: Date; to: Date }): {
    metrics: ButtonRouteMetrics;
    topRoutes: Array<{ route: string; count: number; successRate: number }>;
    channelPerformance: Array<{ channel: string; routes: number; successRate: number }>;
    avgExecutionTime: number;
    performancePercentiles: { p50: number; p95: number; p99: number };
  } {
    const topRoutes = Object.entries(this.metrics.routesByType)
      .map(([route, count]) => ({
        route,
        count,
        successRate: this.metrics.successfulRoutes > 0 
          ? count / this.metrics.totalRoutes 
          : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const channelPerformance = Object.entries(this.metrics.routesByChannel)
      .map(([channel, routes]) => ({
        channel,
        routes,
        successRate: this.metrics.successfulRoutes > 0 
          ? routes / this.metrics.totalRoutes 
          : 0,
      }))
      .sort((a, b) => b.routes - a.routes);

    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const performancePercentiles = {
      p50: this.getPercentile(sortedTimes, 50),
      p95: this.getPercentile(sortedTimes, 95),
      p99: this.getPercentile(sortedTimes, 99),
    };

    return {
      metrics: this.getMetrics(),
      topRoutes,
      channelPerformance,
      avgExecutionTime: this.metrics.avgExecutionTime,
      performancePercentiles,
    };
  }

  /**
   * Reset routing metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRoutes: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      avgExecutionTime: 0,
      routesByType: {},
      routesByStatus: {
        success: 0,
        failed: 0,
      },
      routesByChannel: {},
    };
    this.executionTimes = [];
  }

  /**
   * Update execution time metrics
   */
  private updateExecutionTime(executionTime: number): void {
    this.executionTimes.push(executionTime);
    
    // Keep only last 1000 execution times for memory efficiency
    if (this.executionTimes.length > 1000) {
      this.executionTimes = this.executionTimes.slice(-1000);
    }

    // Update average execution time
    const sum = this.executionTimes.reduce((acc, time) => acc + time, 0);
    this.metrics.avgExecutionTime = sum / this.executionTimes.length;
  }

  /**
   * Generate user-friendly button title from slug
   */
  private generateButtonTitle(slug: string): string {
    return slug
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate percentile from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}

// Export singleton instance
export const buttonRouterService = new ButtonRouterService();