'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  RefreshCw, 
  Settings 
} from 'lucide-react';
import { 
  QueueHealth, 
  SystemMetrics, 
  JobAction, 
  BatchAction, 
  QueueMetrics 
} from '@/types/queue-management';
import { SystemOverview } from './components/SystemOverview';
import { QueueGrid } from './components/QueueGrid';
import { MetricsSummary } from './components/MetricsSummary';
import { QueueDetails } from './components/QueueDetails';
import { MetricsChart } from './components/MetricsChart';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { TrendAnalysis } from './components/TrendAnalysis';
import { AlertCenter } from './components/AlertCenter';
import { AlertConfiguration } from './components/AlertConfiguration';
import { WebSocketProvider } from './components/WebSocketProvider';

export default function QueueManagementDashboard() {
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [historicalMetrics, setHistoricalMetrics] = useState<QueueMetrics[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  
  // Convert string timeRange to TimeRange object
  const getTimeRangeObject = (range: '1h' | '24h' | '7d' | '30d') => {
    const now = new Date();
    let start: Date;
    let granularity: 'minute' | 'hour' | 'day' = 'minute';
    
    switch (range) {
      case '1h':
        start = new Date(now.getTime() - (60 * 60 * 1000));
        granularity = 'minute';
        break;
      case '24h':
        start = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        granularity = 'minute';
        break;
      case '7d':
        start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        granularity = 'hour';
        break;
      case '30d':
        start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        granularity = 'day';
        break;
    }
    
    return { start, end: now, granularity };
  };
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertRules, setAlertRules] = useState<any[]>([]);

  // Generate mock historical metrics
  const generateMockHistoricalMetrics = () => {
    const metrics: QueueMetrics[] = [];
    const now = new Date();
    const queueNames = ['webhook-processing', 'email-notifications', 'image-processing', 'data-sync'];
    
    // Generate data for the last 24 hours, every 5 minutes
    for (let i = 0; i < 288; i++) { // 24 hours * 12 (5-minute intervals)
      const timestamp = new Date(now.getTime() - (i * 5 * 60 * 1000));
      
      queueNames.forEach(queueName => {
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
      });
    }
    
    return metrics.reverse(); // Reverse to have chronological order
  };

  const getBaseMetricsForQueue = (queueName: string): QueueMetrics => {
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
  };

  // Mock data for demonstration
  const generateMockData = () => {
    const mockQueues: QueueHealth[] = [
      {
        name: 'webhook-processing',
        status: 'healthy',
        counts: {
          waiting: 45,
          active: 12,
          completed: 1250,
          failed: 8,
          delayed: 3
        },
        performance: {
          throughput: 125.5,
          avgProcessingTime: 850,
          successRate: 98.2,
          errorRate: 1.8
        },
        resources: {
          memoryUsage: 256 * 1024 * 1024,
          cpuUsage: 15.5,
          connections: 8
        },
        lastUpdated: new Date()
      },
      {
        name: 'email-notifications',
        status: 'warning',
        counts: {
          waiting: 156,
          active: 5,
          completed: 890,
          failed: 23,
          delayed: 12
        },
        performance: {
          throughput: 45.2,
          avgProcessingTime: 1200,
          successRate: 94.1,
          errorRate: 5.9
        },
        resources: {
          memoryUsage: 128 * 1024 * 1024,
          cpuUsage: 8.2,
          connections: 4
        },
        lastUpdated: new Date()
      },
      {
        name: 'image-processing',
        status: 'critical',
        counts: {
          waiting: 234,
          active: 2,
          completed: 456,
          failed: 67,
          delayed: 45
        },
        performance: {
          throughput: 12.8,
          avgProcessingTime: 5500,
          successRate: 87.2,
          errorRate: 12.8
        },
        resources: {
          memoryUsage: 512 * 1024 * 1024,
          cpuUsage: 45.8,
          connections: 12
        },
        lastUpdated: new Date()
      },
      {
        name: 'data-sync',
        status: 'healthy',
        counts: {
          waiting: 12,
          active: 3,
          completed: 2340,
          failed: 5,
          delayed: 1
        },
        performance: {
          throughput: 78.9,
          avgProcessingTime: 650,
          successRate: 99.1,
          errorRate: 0.9
        },
        resources: {
          memoryUsage: 64 * 1024 * 1024,
          cpuUsage: 5.2,
          connections: 2
        },
        lastUpdated: new Date()
      }
    ];

    const mockSystemMetrics: SystemMetrics = {
      timestamp: new Date(),
      system: {
        cpuUsage: 25.4,
        memoryUsage: 4.2 * 1024 * 1024 * 1024, // 4.2 GB
        diskUsage: 67.8,
        networkIO: {
          bytesIn: 1024 * 1024 * 150, // 150 MB
          bytesOut: 1024 * 1024 * 89   // 89 MB
        }
      },
      redis: {
        memoryUsage: 512 * 1024 * 1024, // 512 MB
        connections: 45,
        commandsPerSecond: 1250,
        hitRate: 94.5
      },
      database: {
        connections: 12,
        queryTime: 15.5,
        slowQueries: 2
      }
    };

    // Mock alerts data
    const mockAlerts = [
      {
        id: 'alert-1',
        ruleId: 'rule-1',
        queueName: 'webhook-processing',
        severity: 'warning' as const,
        title: 'High Queue Backlog',
        message: 'Queue has accumulated over 100 waiting jobs',
        metrics: {
          waitingJobs: 156,
          throughput: 45.2,
          avgProcessingTime: 1200
        },
        status: 'active' as const,
        createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
      },
      {
        id: 'alert-2',
        ruleId: 'rule-2',
        queueName: 'image-processing',
        severity: 'critical' as const,
        title: 'High Error Rate',
        message: 'Error rate has exceeded 10% in the last 10 minutes',
        metrics: {
          errorRate: 12.8,
          failedJobs: 67,
          successRate: 87.2
        },
        status: 'active' as const,
        createdAt: new Date(Date.now() - 1000 * 60 * 8), // 8 minutes ago
      }
    ];

    // Mock alert rules data
    const mockAlertRules = [
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
            config: { recipients: ['admin@example.com'] }
          }
        ],
        cooldown: 5,
        enabled: true,
        createdBy: 'admin@example.com'
      }
    ];

    setQueues(mockQueues);
    setSystemMetrics(mockSystemMetrics);
    setHistoricalMetrics(generateMockHistoricalMetrics());
    setAlerts(mockAlerts);
    setAlertRules(mockAlertRules);
    setLoading(false);
  };

  useEffect(() => {
    generateMockData();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        generateMockData();
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleQueueSelect = (queueName: string) => {
    setSelectedQueue(queueName);
  };

  const handleJobAction = async (action: JobAction) => {
    try {
      console.log('Job action:', action);
      // TODO: Implement actual API call
      // await fetch('/api/admin/queue-management/jobs/action', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(action)
      // });
    } catch (error) {
      console.error('Job action failed:', error);
      setError('Failed to execute job action');
    }
  };

  const handleBatchAction = async (action: BatchAction) => {
    try {
      console.log('Batch action:', action);
      // TODO: Implement actual API call
      // await fetch('/api/admin/queue-management/queues/action', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(action)
      // });
    } catch (error) {
      console.error('Batch action failed:', error);
      setError('Failed to execute batch action');
    }
  };

  const handleRefreshQueue = (queueName: string) => {
    console.log('Refreshing queue:', queueName);
    generateMockData();
  };

  const handleRefreshAll = () => {
    generateMockData();
  };

  // Alert handling functions
  const handleAcknowledgeAlert = async (alertId: string, note?: string) => {
    try {
      const response = await fetch('/api/admin/queue-management/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'acknowledge', note })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId 
            ? { ...alert, status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: 'current-user' }
            : alert
        ));
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      setError('Failed to acknowledge alert');
    }
  };

  const handleResolveAlert = async (alertId: string, note?: string) => {
    try {
      const response = await fetch('/api/admin/queue-management/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'resolve', note })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId 
            ? { ...alert, status: 'resolved', resolvedAt: new Date() }
            : alert
        ));
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
      setError('Failed to resolve alert');
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/admin/queue-management/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'dismiss' })
      });
      
      if (response.ok) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
      setError('Failed to dismiss alert');
    }
  };

  // Alert rule handling functions
  const handleCreateAlertRule = async (rule: any) => {
    try {
      const response = await fetch('/api/admin/queue-management/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      });
      
      if (response.ok) {
        const result = await response.json();
        setAlertRules(prev => [...prev, result.rule]);
      }
    } catch (error) {
      console.error('Failed to create alert rule:', error);
      setError('Failed to create alert rule');
    }
  };

  const handleUpdateAlertRule = async (id: string, updates: any) => {
    try {
      const response = await fetch('/api/admin/queue-management/alert-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAlertRules(prev => prev.map(rule => 
          rule.id === id ? result.rule : rule
        ));
      }
    } catch (error) {
      console.error('Failed to update alert rule:', error);
      setError('Failed to update alert rule');
    }
  };

  const handleDeleteAlertRule = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/queue-management/alert-rules?id=${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setAlertRules(prev => prev.filter(rule => rule.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete alert rule:', error);
      setError('Failed to delete alert rule');
    }
  };

  const handleTestAlertRule = async (rule: any) => {
    console.log('Testing alert rule:', rule);
    // TODO: Implement rule testing
  };

  const selectedQueueData = selectedQueue ? 
    queues.find(q => q.name === selectedQueue) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin mr-2" />
        <span>Loading queue management dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // If a queue is selected, show queue details
  if (selectedQueue && selectedQueueData) {
    return (
      <QueueDetails
        queueName={selectedQueue}
        queueHealth={selectedQueueData}
        realTimeUpdates={realTimeUpdates}
        onJobAction={handleJobAction}
        onBatchAction={handleBatchAction}
        onBack={() => setSelectedQueue(null)}
        onToggleRealTime={() => setRealTimeUpdates(!realTimeUpdates)}
      />
    );
  }

  return (
    <WebSocketProvider userId="current-user">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue Management</h1>
          <p className="text-muted-foreground">
            Advanced BullMQ queue monitoring and management dashboard
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-1 border rounded-md"
          >
            <option value="1h">1 Hour</option>
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
          </select>
          <Button onClick={handleRefreshAll} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* System Overview */}
      {systemMetrics && (
        <SystemOverview
          queues={queues}
          systemMetrics={systemMetrics}
          uptime={86400 * 15 + 3600 * 8 + 60 * 45} // 15 days, 8 hours, 45 minutes
          version="1.0.0"
          environment="production"
        />
      )}

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="alert-config">Alert Config</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <MetricsSummary
            queues={queues}
            historicalMetrics={historicalMetrics}
            timeRange={getTimeRangeObject(timeRange)}
          />
          
          <QueueGrid
            queues={queues}
            onQueueSelect={handleQueueSelect}
            onBatchAction={handleBatchAction}
            onRefreshQueue={handleRefreshQueue}
          />
        </TabsContent>

        <TabsContent value="queues" className="space-y-6">
          <QueueGrid
            queues={queues}
            onQueueSelect={handleQueueSelect}
            onBatchAction={handleBatchAction}
            onRefreshQueue={handleRefreshQueue}
          />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6">
          <MetricsSummary
            queues={queues}
            historicalMetrics={historicalMetrics}
            timeRange={getTimeRangeObject(timeRange)}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <PerformanceDashboard
            queueMetrics={historicalMetrics}
            systemMetrics={systemMetrics ? [systemMetrics] : []}
            timeRange={getTimeRangeObject(timeRange)}
            onTimeRangeChange={(range) => {
              // Convert TimeRange back to string for state
              const now = new Date();
              const diffHours = (now.getTime() - range.start.getTime()) / (1000 * 60 * 60);
              if (diffHours <= 1) setTimeRange('1h');
              else if (diffHours <= 24) setTimeRange('24h');
              else if (diffHours <= 7 * 24) setTimeRange('7d');
              else setTimeRange('30d');
            }}
            onRefresh={generateMockData}
          />
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <TrendAnalysis
            queueMetrics={historicalMetrics}
            timeRange={getTimeRangeObject(timeRange)}
            onComparisonPeriodChange={(period) => console.log('Comparison period changed:', period)}
          />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <AlertCenter
            alerts={alerts}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onResolveAlert={handleResolveAlert}
            onDismissAlert={handleDismissAlert}
            onRefresh={generateMockData}
            realTimeUpdates={realTimeUpdates}
            onToggleRealTime={() => setRealTimeUpdates(!realTimeUpdates)}
          />
        </TabsContent>

        <TabsContent value="alert-config" className="space-y-6">
          <AlertConfiguration
            alertRules={alertRules}
            queueNames={queues.map(q => q.name)}
            onCreateRule={handleCreateAlertRule}
            onUpdateRule={handleUpdateAlertRule}
            onDeleteRule={handleDeleteAlertRule}
            onTestRule={handleTestAlertRule}
          />
        </TabsContent>
      </Tabs>
      </div>
    </WebSocketProvider>
  );
}