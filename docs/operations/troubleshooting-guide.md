# Sistema Refatoração Prisma - Troubleshooting Guide

## Overview

This guide provides step-by-step troubleshooting procedures for common issues in the refactored ChatWit system. Issues are organized by component and severity level.

## Quick Diagnostic Commands

### System Health Check
```bash
# Overall system status
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.systemHealth'

# Component status
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.performance'

# Active alerts
curl -s http://localhost:3000/api/admin/monitoring/alerts | jq '.alerts[] | select(.level == "critical" or .level == "error")'
```

### Service Status
```bash
# Application processes
pm2 status

# Database connection
pg_isready -h localhost -p 5432

# Redis connection
redis-cli ping

# Queue status
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.overview'
```

## Webhook Issues

### Issue: Webhook Response Time > 100ms

**Symptoms:**
- Webhook response time alerts
- Dialogflow timeouts
- User experience degradation

**Diagnosis:**
```bash
# Check current response times
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.performance.webhook'

# Check queue depths
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.overview'

# Check active alerts
curl -s http://localhost:3000/api/admin/monitoring/alerts?component=webhook
```

**Solutions:**

1. **Scale Workers:**
```bash
# Scale high priority workers
pm2 scale worker:resposta-rapida +2

# Verify scaling
pm2 status | grep resposta-rapida
```

2. **Check Database Performance:**
```bash
# Check slow queries
curl -s http://localhost:3000/api/admin/monitoring/database?action=slowQueries

# Check database connections
curl -s http://localhost:3000/api/admin/monitoring/database?action=connections
```

3. **Optimize Cache:**
```bash
# Check cache hit rate
redis-cli info stats | grep keyspace_hits

# Warm cache if needed
curl -X POST http://localhost:3000/api/admin/cache/warm
```

4. **Emergency Mitigation:**
```bash
# Temporarily increase webhook timeout (if possible)
export WEBHOOK_TIMEOUT=200

# Restart application
pm2 restart chatwit-app
```

### Issue: Webhook Returning Errors

**Symptoms:**
- 500 errors from webhook endpoint
- Failed webhook processing alerts
- Missing responses to users

**Diagnosis:**
```bash
# Check error logs
pm2 logs chatwit-app --lines 100 | grep ERROR

# Check webhook error rate
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.performance.webhook.successRate'

# Check recent failed requests
curl -s http://localhost:3000/api/admin/monitoring/alerts?component=webhook&level=error
```

**Solutions:**

1. **Check Payload Validation:**
```bash
# Test webhook with sample payload
curl -X POST http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "originalDetectIntentRequest": {
      "payload": {
        "inbox_id": "4",
        "contact_phone": "+5511999999999",
        "whatsapp_api_key": "test_key",
        "phone_number_id": "123456789",
        "business_id": "987654321",
        "wamid": "wamid.test123",
        "contact_source": "webhook"
      }
    },
    "queryResult": {
      "intent": {
        "displayName": "test.intent"
      }
    }
  }'
```

2. **Check Database Connectivity:**
```bash
# Test database connection
npx prisma db pull --preview-feature

# Check database health
curl -s http://localhost:3000/api/admin/monitoring/database
```

3. **Check Queue Connectivity:**
```bash
# Test Redis connection
redis-cli ping

# Check queue health
curl -s http://localhost:3000/api/admin/monitoring/queues
```

4. **Restart Services:**
```bash
# Restart application
pm2 restart chatwit-app

# Restart workers if needed
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia
```

## Queue Issues

### Issue: High Queue Depth

**Symptoms:**
- Queue depth alerts
- Delayed message processing
- Worker performance degradation

**Diagnosis:**
```bash
# Check queue depths
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.queues[] | {name, health}'

# Check worker performance
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.queues[] | {name, performance}'

# Check failed jobs
curl -s http://localhost:3000/api/admin/monitoring/queues?queue=resposta-rapida | jq '.failedJobs'
```

**Solutions:**

1. **Scale Workers:**
```bash
# Scale high priority workers
pm2 scale worker:resposta-rapida +3

# Scale low priority workers
pm2 scale worker:persistencia +2

# Monitor scaling effect
watch -n 5 'curl -s http://localhost:3000/api/admin/monitoring/queues | jq ".overview"'
```

2. **Clean Failed Jobs:**
```bash
# Clean failed jobs from high priority queue
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "cleanFailed"}'

# Clean failed jobs from low priority queue
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "persistencia-credenciais", "action": "cleanFailed"}'
```

3. **Pause Queue Temporarily:**
```bash
# Pause queue to prevent new jobs
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "pause"}'

# Resume after scaling
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "resume"}'
```

### Issue: Workers Not Processing Jobs

**Symptoms:**
- Jobs stuck in waiting state
- No worker activity
- Queue depth increasing

**Diagnosis:**
```bash
# Check worker processes
pm2 status | grep worker

# Check worker logs
pm2 logs worker:resposta-rapida --lines 50
pm2 logs worker:persistencia --lines 50

# Check Redis connectivity
redis-cli ping
redis-cli info clients
```

**Solutions:**

1. **Restart Workers:**
```bash
# Restart all workers
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# Check if workers are processing
pm2 logs worker:resposta-rapida --lines 10
```

2. **Check Redis Connection:**
```bash
# Test Redis connection
redis-cli ping

# Check Redis memory usage
redis-cli info memory

# Restart Redis if needed
sudo systemctl restart redis
```

3. **Check Worker Configuration:**
```bash
# Verify worker configuration
cat worker/init.ts | grep -A 10 "resposta-rapida"

# Check environment variables
env | grep -E "(REDIS|QUEUE|WORKER)"
```

## Database Issues

### Issue: Slow Database Queries

**Symptoms:**
- Database query time alerts
- Slow application response
- High database CPU usage

**Diagnosis:**
```bash
# Check slow queries
curl -s http://localhost:3000/api/admin/monitoring/database?action=slowQueries

# Check database performance
curl -s http://localhost:3000/api/admin/monitoring/database | jq '.dashboard.performance'

# Check database connections
psql -h localhost -U username -d chatwit_prod -c "SELECT count(*) FROM pg_stat_activity;"
```

**Solutions:**

1. **Analyze Slow Queries:**
```sql
-- Connect to database
psql -h localhost -U username -d chatwit_prod

-- Check slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE schemaname = 'public' 
AND n_distinct > 100;
```

2. **Add Missing Indexes:**
```sql
-- Common indexes for the refactored system
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatwit_inbox_inbox_id 
ON "ChatwitInbox" ("inboxId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_source_identifier 
ON "Lead" ("source", "sourceIdentifier");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_template_type_scope 
ON "Template" ("type", "scope");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_intencao_intent 
ON "MapeamentoIntencao" ("intentName", "inboxId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_botao_button 
ON "MapeamentoBotao" ("buttonId");
```

3. **Optimize Database Configuration:**
```sql
-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '512MB';

-- Increase effective cache size
ALTER SYSTEM SET effective_cache_size = '2GB';

-- Optimize checkpoint settings
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Reload configuration
SELECT pg_reload_conf();
```

4. **Clear Slow Query Alert:**
```bash
# Get slow query hash
QUERY_HASH=$(curl -s http://localhost:3000/api/admin/monitoring/database?action=slowQueries | jq -r '.slowQueries[0].queryHash')

# Clear the alert
curl -X POST http://localhost:3000/api/admin/monitoring/database \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"clearSlowQueryAlert\", \"queryHash\": \"$QUERY_HASH\"}"
```

### Issue: Database Connection Pool Exhaustion

**Symptoms:**
- Database connection errors
- Application timeouts
- High connection usage alerts

**Diagnosis:**
```bash
# Check connection usage
curl -s http://localhost:3000/api/admin/monitoring/database?action=connections

# Check active connections
psql -h localhost -U username -d chatwit_prod -c "
SELECT state, count(*) 
FROM pg_stat_activity 
WHERE datname = 'chatwit_prod' 
GROUP BY state;"
```

**Solutions:**

1. **Increase Connection Pool:**
```javascript
// Update prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Add connection pool settings
  connectionLimit = 20
}
```

2. **Kill Long-Running Queries:**
```sql
-- Find long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';

-- Kill specific query
SELECT pg_terminate_backend(PID);
```

3. **Restart Application:**
```bash
# Restart to reset connection pool
pm2 restart chatwit-app

# Monitor connection usage
watch -n 5 'curl -s http://localhost:3000/api/admin/monitoring/database?action=connections'
```

## Cache Issues

### Issue: Low Cache Hit Rate

**Symptoms:**
- Cache hit rate alerts (< 70%)
- Increased database load
- Slower response times

**Diagnosis:**
```bash
# Check cache statistics
redis-cli info stats | grep -E "(keyspace_hits|keyspace_misses)"

# Check cache health
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.performance.cache'

# Check cache keys
redis-cli keys "chatwit:*" | wc -l
```

**Solutions:**

1. **Warm Cache:**
```bash
# Warm frequently accessed credentials
curl -X POST http://localhost:3000/api/admin/cache/warm

# Check cache warming effect
redis-cli info stats | grep keyspace_hits
```

2. **Increase Cache TTL:**
```javascript
// Update lib/cache/credentials-cache.ts
const TTL = {
  CREDENTIALS: 60 * 60 * 2, // Increase to 2 hours
  CREDENTIALS_UPDATED: 60 * 60, // Increase to 1 hour
  FALLBACK_CHAIN: 60 * 60 * 48, // Increase to 48 hours
};
```

3. **Check Cache Invalidation:**
```bash
# Check cache invalidation patterns
redis-cli monitor | grep -E "(DEL|EXPIRE)"

# Check for excessive invalidation
pm2 logs chatwit-app | grep "cache.*invalidat"
```

### Issue: Cache Connection Failures

**Symptoms:**
- Cache connection alerts
- Redis connection errors
- Fallback to database queries

**Diagnosis:**
```bash
# Test Redis connection
redis-cli ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Check Redis memory usage
redis-cli info memory
```

**Solutions:**

1. **Restart Redis:**
```bash
# Restart Redis service
sudo systemctl restart redis

# Verify restart
redis-cli ping
```

2. **Check Redis Configuration:**
```bash
# Check Redis configuration
redis-cli config get "*"

# Check memory settings
redis-cli config get maxmemory
redis-cli config get maxmemory-policy
```

3. **Clear Corrupted Cache:**
```bash
# Clear all cache (use with caution)
redis-cli flushdb

# Warm cache after clearing
curl -X POST http://localhost:3000/api/admin/cache/warm
```

## Worker Performance Issues

### Issue: High Worker Processing Time

**Symptoms:**
- Worker processing time alerts (> 5s)
- Job timeouts
- Queue backlog

**Diagnosis:**
```bash
# Check worker performance
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.queues[] | {name, performance}'

# Check slow jobs
curl -s http://localhost:3000/api/admin/monitoring/queues?queue=resposta-rapida | jq '.slowJobs'

# Check worker logs
pm2 logs worker:resposta-rapida | grep -E "(processing|time|slow)"
```

**Solutions:**

1. **Optimize Worker Logic:**
```bash
# Check for database query optimization opportunities
curl -s http://localhost:3000/api/admin/monitoring/database?action=slowQueries

# Profile worker performance
pm2 logs worker:resposta-rapida --lines 100 | grep "processing time"
```

2. **Scale Workers:**
```bash
# Add more worker instances
pm2 scale worker:resposta-rapida +2

# Monitor performance improvement
watch -n 10 'curl -s http://localhost:3000/api/admin/monitoring/queues | jq ".queues[] | select(.name == \"resposta-rapida\") | .performance"'
```

3. **Optimize Database Queries:**
```sql
-- Add indexes for worker queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_intencao_lookup 
ON "MapeamentoIntencao" ("intentName", "inboxId") 
INCLUDE ("templateId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_botao_lookup 
ON "MapeamentoBotao" ("buttonId") 
INCLUDE ("actionType", "actionPayload");
```

### Issue: Worker Memory Leaks

**Symptoms:**
- Increasing memory usage
- Worker crashes
- Out of memory errors

**Diagnosis:**
```bash
# Check memory usage
pm2 monit

# Check for memory leaks
pm2 logs worker:resposta-rapida | grep -E "(memory|heap|leak)"

# Check process memory
ps aux | grep -E "(worker|node)" | awk '{print $2, $4, $11}' | sort -k2 -nr
```

**Solutions:**

1. **Restart Workers:**
```bash
# Restart workers to clear memory
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# Monitor memory usage
pm2 monit
```

2. **Optimize Worker Code:**
```javascript
// Add memory cleanup in worker tasks
export async function processRespostaRapidaTask(job) {
  try {
    // ... processing logic ...
  } finally {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}
```

3. **Configure Memory Limits:**
```bash
# Set memory limits for workers
pm2 start worker/init.ts --name worker:resposta-rapida --max-memory-restart 500M
pm2 start worker/init.ts --name worker:persistencia --max-memory-restart 300M
```

## Application Issues

### Issue: High Error Rate

**Symptoms:**
- Error rate alerts (> 5%)
- Multiple component failures
- User-facing errors

**Diagnosis:**
```bash
# Check overall error rate
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.systemHealth'

# Check error alerts
curl -s http://localhost:3000/api/admin/monitoring/alerts?level=error

# Check application logs
pm2 logs chatwit-app --lines 100 | grep -E "(ERROR|FATAL|Exception)"
```

**Solutions:**

1. **Identify Error Sources:**
```bash
# Check component-specific errors
curl -s http://localhost:3000/api/admin/monitoring/alerts | jq '.alerts[] | select(.level == "error") | {component, message}'

# Check error patterns
pm2 logs chatwit-app | grep ERROR | tail -20
```

2. **Restart Affected Components:**
```bash
# Restart application
pm2 restart chatwit-app

# Restart workers
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# Check if errors persist
sleep 30
curl -s http://localhost:3000/api/admin/monitoring/alerts?level=error
```

3. **Check External Dependencies:**
```bash
# Test WhatsApp API connectivity
curl -I https://graph.facebook.com/v18.0/

# Test database connectivity
pg_isready -h localhost -p 5432

# Test Redis connectivity
redis-cli ping
```

### Issue: Memory Usage High

**Symptoms:**
- High memory usage alerts
- Application slowdown
- Potential out of memory errors

**Diagnosis:**
```bash
# Check memory usage
free -h
pm2 monit

# Check application memory
ps aux | grep node | awk '{print $2, $4, $11}' | sort -k2 -nr

# Check for memory leaks
pm2 logs chatwit-app | grep -E "(memory|heap|gc)"
```

**Solutions:**

1. **Restart Application:**
```bash
# Restart to clear memory
pm2 restart chatwit-app

# Monitor memory usage
watch -n 5 'free -h && echo "---" && pm2 list | grep chatwit'
```

2. **Optimize Memory Usage:**
```javascript
// Add memory optimization to next.config.js
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Optimize memory usage
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
};
```

3. **Configure Memory Limits:**
```bash
# Set memory limits
pm2 start npm --name chatwit-app --max-memory-restart 1G -- start

# Enable garbage collection
pm2 start npm --name chatwit-app --node-args="--max-old-space-size=1024" -- start
```

## Emergency Procedures

### Complete System Failure

**Immediate Actions:**
```bash
# 1. Check system resources
df -h
free -h
top

# 2. Check critical services
sudo systemctl status postgresql
sudo systemctl status redis
pm2 status

# 3. Restart critical services
sudo systemctl restart postgresql
sudo systemctl restart redis
pm2 restart all

# 4. Check logs for root cause
sudo tail -f /var/log/syslog
pm2 logs --lines 100
```

### Database Corruption

**Recovery Steps:**
```bash
# 1. Stop application
pm2 stop all

# 2. Check database integrity
psql -h localhost -U username -d chatwit_prod -c "SELECT pg_database_size('chatwit_prod');"

# 3. Restore from backup if needed
pg_dump -h localhost -U username -d chatwit_prod > emergency_backup.sql
psql -h localhost -U username -d chatwit_prod < latest_backup.sql

# 4. Restart services
pm2 start all
```

### Queue System Failure

**Recovery Steps:**
```bash
# 1. Check Redis status
redis-cli ping

# 2. Backup queue data
redis-cli BGSAVE

# 3. Clear corrupted queues if needed
redis-cli FLUSHDB

# 4. Restart workers
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# 5. Monitor queue recovery
watch -n 5 'curl -s http://localhost:3000/api/admin/monitoring/queues | jq ".overview"'
```

## Prevention and Monitoring

### Proactive Monitoring Setup

```bash
# Set up monitoring alerts
curl -X POST http://localhost:3000/api/admin/monitoring/alerts/configure \
  -H "Content-Type: application/json" \
  -d '{
    "webhookResponseTime": {"threshold": 100, "enabled": true},
    "workerProcessingTime": {"threshold": 5000, "enabled": true},
    "databaseQueryTime": {"threshold": 1000, "enabled": true},
    "cacheHitRate": {"threshold": 70, "enabled": true},
    "errorRate": {"threshold": 5, "enabled": true},
    "queueDepth": {"threshold": 100, "enabled": true}
  }'
```

### Regular Health Checks

```bash
#!/bin/bash
# health-check.sh - Run every 5 minutes via cron

# Check system health
HEALTH=$(curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq -r '.systemHealth.status')

if [ "$HEALTH" != "healthy" ]; then
  echo "System health is $HEALTH - investigating..."
  
  # Check components
  curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.performance'
  
  # Check alerts
  curl -s http://localhost:3000/api/admin/monitoring/alerts?level=critical
fi
```

### Log Analysis

```bash
# Set up log analysis for common issues
grep -E "(ERROR|FATAL|timeout|connection.*failed)" /var/log/chatwit/*.log | \
  awk '{print $1, $2, $3}' | sort | uniq -c | sort -nr | head -10
```

This troubleshooting guide provides comprehensive procedures for diagnosing and resolving issues in the refactored ChatWit system. Regular use of these procedures will help maintain system reliability and performance.