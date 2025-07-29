# Sistema Refatoração Prisma - Performance Tuning Guide

## Overview

This guide provides comprehensive performance optimization strategies for the refactored ChatWit system. It covers all system components including webhook processing, queue systems, database operations, caching, and monitoring.

## Performance Targets

### System Performance Goals
- **Webhook Response Time**: < 100ms (target: 50ms)
- **Worker Processing Time**: < 5s (target: 2s)
- **Database Query Time**: < 1s (target: 500ms)
- **Cache Hit Rate**: > 70% (target: 85%)
- **System Availability**: > 99.9%
- **Error Rate**: < 5% (target: 1%)

### Throughput Targets
- **Webhook Requests**: 1000 req/min
- **Queue Processing**: 500 jobs/min (high priority), 200 jobs/min (low priority)
- **Database Operations**: 2000 queries/min
- **Cache Operations**: 5000 ops/min

## Webhook Performance Optimization

### 1. Payload Processing Optimization

#### Current Implementation Analysis
```typescript
// Current webhook processing flow
export async function POST(request: Request) {
  const startTime = performance.now();
  
  // 1. Parse JSON payload (5-10ms)
  const req = await request.json();
  
  // 2. Extract and validate data (10-20ms)
  const unifiedData = extractUnifiedWebhookData(req);
  const validation = validateUnifiedWebhookData(unifiedData);
  
  // 3. Generate correlation ID (1ms)
  const correlationId = generateCorrelationId();
  
  // 4. Queue jobs asynchronously (5-15ms)
  setImmediate(() => queueHighPriorityJob(unifiedData, correlationId));
  setImmediate(() => queueLowPriorityJob(unifiedData, correlationId));
  
  // 5. Return response (1-2ms)
  return new Response(JSON.stringify({ correlationId }), { status: 202 });
}
```

#### Optimization Strategies

**1. Payload Size Optimization**
```typescript
// Implement payload size limits
const MAX_PAYLOAD_SIZE = 50 * 1024; // 50KB

export async function POST(request: Request) {
  const contentLength = parseInt(request.headers.get('content-length') || '0');
  
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return new Response('Payload too large', { status: 413 });
  }
  
  // Continue processing...
}
```

**2. Streaming JSON Parser**
```typescript
// Use streaming JSON parser for large payloads
import { JSONParser } from '@streamparser/json';

async function parseStreamingJSON(request: Request) {
  const parser = new JSONParser();
  const reader = request.body?.getReader();
  
  if (!reader) throw new Error('No request body');
  
  let result: any;
  parser.onValue = (value, key, parent) => {
    if (key === undefined) result = value;
  };
  
  const { value } = await reader.read();
  parser.write(value);
  
  return result;
}
```

**3. Validation Optimization**
```typescript
// Pre-compile validation schemas
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: false, coerceTypes: true });

const webhookSchema = {
  type: 'object',
  required: ['originalDetectIntentRequest'],
  properties: {
    originalDetectIntentRequest: {
      type: 'object',
      required: ['payload'],
      properties: {
        payload: {
          type: 'object',
          required: ['inbox_id', 'contact_phone', 'whatsapp_api_key'],
          properties: {
            inbox_id: { type: 'string' },
            contact_phone: { type: 'string' },
            whatsapp_api_key: { type: 'string' },
            phone_number_id: { type: 'string' },
            business_id: { type: 'string' }
          }
        }
      }
    }
  }
};

const validateWebhook = ajv.compile(webhookSchema);

// Use in webhook handler
function validateUnifiedWebhookData(data: any): ValidationResult {
  const valid = validateWebhook(data);
  return {
    isValid: valid,
    errors: valid ? [] : validateWebhook.errors?.map(e => e.message) || []
  };
}
```

### 2. Response Optimization

**1. HTTP/2 Server Push (if supported)**
```typescript
// Enable HTTP/2 server push for monitoring endpoints
export async function POST(request: Request) {
  const response = new Response(JSON.stringify({ correlationId }), {
    status: 202,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Correlation-ID': correlationId,
      // Enable server push for monitoring
      'Link': '</api/admin/monitoring/dashboard>; rel=preload; as=fetch'
    },
  });
  
  return response;
}
```

**2. Connection Keep-Alive**
```typescript
// Configure keep-alive for better connection reuse
const headers = {
  'Content-Type': 'application/json',
  'Connection': 'keep-alive',
  'Keep-Alive': 'timeout=5, max=1000',
  'X-Correlation-ID': correlationId,
};
```

## Queue System Optimization

### 1. Queue Configuration Tuning

#### High Priority Queue (resposta-rapida)
```typescript
// Optimized configuration for high priority queue
export const respostaRapidaQueue = new Queue(RESPOSTA_RAPIDA_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // Highest priority
    priority: 100,
    
    // Aggressive retry policy
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 500, // Reduced from 1000ms
    },
    
    // Optimized cleanup
    removeOnComplete: 25, // Reduced from 50
    removeOnFail: 10, // Reduced from 25
    
    // No delay for immediate processing
    delay: 0,
    
    // Job timeout
    jobTimeout: 30000, // 30 seconds
  },
  
  // Queue-level settings
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Retry stalled jobs once
  }
});
```

#### Low Priority Queue (persistencia-credenciais)
```typescript
// Optimized configuration for low priority queue
export const persistenciaCredenciaisQueue = new Queue(PERSISTENCIA_CREDENCIAIS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // Lower priority
    priority: 1,
    
    // More lenient retry policy
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000, // Reduced from 5000ms
    },
    
    // Keep more for audit trail
    removeOnComplete: 100, // Reduced from 200
    removeOnFail: 50, // Reduced from 100
    
    // Batch processing delay
    delay: 500, // Reduced from 1000ms
    
    // Longer timeout for complex operations
    jobTimeout: 60000, // 60 seconds
  },
  
  // Batch processing settings
  settings: {
    stalledInterval: 60000, // Check every minute
    maxStalledCount: 2,
  }
});
```

### 2. Worker Scaling Strategy

**1. Dynamic Worker Scaling**
```typescript
// Dynamic worker scaling based on queue depth
class DynamicWorkerScaler {
  private static instance: DynamicWorkerScaler;
  private scalingInProgress = false;
  
  static getInstance(): DynamicWorkerScaler {
    if (!this.instance) {
      this.instance = new DynamicWorkerScaler();
    }
    return this.instance;
  }
  
  async checkAndScale(): Promise<void> {
    if (this.scalingInProgress) return;
    
    this.scalingInProgress = true;
    
    try {
      const queueHealth = await getQueueHealth();
      
      // Scale resposta-rapida workers
      const highPriorityDepth = queueHealth['resposta-rapida']?.waiting || 0;
      if (highPriorityDepth > 50) {
        await this.scaleWorkers('resposta-rapida', Math.min(10, Math.ceil(highPriorityDepth / 10)));
      } else if (highPriorityDepth < 10) {
        await this.scaleWorkers('resposta-rapida', Math.max(2, Math.ceil(highPriorityDepth / 5)));
      }
      
      // Scale persistencia workers
      const lowPriorityDepth = queueHealth['persistencia-credenciais']?.waiting || 0;
      if (lowPriorityDepth > 100) {
        await this.scaleWorkers('persistencia', Math.min(5, Math.ceil(lowPriorityDepth / 20)));
      }
      
    } finally {
      this.scalingInProgress = false;
    }
  }
  
  private async scaleWorkers(type: string, targetCount: number): Promise<void> {
    // Implementation would use PM2 API or Kubernetes scaling
    console.log(`Scaling ${type} workers to ${targetCount}`);
  }
}

// Start auto-scaling
setInterval(() => {
  DynamicWorkerScaler.getInstance().checkAndScale();
}, 30000); // Check every 30 seconds
```

**2. Worker Concurrency Optimization**
```typescript
// Optimized worker concurrency settings
const WORKER_CONCURRENCY = {
  'resposta-rapida': {
    concurrency: Math.min(10, Math.max(2, Math.ceil(os.cpus().length * 1.5))),
    limiter: {
      max: 100, // Max 100 jobs per interval
      duration: 60000, // 1 minute interval
    }
  },
  'persistencia': {
    concurrency: Math.min(5, Math.max(1, Math.ceil(os.cpus().length * 0.75))),
    limiter: {
      max: 50, // Max 50 jobs per interval
      duration: 60000, // 1 minute interval
    }
  }
};
```

### 3. Job Processing Optimization

**1. Batch Processing for Low Priority Jobs**
```typescript
// Enhanced batch processing for persistencia jobs
class BatchProcessor {
  private batchItems: PersistenciaCredenciaisJobData[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize = 20; // Increased from 10
  private readonly batchTimeoutMs = 2000; // Reduced from 5000ms
  
  addToBatch(item: PersistenciaCredenciaisJobData): void {
    this.batchItems.push(item);
    
    if (this.batchItems.length >= this.maxBatchSize) {
      this.processBatch();
      return;
    }
    
    if (this.batchItems.length === 1) {
      this.batchTimeout = setTimeout(() => this.processBatch(), this.batchTimeoutMs);
    }
  }
  
  private async processBatch(): Promise<void> {
    if (this.batchItems.length === 0) return;
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    const batch = [...this.batchItems];
    this.batchItems = [];
    
    // Process batch in parallel with limited concurrency
    const concurrency = 5;
    const chunks = this.chunkArray(batch, concurrency);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(item => this.processItem(item)));
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

**2. Job Deduplication**
```typescript
// Implement job deduplication to prevent duplicate processing
class JobDeduplicator {
  private recentJobs = new Map<string, number>();
  private readonly deduplicationWindow = 60000; // 1 minute
  
  isDuplicate(jobData: any): boolean {
    const jobKey = this.generateJobKey(jobData);
    const now = Date.now();
    
    // Clean old entries
    for (const [key, timestamp] of this.recentJobs.entries()) {
      if (now - timestamp > this.deduplicationWindow) {
        this.recentJobs.delete(key);
      }
    }
    
    // Check if job is duplicate
    if (this.recentJobs.has(jobKey)) {
      return true;
    }
    
    // Add job to recent jobs
    this.recentJobs.set(jobKey, now);
    return false;
  }
  
  private generateJobKey(jobData: any): string {
    // Generate unique key based on job data
    const keyData = {
      type: jobData.type,
      inboxId: jobData.data.inboxId,
      contactPhone: jobData.data.contactPhone,
      interactionType: jobData.data.interactionType,
      buttonId: jobData.data.buttonId,
      intentName: jobData.data.intentName,
    };
    
    return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }
}
```

## Database Performance Optimization

### 1. Query Optimization

**1. Index Strategy**
```sql
-- Comprehensive indexing strategy for the refactored system

-- ChatwitInbox indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatwit_inbox_inbox_id_active 
ON "ChatwitInbox" ("inboxId") 
WHERE "whatsappApiKey" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatwit_inbox_fallback 
ON "ChatwitInbox" ("fallbackParaInboxId") 
WHERE "fallbackParaInboxId" IS NOT NULL;

-- Lead indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_source_identifier_active 
ON "Lead" ("source", "sourceIdentifier") 
WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_phone_source 
ON "Lead" ("phone", "source") 
WHERE "phone" IS NOT NULL AND "deletedAt" IS NULL;

-- Template indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_template_type_scope_active 
ON "Template" ("type", "scope", "status") 
WHERE "status" = 'ACTIVE';

-- Mapping indexes with included columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_intencao_lookup 
ON "MapeamentoIntencao" ("intentName", "inboxId") 
INCLUDE ("templateId", "isActive") 
WHERE "isActive" = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapeamento_botao_lookup 
ON "MapeamentoBotao" ("buttonId") 
INCLUDE ("actionType", "actionPayload", "isActive") 
WHERE "isActive" = true;

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_template_mapping_join 
ON "Template" ("id", "type", "scope") 
WHERE "status" = 'ACTIVE';

-- Partial indexes for frequently filtered data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_recent_activity 
ON "Lead" ("updatedAt", "source") 
WHERE "updatedAt" > (CURRENT_TIMESTAMP - INTERVAL '30 days');
```

**2. Query Rewriting**
```typescript
// Optimized query implementations

// Before: Multiple separate queries
async function findCompleteMessageMappingByIntent(intentName: string, inboxId: string) {
  const mapping = await prisma.mapeamentoIntencao.findFirst({
    where: { intentName, inboxId, isActive: true }
  });
  
  if (!mapping) return null;
  
  const template = await prisma.template.findUnique({
    where: { id: mapping.templateId }
  });
  
  const whatsappConfig = await prisma.chatwitInbox.findUnique({
    where: { inboxId }
  });
  
  return { mapping, template, whatsappConfig };
}

// After: Single optimized query with joins
async function findCompleteMessageMappingByIntent(intentName: string, inboxId: string) {
  return await prisma.mapeamentoIntencao.findFirst({
    where: { 
      intentName, 
      inboxId, 
      isActive: true,
      template: {
        status: 'ACTIVE'
      }
    },
    include: {
      template: {
        include: {
          interactiveContent: true,
          whatsappOfficialInfo: true
        }
      },
      inbox: {
        select: {
          whatsappApiKey: true,
          phoneNumberId: true,
          whatsappBusinessAccountId: true,
          fallbackParaInbox: {
            select: {
              whatsappApiKey: true,
              phoneNumberId: true,
              whatsappBusinessAccountId: true
            }
          }
        }
      }
    }
  });
}
```

**3. Connection Pool Optimization**
```typescript
// Optimized Prisma configuration
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["relationJoins", "omitApi"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Database connection optimization
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=20&pool_timeout=20&socket_timeout=60"
    }
  },
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

// Monitor slow queries
prisma.$on('query', (e) => {
  if (e.duration > 1000) { // Log queries taking more than 1 second
    console.warn(`Slow query detected: ${e.duration}ms`, {
      query: e.query,
      params: e.params,
    });
  }
});
```

### 2. Database Configuration Tuning

**1. PostgreSQL Configuration**
```sql
-- postgresql.conf optimizations

-- Memory settings
shared_buffers = '512MB'                    -- 25% of RAM
effective_cache_size = '2GB'                -- 75% of RAM
work_mem = '16MB'                           -- Per connection
maintenance_work_mem = '128MB'              -- For maintenance operations

-- Checkpoint settings
checkpoint_completion_target = 0.9
checkpoint_timeout = '10min'
max_wal_size = '2GB'
min_wal_size = '512MB'

-- Connection settings
max_connections = 100
shared_preload_libraries = 'pg_stat_statements'

-- Query planner settings
random_page_cost = 1.1                      -- For SSD storage
effective_io_concurrency = 200              -- For SSD storage
default_statistics_target = 100

-- Logging settings
log_min_duration_statement = 1000           -- Log queries > 1s
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

-- Apply settings
SELECT pg_reload_conf();
```

**2. Query Performance Monitoring**
```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Monitor slow queries
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  rows
FROM pg_stat_statements 
WHERE mean_exec_time > 100  -- Queries averaging > 100ms
ORDER BY mean_exec_time DESC 
LIMIT 20;

-- Monitor index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE idx_scan = 0  -- Unused indexes
ORDER BY schemaname, tablename;

-- Monitor table statistics
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins,
  n_tup_upd,
  n_tup_del
FROM pg_stat_user_tables 
ORDER BY seq_scan DESC;  -- Tables with high sequential scans
```

## Cache Performance Optimization

### 1. Cache Strategy Optimization

**1. Multi-Level Caching**
```typescript
// Implement multi-level caching strategy
class MultiLevelCache {
  private l1Cache = new Map<string, any>(); // In-memory cache
  private l2Cache: IORedis; // Redis cache
  private readonly L1_TTL = 60000; // 1 minute
  private readonly L1_MAX_SIZE = 1000;
  
  constructor(redisConnection: IORedis) {
    this.l2Cache = redisConnection;
    
    // L1 cache cleanup
    setInterval(() => this.cleanupL1Cache(), 30000);
  }
  
  async get(key: string): Promise<any> {
    // Try L1 cache first
    const l1Value = this.l1Cache.get(key);
    if (l1Value && l1Value.expires > Date.now()) {
      return l1Value.data;
    }
    
    // Try L2 cache (Redis)
    const l2Value = await this.l2Cache.get(key);
    if (l2Value) {
      const data = JSON.parse(l2Value);
      
      // Store in L1 cache
      this.setL1Cache(key, data);
      
      return data;
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    // Store in both caches
    this.setL1Cache(key, value);
    await this.l2Cache.setex(key, ttl, JSON.stringify(value));
  }
  
  private setL1Cache(key: string, data: any): void {
    // Implement LRU eviction if cache is full
    if (this.l1Cache.size >= this.L1_MAX_SIZE) {
      const firstKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(firstKey);
    }
    
    this.l1Cache.set(key, {
      data,
      expires: Date.now() + this.L1_TTL
    });
  }
  
  private cleanupL1Cache(): void {
    const now = Date.now();
    for (const [key, value] of this.l1Cache.entries()) {
      if (value.expires <= now) {
        this.l1Cache.delete(key);
      }
    }
  }
}
```

**2. Cache Warming Strategy**
```typescript
// Intelligent cache warming
class IntelligentCacheWarmer {
  private warmingInProgress = false;
  private accessPatterns = new Map<string, number>();
  
  // Track access patterns
  recordAccess(key: string): void {
    const count = this.accessPatterns.get(key) || 0;
    this.accessPatterns.set(key, count + 1);
  }
  
  // Warm cache based on access patterns
  async warmCache(): Promise<void> {
    if (this.warmingInProgress) return;
    
    this.warmingInProgress = true;
    
    try {
      // Get most accessed keys
      const topKeys = Array.from(this.accessPatterns.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 100)
        .map(([key]) => key);
      
      // Warm cache for top keys
      const warmingPromises = topKeys.map(async (key) => {
        try {
          if (key.startsWith('credentials:')) {
            const inboxId = key.split(':')[1];
            await this.warmCredentials(inboxId);
          } else if (key.startsWith('template:')) {
            const templateId = key.split(':')[1];
            await this.warmTemplate(templateId);
          }
        } catch (error) {
          console.error(`Error warming cache for key ${key}:`, error);
        }
      });
      
      await Promise.all(warmingPromises);
      
      console.log(`Cache warmed for ${topKeys.length} keys`);
      
    } finally {
      this.warmingInProgress = false;
    }
  }
  
  private async warmCredentials(inboxId: string): Promise<void> {
    const credentials = await CredentialsFallbackResolver.resolveCredentials(inboxId);
    if (credentials) {
      await credentialsCache.setCredentials(inboxId, credentials);
    }
  }
  
  private async warmTemplate(templateId: string): Promise<void> {
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: {
        interactiveContent: true,
        whatsappOfficialInfo: true
      }
    });
    
    if (template) {
      await templateCache.setTemplate(templateId, template);
    }
  }
}
```

### 2. Redis Optimization

**1. Redis Configuration**
```bash
# redis.conf optimizations

# Memory settings
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence settings (for production)
save 900 1
save 300 10
save 60 10000

# Network settings
tcp-keepalive 60
timeout 300

# Performance settings
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64

# Disable slow operations in production
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
```

**2. Connection Pool Optimization**
```typescript
// Optimized Redis connection pool
import IORedis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  
  // Connection pool settings
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 1000,
  
  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
  keepAlive: 30000,
  
  // Cluster settings (if using Redis Cluster)
  enableOfflineQueue: false,
  
  // Performance settings
  family: 4, // Use IPv4
  keyPrefix: 'chatwit:',
};

export const connection = new IORedis(redisConfig);

// Connection event handlers
connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (error) => {
  console.error('Redis connection error:', error);
});

connection.on('close', () => {
  console.log('Redis connection closed');
});
```

## Application-Level Optimizations

### 1. Next.js Optimization

**1. Next.js Configuration**
```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
    optimizeCss: true,
    optimizeServerReact: true,
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Production client-side optimizations
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    
    return config;
  },
  
  // Headers for performance
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**2. API Route Optimization**
```typescript
// Optimized API route structure
export async function GET(request: NextRequest) {
  // Early return for preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200 });
  }
  
  // Request validation
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
  
  try {
    // Use streaming for large responses
    const stream = new ReadableStream({
      start(controller) {
        // Stream data chunks
        controller.enqueue(new TextEncoder().encode('{"data":['));
        
        // Process data in chunks
        processDataInChunks(limit, offset, (chunk, isLast) => {
          const data = JSON.stringify(chunk);
          controller.enqueue(new TextEncoder().encode(data));
          
          if (!isLast) {
            controller.enqueue(new TextEncoder().encode(','));
          }
        }).then(() => {
          controller.enqueue(new TextEncoder().encode(']}'));
          controller.close();
        }).catch((error) => {
          controller.error(error);
        });
      }
    });
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
      },
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Memory Management

**1. Memory Leak Prevention**
```typescript
// Memory leak prevention strategies
class MemoryManager {
  private static timers = new Set<NodeJS.Timeout>();
  private static intervals = new Set<NodeJS.Timeout>();
  private static eventListeners = new Map<EventTarget, Array<{event: string, handler: Function}>>();
  
  // Managed setTimeout
  static setTimeout(callback: Function, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    
    this.timers.add(timer);
    return timer;
  }
  
  // Managed setInterval
  static setInterval(callback: Function, delay: number): NodeJS.Timeout {
    const interval = setInterval(callback, delay);
    this.intervals.add(interval);
    return interval;
  }
  
  // Managed event listeners
  static addEventListener(target: EventTarget, event: string, handler: Function): void {
    target.addEventListener(event, handler as EventListener);
    
    if (!this.eventListeners.has(target)) {
      this.eventListeners.set(target, []);
    }
    
    this.eventListeners.get(target)!.push({ event, handler });
  }
  
  // Cleanup all managed resources
  static cleanup(): void {
    // Clear timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    
    // Clear intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    
    // Remove event listeners
    this.eventListeners.forEach((listeners, target) => {
      listeners.forEach(({ event, handler }) => {
        target.removeEventListener(event, handler as EventListener);
      });
    });
    this.eventListeners.clear();
  }
}

// Cleanup on process exit
process.on('exit', () => MemoryManager.cleanup());
process.on('SIGINT', () => MemoryManager.cleanup());
process.on('SIGTERM', () => MemoryManager.cleanup());
```

**2. Garbage Collection Optimization**
```typescript
// Garbage collection optimization
if (process.env.NODE_ENV === 'production') {
  // Force garbage collection periodically
  setInterval(() => {
    if (global.gc) {
      const memBefore = process.memoryUsage();
      global.gc();
      const memAfter = process.memoryUsage();
      
      console.log('GC executed:', {
        heapUsedBefore: Math.round(memBefore.heapUsed / 1024 / 1024),
        heapUsedAfter: Math.round(memAfter.heapUsed / 1024 / 1024),
        freed: Math.round((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024),
      });
    }
  }, 300000); // Every 5 minutes
}

// Memory monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsageMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
  };
  
  // Alert if memory usage is high
  if (memUsageMB.heapUsed > 500) { // 500MB threshold
    console.warn('High memory usage detected:', memUsageMB);
  }
}, 60000); // Every minute
```

## Monitoring and Performance Tracking

### 1. Performance Metrics Collection

**1. Custom Performance Metrics**
```typescript
// Enhanced performance metrics collection
class PerformanceTracker {
  private static metrics = new Map<string, number[]>();
  private static readonly MAX_SAMPLES = 1000;
  
  static recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const samples = this.metrics.get(name)!;
    samples.push(value);
    
    // Keep only recent samples
    if (samples.length > this.MAX_SAMPLES) {
      samples.shift();
    }
  }
  
  static getMetricStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const samples = this.metrics.get(name);
    if (!samples || samples.length === 0) return null;
    
    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((sum, val) => sum + val, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }
  
  static getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [name] of this.metrics.entries()) {
      result[name] = this.getMetricStats(name);
    }
    
    return result;
  }
}

// Usage in webhook
export async function POST(request: Request) {
  const startTime = performance.now();
  
  try {
    // ... webhook processing ...
    
    const responseTime = performance.now() - startTime;
    PerformanceTracker.recordMetric('webhook.responseTime', responseTime);
    
    return response;
  } catch (error) {
    const responseTime = performance.now() - startTime;
    PerformanceTracker.recordMetric('webhook.errorResponseTime', responseTime);
    
    throw error;
  }
}
```

**2. Real-time Performance Dashboard**
```typescript
// Real-time performance dashboard endpoint
export async function GET(request: NextRequest) {
  const metrics = PerformanceTracker.getAllMetrics();
  
  // Add system metrics
  const systemMetrics = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
    loadAverage: os.loadavg(),
    freeMemory: os.freemem(),
    totalMemory: os.totalmem(),
  };
  
  // Add queue metrics
  const queueMetrics = await getQueueDashboard();
  
  // Add database metrics
  const dbMetrics = await getDatabaseDashboard();
  
  // Add cache metrics
  const cacheStats = credentialsCache.getStats();
  const cacheHealth = await credentialsCache.checkHealth();
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    performance: metrics,
    system: systemMetrics,
    queues: queueMetrics,
    database: dbMetrics,
    cache: { ...cacheStats, health: cacheHealth },
  });
}
```

### 2. Automated Performance Testing

**1. Load Testing Script**
```typescript
// Automated load testing for webhook endpoint
class LoadTester {
  private readonly webhookUrl: string;
  private readonly concurrency: number;
  private readonly duration: number;
  
  constructor(webhookUrl: string, concurrency: number = 10, duration: number = 60000) {
    this.webhookUrl = webhookUrl;
    this.concurrency = concurrency;
    this.duration = duration;
  }
  
  async runLoadTest(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    requestsPerSecond: number;
  }> {
    const startTime = Date.now();
    const endTime = startTime + this.duration;
    const results: number[] = [];
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    
    // Create worker promises
    const workers = Array.from({ length: this.concurrency }, () => 
      this.worker(endTime, results, (success) => {
        totalRequests++;
        if (success) successfulRequests++;
        else failedRequests++;
      })
    );
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    // Calculate statistics
    const sortedResults = results.sort((a, b) => a - b);
    const averageResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
    const p95ResponseTime = sortedResults[Math.floor(sortedResults.length * 0.95)];
    const actualDuration = Date.now() - startTime;
    const requestsPerSecond = (totalRequests / actualDuration) * 1000;
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      p95ResponseTime,
      requestsPerSecond,
    };
  }
  
  private async worker(
    endTime: number, 
    results: number[], 
    onComplete: (success: boolean) => void
  ): Promise<void> {
    while (Date.now() < endTime) {
      const requestStart = performance.now();
      
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.generateTestPayload()),
        });
        
        const responseTime = performance.now() - requestStart;
        results.push(responseTime);
        
        onComplete(response.ok);
        
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error) {
        const responseTime = performance.now() - requestStart;
        results.push(responseTime);
        onComplete(false);
      }
    }
  }
  
  private generateTestPayload(): any {
    return {
      originalDetectIntentRequest: {
        payload: {
          inbox_id: "4",
          contact_phone: `+5511${Math.floor(Math.random() * 900000000) + 100000000}`,
          whatsapp_api_key: "test_key",
          phone_number_id: "123456789",
          business_id: "987654321",
          wamid: `wamid.test${Date.now()}${Math.random()}`,
          contact_source: "load_test"
        }
      },
      queryResult: {
        intent: {
          displayName: "test.intent"
        }
      }
    };
  }
}

// Usage
const loadTester = new LoadTester('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook');
const results = await loadTester.runLoadTest();
console.log('Load test results:', results);
```

## Performance Monitoring and Alerting

### 1. Performance Alerts

```typescript
// Performance-based alerting
class PerformanceAlerter {
  private static thresholds = {
    webhookResponseTime: 100, // ms
    workerProcessingTime: 5000, // ms
    databaseQueryTime: 1000, // ms
    cacheHitRate: 70, // percentage
    memoryUsage: 80, // percentage
    cpuUsage: 80, // percentage
  };
  
  static checkPerformanceThresholds(): void {
    // Check webhook performance
    const webhookStats = PerformanceTracker.getMetricStats('webhook.responseTime');
    if (webhookStats && webhookStats.p95 > this.thresholds.webhookResponseTime) {
      this.sendAlert('webhook', 'High response time', {
        p95: webhookStats.p95,
        threshold: this.thresholds.webhookResponseTime,
      });
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memUsagePercent > this.thresholds.memoryUsage) {
      this.sendAlert('system', 'High memory usage', {
        usage: memUsagePercent,
        threshold: this.thresholds.memoryUsage,
      });
    }
    
    // Check CPU usage
    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) / process.uptime() * 100;
    if (cpuPercent > this.thresholds.cpuUsage) {
      this.sendAlert('system', 'High CPU usage', {
        usage: cpuPercent,
        threshold: this.thresholds.cpuUsage,
      });
    }
  }
  
  private static sendAlert(component: string, message: string, data: any): void {
    console.warn(`[Performance Alert] ${component}: ${message}`, data);
    
    // Send to monitoring system
    apm.createAlert({
      level: 'warning',
      component,
      message,
      metrics: data,
    });
  }
}

// Run performance checks every minute
setInterval(() => {
  PerformanceAlerter.checkPerformanceThresholds();
}, 60000);
```

This comprehensive performance tuning guide provides detailed optimization strategies for all components of the refactored ChatWit system. Regular application of these optimizations will ensure the system meets and exceeds performance targets.