-- Migration: Add indexes for Flow Analytics Dashboard performance
-- Validates Requirement 20.2: Database indexes on frequently queried fields

-- FlowSession indexes for analytics queries
CREATE INDEX IF NOT EXISTS "FlowSession_flowId_status_idx" ON "FlowSession"("flowId", "status");
CREATE INDEX IF NOT EXISTS "FlowSession_flowId_createdAt_idx" ON "FlowSession"("flowId", "createdAt");
CREATE INDEX IF NOT EXISTS "FlowSession_status_updatedAt_idx" ON "FlowSession"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "FlowSession_createdAt_idx" ON "FlowSession"("createdAt");

-- Flow indexes for inbox filtering
CREATE INDEX IF NOT EXISTS "Flow_inboxId_isActive_idx" ON "Flow"("inboxId", "isActive");

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS "FlowSession_flowId_status_createdAt_idx" ON "FlowSession"("flowId", "status", "createdAt");

-- Comments explaining index usage
COMMENT ON INDEX "FlowSession_flowId_status_idx" IS 'Optimizes queries filtering by flow and status';
COMMENT ON INDEX "FlowSession_flowId_createdAt_idx" IS 'Optimizes date range queries per flow';
COMMENT ON INDEX "FlowSession_status_updatedAt_idx" IS 'Optimizes stuck session detection queries';
COMMENT ON INDEX "FlowSession_createdAt_idx" IS 'Optimizes temporal analysis queries';
COMMENT ON INDEX "Flow_inboxId_isActive_idx" IS 'Optimizes flow listing by inbox';
COMMENT ON INDEX "FlowSession_flowId_status_createdAt_idx" IS 'Optimizes complex analytics queries with multiple filters';
