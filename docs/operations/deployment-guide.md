# Sistema Refatoração Prisma - Deployment Guide

## Overview

This guide covers the deployment of the refactored ChatWit system with the new unified Prisma model, high-performance webhook processing, and comprehensive monitoring.

## Prerequisites

### System Requirements
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- Docker and Docker Compose (recommended)
- Minimum 4GB RAM
- Minimum 2 CPU cores

### Environment Variables

Create the following environment files:

#### `.env.production`
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/chatwit_prod"

# Redis
REDIS_URL="redis://localhost:6379"

# WhatsApp API
WHATSAPP_API_BASE_URL="https://graph.facebook.com/v18.0"

# Monitoring
MONITORING_ENABLED=true
APM_SAMPLE_RATE=1.0

# Queue Configuration
RESPOSTA_RAPIDA_CONCURRENCY=10
PERSISTENCIA_CREDENCIAIS_CONCURRENCY=5

# Cache Configuration
CACHE_TTL_CREDENTIALS=3600
CACHE_TTL_CREDENTIALS_UPDATED=1800

# Performance Thresholds
WEBHOOK_RESPONSE_TIME_THRESHOLD=100
WORKER_PROCESSING_TIME_THRESHOLD=5000
DATABASE_QUERY_TIME_THRESHOLD=1000
```

## Deployment Steps

### 1. Database Migration

```bash
# Run database migrations
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status

# Generate Prisma client
npx prisma generate
```

### 2. Build Application

```bash
# Install dependencies
npm ci --production

# Build Next.js application
npm run build

# Verify build
npm run start --dry-run
```

### 3. Queue System Setup

#### Start Redis
```bash
# Using Docker
docker run -d --name redis-chatwit \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server --appendonly yes

# Or using system service
sudo systemctl start redis
sudo systemctl enable redis
```

#### Initialize Queue Workers
```bash
# Start high priority worker (resposta-rapida)
npm run worker:resposta-rapida

# Start low priority worker (persistencia-credenciais)  
npm run worker:persistencia

# Or start all workers
npm run workers:start
```

### 4. Monitoring Setup

#### Initialize Monitoring
```bash
# Start monitoring services
npm run monitoring:init

# Verify monitoring health
curl http://localhost:3000/api/admin/monitoring/dashboard
```

#### Configure Alerts
```bash
# Set up alert thresholds (optional - defaults are provided)
export ALERT_WEBHOOK_RESPONSE_TIME=100
export ALERT_WORKER_PROCESSING_TIME=5000
export ALERT_DATABASE_QUERY_TIME=1000
export ALERT_CACHE_HIT_RATE=70
export ALERT_ERROR_RATE=5
export ALERT_QUEUE_DEPTH=100
```

### 5. Application Startup

#### Production Mode
```bash
# Start the application
npm run start

# Or using PM2 (recommended)
pm2 start ecosystem.config.js --env production
```

#### Docker Deployment
```bash
# Build Docker image
docker build -t chatwit-sistema-refatoracao .

# Run with Docker Compose
docker-compose -f docker-compose-prod.yml up -d
```

## Post-Deployment Verification

### 1. Health Checks

```bash
# Application health
curl http://localhost:3000/api/health

# Monitoring health
curl http://localhost:3000/api/admin/monitoring/dashboard

# Queue health
curl http://localhost:3000/api/admin/monitoring/queues

# Database health
curl http://localhost:3000/api/admin/monitoring/database
```

### 2. Performance Verification

```bash
# Test webhook response time
curl -X POST http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "payload"}' \
  -w "Response time: %{time_total}s\n"

# Should respond in < 100ms with 202 Accepted
```

### 3. Queue Verification

```bash
# Check queue status
curl http://localhost:3000/api/admin/monitoring/queues

# Expected response:
# {
#   "overview": {
#     "totalQueues": 2,
#     "activeJobs": 0,
#     "failedJobs": 0
#   }
# }
```

### 4. Cache Verification

```bash
# Check cache health
redis-cli ping
# Expected: PONG

# Check cache keys
redis-cli keys "chatwit:*"
```

## Configuration Management

### Queue Configuration

#### High Priority Queue (resposta-rapida)
```javascript
// lib/queue/resposta-rapida.queue.ts
export const respostaRapidaQueue = new Queue(RESPOSTA_RAPIDA_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    priority: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 50,
    removeOnFail: 25,
  }
});
```

#### Low Priority Queue (persistencia-credenciais)
```javascript
// lib/queue/persistencia-credenciais.queue.ts
export const persistenciaCredenciaisQueue = new Queue(PERSISTENCIA_CREDENCIAIS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    priority: 1,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 100,
    delay: 1000,
  }
});
```

### Cache Configuration

```javascript
// lib/cache/credentials-cache.ts
const TTL = {
  CREDENTIALS: 60 * 60, // 1 hour
  CREDENTIALS_UPDATED: 60 * 30, // 30 minutes
  FALLBACK_CHAIN: 60 * 60 * 24, // 24 hours
  HEALTH: 60 * 5, // 5 minutes
};
```

### Monitoring Configuration

```javascript
// lib/monitoring/application-performance-monitor.ts
export const ALERT_THRESHOLDS = {
  WEBHOOK_RESPONSE_TIME: 100, // ms
  WORKER_PROCESSING_TIME: 5000, // ms
  DATABASE_QUERY_TIME: 1000, // ms
  CACHE_HIT_RATE: 70, // percentage
  ERROR_RATE: 5, // percentage
  QUEUE_DEPTH: 100, // number of jobs
};
```

## Scaling Considerations

### Horizontal Scaling

#### Worker Scaling
```bash
# Scale resposta-rapida workers
for i in {1..5}; do
  pm2 start npm --name "resposta-rapida-$i" -- run worker:resposta-rapida
done

# Scale persistencia workers
for i in {1..3}; do
  pm2 start npm --name "persistencia-$i" -- run worker:persistencia
done
```

#### Application Scaling
```bash
# Scale Next.js application instances
pm2 scale chatwit-app 4
```

### Vertical Scaling

#### Database Optimization
```sql
-- Add indexes for performance
CREATE INDEX CONCURRENTLY idx_chatwit_inbox_inbox_id ON "ChatwitInbox" ("inboxId");
CREATE INDEX CONCURRENTLY idx_lead_source_identifier ON "Lead" ("source", "sourceIdentifier");
CREATE INDEX CONCURRENTLY idx_template_type_scope ON "Template" ("type", "scope");
CREATE INDEX CONCURRENTLY idx_mapeamento_intencao_intent ON "MapeamentoIntencao" ("intentName");
CREATE INDEX CONCURRENTLY idx_mapeamento_botao_button ON "MapeamentoBotao" ("buttonId");
```

#### Redis Optimization
```bash
# Increase Redis memory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Enable persistence
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

## Security Considerations

### Environment Security
```bash
# Secure environment files
chmod 600 .env.production
chown app:app .env.production

# Use secrets management
export DATABASE_URL=$(vault kv get -field=url secret/chatwit/database)
export REDIS_URL=$(vault kv get -field=url secret/chatwit/redis)
```

### Network Security
```bash
# Firewall rules
ufw allow 3000/tcp  # Application port
ufw allow 6379/tcp from 10.0.0.0/8  # Redis (internal only)
ufw allow 5432/tcp from 10.0.0.0/8  # PostgreSQL (internal only)
```

### Application Security
```javascript
// Rate limiting
const rateLimit = require('express-rate-limit');
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many webhook requests'
});
```

## Backup and Recovery

### Database Backup
```bash
# Daily backup
pg_dump -h localhost -U username -d chatwit_prod > backup_$(date +%Y%m%d).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/chatwit"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U username -d chatwit_prod | gzip > "$BACKUP_DIR/chatwit_$DATE.sql.gz"
find "$BACKUP_DIR" -name "chatwit_*.sql.gz" -mtime +7 -delete
```

### Redis Backup
```bash
# Manual backup
redis-cli BGSAVE

# Automated backup
#!/bin/bash
BACKUP_DIR="/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/dump_$DATE.rdb"
find "$BACKUP_DIR" -name "dump_*.rdb" -mtime +3 -delete
```

### Recovery Procedures
```bash
# Database recovery
psql -h localhost -U username -d chatwit_prod < backup_20240127.sql

# Redis recovery
sudo systemctl stop redis
cp /backups/redis/dump_20240127.rdb /var/lib/redis/dump.rdb
sudo systemctl start redis
```

## Rollback Procedures

### Application Rollback
```bash
# Using PM2
pm2 stop chatwit-app
git checkout previous-stable-tag
npm ci --production
npm run build
pm2 start chatwit-app

# Using Docker
docker stop chatwit-sistema-refatoracao
docker run -d --name chatwit-sistema-refatoracao chatwit-sistema-refatoracao:previous-tag
```

### Database Rollback
```bash
# Rollback migrations
npx prisma migrate reset --force
npx prisma migrate deploy --to 20240120000000_previous_migration
```

### Queue Rollback
```bash
# Clear queues if needed
redis-cli FLUSHDB

# Restart workers with previous version
pm2 stop all
pm2 start ecosystem.config.js --env production
```

## Maintenance Windows

### Planned Maintenance
```bash
# 1. Notify users (if applicable)
# 2. Stop accepting new requests
pm2 stop chatwit-app

# 3. Wait for queue processing to complete
while [ $(redis-cli LLEN resposta-rapida) -gt 0 ] || [ $(redis-cli LLEN persistencia-credenciais) -gt 0 ]; do
  echo "Waiting for queues to empty..."
  sleep 10
done

# 4. Stop workers
pm2 stop worker:resposta-rapida
pm2 stop worker:persistencia

# 5. Perform maintenance
# ... maintenance tasks ...

# 6. Start services
pm2 start worker:resposta-rapida
pm2 start worker:persistencia
pm2 start chatwit-app
```

## Troubleshooting

### Common Issues

#### High Response Times
```bash
# Check queue depths
curl http://localhost:3000/api/admin/monitoring/queues

# Scale workers if needed
pm2 scale worker:resposta-rapida +2
```

#### Database Connection Issues
```bash
# Check connection pool
curl http://localhost:3000/api/admin/monitoring/database?action=connections

# Restart application if needed
pm2 restart chatwit-app
```

#### Cache Issues
```bash
# Check Redis health
redis-cli ping

# Clear cache if corrupted
redis-cli FLUSHDB
```

#### Memory Issues
```bash
# Check memory usage
pm2 monit

# Restart if memory leak detected
pm2 restart all
```

## Performance Tuning

### Application Tuning
```javascript
// next.config.js
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Optimize for production
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
};
```

### Database Tuning
```sql
-- PostgreSQL configuration
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();
```

### Redis Tuning
```bash
# Redis configuration
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET tcp-keepalive 60
redis-cli CONFIG SET timeout 300
```

## Monitoring and Alerting

### Key Metrics to Monitor
- Webhook response time (< 100ms)
- Worker processing time (< 5s)
- Database query time (< 1s)
- Cache hit rate (> 70%)
- Queue depth (< 100 jobs)
- Error rate (< 5%)
- Memory usage (< 80%)
- CPU usage (< 80%)

### Alert Configuration
```javascript
// Set up alerts for critical metrics
const alerts = {
  webhookResponseTime: { threshold: 100, severity: 'high' },
  workerProcessingTime: { threshold: 5000, severity: 'medium' },
  databaseQueryTime: { threshold: 1000, severity: 'high' },
  cacheHitRate: { threshold: 70, severity: 'medium' },
  errorRate: { threshold: 5, severity: 'high' },
  queueDepth: { threshold: 100, severity: 'medium' },
};
```

## Support and Maintenance

### Log Locations
- Application logs: `/var/log/chatwit/app.log`
- Worker logs: `/var/log/chatwit/workers.log`
- Database logs: `/var/log/postgresql/postgresql.log`
- Redis logs: `/var/log/redis/redis-server.log`

### Log Rotation
```bash
# Configure logrotate
cat > /etc/logrotate.d/chatwit << EOF
/var/log/chatwit/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 app app
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

### Health Check Endpoints
- Application: `GET /api/health`
- Monitoring: `GET /api/admin/monitoring/dashboard`
- Queues: `GET /api/admin/monitoring/queues`
- Database: `GET /api/admin/monitoring/database`
- Alerts: `GET /api/admin/monitoring/alerts`

This deployment guide provides comprehensive instructions for deploying and maintaining the refactored ChatWit system with optimal performance and reliability.