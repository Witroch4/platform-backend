'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Pause, 
  Play, 
  RefreshCw, 
  Settings, 
  TrendingUp, 
  XCircle 
} from 'lucide-react';
import { QueueHealth, BatchAction } from '@/types/queue-management';

interface QueueGridProps {
  queues: QueueHealth[];
  onQueueSelect: (queueName: string) => void;
  onBatchAction: (action: BatchAction) => void;
  onRefreshQueue: (queueName: string) => void;
}

export function QueueGrid({ 
  queues, 
  onQueueSelect, 
  onBatchAction, 
  onRefreshQueue 
}: QueueGridProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'border-green-200 bg-green-50';
      case 'warning': return 'border-yellow-200 bg-yellow-50';
      case 'critical': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'healthy': return 'default' as const;
      case 'warning': return 'secondary' as const;
      case 'critical': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const calculateQueueLoad = (queue: QueueHealth) => {
    const total = queue.counts.waiting + queue.counts.active + queue.counts.delayed;
    return total;
  };

  const sortedQueues = [...queues].sort((a, b) => {
    // Sort by status priority (critical first), then by load
    const statusPriority = { critical: 3, warning: 2, healthy: 1 };
    const aPriority = statusPriority[a.status] || 0;
    const bPriority = statusPriority[b.status] || 0;
    
    if (aPriority !== bPriority) return bPriority - aPriority;
    return calculateQueueLoad(b) - calculateQueueLoad(a);
  });

  return (
    <div className="space-y-4">
      {/* Queue Grid Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Queue Overview</h2>
          <p className="text-muted-foreground">
            {queues.length} queues • {queues.filter(q => q.status === 'healthy').length} healthy • 
            {queues.filter(q => q.status === 'warning').length} warning • 
            {queues.filter(q => q.status === 'critical').length} critical
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            
            onClick={() => queues.forEach(q => onRefreshQueue(q.name))}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
        </div>
      </div>

      {/* Queue Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedQueues.map((queue) => {
          const totalJobs = Object.values(queue.counts).reduce((sum, count) => sum + count, 0);
          const activeLoad = queue.counts.waiting + queue.counts.active + queue.counts.delayed;
          
          return (
            <Card 
              key={queue.name} 
              className={`cursor-pointer transition-all hover:shadow-md ${getStatusColor(queue.status)}`}
              onClick={() => onQueueSelect(queue.name)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold truncate">
                    {queue.name}
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(queue.status)}
                    <Badge variant={getStatusBadgeVariant(queue.status)}>
                      {queue.status}
                    </Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last updated: {new Date(queue.lastUpdated).toLocaleTimeString()}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Job Counts */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Waiting</span>
                      <span className="font-medium text-blue-600">
                        {formatNumber(queue.counts.waiting)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active</span>
                      <span className="font-medium text-green-600">
                        {formatNumber(queue.counts.active)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delayed</span>
                      <span className="font-medium text-yellow-600">
                        {formatNumber(queue.counts.delayed)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-medium text-gray-600">
                        {formatNumber(queue.counts.completed)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Failed</span>
                      <span className="font-medium text-red-600">
                        {formatNumber(queue.counts.failed)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium">
                        {formatNumber(totalJobs)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Throughput</span>
                    <span className="font-medium flex items-center">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {queue.performance.throughput.toFixed(1)} jobs/min
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Processing</span>
                    <span className="font-medium">
                      {formatDuration(queue.performance.avgProcessingTime)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className={`font-medium ${queue.performance.successRate >= 95 ? 'text-green-600' : 
                      queue.performance.successRate >= 90 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {queue.performance.successRate.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Success Rate Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Success Rate</span>
                    <span>{queue.performance.successRate.toFixed(1)}%</span>
                  </div>
                  <Progress 
                    value={queue.performance.successRate} 
                    className="h-2"
                  />
                </div>

                {/* Resource Usage */}
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Memory</span>
                    <span>{formatBytes(queue.resources.memoryUsage)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CPU</span>
                    <span>{queue.resources.cpuUsage.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connections</span>
                    <span>{queue.resources.connections}</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex justify-between pt-2 border-t">
                  <div className="flex space-x-1">
                    <Button
                      variant="outline"
                      
                      onClick={(e) => {
                        e.stopPropagation();
                        onBatchAction({ action: 'pause_queue', queueName: queue.name });
                      }}
                      className="h-7 px-2"
                    >
                      <Pause className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      
                      onClick={(e) => {
                        e.stopPropagation();
                        onBatchAction({ action: 'resume_queue', queueName: queue.name });
                      }}
                      className="h-7 px-2"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefreshQueue(queue.name);
                      }}
                      className="h-7 px-2"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Open queue settings
                    }}
                    className="h-7 px-2"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {queues.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Queues Found</h3>
            <p className="text-muted-foreground text-center">
              No queues are currently registered in the system.
              <br />
              Queues will appear here once they are created and registered.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}