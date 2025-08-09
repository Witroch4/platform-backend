-- AlterTable
ALTER TABLE "public"."IntentHitLog" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."LlmAudit" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."MapeamentoIntencao" ADD COLUMN     "customVariables" JSONB;
