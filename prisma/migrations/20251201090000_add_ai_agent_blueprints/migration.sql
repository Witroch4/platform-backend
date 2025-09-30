-- CreateEnum
CREATE TYPE "AiAgentType" AS ENUM ('TOOLS', 'OPENAI_FUNCTIONS', 'PLAN_AND_EXECUTE', 'REACT', 'CUSTOM');

-- CreateTable
CREATE TABLE "AiAgentBlueprint" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentType" "AiAgentType" NOT NULL DEFAULT 'TOOLS',
    "icon" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "maxOutputTokens" INTEGER DEFAULT 1024,
    "systemPrompt" TEXT,
    "instructions" TEXT,
    "toolset" JSONB,
    "outputParser" JSONB,
    "memory" JSONB,
    "canvasState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentBlueprint_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiAgentBlueprint" ADD CONSTRAINT "AiAgentBlueprint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AiAgentBlueprint_ownerId_idx" ON "AiAgentBlueprint"("ownerId");
CREATE INDEX "AiAgentBlueprint_agentType_idx" ON "AiAgentBlueprint"("agentType");
