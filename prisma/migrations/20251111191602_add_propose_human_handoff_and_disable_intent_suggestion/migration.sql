-- AlterTable
ALTER TABLE "public"."AiAssistant" ADD COLUMN     "disableIntentSuggestion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposeHumanHandoff" BOOLEAN NOT NULL DEFAULT true;
