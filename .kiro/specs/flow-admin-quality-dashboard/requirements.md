# Requirements Document

## Introduction

This document specifies the requirements for transforming the FlowAdminDashboard component from a basic monitoring tool into a comprehensive operational quality monitoring machine for the Flow Engine. The enhanced dashboard will provide strategic insights into flow performance, user behavior, conversion patterns, and operational health, enabling data-driven optimization of conversational flows.

## Glossary

- **Flow_Engine**: The deadline-first execution system that processes conversational flows with automatic sync-to-async migration
- **Flow_Session**: A single execution instance of a flow for a specific contact/conversation
- **Execution_Log**: Timestamped record of node visits, durations, and outcomes during flow execution
- **Runtime_Flow**: The flow definition including nodes and edges loaded from the database
- **Flow_Node**: A single step in a conversational flow (START, INTERACTIVE_MESSAGE, TEXT_MESSAGE, MEDIA, DELAY, etc.)
- **Conversion**: Successful completion of a flow from START to END node
- **Drop-off**: When a user abandons a flow before completion
- **Heatmap**: Visual representation of user behavior intensity across flow nodes
- **Flow_Path**: A specific sequence of nodes traversed during execution
- **Button_CTR**: Click-through rate for interactive message buttons
- **Flow_Health_Score**: Composite metric indicating overall flow quality and performance
- **Gargalo**: A node where significant user drop-off occurs (bottleneck)
- **Session_Replay**: Chronological visualization of a single session's execution path
- **Band**: Performance classification tier (HARD ≥0.80, SOFT 0.65-0.79, LOW 0.50-0.64, ROUTER <0.50)
- **Intent_Mapping**: Association between classified intents and flow execution
- **Delivery_Mode**: Execution mode (sync or async) for message delivery
- **Chatwit_API**: External API used for async message delivery
- **Interactive_Message**: Message with buttons, lists, or carousel elements requiring user interaction
- **Abandonment_Rate**: Percentage of sessions that do not reach completion

## Requirements

### Requirement 1: Executive Dashboard Overview

**User Story:** As a flow manager, I want to see top-level KPIs at a glance, so that I can quickly assess overall flow health and performance.

#### Acceptance Criteria

1. WHEN the dashboard loads, THE System SHALL display total flow executions for the selected period
2. WHEN the dashboard loads, THE System SHALL calculate and display the overall completion rate as a percentage
3. WHEN the dashboard loads, THE System SHALL calculate and display the overall abandonment rate as a percentage
4. WHEN the dashboard loads, THE System SHALL calculate and display the average time to completion for successful sessions
5. WHEN the dashboard loads, THE System SHALL calculate and display the average time to abandonment for incomplete sessions
6. WHEN the dashboard loads, THE System SHALL calculate and display the overall error rate as a percentage
7. WHEN the dashboard loads, THE System SHALL display conversion metrics including start-to-end rate and start-to-first-interaction rate
8. WHEN the dashboard loads, THE System SHALL calculate and display the average click-through rate across all interactive messages
9. WHEN the dashboard loads, THE System SHALL calculate and display the average response rate after delay nodes
10. THE System SHALL update all KPIs automatically every 30 seconds

### Requirement 2: Flow Heatmap Visualization

**User Story:** As a flow designer, I want to see a visual heatmap of user behavior across flow nodes, so that I can identify bottlenecks and optimize the flow structure.

#### Acceptance Criteria

1. WHEN viewing the heatmap, THE System SHALL display the flow graph with nodes and edges
2. FOR EACH node in the flow, THE System SHALL calculate the total number of sessions that visited that node
3. FOR EACH node in the flow, THE System SHALL calculate the percentage of sessions relative to the START node
4. FOR EACH node in the flow, THE System SHALL calculate the average time users spend before leaving from that node
5. FOR EACH node in the flow, THE System SHALL calculate the drop-off rate (percentage of users who abandon at that node)
6. WHEN displaying nodes, THE System SHALL apply color coding based on health: green for healthy (drop-off <20%), yellow for moderate (20-50%), red for critical (>50%)
7. WHEN a user hovers over a node, THE System SHALL display a tooltip with detailed metrics
8. WHEN a user clicks on a node, THE System SHALL display a detailed breakdown panel with node-specific analytics
9. THE System SHALL highlight the most common path through the flow with increased edge thickness
10. THE System SHALL identify and visually mark gargalo nodes (bottlenecks) with warning indicators

### Requirement 3: Conversion Funnel Analysis

**User Story:** As a product manager, I want to see a funnel visualization of user progression through the flow, so that I can identify where users drop off and optimize conversion.

#### Acceptance Criteria

1. WHEN viewing the funnel, THE System SHALL display a visual funnel chart showing progression from START to END
2. FOR EACH major step in the flow, THE System SHALL display the absolute count of sessions
3. FOR EACH major step in the flow, THE System SHALL display the percentage relative to the START node
4. FOR EACH transition between steps, THE System SHALL calculate and display the drop-off percentage
5. THE System SHALL identify the step with the highest drop-off rate and highlight it
6. WHEN a user clicks on a funnel step, THE System SHALL display detailed information about sessions at that step
7. THE System SHALL support custom funnel definitions based on specific node sequences
8. THE System SHALL calculate the overall funnel conversion rate from START to END
9. THE System SHALL compare funnel performance across different time periods
10. THE System SHALL allow exporting funnel data in CSV format

### Requirement 4: Session Replay and Timeline

**User Story:** As a support engineer, I want to replay individual session executions step-by-step, so that I can debug issues and understand user behavior.

#### Acceptance Criteria

1. WHEN viewing a session, THE System SHALL display a chronological timeline of all node visits
2. FOR EACH timeline entry, THE System SHALL display the timestamp, node name, node type, and action taken
3. FOR EACH timeline entry, THE System SHALL display the execution duration in milliseconds
4. FOR EACH timeline entry, THE System SHALL display the delivery mode (sync or async)
5. FOR EACH timeline entry, THE System SHALL display the result status (ok, error, skipped)
6. WHEN an error occurred, THE System SHALL display the error detail message
7. WHEN a session was abandoned, THE System SHALL indicate the last node visited and time of inactivity
8. THE System SHALL display session variables and their values at each step
9. THE System SHALL allow filtering sessions by flow, status, date range, and contact
10. THE System SHALL support exporting session replay data for audit purposes

### Requirement 5: Node Type Performance Metrics

**User Story:** As a flow optimizer, I want to see performance metrics grouped by node type, so that I can understand which types of interactions work best.

#### Acceptance Criteria

1. FOR INTERACTIVE_MESSAGE nodes, THE System SHALL calculate the click-through rate for each button
2. FOR INTERACTIVE_MESSAGE nodes, THE System SHALL identify buttons that are never clicked
3. FOR INTERACTIVE_MESSAGE nodes, THE System SHALL calculate the percentage of users who do not click any button
4. FOR DELAY nodes, THE System SHALL calculate the percentage of users who abandon during the delay
5. FOR DELAY nodes, THE System SHALL compare abandonment rates across different delay durations
6. FOR MEDIA nodes, THE System SHALL calculate the percentage of users who receive the media successfully
7. FOR MEDIA nodes, THE System SHALL calculate the percentage of users who continue after receiving media
8. FOR TEXT_MESSAGE nodes, THE System SHALL calculate the average time users spend reading before proceeding
9. THE System SHALL group metrics by node type and display aggregate statistics
10. THE System SHALL allow comparing performance across different instances of the same node type

### Requirement 6: Intelligent Quality Alerts

**User Story:** As a flow manager, I want to receive automatic alerts about quality issues, so that I can proactively address problems before they impact many users.

#### Acceptance Criteria

1. WHEN a node has a drop-off rate exceeding 50%, THE System SHALL generate a critical alert
2. WHEN a button in an interactive message has zero clicks across 100+ sessions, THE System SHALL generate a warning alert
3. WHEN a session has been in WAITING_INPUT status for more than 60 minutes, THE System SHALL generate a stuck session alert
4. WHEN the same error occurs at the same node in 5+ sessions within 1 hour, THE System SHALL generate a recurring error alert
5. WHEN a flow's completion rate drops by more than 20% compared to historical average, THE System SHALL generate a performance degradation alert
6. THE System SHALL display all active alerts in a dedicated alerts dashboard
7. THE System SHALL allow dismissing alerts with a reason
8. THE System SHALL track alert history and resolution status
9. THE System SHALL support configuring alert thresholds per flow
10. THE System SHALL send alert notifications via toast messages when new critical alerts are generated

### Requirement 7: Path Analysis and Comparison

**User Story:** As a data analyst, I want to analyze different paths users take through the flow, so that I can identify which routes are most effective.

#### Acceptance Criteria

1. THE System SHALL identify all unique paths taken through the flow
2. FOR EACH path, THE System SHALL calculate the total number of sessions that followed that path
3. FOR EACH path, THE System SHALL calculate the completion rate (percentage reaching END)
4. FOR EACH path, THE System SHALL calculate the average execution time
5. THE System SHALL rank paths by usage frequency, completion rate, and conversion value
6. THE System SHALL identify the most used path, most converted path, and most abandoned path
7. WHEN comparing paths, THE System SHALL display side-by-side metrics
8. THE System SHALL visualize path flow using Sankey diagrams or similar
9. THE System SHALL allow filtering paths by minimum session count threshold
10. THE System SHALL support exporting path analysis data in JSON format

### Requirement 8: Flow Health Score

**User Story:** As an executive, I want a single composite score that indicates flow quality, so that I can quickly prioritize which flows need attention.

#### Acceptance Criteria

1. THE System SHALL calculate a Flow_Health_Score using weighted factors
2. THE Flow_Health_Score SHALL incorporate completion rate with a weight of 40%
3. THE Flow_Health_Score SHALL incorporate abandonment rate (inverted) with a weight of 30%
4. THE Flow_Health_Score SHALL incorporate error rate (inverted) with a weight of 20%
5. THE Flow_Health_Score SHALL incorporate average execution time (normalized) with a weight of 10%
6. THE System SHALL normalize the score to a 0-100 scale
7. THE System SHALL classify scores as Excellent (80-100), Good (60-79), Fair (40-59), or Poor (<40)
8. THE System SHALL display the score with appropriate color coding (green, yellow, orange, red)
9. THE System SHALL show score trends over time with a sparkline chart
10. THE System SHALL allow comparing health scores across multiple flows

### Requirement 9: Temporal Analysis

**User Story:** As a marketing manager, I want to see how flow performance varies by time, so that I can optimize campaign timing and resource allocation.

#### Acceptance Criteria

1. THE System SHALL display flow execution metrics grouped by hour of day
2. THE System SHALL display flow execution metrics grouped by day of week
3. THE System SHALL display flow execution metrics grouped by campaign identifier
4. THE System SHALL display flow execution metrics grouped by inbox
5. THE System SHALL calculate peak usage hours and display them prominently
6. THE System SHALL identify time periods with highest and lowest conversion rates
7. THE System SHALL support comparing metrics across different time periods
8. THE System SHALL display temporal trends using line charts and bar charts
9. THE System SHALL allow filtering temporal data by flow, status, and date range
10. THE System SHALL support exporting temporal analysis data in CSV format

### Requirement 10: A/B Testing and Version Comparison

**User Story:** As a product manager, I want to compare performance between different flow versions, so that I can make data-driven decisions about which version to deploy.

#### Acceptance Criteria

1. THE System SHALL support tagging flow sessions with version identifiers
2. WHEN comparing versions, THE System SHALL display side-by-side completion rates
3. WHEN comparing versions, THE System SHALL display side-by-side average execution times
4. WHEN comparing versions, THE System SHALL display side-by-side button click rates
5. WHEN comparing versions, THE System SHALL calculate statistical significance of differences
6. THE System SHALL display a winner recommendation based on composite metrics
7. THE System SHALL support comparing up to 4 versions simultaneously
8. THE System SHALL visualize version differences using comparison charts
9. THE System SHALL allow filtering comparison data by date range and user segment
10. THE System SHALL support exporting comparison data in CSV format

### Requirement 11: Advanced Filtering and Segmentation

**User Story:** As a data analyst, I want to filter and segment flow data by multiple dimensions, so that I can perform detailed analysis on specific user cohorts.

#### Acceptance Criteria

1. THE System SHALL support filtering by date range with preset options (today, last 7 days, last 30 days, custom)
2. THE System SHALL support filtering by inbox identifier
3. THE System SHALL support filtering by flow identifier
4. THE System SHALL support filtering by campaign identifier
5. THE System SHALL support filtering by user tag
6. THE System SHALL support filtering by channel type (WhatsApp, Instagram, Facebook)
7. THE System SHALL support filtering by session status (ACTIVE, WAITING_INPUT, COMPLETED, ERROR)
8. THE System SHALL apply filters across all dashboard views consistently
9. THE System SHALL persist filter selections in URL query parameters
10. THE System SHALL display active filters prominently with the ability to clear them

### Requirement 12: Technical Performance Metrics

**User Story:** As a DevOps engineer, I want to monitor technical performance metrics, so that I can ensure the Flow Engine is operating efficiently.

#### Acceptance Criteria

1. THE System SHALL calculate average node processing time in milliseconds
2. THE System SHALL calculate average message delivery latency for sync and async modes
3. THE System SHALL track media delivery failure rates
4. THE System SHALL track timeout occurrences by node type
5. THE System SHALL display the distribution of sync vs async delivery modes
6. THE System SHALL calculate the average time to async migration
7. THE System SHALL track API call success rates to Chatwit_API
8. THE System SHALL display database query performance metrics
9. THE System SHALL identify slow nodes (processing time >1000ms)
10. THE System SHALL support exporting performance metrics for external monitoring tools

### Requirement 13: Operational Session Management

**User Story:** As a support operator, I want to view and manage active sessions in real-time, so that I can intervene when users are stuck or experiencing issues.

#### Acceptance Criteria

1. THE System SHALL display a table of all sessions with their current status
2. FOR EACH session, THE System SHALL display the flow name, conversation ID, contact ID, and current node
3. FOR EACH session, THE System SHALL display the time elapsed since last activity
4. FOR EACH session, THE System SHALL display the last action taken
5. FOR EACH session, THE System SHALL display any error messages
6. THE System SHALL highlight sessions that have been inactive for more than 30 minutes
7. THE System SHALL allow sorting sessions by status, time, flow, or last activity
8. THE System SHALL allow bulk selection and abortion of multiple sessions
9. THE System SHALL support searching sessions by conversation ID or contact ID
10. THE System SHALL refresh the session list automatically every 5 seconds

### Requirement 14: Abandonment Path Mapping

**User Story:** As a UX designer, I want to see detailed abandonment patterns by path, so that I can redesign problematic flow sections.

#### Acceptance Criteria

1. THE System SHALL identify all paths where abandonment occurs
2. FOR EACH abandonment path, THE System SHALL calculate the percentage of total abandonments
3. FOR EACH abandonment path, THE System SHALL identify the specific node where users abandon
4. FOR EACH abandonment path, THE System SHALL calculate the average time before abandonment
5. THE System SHALL rank abandonment paths by frequency
6. THE System SHALL visualize abandonment paths using a tree diagram
7. THE System SHALL highlight the most critical abandonment point in each path
8. WHEN a user clicks on an abandonment path, THE System SHALL display sessions that followed that path
9. THE System SHALL compare abandonment rates across different path branches
10. THE System SHALL support exporting abandonment path data in JSON format

### Requirement 15: Data Export and Reporting

**User Story:** As a business analyst, I want to export dashboard data in various formats, so that I can perform custom analysis and create reports.

#### Acceptance Criteria

1. THE System SHALL support exporting KPI data in CSV format
2. THE System SHALL support exporting session data in CSV format
3. THE System SHALL support exporting path analysis data in JSON format
4. THE System SHALL support exporting funnel data in CSV format
5. THE System SHALL support exporting heatmap data in JSON format
6. WHEN exporting data, THE System SHALL include all applied filters in the export metadata
7. WHEN exporting data, THE System SHALL include timestamp and user information
8. THE System SHALL generate downloadable files with descriptive filenames
9. THE System SHALL support scheduling automated exports (future enhancement placeholder)
10. THE System SHALL validate exported data integrity before download

### Requirement 16: Dashboard Tab Organization

**User Story:** As a dashboard user, I want the interface organized into logical tabs, so that I can easily navigate to the information I need.

#### Acceptance Criteria

1. THE System SHALL organize the dashboard into six primary tabs
2. THE System SHALL provide an Overview tab displaying executive KPIs and temporal trends
3. THE System SHALL provide a Heatmap tab displaying the visual flow graph with behavior overlays
4. THE System SHALL provide a Funnel & Paths tab displaying conversion funnels and path comparisons
5. THE System SHALL provide a Sessions tab displaying detailed session list and replay functionality
6. THE System SHALL provide an Alerts tab displaying quality alerts and recommendations
7. THE System SHALL provide a Performance tab displaying technical performance metrics
8. THE System SHALL persist the active tab selection in URL query parameters
9. THE System SHALL display notification badges on tabs when new alerts or issues are detected
10. THE System SHALL support keyboard navigation between tabs

### Requirement 17: Real-time Data Updates

**User Story:** As a monitoring operator, I want the dashboard to update automatically, so that I always see current data without manual refresh.

#### Acceptance Criteria

1. THE System SHALL refresh executive KPIs every 30 seconds
2. THE System SHALL refresh session list data every 5 seconds
3. THE System SHALL refresh heatmap data every 60 seconds
4. THE System SHALL refresh alert data every 15 seconds
5. THE System SHALL use SWR for efficient data fetching with deduplication
6. THE System SHALL display loading indicators during data refresh
7. THE System SHALL maintain user scroll position during automatic updates
8. THE System SHALL pause automatic updates when the browser tab is not visible
9. THE System SHALL resume automatic updates when the browser tab becomes visible
10. THE System SHALL allow users to manually trigger immediate refresh

### Requirement 18: Responsive Design and Accessibility

**User Story:** As a mobile user, I want the dashboard to work well on different screen sizes, so that I can monitor flows from any device.

#### Acceptance Criteria

1. THE System SHALL use responsive Tailwind CSS classes for all components
2. THE System SHALL adapt card layouts for mobile, tablet, and desktop viewports
3. THE System SHALL use ScrollArea components for tables and long content
4. THE System SHALL ensure all interactive elements have appropriate touch targets (minimum 44x44px)
5. THE System SHALL support keyboard navigation for all interactive elements
6. THE System SHALL provide appropriate ARIA labels for screen readers
7. THE System SHALL ensure color contrast meets WCAG AA standards
8. THE System SHALL display charts responsively with appropriate scaling
9. THE System SHALL collapse complex visualizations into simplified views on mobile
10. THE System SHALL test compatibility with Chrome, Firefox, Safari, and Edge browsers

### Requirement 19: API Endpoints for Analytics

**User Story:** As a backend developer, I want well-defined API endpoints for analytics data, so that the dashboard can efficiently fetch aggregated metrics.

#### Acceptance Criteria

1. THE System SHALL provide an endpoint for executive KPI metrics at `/api/admin/mtf-diamante/flow-analytics/kpis`
2. THE System SHALL provide an endpoint for heatmap data at `/api/admin/mtf-diamante/flow-analytics/heatmap`
3. THE System SHALL provide an endpoint for funnel data at `/api/admin/mtf-diamante/flow-analytics/funnel`
4. THE System SHALL provide an endpoint for path analysis at `/api/admin/mtf-diamante/flow-analytics/paths`
5. THE System SHALL provide an endpoint for session replay at `/api/admin/mtf-diamante/flow-analytics/sessions/:sessionId`
6. THE System SHALL provide an endpoint for alerts at `/api/admin/mtf-diamante/flow-analytics/alerts`
7. THE System SHALL provide an endpoint for temporal analysis at `/api/admin/mtf-diamante/flow-analytics/temporal`
8. THE System SHALL provide an endpoint for node metrics at `/api/admin/mtf-diamante/flow-analytics/node-metrics`
9. THE System SHALL support query parameters for filtering (inboxId, flowId, dateRange, status)
10. THE System SHALL implement caching for expensive aggregation queries

### Requirement 20: Performance Optimization

**User Story:** As a system administrator, I want the dashboard to load quickly and perform efficiently, so that users have a smooth experience even with large datasets.

#### Acceptance Criteria

1. THE System SHALL cache aggregated metrics for 30 seconds to reduce database load
2. THE System SHALL use database indexes on frequently queried fields (flowId, inboxId, status, createdAt)
3. THE System SHALL paginate session lists with a default page size of 50
4. THE System SHALL lazy-load chart components to improve initial page load time
5. THE System SHALL use React.memo for expensive component renders
6. THE System SHALL debounce filter changes to avoid excessive API calls
7. THE System SHALL implement virtual scrolling for large session lists
8. THE System SHALL compress API responses using gzip
9. THE System SHALL monitor and log slow queries (>1000ms) for optimization
10. THE System SHALL display performance metrics in the Performance tab for self-monitoring
