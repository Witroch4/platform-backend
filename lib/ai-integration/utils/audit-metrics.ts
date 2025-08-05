import { getPrismaInstance } from "@/lib/connections";
import type { PrismaClient } from "@prisma/client";

// Get prisma instance using singleton
const prisma = getPrismaInstance();

export interface AuditMetrics {
  llmAudit: {
    totalRecords: number;
    recordsByMode: Record<string, number>;
    averageScore: number | null;
    recordsLast24h: number;
    recordsLast7d: number;
    topConversations: Array<{ conversationId: string; count: number }>;
  };
  intentHitLog: {
    totalRecords: number;
    successfulHits: number;
    successRate: number;
    averageSimilarity: number | null;
    recordsLast24h: number;
    recordsLast7d: number;
    topIntents: Array<{ candidateName: string; count: number; avgSimilarity: number }>;
  };
  performance: {
    avgResponseTime: number | null;
    totalTokensUsed: number | null;
    costEstimate: number | null;
  };
}

/**
 * Coleta métricas abrangentes dos logs de auditoria
 */
export async function collectAuditMetrics(): Promise<AuditMetrics> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Métricas do LlmAudit
    const [
      llmAuditTotal,
      llmAuditByMode,
      llmAuditAvgScore,
      llmAuditLast24h,
      llmAuditLast7d,
      llmAuditTopConversations
    ] = await Promise.all([
      // Total de registros
      prisma.llmAudit.count(),
      
      // Registros por modo
      prisma.llmAudit.groupBy({
        by: ['mode'],
        _count: { id: true }
      }),
      
      // Score médio
      prisma.llmAudit.aggregate({
        _avg: { score: true }
      }),
      
      // Registros últimas 24h
      prisma.llmAudit.count({
        where: { createdAt: { gte: last24h } }
      }),
      
      // Registros últimos 7 dias
      prisma.llmAudit.count({
        where: { createdAt: { gte: last7d } }
      }),
      
      // Top conversações
      prisma.llmAudit.groupBy({
        by: ['conversationId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      })
    ]);

    // Métricas do IntentHitLog
    const [
      intentHitLogTotal,
      intentHitLogSuccessful,
      intentHitLogAvgSimilarity,
      intentHitLogLast24h,
      intentHitLogLast7d,
      intentHitLogTopIntents
    ] = await Promise.all([
      // Total de registros
      prisma.intentHitLog.count(),
      
      // Hits bem-sucedidos
      prisma.intentHitLog.count({
        where: { chosen: true }
      }),
      
      // Similaridade média
      prisma.intentHitLog.aggregate({
        _avg: { similarity: true }
      }),
      
      // Registros últimas 24h
      prisma.intentHitLog.count({
        where: { createdAt: { gte: last24h } }
      }),
      
      // Registros últimos 7 dias
      prisma.intentHitLog.count({
        where: { createdAt: { gte: last7d } }
      }),
      
      // Top intents
      prisma.intentHitLog.groupBy({
        by: ['candidateName'],
        _count: { id: true },
        _avg: { similarity: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      })
    ]);

    // Calcular taxa de sucesso
    const successRate = intentHitLogTotal > 0 
      ? (intentHitLogSuccessful / intentHitLogTotal) * 100 
      : 0;

    // Métricas de performance (estimativas baseadas nos logs)
    const performanceMetrics = await calculatePerformanceMetrics();

    return {
      llmAudit: {
        totalRecords: llmAuditTotal,
        recordsByMode: llmAuditByMode.reduce((acc, item) => {
          acc[item.mode] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        averageScore: llmAuditAvgScore._avg.score,
        recordsLast24h: llmAuditLast24h,
        recordsLast7d: llmAuditLast7d,
        topConversations: llmAuditTopConversations.map(item => ({
          conversationId: item.conversationId,
          count: item._count.id
        }))
      },
      intentHitLog: {
        totalRecords: intentHitLogTotal,
        successfulHits: intentHitLogSuccessful,
        successRate: Math.round(successRate * 100) / 100,
        averageSimilarity: intentHitLogAvgSimilarity._avg.similarity,
        recordsLast24h: intentHitLogLast24h,
        recordsLast7d: intentHitLogLast7d,
        topIntents: intentHitLogTopIntents.map(item => ({
          candidateName: item.candidateName,
          count: item._count.id,
          avgSimilarity: Math.round((item._avg.similarity || 0) * 1000) / 1000
        }))
      },
      performance: performanceMetrics
    };

  } catch (error) {
    console.error('Error collecting audit metrics:', error);
    throw error;
  }
}

/**
 * Calcula métricas de performance baseadas nos logs
 */
async function calculatePerformanceMetrics() {
  try {
    // Estimar tokens usados baseado no tamanho do inputText
    const tokenEstimate = await prisma.llmAudit.aggregate({
      _avg: {
        // Estimativa: ~4 caracteres por token
        // Usamos uma query raw para calcular isso
      }
    });

    // Query raw para calcular estimativas de performance
    const performanceData = await prisma.$queryRaw<Array<{
      avg_input_length: number;
      total_requests: number;
      estimated_tokens: number;
    }>>`
      SELECT 
        AVG(LENGTH("inputText")) as avg_input_length,
        COUNT(*) as total_requests,
        SUM(LENGTH("inputText") / 4) as estimated_tokens
      FROM "LlmAudit"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
    `;

    const data = performanceData[0];
    
    if (!data) {
      return {
        avgResponseTime: null,
        totalTokensUsed: null,
        costEstimate: null
      };
    }

    // Estimativas de custo (baseado em preços aproximados do OpenAI)
    const estimatedTokens = Number(data.estimated_tokens) || 0;
    const costPerToken = 0.000002; // ~$0.002 per 1K tokens para gpt-4o-mini
    const estimatedCost = estimatedTokens * costPerToken;

    return {
      avgResponseTime: null, // Seria necessário adicionar timestamps de início/fim
      totalTokensUsed: estimatedTokens,
      costEstimate: Math.round(estimatedCost * 100) / 100
    };

  } catch (error) {
    console.error('Error calculating performance metrics:', error);
    return {
      avgResponseTime: null,
      totalTokensUsed: null,
      costEstimate: null
    };
  }
}

/**
 * Gera relatório de métricas em formato legível
 */
export async function generateMetricsReport(): Promise<string> {
  const metrics = await collectAuditMetrics();
  
  const report = `
📊 AI Integration Audit Metrics Report
Generated: ${new Date().toISOString()}

🤖 LLM Audit Logs:
  • Total Records: ${metrics.llmAudit.totalRecords.toLocaleString()}
  • Records (24h): ${metrics.llmAudit.recordsLast24h.toLocaleString()}
  • Records (7d): ${metrics.llmAudit.recordsLast7d.toLocaleString()}
  • Average Score: ${metrics.llmAudit.averageScore?.toFixed(3) || 'N/A'}
  
  Records by Mode:
${Object.entries(metrics.llmAudit.recordsByMode)
  .map(([mode, count]) => `    - ${mode}: ${count.toLocaleString()}`)
  .join('\n')}

  Top Conversations:
${metrics.llmAudit.topConversations
  .slice(0, 5)
  .map((conv, i) => `    ${i + 1}. ${conv.conversationId}: ${conv.count} requests`)
  .join('\n')}

🎯 Intent Hit Logs:
  • Total Records: ${metrics.intentHitLog.totalRecords.toLocaleString()}
  • Successful Hits: ${metrics.intentHitLog.successfulHits.toLocaleString()}
  • Success Rate: ${metrics.intentHitLog.successRate}%
  • Avg Similarity: ${metrics.intentHitLog.averageSimilarity?.toFixed(3) || 'N/A'}
  • Records (24h): ${metrics.intentHitLog.recordsLast24h.toLocaleString()}
  • Records (7d): ${metrics.intentHitLog.recordsLast7d.toLocaleString()}

  Top Intents:
${metrics.intentHitLog.topIntents
  .slice(0, 5)
  .map((intent, i) => `    ${i + 1}. ${intent.candidateName}: ${intent.count} hits (avg: ${intent.avgSimilarity})`)
  .join('\n')}

⚡ Performance Metrics:
  • Estimated Tokens Used (7d): ${metrics.performance.totalTokensUsed?.toLocaleString() || 'N/A'}
  • Estimated Cost (7d): $${metrics.performance.costEstimate || 'N/A'}
  • Avg Response Time: ${metrics.performance.avgResponseTime || 'N/A'}ms

---
Report generated by AI Integration Audit System
  `;

  return report.trim();
}

/**
 * Obtém métricas de saúde do sistema de auditoria
 */
export async function getAuditHealthMetrics() {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Verificar se há atividade recente
    const [recentLlmAudit, recentIntentHitLog] = await Promise.all([
      prisma.llmAudit.count({
        where: { createdAt: { gte: oneHourAgo } }
      }),
      prisma.intentHitLog.count({
        where: { createdAt: { gte: oneHourAgo } }
      })
    ]);
    
    // Verificar registros próximos da expiração
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [expiringSoonLlm, expiringSoonIntent] = await Promise.all([
      prisma.llmAudit.count({
        where: {
          expiresAt: { lt: tomorrow, gte: now }
        }
      }),
      prisma.intentHitLog.count({
        where: {
          expiresAt: { lt: tomorrow, gte: now }
        }
      })
    ]);
    
    return {
      isHealthy: recentLlmAudit > 0 || recentIntentHitLog > 0,
      recentActivity: {
        llmAudit: recentLlmAudit,
        intentHitLog: recentIntentHitLog
      },
      expiringSoon: {
        llmAudit: expiringSoonLlm,
        intentHitLog: expiringSoonIntent,
        total: expiringSoonLlm + expiringSoonIntent
      },
      timestamp: now.getTime()
    };
    
  } catch (error) {
    console.error('Error getting audit health metrics:', error);
    return {
      isHealthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    };
  }
}