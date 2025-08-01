'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BarChart3, 
  Download, 
  RefreshCw, 
  TrendingUp,
  Calendar,
  Activity
} from 'lucide-react';
import { QueueMetrics, SystemMetrics, TimeRange } from '@/types/queue-management';
import { MetricsChart } from '../components/MetricsChart';
import { PerformanceDashboard } from '../components/PerformanceDashboard';
import { TrendAnalysis } from '../components/TrendAnalysis';

export default function AnalyticsPage() {
  const [queueMetrics, setQueueMetrics] = useState<QueueMetrics[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convert string timeRange to TimeRange object
  const getTimeRangeObject = (range: '1h' | '24h' | '7d' | '30d'): TimeRange => {
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

  // Fetch metrics data
  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch queue metrics
      const queueResponse = await fetch(
        `/api/admin/queue-management/metrics?queue=${selectedQueue}&timeRange=${timeRange}`
      );
      
      if (!queueResponse.ok) {
        throw new Error('Failed to fetch queue metrics');
      }
      
      const queueData = await queueResponse.json();
      setQueueMetrics(queueData.data || []);

      // Fetch system metrics
      const systemResponse = await fetch(
        `/api/admin/queue-management/metrics?type=system&timeRange=${timeRange}`
      );
      
      if (!systemResponse.ok) {
        throw new Error('Failed to fetch system metrics');
      }
      
      const systemData = await systemResponse.json();
      setSystemMetrics(systemData.data || []);

    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      const response = await fetch(
        `/api/admin/queue-management/analytics?queue=${selectedQueue}&timeRange=${timeRange}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      
      const data = await response.json();
      return data.data;
    } catch (err) {
      console.error('Error fetching analytics:', err);
      return null;
    }
  };

  // Export metrics
  type ExportFormat = 'png' | 'csv' | 'json';
  const handleExport = (format: ExportFormat) => {
    if (format === 'png') return;

    (async () => {
      try {
        const response = await fetch('/api/admin/queue-management/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'export',
            queueName: selectedQueue,
            timeRange: getTimeRangeObject(timeRange),
            format
          })
        });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue-metrics-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue-metrics-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed');
    }
    })();
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedQueue, timeRange]);

  const queueNames = ['all', 'webhook-processing', 'email-notifications', 'image-processing', 'data-sync'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin mr-2" />
        <span>Loading analytics data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p className="font-semibold">Error loading analytics</p>
            <p className="text-sm mt-1">{error}</p>
            <Button onClick={fetchMetrics} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Advanced analytics, performance insights, and trend analysis
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {queueNames.map(name => (
                <SelectItem key={name} value={name}>
                  {name === 'all' ? 'All Queues' : name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 Hour</SelectItem>
              <SelectItem value="24h">24 Hours</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={fetchMetrics} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Select onValueChange={(format: any) => handleExport(format)}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder={<Download className="h-4 w-4" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance" className="flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center">
            <BarChart3 className="h-4 w-4 mr-2" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          <PerformanceDashboard
            queueMetrics={queueMetrics}
            systemMetrics={systemMetrics}
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
            onRefresh={fetchMetrics}
          />
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <TrendAnalysis
            queueMetrics={queueMetrics}
            timeRange={getTimeRangeObject(timeRange)}
            onComparisonPeriodChange={(period) => console.log('Comparison period changed:', period)}
          />
        </TabsContent>

        <TabsContent value="charts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MetricsChart
              data={queueMetrics}
              title="Throughput Analysis"
              metric="throughput"
              timeRange={getTimeRangeObject(timeRange)}
              showComparison={true}
              onExport={handleExport}
            />
            
            <MetricsChart
              data={queueMetrics}
              title="Latency Analysis"
              metric="latency"
              timeRange={getTimeRangeObject(timeRange)}
              showComparison={true}
              onExport={handleExport}
            />
            
            <MetricsChart
              data={queueMetrics}
              title="Reliability Analysis"
              metric="reliability"
              timeRange={getTimeRangeObject(timeRange)}
              showComparison={true}
              onExport={handleExport}
            />
            
            <MetricsChart
              data={queueMetrics}
              title="Resource Usage"
              metric="resources"
              timeRange={getTimeRangeObject(timeRange)}
              showComparison={true}
              onExport={handleExport}
            />
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Data Points:</span>
                    <span className="font-medium">{queueMetrics.length.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Time Range:</span>
                    <span className="font-medium">{timeRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Queues:</span>
                    <span className="font-medium">
                      {selectedQueue === 'all' ? '4 queues' : selectedQueue}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Updated:</span>
                    <span className="font-medium">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {queueMetrics.length > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span>Avg Throughput:</span>
                        <span className="font-medium">
                          {(queueMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / queueMetrics.length).toFixed(1)} jobs/min
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Latency:</span>
                        <span className="font-medium">
                          {(queueMetrics.reduce((sum, m) => sum + m.latency.p50, 0) / queueMetrics.length).toFixed(0)}ms
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Success Rate:</span>
                        <span className="font-medium text-green-600">
                          {(queueMetrics.reduce((sum, m) => sum + m.reliability.successRate, 0) / queueMetrics.length).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Rate:</span>
                        <span className="font-medium text-red-600">
                          {(queueMetrics.reduce((sum, m) => sum + m.reliability.errorRate, 0) / queueMetrics.length).toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button 
                    onClick={() => handleExport('csv')} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button 
                    onClick={() => handleExport('json')} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export JSON
                  </Button>
                  <Button 
                    onClick={fetchMetrics} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}