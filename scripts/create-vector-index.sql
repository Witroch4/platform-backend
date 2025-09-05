-- scripts/create-vector-index.sql
-- Cria índice vetorial otimizado para busca semântica

-- Criar índice IVFFlat para busca vetorial eficiente
-- Ajuste o parâmetro 'lists' baseado no número de documentos:
-- - Até 1M documentos: lists = 100
-- - 1M+ documentos: lists = sqrt(number_of_rows)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aidocument_embedding_ivfflat 
ON "AiDocument" USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Criar índice HNSW como alternativa (melhor para precisão, PostgreSQL 17+)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aidocument_embedding_hnsw 
-- ON "AiDocument" USING hnsw (embedding vector_cosine_ops) 
-- WITH (m = 16, ef_construction = 64);

-- Verificar se os índices foram criados
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'AiDocument' 
AND indexname LIKE '%embedding%';
