-- CreateEnum
CREATE TYPE "QueueState" AS ENUM ('healthy', 'warning', 'critical', 'paused', 'stopped');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'stuck');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'error', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('active', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('counter', 'gauge', 'histogram', 'summary');

-- CreateEnum
CREATE TYPE "TimeGranularity" AS ENUM ('1m', '5m', '1h', '1d', '1w', '1M');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('queue.created', 'queue.updated', 'queue.deleted', 'queue.paused', 'queue.resumed', 'job.created', 'job.started', 'job.completed', 'job.failed', 'job.retried', 'job.removed', 'job.promoted', 'job.delayed', 'flow.started', 'flow.completed', 'flow.failed', 'flow.cancelled', 'alert.triggered', 'alert.acknowledged', 'alert.resolved', 'alert.escalated', 'system.started', 'system.stopped', 'system.error', 'user.login', 'user.logout', 'user.action');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('queue.health.changed', 'job.completed', 'job.failed', 'alert.triggered', 'flow.completed', 'flow.failed');

-- CreateEnum
CREATE TYPE "QueueUserRole" AS ENUM ('viewer', 'operator', 'admin', 'superadmin');

-- CreateTable
CREATE TABLE "QueueConfig" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "rateLimiter" JSONB,
    "retryPolicy" JSONB NOT NULL,
    "cleanupPolicy" JSONB NOT NULL,
    "alertThresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "QueueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMetrics" (
    "id" TEXT NOT NULL,
    "queueName" VARCHAR(255) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "waitingCount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "delayedCount" INTEGER NOT NULL,
    "throughputPerMinute" DECIMAL(10,2),
    "avgProcessingTime" DECIMAL(10,2),
    "successRate" DECIMAL(5,2),
    "errorRate" DECIMAL(5,2),
    "memoryUsage" BIGINT,
    "cpuUsage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMetrics" (
    "id" TEXT NOT NULL,
    "jobId" VARCHAR(255) NOT NULL,
    "queueName" VARCHAR(255) NOT NULL,
    "jobName" VARCHAR(255),
    "jobType" VARCHAR(255),
    "status" "JobState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processingTime" INTEGER,
    "waitTime" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "memoryPeak" BIGINT,
    "cpuTime" INTEGER,
    "errorMessage" TEXT,
    "correlationId" VARCHAR(255),
    "flowId" VARCHAR(255),
    "parentJobId" VARCHAR(255),
    "payloadSize" INTEGER,
    "resultSize" INTEGER,

    CONSTRAINT "JobMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "queueName" VARCHAR(255),
    "condition" JSONB NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "channels" JSONB NOT NULL,
    "cooldown" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "queueName" VARCHAR(255),
    "severity" "AlertSeverity" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "message" TEXT NOT NULL,
    "metrics" JSONB,
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" VARCHAR(255),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFlow" (
    "id" TEXT NOT NULL,
    "flowId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "rootJobId" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedCompletion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "JobFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDependency" (
    "id" TEXT NOT NULL,
    "flowId" VARCHAR(255) NOT NULL,
    "jobId" VARCHAR(255) NOT NULL,
    "parentJobId" VARCHAR(255),
    "dependencyType" VARCHAR(50) NOT NULL DEFAULT 'sequential',
    "condition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(255),

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueUser" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "QueueUserRole" NOT NULL DEFAULT 'viewer',
    "permissions" JSONB,
    "queueAccess" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "QueueUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(255),
    "queueName" VARCHAR(255),
    "details" JSONB,
    "ipAddress" INET,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationPolicy" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "queueName" VARCHAR(255),
    "triggerCondition" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,
    "lastExecuted" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AutomationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "events" JSONB NOT NULL,
    "headers" JSONB,
    "secret" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retryPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" "WebhookEvent" NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueConfig_name_key" ON "QueueConfig"("name");

-- CreateIndex
CREATE INDEX "QueueMetrics_queueName_timestamp_idx" ON "QueueMetrics"("queueName", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "QueueMetrics_timestamp_idx" ON "QueueMetrics"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "JobMetrics_queueName_status_idx" ON "JobMetrics"("queueName", "status");

-- CreateIndex
CREATE INDEX "JobMetrics_correlationId_idx" ON "JobMetrics"("correlationId");

-- CreateIndex
CREATE INDEX "JobMetrics_flowId_idx" ON "JobMetrics"("flowId");

-- CreateIndex
CREATE INDEX "JobMetrics_createdAt_idx" ON "JobMetrics"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "JobFlow_flowId_key" ON "JobFlow"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "QueueUser_userId_key" ON "QueueUser"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;