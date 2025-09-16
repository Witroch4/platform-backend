-- AlterTable
ALTER TABLE "public"."IntentHitLog" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."InteractiveContent" ADD COLUMN     "genericPayload" JSONB;

-- AlterTable
ALTER TABLE "public"."LlmAudit" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';
