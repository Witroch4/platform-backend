-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "isCampaign" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Flow_inboxId_isCampaign_isActive_idx" ON "Flow"("inboxId", "isCampaign", "isActive");
