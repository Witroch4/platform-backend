-- AlterTable
ALTER TABLE "public"."AiAssistant" ADD COLUMN     "enableAutoRemarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remarketingDelayMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "remarketingMessage" TEXT;
