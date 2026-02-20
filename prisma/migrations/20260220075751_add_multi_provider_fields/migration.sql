-- CreateEnum
CREATE TYPE "FlowCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FlowCampaignContactStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "AiProvider" ADD VALUE 'CLAUDE';

-- DropIndex
DROP INDEX "Message_chatId_createdAt_idx";

-- AlterTable
ALTER TABLE "AiAssistant" ADD COLUMN     "fallbackModel" TEXT,
ADD COLUMN     "fallbackProvider" "AiProvider",
ADD COLUMN     "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI';

-- CreateTable
CREATE TABLE "FlowCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "status" "FlowCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimit" INTEGER NOT NULL DEFAULT 30,
    "priorityLevel" INTEGER NOT NULL DEFAULT 8,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowCampaignContact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactName" TEXT,
    "status" "FlowCampaignContactStatus" NOT NULL DEFAULT 'PENDING',
    "sessionId" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "variables" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "FlowCampaignContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowCampaign_inboxId_status_idx" ON "FlowCampaign"("inboxId", "status");

-- CreateIndex
CREATE INDEX "FlowCampaign_scheduledAt_idx" ON "FlowCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "FlowCampaign_status_idx" ON "FlowCampaign"("status");

-- CreateIndex
CREATE INDEX "FlowCampaignContact_campaignId_status_idx" ON "FlowCampaignContact"("campaignId", "status");

-- CreateIndex
CREATE INDEX "FlowCampaignContact_contactId_idx" ON "FlowCampaignContact"("contactId");

-- AddForeignKey
ALTER TABLE "FlowCampaign" ADD CONSTRAINT "FlowCampaign_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowCampaignContact" ADD CONSTRAINT "FlowCampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FlowCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
