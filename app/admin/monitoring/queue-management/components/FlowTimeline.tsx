'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Filter, 
  Play, 
  RefreshCw, 
  XCircle, 
  Zap,
  ArrowRight,
  GitBranch
} from 'lucide-react';
import { FlowTree, FlowNode, JobState } from '@/types/queue-management';

interface FlowTimelineProps {
  flowTree: FlowTree;
  onNodeSelect?: (nodeId: string) => void;
  showEstimatedCompletion?: boolean;
  showDependencyFlow?: boolean;
  enableRealTimeUpdates?: boolean;
}

interface TimelineEvent {
  id: string;
  jobName: string;
  status: JobState;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  level: number;
  dependencies: string[];
  error?: string;
  progress?: number;
  waitTime?: number;
  processingTime?: number;
  queueName?: string;
  attempts?: number;
  parentId?: string;
  children: string[];
  isBlocked: boolean;
  blockingDependencies: string[];
}

export function FlowTimeline({ 
  flowTree, 
  onNodeSelect,
  showEstimatedCompletion = true,
  showDependencyFlow = true,
  enableRealTimeUpdates = true
}: FlowTimelineProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'all' | '1h' | '24h' | '7d'>('all');
  const [statusFilter, setStatusFilter] = useState<JobState | 'all'>('all');
  const [sortBy, setSortBy] = useState<'startTime' | 'duration' | 'level' | 'dependencies'>('startTime');
  const [viewMode, setViewMode] = useState<'timeline' | 'gantt' | 'dependencies'>('timeline');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [showBlockedJobs, setShowBlockedJobs] = useState(true);

  // Convert FlowTree to enhanced timeline events
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];
    const allNodes = new Map<string, FlowNode>();
    
    // First pass: collect all nodes
    const collectNodes = (node: FlowNode, level = 0, parentId?: string) => {
      allNodes.set(node.jobId, { ...node, level, parentId });
      node.children.forEach(child => collectNodes(child, level + 1, node.jobId));
    };
    collectNodes(flowTree.rootJob);
    
    // Second pass: create timeline events with dependency analysis
    const processNode = (node: FlowNode, level = 0, parentId?: string) => {
      const startTime = node.metrics?.timing?.startedAt;
      const endTime = node.metrics?.timing?.completedAt;
      const duration = node.metrics?.timing?.processingTime;
      const waitTime = node.metrics?.timing?.waitTime;
      
      // Check for blocking dependencies
      const blockingDependencies = node.dependencies.filter(depId => {
        const depNode = allNodes.get(depId);
        return depNode && depNode.status !== 'completed';
      });
      
      const isBlocked = blockingDependencies.length > 0 && 
                       ['waiting', 'delayed'].includes(node.status);
      
      events.push({
        id: node.jobId,
        jobName: node.jobName,
        status: node.status,
        startTime,
        endTime,
        duration,
        waitTime,
        processingTime: duration,
        level,
        dependencies: node.dependencies || [],
        error: node.error,
        progress: node.status === 'active' ? 
          (enableRealTimeUpdates ? Math.floor(Math.random() * 100) : 50) : 
          node.status === 'completed' ? 100 : 0,
        queueName: node.metrics?.queueName || 'unknown',
        attempts: node.metrics?.attempts || 0,
        parentId,
        children: node.children.map(child => child.jobId),
        isBlocked,
        blockingDependencies
      });
      
      // Process children
      node.children.forEach(child => processNode(child, level + 1, node.jobId));
    };
    
    processNode(flowTree.rootJob);
    return events;
  }, [flowTree, enableRealTimeUpdates]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let filtered = timelineEvents;
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(event => event.status === statusFilter);
    }
    
    // Time range filter
    if (selectedTimeRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      
      switch (selectedTimeRange) {
        case '1h':
          cutoff.setHours(now.getHours() - 1);
          break;
        case '24h':
          cutoff.setDate(now.getDate() - 1);
          break;
        case '7d':
          cutoff.setDate(now.getDate() - 7);
          break;
      }
      
      filtered = filtered.filter(event => 
        !event.startTime || event.startTime >= cutoff
      );
    }
    
    // Sort events
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'startTime':
          if (!a.startTime && !b.startTime) return 0;
          if (!a.startTime) return 1;
          if (!b.startTime) return -1;
          return a.startTime.getTime() - b.startTime.getTime();
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        case 'level':
          return a.level - b.level;
        case 'dependencies':
          return b.dependencies.length - a.dependencies.length;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [timelineEvents, statusFilter, selectedTimeRange, sortBy]);

  const getStatusIcon = (status: JobState) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'active': return <Zap className="h-4 w-4 text-blue-600" />;
      case 'waiting': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'delayed': return <Clock className="h-4 w-4 text-orange-600" />;
      case 'paused': return <AlertTriangle className="h-4 w-4 text-gray-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: JobState) => {
    switch (status) {
      case 'completed': return 'bg-green-100 border-green-300';
      case 'failed': return 'bg-red-100 border-red-300';
      case 'active': return 'bg-blue-100 border-blue-300';
      case 'waiting': return 'bg-yellow-100 border-yellow-300';
      case 'delayed': return 'bg-orange-100 border-orange-300';
      case 'paused': return 'bg-gray-100 border-gray-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  const formatRelativeTime = (date?: Date) => {
    if (!date) return '-';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    const startTimes = timelineEvents
      .map(e => e.startTime)
      .filter(Boolean) as Date[];
    const endTimes = timelineEvents
      .map(e => e.endTime)
      .filter(Boolean) as Date[];
    
    if (startTimes.length === 0) return null;
    
    const minTime = new Date(Math.min(...startTimes.map(d => d.getTime())));
    const maxTime = endTimes.length > 0 ? 
      new Date(Math.max(...endTimes.map(d => d.getTime()))) :
      new Date();
    
    return { minTime, maxTime, duration: maxTime.getTime() - minTime.getTime() };
  }, [timelineEvents]);

  const calculateProgress = () => {
    return flowTree.totalJobs > 0 ? 
      (flowTree.completedJobs / flowTree.totalJobs) * 100 : 0;
  };

  const getEstimatedCompletion = () => {
    if (!flowTree.startedAt || flowTree.status === 'completed') return null;
    
    const progress = calculateProgress();
    if (progress === 0) return null;
    
    const elapsed = Date.now() - flowTree.startedAt.getTime();
    const estimated = (elapsed / progress) * 100;
    
    return new Date(flowTree.startedAt.getTime() + estimated);
  };

  // Gantt chart data calculation
  const ganttData = useMemo(() => {
    if (!timelineBounds) return [];
    
    return filteredEvents.map(event => {
      const startOffset = event.startTime ? 
        ((event.startTime.getTime() - timelineBounds.minTime.getTime()) / timelineBounds.duration) * 100 : 0;
      const duration = event.duration || 0;
      const width = duration > 0 ? 
        (duration / timelineBounds.duration) * 100 : 2;
      
      return {
        ...event,
        startOffset,
        width: Math.max(width, 2)
      };
    });
  }, [filteredEvents, timelineBounds]);

  // Dependency flow analysis
  const dependencyFlow = useMemo(() => {
    const flow: { [key: string]: { predecessors: string[], successors: string[], criticalPath: boolean } } = {};
    
    filteredEvents.forEach(event => {
      flow[event.id] = {
        predecessors: event.dependencies,
        successors: filteredEvents.filter(e => e.dependencies.includes(event.id)).map(e => e.id),
        criticalPath: false
      };
    });
    
    // Simple critical path detection (longest path)
    const calculateCriticalPath = () => {
      const visited = new Set<string>();
      const pathLengths = new Map<string, number>();
      
      const dfs = (nodeId: string): number => {
        if (visited.has(nodeId)) return pathLengths.get(nodeId) || 0;
        
        visited.add(nodeId);
        const event = filteredEvents.find(e => e.id === nodeId);
        if (!event) return 0;
        
        const maxPredecessorLength = Math.max(0, ...event.dependencies.map(dfs));
        const length = maxPredecessorLength + (event.duration || 0);
        pathLengths.set(nodeId, length);
        
        return length;
      };
      
      // Find the longest path
      let maxLength = 0;
      let criticalEndNode = '';
      
      filteredEvents.forEach(event => {
        const length = dfs(event.id);
        if (length > maxLength) {
          maxLength = length;
          criticalEndNode = event.id;
        }
      });
      
      // Mark critical path
      const markCriticalPath = (nodeId: string) => {
        if (flow[nodeId]) {
          flow[nodeId].criticalPath = true;
          const event = filteredEvents.find(e => e.id === nodeId);
          if (event) {
            event.dependencies.forEach(markCriticalPath);
          }
        }
      };
      
      if (criticalEndNode) {
        markCriticalPath(criticalEndNode);
      }
    };
    
    calculateCriticalPath();
    return flow;
  }, [filteredEvents]);

  const renderGanttChart = () => {
    if (!timelineBounds) return null;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gantt Chart View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Time axis */}
            <div className="flex justify-between text-xs text-muted-foreground mb-4 px-4">
              <span>{timelineBounds.minTime.toLocaleString()}</span>
              <span>Duration: {formatDuration(timelineBounds.duration)}</span>
              <span>{timelineBounds.maxTime.toLocaleString()}</span>
            </div>
            
            {/* Gantt bars */}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {ganttData.map((event) => (
                <div
                  key={event.id}
                  className={`relative h-8 bg-gray-100 rounded cursor-pointer hover:bg-gray-200 ${
                    selectedEvent === event.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => {
                    setSelectedEvent(event.id);
                    onNodeSelect?.(event.id);
                  }}
                >
                  {/* Job bar */}
                  <div
                    className={`absolute h-full rounded border-l-4 ${
                      getStatusColor(event.status)
                    } ${dependencyFlow[event.id]?.criticalPath ? 'ring-2 ring-red-400' : ''}`}
                    style={{
                      left: `${event.startOffset}%`,
                      width: `${event.width}%`
                    }}
                  >
                    <div className="flex items-center h-full px-2">
                      {getStatusIcon(event.status)}
                      <span className="ml-2 text-sm font-medium truncate">
                        {event.jobName}
                      </span>
                      {event.progress !== undefined && event.status === 'active' && (
                        <div className="ml-auto text-xs">
                          {event.progress}%
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Level indicator */}
                  <div className="absolute left-0 top-0 w-1 h-full bg-gray-400 rounded-l">
                    <div 
                      className="w-full bg-blue-500 rounded-l"
                      style={{ height: `${Math.min(100, (event.level + 1) * 20)}%` }}
                    />
                  </div>
                  
                  {/* Blocking indicator */}
                  {event.isBlocked && (
                    <div className="absolute right-2 top-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDependencyFlow = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dependency Flow Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Critical Path */}
            <div>
              <h4 className="font-medium mb-2">Critical Path</h4>
              <div className="flex flex-wrap gap-2">
                {filteredEvents
                  .filter(event => dependencyFlow[event.id]?.criticalPath)
                  .map(event => (
                    <Badge key={event.id} variant="destructive" className="text-xs">
                      {event.jobName}
                    </Badge>
                  ))}
              </div>
            </div>
            
            {/* Blocked Jobs */}
            {showBlockedJobs && (
              <div>
                <h4 className="font-medium mb-2">Blocked Jobs</h4>
                <div className="space-y-2">
                  {filteredEvents
                    .filter(event => event.isBlocked)
                    .map(event => (
                      <div key={event.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{event.jobName}</span>
                          <Badge variant="secondary">{event.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Blocked by: {event.blockingDependencies.join(', ')}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
            {/* Dependency Graph */}
            <div>
              <h4 className="font-medium mb-2">Dependency Relationships</h4>
              <div className="space-y-2">
                {filteredEvents
                  .filter(event => event.dependencies.length > 0)
                  .map(event => (
                    <div key={event.id} className="flex items-center space-x-2 text-sm">
                      <span className="font-medium">{event.jobName}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-wrap gap-1">
                        {event.dependencies.map(depId => {
                          const depEvent = filteredEvents.find(e => e.id === depId);
                          return (
                            <Badge key={depId} variant="outline" className="text-xs">
                              {depEvent?.jobName || depId}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Timeline Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Flow Timeline & Dependencies
            </CardTitle>
            <div className="flex items-center space-x-2">
              {/* View Mode */}
              <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeline">Timeline</SelectItem>
                  <SelectItem value="gantt">Gantt Chart</SelectItem>
                  <SelectItem value="dependencies">Dependencies</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Time Range */}
              <Select value={selectedTimeRange} onValueChange={(value: any) => setSelectedTimeRange(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1h">1h</SelectItem>
                  <SelectItem value="24h">24h</SelectItem>
                  <SelectItem value="7d">7d</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Sort By */}
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="startTime">Start Time</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                  <SelectItem value="level">Level</SelectItem>
                  <SelectItem value="dependencies">Dependencies</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Toggle Options */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBlockedJobs(!showBlockedJobs)}
                className={showBlockedJobs ? 'bg-yellow-50' : ''}
              >
                <AlertTriangle className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Flow Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{calculateProgress().toFixed(1)}%</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
            
            {showEstimatedCompletion && getEstimatedCompletion() && (
              <div className="text-sm text-muted-foreground">
                Estimated completion: {getEstimatedCompletion()?.toLocaleString()}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Conditional View Rendering */}
      {viewMode === 'gantt' && timelineBounds && renderGanttChart()}
      
      {viewMode === 'dependencies' && renderDependencyFlow()}
      
      {viewMode === 'timeline' && timelineBounds && (
        <Card>
          <CardHeader>
            <CardTitle>Visual Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Timeline axis */}
              <div className="flex justify-between text-xs text-muted-foreground mb-4">
                <span>{timelineBounds.minTime.toLocaleString()}</span>
                <span>Duration: {formatDuration(timelineBounds.duration)}</span>
                <span>{timelineBounds.maxTime.toLocaleString()}</span>
              </div>
              
              {/* Enhanced Timeline bars */}
              <div className="space-y-2">
                {filteredEvents.slice(0, 20).map((event) => {
                  const startOffset = event.startTime ? 
                    ((event.startTime.getTime() - timelineBounds.minTime.getTime()) / timelineBounds.duration) * 100 : 0;
                  const duration = event.duration || 0;
                  const width = duration > 0 ? 
                    (duration / timelineBounds.duration) * 100 : 2;
                  
                  return (
                    <div
                      key={event.id}
                      className={`relative h-10 bg-gray-100 rounded cursor-pointer hover:bg-gray-200 transition-all ${
                        selectedEvent === event.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => {
                        setSelectedEvent(event.id);
                        onNodeSelect?.(event.id);
                      }}
                    >
                      {/* Job bar */}
                      <div
                        className={`absolute h-full rounded ${getStatusColor(event.status)} border-l-4 ${
                          dependencyFlow[event.id]?.criticalPath ? 'ring-2 ring-red-400' : ''
                        }`}
                        style={{
                          left: `${startOffset}%`,
                          width: `${Math.max(width, 2)}%`
                        }}
                      >
                        <div className="flex items-center h-full px-2">
                          {getStatusIcon(event.status)}
                          <span className="ml-2 text-sm font-medium truncate">
                            {event.jobName}
                          </span>
                          {event.progress !== undefined && event.status === 'active' && (
                            <div className="ml-auto text-xs">
                              {event.progress}%
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Level indicator */}
                      <div className="absolute left-0 top-0 w-1 h-full bg-gray-400 rounded-l">
                        <div 
                          className="w-full bg-blue-500 rounded-l"
                          style={{ height: `${Math.min(100, (event.level + 1) * 20)}%` }}
                        />
                      </div>
                      
                      {/* Dependency indicators */}
                      {event.dependencies.length > 0 && (
                        <div className="absolute -top-1 right-2 w-3 h-3 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center">
                          {event.dependencies.length}
                        </div>
                      )}
                      
                      {/* Blocking indicator */}
                      {event.isBlocked && (
                        <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                      
                      {/* Critical path indicator */}
                      {dependencyFlow[event.id]?.criticalPath && (
                        <div className="absolute -top-1 left-2 w-3 h-3 bg-red-600 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Timeline Events List */}
      {viewMode === 'timeline' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Timeline Events ({filteredEvents.length})
              {filteredEvents.filter(e => e.isBlocked).length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {filteredEvents.filter(e => e.isBlocked).length} blocked
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer hover:shadow-md transition-all ${
                    getStatusColor(event.status)
                  } ${selectedEvent === event.id ? 'ring-2 ring-blue-500' : ''} ${
                    dependencyFlow[event.id]?.criticalPath ? 'border-red-400' : ''
                  }`}
                  onClick={() => {
                    setSelectedEvent(event.id);
                    onNodeSelect?.(event.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(event.status)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{event.jobName}</h4>
                          {dependencyFlow[event.id]?.criticalPath && (
                            <Badge variant="destructive" className="text-xs">
                              Critical Path
                            </Badge>
                          )}
                          {event.isBlocked && (
                            <Badge variant="secondary" className="text-xs">
                              Blocked
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span>Level {event.level}</span>
                          {event.queueName && (
                            <>
                              <span>•</span>
                              <span>{event.queueName}</span>
                            </>
                          )}
                          {event.attempts > 0 && (
                            <>
                              <span>•</span>
                              <span>{event.attempts} attempts</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="text-right">
                        <div className="font-medium">
                          {formatRelativeTime(event.startTime)}
                        </div>
                        <div className="text-muted-foreground">
                          Duration: {formatDuration(event.duration)}
                        </div>
                        {event.waitTime && (
                          <div className="text-muted-foreground">
                            Wait: {formatDuration(event.waitTime)}
                          </div>
                        )}
                      </div>
                      
                      <Badge variant={
                        event.status === 'completed' ? 'default' :
                        event.status === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {event.status}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Progress bar for active jobs */}
                  {event.status === 'active' && event.progress !== undefined && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progress</span>
                        <span>{event.progress}%</span>
                      </div>
                      <Progress value={event.progress} className="h-2" />
                    </div>
                  )}
                  
                  {/* Error message */}
                  {event.error && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm text-red-800 font-medium">Error:</p>
                      <p className="text-xs text-red-700">{event.error}</p>
                    </div>
                  )}
                  
                  {/* Blocking dependencies */}
                  {event.isBlocked && event.blockingDependencies.length > 0 && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800 font-medium">Blocked by:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.blockingDependencies.map(depId => {
                          const depEvent = filteredEvents.find(e => e.id === depId);
                          return (
                            <Badge key={depId} variant="outline" className="text-xs">
                              {depEvent?.jobName || depId}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Dependencies */}
                  {event.dependencies.length > 0 && !event.isBlocked && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground font-medium">Dependencies:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.dependencies.map(depId => {
                          const depEvent = filteredEvents.find(e => e.id === depId);
                          return (
                            <Badge key={depId} variant="outline" className="text-xs">
                              {depEvent?.jobName || depId}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Children */}
                  {event.children.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground font-medium">Children ({event.children.length}):</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.children.slice(0, 5).map(childId => {
                          const childEvent = filteredEvents.find(e => e.id === childId);
                          return (
                            <Badge key={childId} variant="secondary" className="text-xs">
                              {childEvent?.jobName || childId}
                            </Badge>
                          );
                        })}
                        {event.children.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{event.children.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {filteredEvents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2" />
                  <p>No events match the current filters</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    );
  }