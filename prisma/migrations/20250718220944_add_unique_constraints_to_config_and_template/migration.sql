/*
  Warnings:

  - You are about to drop the `integracao_dialogflow` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[usuarioChatwitId,caixaEntradaId]` on the table `WhatsAppConfig` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[templateId,usuarioChatwitId]` on the table `WhatsAppTemplate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `phoneNumberId` to the `WhatsAppConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `caixaEntradaId` to the `mensagem_interativa` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "WhatsAppConfig" DROP CONSTRAINT "WhatsAppConfig_caixaEntradaId_fkey";

-- DropForeignKey
ALTER TABLE "integracao_dialogflow" DROP CONSTRAINT "integracao_dialogflow_usuarioChatwitId_fkey";

-- DropIndex
DROP INDEX "WhatsAppConfig_caixaEntradaId_idx";

-- DropIndex
DROP INDEX "WhatsAppConfig_usuarioChatwitId_idx";

-- DropIndex
DROP INDEX "WhatsAppTemplate_name_idx";

-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "phoneNumberId" TEXT NOT NULL,
ALTER COLUMN "fbGraphApiBase" SET DEFAULT 'https://graph.facebook.com/v22.0';

-- AlterTable
ALTER TABLE "caixa_entrada" ADD COLUMN     "fallbackParaCaixaId" TEXT;

-- AlterTable
ALTER TABLE "mensagem_interativa" ADD COLUMN     "caixaEntradaId" TEXT NOT NULL,
ADD COLUMN     "nome" TEXT;

-- DropTable
DROP TABLE "integracao_dialogflow";

-- CreateTable
CREATE TABLE "MapeamentoIntencao" (
    "id" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "caixaEntradaId" TEXT NOT NULL,
    "templateId" TEXT,
    "mensagemInterativaId" TEXT,

    CONSTRAINT "MapeamentoIntencao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoIntencao_intentName_caixaEntradaId_key" ON "MapeamentoIntencao"("intentName", "caixaEntradaId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_usuarioChatwitId_caixaEntradaId_key" ON "WhatsAppConfig"("usuarioChatwitId", "caixaEntradaId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_templateId_usuarioChatwitId_key" ON "WhatsAppTemplate"("templateId", "usuarioChatwitId");

-- AddForeignKey
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_interativa" ADD CONSTRAINT "mensagem_interativa_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_entrada" ADD CONSTRAINT "caixa_entrada_fallbackParaCaixaId_fkey" FOREIGN KEY ("fallbackParaCaixaId") REFERENCES "caixa_entrada"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_mensagemInterativaId_fkey" FOREIGN KEY ("mensagemInterativaId") REFERENCES "mensagem_interativa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
