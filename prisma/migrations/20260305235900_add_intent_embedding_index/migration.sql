-- CreateIndex ivfflat (pgvector) - B-tree cannot index vector columns with 1536+ dimensions
-- IF NOT EXISTS is safe: runs even if index was manually created in prod
CREATE INDEX IF NOT EXISTS "Intent_embedding_idx" ON "public"."Intent" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
