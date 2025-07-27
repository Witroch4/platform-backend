# Sistema Refatoração Prisma - Disaster Recovery Procedures

## Overview

This document outlines comprehensive disaster recovery procedures for the refactored ChatWit system. It covers various failure scenarios, recovery strategies, and business continuity measures to ensure minimal downtime and data loss.

## Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO)

### Service Level Objectives
- **Critical Services RTO**: < 15 minutes
- **Non-Critical Services RTO**: < 1 hour
- **Database RPO**: < 5 minutes
- **Cache RPO**: < 1 minute (acceptable loss)
- **Queue RPO**: < 30 seconds

### Service Classifications

#### Critical Services (RTO: < 15 minutes)
- Webhook endpoint
- High priority queue workers
- Database (primary)
- Redis cache

#### Important Services (RTO: < 30 minutes)
- Low priority queue workers
- Monitoring system
- Admin APIs

#### Non-Critical Services (RTO: < 1 hour)
- Reporting systems
- Analytics
- Log aggregation

## Disaster Scenarios and Response Procedures

### Scenario 1: Complete System Failure

**Symptoms:**
- All services unresponsive
- Database connection failures
- Redis connection failures
- Application crashes

**Immediate Response (0-5 minutes):**
```bash
# 1. Assess system status
systemctl status postgresql
systemctl status redis
pm2 status
df -h
free -h
top

# 2. Check system logs
tail -f /var/log/syslog
journalctl -f -u postgresql
journalctl -f -u redis

# 3. Notify stakeholders
echo "System failure detected at $(date)" | mail -s "CRITICAL: System Down" ops-team@company.com
```

**Recovery Steps (5-15 minutes):**
```bash
# 1. Restart critical services
sudo systemctl restart postgresql
sudo systemctl restart redis

# 2. Verify database integrity
psql -h localhost -U username -d chatwit_prod -c "SELECT 1;"

# 3. Restart application services
pm2 restart all

# 4. Verify webhook endpoint
curl -X POST http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "recovery"}' \
  -w "Response time: %{time_total}s\n"

# 5. Check monitoring
curl http://localhost:3000/api/admin/monitoring/dashboard
```

**Verification (15-20 minutes):**
```bash
# 1. Run health checks
curl http://localhost:3000/api/health

# 2. Verify queue processing
curl http://localhost:3000/api/admin/monitoring/queues

# 3. Test end-to-end functionality
./scripts/test-e2e-recovery.sh

# 4. Monitor for 10 minutes
watch -n 30 'curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq ".systemHealth.status"'
```

### Scenario 2: Database Failure

**Symptoms:**
- Database connection errors
- Prisma client failures
- Data inconsistency alerts

**Immediate Response (0-2 minutes):**
```bash
# 1. Check database status
pg_isready -h localhost -p 5432
systemctl status postgresql

# 2. Check database logs
tail -f /var/log/postgresql/postgresql-*.log

# 3. Check disk space
df -h /var/lib/postgresql
```

**Recovery Steps (2-10 minutes):**

**Option A: Service Restart (if corruption is not suspected)**
```bash
# 1. Stop application to prevent further damage
pm2 stop all

# 2. Restart PostgreSQL
sudo systemctl restart postgresql

# 3. Verify database integrity
psql -h localhost -U username -d chatwit_prod -c "
  SELECT datname, pg_database_size(datname) 
  FROM pg_database 
  WHERE datname = 'chatwit_prod';"

# 4. Run integrity checks
psql -h localhost -U username -d chatwit_prod -c "
  SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del 
  FROM pg_stat_user_tables 
  ORDER BY schemaname, tablename;"

# 5. Restart application
pm2 start all
```

**Option B: Database Recovery from Backup (if corruption is detected)**
```bash
# 1. Stop all services
pm2 stop all
sudo systemctl stop postgresql

# 2. Backup current corrupted database
sudo -u postgres pg_dump chatwit_prod > /backups/corrupted_$(date +%Y%m%d_%H%M%S).sql

# 3. Restore from latest backup
sudo systemctl start postgresql
sudo -u postgres dropdb chatwit_prod
sudo -u postgres createdb chatwit_prod
sudo -u postgres psql chatwit_prod < /backups/latest_backup.sql

# 4. Run database migrations if needed
npx prisma migrate deploy

# 5. Verify data integrity
npx prisma db pull
npm run test:database-integrity

# 6. Restart services
pm2 start all
```

**Point-in-Time Recovery (if recent backup is not sufficient):**
```bash
# 1. Stop PostgreSQL
sudo systemctl stop postgresql

# 2. Restore base backup
sudo -u postgres rm -rf /var/lib/postgresql/14/main/*
sudo -u postgres tar -xzf /backups/base_backup_latest.tar.gz -C /var/lib/postgresql/14/main/

# 3. Configure recovery
sudo -u postgres cat > /var/lib/postgresql/14/main/recovery.conf << EOF
restore_command = 'cp /backups/wal_archive/%f %p'
recovery_target_time = '$(date -d "5 minutes ago" "+%Y-%m-%d %H:%M:%S")'
EOF

# 4. Start PostgreSQL in recovery mode
sudo systemctl start postgresql

# 5. Monitor recovery
tail -f /var/log/postgresql/postgresql-*.log | grep recovery

# 6. Promote to primary when recovery is complete
sudo -u postgres psql -c "SELECT pg_promote();"
```

### Scenario 3: Redis Cache Failure

**Symptoms:**
- Cache connection errors
- Degraded performance
- Increased database load

**Immediate Response (0-1 minute):**
```bash
# 1. Check Redis status
redis-cli ping
systemctl status redis

# 2. Check Redis logs
tail -f /var/log/redis/redis-server.log

# 3. Check memory usage
redis-cli info memory
```

**Recovery Steps (1-5 minutes):**
```bash
# 1. Attempt Redis restart
sudo systemctl restart redis

# 2. Verify Redis functionality
redis-cli ping
redis-cli set test_key "test_value"
redis-cli get test_key
redis-cli del test_key

# 3. If restart fails, check configuration
redis-cli config get "*"

# 4. If data corruption is suspected, clear and restart
redis-cli flushall
sudo systemctl restart redis

# 5. Warm cache after restart
curl -X POST http://localhost:3000/api/admin/cache/warm

# 6. Monitor cache performance
watch -n 10 'redis-cli info stats | grep -E "(keyspace_hits|keyspace_misses)"'
```

**Cache Rebuild Strategy:**
```bash
# 1. Identify most accessed keys from application logs
grep "cache.*hit\|cache.*miss" /var/log/chatwit/app.log | \
  awk '{print $NF}' | sort | uniq -c | sort -nr | head -100

# 2. Warm critical credentials
curl -X POST http://localhost:3000/api/admin/cache/warm-credentials \
  -H "Content-Type: application/json" \
  -d '{"inboxIds": ["4", "5", "6", "7", "8"]}'

# 3. Monitor cache hit rate recovery
watch -n 30 'curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq ".performance.cache.hitRate"'
```

### Scenario 4: Queue System Failure

**Symptoms:**
- Jobs stuck in waiting state
- Worker processes crashed
- Queue depth alerts

**Immediate Response (0-2 minutes):**
```bash
# 1. Check worker processes
pm2 status | grep worker

# 2. Check queue status
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.overview'

# 3. Check Redis connectivity (queues depend on Redis)
redis-cli ping
```

**Recovery Steps (2-10 minutes):**
```bash
# 1. Restart worker processes
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# 2. Check for stuck jobs
redis-cli llen resposta-rapida
redis-cli llen persistencia-credenciais

# 3. If jobs are stuck, clear and restart
redis-cli del resposta-rapida
redis-cli del persistencia-credenciais
pm2 restart all

# 4. Monitor queue recovery
watch -n 10 'curl -s http://localhost:3000/api/admin/monitoring/queues | jq ".overview"'

# 5. Test job processing
curl -X POST http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "queue_recovery"}'
```

**Queue Data Recovery:**
```bash
# 1. If queue data needs to be recovered from backup
redis-cli bgsave
cp /var/lib/redis/dump.rdb /backups/redis_before_recovery_$(date +%Y%m%d_%H%M%S).rdb

# 2. Restore from backup if available
sudo systemctl stop redis
cp /backups/redis_latest.rdb /var/lib/redis/dump.rdb
sudo systemctl start redis

# 3. Verify queue restoration
redis-cli llen resposta-rapida
redis-cli llen persistencia-credenciais
```

### Scenario 5: Application Server Failure

**Symptoms:**
- HTTP 502/503 errors
- Process crashes
- Memory/CPU exhaustion

**Immediate Response (0-1 minute):**
```bash
# 1. Check process status
pm2 status
ps aux | grep node

# 2. Check system resources
free -h
df -h
top -n 1

# 3. Check application logs
pm2 logs --lines 50
```

**Recovery Steps (1-10 minutes):**
```bash
# 1. Restart application
pm2 restart all

# 2. If restart fails, check for port conflicts
netstat -tulpn | grep :3000

# 3. If memory issues, clear memory and restart
sync
echo 3 > /proc/sys/vm/drop_caches
pm2 restart all

# 4. If persistent issues, redeploy
git checkout HEAD~1  # Rollback to previous version
npm ci --production
npm run build
pm2 restart all

# 5. Monitor application health
watch -n 10 'curl -s http://localhost:3000/api/health'
```

**Application Recovery with Rollback:**
```bash
# 1. Identify last known good version
git log --oneline -10

# 2. Rollback to stable version
git checkout <stable-commit-hash>

# 3. Rebuild and restart
npm ci --production
npm run build
pm2 restart all

# 4. Verify functionality
./scripts/test-critical-paths.sh

# 5. Monitor for stability
watch -n 30 'curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq ".systemHealth"'
```

### Scenario 6: Network Connectivity Issues

**Symptoms:**
- External API failures
- WhatsApp API timeouts
- Database connection intermittent

**Immediate Response (0-2 minutes):**
```bash
# 1. Test external connectivity
ping 8.8.8.8
curl -I https://graph.facebook.com/v18.0/
nslookup graph.facebook.com

# 2. Check local network
netstat -i
ip route show

# 3. Check firewall rules
iptables -L
ufw status
```

**Recovery Steps (2-15 minutes):**
```bash
# 1. Restart network services
sudo systemctl restart networking
sudo systemctl restart systemd-resolved

# 2. Flush DNS cache
sudo systemctl flush-dns
sudo resolvectl flush-caches

# 3. Test connectivity restoration
ping -c 4 8.8.8.8
curl -I https://graph.facebook.com/v18.0/

# 4. If issues persist, check with ISP/hosting provider
traceroute graph.facebook.com

# 5. Implement temporary workarounds
# - Queue messages for retry when connectivity returns
# - Use alternative DNS servers
# - Implement circuit breaker pattern
```

**Network Recovery Verification:**
```bash
# 1. Test all external dependencies
curl -I https://graph.facebook.com/v18.0/
curl -I https://api.openai.com/v1/
nslookup postgres-server.local

# 2. Test internal connectivity
curl http://localhost:3000/api/health
redis-cli ping
pg_isready -h localhost -p 5432

# 3. Run connectivity tests
./scripts/test-network-connectivity.sh
```

## Data Recovery Procedures

### Database Recovery

**1. Full Database Restore**
```bash
#!/bin/bash
# full-database-restore.sh

set -e

BACKUP_FILE="$1"
DATABASE_NAME="chatwit_prod"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

echo "Starting full database restore at $(date)"

# 1. Stop application
echo "Stopping application..."
pm2 stop all

# 2. Create backup of current database
echo "Creating backup of current database..."
pg_dump -h localhost -U username -d $DATABASE_NAME > "/backups/pre_restore_${TIMESTAMP}.sql"

# 3. Drop and recreate database
echo "Dropping and recreating database..."
dropdb -h localhost -U username $DATABASE_NAME
createdb -h localhost -U username $DATABASE_NAME

# 4. Restore from backup
echo "Restoring from backup: $BACKUP_FILE"
psql -h localhost -U username -d $DATABASE_NAME < "$BACKUP_FILE"

# 5. Run migrations if needed
echo "Running database migrations..."
npx prisma migrate deploy

# 6. Verify data integrity
echo "Verifying data integrity..."
psql -h localhost -U username -d $DATABASE_NAME -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins + n_tup_upd + n_tup_del as total_operations
FROM pg_stat_user_tables 
ORDER BY total_operations DESC 
LIMIT 10;"

# 7. Restart application
echo "Restarting application..."
pm2 start all

# 8. Run health checks
echo "Running health checks..."
sleep 30
curl -f http://localhost:3000/api/health

echo "Database restore completed successfully at $(date)"
```

**2. Selective Table Recovery**
```bash
#!/bin/bash
# selective-table-restore.sh

set -e

BACKUP_FILE="$1"
TABLE_NAME="$2"
DATABASE_NAME="chatwit_prod"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ -z "$BACKUP_FILE" ] || [ -z "$TABLE_NAME" ]; then
    echo "Usage: $0 <backup_file> <table_name>"
    exit 1
fi

echo "Starting selective table restore for $TABLE_NAME at $(date)"

# 1. Backup current table
echo "Backing up current table..."
pg_dump -h localhost -U username -d $DATABASE_NAME -t "$TABLE_NAME" > "/backups/${TABLE_NAME}_pre_restore_${TIMESTAMP}.sql"

# 2. Drop current table data (keep structure)
echo "Truncating table..."
psql -h localhost -U username -d $DATABASE_NAME -c "TRUNCATE TABLE \"$TABLE_NAME\" CASCADE;"

# 3. Extract and restore table data from backup
echo "Extracting table data from backup..."
pg_restore -h localhost -U username -d $DATABASE_NAME -t "$TABLE_NAME" --data-only "$BACKUP_FILE"

# 4. Verify restoration
echo "Verifying table restoration..."
psql -h localhost -U username -d $DATABASE_NAME -c "SELECT COUNT(*) FROM \"$TABLE_NAME\";"

echo "Selective table restore completed successfully at $(date)"
```

### Cache Recovery

**1. Cache Warm-up Script**
```bash
#!/bin/bash
# cache-warmup.sh

set -e

echo "Starting cache warm-up at $(date)"

# 1. Clear existing cache
echo "Clearing existing cache..."
redis-cli flushdb

# 2. Warm up credentials cache
echo "Warming up credentials cache..."
curl -X POST http://localhost:3000/api/admin/cache/warm-credentials

# 3. Warm up template cache
echo "Warming up template cache..."
curl -X POST http://localhost:3000/api/admin/cache/warm-templates

# 4. Warm up mapping cache
echo "Warming up mapping cache..."
curl -X POST http://localhost:3000/api/admin/cache/warm-mappings

# 5. Verify cache performance
echo "Verifying cache performance..."
sleep 10
CACHE_STATS=$(redis-cli info stats | grep -E "(keyspace_hits|keyspace_misses)")
echo "Cache statistics: $CACHE_STATS"

# 6. Calculate hit rate
HITS=$(echo "$CACHE_STATS" | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
MISSES=$(echo "$CACHE_STATS" | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
TOTAL=$((HITS + MISSES))

if [ $TOTAL -gt 0 ]; then
    HIT_RATE=$((HITS * 100 / TOTAL))
    echo "Cache hit rate: ${HIT_RATE}%"
    
    if [ $HIT_RATE -lt 50 ]; then
        echo "WARNING: Cache hit rate is below 50%"
    fi
fi

echo "Cache warm-up completed at $(date)"
```

### Queue Recovery

**1. Queue State Recovery**
```bash
#!/bin/bash
# queue-recovery.sh

set -e

echo "Starting queue recovery at $(date)"

# 1. Check current queue state
echo "Checking current queue state..."
RESPOSTA_RAPIDA_COUNT=$(redis-cli llen resposta-rapida)
PERSISTENCIA_COUNT=$(redis-cli llen persistencia-credenciais)

echo "Current queue depths:"
echo "  resposta-rapida: $RESPOSTA_RAPIDA_COUNT"
echo "  persistencia-credenciais: $PERSISTENCIA_COUNT"

# 2. Backup current queue state
echo "Backing up current queue state..."
redis-cli bgsave
cp /var/lib/redis/dump.rdb "/backups/redis_queue_backup_$(date +%Y%m%d_%H%M%S).rdb"

# 3. Clear stuck jobs if any
if [ $RESPOSTA_RAPIDA_COUNT -gt 1000 ] || [ $PERSISTENCIA_COUNT -gt 2000 ]; then
    echo "WARNING: High queue depths detected. Clearing queues..."
    redis-cli del resposta-rapida
    redis-cli del persistencia-credenciais
fi

# 4. Restart workers
echo "Restarting queue workers..."
pm2 restart worker:resposta-rapida
pm2 restart worker:persistencia

# 5. Monitor queue processing
echo "Monitoring queue processing..."
for i in {1..10}; do
    sleep 10
    RESPOSTA_COUNT=$(redis-cli llen resposta-rapida)
    PERSISTENCIA_COUNT=$(redis-cli llen persistencia-credenciais)
    echo "Iteration $i - resposta-rapida: $RESPOSTA_COUNT, persistencia: $PERSISTENCIA_COUNT"
done

echo "Queue recovery completed at $(date)"
```

## Business Continuity Measures

### 1. Failover Procedures

**Automatic Failover Configuration**
```bash
#!/bin/bash
# setup-failover.sh

# 1. Configure health check script
cat > /usr/local/bin/health-check.sh << 'EOF'
#!/bin/bash

# Check critical services
if ! curl -f -s http://localhost:3000/api/health > /dev/null; then
    echo "Application health check failed"
    exit 1
fi

if ! redis-cli ping > /dev/null 2>&1; then
    echo "Redis health check failed"
    exit 1
fi

if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "Database health check failed"
    exit 1
fi

echo "All services healthy"
exit 0
EOF

chmod +x /usr/local/bin/health-check.sh

# 2. Configure automatic restart on failure
cat > /etc/systemd/system/chatwit-monitor.service << 'EOF'
[Unit]
Description=ChatWit System Monitor
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/chatwit-monitor.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

# 3. Create monitoring script
cat > /usr/local/bin/chatwit-monitor.sh << 'EOF'
#!/bin/bash

while true; do
    if ! /usr/local/bin/health-check.sh; then
        echo "Health check failed, attempting recovery..."
        
        # Attempt automatic recovery
        pm2 restart all
        sleep 30
        
        # Check if recovery was successful
        if /usr/local/bin/health-check.sh; then
            echo "Automatic recovery successful"
        else
            echo "Automatic recovery failed, manual intervention required"
            # Send alert
            echo "CRITICAL: ChatWit system requires manual intervention" | \
                mail -s "CRITICAL: System Recovery Failed" ops-team@company.com
        fi
    fi
    
    sleep 60
done
EOF

chmod +x /usr/local/bin/chatwit-monitor.sh

# 4. Enable and start monitoring service
systemctl enable chatwit-monitor.service
systemctl start chatwit-monitor.service
```

### 2. Data Backup Strategy

**Automated Backup Script**
```bash
#!/bin/bash
# automated-backup.sh

set -e

BACKUP_DIR="/backups/chatwit"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "Starting automated backup at $(date)"

# 1. Create backup directory
mkdir -p "$BACKUP_DIR"

# 2. Database backup
echo "Creating database backup..."
pg_dump -h localhost -U username -d chatwit_prod | gzip > "$BACKUP_DIR/database_$DATE.sql.gz"

# 3. Redis backup
echo "Creating Redis backup..."
redis-cli bgsave
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# 4. Application configuration backup
echo "Creating configuration backup..."
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    .env.production \
    docker-compose-prod.yml \
    ecosystem.config.js \
    /etc/nginx/sites-available/chatwit \
    /etc/systemd/system/chatwit-*.service

# 5. File uploads backup (if any)
if [ -d "/var/chatwit/uploads" ]; then
    echo "Creating uploads backup..."
    tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" /var/chatwit/uploads
fi

# 6. Cleanup old backups
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# 7. Verify backup integrity
echo "Verifying backup integrity..."
if gzip -t "$BACKUP_DIR/database_$DATE.sql.gz"; then
    echo "Database backup verified successfully"
else
    echo "ERROR: Database backup verification failed"
    exit 1
fi

# 8. Upload to remote storage (optional)
if [ -n "$AWS_S3_BUCKET" ]; then
    echo "Uploading to S3..."
    aws s3 cp "$BACKUP_DIR/database_$DATE.sql.gz" "s3://$AWS_S3_BUCKET/chatwit/database/"
    aws s3 cp "$BACKUP_DIR/redis_$DATE.rdb" "s3://$AWS_S3_BUCKET/chatwit/redis/"
    aws s3 cp "$BACKUP_DIR/config_$DATE.tar.gz" "s3://$AWS_S3_BUCKET/chatwit/config/"
fi

echo "Automated backup completed successfully at $(date)"
```

### 3. Communication Plan

**Incident Communication Template**
```bash
#!/bin/bash
# incident-communication.sh

INCIDENT_TYPE="$1"
SEVERITY="$2"
STATUS="$3"
DETAILS="$4"

if [ -z "$INCIDENT_TYPE" ] || [ -z "$SEVERITY" ] || [ -z "$STATUS" ]; then
    echo "Usage: $0 <incident_type> <severity> <status> [details]"
    echo "Severity: critical|high|medium|low"
    echo "Status: investigating|identified|monitoring|resolved"
    exit 1
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S UTC')

# Email notification
EMAIL_SUBJECT="[$SEVERITY] ChatWit System Incident - $INCIDENT_TYPE"
EMAIL_BODY="
Incident Report
===============

Incident Type: $INCIDENT_TYPE
Severity: $SEVERITY
Status: $STATUS
Timestamp: $TIMESTAMP

Details:
$DETAILS

System Status: $(curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq -r '.systemHealth.status' 2>/dev/null || echo 'Unknown')

Next Update: $(date -d '+30 minutes' '+%Y-%m-%d %H:%M:%S UTC')

---
ChatWit Operations Team
"

# Send notifications based on severity
case $SEVERITY in
    "critical")
        echo "$EMAIL_BODY" | mail -s "$EMAIL_SUBJECT" ops-team@company.com
        echo "$EMAIL_BODY" | mail -s "$EMAIL_SUBJECT" management@company.com
        # Send SMS/Slack notifications for critical incidents
        ;;
    "high")
        echo "$EMAIL_BODY" | mail -s "$EMAIL_SUBJECT" ops-team@company.com
        ;;
    "medium"|"low")
        echo "$EMAIL_BODY" | mail -s "$EMAIL_SUBJECT" ops-team@company.com
        ;;
esac

# Log incident
echo "[$TIMESTAMP] $SEVERITY: $INCIDENT_TYPE - $STATUS" >> /var/log/chatwit/incidents.log
```

## Testing and Validation

### 1. Disaster Recovery Testing

**Monthly DR Test Script**
```bash
#!/bin/bash
# dr-test.sh

set -e

TEST_DATE=$(date +%Y%m%d_%H%M%S)
TEST_LOG="/var/log/chatwit/dr_test_$TEST_DATE.log"

echo "Starting Disaster Recovery Test at $(date)" | tee -a "$TEST_LOG"

# 1. Test database backup and restore
echo "Testing database backup and restore..." | tee -a "$TEST_LOG"
pg_dump -h localhost -U username -d chatwit_prod > "/tmp/dr_test_backup_$TEST_DATE.sql"

# Create test database
createdb -h localhost -U username "chatwit_test_$TEST_DATE"
psql -h localhost -U username -d "chatwit_test_$TEST_DATE" < "/tmp/dr_test_backup_$TEST_DATE.sql"

# Verify data integrity
TEST_COUNT=$(psql -h localhost -U username -d "chatwit_test_$TEST_DATE" -t -c "SELECT COUNT(*) FROM \"Lead\";")
PROD_COUNT=$(psql -h localhost -U username -d chatwit_prod -t -c "SELECT COUNT(*) FROM \"Lead\";")

if [ "$TEST_COUNT" -eq "$PROD_COUNT" ]; then
    echo "✓ Database backup/restore test passed" | tee -a "$TEST_LOG"
else
    echo "✗ Database backup/restore test failed" | tee -a "$TEST_LOG"
fi

# Cleanup test database
dropdb -h localhost -U username "chatwit_test_$TEST_DATE"
rm "/tmp/dr_test_backup_$TEST_DATE.sql"

# 2. Test Redis backup and restore
echo "Testing Redis backup and restore..." | tee -a "$TEST_LOG"
redis-cli bgsave
cp /var/lib/redis/dump.rdb "/tmp/redis_backup_$TEST_DATE.rdb"

# Test restore (in a separate Redis instance if available)
echo "✓ Redis backup test completed" | tee -a "$TEST_LOG"

# 3. Test application recovery
echo "Testing application recovery..." | tee -a "$TEST_LOG"
pm2 stop chatwit-app
sleep 5
pm2 start chatwit-app
sleep 30

# Verify application is responding
if curl -f -s http://localhost:3000/api/health > /dev/null; then
    echo "✓ Application recovery test passed" | tee -a "$TEST_LOG"
else
    echo "✗ Application recovery test failed" | tee -a "$TEST_LOG"
fi

# 4. Test monitoring system
echo "Testing monitoring system..." | tee -a "$TEST_LOG"
if curl -f -s http://localhost:3000/api/admin/monitoring/dashboard > /dev/null; then
    echo "✓ Monitoring system test passed" | tee -a "$TEST_LOG"
else
    echo "✗ Monitoring system test failed" | tee -a "$TEST_LOG"
fi

echo "Disaster Recovery Test completed at $(date)" | tee -a "$TEST_LOG"
echo "Test log saved to: $TEST_LOG"
```

### 2. Recovery Time Testing

**RTO/RPO Validation Script**
```bash
#!/bin/bash
# rto-rpo-test.sh

set -e

echo "Starting RTO/RPO validation test at $(date)"

# 1. Simulate system failure
echo "Simulating system failure..."
FAILURE_START=$(date +%s)
pm2 stop all

# 2. Begin recovery process
echo "Starting recovery process..."
RECOVERY_START=$(date +%s)

# Restart services
sudo systemctl restart redis
sudo systemctl restart postgresql
pm2 start all

# 3. Wait for system to be fully operational
echo "Waiting for system recovery..."
while true; do
    if curl -f -s http://localhost:3000/api/health > /dev/null; then
        RECOVERY_END=$(date +%s)
        break
    fi
    sleep 5
done

# 4. Calculate recovery time
RECOVERY_TIME=$((RECOVERY_END - RECOVERY_START))
TOTAL_DOWNTIME=$((RECOVERY_END - FAILURE_START))

echo "Recovery Time Metrics:"
echo "  Recovery Time: ${RECOVERY_TIME} seconds"
echo "  Total Downtime: ${TOTAL_DOWNTIME} seconds"
echo "  RTO Target: 900 seconds (15 minutes)"

if [ $RECOVERY_TIME -le 900 ]; then
    echo "✓ RTO target met"
else
    echo "✗ RTO target exceeded"
fi

# 5. Test data consistency (RPO validation)
echo "Validating data consistency..."
# This would involve checking that recent data is present
# Implementation depends on specific data validation requirements

echo "RTO/RPO validation test completed"
```

## Post-Incident Procedures

### 1. Post-Incident Review

**Incident Report Template**
```markdown
# Incident Report - [INCIDENT_ID]

## Summary
- **Date/Time**: [YYYY-MM-DD HH:MM UTC]
- **Duration**: [X hours Y minutes]
- **Severity**: [Critical/High/Medium/Low]
- **Services Affected**: [List of affected services]
- **Root Cause**: [Brief description]

## Timeline
- **[HH:MM]** - Incident detected
- **[HH:MM]** - Investigation started
- **[HH:MM]** - Root cause identified
- **[HH:MM]** - Fix implemented
- **[HH:MM]** - Service restored
- **[HH:MM]** - Incident resolved

## Impact
- **Users Affected**: [Number/percentage]
- **Revenue Impact**: [If applicable]
- **Data Loss**: [None/Description]
- **SLA Breach**: [Yes/No]

## Root Cause Analysis
[Detailed analysis of what went wrong and why]

## Resolution
[Description of how the incident was resolved]

## Action Items
1. [ ] [Action item 1] - Assigned to [Person] - Due: [Date]
2. [ ] [Action item 2] - Assigned to [Person] - Due: [Date]
3. [ ] [Action item 3] - Assigned to [Person] - Due: [Date]

## Lessons Learned
[What we learned from this incident]

## Prevention Measures
[Steps taken to prevent similar incidents]
```

### 2. System Hardening

**Post-Recovery Hardening Script**
```bash
#!/bin/bash
# post-recovery-hardening.sh

echo "Starting post-recovery system hardening at $(date)"

# 1. Update monitoring thresholds based on incident
echo "Updating monitoring thresholds..."
curl -X POST http://localhost:3000/api/admin/monitoring/configure \
  -H "Content-Type: application/json" \
  -d '{
    "webhookResponseTime": {"threshold": 80, "enabled": true},
    "databaseQueryTime": {"threshold": 800, "enabled": true},
    "memoryUsage": {"threshold": 75, "enabled": true}
  }'

# 2. Increase backup frequency
echo "Updating backup schedule..."
# Update crontab for more frequent backups
(crontab -l 2>/dev/null; echo "*/30 * * * * /usr/local/bin/automated-backup.sh") | crontab -

# 3. Add additional health checks
echo "Adding additional health checks..."
cat >> /usr/local/bin/health-check.sh << 'EOF'

# Additional checks based on recent incident
if ! curl -f -s http://localhost:3000/api/admin/monitoring/queues > /dev/null; then
    echo "Queue monitoring health check failed"
    exit 1
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 85 ]; then
    echo "Disk usage too high: ${DISK_USAGE}%"
    exit 1
fi
EOF

# 4. Update alerting rules
echo "Updating alerting rules..."
# Implementation would depend on your alerting system

echo "Post-recovery hardening completed at $(date)"
```

This comprehensive disaster recovery guide provides detailed procedures for handling various failure scenarios and ensuring business continuity for the refactored ChatWit system. Regular testing and updates of these procedures are essential for maintaining system resilience.