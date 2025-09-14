-- AlterTable
ALTER TABLE "public"."IntentHitLog" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."InteractiveContent" ADD COLUMN     "interactiveType" TEXT NOT NULL DEFAULT 'button';

-- AlterTable
ALTER TABLE "public"."LlmAudit" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';
