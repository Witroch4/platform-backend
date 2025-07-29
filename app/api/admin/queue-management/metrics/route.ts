import { NextRequest, NextResponse } from 'next/server';
import { QueueMetrics, SystemMetrics, TimeRange } from '@/types/queue-management';

// Mock data generator for queue metrics
function generateMockQueueMetrics(queueName: string, timeRange: TimeRange): QueueMetrics[] {
  const metrics: QueueMetrics[] = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
  
  // Generate data points every 5 minutes for the last 24 hours
  for (let time = startTime.getTime(); time <= now.getTime(); time += 5 * 60 * 1000) {
    const timestamp = new Date(time);
    
    // Add some realistic variation based on time of day
    const hour = timestamp.getHours();
    const baseMultiplier = hour >= 9 && hour <= 17 ? 1.5 : 0.8; // Higher during business hours
    const randomVariation = 0.8 + Math.random() * 0.4; // ±20% variation
    
    const baseMetrics = getBaseMetricsForQueue(queueName);
    
    metrics.push({
      queueName,
      timestamp,
      throughput: {
        jobsPerMinute: baseMetrics.throughput.jobsPerMinute * baseMultiplier * randomVariation,
        jobsPerHour: baseMetrics.throughput.jobsPerHour * baseMultiplier * randomVariation,
        jobsPerDay: baseMetrics.throughput.jobsPerDay * baseMultiplier * randomVariation
      },
      latency: {
        p50: baseMetrics.latency.p50 * (2 - baseMultiplier) * randomVariation,
        p95: baseMetrics.latency.p95 * (2 - baseMultiplier) * randomVariation,
        p99: baseMetrics.latency.p99 * (2 - baseMultiplier) * randomVariation,
        max: baseMetrics.latency.max * (2 - baseMultiplier) * randomVariation
      },
      reliability: {
        successRate: Math.max(85, Math.min(99.9, baseMetrics.reliability.successRate * (0.95 + randomVariation * 0.1))),
        errorRate: Math.max(0.1, Math.min(15, baseMetrics.reliability.errorRate * (2 - baseMultiplier) * randomVariation)),
        retryRate: baseMetrics.reliability.retryRate * randomVariation
      },
      resources: {
        memoryUsage: baseMetrics.resources.memoryUsage * baseMultiplier * randomVariation,
        cpuTime: baseMetrics.resources.cpuTime * baseMultiplier * randomVariation,
        ioOperations: baseMetrics.resources.ioOperations * baseMultiplier * randomVariation
      }
    });
  }
  
  return metrics;
}

function getBaseMetricsForQueue(queueName: string): QueueMetrics {
  const baseMetrics: Record<string, QueueMetrics> = {
    'webhook-processing': {
      queueName: 'webhook-processing',
      timestamp: new Date(),
      throughput: { jobsPerMinute: 125, jobsPerHour: 7500, jobsPerDay: 180000 },
      latency: { p50: 850, p95: 2100, p99: 4500, max: 8000 },
      reliability: { successRate: 98.2, errorRate: 1.8, retryRate: 2.1 },
      resources: { memoryUsage: 256 * 1024 * 1024, cpuTime: 450, ioOperations: 1200 }
    },
    'email-notifications': {
      queueName: 'email-notifications',
      timestamp: new Date(),
      throughput: { jobsPerMinute: 45, jobsPerHour: 2700, jobsPerDay: 64800 },
      latency: { p50: 1200, p95: 3200, p99: 6800, max: 12000 },
      reliability: { successRate: 94.1, errorRate: 5.9, retryRate: 6.2 },
      resources: { memoryUsage: 128 * 1024 * 1024, cpuTime: 680, ioOperations: 890 }
    },
    'image-processing': {
      queueName: 'image-processing',
      timestamp: new Date(),
      throughput: { jobsPerMinute: 12, jobsPerHour: 720, jobsPerDay: 17280 },
      latency: { p50: 5500, p95: 12000, p99: 25000, max: 45000 },
      reliability: { successRate: 87.2, errorRate: 12.8, retryRate: 14.5 },
      resources: { memoryUsage: 512 * 1024 * 1024, cpuTime: 2800, ioOperations: 450 }
    },
    'data-sync': {
      queueName: 'data-sync',
      timestamp: new Date(),
      throughput: { jobsPerMinute: 78, jobsPerHour: 4680, jobsPerDay: 112320 },
      latency: { p50: 650, p95: 1800, p99: 3200, max: 6500 },
      reliability: { successRate: 99.1, errorRate: 0.9, retryRate: 1.2 },
      resources: { memoryUsage: 64 * 1024 * 1024, cpuTime: 320, ioOperations: 780 }
    }
  };
  
  return baseMetrics[queueName] || baseMetrics['webhook-processing'];
}

function generateMockSystemMetrics(timeRange: TimeRange): SystemMetrics[] {
  const metrics: SystemMetrics[] = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
  
  // Generate data points every 5 minutes for the last 24 hours
  for (let time = startTime.getTime(); time <= now.getTime(); time += 5 * 60 * 1000) {
    const timestamp = new Date(time);
    const randomVariation = 0.8 + Math.random() * 0.4;
    
    metrics.push({
      timestamp,
      system: {
        cpuUsage: 25.4 * randomVariation,
        memoryUsage: 4.2 * 1024 * 1024 * 1024 * randomVariation, // 4.2 GB
        diskUsage: 67.8 * randomVariation,
        networkIO: {
          bytesIn: 1024 * 1024 * 150 * randomVariation, // 150 MB
          bytesOut: 1024 * 1024 * 89 * randomVariation   // 89 MB
        }
      },
      redis: {
        memoryUsage: 512 * 1024 * 1024 * randomVariation, // 512 MB
        connections: Math.floor(45 * randomVariation),
        commandsPerSecond: 1250 * randomVariation,
        hitRate: Math.max(85, Math.min(99, 94.5 * randomVariation))
      },
      database: {
        connections: Math.floor(12 * randomVariation),
        queryTime: 15.5 * randomVariation,
        slowQueries: Math.floor(2 * randomVariation)
      }
    });
  }
  
  return metrics;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get('queue');
    const timeRangeParam = searchParams.get('timeRange') || '24h';
    const metricType = searchParams.get('type') || 'queue'; // 'queue' or 'system'
    
    // Parse time range
    const now = new Date();
    let startTime: Date;
    let granularity: 'minute' | 'hour' | 'day' = 'minute';
    
    switch (timeRangeParam) {
      case '1h':
        startTime = new Date(now.getTime() - (60 * 60 * 1000));
        granularity = 'minute';
        break;
      case '24h':
        startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        granularity = 'minute';
        break;
      case '7d':
        startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        granularity = 'hour';
        break;
      case '30d':
        startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        granularity = 'day';
        break;
      default:
        startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        granularity = 'minute';
    }
    
    const timeRange: TimeRange = {
      start: startTime,
      end: now,
      granularity
    };
    
    if (metricType === 'system') {
      const systemMetrics = generateMockSystemMetrics(timeRange);
      return NextResponse.json({
        success: true,
        data: systemMetrics,
        timeRange,
        count: systemMetrics.length
      });
    }
    
    // Queue metrics
    if (queueName && queueName !== 'all') {
      const queueMetrics = generateMockQueueMetrics(queueName, timeRange);
      return NextResponse.json({
        success: true,
        data: queueMetrics,
        timeRange,
        queueName,
        count: queueMetrics.length
      });
    }
    
    // All queues metrics
    const allQueueNames = ['webhook-processing', 'email-notifications', 'image-processing', 'data-sync'];
    const allMetrics: QueueMetrics[] = [];
    
    for (const name of allQueueNames) {
      const queueMetrics = generateMockQueueMetrics(name, timeRange);
      allMetrics.push(...queueMetrics);
    }
    
    return NextResponse.json({
      success: true,
      data: allMetrics,
      timeRange,
      queues: allQueueNames,
      count: allMetrics.length
    });
    
  } catch (error) {
    console.error('Error fetching queue metrics:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'METRICS_FETCH_ERROR',
          message: 'Failed to fetch queue metrics',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, queueName, timeRange, filters } = body;
    
    switch (action) {
      case 'export':
        const { format = 'json' } = body;
        
        // Generate export data
        const exportTimeRange: TimeRange = {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity || 'minute'
        };
        
        let exportData: any;
        if (queueName && queueName !== 'all') {
          exportData = generateMockQueueMetrics(queueName, exportTimeRange);
        } else {
          const allQueueNames = ['webhook-processing', 'email-notifications', 'image-processing', 'data-sync'];
          exportData = [];
          for (const name of allQueueNames) {
            const queueMetrics = generateMockQueueMetrics(name, exportTimeRange);
            exportData.push(...queueMetrics);
          }
        }
        
        if (format === 'csv') {
          // Convert to CSV format
          const csvHeaders = [
            'queueName', 'timestamp', 'jobsPerMinute', 'jobsPerHour', 'jobsPerDay',
            'p50Latency', 'p95Latency', 'p99Latency', 'maxLatency',
            'successRate', 'errorRate', 'retryRate',
            'memoryUsage', 'cpuTime', 'ioOperations'
          ];
          
          const csvRows = exportData.map((metric: QueueMetrics) => [
            metric.queueName,
            metric.timestamp.toISOString(),
            metric.throughput.jobsPerMinute,
            metric.throughput.jobsPerHour,
            metric.throughput.jobsPerDay,
            metric.latency.p50,
            metric.latency.p95,
            metric.latency.p99,
            metric.latency.max,
            metric.reliability.successRate,
            metric.reliability.errorRate,
            metric.reliability.retryRate,
            metric.resources.memoryUsage,
            metric.resources.cpuTime,
            metric.resources.ioOperations
          ]);
          
          const csvContent = [csvHeaders, ...csvRows]
            .map(row => row.join(','))
            .join('\n');
          
          return new NextResponse(csvContent, {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="queue-metrics-${Date.now()}.csv"`
            }
          });
        }
        
        return NextResponse.json({
          success: true,
          data: exportData,
          format,
          exportedAt: new Date().toISOString(),
          count: exportData.length
        });
        
      case 'aggregate':
        const { aggregationType = 'avg', groupBy = 'queue' } = body;
        
        // Generate aggregated data
        const aggregateTimeRange: TimeRange = {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity || 'minute'
        };
        
        const allQueueNames = ['webhook-processing', 'email-notifications', 'image-processing', 'data-sync'];
        const aggregatedData: Record<string, any> = {};
        
        for (const name of allQueueNames) {
          const queueMetrics = generateMockQueueMetrics(name, aggregateTimeRange);
          
          if (queueMetrics.length > 0) {
            const aggregate = {
              queueName: name,
              throughput: {
                avg: queueMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / queueMetrics.length,
                min: Math.min(...queueMetrics.map(m => m.throughput.jobsPerMinute)),
                max: Math.max(...queueMetrics.map(m => m.throughput.jobsPerMinute)),
                total: queueMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0)
              },
              latency: {
                avgP50: queueMetrics.reduce((sum, m) => sum + m.latency.p50, 0) / queueMetrics.length,
                avgP95: queueMetrics.reduce((sum, m) => sum + m.latency.p95, 0) / queueMetrics.length,
                avgP99: queueMetrics.reduce((sum, m) => sum + m.latency.p99, 0) / queueMetrics.length,
                maxLatency: Math.max(...queueMetrics.map(m => m.latency.max))
              },
              reliability: {
                avgSuccessRate: queueMetrics.reduce((sum, m) => sum + m.reliability.successRate, 0) / queueMetrics.length,
                avgErrorRate: queueMetrics.reduce((sum, m) => sum + m.reliability.errorRate, 0) / queueMetrics.length,
                avgRetryRate: queueMetrics.reduce((sum, m) => sum + m.reliability.retryRate, 0) / queueMetrics.length
              },
              dataPoints: queueMetrics.length
            };
            
            aggregatedData[name] = aggregate;
          }
        }
        
        return NextResponse.json({
          success: true,
          data: aggregatedData,
          aggregationType,
          groupBy,
          timeRange: aggregateTimeRange,
          aggregatedAt: new Date().toISOString()
        });
        
      default:
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_ACTION',
              message: `Invalid action: ${action}`,
              supportedActions: ['export', 'aggregate']
            }
          },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error processing metrics request:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'METRICS_PROCESSING_ERROR',
          message: 'Failed to process metrics request',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
}