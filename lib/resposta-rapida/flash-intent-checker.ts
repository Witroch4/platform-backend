import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { 
  isFlashIntentGloballyEnabledFallback,
  isFlashIntentEnabledForUserFallback,
  getFlashIntentStatusFallback 
} from "./fallback-feature-flags";

/**
 * Verifica se a Flash Intent está ativa para um usuário específico
 * ou globalmente no sistema
 */
export class FlashIntentChecker {
  private static instance: FlashIntentChecker;
  private flagManager: FeatureFlagManager | null = null;
  private initialized = false;

  constructor() {
    // Inicialização lazy para evitar problemas de conexão
  }

  static getInstance(): FlashIntentChecker {
    if (!FlashIntentChecker.instance) {
      FlashIntentChecker.instance = new FlashIntentChecker();
    }
    return FlashIntentChecker.instance;
  }

  private async initialize() {
    if (this.initialized) return;

    try {
      const prisma = getPrismaInstance();
      const redis = getRedisInstance();
      this.flagManager = FeatureFlagManager.getInstance(prisma, redis);
      this.initialized = true;
    } catch (error) {
      console.error('[FlashIntentChecker] Erro ao inicializar FeatureFlagManager, usando fallback:', error);
      this.flagManager = null;
      this.initialized = true;
    }
  }

  /**
   * Verifica se a Flash Intent está ativa para um usuário específico
   */
  async isFlashIntentEnabledForUser(userId: string): Promise<boolean> {
    try {
      await this.initialize();

      // Se não conseguiu inicializar o FeatureFlagManager, usar fallback
      if (!this.flagManager) {
        return isFlashIntentEnabledForUserFallback(userId);
      }

      // Primeiro, verificar se está ativo globalmente
      const globalEnabled = await this.isFlashIntentEnabledGlobally();
      if (globalEnabled) {
        return true;
      }

      // Se não está ativo globalmente, verificar flags específicas do usuário
      const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
      
      const [
        webhookEnabled,
        highPriorityEnabled,
        lowPriorityEnabled,
        unifiedModelEnabled,
        cachingEnabled,
      ] = await Promise.all([
        this.flagManager.isEnabled(`${userFlagPrefix}_WEBHOOK`, userId).catch(() => false),
        this.flagManager.isEnabled(`${userFlagPrefix}_HIGH_PRIORITY_QUEUE`, userId).catch(() => false),
        this.flagManager.isEnabled(`${userFlagPrefix}_LOW_PRIORITY_QUEUE`, userId).catch(() => false),
        this.flagManager.isEnabled(`${userFlagPrefix}_UNIFIED_MODEL`, userId).catch(() => false),
        this.flagManager.isEnabled(`${userFlagPrefix}_CACHING`, userId).catch(() => false),
      ]);

      // Flash Intent está ativa se todas as funcionalidades estão ativas
      return webhookEnabled && highPriorityEnabled && lowPriorityEnabled && 
             unifiedModelEnabled && cachingEnabled;

    } catch (error) {
      console.error(`[FlashIntent] Erro ao verificar Flash Intent para usuário ${userId}, usando fallback:`, error);
      // Usar sistema de fallback quando há erro de conexão
      return isFlashIntentEnabledForUserFallback(userId);
    }
  }

  /**
   * Verifica se a Flash Intent está ativa globalmente
   */
  async isFlashIntentEnabledGlobally(): Promise<boolean> {
    try {
      await this.initialize();

      // Se não conseguiu inicializar o FeatureFlagManager, usar fallback
      if (!this.flagManager) {
        return isFlashIntentGloballyEnabledFallback();
      }

      const [
        globalFlag,
        newWebhookProcessing,
        highPriorityQueue,
        lowPriorityQueue,
        unifiedLeadModel,
        intelligentCaching,
        applicationMonitoring,
      ] = await Promise.all([
        this.flagManager.isEnabled("FLASH_INTENT_GLOBAL").catch(() => false),
        this.flagManager.isEnabled("NEW_WEBHOOK_PROCESSING").catch(() => false),
        this.flagManager.isEnabled("HIGH_PRIORITY_QUEUE").catch(() => false),
        this.flagManager.isEnabled("LOW_PRIORITY_QUEUE").catch(() => false),
        this.flagManager.isEnabled("UNIFIED_LEAD_MODEL").catch(() => false),
        this.flagManager.isEnabled("INTELLIGENT_CACHING").catch(() => false),
        this.flagManager.isEnabled("APPLICATION_MONITORING").catch(() => false),
      ]);

      // Flash Intent global está ativa se a flag específica está ativa
      // OU se todas as funcionalidades principais estão ativas
      return globalFlag || (
        newWebhookProcessing &&
        highPriorityQueue &&
        lowPriorityQueue &&
        unifiedLeadModel &&
        intelligentCaching &&
        applicationMonitoring
      );

    } catch (error) {
      console.error('[FlashIntent] Erro ao verificar Flash Intent global, usando fallback:', error);
      return isFlashIntentGloballyEnabledFallback();
    }
  }

  /**
   * Verifica se uma funcionalidade específica da Flash Intent está ativa
   * para um usuário ou globalmente
   */
  async isFeatureEnabledForUser(
    feature: 'WEBHOOK' | 'HIGH_PRIORITY_QUEUE' | 'LOW_PRIORITY_QUEUE' | 'UNIFIED_MODEL' | 'CACHING',
    userId?: string
  ): Promise<boolean> {
    try {
      await this.initialize();

      // Se não conseguiu inicializar o FeatureFlagManager, usar fallback
      if (!this.flagManager) {
        return false; // Não há fallback para funcionalidades individuais
      }

      // Mapear funcionalidades para flags globais
      const globalFlagMap = {
        'WEBHOOK': 'NEW_WEBHOOK_PROCESSING',
        'HIGH_PRIORITY_QUEUE': 'HIGH_PRIORITY_QUEUE',
        'LOW_PRIORITY_QUEUE': 'LOW_PRIORITY_QUEUE',
        'UNIFIED_MODEL': 'UNIFIED_LEAD_MODEL',
        'CACHING': 'INTELLIGENT_CACHING',
      };

      // Verificar flag global primeiro
      const globalEnabled = await this.flagManager.isEnabled(globalFlagMap[feature]);
      if (globalEnabled) {
        return true;
      }

      // Se não está ativo globalmente e temos um userId, verificar flag específica do usuário
      if (userId) {
        const userFlag = `USER_${userId}_FLASH_INTENT_${feature}`;
        return await this.flagManager.isEnabled(userFlag, userId);
      }

      return false;

    } catch (error) {
      console.error(`[FlashIntent] Erro ao verificar funcionalidade ${feature} para usuário ${userId}:`, error);
      return false;
    }
  }

  /**
   * Obtém status detalhado da Flash Intent
   */
  async getFlashIntentStatus(userId?: string): Promise<{
    globalEnabled: boolean;
    userEnabled: boolean;
    components: {
      newWebhookProcessing: boolean;
      highPriorityQueue: boolean;
      lowPriorityQueue: boolean;
      unifiedLeadModel: boolean;
      intelligentCaching: boolean;
      applicationMonitoring: boolean;
    };
  }> {
    try {
      await this.initialize();

      // Se não conseguiu inicializar o FeatureFlagManager, usar fallback
      if (!this.flagManager) {
        return getFlashIntentStatusFallback(userId);
      }

      const globalEnabled = await this.isFlashIntentEnabledGlobally();
      const userEnabled = userId ? await this.isFlashIntentEnabledForUser(userId) : false;

      const [
        newWebhookProcessing,
        highPriorityQueue,
        lowPriorityQueue,
        unifiedLeadModel,
        intelligentCaching,
        applicationMonitoring,
      ] = await Promise.all([
        this.flagManager.isEnabled("NEW_WEBHOOK_PROCESSING").catch(() => false),
        this.flagManager.isEnabled("HIGH_PRIORITY_QUEUE").catch(() => false),
        this.flagManager.isEnabled("LOW_PRIORITY_QUEUE").catch(() => false),
        this.flagManager.isEnabled("UNIFIED_LEAD_MODEL").catch(() => false),
        this.flagManager.isEnabled("INTELLIGENT_CACHING").catch(() => false),
        this.flagManager.isEnabled("APPLICATION_MONITORING").catch(() => false),
      ]);

      return {
        globalEnabled,
        userEnabled,
        components: {
          newWebhookProcessing,
          highPriorityQueue,
          lowPriorityQueue,
          unifiedLeadModel,
          intelligentCaching,
          applicationMonitoring,
        },
      };

    } catch (error) {
      console.error('[FlashIntent] Erro ao obter status, usando fallback:', error);
      return getFlashIntentStatusFallback(userId);
    }
  }
}

/**
 * Função utilitária para verificar rapidamente se Flash Intent está ativa
 */
export async function isFlashIntentActive(userId?: string): Promise<boolean> {
  const checker = FlashIntentChecker.getInstance();
  
  if (userId) {
    return await checker.isFlashIntentEnabledForUser(userId);
  } else {
    return await checker.isFlashIntentEnabledGlobally();
  }
}

/**
 * Função utilitária para verificar se uma funcionalidade específica está ativa
 */
export async function isFlashIntentFeatureActive(
  feature: 'WEBHOOK' | 'HIGH_PRIORITY_QUEUE' | 'LOW_PRIORITY_QUEUE' | 'UNIFIED_MODEL' | 'CACHING',
  userId?: string
): Promise<boolean> {
  const checker = FlashIntentChecker.getInstance();
  return await checker.isFeatureEnabledForUser(feature, userId);
}