-- CreateEnum
CREATE TYPE "LinkedColumn" AS ENUM ('PROVA_CELL', 'ESPELHO_CELL', 'ANALISE_CELL', 'RECURSO_CELL');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'GEMINI');

-- AlterTable
ALTER TABLE "AiAgentBlueprint" ADD COLUMN "linkedColumn" "LinkedColumn";
ALTER TABLE "AiAgentBlueprint" ADD COLUMN "defaultProvider" "AiProvider";

-- CreateIndex
CREATE INDEX "AiAgentBlueprint_linkedColumn_idx" ON "AiAgentBlueprint"("linkedColumn");
