'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  AlertTriangle, 
  ArrowLeft, 
  CheckCircle, 
  Clock, 
  Pause, 
  Play, 
  RefreshCw, 
  Settings, 
  Trash2, 
  TrendingUp, 
  XCircle 
} from 'lucide-react';
import { QueueHealth, JobAction, BatchAction } from '@/types/queue-management';
import { JobList } from './JobList';

interface QueueDetailsProps {
  queueName: string;
  queueHealth: QueueHealth;
  realTimeUpdates: boolean;
  onJobAction: (action: JobAction) => void;
  onBatchAction: (action: BatchAction) => void;
  onBack: () => void;
  onToggleRealTime: () => void;
}

export function QueueDetails({ 
  queueName, 
  queueHealth, 
  realTimeUpdates, 
  onJobAction, 
  onBatchAction, 
  onBack,
  onToggleRealTime
}: QueueDetailsProps) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const totalJobs = Object.values(queueHealth.counts).reduce((sum, count) => sum + count, 0);
  const activeLoad = queueHealth.counts.waiting + queueHealth.counts.active + queueHealth.counts.delayed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline"  onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold">{queueName}</h1>
              {getStatusIcon(queueHealth.status)}
              <Badge variant={queueHealth.status === 'healthy' ? 'default' : 
                             queueHealth.status === 'warning' ? 'secondary' : 'destructive'}>
                {queueHealth.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Last updated: {new Date(queueHealth.lastUpdated).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            
            onClick={onToggleRealTime}
            className={realTimeUpdates ? 'bg-green-50 border-green-200' : ''}
          >
            <Activity className={`h-4 w-4 mr-2 ${realTimeUpdates ? 'text-green-600' : ''}`} />
            Real-time: {realTimeUpdates ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="outline"
            
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Waiting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(queueHealth.counts.waiting)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(queueHealth.counts.active)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(queueHealth.counts.completed)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(queueHealth.counts.failed)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Delayed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(queueHealth.counts.delayed)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Performance and Resource Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Throughput</p>
                <p className="text-2xl font-bold">{queueHealth.performance.throughput.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">jobs/min</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Processing</p>
                <p className="text-2xl font-bold">{formatDuration(queueHealth.performance.avgProcessingTime)}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Success Rate</span>
                  <span className="font-medium">{queueHealth.performance.successRate.toFixed(1)}%</span>
                </div>
                <Progress value={queueHealth.performance.successRate} className="h-2" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Error Rate</span>
                  <span className="font-medium text-red-600">{queueHealth.performance.errorRate.toFixed(1)}%</span>
                </div>
                <Progress value={queueHealth.performance.errorRate} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Resource Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Memory Usage</span>
                  <span className="font-medium">{formatBytes(queueHealth.resources.memoryUsage)}</span>
                </div>
                <Progress value={(queueHealth.resources.memoryUsage / (1024 * 1024 * 1024)) * 100} className="h-2" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>CPU Usage</span>
                  <span className="font-medium">{queueHealth.resources.cpuUsage.toFixed(1)}%</span>
                </div>
                <Progress value={queueHealth.resources.cpuUsage} className="h-2" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm">
                  <span>Active Connections</span>
                  <span className="font-medium">{queueHealth.resources.connections}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => onBatchAction({ action: 'pause_queue', queueName })}
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause Queue
            </Button>
            <Button
              variant="outline"
              onClick={() => onBatchAction({ action: 'resume_queue', queueName })}
            >
              <Play className="h-4 w-4 mr-2" />
              Resume Queue
            </Button>
            <Button
              variant="outline"
              onClick={() => onBatchAction({ action: 'retry_all_failed', queueName })}
              disabled={queueHealth.counts.failed === 0}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry All Failed ({queueHealth.counts.failed})
            </Button>
            <Button
              variant="outline"
              onClick={() => onBatchAction({ 
                action: 'clean_completed', 
                queueName, 
                options: { olderThan: 24 * 60 * 60 * 1000 } 
              })}
              disabled={queueHealth.counts.completed === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clean Completed (24h+)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="waiting">
            Waiting ({formatNumber(queueHealth.counts.waiting)})
          </TabsTrigger>
          <TabsTrigger value="active">
            Active ({formatNumber(queueHealth.counts.active)})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({formatNumber(queueHealth.counts.completed)})
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed ({formatNumber(queueHealth.counts.failed)})
          </TabsTrigger>
          <TabsTrigger value="delayed">
            Delayed ({formatNumber(queueHealth.counts.delayed)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Queue Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Job Distribution</h4>
                  <div className="space-y-2">
                    {Object.entries(queueHealth.counts).map(([status, count]) => (
                      <div key={status} className="flex justify-between text-sm">
                        <span className="capitalize">{status}</span>
                        <span className="font-medium">
                          {formatNumber(count)} ({((count / totalJobs) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3">Health Indicators</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Overall Status</span>
                      <span className={`font-medium ${getStatusColor(queueHealth.status)}`}>
                        {queueHealth.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Load</span>
                      <span className="font-medium">{formatNumber(activeLoad)} jobs</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Processed</span>
                      <span className="font-medium">{formatNumber(totalJobs)} jobs</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waiting">
          <JobList
            queueName={queueName}
            state="waiting"
            onJobAction={onJobAction}
            onBatchAction={onBatchAction}
          />
        </TabsContent>

        <TabsContent value="active">
          <JobList
            queueName={queueName}
            state="active"
            onJobAction={onJobAction}
            onBatchAction={onBatchAction}
          />
        </TabsContent>

        <TabsContent value="completed">
          <JobList
            queueName={queueName}
            state="completed"
            onJobAction={onJobAction}
            onBatchAction={onBatchAction}
          />
        </TabsContent>

        <TabsContent value="failed">
          <JobList
            queueName={queueName}
            state="failed"
            onJobAction={onJobAction}
            onBatchAction={onBatchAction}
          />
        </TabsContent>

        <TabsContent value="delayed">
          <JobList
            queueName={queueName}
            state="delayed"
            onJobAction={onJobAction}
            onBatchAction={onBatchAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}