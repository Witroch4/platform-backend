import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Mock data for demonstration - in production this would come from database
let mockAlertRules = [
  {
    id: 'rule-1',
    name: 'High Queue Backlog',
    description: 'Alert when queue has too many waiting jobs',
    queueName: 'webhook-processing',
    condition: {
      metric: 'waiting_jobs',
      operator: '>' as const,
      threshold: 100,
      timeWindow: 5,
      aggregation: 'avg' as const
    },
    severity: 'warning' as const,
    channels: [
      {
        type: 'email' as const,
        config: { recipients: ['admin@example.com', 'ops@example.com'] }
      },
      {
        type: 'slack' as const,
        config: { 
          webhookUrl: 'https://hooks.slack.com/services/...',
          channel: '#alerts'
        }
      }
    ],
    cooldown: 5,
    enabled: true,
    createdBy: 'admin@example.com',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2)  // 2 days ago
  },
  {
    id: 'rule-2',
    name: 'High Error Rate',
    description: 'Alert when error rate exceeds threshold',
    queueName: 'image-processing',
    condition: {
      metric: 'error_rate',
      operator: '>' as const,
      threshold: 10,
      timeWindow: 10,
      aggregation: 'avg' as const
    },
    severity: 'critical' as const,
    channels: [
      {
        type: 'email' as const,
        config: { recipients: ['admin@example.com'] }
      },
      {
        type: 'webhook' as const,
        config: { 
          url: 'https://api.pagerduty.com/incidents',
          headers: '{"Authorization": "Token token=..."}'
        }
      }
    ],
    cooldown: 10,
    enabled: true,
    createdBy: 'admin@example.com',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24)      // 1 day ago
  },
  {
    id: 'rule-3',
    name: 'Global System Health',
    description: 'Monitor overall system health across all queues',
    condition: {
      metric: 'system_health_score',
      operator: '<' as const,
      threshold: 80,
      timeWindow: 15,
      aggregation: 'avg' as const
    },
    severity: 'error' as const,
    channels: [
      {
        type: 'email' as const,
        config: { recipients: ['admin@example.com', 'devops@example.com'] }
      }
    ],
    cooldown: 15,
    enabled: false,
    createdBy: 'admin@example.com',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12)      // 12 hours ago
  }
];

const AlertConditionSchema = z.object({
  metric: z.string(),
  operator: z.enum(['>', '<', '==', '!=', 'contains']),
  threshold: z.union([z.number(), z.string()]),
  timeWindow: z.number().min(1),
  aggregation: z.enum(['avg', 'sum', 'max', 'min', 'count']).optional()
});

const NotificationChannelSchema = z.object({
  type: z.enum(['email', 'slack', 'webhook', 'sms']),
  config: z.record(z.any())
});

const AlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000),
  queueName: z.string().optional(),
  condition: AlertConditionSchema,
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  channels: z.array(NotificationChannelSchema),
  cooldown: z.number().min(1).max(1440), // 1 minute to 24 hours
  enabled: z.boolean()
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get('queueName');
    const enabled = searchParams.get('enabled');
    const severity = searchParams.get('severity');

    let rules = [...mockAlertRules];

    // Filter by queue name if specified
    if (queueName) {
      rules = rules.filter(rule => 
        rule.queueName === queueName || (!rule.queueName && queueName === 'global')
      );
    }

    // Filter by enabled status if specified
    if (enabled !== null) {
      const isEnabled = enabled === 'true';
      rules = rules.filter(rule => rule.enabled === isEnabled);
    }

    // Filter by severity if specified
    if (severity) {
      rules = rules.filter(rule => rule.severity === severity);
    }

    // Sort by creation date (newest first)
    rules = rules.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const stats = {
      total: mockAlertRules.length,
      enabled: mockAlertRules.filter(r => r.enabled).length,
      disabled: mockAlertRules.filter(r => !r.enabled).length,
      bySeverity: {
        critical: mockAlertRules.filter(r => r.severity === 'critical').length,
        error: mockAlertRules.filter(r => r.severity === 'error').length,
        warning: mockAlertRules.filter(r => r.severity === 'warning').length,
        info: mockAlertRules.filter(r => r.severity === 'info').length,
      },
      byQueue: mockAlertRules.reduce((acc, rule) => {
        const queue = rule.queueName || 'global';
        acc[queue] = (acc[queue] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    return NextResponse.json({
      success: true,
      rules,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Alert Rules] Error fetching rules:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch alert rules',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ruleData = AlertRuleSchema.parse(body);

    const newRule = {
      id: `rule-${Date.now()}`,
      ...ruleData,
      createdBy: 'current-user@example.com', // In production, get from auth
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockAlertRules.push(newRule);

    return NextResponse.json({
      success: true,
      message: 'Alert rule created successfully',
      rule: newRule,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid rule data',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('[Alert Rules] Error creating rule:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create alert rule',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rule ID is required' 
        },
        { status: 400 }
      );
    }

    const ruleIndex = mockAlertRules.findIndex(rule => rule.id === id);
    
    if (ruleIndex === -1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Alert rule not found' 
        },
        { status: 404 }
      );
    }

    // Validate update data (partial schema)
    const partialRuleData = AlertRuleSchema.partial().parse(updateData);

    mockAlertRules[ruleIndex] = {
      ...mockAlertRules[ruleIndex],
      ...partialRuleData,
      updatedAt: new Date()
    };

    return NextResponse.json({
      success: true,
      message: 'Alert rule updated successfully',
      rule: mockAlertRules[ruleIndex],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid update data',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('[Alert Rules] Error updating rule:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update alert rule',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rule ID is required' 
        },
        { status: 400 }
      );
    }

    const ruleIndex = mockAlertRules.findIndex(rule => rule.id === id);
    
    if (ruleIndex === -1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Alert rule not found' 
        },
        { status: 404 }
      );
    }

    const deletedRule = mockAlertRules.splice(ruleIndex, 1)[0];

    return NextResponse.json({
      success: true,
      message: 'Alert rule deleted successfully',
      rule: deletedRule,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Alert Rules] Error deleting rule:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete alert rule',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}