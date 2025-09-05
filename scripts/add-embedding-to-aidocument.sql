-- scripts/add-embedding-to-aidocument.sql
-- Script para adicionar campo embedding ao AiDocument (executar quando estiver pronto)

-- 1. Primeiro, adicione o campo embedding ao schema.prisma:
-- model AiDocument {
--   // ... campos existentes ...
--   embedding        Unsupported("vector(1536)")? // Para embeddings OpenAI
--   // ... resto do model ...
-- }

-- 2. Execute estas migrações SQL:

-- Adicionar a coluna embedding
ALTER TABLE "AiDocument" ADD COLUMN "embedding" vector(1536);

-- Criar índice para busca vetorial eficiente
CREATE INDEX CONCURRENTLY ON "AiDocument" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Função para calcular similaridade (opcional, pode usar diretamente na query)
CREATE OR REPLACE FUNCTION calculate_document_similarity(
  query_embedding vector(1536),
  user_id text,
  assistant_id text DEFAULT NULL,
  limit_results integer DEFAULT 5
)
RETURNS TABLE (
  id text,
  title text,
  content_text text,
  source_url text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d."contentText",
    d."sourceUrl",
    1 - (d.embedding <=> query_embedding) as similarity
  FROM "AiDocument" d
  WHERE 
    d."userId" = user_id 
    AND d."isActive" = true
    AND d.embedding IS NOT NULL
    AND (assistant_id IS NULL OR d."assistantId" = assistant_id)
  ORDER BY d.embedding <=> query_embedding
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
