/*
  Warnings:

  - The values [queue.created,queue.updated,queue.deleted,queue.paused,queue.resumed,job.created,job.started,job.completed,job.failed,job.retried,job.removed,job.promoted,job.delayed,flow.started,flow.completed,flow.failed,flow.cancelled,alert.triggered,alert.acknowledged,alert.resolved,alert.escalated,system.started,system.stopped,system.error,user.login,user.logout,user.action] on the enum `EventType` will be removed. If these variants are still used in the database, this will fail.
  - The values [1m,5m,1h,1d,1w,1M] on the enum `TimeGranularity` will be removed. If these variants are still used in the database, this will fail.
  - The values [queue.health.changed,job.completed,job.failed,alert.triggered,flow.completed,flow.failed] on the enum `WebhookEvent` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EventType_new" AS ENUM ('QUEUE_CREATED', 'QUEUE_UPDATED', 'QUEUE_DELETED', 'QUEUE_PAUSED', 'QUEUE_RESUMED', 'JOB_CREATED', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'JOB_RETRIED', 'JOB_REMOVED', 'JOB_PROMOTED', 'JOB_DELAYED', 'FLOW_STARTED', 'FLOW_COMPLETED', 'FLOW_FAILED', 'FLOW_CANCELLED', 'ALERT_TRIGGERED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_ESCALATED', 'SYSTEM_STARTED', 'SYSTEM_STOPPED', 'SYSTEM_ERROR', 'USER_LOGIN', 'USER_LOGOUT', 'USER_ACTION');
ALTER TYPE "EventType" RENAME TO "EventType_old";
ALTER TYPE "EventType_new" RENAME TO "EventType";
DROP TYPE "EventType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TimeGranularity_new" AS ENUM ('ONE_MINUTE', 'FIVE_MINUTES', 'ONE_HOUR', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH');
ALTER TYPE "TimeGranularity" RENAME TO "TimeGranularity_old";
ALTER TYPE "TimeGranularity_new" RENAME TO "TimeGranularity";
DROP TYPE "TimeGranularity_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "WebhookEvent_new" AS ENUM ('QUEUE_HEALTH_CHANGED', 'JOB_COMPLETED', 'JOB_FAILED', 'ALERT_TRIGGERED', 'FLOW_COMPLETED', 'FLOW_FAILED');
ALTER TABLE "WebhookDelivery" ALTER COLUMN "eventType" TYPE "WebhookEvent_new" USING ("eventType"::text::"WebhookEvent_new");
ALTER TYPE "WebhookEvent" RENAME TO "WebhookEvent_old";
ALTER TYPE "WebhookEvent_new" RENAME TO "WebhookEvent";
DROP TYPE "WebhookEvent_old";
COMMIT;

-- AlterTable
ALTER TABLE "LeadOabData" ADD COLUMN     "nomeReal" TEXT;

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "featureFlagContext" JSONB,
    "systemContext" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_name_key" ON "FeatureFlag"("name");

-- CreateIndex
CREATE INDEX "UserFeedback_type_severity_status_idx" ON "UserFeedback"("type", "severity", "status");

-- CreateIndex
CREATE INDEX "UserFeedback_createdAt_idx" ON "UserFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_ruleId_status_idx" ON "Alert"("ruleId", "status");

-- CreateIndex
CREATE INDEX "Alert_severity_createdAt_idx" ON "Alert"("severity", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AlertRule_queueName_enabled_idx" ON "AlertRule"("queueName", "enabled");

-- CreateIndex
CREATE INDEX "AutomationPolicy_enabled_priority_idx" ON "AutomationPolicy"("enabled", "priority");

-- CreateIndex
CREATE INDEX "AutomationPolicy_queueName_idx" ON "AutomationPolicy"("queueName");

-- CreateIndex
CREATE INDEX "JobDependency_flowId_jobId_idx" ON "JobDependency"("flowId", "jobId");

-- CreateIndex
CREATE INDEX "JobFlow_status_createdAt_idx" ON "JobFlow"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "QueueConfig_name_priority_idx" ON "QueueConfig"("name", "priority");

-- CreateIndex
CREATE INDEX "QueueUser_role_email_idx" ON "QueueUser"("role", "email");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE INDEX "WebhookConfig_enabled_idx" ON "WebhookConfig"("enabled");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_eventType_idx" ON "WebhookDelivery"("webhookId", "eventType");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "JobDependency" ADD CONSTRAINT "JobDependency_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "JobFlow"("flowId") ON DELETE RESTRICT ON UPDATE CASCADE;
