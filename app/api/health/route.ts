/**
 * Endpoint de health check para monitorar o status da aplicação
 */

import { NextResponse } from 'next/server';
import { getPrismaInstance, getRedisInstance } from '@/lib/connections';

export async function GET() {
  const startTime = Date.now();
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
    },
    responseTime: 0,
  };

  try {
    // Testar banco de dados usando singleton
    const prisma = getPrismaInstance();
    await prisma.$queryRaw`SELECT 1`;
    status.services.database = 'healthy';
  } catch (error) {
    status.services.database = 'unhealthy';
    status.status = 'degraded';
  }

  try {
    // Testar Redis usando singleton
    const redis = getRedisInstance();
    await redis.ping();
    status.services.redis = 'healthy';
  } catch (error) {
    status.services.redis = 'unhealthy';
    status.status = 'degraded';
  }

  status.responseTime = Date.now() - startTime;

  return NextResponse.json(status, {
    status: status.status === 'ok' ? 200 : 503
  });
}