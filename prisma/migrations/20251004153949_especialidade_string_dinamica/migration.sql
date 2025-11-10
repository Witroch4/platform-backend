/*
  Warnings:

  - The `especialidade` column on the `LeadOabData` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."LeadOabData" DROP COLUMN "especialidade",
ADD COLUMN     "especialidade" TEXT;
