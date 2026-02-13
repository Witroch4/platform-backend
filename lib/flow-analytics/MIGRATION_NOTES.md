# Flow Analytics Database Migration Notes

## Task 2.1: Create KPI Calculation Service

### Database Index Added

The following index was added to the `FlowSession` model in `prisma/schema.prisma`:

```prisma
model FlowSession {
  // ... existing fields ...
  
  @@index([conversationId])
  @@index([status])
  @@index([flowId])
  @@index([inboxId, status])
  @@index([createdAt])  // ✅ NEW INDEX ADDED
}
```

### Why This Index Is Important

The `createdAt` index is critical for performance when:
1. Filtering flow sessions by date range (common in dashboard queries)
2. Sorting sessions chronologically
3. Calculating time-based metrics (daily/weekly/monthly aggregations)

### Migration Status

⚠️ **Schema drift detected** - The database needs to be synchronized with the schema changes.

### To Apply the Migration

When ready to apply this change to the database, run:

```bash
# Option 1: Create and apply migration (recommended for production)
npx prisma migrate dev --name add_flow_session_created_at_index

# Option 2: Push schema directly (for development only)
npx prisma db push
```

**Note**: The schema drift warning indicates there are other pending changes in the database that need to be resolved first:
- `ActionType` enum has a new `REMOVE_TAG` variant
- `MapeamentoIntencao` table has foreign key changes

These should be addressed before applying this migration.

### Performance Impact

**Before Index:**
- Date range queries: Full table scan O(n)
- Estimated query time for 100k sessions: ~500ms

**After Index:**
- Date range queries: Index scan O(log n)
- Estimated query time for 100k sessions: ~10ms

**Expected Improvement**: 50x faster for date-filtered queries

### Verification

After applying the migration, verify the index exists:

```sql
-- PostgreSQL
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'FlowSession' 
AND indexname LIKE '%createdAt%';
```

Expected output:
```
FlowSession_createdAt_idx | CREATE INDEX "FlowSession_createdAt_idx" ON "FlowSession" USING btree ("createdAt")
```
