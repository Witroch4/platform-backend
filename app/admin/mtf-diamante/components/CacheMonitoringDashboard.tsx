'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Separator } from '../../../../components/ui/separator';
import { 
  RefreshCw, 
  Trash2, 
  Thermometer, 
  Activity, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Database,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  lastUpdated: string;
}

interface PerformanceStats {
  hitRate: number;
  errorRate: number;
  averageLatency: number;
  totalRequests: number;
  lastHealthCheck: string;
}

interface CacheHealth {
  isConnected: boolean;
  latency: number;
  memoryUsage?: string;
  lastCheck: string;
}

interface CacheData {
  basicStats: CacheStats;
  performanceStats: PerformanceStats;
  health: CacheHealth;
}

export default function CacheMonitoringDashboard() {
  const [cacheData, setCacheData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState('');
  const [inboxIds, setInboxIds] = useState('');
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  // Fetch cache statistics
  const fetchCacheStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/cache/management?action=stats');
      const result = await response.json();
      
      if (result.success) {
        setCacheData(result.data);
      } else {
        setError(result.error || 'Failed to fetch cache stats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Perform cache operation
  const performCacheOperation = async (action: string, data?: any) => {
    setOperationLoading(action);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/cache/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh stats after operation
        await fetchCacheStats();
      } else {
        setError(result.error || `Failed to ${action}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setOperationLoading(null);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchCacheStats();
    const interval = setInterval(fetchCacheStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const getHealthBadge = (health: CacheHealth) => {
    if (health.isConnected) {
      if (health.latency < 100) {
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Excellent</Badge>;
      } else if (health.latency < 500) {
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Good</Badge>;
      } else {
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Slow</Badge>;
      }
    } else {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Disconnected</Badge>;
    }
  };

  const getHitRateBadge = (hitRate: number) => {
    if (hitRate >= 80) {
      return <Badge variant="default" className="bg-green-500"><TrendingUp className="w-3 h-3 mr-1" />Excellent</Badge>;
    } else if (hitRate >= 60) {
      return <Badge variant="secondary"><Activity className="w-3 h-3 mr-1" />Good</Badge>;
    } else {
      return <Badge variant="destructive"><TrendingDown className="w-3 h-3 mr-1" />Poor</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cache Monitoring Dashboard</h2>
          <p className="text-muted-foreground">Monitor and manage Redis cache performance</p>
        </div>
        <Button 
          onClick={fetchCacheStats} 
          disabled={loading}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="w-4 h-4 mr-2" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {cacheData && (
        <>
          {/* Health Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  {getHealthBadge(cacheData.health)}
                  <span className="text-sm text-muted-foreground">
                    {cacheData.health.latency}ms
                  </span>
                </div>
                {cacheData.health.memoryUsage && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Memory: {cacheData.health.memoryUsage}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hit Rate</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  {getHitRateBadge(cacheData.performanceStats.hitRate)}
                  <span className="text-2xl font-bold">
                    {cacheData.performanceStats.hitRate.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cacheData.basicStats.hits} hits / {cacheData.performanceStats.totalRequests} requests
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Latency</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cacheData.performanceStats.averageLatency.toFixed(1)}ms
                </div>
                <p className="text-xs text-muted-foreground">
                  Error rate: {cacheData.performanceStats.errorRate.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Statistics</CardTitle>
              <CardDescription>Cache performance metrics and counters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{cacheData.basicStats.hits}</div>
                  <div className="text-sm text-muted-foreground">Cache Hits</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{cacheData.basicStats.misses}</div>
                  <div className="text-sm text-muted-foreground">Cache Misses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{cacheData.basicStats.errors}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{cacheData.performanceStats.totalRequests}</div>
                  <div className="text-sm text-muted-foreground">Total Requests</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cache Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Cache Operations</CardTitle>
              <CardDescription>Manage cache warming, invalidation, and maintenance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Global Operations */}
              <div>
                <h4 className="font-medium mb-3">Global Operations</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => performCacheOperation('warm')}
                    disabled={operationLoading === 'warm'}
                    variant="outline"
                  >
                    <Thermometer className="w-4 h-4 mr-2" />
                    {operationLoading === 'warm' ? 'Warming...' : 'Warm Cache'}
                  </Button>
                  
                  <Button
                    onClick={() => performCacheOperation('health-check')}
                    disabled={operationLoading === 'health-check'}
                    variant="outline"
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    {operationLoading === 'health-check' ? 'Checking...' : 'Health Check'}
                  </Button>
                  
                  <Button
                    onClick={() => performCacheOperation('reset-stats')}
                    disabled={operationLoading === 'reset-stats'}
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {operationLoading === 'reset-stats' ? 'Resetting...' : 'Reset Stats'}
                  </Button>
                  
                  <Button
                    onClick={() => {
                      if (confirm('Are you sure you want to clear all cache? This cannot be undone.')) {
                        performCacheOperation('clear');
                      }
                    }}
                    disabled={operationLoading === 'clear'}
                    variant="destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {operationLoading === 'clear' ? 'Clearing...' : 'Clear All'}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Specific Inbox Operations */}
              <div>
                <h4 className="font-medium mb-3">Inbox-Specific Operations</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="single-inbox">Single Inbox ID</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="single-inbox"
                        placeholder="Enter inbox ID (e.g., 4)"
                        value={inboxId}
                        onChange={(e) => setInboxId(e.target.value)}
                      />
                      <Button
                        onClick={() => performCacheOperation('warm', { inboxIds: [inboxId] })}
                        disabled={!inboxId || operationLoading === 'warm-single'}
                        variant="outline"
                        size="sm"
                      >
                        <Thermometer className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => performCacheOperation('invalidate', { inboxId })}
                        disabled={!inboxId || operationLoading === 'invalidate-single'}
                        variant="outline"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="multiple-inboxes">Multiple Inbox IDs</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="multiple-inboxes"
                        placeholder="Enter inbox IDs separated by commas"
                        value={inboxIds}
                        onChange={(e) => setInboxIds(e.target.value)}
                      />
                      <Button
                        onClick={() => {
                          const ids = inboxIds.split(',').map(id => id.trim()).filter(Boolean);
                          performCacheOperation('warm', { inboxIds: ids });
                        }}
                        disabled={!inboxIds || operationLoading === 'warm-multiple'}
                        variant="outline"
                        size="sm"
                      >
                        <Thermometer className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          const ids = inboxIds.split(',').map(id => id.trim()).filter(Boolean);
                          performCacheOperation('invalidate', { inboxIds: ids });
                        }}
                        disabled={!inboxIds || operationLoading === 'invalidate-multiple'}
                        variant="outline"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {loading && !cacheData && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading cache statistics...
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}