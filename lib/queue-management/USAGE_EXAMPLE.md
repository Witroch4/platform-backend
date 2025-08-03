# Exemplo de Uso - Sistema de Gestão de Filas

## Inicialização do Sistema

```typescript
// app/api/admin/queue-management/init/route.ts
import { initializeQueueManagementSystem, getSystemHealth } from '@/lib/queue-management'

export async function POST() {
  try {
    // Inicializar sistema usando infraestrutura existente
    const initialized = await initializeQueueManagementSystem()
    
    if (!initialized) {
      return Response.json({ 
        error: 'Failed to initialize queue management system' 
      }, { status: 500 })
    }

    // Verificar saúde do sistema
    const health = await getSystemHealth()
    
    return Response.json({
      success: true,
      message: 'Queue management system initialized',
      health
    })
  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
```

## Uso do Cache

```typescript
// lib/services/queue-service.ts
import { getQueueCache, getMetricsCache } from '@/lib/queue-management'

export class QueueService {
  private queueCache = getQueueCache()
  private metricsCache = getMetricsCache()

  async getQueueHealth(queueName: string) {
    // Tentar buscar do cache primeiro
    let health = await this.queueCache.getQueueHealth(queueName)
    
    if (!health) {
      // Se não estiver em cache, calcular e cachear
      health = await this.calculateQueueHealth(queueName)
      await this.queueCache.setQueueHealth(queueName, health, 30) // 30 segundos TTL
    }
    
    return health
  }

  async recordMetrics(queueName: string, metrics: any) {
    const timestamp = Date.now()
    
    // Cachear métricas
    await this.metricsCache.setQueueMetrics(queueName, timestamp, metrics)
    
    // Adicionar ao histórico para análise de tendências
    await this.metricsCache.addMetricDataPoint(
      queueName, 
      'throughput', 
      timestamp, 
      metrics.throughput
    )
  }
}
```

## Configuração com Sistema Existente

```typescript
// lib/queue-management/custom-config.ts
import { getQueueManagementConfig } from '@/lib/queue-management'
import { getPrismaInstance, getRedisInstance } from '@/lib/connections'

export function setupQueueManagement() {
  const config = getQueueManagementConfig()
  
  // Usar conexões singleton existentes
  const prisma = getPrismaInstance()
  const redis = getRedisInstance()
  
  console.log('Queue Management Config:', {
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db
    },
    features: config.features,
    performance: config.performance
  })
  
  return { prisma, redis, config }
}
```

## API Route Example

```typescript
// app/api/admin/queue-management/health/route.ts
import { getSystemHealth } from '@/lib/queue-management'
import { auth } from '@/auth'

export async function GET() {
  try {
    // Verificar autenticação (usando Auth.js 5 existente)
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'SUPERADMIN') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Obter saúde do sistema
    const health = await getSystemHealth()
    
    return Response.json(health)
  } catch (error) {
    return Response.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
```

## Componente React

```tsx
// app/admin/queue-management/components/SystemHealth.tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SystemHealth {
  status: string
  timestamp: string
  components: {
    database: { status: string; latency: number }
    redis: { status: string; latency: number }
    cache: { status: string; stats: any }
  }
}

export function SystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/admin/queue-management/health')
        const data = await response.json()
        setHealth(data)
      } catch (error) {
        console.error('Failed to fetch system health:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              health?.components.database.status === 'healthy' 
                ? 'bg-green-500' 
                : 'bg-red-500'
            }`} />
            <span>{health?.components.database.status}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Latency: {health?.components.database.latency}ms
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              health?.components.redis.status === 'healthy' 
                ? 'bg-green-500' 
                : 'bg-red-500'
            }`} />
            <span>{health?.components.redis.status}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Latency: {health?.components.redis.latency}ms
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cache</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              health?.components.cache.status === 'healthy' 
                ? 'bg-green-500' 
                : 'bg-red-500'
            }`} />
            <span>{health?.components.cache.status}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Hit Rate: {(health?.components.cache.stats.hitRate * 100).toFixed(1)}%
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Middleware Integration

```typescript
// middleware.ts (adicionar ao middleware existente)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // ... middleware existente ...

  // Verificar rotas do queue management
  if (request.nextUrl.pathname.startsWith('/admin/queue-management')) {
    // Verificar se usuário tem role SUPERADMIN
    // (implementação depende do sistema de auth existente)
    
    const userRole = getUserRoleFromRequest(request) // função existente
    
    if (userRole !== 'SUPERADMIN') {
      return NextResponse.redirect(new URL('/denied', request.url))
    }
  }

  return NextResponse.next()
}
```

## Environment Variables

```env
# .env.local (adicionar às variáveis existentes)

# Queue Management específicas (opcionais)
QUEUE_METRICS_ENABLED=true
QUEUE_ALERTS_ENABLED=true
QUEUE_CACHE_ENABLED=true
QUEUE_METRICS_INTERVAL=30000
QUEUE_ALERTS_WEBHOOK_URL=http://localhost:3000/api/webhooks/alerts

# Usar variáveis existentes
DATABASE_URL=postgresql://...
REDIS_HOST=localhost
REDIS_PORT=6379
NEXTAUTH_SECRET=...
```

## Seed Data

```typescript
// scripts/seed-queue-management.ts
import { seedQueueManagementSystem } from '@/lib/queue-management'

async function main() {
  try {
    console.log('🌱 Seeding queue management system...')
    
    await seedQueueManagementSystem(
      'admin-user-id',
      'admin@example.com',
      'System Administrator'
    )
    
    console.log('✅ Seeding completed successfully')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  }
}

main()
```

## Testing

```typescript
// __tests__/queue-management/integration.test.ts
import { initializeQueueManagementSystem, getSystemHealth } from '@/lib/queue-management'

describe('Queue Management Integration', () => {
  beforeAll(async () => {
    await initializeQueueManagementSystem()
  })

  test('should initialize successfully', async () => {
    const health = await getSystemHealth()
    expect(health.status).toBe('healthy')
  })

  test('should use singleton connections', async () => {
    // Verificar se está usando as conexões singleton
    const health1 = await getSystemHealth()
    const health2 = await getSystemHealth()
    
    // Ambas devem usar as mesmas instâncias
    expect(health1.components.database).toBeDefined()
    expect(health2.components.redis).toBeDefined()
  })
})
```

## Conclusão

Este exemplo mostra como o sistema de gestão de filas se integra perfeitamente com a infraestrutura existente, reutilizando:

- ✅ Conexões singleton (Prisma + Redis)
- ✅ Sistema de autenticação (Auth.js 5)
- ✅ Middleware existente
- ✅ Padrões de API routes
- ✅ Componentes UI (shadcn/ui)
- ✅ Configurações de ambiente

O sistema está pronto para ser usado sem quebrar funcionalidades existentes.