-- CreateEnum
CREATE TYPE "PaymentServiceType" AS ENUM ('ANALISE', 'RECURSO', 'CONSULTORIA_FASE2', 'OUTRO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REFUNDED', 'FAILED');

-- DropIndex
DROP INDEX "Intent_embedding_idx";

-- CreateTable
CREATE TABLE "LeadPayment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER,
    "serviceType" "PaymentServiceType" NOT NULL DEFAULT 'OUTRO',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "captureMethod" TEXT,
    "description" TEXT,
    "receiptUrl" TEXT,
    "externalId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "chatwitConversationId" INTEGER,
    "contactPhone" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadPayment_externalId_key" ON "LeadPayment"("externalId");

-- CreateIndex
CREATE INDEX "LeadPayment_leadId_status_idx" ON "LeadPayment"("leadId", "status");

-- CreateIndex
CREATE INDEX "LeadPayment_externalId_idx" ON "LeadPayment"("externalId");

-- AddForeignKey
ALTER TABLE "LeadPayment" ADD CONSTRAINT "LeadPayment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
