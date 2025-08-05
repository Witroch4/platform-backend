"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Target, Clock } from "lucide-react";

interface IntentStats {
  intentId: string;
  intentName: string;
  totalHits: number;
  successfulMatches: number;
  averageConfidence: number;
  lastUsed: string;
}

interface AnalyticsData {
  totalClassifications: number;
  successRate: number;
  averageProcessingTime: number;
  topIntents: IntentStats[];
  confidenceDistribution: {
    range: string;
    count: number;
  }[];
  dailyStats: {
    date: string;
    classifications: number;
    matches: number;
  }[];
}

export default function IntentAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/ai-integration/intents/analytics?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">No analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Intent Analytics</h2>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Classifications</p>
                <p className="text-2xl font-bold">{analytics.totalClassifications.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold">{(analytics.successRate * 100).toFixed(1)}%</p>
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
                <p className="text-2xl font-bold">{analytics.averageProcessingTime}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Active Intents</p>
                <p className="text-2xl font-bold">{analytics.topIntents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Intents */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Intents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.topIntents.map((intent, index) => (
              <div key={intent.intentId} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-600">#{index + 1}</span>
                  </div>
                  <div>
                    <p className="font-medium">{intent.intentName}</p>
                    <p className="text-sm text-gray-600">
                      Last used: {new Date(intent.lastUsed).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{intent.totalHits}</p>
                    <p className="text-gray-600">Total Hits</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{intent.successfulMatches}</p>
                    <p className="text-gray-600">Matches</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{(intent.averageConfidence * 100).toFixed(1)}%</p>
                    <p className="text-gray-600">Avg Confidence</p>
                  </div>
                  <Badge variant={intent.averageConfidence >= 0.8 ? "default" : "secondary"}>
                    {intent.averageConfidence >= 0.8 ? "High" : "Medium"} Confidence
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confidence Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Confidence Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.confidenceDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-20 text-sm font-medium">{item.range}</div>
                <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                  <div 
                    className="bg-blue-600 h-4 rounded-full"
                    style={{ 
                      width: `${(item.count / Math.max(...analytics.confidenceDistribution.map(d => d.count))) * 100}%` 
                    }}
                  />
                </div>
                <div className="w-16 text-sm text-gray-600 text-right">
                  {item.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Classification Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analytics.dailyStats.map((day, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded">
                <div className="font-medium">
                  {new Date(day.date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>{day.classifications} classifications</span>
                  <span>{day.matches} matches</span>
                  <Badge variant="outline">
                    {day.classifications > 0 ? ((day.matches / day.classifications) * 100).toFixed(1) : 0}% success
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}