import type { Job } from 'bullmq';
import { getPrismaInstance } from '../../lib/connections';
import { generateMirrorLocally } from '../../lib/oab-eval/mirror-generator-agent';
import type { MirrorGenerationJobData, MirrorGenerationJobResult } from '../../lib/oab-eval/mirror-queue';

/**
 * Processor para jobs de geração de espelho local
 */
export async function processMirrorGenerationTask(
  job: Job<MirrorGenerationJobData>,
): Promise<MirrorGenerationJobResult> {
  console.log(`[MirrorWorker] 🔄 Iniciando processamento do job ${job.id}`);
  console.log(`[MirrorWorker] 📋 Lead: ${job.data.leadId}, Especialidade: ${job.data.especialidade}`);

  const startTime = Date.now();

  try {
    const { leadId, especialidade, espelhoPadraoId, images, nome, telefone } = job.data;

    // Callback de progresso que atualiza o job
    const onProgress = async (message: string) => {
      const progress = message.includes('Carregando rubrica')
        ? 10
        : message.includes('Preparando imagens')
          ? 30
          : message.includes('Extraindo dados')
            ? 60
            : message.includes('Construindo espelho')
              ? 80
              : message.includes('Formatando')
                ? 90
                : 50;

      await job.updateProgress(progress);
      console.log(`[MirrorWorker] [${leadId}] ${message} (${progress}%)`);
    };

    // Executar agente de geração de espelho
    console.log(`[MirrorWorker] 🤖 Chamando agente local para lead ${leadId}...`);
    if (espelhoPadraoId) {
      console.log(`[MirrorWorker] 📋 Usando espelho padrão: ${espelhoPadraoId}`);
    }

    const result = await generateMirrorLocally({
      leadId,
      especialidade,
      espelhoPadraoId, // ⭐ NOVO
      images,
      telefone,
      nome,
      onProgress,
    });

    await job.updateProgress(95);

    const { markdownMirror, jsonMirror, structuredMirror } = result;

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[MirrorWorker] ✅ Espelho gerado com sucesso em ${(elapsedMs / 1000).toFixed(1)}s`,
    );
    console.log(
      `[MirrorWorker] 📊 Aluno: ${structuredMirror.meta.aluno}, Nota: ${structuredMirror.totais.final.toFixed(2)}`,
    );

    // Enviar resultado ao webhook interno para salvar no banco
    await job.updateProgress(98);
    await notifyWebhook({
      leadID: leadId,
      leadId, // compatibilidade
      espelhoLocalProcessado: true,
      success: true,
      markdownMirror,
      jsonMirror,
      extractedData: result.extractedData,
      structuredMirror,
    });

    await job.updateProgress(100);

    console.log(`[MirrorWorker] ✅ Job ${job.id} completado com sucesso`);

    return {
      leadId,
      success: true,
      markdownMirror,
      jsonMirror,
      processedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`[MirrorWorker] ❌ Erro após ${(elapsedMs / 1000).toFixed(1)}s:`, error);

    // Notificar erro ao webhook
    try {
      await notifyWebhook({
        leadID: job.data.leadId,
        leadId: job.data.leadId,
        espelhoLocalProcessado: true,
        success: false,
        error: error.message || 'Erro desconhecido ao gerar espelho',
      });
    } catch (notifyError) {
      console.error('[MirrorWorker] ❌ Erro ao notificar webhook sobre falha:', notifyError);
    }

    // Re-lançar erro para que BullMQ possa fazer retry
    throw error;
  }
}

/**
 * Notifica o webhook interno com o resultado do processamento
 */
function resolveWebhookBaseUrl(): string {
  const fallbackHost = process.env.INTERNAL_APP_HOST || 'chatwit_dev';
  const fallbackPort = process.env.INTERNAL_APP_PORT || '3002';
  const fallbackUrl = `http://${fallbackHost}:${fallbackPort}`;
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

  const candidates = [
    process.env.INTERNAL_APP_URL,
    process.env.APP_INTERNAL_URL,
    process.env.NEXT_INTERNAL_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const isLocalHost = localHosts.has(url.hostname);

      if (isLocalHost) {
        url.hostname = fallbackHost;
        if (!url.port) {
          url.port = fallbackPort;
        }
      }

      return url.origin;
    } catch (error) {
      console.warn(`[MirrorWorker] ⚠️ Ignorando base URL inválida: ${candidate}`);
    }
  }

  return fallbackUrl;
}

async function notifyWebhook(payload: Record<string, any>): Promise<void> {
  console.log(`[MirrorWorker] 📤 Notificando webhook com resultado do espelho...`);

  const baseUrl = resolveWebhookBaseUrl();
  const webhookUrl = `${baseUrl}/api/admin/leads-chatwit/webhook`;
  console.log(`[MirrorWorker] 🌐 Webhook URL destino: ${webhookUrl}`);

  try {
    // ⭐ IMPORTANTE: Enviar espelho COMPLETO (sem otimização)
    // A otimização acontece APENAS na API que envia para o agente externo
    // Isso garante que o espelho salvo no banco seja completo
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[MirrorWorker] ❌ Webhook retornou erro ${response.status}: ${errorText}`,
      );
      throw new Error(`Webhook error: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MirrorWorker] ✅ Webhook notificado com sucesso:`, result);
  } catch (error: any) {
    console.error(`[MirrorWorker] ❌ Erro ao notificar webhook:`, error);
    throw error;
  }
}
