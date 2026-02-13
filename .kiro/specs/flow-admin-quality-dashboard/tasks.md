# Implementation Plan: Flow Admin Quality Dashboard (MVP Compactado)

## Overview

Dashboard de análise de flows com métricas essenciais: KPIs executivos, heatmap visual, funil de conversão, e lista de sessões. Foco em insights acionáveis sem complexidade excessiva.

## Tasks

- [x] 1. Set up analytics API infrastructure
  - Create base API route structure at `/api/admin/mtf-diamante/flow-analytics`
  - Implement shared utilities for filter parsing and query building
  - Create analytics service layer with database query functions
  - Set up response formatting and error handling patterns
  - _Requirements: 19.1, 19.9_

- [x] 2. Implement Executive KPI calculations
  - [x] 2.1 Create KPI calculation service
  - [x] 2.2 Write property test for KPI calculations
  - [x] 2.3 Write unit tests for KPI edge cases
  - _Requirements: 1.1-1.9_

- [x] 3. Create KPI API endpoint
  - Implement GET `/api/admin/mtf-diamante/flow-analytics/kpis`
  - Add query parameter validation (inboxId, flowId, dateRange)
  - Implement 30-second caching with Redis
  - _Requirements: 19.1, 20.1_

- [x] 4. Build ExecutiveKPICards component
  - Create responsive card grid (2-4-6 columns)
  - Display all 10 KPI metrics with icons
  - Add loading states and error handling
  - Implement SWR hook with 30-second refresh
  - _Requirements: 1.1-1.9, 17.1_

- [x] 5. Checkpoint - Verify KPI display

- [x] 6. Implement heatmap data calculations
  - [x] 6.1 Create heatmap calculation service
  - [x] 6.2 Write property tests for heatmap calculations
  - [x] 6.3 Write unit tests for heatmap edge cases
  - _Requirements: 2.2-2.10_

- [x] 7. Create heatmap API endpoint
  - Implement GET `/api/admin/mtf-diamante/flow-analytics/heatmap`
  - Require flowId query parameter
  - Implement 60-second caching
  - _Requirements: 19.2_

- [x] 8. Build HeatmapVisualization component
  - [x] 8.1 Set up React Flow canvas
  - [x] 8.2 Add heatmap overlay
  - [x] 8.3 Create NodeDetailPanel
  - _Requirements: 2.1-2.8_

- [x] 9. Implement funnel analysis calculations
  - [x] 9.1 Create funnel calculation service
  - [x] 9.2 Write property tests for funnel calculations
  - _Requirements: 3.2-3.8_

- [x] 10. Checkpoint - Verify heatmap and funnel

- [x] 11. Build complete dashboard with tabs
  - Create main FlowAnalyticsDashboard component
  - Implement 3 tabs: Overview, Heatmap, Sessions
  - Overview tab: ExecutiveKPICards + basic charts
  - Heatmap tab: HeatmapVisualization + NodeDetailPanel
  - Sessions tab: Enhanced session list with filters
  - Add GlobalFilters component (date range, flow selector)
  - Implement SWR auto-refresh (30s for KPIs, 60s for heatmap)
  - _Requirements: 16.1-16.9, 17.1-17.4, 11.1-11.8_

- [x] 12. Add funnel visualization
  - Create funnel API endpoint
  - Build FunnelChart component with Recharts
  - Display in Overview tab below KPIs
  - Show drop-off percentages between steps
  - _Requirements: 3.1-3.6, 19.3_

- [x] 13. Enhance session management
  - Add session search and filtering
  - Implement session replay timeline modal
  - Show execution log with timestamps
  - Add abort/delete actions
  - _Requirements: 4.1-4.9, 13.1-13.10_

- [x] 14. Add basic alerts
  - Implement alert generation service (critical drop-offs, stuck sessions)
  - Create alerts API endpoint
  - Display alert badges in dashboard header
  - Show alert list in Overview tab
  - _Requirements: 6.1-6.5, 19.6_

- [x] 15. Performance optimizations
  - Add database indexes (flowId, inboxId, status, createdAt)
  - Implement Redis caching (30-60s TTL)
  - Add loading states and error boundaries
  - Optimize queries with proper filtering
  - _Requirements: 20.1-20.9_

- [x] 16. Final integration and polish
  - Test all features end-to-end
  - Add responsive design (mobile/tablet/desktop)
  - Implement error handling with retry
  - Add export buttons (CSV for KPIs and sessions)
  - Document API endpoints
  - _Requirements: 18.1-18.10, 15.1-15.8_

## Notes

**MVP Focus**: Dashboard funcional com 3 tabs, métricas essenciais, e visualizações práticas. Features avançadas (A/B testing, temporal analysis, abandonment mapping) podem ser adicionadas depois conforme necessidade.

**Redução**: De 52 tasks para 16 tasks (69% de redução), mantendo todas as funcionalidades core do dashboard.

---

## Tasks Removidas (Podem ser implementadas depois se necessário)

- Path analysis detalhada
- Node type metrics específicos
- Flow health score com sparklines
- Temporal analysis por hora/dia
- A/B testing comparison
- Advanced filtering com URL persistence
- Technical performance metrics detalhados
- Abandonment path mapping
- Data export avançado
- Tabs adicionais (Alerts, Performance separados)
- Real-time updates complexos
- Property-based tests extensivos
