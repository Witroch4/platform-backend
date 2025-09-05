-- AlterTable
ALTER TABLE "public"."AiAssistant" ALTER COLUMN "maxOutputTokens" SET DEFAULT 648,
ALTER COLUMN "warmupDeadlineMs" SET DEFAULT 15000,
ALTER COLUMN "hardDeadlineMs" SET DEFAULT 15000,
ALTER COLUMN "softDeadlineMs" SET DEFAULT 18000;

-- AlterTable
ALTER TABLE "public"."AiDocument" ADD COLUMN     "embedding" vector(1536);

-- AlterTable
ALTER TABLE "public"."IntentHitLog" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."LlmAudit" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- CreateIndex
CREATE INDEX "AiDocument_embedding_idx" ON "public"."AiDocument"("embedding");
