/**
 * SocialWise Flow Health Check API
 * Monitors system health and component availability
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRedisInstance, getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const healthLogger = createLogger('SocialWise-Health');

interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  responseTime?: number;
  error?: string;
  details?: any;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unavailable';
  components: HealthCheckResult[];
  timestamp: string;
  version: string;
}

/**
 * Check Redis connectivity and performance
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const redis = getRedisInstance();
    
    // Test basic connectivity
    await redis.ping();
    
    // Test read/write operations
    const testKey = `health-check:${Date.now()}`;
    await redis.setex(testKey, 10, 'test-value');
    const value = await redis.get(testKey);
    await redis.del(testKey);
    
    if (value !== 'test-value') {
      throw new Error('Redis read/write test failed');
    }
    
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'redis',
      status: responseTime < 100 ? 'healthy' : 'degraded',
      responseTime,
      details: {
        ping: 'ok',
        readWrite: 'ok'
      }
    };
    
  } catch (error) {
    return {
      component: 'redis',
      status: 'unavailable',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check PostgreSQL connectivity and performance
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const prisma = getPrismaInstance();
    
    // Test basic connectivity with a simple query
    await prisma.$queryRaw`SELECT 1 as test`;
    
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'database',
      status: responseTime < 200 ? 'healthy' : 'degraded',
      responseTime,
      details: {
        connection: 'ok'
      }
    };
    
  } catch (error) {
    return {
      component: 'database',
      status: 'unavailable',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check OpenAI API connectivity
 */
async function checkOpenAI(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Test with a simple embedding request
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API returned ${response.status}: ${response.statusText}`);
    }
    
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'openai',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      responseTime,
      details: {
        apiKey: 'configured',
        modelsEndpoint: 'ok'
      }
    };
    
  } catch (error) {
    return {
      component: 'openai',
      status: 'unavailable',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check embedding index availability (simulated)
 */
async function checkEmbeddingIndex(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const prisma = getPrismaInstance();
    
    // Check if we have intents with embeddings using raw SQL
    // Prisma doesn't handle Unsupported("vector") type filters properly
    // and may generate invalid casts like embedding::jsonb
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Intent" 
      WHERE "isActive" = true AND embedding IS NOT NULL
    `;
    
    const intentCount = countResult.length > 0 ? Number(countResult[0].count) : 0;
    
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'embedding_index',
      status: intentCount > 0 ? 'healthy' : 'degraded',
      responseTime,
      details: {
        activeIntentsWithEmbeddings: intentCount,
        status: intentCount > 0 ? 'available' : 'no_embeddings'
      }
    };
    
  } catch (error) {
    return {
      component: 'embedding_index',
      status: 'unavailable',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Determine overall system health based on component health
 */
function determineOverallHealth(components: HealthCheckResult[]): 'healthy' | 'degraded' | 'unavailable' {
  const criticalComponents = ['redis', 'database', 'openai'];
  const criticalStatuses = components
    .filter(c => criticalComponents.includes(c.component))
    .map(c => c.status);
  
  if (criticalStatuses.some(status => status === 'unavailable')) {
    return 'unavailable';
  }
  
  if (criticalStatuses.some(status => status === 'degraded')) {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * GET /api/admin/socialwise-flow/health
 * Comprehensive health check for SocialWise Flow system
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Authentication check (optional for health checks, but good for security)
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // Run all health checks in parallel
    const [redisHealth, dbHealth, openaiHealth, embeddingHealth] = await Promise.all([
      checkRedis(),
      checkDatabase(),
      checkOpenAI(),
      checkEmbeddingIndex()
    ]);

    const components = [redisHealth, dbHealth, openaiHealth, embeddingHealth];
    const overallHealth = determineOverallHealth(components);
    
    const totalTime = Date.now() - startTime;

    const healthReport: SystemHealth = {
      overall: overallHealth,
      components,
      timestamp: new Date().toISOString(),
      version: '1.0.0' // TODO: Get from package.json or environment
    };

    healthLogger.info('Health check completed', {
      overall: overallHealth,
      totalTimeMs: totalTime,
      componentCount: components.length,
      userId: session.user.id
    });

    // Return appropriate HTTP status based on health
    const statusCode = overallHealth === 'healthy' ? 200 : 
                      overallHealth === 'degraded' ? 200 : 503;

    return NextResponse.json(healthReport, { status: statusCode });

  } catch (error) {
    healthLogger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    const errorReport: SystemHealth = {
      overall: 'unavailable',
      components: [{
        component: 'health_check',
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error)
      }],
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    return NextResponse.json(errorReport, { status: 503 });
  }
}

/**
 * POST /api/admin/socialwise-flow/health
 * Trigger specific component health checks
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { component } = body;

    if (!component) {
      return NextResponse.json(
        { error: "Campo 'component' é obrigatório." },
        { status: 400 }
      );
    }

    let result: HealthCheckResult;

    switch (component) {
      case 'redis':
        result = await checkRedis();
        break;
      case 'database':
        result = await checkDatabase();
        break;
      case 'openai':
        result = await checkOpenAI();
        break;
      case 'embedding_index':
        result = await checkEmbeddingIndex();
        break;
      default:
        return NextResponse.json(
          { error: `Componente '${component}' não reconhecido.` },
          { status: 400 }
        );
    }

    healthLogger.info('Individual component health check', {
      component,
      status: result.status,
      responseTime: result.responseTime,
      userId: session.user.id
    });

    return NextResponse.json({
      success: true,
      component: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    healthLogger.error('Individual health check failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { 
        error: "Erro ao verificar saúde do componente.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}