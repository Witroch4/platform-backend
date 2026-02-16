/*
  Warnings:

  - Made the column `messageType` on table `Message` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'REMOVE_TAG';

-- DropForeignKey
ALTER TABLE "MapeamentoIntencao" DROP CONSTRAINT "MapeamentoIntencao_templateId_fkey";

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "messageType" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FlowSession_createdAt_idx" ON "FlowSession"("createdAt");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
