-- AlterEnum
ALTER TYPE "LinkedColumn" ADD VALUE 'ESPELHO_PADRAO_CELL';

-- AlterTable
ALTER TABLE "OabRubric" ADD COLUMN     "pdfUrl" TEXT;
