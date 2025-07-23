/*
  Warnings:

  - You are about to drop the column `openaiFileId` on the `GeneratedImage` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "GeneratedImage_openaiFileId_idx";

-- AlterTable
ALTER TABLE "GeneratedImage" DROP COLUMN "openaiFileId";

-- CreateTable
CREATE TABLE "ButtonReactionMapping" (
    "id" TEXT NOT NULL,
    "buttonId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButtonReactionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ButtonReactionMapping_buttonId_key" ON "ButtonReactionMapping"("buttonId");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_buttonId_idx" ON "ButtonReactionMapping"("buttonId");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_isActive_idx" ON "ButtonReactionMapping"("isActive");
