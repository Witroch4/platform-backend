# Semantic Search with HNSW Indexes

This module implements semantic search using pgvector with HNSW (Hierarchical Navigable Small World) indexes for optimal performance.

## Overview

The semantic search system enables finding similar case movements and timeline events based on semantic meaning rather than exact keyword matches. This is powered by:

1. **OpenAI Embeddings**: Text is converted to 1536-dimensional vectors using `text-embedding-3-small`
2. **pgvector**: PostgreSQL extension for storing and querying vector embeddings
3. **HNSW Indexes**: Approximate nearest neighbor algorithm for fast similarity search

## Architecture

### Components

- **EmbeddingService** (`workers/tasks/embeddings.py`): Generates embeddings asynchronously
- **SemanticSearchService** (`services/search/semantic.py`): Performs similarity searches
- **HNSW Indexes** (`alembic/versions/001_*.py`): Database indexes for performance

### Data Flow

```
1. New Movement/Event Created
   ↓
2. Enqueue Embedding Generation Task (Taskiq)
   ↓
3. Generate Embedding (OpenAI API)
   ↓
4. Store Embedding in Database (pgvector)
   ↓
5. HNSW Index Updated Automatically
   ↓
6. Ready for Semantic Search
```

## HNSW Index Configuration

### Parameters

The HNSW indexes are configured with:

- **m = 16**: Maximum number of connections per layer
  - Higher values = better recall, more memory usage
  - 16 is optimal for 1536-dimensional vectors
  
- **ef_construction = 64**: Size of dynamic candidate list during construction
  - Higher values = better index quality, slower build time
  - 64 provides good balance for our use case

### Performance Characteristics

With 10,000+ vectors:
- **Top-10 search**: < 100ms
- **Top-100 search**: < 500ms
- **Recall**: > 95% (compared to exact search)

### Why HNSW over IVFFlat?

HNSW is preferred for this application because:

1. **Better Recall**: More accurate results, especially for high-dimensional vectors
2. **Faster Queries**: No need for VACUUM ANALYZE before queries
3. **Consistent Performance**: Works well with datasets of varying sizes
4. **No Training Required**: IVFFlat requires training data and periodic retraining

## Usage

### Generating Embeddings

Embeddings are generated asynchronously using Taskiq workers:

```python
from app.workers.tasks.embeddings import generate_case_movement_embeddings

# Generate embeddings for specific movements
await generate_case_movement_embeddings.kiq(
    tenant_id=str(tenant_id),
    movement_ids=[str(movement_id) for movement_id in movement_ids],
)

# Batch generate for all movements without embeddings
from app.workers.tasks.embeddings import batch_generate_embeddings_for_tenant

await batch_generate_embeddings_for_tenant.kiq(
    tenant_id=str(tenant_id),
    entity_type="movement",
)
```

### Searching

Use the `SemanticSearchService` for similarity searches:

```python
from app.core.services.search.semantic import SemanticSearchService

async with get_session() as session:
    search_service = SemanticSearchService(session)
    
    # Search case movements
    results = await search_service.search_case_movements(
        tenant_id=tenant_id,
        query="sentença favorável ao réu",
        limit=10,
        min_score=0.7,
    )
    
    for result in results:
        print(f"Score: {result.score:.3f}")
        print(f"Movement: {result.entity.description}")
    
    # Find similar cases
    similar_cases = await search_service.find_similar_cases(
        tenant_id=tenant_id,
        reference_case_id=case_id,
        limit=5,
        min_score=0.5,
    )
    
    for case, score in similar_cases:
        print(f"Similar case: {case.cnj_number} (score: {score:.3f})")
```

### Filtering

Semantic search supports various filters:

```python
# Filter by date range
results = await search_service.search_case_movements(
    tenant_id=tenant_id,
    query="recurso de apelação",
    date_from=date(2024, 1, 1),
    date_to=date(2024, 12, 31),
)

# Filter by specific case
results = await search_service.search_case_movements(
    tenant_id=tenant_id,
    query="decisão liminar",
    case_id=case_id,
)

# Filter timeline events by entity
results = await search_service.search_timeline_events(
    tenant_id=tenant_id,
    query="contato com cliente",
    entity_type="client",
    entity_id=client_id,
)
```

## Performance Testing

Run performance tests to verify HNSW index performance:

```bash
# Run all performance tests
pytest tests/performance/test_hnsw_performance.py -v -s -m performance

# Run only fast tests (skip dataset generation)
pytest tests/performance/test_hnsw_performance.py -v -s -m "performance and not slow"
```

## Monitoring

### Index Status

Check HNSW index build progress:

```sql
SELECT * FROM pg_stat_progress_create_index;
```

### Index Size

Monitor index size:

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE indexname LIKE '%hnsw%';
```

### Query Performance

Use EXPLAIN ANALYZE to verify index usage:

```sql
EXPLAIN ANALYZE
SELECT *
FROM case_movements
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

Look for "Index Scan using idx_case_movements_embedding_hnsw" in the output.

## Troubleshooting

### Slow Queries

If queries are slow:

1. Verify index exists: `\d case_movements` in psql
2. Check index is being used: `EXPLAIN ANALYZE` your query
3. Ensure embeddings are not NULL
4. Consider increasing `ef_search` parameter for better recall:
   ```sql
   SET hnsw.ef_search = 100;
   ```

### High Memory Usage

HNSW indexes use more memory than traditional indexes:

- Each vector: 1536 dimensions × 4 bytes = 6KB
- Index overhead: ~2-3x vector size
- For 10k vectors: ~180MB

Monitor with:

```sql
SELECT pg_size_pretty(pg_relation_size('idx_case_movements_embedding_hnsw'));
```

### Index Rebuild

If index becomes corrupted or performance degrades:

```sql
REINDEX INDEX CONCURRENTLY idx_case_movements_embedding_hnsw;
```

## Best Practices

1. **Batch Processing**: Generate embeddings in batches of 50 to respect rate limits
2. **Async Generation**: Always generate embeddings asynchronously to avoid blocking API responses
3. **Retry Logic**: Implement retry with exponential backoff for OpenAI API calls
4. **Tenant Isolation**: Always filter by tenant_id in queries
5. **Score Thresholds**: Use min_score to filter low-quality matches (typically 0.5-0.7)
6. **Monitoring**: Track embedding generation success rate and search performance

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
