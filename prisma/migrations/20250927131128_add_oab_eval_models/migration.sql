-- AlterTable
ALTER TABLE "public"."AiAgentBlueprint" ALTER COLUMN "temperature" SET DEFAULT 0.7,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."IntentHitLog" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- AlterTable
ALTER TABLE "public"."LlmAudit" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '90 days';

-- CreateTable
CREATE TABLE "public"."OabRubric" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "exam" TEXT,
    "area" TEXT,
    "version" TEXT,
    "meta" JSONB,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OabRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OabSubmission" (
    "id" TEXT NOT NULL,
    "leadOabDataId" TEXT,
    "alunoNome" TEXT,
    "sourcePdfUrl" TEXT,
    "sourceImages" JSONB,
    "rawExtracted" JSONB NOT NULL,
    "chunkConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OabSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OabEvaluationRun" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "strategy" JSONB,
    "scores" JSONB,
    "evidences" JSONB,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OabEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OabSubmission_leadOabDataId_idx" ON "public"."OabSubmission"("leadOabDataId");

-- CreateIndex
CREATE INDEX "OabEvaluationRun_submissionId_idx" ON "public"."OabEvaluationRun"("submissionId");

-- CreateIndex
CREATE INDEX "OabEvaluationRun_rubricId_idx" ON "public"."OabEvaluationRun"("rubricId");

-- AddForeignKey
ALTER TABLE "public"."OabSubmission" ADD CONSTRAINT "OabSubmission_leadOabDataId_fkey" FOREIGN KEY ("leadOabDataId") REFERENCES "public"."LeadOabData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OabEvaluationRun" ADD CONSTRAINT "OabEvaluationRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."OabSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OabEvaluationRun" ADD CONSTRAINT "OabEvaluationRun_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "public"."OabRubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
