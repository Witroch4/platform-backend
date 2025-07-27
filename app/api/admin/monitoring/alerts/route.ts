import { NextRequest, NextResponse } from 'next/server';
import { apm } from '../../../../../lib/monitoring/application-performance-monitor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const component = searchParams.get('component');
    const level = searchParams.get('level');
    const limit = parseInt(searchParams.get('limit') || '50');

    let alerts = apm.getActiveAlerts();

    // Filter by component if specified
    if (component) {
      alerts = alerts.filter(alert => alert.component === component);
    }

    // Filter by level if specified
    if (level) {
      alerts = alerts.filter(alert => alert.level === level);
    }

    // Sort by timestamp (newest first) and limit
    alerts = alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    // Format alerts for API response
    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      level: alert.level,
      component: alert.component,
      message: alert.message,
      timestamp: alert.timestamp.toISOString(),
      metrics: alert.metrics,
      resolved: alert.resolved,
      resolvedAt: alert.resolvedAt?.toISOString(),
    }));

    // Get alert statistics
    const stats = {
      total: alerts.length,
      byLevel: {
        critical: alerts.filter(a => a.level === 'critical').length,
        error: alerts.filter(a => a.level === 'error').length,
        warning: alerts.filter(a => a.level === 'warning').length,
        info: alerts.filter(a => a.level === 'info').length,
      },
      byComponent: alerts.reduce((acc, alert) => {
        acc[alert.component] = (acc[alert.component] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      alerts: formattedAlerts,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Monitoring Alerts] Error fetching alerts:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to fetch alerts',
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
    const { alertId, action } = body;

    if (!alertId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: alertId and action' },
        { status: 400 }
      );
    }

    let result = false;
    let message = '';

    switch (action) {
      case 'resolve':
        result = apm.resolveAlert(alertId);
        message = result ? 'Alert resolved successfully' : 'Alert not found or already resolved';
        break;
      
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: result,
      message,
      alertId,
      action,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Monitoring Alerts] Error processing alert action:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to process alert action',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}