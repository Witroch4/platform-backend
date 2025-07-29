'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  Clock, 
  TrendingDown, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { QueueHealth, QueueMetrics } from '@/types/queue-management';

interface MetricsSummaryProps {
  queues: QueueHealth[];
  historicalMetrics?: QueueMetrics[];
  timeRange: '1h' | '24h' | '7d' | '30d';
}

export function MetricsSummary({ 
  queues, 
  historicalMetrics = [], 
  timeRange 
}: MetricsSummaryProps) {
  // Calculate aggregate metrics
  const calculateAggregateMetrics = () => {
    if (queues.length === 0) {
      return {
        totalJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        avgThroughput: 0,
        avgProcessingTime: 0,
        overallSuccessRate: 0,
        overallErrorRate: 0
      };
    }

    const totalJobs = queues.reduce((sum, queue) => 
      sum + Object.values(queue.counts).reduce((qSum, count) => qSum + count, 0), 0
    );

    const activeJobs = queues.reduce((sum, queue) => sum + queue.counts.active, 0);
    const completedJobs = queues.reduce((sum, queue) => sum + queue.counts.completed, 0);
    const failedJobs = queues.reduce((sum, queue) => sum + queue.counts.failed, 0);
    
    const avgThroughput = queues.reduce((sum, queue) => sum + queue.performance.throughput, 0) / queues.length;
    const avgProcessingTime = queues.reduce((sum, queue) => sum + queue.performance.avgProcessingTime, 0) / queues.length;
    
    const totalProcessedJobs = completedJobs + failedJobs;
    const overallSuccessRate = totalProcessedJobs > 0 ? (completedJobs / totalProcessedJobs) * 100 : 0;
    const overallErrorRate = totalProcessedJobs > 0 ? (failedJobs / totalProcessedJobs) * 100 : 0;

    return {
      totalJobs,
      activeJobs,
      completedJobs,
      failedJobs,
      avgThroughput,
      avgProcessingTime,
      overallSuccessRate,
      overallErrorRate
    };
  };

  // Calculate trends from historical data
  const calculateTrends = () => {
    if (historicalMetrics.length < 2) {
      return {
        throughputTrend: 0,
        processingTimeTrend: 0,
        successRateTrend: 0,
        errorRateTrend: 0
      };
    }

    const recent = historicalMetrics.slice(-10); // Last 10 data points
    const older = historicalMetrics.slice(-20, -10); // Previous 10 data points

    const recentAvgThroughput = recent.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / recent.length;
    const olderAvgThroughput = older.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / older.length || 1;
    const throughputTrend = ((recentAvgThroughput - olderAvgThroughput) / olderAvgThroughput) * 100;

    const recentAvgProcessingTime = recent.reduce((sum, m) => sum + m.latency.p50, 0) / recent.length;
    const olderAvgProcessingTime = older.reduce((sum, m) => sum + m.latency.p50, 0) / older.length || 1;
    const processingTimeTrend = ((recentAvgProcessingTime - olderAvgProcessingTime) / olderAvgProcessingTime) * 100;

    const recentAvgSuccessRate = recent.reduce((sum, m) => sum + m.reliability.successRate, 0) / recent.length;
    const olderAvgSuccessRate = older.reduce((sum, m) => sum + m.reliability.successRate, 0) / older.length || 1;
    const successRateTrend = ((recentAvgSuccessRate - olderAvgSuccessRate) / olderAvgSuccessRate) * 100;

    const recentAvgErrorRate = recent.reduce((sum, m) => sum + m.reliability.errorRate, 0) / recent.length;
    const olderAvgErrorRate = older.reduce((sum, m) => sum + m.reliability.errorRate, 0) / older.length || 1;
    const errorRateTrend = ((recentAvgErrorRate - olderAvgErrorRate) / olderAvgErrorRate) * 100;

    return {
      throughputTrend,
      processingTimeTrend,
      successRateTrend,
      errorRateTrend
    };
  };

  const metrics = calculateAggregateMetrics();
  const trends = calculateTrends();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getTrendIcon = (trend: number) => {
    if (Math.abs(trend) < 1) return null;
    return trend > 0 ? 
      <TrendingUp className="h-3 w-3 text-green-600" /> : 
      <TrendingDown className="h-3 w-3 text-red-600" />;
  };

  const getTrendColor = (trend: number, inverse = false) => {
    if (Math.abs(trend) < 1) return 'text-muted-foreground';
    const isPositive = inverse ? trend < 0 : trend > 0;
    return isPositive ? 'text-green-600' : 'text-red-600';
  };

  const getTimeRangeLabel = (range: string) => {
    switch (range) {
      case '1h': return 'Last Hour';
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      default: return 'Current Period';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Metrics Summary</h2>
          <p className="text-muted-foreground">
            Aggregate metrics across all queues • {getTimeRangeLabel(timeRange)}
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {queues.length} Queues
        </Badge>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(metrics.totalJobs)}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <span>Active: {formatNumber(metrics.activeJobs)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Average Throughput */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Throughput</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.avgThroughput.toFixed(1)}
            </div>
            <div className="flex items-center text-xs mt-1">
              {getTrendIcon(trends.throughputTrend)}
              <span className={getTrendColor(trends.throughputTrend)}>
                {Math.abs(trends.throughputTrend).toFixed(1)}% jobs/min
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Average Processing Time */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(metrics.avgProcessingTime)}
            </div>
            <div className="flex items-center text-xs mt-1">
              {getTrendIcon(trends.processingTimeTrend)}
              <span className={getTrendColor(trends.processingTimeTrend, true)}>
                {Math.abs(trends.processingTimeTrend).toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.overallSuccessRate.toFixed(1)}%
            </div>
            <div className="flex items-center text-xs mt-1">
              {getTrendIcon(trends.successRateTrend)}
              <span className={getTrendColor(trends.successRateTrend)}>
                {Math.abs(trends.successRateTrend).toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Job Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Job Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Completed</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(metrics.completedJobs)} ({((metrics.completedJobs / metrics.totalJobs) * 100).toFixed(1)}%)
                  </span>
                </div>
                <Progress 
                  value={(metrics.completedJobs / metrics.totalJobs) * 100} 
                  className="h-2"
                />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Active</span>
                  <span className="font-medium text-blue-600">
                    {formatNumber(metrics.activeJobs)} ({((metrics.activeJobs / metrics.totalJobs) * 100).toFixed(1)}%)
                  </span>
                </div>
                <Progress 
                  value={(metrics.activeJobs / metrics.totalJobs) * 100} 
                  className="h-2"
                />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Failed</span>
                  <span className="font-medium text-red-600">
                    {formatNumber(metrics.failedJobs)} ({((metrics.failedJobs / metrics.totalJobs) * 100).toFixed(1)}%)
                  </span>
                </div>
                <Progress 
                  value={(metrics.failedJobs / metrics.totalJobs) * 100} 
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {metrics.overallSuccessRate.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Error Rate</p>
                <p className="text-2xl font-bold text-red-600">
                  {metrics.overallErrorRate.toFixed(1)}%
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Health</span>
                <span className="font-medium">
                  {metrics.overallSuccessRate >= 95 ? 'Excellent' :
                   metrics.overallSuccessRate >= 90 ? 'Good' :
                   metrics.overallSuccessRate >= 80 ? 'Fair' : 'Poor'}
                </span>
              </div>
              <Progress 
                value={metrics.overallSuccessRate} 
                className="h-2"
              />
            </div>

            {metrics.overallErrorRate > 5 && (
              <div className="flex items-center p-2 bg-red-50 border border-red-200 rounded-md">
                <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-sm text-red-800">
                  High error rate detected. Consider investigating failed jobs.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Queue Health Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Health Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {queues.filter(q => q.status === 'healthy').length}
              </div>
              <p className="text-sm text-muted-foreground">Healthy Queues</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {queues.filter(q => q.status === 'warning').length}
              </div>
              <p className="text-sm text-muted-foreground">Warning Queues</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {queues.filter(q => q.status === 'critical').length}
              </div>
              <p className="text-sm text-muted-foreground">Critical Queues</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}