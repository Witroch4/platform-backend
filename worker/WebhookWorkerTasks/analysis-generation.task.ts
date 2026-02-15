/**
 * Analysis Generation Task — Worker processor for oab-analysis queue
 *
 * Processa jobs de análise comparativa (Prova × Espelho) usando o agente
 * vinculado ao blueprint ANALISE_CELL.
 *
 * Feature flag: BLUEPRINT_ANALISE=true
 */

import type { Job } from 'bullmq';
import { getPrismaInstance } from '../../lib/connections';
import { runAnalysisAgent } from '../../lib/oab-eval/analysis-agent';
import type { AnalysisJobData, AnalysisJobResult } from '../../lib/oab-eval/analysis-queue';

// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import('../../lib/sse-manager').then((m) => m.sseManager);

/**
 * Processor principal para jobs de análise comparativa (Prova × Espelho).
 * Chamado pelo BullMQ Worker quando um job é retirado da fila oab-analysis.
 */
export async function processAnalysisGenerationTask(
  job: Job<AnalysisJobData>,
): Promise<AnalysisJobResult> {
  console.log(`[AnalysisWorker] 🔄 Iniciando processamento do job ${job.id}`);
  console.log(`[AnalysisWorker] 📋 Lead: ${job.data.leadId}`);
  console.log(`[AnalysisWorker] 🎛️ Provider: ${job.data.selectedProvider || 'OPENAI (padrão)'}`);

  const startTime = Date.now();

  try {
    const { leadId, textoProva, textoEspelho, selectedProvider } = job.data;

    // Callback de progresso
    const onProgress = async (message: string) => {
      const progress = message.includes('Carregando')
        ? 10
        : message.includes('Analisando')
          ? 40
          : message.includes('Processando')
            ? 80
            : 50;

      await job.updateProgress(progress);
      console.log(`[AnalysisWorker] [${leadId}] ${message} (${progress}%)`);
    };

    // Executar agente de análise
    console.log(`[AnalysisWorker] 🤖 Chamando agente de análise para lead ${leadId}...`);

    const result = await runAnalysisAgent({
      leadId,
      textoProva,
      textoEspelho,
      selectedProvider,
      onProgress,
    });

    await job.updateProgress(90);

    if (!result.success || !result.analysis) {
      const errorMsg = result.error || 'Agente retornou resultado vazio';
      console.error(`[AnalysisWorker] ❌ Análise falhou: ${errorMsg}`);

      // Atualizar lead para remover flag de aguardando
      await updateLeadOnFailure(leadId, errorMsg);

      throw new Error(errorMsg);
    }

    const { analysis } = result;
    const elapsedMs = Date.now() - startTime;

    console.log(
      `[AnalysisWorker] ✅ Análise gerada em ${(elapsedMs / 1000).toFixed(1)}s ` +
        `(${analysis.pontosPeca.length} pontos peça, ${analysis.pontosQuestoes.length} pontos questões, ` +
        `provider: ${result.provider}, modelo: ${result.model})`,
    );

    // Salvar resultado no banco via update direto (sem webhook intermediário)
    await job.updateProgress(95);
    await saveAnalysisResult(leadId, analysis);

    await job.updateProgress(100);
    console.log(`[AnalysisWorker] ✅ Job ${job.id} completado com sucesso`);

    return {
      leadId,
      success: true,
      processedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`[AnalysisWorker] ❌ Erro após ${(elapsedMs / 1000).toFixed(1)}s:`, error);

    // Tentar atualizar o lead para desmarcar aguardandoAnalise
    try {
      await updateLeadOnFailure(job.data.leadId, error.message || 'Erro desconhecido');
    } catch (updateErr) {
      console.error('[AnalysisWorker] ❌ Erro ao atualizar lead após falha:', updateErr);
    }

    throw error;
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Salva a análise no banco e notifica o frontend via SSE.
 */
async function saveAnalysisResult(leadId: string, analysis: any): Promise<void> {
  const prisma = getPrismaInstance();

  console.log(`[AnalysisWorker] 💾 Salvando resultado da análise para lead ${leadId}`);

  // Verificar se o lead existe
  const leadExistente = await prisma.leadOabData.findUnique({
    where: { id: leadId },
  });

  if (!leadExistente) {
    throw new Error(`Lead não encontrado com ID: ${leadId}`);
  }

  // Salvar a análise como analisePreliminar (JSON structurado)
  const leadAtualizado = await prisma.leadOabData.update({
    where: { id: leadId },
    data: {
      analisePreliminar: analysis,
      analiseProcessada: true,
      aguardandoAnalise: false,
    },
  });

  // Atualizar Lead pai
  try {
    const parentLeadId = (leadExistente as any).leadId;
    if (parentLeadId) {
      await prisma.lead.update({
        where: { id: parentLeadId },
        data: { updatedAt: new Date() },
      });
    }
  } catch (e: any) {
    console.warn(
      `[AnalysisWorker] Não foi possível atualizar timestamp do Lead pai para ${leadId}: ${e?.message || e}`,
    );
  }

  console.log(`[AnalysisWorker] ✅ Análise salva com sucesso para lead ${leadId}`);

  // Enviar notificação SSE
  try {
    const sseManager = await getSseManager();
    const success = await sseManager.sendNotification(leadId, {
      type: 'leadUpdate',
      message: 'Sua pré-análise está pronta!',
      leadData: leadAtualizado,
      timestamp: new Date().toISOString(),
    });

    if (success) {
      console.log(`[AnalysisWorker] ✅ Notificação SSE enviada para lead ${leadId}`);
    } else {
      console.warn(`[AnalysisWorker] ⚠️ Falha ao enviar SSE para lead ${leadId}`);
    }
  } catch (sseErr) {
    console.error(`[AnalysisWorker] ❌ Erro ao enviar SSE:`, sseErr);
  }
}

/**
 * Atualiza lead em caso de falha, removendo flag de aguardando.
 */
async function updateLeadOnFailure(leadId: string, errorMessage: string): Promise<void> {
  const prisma = getPrismaInstance();

  try {
    await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        aguardandoAnalise: false,
      },
    });

    // Notificar erro via SSE
    const sseManager = await getSseManager();
    await sseManager.sendNotification(leadId, {
      type: 'error',
      message: `Ocorreu um erro na análise: ${errorMessage.slice(0, 200)}`,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error(`[AnalysisWorker] ❌ Erro ao atualizar lead on failure:`, e);
  }
}
