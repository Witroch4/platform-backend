"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Clock, AlertTriangle } from "lucide-react";

interface QueueMetrics {
  queueName: string;
  displayName: string;
  totalJobs: number;
  successRate: number;
  avgProcessingTime: number;
  throughput: number;
  errorRate: number;
  peakHours: string[];
  trends: {
    period: string;
    jobs: number;
    success: number;
    avgTime: number;
  }[];
}

export default function QueueStats() {
  const [metrics, setMetrics] = useState<QueueMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("24h");
  const [selectedQueue, setSelectedQueue] = useState("all");

  useEffect(() => {
    fetchMetrics();
  }, [timeRange, selectedQueue]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/ai-integration/queues/metrics?range=${timeRange}&queue=${selectedQueue}`
      );
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics || []);
      }
    } catch (error) {
      console.error("Error fetching queue metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOverallStats = () => {
    if (metrics.length === 0) return null;

    const totalJobs = metrics.reduce((sum, m) => sum + m.totalJobs, 0);
    const avgSuccessRate = metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;
    const avgProcessingTime = metrics.reduce((sum, m) => sum + m.avgProcessingTime, 0) / metrics.length;
    const totalThroughput = metrics.reduce((sum, m) => sum + m.throughput, 0);

    return {
      totalJobs,
      avgSuccessRate,
      avgProcessingTime,
      totalThroughput,
    };
  };

  const overallStats = getOverallStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Queue Statistics</h2>
        <div className="flex items-center gap-4">
          <Select value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Queues</SelectItem>
              <SelectItem value="ai:incoming-message">Incoming Messages</SelectItem>
              <SelectItem value="ai:embedding-upsert">Embedding Upsert</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall Statistics */}
      {overallStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Jobs</p>
                  <p className="text-2xl font-bold">{overallStats.totalJobs.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold">{(overallStats.avgSuccessRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Avg Processing Time</p>
                  <p className="text-2xl font-bold">{Math.round(overallStats.avgProcessingTime)}ms</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Throughput</p>
                  <p className="text-2xl font-bold">{overallStats.totalThroughput}/min</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Queue Metrics */}
      <div className="grid gap-6">
        {metrics.map((metric) => (
          <Card key={metric.queueName}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{metric.displayName}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600">Error Rate: {(metric.errorRate * 100).toFixed(1)}%</span>
                  <span className="text-gray-600">Peak: {metric.peakHours.join(", ")}</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{metric.totalJobs.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Total Jobs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{(metric.successRate * 100).toFixed(1)}%</p>
                  <p className="text-sm text-gray-600">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{Math.round(metric.avgProcessingTime)}ms</p>
                  <p className="text-sm text-gray-600">Avg Time</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{metric.throughput}/min</p>
                  <p className="text-sm text-gray-600">Throughput</p>
                </div>
              </div>

              {/* Trends Chart (Simplified) */}
              <div>
                <h4 className="font-medium mb-3">Processing Trends</h4>
                <div className="space-y-2">
                  {metric.trends.slice(0, 10).map((trend, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm font-medium">{trend.period}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span>{trend.jobs} jobs</span>
                        <span className="text-green-600">{trend.success} success</span>
                        <span className="text-gray-600">{trend.avgTime}ms avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {metrics.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No metrics data available for the selected period</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}