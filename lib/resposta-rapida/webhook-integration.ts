import { FlashIntentChecker } from "./flash-intent-checker";
import { 
  addRespostaRapidaJob,
  createIntentJob,
  createButtonJob,
  RespostaRapidaJobData
} from "@/lib/queue/resposta-rapida.queue";
import { 
  addPersistenciaCredenciaisJob,
  createCredentialsUpdateJob,
  createLeadUpdateJob
} from "@/lib/queue/persistencia-credenciais.queue";
import {
  createSanitizedRespostaRapidaJob,
  sanitizeRespostaRapidaJobData,
  validateRespostaRapidaJobData,
  logSanitizationResults
} from "@/lib/webhook-utils";

/**
 * Integração da Flash Intent com o sistema de webhook
 * Esta função determina se deve usar o processamento rápido ou padrão
 */
export class WebhookFlashIntentIntegration {
  private flashIntentChecker: FlashIntentChecker;

  constructor() {
    this.flashIntentChecker = FlashIntentChecker.getInstance();
  }

  /**
   * Processa uma requisição de webhook com base no status da Flash Intent
   */
  async processWebhookRequest(
    requestData: {
      type: "intent" | "button_click";
      intentName?: string;
      buttonId?: string;
      recipientPhone: string;
      whatsappApiKey: string;
      phoneNumberId: string;
      businessId: string;
      inboxId: string;
      userId?: string;
      correlationId: string;
      wamid: string;
      messageId?: number;
      accountId?: number;
      accountName?: string;
      contactSource?: string;
      originalPayload: any;
    }
  ): Promise<{
    success: boolean;
    processingMode: "flash" | "standard";
    queueUsed: "high_priority" | "low_priority" | "standard";
    message?: string;
  }> {
    try {
      const { userId, correlationId } = requestData;

      // Verificar se Flash Intent está ativa para este usuário ou globalmente
      const flashIntentActive = userId 
        ? await this.flashIntentChecker.isFlashIntentEnabledForUser(userId)
        : await this.flashIntentChecker.isFlashIntentEnabledGlobally();

      console.log(`[Flash Intent] Status para usuário ${userId}: ${flashIntentActive ? 'ATIVA' : 'INATIVA'}`, {
        correlationId,
        userId,
        requestType: requestData.type,
      });

      if (flashIntentActive) {
        // Usar processamento Flash Intent (alta prioridade)
        return await this.processWithFlashIntent(requestData);
      } else {
        // Usar processamento padrão (baixa prioridade)
        return await this.processWithStandardMode(requestData);
      }

    } catch (error) {
      console.error("[Flash Intent] Erro ao processar webhook:", error);
      
      // Em caso de erro, usar modo padrão como fallback
      return await this.processWithStandardMode(requestData);
    }
  }

  /**
   * Processa com Flash Intent ativa (alta prioridade)
   */
  private async processWithFlashIntent(requestData: any): Promise<{
    success: boolean;
    processingMode: "flash";
    queueUsed: "high_priority";
    message?: string;
  }> {
    try {
      console.log(`[Flash Intent] Processando com ALTA PRIORIDADE`, {
        correlationId: requestData.correlationId,
        type: requestData.type,
      });

      // Criar e sanitizar dados do job usando a função utilitária
      const { jobData: sanitizedJobData, validation } = createSanitizedRespostaRapidaJob(
        requestData.originalPayload,
        requestData.correlationId
      );

      // Log dos resultados da sanitização
      logSanitizationResults(
        requestData.correlationId,
        JSON.stringify(requestData).length,
        JSON.stringify(sanitizedJobData).length,
        validation
      );

      // Verificar se a sanitização foi bem-sucedida
      if (!validation.isValid) {
        console.error(`[Flash Intent] Dados sanitizados inválidos:`, {
          correlationId: requestData.correlationId,
          errors: validation.errors,
          warnings: validation.warnings,
        });
        
        throw new Error(`Sanitization failed: ${validation.errors.join(', ')}`);
      }

      // Criar job data estruturado para a fila
      const jobData: RespostaRapidaJobData = {
        type: "processarResposta",
        data: sanitizedJobData,
      };

      // Adicionar à fila de alta prioridade (resposta rápida)
      await addRespostaRapidaJob(jobData, {
        priority: 100, // Máxima prioridade
        delay: 0, // Sem delay
        correlationId: requestData.correlationId,
      });

      console.log(`[Flash Intent] Job de alta prioridade criado com sucesso`, {
        correlationId: requestData.correlationId,
        jobType: requestData.type,
        interactionType: sanitizedJobData.interactionType,
        sanitizationWarnings: validation.warnings.length,
      });

      return {
        success: true,
        processingMode: "flash",
        queueUsed: "high_priority",
        message: "Processamento Flash Intent iniciado com alta prioridade (dados sanitizados)",
      };

    } catch (error) {
      console.error("[Flash Intent] Erro no processamento de alta prioridade:", error);
      throw error;
    }
  }

  /**
   * Processa com modo padrão (baixa prioridade)
   */
  private async processWithStandardMode(requestData: any): Promise<{
    success: boolean;
    processingMode: "standard";
    queueUsed: "low_priority";
    message?: string;
  }> {
    try {
      console.log(`[Flash Intent] Processando com BAIXA PRIORIDADE (modo padrão)`, {
        correlationId: requestData.correlationId,
        type: requestData.type,
      });

      // Sanitizar dados básicos para o modo padrão
      const sanitizedData = {
        inboxId: String(requestData.inboxId).trim(),
        whatsappApiKey: requestData.whatsappApiKey.trim(),
        phoneNumberId: String(requestData.phoneNumberId).trim(),
        businessId: String(requestData.businessId).trim(),
        contactSource: requestData.contactSource ? String(requestData.contactSource).trim() : 'webhook',
        leadData: {
          messageId: requestData.messageId || 0,
          accountId: requestData.accountId || 0,
          accountName: requestData.accountName ? String(requestData.accountName).trim() : 'unknown',
          contactPhone: requestData.recipientPhone.replace(/\D/g, ''), // Sanitizar telefone
          wamid: String(requestData.wamid).trim(),
        },
        correlationId: String(requestData.correlationId).trim(),
      };

      // Validar dados sanitizados básicos
      if (!sanitizedData.inboxId || !sanitizedData.whatsappApiKey || !sanitizedData.leadData.contactPhone) {
        throw new Error('Dados essenciais inválidos após sanitização');
      }

      // Para modo padrão, criar jobs de persistência de credenciais e leads
      const credentialsJobData = createCredentialsUpdateJob(sanitizedData);
      const leadJobData = createLeadUpdateJob(sanitizedData);

      // Adicionar ambos os jobs à fila de baixa prioridade
      await Promise.all([
        addPersistenciaCredenciaisJob(credentialsJobData, {
          priority: 1, // Baixa prioridade
          delay: 1000, // 1 segundo de delay para batching
        }),
        addPersistenciaCredenciaisJob(leadJobData, {
          priority: 1, // Baixa prioridade
          delay: 1500, // 1.5 segundos de delay
        }),
      ]);

      console.log(`[Flash Intent] Jobs de baixa prioridade criados com sucesso`, {
        correlationId: requestData.correlationId,
        jobType: requestData.type,
        credentialsJob: credentialsJobData.type,
        leadJob: leadJobData.type,
        sanitizedDataSize: JSON.stringify(sanitizedData).length,
      });

      return {
        success: true,
        processingMode: "standard",
        queueUsed: "low_priority",
        message: "Processamento padrão iniciado com baixa prioridade (dados sanitizados)",
      };

    } catch (error) {
      console.error("[Flash Intent] Erro no processamento de baixa prioridade:", error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas de uso da Flash Intent
   */
  async getFlashIntentUsageStats(): Promise<{
    totalRequests: number;
    flashIntentRequests: number;
    standardRequests: number;
    flashIntentPercentage: number;
  }> {
    try {
      // Estas estatísticas poderiam vir do Redis ou de um sistema de métricas
      // Por enquanto, retornamos valores de exemplo
      return {
        totalRequests: 1000,
        flashIntentRequests: 750,
        standardRequests: 250,
        flashIntentPercentage: 75,
      };
    } catch (error) {
      console.error("[Flash Intent] Erro ao obter estatísticas:", error);
      return {
        totalRequests: 0,
        flashIntentRequests: 0,
        standardRequests: 0,
        flashIntentPercentage: 0,
      };
    }
  }
}

/**
 * Função utilitária para processar webhook com Flash Intent
 */
export async function processWebhookWithFlashIntent(
  requestData: {
    type: "intent" | "button_click";
    intentName?: string;
    buttonId?: string;
    recipientPhone: string;
    whatsappApiKey: string;
    phoneNumberId: string;
    businessId: string;
    inboxId: string;
    userId?: string;
    correlationId: string;
    wamid: string;
    messageId?: number;
    accountId?: number;
    accountName?: string;
    contactSource?: string;
    originalPayload: any;
  }
): Promise<{
  success: boolean;
  processingMode: "flash" | "standard";
  queueUsed: "high_priority" | "low_priority" | "standard";
  message?: string;
}> {
  const integration = new WebhookFlashIntentIntegration();
  return await integration.processWebhookRequest(requestData);
}

/**
 * Função para verificar se deve usar Flash Intent baseado no contexto da requisição
 */
export async function shouldUseFlashIntent(
  inboxId: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  const checker = FlashIntentChecker.getInstance();
  
  // Se temos um userId, verificar especificamente para ele
  if (userId) {
    return await checker.isFlashIntentEnabledForUser(userId);
  }
  
  // Caso contrário, verificar se está ativo globalmente
  return await checker.isFlashIntentEnabledGlobally();
}