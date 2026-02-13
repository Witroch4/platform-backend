# Design Document: Flow Admin Quality Dashboard

## Overview

The Flow Admin Quality Dashboard transforms the existing FlowAdminDashboard component from a basic monitoring tool into a comprehensive operational quality monitoring machine. This design provides strategic insights into flow performance, user behavior patterns, conversion optimization, and operational health for the Flow Engine system.

### Current State

The existing dashboard (`app/admin/mtf-diamante/components/FlowAdminDashboard.tsx`) provides:
- Basic KPI counters (total flows, sessions, status counts)
- Simple flow list with session counts
- Session list with status filtering
- Basic administrative actions (abort, delete, cleanup)

### Target State

The enhanced dashboard will provide:
- **14 Strategic Layers**: Executive KPIs, heatmap visualization, funnel analysis, session replay, node metrics, intelligent alerts, path analysis, health scoring, temporal analysis, A/B testing, advanced filtering, performance metrics, operational management, and abandonment mapping
- **6 Organized Tabs**: Overview, Heatmap, Funnel & Paths, Sessions, Alerts, Performance
- **Real-time Updates**: Automatic data refresh with SWR
- **Actionable Insights**: Answers strategic questions like "Where do users stop?", "Which button is never clicked?", "Which route converts best?"

### Key Design Principles

1. **Data-Driven Decision Making**: Every visualization answers a specific business question
2. **Progressive Disclosure**: Start with high-level KPIs, drill down to details
3. **Real-time Monitoring**: Automatic updates without manual refresh
4. **Performance First**: Efficient aggregation queries with caching
5. **Responsive Design**: Works on mobile, tablet, and desktop


## Architecture

### Component Structure

```
FlowAdminDashboard (Main Container)
├── DashboardHeader (Title, Filters, Actions)
├── Tabs (6 primary tabs)
│   ├── OverviewTab
│   │   ├── ExecutiveKPICards
│   │   ├── TemporalTrendsChart
│   │   └── QuickInsightsPanel
│   ├── HeatmapTab
│   │   ├── FlowGraphVisualization (React Flow)
│   │   ├── NodeMetricsOverlay
│   │   └── NodeDetailPanel
│   ├── FunnelTab
│   │   ├── ConversionFunnelChart
│   │   ├── PathComparisonTable
│   │   └── SankeyDiagram
│   ├── SessionsTab
│   │   ├── SessionListTable
│   │   ├── SessionReplayTimeline
│   │   └── SessionFilters
│   ├── AlertsTab
│   │   ├── AlertsDashboard
│   │   ├── AlertConfigPanel
│   │   └── AlertHistoryLog
│   └── PerformanceTab
│       ├── TechnicalMetricsCards
│       ├── PerformanceCharts
│       └── SlowQueryLog
└── GlobalFilters (Date, Inbox, Flow, Campaign)
```

### Data Flow Architecture

```
User Interaction
    ↓
React Component (SWR hooks)
    ↓
API Routes (/api/admin/mtf-diamante/flow-analytics/*)
    ↓
Analytics Service Layer
    ↓
Prisma Database Queries (with aggregation)
    ↓
PostgreSQL (FlowSession, RuntimeFlow tables)
```

### API Endpoint Structure

```
/api/admin/mtf-diamante/flow-analytics/
├── kpis              # GET - Executive KPI metrics
├── heatmap           # GET - Node visit counts and metrics
├── funnel            # GET - Conversion funnel data
├── paths             # GET - Path analysis and comparison
├── sessions/:id      # GET - Session replay timeline
├── alerts            # GET/POST - Quality alerts
├── temporal          # GET - Time-based analysis
├── node-metrics      # GET - Node type performance
└── export            # POST - Data export
```


## Components and Interfaces

### Core Data Models

```typescript
// Executive KPI Metrics
interface ExecutiveKPIs {
  totalExecutions: number;
  completionRate: number;
  abandonmentRate: number;
  avgTimeToCompletion: number; // milliseconds
  avgTimeToAbandonment: number; // milliseconds
  errorRate: number;
  startToEndRate: number;
  startToFirstInteractionRate: number;
  avgClickThroughRate: number;
  avgResponseRateAfterDelay: number;
}

// Node Heatmap Data
interface NodeHeatmapData {
  nodeId: string;
  nodeName: string;
  nodeType: FlowNodeType;
  visitCount: number;
  visitPercentage: number; // relative to START
  avgTimeBeforeLeaving: number; // milliseconds
  dropOffRate: number;
  healthStatus: 'healthy' | 'moderate' | 'critical';
  isBottleneck: boolean;
}

// Funnel Step Data
interface FunnelStep {
  stepIndex: number;
  nodeId: string;
  nodeName: string;
  sessionCount: number;
  percentage: number; // relative to START
  dropOffCount: number;
  dropOffPercentage: number;
}

// Path Analysis Data
interface FlowPath {
  pathId: string;
  nodeSequence: string[]; // array of nodeIds
  sessionCount: number;
  completionRate: number;
  avgExecutionTime: number;
  abandonmentRate: number;
  pathType: 'most_used' | 'most_converted' | 'most_abandoned' | 'normal';
}

// Session Replay Entry
interface SessionReplayEntry {
  timestamp: number;
  nodeId: string;
  nodeName: string;
  nodeType: FlowNodeType;
  action: string;
  durationMs: number;
  deliveryMode: 'sync' | 'async';
  result: 'ok' | 'error' | 'skipped';
  detail?: string;
  variables?: Record<string, unknown>;
}

// Quality Alert
interface QualityAlert {
  id: string;
  type: 'critical_dropoff' | 'unused_button' | 'stuck_session' | 'recurring_error' | 'performance_degradation';
  severity: 'critical' | 'warning' | 'info';
  flowId: string;
  flowName: string;
  nodeId?: string;
  nodeName?: string;
  message: string;
  metric: number;
  threshold: number;
  createdAt: Date;
  dismissedAt?: Date;
  dismissReason?: string;
}

// Flow Health Score
interface FlowHealthScore {
  flowId: string;
  flowName: string;
  score: number; // 0-100
  classification: 'excellent' | 'good' | 'fair' | 'poor';
  completionRateScore: number;
  abandonmentRateScore: number;
  errorRateScore: number;
  executionTimeScore: number;
  trend: 'improving' | 'stable' | 'declining';
  sparklineData: number[]; // last 7 days
}

// Node Type Metrics
interface NodeTypeMetrics {
  nodeType: FlowNodeType;
  totalNodes: number;
  avgProcessingTime: number;
  successRate: number;
  specificMetrics: InteractiveMetrics | DelayMetrics | MediaMetrics;
}

interface InteractiveMetrics {
  totalButtons: number;
  avgCTR: number;
  unusedButtons: Array<{ buttonId: string; buttonText: string; nodeId: string }>;
  noClickPercentage: number;
}

interface DelayMetrics {
  avgDelayDuration: number;
  abandonmentDuringDelay: number;
  delayComparisonByDuration: Array<{ durationMs: number; abandonmentRate: number }>;
}

interface MediaMetrics {
  deliverySuccessRate: number;
  continuationRate: number;
  avgTimeAfterMedia: number;
}

// Temporal Analysis Data
interface TemporalMetrics {
  dimension: 'hour' | 'day_of_week' | 'campaign' | 'inbox';
  data: Array<{
    label: string;
    executionCount: number;
    completionRate: number;
    avgExecutionTime: number;
  }>;
  peakPeriods: string[];
  bestConversionPeriods: string[];
}
```


### React Hooks

```typescript
// Custom SWR hooks for data fetching

function useExecutiveKPIs(filters: DashboardFilters) {
  const key = buildApiKey('/flow-analytics/kpis', filters);
  return useSWR<ExecutiveKPIs>(key, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });
}

function useHeatmapData(flowId: string, filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/heatmap?flowId=${flowId}`, filters);
  return useSWR<NodeHeatmapData[]>(key, fetcher, {
    refreshInterval: 60000,
  });
}

function useFunnelData(flowId: string, filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/funnel?flowId=${flowId}`, filters);
  return useSWR<FunnelStep[]>(key, fetcher, {
    refreshInterval: 60000,
  });
}

function usePathAnalysis(flowId: string, filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/paths?flowId=${flowId}`, filters);
  return useSWR<FlowPath[]>(key, fetcher, {
    refreshInterval: 60000,
  });
}

function useSessionReplay(sessionId: string) {
  const key = `/api/admin/mtf-diamante/flow-analytics/sessions/${sessionId}`;
  return useSWR<SessionReplayEntry[]>(key, fetcher);
}

function useQualityAlerts(filters: DashboardFilters) {
  const key = buildApiKey('/flow-analytics/alerts', filters);
  return useSWR<QualityAlert[]>(key, fetcher, {
    refreshInterval: 15000,
  });
}

function useFlowHealthScore(flowId: string, filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/health-score?flowId=${flowId}`, filters);
  return useSWR<FlowHealthScore>(key, fetcher, {
    refreshInterval: 60000,
  });
}

function useNodeTypeMetrics(flowId: string, nodeType: FlowNodeType, filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/node-metrics?flowId=${flowId}&nodeType=${nodeType}`, filters);
  return useSWR<NodeTypeMetrics>(key, fetcher);
}

function useTemporalAnalysis(dimension: 'hour' | 'day_of_week' | 'campaign' | 'inbox', filters: DashboardFilters) {
  const key = buildApiKey(`/flow-analytics/temporal?dimension=${dimension}`, filters);
  return useSWR<TemporalMetrics>(key, fetcher);
}

// Helper to build API keys with filters
function buildApiKey(basePath: string, filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.inboxId) params.append('inboxId', filters.inboxId);
  if (filters.flowId) params.append('flowId', filters.flowId);
  if (filters.dateRange) {
    params.append('startDate', filters.dateRange.start.toISOString());
    params.append('endDate', filters.dateRange.end.toISOString());
  }
  if (filters.campaign) params.append('campaign', filters.campaign);
  if (filters.channelType) params.append('channelType', filters.channelType);
  
  return `/api/admin/mtf-diamante${basePath}${params.toString() ? '?' + params.toString() : ''}`;
}
```

### Filter Management

```typescript
interface DashboardFilters {
  inboxId?: string;
  flowId?: string;
  dateRange?: {
    start: Date;
    end: Date;
    preset?: 'today' | 'last_7_days' | 'last_30_days' | 'custom';
  };
  campaign?: string;
  channelType?: 'whatsapp' | 'instagram' | 'facebook';
  status?: FlowSessionStatus[];
  userTag?: string;
}

// URL persistence
function useFilterState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams]);
  
  const updateFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    const merged = { ...filters, ...newFilters };
    const params = serializeFiltersToURL(merged);
    router.push(`?${params.toString()}`);
  }, [filters, router]);
  
  return { filters, updateFilters };
}
```


## Data Models

### Database Schema Extensions

The existing Prisma schema already contains the necessary tables. We'll leverage:

```prisma
model FlowSession {
  id              String   @id @default(cuid())
  flowId          String
  conversationId  String
  contactId       String
  inboxId         String
  status          String   // ACTIVE, WAITING_INPUT, COMPLETED, ERROR
  currentNodeId   String?
  variables       Json     @default("{}")
  executionLog    Json     @default("[]")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?
  
  flow            RuntimeFlow @relation(fields: [flowId], references: [id])
  
  @@index([flowId])
  @@index([inboxId])
  @@index([status])
  @@index([createdAt])
  @@index([completedAt])
}

model RuntimeFlow {
  id        String   @id @default(cuid())
  name      String
  inboxId   String
  isActive  Boolean  @default(true)
  nodes     Json     // Array of RuntimeFlowNode
  edges     Json     // Array of RuntimeFlowEdge
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  sessions  FlowSession[]
  
  @@index([inboxId])
  @@index([isActive])
}
```

### Aggregation Query Patterns

```typescript
// Executive KPIs Calculation
async function calculateExecutiveKPIs(filters: DashboardFilters): Promise<ExecutiveKPIs> {
  const whereClause = buildWhereClause(filters);
  
  const [totalSessions, completedSessions, errorSessions, avgTimes] = await Promise.all([
    prisma.flowSession.count({ where: whereClause }),
    prisma.flowSession.count({ where: { ...whereClause, status: 'COMPLETED' } }),
    prisma.flowSession.count({ where: { ...whereClause, status: 'ERROR' } }),
    prisma.flowSession.aggregate({
      where: whereClause,
      _avg: {
        // Calculate from createdAt and completedAt
      }
    })
  ]);
  
  const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;
  const errorRate = totalSessions > 0 ? (errorSessions / totalSessions) * 100 : 0;
  const abandonmentRate = 100 - completionRate - errorRate;
  
  // Additional calculations for CTR, response rates, etc.
  
  return {
    totalExecutions: totalSessions,
    completionRate,
    abandonmentRate,
    errorRate,
    // ... other metrics
  };
}

// Heatmap Data Calculation
async function calculateHeatmapData(flowId: string, filters: DashboardFilters): Promise<NodeHeatmapData[]> {
  const sessions = await prisma.flowSession.findMany({
    where: {
      flowId,
      ...buildWhereClause(filters),
    },
    select: {
      executionLog: true,
      status: true,
      createdAt: true,
      completedAt: true,
    }
  });
  
  const flow = await prisma.runtimeFlow.findUnique({
    where: { id: flowId },
    select: { nodes: true }
  });
  
  const nodeMetrics = new Map<string, {
    visitCount: number;
    dropOffs: number;
    totalTimeBeforeLeaving: number;
  }>();
  
  // Process each session's execution log
  for (const session of sessions) {
    const log = session.executionLog as ExecutionLogEntry[];
    const visitedNodes = new Set<string>();
    
    for (const entry of log) {
      if (!visitedNodes.has(entry.nodeId)) {
        visitedNodes.add(entry.nodeId);
        const metrics = nodeMetrics.get(entry.nodeId) || { visitCount: 0, dropOffs: 0, totalTimeBeforeLeaving: 0 };
        metrics.visitCount++;
        nodeMetrics.set(entry.nodeId, metrics);
      }
    }
    
    // Track drop-offs
    if (session.status !== 'COMPLETED' && log.length > 0) {
      const lastNode = log[log.length - 1].nodeId;
      const metrics = nodeMetrics.get(lastNode)!;
      metrics.dropOffs++;
      
      const timeBeforeLeaving = session.completedAt 
        ? new Date(session.completedAt).getTime() - log[log.length - 1].timestamp
        : Date.now() - log[log.length - 1].timestamp;
      metrics.totalTimeBeforeLeaving += timeBeforeLeaving;
    }
  }
  
  // Calculate percentages and health status
  const startNodeVisits = nodeMetrics.get('START')?.visitCount || sessions.length;
  
  return Array.from(nodeMetrics.entries()).map(([nodeId, metrics]) => {
    const dropOffRate = metrics.visitCount > 0 ? (metrics.dropOffs / metrics.visitCount) * 100 : 0;
    const healthStatus = dropOffRate < 20 ? 'healthy' : dropOffRate < 50 ? 'moderate' : 'critical';
    
    return {
      nodeId,
      nodeName: findNodeName(flow.nodes, nodeId),
      nodeType: findNodeType(flow.nodes, nodeId),
      visitCount: metrics.visitCount,
      visitPercentage: (metrics.visitCount / startNodeVisits) * 100,
      avgTimeBeforeLeaving: metrics.dropOffs > 0 ? metrics.totalTimeBeforeLeaving / metrics.dropOffs : 0,
      dropOffRate,
      healthStatus,
      isBottleneck: dropOffRate > 50,
    };
  });
}

// Path Analysis Calculation
async function calculatePathAnalysis(flowId: string, filters: DashboardFilters): Promise<FlowPath[]> {
  const sessions = await prisma.flowSession.findMany({
    where: {
      flowId,
      ...buildWhereClause(filters),
    },
    select: {
      executionLog: true,
      status: true,
      createdAt: true,
      completedAt: true,
    }
  });
  
  const pathMap = new Map<string, {
    sessions: number;
    completions: number;
    totalTime: number;
  }>();
  
  for (const session of sessions) {
    const log = session.executionLog as ExecutionLogEntry[];
    const pathKey = log.map(e => e.nodeId).join('->');
    
    const pathData = pathMap.get(pathKey) || { sessions: 0, completions: 0, totalTime: 0 };
    pathData.sessions++;
    if (session.status === 'COMPLETED') pathData.completions++;
    
    if (session.completedAt) {
      pathData.totalTime += new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime();
    }
    
    pathMap.set(pathKey, pathData);
  }
  
  // Convert to array and calculate metrics
  const paths = Array.from(pathMap.entries()).map(([pathKey, data]) => ({
    pathId: pathKey,
    nodeSequence: pathKey.split('->'),
    sessionCount: data.sessions,
    completionRate: (data.completions / data.sessions) * 100,
    avgExecutionTime: data.totalTime / data.sessions,
    abandonmentRate: ((data.sessions - data.completions) / data.sessions) * 100,
    pathType: 'normal' as const,
  }));
  
  // Classify paths
  paths.sort((a, b) => b.sessionCount - a.sessionCount);
  if (paths.length > 0) paths[0].pathType = 'most_used';
  
  paths.sort((a, b) => b.completionRate - a.completionRate);
  if (paths.length > 0) paths[0].pathType = 'most_converted';
  
  paths.sort((a, b) => b.abandonmentRate - a.abandonmentRate);
  if (paths.length > 0) paths[0].pathType = 'most_abandoned';
  
  return paths;
}
```


### Alert Generation Logic

```typescript
async function generateQualityAlerts(filters: DashboardFilters): Promise<QualityAlert[]> {
  const alerts: QualityAlert[] = [];
  
  // Alert 1: Critical Drop-off (>50%)
  const heatmapData = await calculateHeatmapData(filters.flowId!, filters);
  for (const node of heatmapData) {
    if (node.dropOffRate > 50 && node.visitCount >= 10) {
      alerts.push({
        id: `dropoff_${node.nodeId}_${Date.now()}`,
        type: 'critical_dropoff',
        severity: 'critical',
        flowId: filters.flowId!,
        flowName: await getFlowName(filters.flowId!),
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        message: `Nó "${node.nodeName}" tem taxa de abandono crítica de ${node.dropOffRate.toFixed(1)}%`,
        metric: node.dropOffRate,
        threshold: 50,
        createdAt: new Date(),
      });
    }
  }
  
  // Alert 2: Unused Button (0 clicks in 100+ sessions)
  const nodeMetrics = await calculateNodeTypeMetrics(filters.flowId!, 'INTERACTIVE_MESSAGE', filters);
  if (nodeMetrics.specificMetrics && 'unusedButtons' in nodeMetrics.specificMetrics) {
    const interactiveMetrics = nodeMetrics.specificMetrics as InteractiveMetrics;
    for (const button of interactiveMetrics.unusedButtons) {
      alerts.push({
        id: `unused_button_${button.buttonId}_${Date.now()}`,
        type: 'unused_button',
        severity: 'warning',
        flowId: filters.flowId!,
        flowName: await getFlowName(filters.flowId!),
        nodeId: button.nodeId,
        nodeName: button.buttonText,
        message: `Botão "${button.buttonText}" nunca foi clicado em 100+ sessões`,
        metric: 0,
        threshold: 1,
        createdAt: new Date(),
      });
    }
  }
  
  // Alert 3: Stuck Sessions (>60 minutes in WAITING_INPUT)
  const stuckSessions = await prisma.flowSession.findMany({
    where: {
      status: 'WAITING_INPUT',
      updatedAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000), // 60 minutes ago
      },
      ...buildWhereClause(filters),
    },
    select: {
      id: true,
      flowId: true,
      currentNodeId: true,
    }
  });
  
  if (stuckSessions.length > 0) {
    alerts.push({
      id: `stuck_sessions_${Date.now()}`,
      type: 'stuck_session',
      severity: 'warning',
      flowId: filters.flowId!,
      flowName: await getFlowName(filters.flowId!),
      message: `${stuckSessions.length} sessões paradas há mais de 60 minutos`,
      metric: stuckSessions.length,
      threshold: 1,
      createdAt: new Date(),
    });
  }
  
  // Alert 4: Recurring Error (5+ same errors in 1 hour)
  const recentSessions = await prisma.flowSession.findMany({
    where: {
      status: 'ERROR',
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000),
      },
      ...buildWhereClause(filters),
    },
    select: {
      executionLog: true,
      flowId: true,
    }
  });
  
  const errorMap = new Map<string, { count: number; nodeId: string; detail: string }>();
  for (const session of recentSessions) {
    const log = session.executionLog as ExecutionLogEntry[];
    const errorEntries = log.filter(e => e.result === 'error');
    for (const error of errorEntries) {
      const key = `${error.nodeId}_${error.detail}`;
      const existing = errorMap.get(key) || { count: 0, nodeId: error.nodeId, detail: error.detail || 'Unknown error' };
      existing.count++;
      errorMap.set(key, existing);
    }
  }
  
  for (const [key, data] of errorMap.entries()) {
    if (data.count >= 5) {
      alerts.push({
        id: `recurring_error_${key}_${Date.now()}`,
        type: 'recurring_error',
        severity: 'critical',
        flowId: filters.flowId!,
        flowName: await getFlowName(filters.flowId!),
        nodeId: data.nodeId,
        message: `Erro recorrente: "${data.detail}" ocorreu ${data.count} vezes na última hora`,
        metric: data.count,
        threshold: 5,
        createdAt: new Date(),
      });
    }
  }
  
  // Alert 5: Performance Degradation (>20% drop in completion rate)
  const currentKPIs = await calculateExecutiveKPIs(filters);
  const historicalFilters = {
    ...filters,
    dateRange: {
      start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    }
  };
  const historicalKPIs = await calculateExecutiveKPIs(historicalFilters);
  
  const completionRateDrop = historicalKPIs.completionRate - currentKPIs.completionRate;
  if (completionRateDrop > 20) {
    alerts.push({
      id: `performance_degradation_${Date.now()}`,
      type: 'performance_degradation',
      severity: 'critical',
      flowId: filters.flowId!,
      flowName: await getFlowName(filters.flowId!),
      message: `Taxa de conclusão caiu ${completionRateDrop.toFixed(1)}% em relação à média histórica`,
      metric: currentKPIs.completionRate,
      threshold: historicalKPIs.completionRate - 20,
      createdAt: new Date(),
    });
  }
  
  return alerts;
}
```


### Flow Health Score Calculation

```typescript
function calculateFlowHealthScore(kpis: ExecutiveKPIs, historicalData: number[]): FlowHealthScore {
  // Weighted scoring
  const completionRateScore = kpis.completionRate; // 0-100
  const abandonmentRateScore = 100 - kpis.abandonmentRate; // inverted
  const errorRateScore = 100 - kpis.errorRate; // inverted
  
  // Normalize execution time (assume 5 minutes is ideal, 30 minutes is poor)
  const avgTimeMinutes = kpis.avgTimeToCompletion / (60 * 1000);
  const executionTimeScore = Math.max(0, 100 - ((avgTimeMinutes - 5) / 25) * 100);
  
  // Calculate weighted score
  const score = 
    (completionRateScore * 0.4) +
    (abandonmentRateScore * 0.3) +
    (errorRateScore * 0.2) +
    (executionTimeScore * 0.1);
  
  // Classify
  let classification: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 80) classification = 'excellent';
  else if (score >= 60) classification = 'good';
  else if (score >= 40) classification = 'fair';
  else classification = 'poor';
  
  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (historicalData.length >= 3) {
    const recentAvg = (historicalData[historicalData.length - 1] + historicalData[historicalData.length - 2]) / 2;
    const olderAvg = (historicalData[0] + historicalData[1]) / 2;
    if (recentAvg > olderAvg + 5) trend = 'improving';
    else if (recentAvg < olderAvg - 5) trend = 'declining';
  }
  
  return {
    flowId: '', // filled by caller
    flowName: '', // filled by caller
    score: Math.round(score),
    classification,
    completionRateScore: Math.round(completionRateScore),
    abandonmentRateScore: Math.round(abandonmentRateScore),
    errorRateScore: Math.round(errorRateScore),
    executionTimeScore: Math.round(executionTimeScore),
    trend,
    sparklineData: historicalData,
  };
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: KPI Calculation Accuracy

*For any* set of flow sessions, the calculated completion rate should equal (completed sessions / total sessions) * 100, the abandonment rate should equal ((total - completed - error) / total) * 100, and the error rate should equal (error sessions / total sessions) * 100.

**Validates: Requirements 1.2, 1.3, 1.6**

### Property 2: Node Visit Count Consistency

*For any* flow and set of sessions, the visit count for each node should equal the number of unique sessions that have that nodeId in their executionLog.

**Validates: Requirements 2.2**

### Property 3: Percentage Relative to START

*For any* node in a flow, the visit percentage should equal (node visit count / START node visit count) * 100, and should always be between 0 and 100 inclusive.

**Validates: Requirements 2.3**

### Property 4: Drop-off Rate Calculation

*For any* node with visits, the drop-off rate should equal (sessions that abandoned at this node / sessions that visited this node) * 100, where abandonment means this was the last node in an incomplete session.

**Validates: Requirements 2.5**

### Property 5: Health Status Classification

*For any* node, the health status should be 'healthy' if drop-off rate < 20%, 'moderate' if 20% <= drop-off rate < 50%, and 'critical' if drop-off rate >= 50%.

**Validates: Requirements 2.6**

### Property 6: Funnel Step Counting

*For any* funnel definition, the session count at each step should equal the number of sessions whose executionLog contains all nodes up to and including that step.

**Validates: Requirements 3.2**

### Property 7: Funnel Drop-off Calculation

*For any* two consecutive funnel steps, the drop-off percentage should equal ((sessions at step N - sessions at step N+1) / sessions at step N) * 100.

**Validates: Requirements 3.4**

### Property 8: Timeline Chronological Ordering

*For any* session replay, the timeline entries should be ordered by timestamp in ascending order, with each entry's timestamp >= the previous entry's timestamp.

**Validates: Requirements 4.1**

### Property 9: Timeline Entry Completeness

*For any* execution log entry, the transformed timeline entry should contain all required fields: timestamp, nodeId, nodeName, nodeType, action, durationMs, deliveryMode, and result.

**Validates: Requirements 4.2**

### Property 10: Button CTR Calculation

*For any* interactive message button, the click-through rate should equal (number of sessions where button was clicked / number of sessions that saw the button) * 100.

**Validates: Requirements 5.1**

### Property 11: Unused Button Detection

*For any* button across 100+ sessions, if the click count is 0, it should appear in the unused buttons list.

**Validates: Requirements 5.2**

### Property 12: Delay Abandonment Rate

*For any* delay node, the abandonment rate should equal (sessions that abandoned during or immediately after delay / sessions that reached delay) * 100.

**Validates: Requirements 5.4**

### Property 13: Critical Drop-off Alert Generation

*For any* node with drop-off rate > 50% and visit count >= 10, a critical alert of type 'critical_dropoff' should be generated.

**Validates: Requirements 6.1**

### Property 14: Unused Button Alert Generation

*For any* button with 0 clicks across 100+ sessions, a warning alert of type 'unused_button' should be generated.

**Validates: Requirements 6.2**

### Property 15: Recurring Error Alert Generation

*For any* combination of nodeId and error detail that occurs 5+ times within 1 hour, a critical alert of type 'recurring_error' should be generated.

**Validates: Requirements 6.4**

### Property 16: Unique Path Identification

*For any* set of sessions, each unique sequence of nodeIds in executionLogs should produce exactly one path entry, and no two paths should have identical nodeSequences.

**Validates: Requirements 7.1**

### Property 17: Path Completion Rate

*For any* path, the completion rate should equal (sessions on this path with status COMPLETED / total sessions on this path) * 100.

**Validates: Requirements 7.3**

### Property 18: Health Score Calculation Formula

*For any* set of KPIs, the health score should equal (completionRate * 0.4) + ((100 - abandonmentRate) * 0.3) + ((100 - errorRate) * 0.2) + (normalizedExecutionTime * 0.1), rounded to nearest integer.

**Validates: Requirements 8.1**

### Property 19: Health Score Bounds

*For any* calculated health score, the value should be >= 0 and <= 100.

**Validates: Requirements 8.6**

### Property 20: Health Score Classification

*For any* health score, the classification should be 'excellent' if score >= 80, 'good' if 60 <= score < 80, 'fair' if 40 <= score < 60, and 'poor' if score < 40.

**Validates: Requirements 8.7**

### Property 21: Temporal Grouping Consistency

*For any* temporal dimension (hour, day_of_week, campaign, inbox), all sessions should be grouped exactly once, and the sum of sessions across all groups should equal the total sessions in the filter range.

**Validates: Requirements 9.1**

### Property 22: Version Comparison Metrics

*For any* two flow versions, the comparison should include completion rates for both, and the difference should equal (version1.completionRate - version2.completionRate).

**Validates: Requirements 10.2**

### Property 23: Date Range Filter Application

*For any* date range filter, all returned sessions should have createdAt >= startDate and createdAt <= endDate.

**Validates: Requirements 11.1**

### Property 24: Filter URL Round-trip

*For any* set of dashboard filters, serializing to URL parameters and then deserializing should produce an equivalent filter object.

**Validates: Requirements 11.9**

### Property 25: Average Processing Time Calculation

*For any* set of execution log entries, the average processing time should equal sum(all durationMs values) / count(entries).

**Validates: Requirements 12.1**

### Property 26: Session List Completeness

*For any* filter criteria, all sessions matching the criteria should appear in the session list, and no sessions not matching the criteria should appear.

**Validates: Requirements 13.1**

### Property 27: Inactive Session Highlighting

*For any* session where (current time - updatedAt) > 30 minutes and status is ACTIVE or WAITING_INPUT, the session should be marked as inactive.

**Validates: Requirements 13.6**

### Property 28: Abandonment Path Filtering

*For any* set of sessions, abandonment paths should only include sessions where status != COMPLETED, and each path should end at the last node in the executionLog.

**Validates: Requirements 14.1, 14.3**

### Property 29: CSV Export Data Integrity

*For any* exported CSV file, parsing the CSV should produce data that matches the original dataset in count and key field values.

**Validates: Requirements 15.1**

### Property 30: API Endpoint Response Format

*For any* analytics API endpoint, the response should have a success boolean, and if success is true, a data field containing the expected data structure.

**Validates: Requirements 19.1**

### Property 31: Query Parameter Filter Application

*For any* API request with filter query parameters, the returned data should only include records matching all specified filters.

**Validates: Requirements 19.9**

### Property 32: Cache Consistency

*For any* cached metric, requesting the same data within the cache TTL (30 seconds) should return identical results without hitting the database.

**Validates: Requirements 20.1**


## Error Handling

### API Error Responses

All API endpoints follow a consistent error response format:

```typescript
interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

// Example error responses
{
  success: false,
  error: "Flow não encontrado",
  code: "FLOW_NOT_FOUND"
}

{
  success: false,
  error: "Período inválido: data final deve ser posterior à data inicial",
  code: "INVALID_DATE_RANGE"
}
```

### Error Handling Strategies

1. **Database Query Errors**
   - Wrap all Prisma queries in try-catch blocks
   - Log errors with context (flowId, inboxId, filters)
   - Return user-friendly error messages
   - Implement query timeouts (10 seconds max)

2. **Data Validation Errors**
   - Validate all filter parameters before queries
   - Check for required fields (inboxId, flowId where applicable)
   - Validate date ranges (start < end, not in future)
   - Return 400 Bad Request with specific validation messages

3. **Missing Data Handling**
   - Return empty arrays for missing data, not errors
   - Provide default values for optional metrics
   - Handle flows with no sessions gracefully
   - Display "No data available" messages in UI

4. **SWR Error Handling**
   - Display error toasts for failed requests
   - Implement retry logic with exponential backoff
   - Show error states in components with retry buttons
   - Maintain previous data during revalidation errors

```typescript
// SWR error handling pattern
const { data, error, isLoading } = useSWR(key, fetcher, {
  onError: (err) => {
    toast.error(`Erro ao carregar dados: ${err.message}`);
  },
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
});

if (error) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
      <p className="text-sm text-muted-foreground mb-4">
        Erro ao carregar dados: {error.message}
      </p>
      <Button onClick={() => mutate(key)} variant="outline" size="sm">
        <RefreshCcw className="w-4 h-4 mr-2" />
        Tentar novamente
      </Button>
    </div>
  );
}
```

5. **Calculation Errors**
   - Handle division by zero (return 0 or null)
   - Handle empty datasets gracefully
   - Validate data types before calculations
   - Use safe math operations (Math.max(0, value))

6. **Export Errors**
   - Validate data before export
   - Handle large datasets with streaming
   - Provide clear error messages for failed exports
   - Implement download retry mechanism

### Error Monitoring

- Log all errors to application monitoring system
- Track error rates by endpoint and error type
- Alert on error rate spikes (>5% of requests)
- Include request context in error logs (user, filters, timestamp)


## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific examples and edge cases with property-based tests for universal correctness guarantees.

**Unit Tests**: Focus on specific examples, edge cases, and error conditions
**Property Tests**: Verify universal properties across all inputs using randomized data generation

Together, these approaches provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript property-based testing
**Iterations**: Minimum 100 iterations per property test
**Tagging**: Each test must reference its design document property

Tag format: `Feature: flow-admin-quality-dashboard, Property {number}: {property_text}`

### Test Organization

```
__tests__/
├── unit/
│   ├── analytics/
│   │   ├── kpi-calculations.test.ts
│   │   ├── heatmap-data.test.ts
│   │   ├── funnel-analysis.test.ts
│   │   ├── path-analysis.test.ts
│   │   ├── alert-generation.test.ts
│   │   └── health-score.test.ts
│   ├── components/
│   │   ├── ExecutiveKPICards.test.tsx
│   │   ├── HeatmapVisualization.test.tsx
│   │   ├── FunnelChart.test.tsx
│   │   └── SessionReplayTimeline.test.tsx
│   └── api/
│       └── flow-analytics.test.ts
├── property/
│   ├── kpi-properties.test.ts
│   ├── heatmap-properties.test.ts
│   ├── funnel-properties.test.ts
│   ├── path-properties.test.ts
│   ├── alert-properties.test.ts
│   └── health-score-properties.test.ts
└── integration/
    ├── dashboard-flow.test.tsx
    └── api-integration.test.ts
```

### Property Test Examples

```typescript
// Property 1: KPI Calculation Accuracy
import fc from 'fast-check';

describe('Feature: flow-admin-quality-dashboard, Property 1: KPI Calculation Accuracy', () => {
  it('completion rate should equal (completed / total) * 100', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          id: fc.string(),
          status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
        }), { minLength: 1, maxLength: 1000 }),
        (sessions) => {
          const total = sessions.length;
          const completed = sessions.filter(s => s.status === 'COMPLETED').length;
          const expectedRate = (completed / total) * 100;
          
          const kpis = calculateExecutiveKPIs({ sessions });
          
          expect(kpis.completionRate).toBeCloseTo(expectedRate, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 3: Percentage Relative to START
describe('Feature: flow-admin-quality-dashboard, Property 3: Percentage Relative to START', () => {
  it('node visit percentage should be between 0 and 100 and equal (visits / START visits) * 100', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          nodeId: fc.constantFrom('START', 'NODE_1', 'NODE_2', 'NODE_3', 'END'),
          visitCount: fc.nat(1000),
        })),
        (nodeData) => {
          const startVisits = nodeData.find(n => n.nodeId === 'START')?.visitCount || 1;
          
          for (const node of nodeData) {
            const percentage = (node.visitCount / startVisits) * 100;
            
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 8: Timeline Chronological Ordering
describe('Feature: flow-admin-quality-dashboard, Property 8: Timeline Chronological Ordering', () => {
  it('timeline entries should be ordered by timestamp ascending', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          nodeId: fc.string(),
          timestamp: fc.nat(),
          durationMs: fc.nat(10000),
        }), { minLength: 2, maxLength: 50 }),
        (entries) => {
          const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
          const timeline = createSessionReplayTimeline(entries);
          
          for (let i = 1; i < timeline.length; i++) {
            expect(timeline[i].timestamp).toBeGreaterThanOrEqual(timeline[i - 1].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 19: Health Score Bounds
describe('Feature: flow-admin-quality-dashboard, Property 19: Health Score Bounds', () => {
  it('health score should always be between 0 and 100', () => {
    fc.assert(
      fc.property(
        fc.record({
          completionRate: fc.float({ min: 0, max: 100 }),
          abandonmentRate: fc.float({ min: 0, max: 100 }),
          errorRate: fc.float({ min: 0, max: 100 }),
          avgTimeToCompletion: fc.nat(3600000), // up to 1 hour
        }),
        (kpis) => {
          const healthScore = calculateFlowHealthScore(kpis, []);
          
          expect(healthScore.score).toBeGreaterThanOrEqual(0);
          expect(healthScore.score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 24: Filter URL Round-trip
describe('Feature: flow-admin-quality-dashboard, Property 24: Filter URL Round-trip', () => {
  it('serializing and deserializing filters should produce equivalent object', () => {
    fc.assert(
      fc.property(
        fc.record({
          inboxId: fc.option(fc.string(), { nil: undefined }),
          flowId: fc.option(fc.string(), { nil: undefined }),
          dateRange: fc.option(fc.record({
            start: fc.date(),
            end: fc.date(),
          }), { nil: undefined }),
          campaign: fc.option(fc.string(), { nil: undefined }),
        }),
        (filters) => {
          const urlParams = serializeFiltersToURL(filters);
          const deserialized = parseFiltersFromURL(urlParams);
          
          expect(deserialized.inboxId).toEqual(filters.inboxId);
          expect(deserialized.flowId).toEqual(filters.flowId);
          expect(deserialized.campaign).toEqual(filters.campaign);
          
          if (filters.dateRange) {
            expect(deserialized.dateRange?.start.getTime()).toEqual(filters.dateRange.start.getTime());
            expect(deserialized.dateRange?.end.getTime()).toEqual(filters.dateRange.end.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Test Examples

```typescript
// Edge case: Empty dataset
describe('KPI Calculations - Edge Cases', () => {
  it('should handle empty session array', () => {
    const kpis = calculateExecutiveKPIs({ sessions: [] });
    
    expect(kpis.totalExecutions).toBe(0);
    expect(kpis.completionRate).toBe(0);
    expect(kpis.abandonmentRate).toBe(0);
  });
  
  it('should handle all sessions completed', () => {
    const sessions = [
      { id: '1', status: 'COMPLETED' },
      { id: '2', status: 'COMPLETED' },
      { id: '3', status: 'COMPLETED' },
    ];
    
    const kpis = calculateExecutiveKPIs({ sessions });
    
    expect(kpis.completionRate).toBe(100);
    expect(kpis.abandonmentRate).toBe(0);
  });
  
  it('should handle division by zero in drop-off rate', () => {
    const nodeData = { visitCount: 0, dropOffs: 0 };
    
    const dropOffRate = calculateDropOffRate(nodeData);
    
    expect(dropOffRate).toBe(0);
  });
});

// Integration test: API endpoint
describe('Flow Analytics API', () => {
  it('should return KPIs for valid inbox', async () => {
    const response = await fetch('/api/admin/mtf-diamante/flow-analytics/kpis?inboxId=test-inbox');
    const json = await response.json();
    
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('totalExecutions');
    expect(json.data).toHaveProperty('completionRate');
  });
  
  it('should return 400 for missing inboxId', async () => {
    const response = await fetch('/api/admin/mtf-diamante/flow-analytics/kpis');
    const json = await response.json();
    
    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('inboxId');
  });
});
```

### Test Coverage Goals

- **Unit Tests**: 80% code coverage minimum
- **Property Tests**: All 32 correctness properties implemented
- **Integration Tests**: All 8 API endpoints tested
- **Component Tests**: All 6 tab components tested

### Continuous Integration

- Run all tests on every pull request
- Block merge if tests fail
- Generate coverage reports
- Alert on coverage drops >5%
