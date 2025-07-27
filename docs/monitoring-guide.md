# Guia de Monitoramento do Sistema Socialwise Chatwit

## Visão Geral

O sistema Socialwise Chatwit possui um sistema de monitoramento abrangente que permite acompanhar:

- **Performance da Aplicação** (APM)
- **Filas BullMQ** (Jobs e Workers)
- **Banco de Dados** (PostgreSQL)
- **Cache** (Redis)
- **Alertas** em tempo real

## 1. Inicialização do Monitoramento

### Inicializar o Sistema de Monitoramento

```typescript
import { initializeMonitoring } from '@/lib/monitoring/init-monitoring';

// Inicializar todos os sistemas de monitoramento
await initializeMonitoring();
```

### Verificar Status do Monitoramento

```typescript
import { getMonitoringStatus, isMonitoringInitialized } from '@/lib/monitoring/init-monitoring';

// Verificar se está inicializado
const isInitialized = isMonitoringInitialized();

// Obter status completo
const status = getMonitoringStatus();
console.log('Status:', status);
```

## 2. Monitoramento de Filas (BullMQ)

### Registrar Filas para Monitoramento

```typescript
import { registerQueueForMonitoring } from '@/lib/monitoring/queue-monitor';
import { Queue } from 'bullmq';

// Registrar uma fila para monitoramento
const minhaFila = new Queue('minha-fila');
registerQueueForMonitoring(minhaFila, 'minha-fila');
```

### Obter Dashboard das Filas

```typescript
import { getQueueDashboard } from '@/lib/monitoring/queue-monitor';

// Obter visão geral de todas as filas
const dashboard = getQueueDashboard();

console.log('Total de filas:', dashboard.overview.totalQueues);
console.log('Total de jobs:', dashboard.overview.totalJobs);
console.log('Jobs ativos:', dashboard.overview.activeJobs);
console.log('Jobs falharam:', dashboard.overview.failedJobs);

// Detalhes de cada fila
dashboard.queues.forEach(queue => {
  console.log(`Fila: ${queue.name}`);
  console.log(`  - Aguardando: ${queue.health.waiting}`);
  console.log(`  - Ativos: ${queue.health.active}`);
  console.log(`  - Falharam: ${queue.health.failed}`);
  console.log(`  - Pausada: ${queue.health.paused}`);
});
```

### Obter Saúde de uma Fila Específica

```typescript
import { getQueueHealth, getQueuePerformanceStats } from '@/lib/monitoring/queue-monitor';

// Saúde atual da fila
const health = getQueueHealth('resposta-rapida');
if (health) {
  console.log('Jobs aguardando:', health.waiting);
  console.log('Jobs ativos:', health.active);
  console.log('Jobs falharam:', health.failed);
}

// Estatísticas de performance (últimos 60 minutos)
const performance = getQueuePerformanceStats('resposta-rapida', 60);
if (performance) {
  console.log('Jobs por minuto:', performance.throughput.jobsPerMinute);
  console.log('Tempo médio de processamento:', performance.averageProcessingTime);
  console.log('Taxa de sucesso:', performance.successRate);
}
```

### Obter Jobs com Problemas

```typescript
import { getFailedJobs, getSlowJobs } from '@/lib/monitoring/queue-monitor';

// Jobs que falharam
const failedJobs = getFailedJobs('resposta-rapida', 20);
failedJobs.forEach(job => {
  console.log(`Job ${job.jobId} falhou: ${job.error}`);
});

// Jobs lentos (mais de 10 segundos)
const slowJobs = getSlowJobs('resposta-rapida', 10000, 20);
slowJobs.forEach(job => {
  console.log(`Job ${job.jobId} demorou ${job.processingTime}ms`);
});
```

### Controle de Filas

```typescript
import { queueMonitor } from '@/lib/monitoring/queue-monitor';

// Pausar uma fila
await queueMonitor.pauseQueue('resposta-rapida');

// Resumir uma fila
await queueMonitor.resumeQueue('resposta-rapida');

// Limpar jobs que falharam
const cleanedCount = await queueMonitor.cleanFailedJobs('resposta-rapida');
console.log(`Limpos ${cleanedCount} jobs que falharam`);
```

## 3. APIs de Monitoramento

### Dashboard Geral

```bash
# Obter dashboard completo do sistema
curl http://localhost:3000/api/admin/monitoring/dashboard

# Com janela de tempo específica (em minutos)
curl "http://localhost:3000/api/admin/monitoring/dashboard?timeWindow=30"
```

### Monitoramento de Filas

```bash
# Visão geral de todas as filas
curl http://localhost:3000/api/admin/monitoring/queues

# Detalhes de uma fila específica
curl "http://localhost:3000/api/admin/monitoring/queues?queue=resposta-rapida"

# Com janela de tempo específica
curl "http://localhost:3000/api/admin/monitoring/queues?queue=resposta-rapida&timeWindow=60"
```

### Ações nas Filas

```bash
# Pausar uma fila
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "pause"}'

# Resumir uma fila
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "resume"}'

# Limpar jobs que falharam
curl -X POST http://localhost:3000/api/admin/monitoring/queues \
  -H "Content-Type: application/json" \
  -d '{"queueName": "resposta-rapida", "action": "cleanFailed"}'
```

### Alertas

```bash
# Obter alertas ativos
curl http://localhost:3000/api/admin/monitoring/alerts

# Alertas por componente
curl "http://localhost:3000/api/admin/monitoring/alerts?component=queue"

# Alertas por nível
curl "http://localhost:3000/api/admin/monitoring/alerts?level=critical"
```

## 4. Monitoramento de Performance (APM)

### Registrar Métricas de Webhook

```typescript
import { recordWebhookMetrics } from '@/lib/monitoring/application-performance-monitor';

// Registrar métricas de um webhook
recordWebhookMetrics({
  responseTime: 150, // ms
  timestamp: new Date(),
  correlationId: 'webhook-123',
  success: true,
  payloadSize: 1024,
  interactionType: 'intent'
});
```

### Registrar Métricas de Worker

```typescript
import { recordWorkerMetrics } from '@/lib/monitoring/application-performance-monitor';

// Registrar métricas de um worker
recordWorkerMetrics({
  jobId: 'job-123',
  jobType: 'resposta-rapida',
  processingTime: 2000, // ms
  queueWaitTime: 500, // ms
  success: true,
  timestamp: new Date(),
  correlationId: 'webhook-123',
  retryCount: 0
});
```

### Obter Resumo de Performance

```typescript
import { apm } from '@/lib/monitoring/application-performance-monitor';

// Obter resumo completo de performance
const summary = await apm.getPerformanceSummary();

console.log('Webhook - Tempo médio de resposta:', summary.webhook.avgResponseTime);
console.log('Webhook - Taxa de sucesso:', summary.webhook.successRate);
console.log('Worker - Tempo médio de processamento:', summary.worker.avgProcessingTime);
console.log('Worker - Taxa de sucesso:', summary.worker.successRate);
```

### Alertas Ativos

```typescript
import { apm } from '@/lib/monitoring/application-performance-monitor';

// Obter alertas ativos
const activeAlerts = apm.getActiveAlerts();

// Filtrar alertas críticos
const criticalAlerts = activeAlerts.filter(alert => alert.level === 'critical');

// Alertas por componente
const queueAlerts = apm.getAlertsByComponent('queue');
```

## 5. Monitoramento de Banco de Dados

### Usar Cliente Prisma Monitorado

```typescript
import { createMonitoredPrisma } from '@/lib/monitoring/init-monitoring';
import { prisma } from '@/lib/prisma';

// Criar cliente Prisma com monitoramento
const monitoredPrisma = createMonitoredPrisma(prisma);

// Usar normalmente - as métricas são coletadas automaticamente
const users = await monitoredPrisma.user.findMany();
```

### Obter Estatísticas do Banco

```typescript
import { databaseMonitor } from '@/lib/monitoring/database-monitor';

// Dashboard do banco de dados
const dashboard = databaseMonitor.getDatabaseDashboard();

console.log('Conexões ativas:', dashboard.connections.active);
console.log('Conexões em espera:', dashboard.connections.waiting);
console.log('Taxa de sucesso:', dashboard.performance.successRate);
console.log('Tempo médio de query:', dashboard.performance.averageExecutionTime);
```

## 6. Health Check Completo

### Verificar Saúde do Sistema

```typescript
import { performHealthCheck } from '@/lib/monitoring/init-monitoring';

// Realizar health check completo
const healthCheck = await performHealthCheck();

console.log('Status geral:', healthCheck.status);
console.log('Componentes:', Object.keys(healthCheck.components));

// Verificar cada componente
Object.entries(healthCheck.components).forEach(([component, status]) => {
  console.log(`${component}: ${status.status} - ${status.message}`);
});
```

## 7. Scripts Úteis

### Listar Filas no Redis

```bash
# Executar script para listar filas
npx tsx scripts/list-queues.ts
```

### Verificar Status das Filas

```bash
# Verificar filas via Bull Board (se configurado)
curl http://localhost:3005/admin/queues
```

## 8. Configuração de Alertas

### Limites de Alertas

Os limites padrão estão definidos em:

```typescript
// Filas
QUEUE_ALERT_THRESHOLDS = {
  MAX_WAITING_JOBS: 100,
  MAX_FAILED_JOBS: 50,
  MAX_PROCESSING_TIME: 30000, // 30 segundos
  MIN_SUCCESS_RATE: 95, // porcentagem
  MAX_ERROR_RATE: 5, // porcentagem
  MAX_QUEUE_DEPTH: 500,
}

// Performance
ALERT_THRESHOLDS = {
  WEBHOOK_RESPONSE_TIME: 100, // ms
  WORKER_PROCESSING_TIME: 5000, // ms
  DATABASE_QUERY_TIME: 1000, // ms
  CACHE_HIT_RATE: 70, // porcentagem
  ERROR_RATE: 5, // porcentagem
  QUEUE_DEPTH: 100, // número de jobs
}
```

## 9. Logs e Debugging

### Logs de Monitoramento

O sistema gera logs detalhados com prefixos:

- `[Monitoring]` - Sistema geral de monitoramento
- `[QueueMonitor]` - Monitoramento de filas
- `[APM]` - Application Performance Monitor
- `[DatabaseMonitor]` - Monitoramento de banco de dados

### Exemplo de Logs

```
[Monitoring] 🎉 All monitoring systems initialized successfully
[QueueMonitor] Health metrics collected for queue resposta-rapida: { waiting: 5, active: 2, failed: 0, paused: false }
[APM] Alert created: High number of waiting jobs in queue resposta-rapida: 150
```

## 10. Troubleshooting

### Problemas Comuns

1. **Filas não aparecem no monitoramento**
   - Verificar se a fila foi registrada com `registerQueueForMonitoring`
   - Verificar conexão com Redis

2. **Alertas não sendo gerados**
   - Verificar se o APM está inicializado
   - Verificar limites de alertas

3. **Performance degradada**
   - Verificar métricas de filas
   - Verificar métricas de banco de dados
   - Verificar alertas ativos

### Comandos de Diagnóstico

```bash
# Status geral do sistema
curl -s http://localhost:3000/api/admin/monitoring/dashboard | jq '.systemHealth'

# Filas com problemas
curl -s http://localhost:3000/api/admin/monitoring/queues | jq '.queues[] | select(.health.failed > 0)'

# Alertas críticos
curl -s http://localhost:3000/api/admin/monitoring/alerts | jq '.alerts[] | select(.level == "critical")'
```

Este guia fornece uma visão completa de como monitorar seu sistema Socialwise Chatwit. Use as APIs e funções disponíveis para manter seu sistema saudável e identificar problemas rapidamente. 