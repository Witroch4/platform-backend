-- AlterTable
ALTER TABLE "LeadChatwit"
ADD COLUMN     "seccional" TEXT,
ADD COLUMN     "areaJuridica" TEXT,
ADD COLUMN     "notaFinal" DOUBLE PRECISION,
ADD COLUMN     "situacao" TEXT,
ADD COLUMN     "inscricao" TEXT,
ADD COLUMN     "examesParticipados" JSONB;
