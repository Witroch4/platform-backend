/*
  Warnings:

  - You are about to drop the column `chavePix` on the `MtfDiamanteConfig` table. All the data in the column will be lost.
  - You are about to drop the column `valorAnalise` on the `MtfDiamanteConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MtfDiamanteConfig" DROP COLUMN "chavePix",
DROP COLUMN "valorAnalise";

-- CreateTable
CREATE TABLE "MtfDiamanteVariavel" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MtfDiamanteVariavel_configId_idx" ON "MtfDiamanteVariavel"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteVariavel_configId_chave_key" ON "MtfDiamanteVariavel"("configId", "chave");

-- AddForeignKey
ALTER TABLE "MtfDiamanteVariavel" ADD CONSTRAINT "MtfDiamanteVariavel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
