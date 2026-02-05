import { Queue, type Job } from 'bullmq';
import { getRedisInstance } from '@/lib/connections';
import { getOabEvalConfig } from '@/lib/config';
import type { StudentMirrorPayload } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface MirrorGenerationJobData {
  leadId: string;
  especialidade: string;
  espelhoPadraoId?: string; // ID do OabRubric selecionado pelo usuário
  images: Array<{
    id: string;
    url: string;
    nome?: string;
    page?: number;
  }>;
  telefone?: string;
  nome?: string;
  userId?: string;
  priority?: number;
  selectedProvider?: 'OPENAI' | 'GEMINI'; // Provider selecionado pelo switch no frontend
}

export interface MirrorGenerationJobResult {
  leadId: string;
  success: boolean;
  markdownMirror?: string;
  jsonMirror?: StudentMirrorPayload;
  error?: string;
  processedAt: string;
}

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAME = 'oab-mirror-generation';

/**
 * Carrega configurações da fila a partir do config.yml
 */
function getMirrorQueueConfig() {
  const config = getOabEvalConfig();

  return {
    maxConcurrentJobs: config.mirror_concurrency || 5,
    jobTimeout: config.queue?.job_timeout || 300000, // 5 minutos
    retryAttempts: config.queue?.retry_attempts || 2,
  };
}

// ============================================================================
// QUEUE INSTANCE
// ============================================================================

const queueConfig = getMirrorQueueConfig();

export const mirrorGenerationQueue = new Queue<MirrorGenerationJobData, MirrorGenerationJobResult>(
  QUEUE_NAME,
  {
    connection: getRedisInstance(),
    defaultJobOptions: {
      removeOnComplete: {
        count: 20, // Manter últimos 20 jobs completados
        age: 86400, // Remover após 24h
      },
      removeOnFail: {
        count: 10, // Manter últimos 10 falhos
        age: 172800, // Remover após 48h
      },
      attempts: queueConfig.retryAttempts,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s inicial, depois 10s, 20s...
      },
    },
  },
);

// ============================================================================
// ENQUEUE FUNCTION
// ============================================================================

/**
 * Adiciona job de geração de espelho na fila
 */
export async function enqueueMirrorGeneration(
  data: MirrorGenerationJobData,
): Promise<Job<MirrorGenerationJobData, MirrorGenerationJobResult>> {
  console.log(`[MirrorQueue] 📥 Enfileirando geração de espelho para lead ${data.leadId}`);
  console.log(`[MirrorQueue] 📋 Especialidade: ${data.especialidade}`);
  console.log(`[MirrorQueue] 🖼️ Total de imagens: ${data.images.length}`);
  console.log(`[MirrorQueue] 🎛️ Provider recebido: ${data.selectedProvider || 'undefined (será GEMINI)'}`);

  // Validações
  if (!data.leadId) {
    throw new Error('leadId é obrigatório para enfileirar geração de espelho');
  }

  if (!data.especialidade) {
    throw new Error('especialidade é obrigatória para enfileirar geração de espelho');
  }

  if (!data.images || data.images.length === 0) {
    throw new Error('Pelo menos uma imagem é obrigatória para geração de espelho');
  }

  // ⭐ GARANTIR que selectedProvider sempre tenha um valor válido
  const normalizedData: MirrorGenerationJobData = {
    ...data,
    selectedProvider: data.selectedProvider || 'GEMINI',
  };

  // Determinar prioridade (menor = maior prioridade)
  const priority = normalizedData.priority ?? 2; // Prioridade 2 (entre manuscrito=1 e análise=3)

  const job = await mirrorGenerationQueue.add(
    'generateMirror',
    normalizedData, // ← Usa dados normalizados com selectedProvider garantido
    {
      jobId: `mirror-${normalizedData.leadId}-${Date.now()}`,
      priority,
    },
  );

  console.log(`[MirrorQueue] ✅ Job ${job.id} criado com sucesso (prioridade: ${priority}, provider: ${normalizedData.selectedProvider})`);

  return job;
}

// ============================================================================
// QUEUE UTILITIES
// ============================================================================

/**
 * Obtém status de um job específico
 */
export async function getMirrorJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress?: number;
  result?: MirrorGenerationJobResult;
  error?: string;
} | null> {
  const job = await mirrorGenerationQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason;

  return {
    id: job.id!,
    state,
    progress: typeof progress === 'number' ? progress : undefined,
    result: job.returnvalue,
    error: failedReason,
  };
}

/**
 * Obtém todos os jobs de espelho de um lead específico
 */
export async function getMirrorJobsByLead(leadId: string): Promise<Job<MirrorGenerationJobData, MirrorGenerationJobResult>[]> {
  const jobs = await mirrorGenerationQueue.getJobs(['waiting', 'active', 'completed', 'failed']);

  return jobs.filter(job => job.data.leadId === leadId);
}

/**
 * Limpa jobs antigos da fila
 */
export async function cleanMirrorQueue(): Promise<void> {
  console.log('[MirrorQueue] 🧹 Limpando jobs antigos...');

  await mirrorGenerationQueue.clean(86400 * 1000, 20, 'completed'); // Completados após 24h, mantendo últimos 20
  await mirrorGenerationQueue.clean(172800 * 1000, 10, 'failed'); // Falhos após 48h, mantendo últimos 10

  console.log('[MirrorQueue] ✅ Limpeza concluída');
}

/**
 * Obtém métricas da fila de espelhos
 */
export async function getMirrorQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    mirrorGenerationQueue.getWaitingCount(),
    mirrorGenerationQueue.getActiveCount(),
    mirrorGenerationQueue.getCompletedCount(),
    mirrorGenerationQueue.getFailedCount(),
    mirrorGenerationQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Pausa processamento da fila
 */
export async function pauseMirrorQueue(): Promise<void> {
  console.log('[MirrorQueue] ⏸️ Pausando fila de espelhos...');
  await mirrorGenerationQueue.pause();
  console.log('[MirrorQueue] ✅ Fila pausada');
}

/**
 * Retoma processamento da fila
 */
export async function resumeMirrorQueue(): Promise<void> {
  console.log('[MirrorQueue] ▶️ Retomando fila de espelhos...');
  await mirrorGenerationQueue.resume();
  console.log('[MirrorQueue] ✅ Fila retomada');
}

// ============================================================================
// QUEUE EVENTS (para monitoramento)
// ============================================================================

// Event listeners para logging e monitoramento (removidos - eventos são tratados pelo worker)

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Fecha a fila gracefully (para shutdown do sistema)
 */
export async function closeMirrorQueue(): Promise<void> {
  console.log('[MirrorQueue] 🔌 Fechando fila de espelhos...');
  await mirrorGenerationQueue.close();
  console.log('[MirrorQueue] ✅ Fila fechada');
}

// Registrar shutdown handler
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await closeMirrorQueue();
  });

  process.on('SIGINT', async () => {
    await closeMirrorQueue();
  });
}
