'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  TrendingUp, 
  Download, 
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { MetricsChartData, QueueMetrics, TimeRange } from '@/types/queue-management';

interface MetricsChartProps {
  data: QueueMetrics[];
  title: string;
  metric: 'throughput' | 'latency' | 'reliability' | 'resources';
  timeRange: TimeRange;
  chartType?: 'line' | 'bar' | 'area' | 'pie';
  showComparison?: boolean;
  onExport?: (format: 'png' | 'csv' | 'json') => void;
}

export function MetricsChart({ 
  data, 
  title, 
  metric, 
  timeRange, 
  chartType = 'line',
  showComparison = false,
  onExport 
}: MetricsChartProps) {
  const [selectedChartType, setSelectedChartType] = useState(chartType);
  const [selectedSubMetric, setSelectedSubMetric] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Process data based on metric type
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    const processedData: MetricsChartData[] = [];

    switch (metric) {
      case 'throughput':
        processedData.push({
          title: 'Jobs per Minute',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.throughput.jobsPerMinute,
            label: d.queueName
          })),
          unit: 'jobs/min',
          color: '#3b82f6'
        });
        
        if (showComparison) {
          processedData.push({
            title: 'Jobs per Hour',
            data: data.map(d => ({
              timestamp: d.timestamp,
              value: d.throughput.jobsPerHour,
              label: d.queueName
            })),
            unit: 'jobs/hr',
            color: '#10b981'
          });
        }
        break;

      case 'latency':
        processedData.push({
          title: 'P50 Latency',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.latency.p50,
            label: d.queueName
          })),
          unit: 'ms',
          color: '#f59e0b'
        });
        
        if (showComparison) {
          processedData.push({
            title: 'P95 Latency',
            data: data.map(d => ({
              timestamp: d.timestamp,
              value: d.latency.p95,
              label: d.queueName
            })),
            unit: 'ms',
            color: '#ef4444'
          });
          
          processedData.push({
            title: 'P99 Latency',
            data: data.map(d => ({
              timestamp: d.timestamp,
              value: d.latency.p99,
              label: d.queueName
            })),
            unit: 'ms',
            color: '#8b5cf6'
          });
        }
        break;

      case 'reliability':
        processedData.push({
          title: 'Success Rate',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.reliability.successRate,
            label: d.queueName
          })),
          unit: '%',
          color: '#10b981'
        });
        
        processedData.push({
          title: 'Error Rate',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.reliability.errorRate,
            label: d.queueName
          })),
          unit: '%',
          color: '#ef4444'
        });
        break;

      case 'resources':
        processedData.push({
          title: 'Memory Usage',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.resources.memoryUsage / (1024 * 1024), // Convert to MB
            label: d.queueName
          })),
          unit: 'MB',
          color: '#3b82f6'
        });
        
        processedData.push({
          title: 'CPU Time',
          data: data.map(d => ({
            timestamp: d.timestamp,
            value: d.resources.cpuTime,
            label: d.queueName
          })),
          unit: 'ms',
          color: '#f59e0b'
        });
        break;
    }

    return processedData;
  }, [data, metric, showComparison]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (chartData.length === 0) return null;

    const primaryData = chartData[0];
    const values = primaryData.data.map(d => d.value);
    
    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const latest = values[values.length - 1];
    const previous = values[values.length - 2];
    const trend = previous ? ((latest - previous) / previous) * 100 : 0;

    return {
      min,
      max,
      avg,
      latest,
      trend,
      unit: primaryData.unit
    };
  }, [chartData]);

  // Generate SVG chart based on type
  const renderChart = (chartData: MetricsChartData, width = 800, height = 300) => {
    if (chartData.data.length === 0) return null;

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const values = chartData.data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;

    const timeValues = chartData.data.map(d => d.timestamp.getTime());
    const minTime = Math.min(...timeValues);
    const maxTime = Math.max(...timeValues);
    const timeRange = maxTime - minTime || 1;

    const getX = (timestamp: Date) => 
      ((timestamp.getTime() - minTime) / timeRange) * chartWidth;
    
    const getY = (value: number) => 
      chartHeight - ((value - minValue) / valueRange) * chartHeight;

    switch (selectedChartType) {
      case 'line':
      case 'area':
        const pathData = chartData.data
          .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.timestamp)} ${getY(d.value)}`)
          .join(' ');

        return (
          <svg width={width} height={height} className="overflow-visible">
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <g key={ratio}>
                  <line
                    x1={0}
                    y1={chartHeight * ratio}
                    x2={chartWidth}
                    y2={chartHeight * ratio}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                  <text
                    x={-10}
                    y={chartHeight * ratio + 4}
                    textAnchor="end"
                    className="text-xs fill-gray-500"
                  >
                    {(minValue + (maxValue - minValue) * (1 - ratio)).toFixed(1)}
                  </text>
                </g>
              ))}
              
              {/* Area fill for area chart */}
              {selectedChartType === 'area' && (
                <path
                  d={`${pathData} L ${getX(chartData.data[chartData.data.length - 1].timestamp)} ${chartHeight} L ${getX(chartData.data[0].timestamp)} ${chartHeight} Z`}
                  fill={chartData.color}
                  fillOpacity={0.2}
                />
              )}
              
              {/* Line */}
              <path
                d={pathData}
                fill="none"
                stroke={chartData.color}
                strokeWidth={2}
              />
              
              {/* Data points */}
              {chartData.data.map((d, i) => (
                <circle
                  key={i}
                  cx={getX(d.timestamp)}
                  cy={getY(d.value)}
                  r={3}
                  fill={chartData.color}
                  className="hover:r-5 cursor-pointer"
                >
                  <title>{`${d.timestamp.toLocaleString()}: ${d.value.toFixed(2)} ${chartData.unit}`}</title>
                </circle>
              ))}
              
              {/* X-axis labels */}
              {chartData.data.filter((_, i) => i % Math.ceil(chartData.data.length / 5) === 0).map((d, i) => (
                <text
                  key={i}
                  x={getX(d.timestamp)}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-500"
                >
                  {d.timestamp.toLocaleTimeString()}
                </text>
              ))}
            </g>
          </svg>
        );

      case 'bar':
        const barWidth = chartWidth / chartData.data.length * 0.8;
        
        return (
          <svg width={width} height={height} className="overflow-visible">
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <line
                  key={ratio}
                  x1={0}
                  y1={chartHeight * ratio}
                  x2={chartWidth}
                  y2={chartHeight * ratio}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
              ))}
              
              {/* Bars */}
              {chartData.data.map((d, i) => {
                const x = (i / chartData.data.length) * chartWidth + (chartWidth / chartData.data.length - barWidth) / 2;
                const barHeight = ((d.value - minValue) / valueRange) * chartHeight;
                
                return (
                  <rect
                    key={i}
                    x={x}
                    y={chartHeight - barHeight}
                    width={barWidth}
                    height={barHeight}
                    fill={chartData.color}
                    className="hover:opacity-80 cursor-pointer"
                  >
                    <title>{`${d.timestamp.toLocaleString()}: ${d.value.toFixed(2)} ${chartData.unit}`}</title>
                  </rect>
                );
              })}
            </g>
          </svg>
        );

      default:
        return null;
    }
  };

  const getAvailableSubMetrics = () => {
    switch (metric) {
      case 'throughput':
        return [
          { value: 'jobsPerMinute', label: 'Jobs/Min' },
          { value: 'jobsPerHour', label: 'Jobs/Hour' },
          { value: 'jobsPerDay', label: 'Jobs/Day' }
        ];
      case 'latency':
        return [
          { value: 'p50', label: 'P50' },
          { value: 'p95', label: 'P95' },
          { value: 'p99', label: 'P99' },
          { value: 'max', label: 'Max' }
        ];
      case 'reliability':
        return [
          { value: 'successRate', label: 'Success Rate' },
          { value: 'errorRate', label: 'Error Rate' },
          { value: 'retryRate', label: 'Retry Rate' }
        ];
      case 'resources':
        return [
          { value: 'memoryUsage', label: 'Memory' },
          { value: 'cpuTime', label: 'CPU Time' },
          { value: 'ioOperations', label: 'I/O Ops' }
        ];
      default:
        return [];
    }
  };

  return (
    <Card className={isFullscreen ? 'fixed inset-4 z-50 overflow-auto' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CardTitle>{title}</CardTitle>
            {statistics && (
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  Latest: {statistics.latest.toFixed(2)} {statistics.unit}
                </Badge>
                <Badge variant={statistics.trend >= 0 ? 'default' : 'destructive'}>
                  {statistics.trend >= 0 ? '+' : ''}{statistics.trend.toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Select value={selectedChartType} onValueChange={(value: any) => setSelectedChartType(value)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="area">Area</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectContent>
            </Select>
            
            {getAvailableSubMetrics().length > 0 && (
              <Select value={selectedSubMetric} onValueChange={setSelectedSubMetric}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sub-metric" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableSubMetrics().map(subMetric => (
                    <SelectItem key={subMetric.value} value={subMetric.value}>
                      {subMetric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button
              variant="outline"
              
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            
            {onExport && (
              <Select onValueChange={(format: any) => onExport(format)}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder={<Download className="h-4 w-4" />} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        
        {/* Statistics Summary */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div className="text-center">
              <div className="text-lg font-bold">{statistics.latest.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Current</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{statistics.avg.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Average</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{statistics.min.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Minimum</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{statistics.max.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Maximum</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold flex items-center justify-center ${
                statistics.trend >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className={`h-4 w-4 mr-1 ${statistics.trend < 0 ? 'rotate-180' : ''}`} />
                {Math.abs(statistics.trend).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Trend</div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {chartData.length > 0 ? (
          <div className="space-y-6">
            {chartData.map((chart, index) => (
              <div key={index}>
                {chartData.length > 1 && (
                  <h4 className="font-medium mb-2 flex items-center">
                    <div 
                      className="w-3 h-3 rounded mr-2" 
                      style={{ backgroundColor: chart.color }}
                    />
                    {chart.title}
                  </h4>
                )}
                <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                  {renderChart(chart, isFullscreen ? 1200 : 800, isFullscreen ? 400 : 300)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
            <p>No metrics data available for the selected time range.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}