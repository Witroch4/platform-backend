-- CreateEnum
CREATE TYPE "FlowSessionStatus" AS ENUM ('ACTIVE', 'WAITING_INPUT', 'COMPLETED', 'ERROR');

-- CreateTable
CREATE TABLE "InboxFlowCanvas" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "canvas" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxFlowCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowNode" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FlowNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowEdge" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "buttonId" TEXT,
    "conditionBranch" TEXT,

    CONSTRAINT "FlowEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowSession" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "status" "FlowSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentNodeId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "executionLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FlowSession_pkey" PRIMARY KEY ("id")
);

-- AlterTable MapeamentoIntencao - add flowId column
ALTER TABLE "MapeamentoIntencao" ADD COLUMN IF NOT EXISTS "flowId" TEXT;

-- AlterTable MapeamentoIntencao - make templateId optional
ALTER TABLE "MapeamentoIntencao" ALTER COLUMN "templateId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InboxFlowCanvas_inboxId_key" ON "InboxFlowCanvas"("inboxId");

-- CreateIndex
CREATE INDEX "Flow_inboxId_isActive_idx" ON "Flow"("inboxId", "isActive");

-- CreateIndex
CREATE INDEX "FlowNode_flowId_idx" ON "FlowNode"("flowId");

-- CreateIndex
CREATE INDEX "FlowEdge_flowId_idx" ON "FlowEdge"("flowId");

-- CreateIndex
CREATE INDEX "FlowEdge_sourceNodeId_idx" ON "FlowEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "FlowEdge_targetNodeId_idx" ON "FlowEdge"("targetNodeId");

-- CreateIndex
CREATE INDEX "FlowSession_conversationId_idx" ON "FlowSession"("conversationId");

-- CreateIndex
CREATE INDEX "FlowSession_status_idx" ON "FlowSession"("status");

-- CreateIndex
CREATE INDEX "FlowSession_flowId_idx" ON "FlowSession"("flowId");

-- CreateIndex
CREATE INDEX "FlowSession_inboxId_status_idx" ON "FlowSession"("inboxId", "status");

-- CreateIndex
CREATE INDEX "MapeamentoIntencao_flowId_idx" ON "MapeamentoIntencao"("flowId");

-- AddForeignKey
ALTER TABLE "InboxFlowCanvas" ADD CONSTRAINT "InboxFlowCanvas_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowNode" ADD CONSTRAINT "FlowNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEdge" ADD CONSTRAINT "FlowEdge_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEdge" ADD CONSTRAINT "FlowEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "FlowNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEdge" ADD CONSTRAINT "FlowEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "FlowNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
