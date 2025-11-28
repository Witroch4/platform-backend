-- AlterTable
ALTER TABLE "public"."ArquivoLeadOab" ADD COLUMN     "chatwitFileId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ArquivoLeadOab_chatwitFileId_key" ON "public"."ArquivoLeadOab"("chatwitFileId");
