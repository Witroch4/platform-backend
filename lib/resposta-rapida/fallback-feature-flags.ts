/**
 * Sistema de fallback para feature flags quando Redis não está disponível
 * Usa valores padrão seguros baseados em variáveis de ambiente
 */

interface FallbackFeatureFlags {
  [key: string]: boolean;
}

// Valores padrão para feature flags quando Redis não está disponível
const DEFAULT_FEATURE_FLAGS: FallbackFeatureFlags = {
  // Flash Intent flags - padrão desabilitado para segurança
  'FLASH_INTENT_GLOBAL': false,
  'NEW_WEBHOOK_PROCESSING': false,
  'HIGH_PRIORITY_QUEUE': false,
  'LOW_PRIORITY_QUEUE': false,
  'UNIFIED_LEAD_MODEL': false,
  'INTELLIGENT_CACHING': false,
  'APPLICATION_MONITORING': false,
  'UNIFIED_PAYLOAD_EXTRACTION': false,
  
  // Flags específicas de usuário - padrão desabilitado
  // Serão verificadas dinamicamente baseado no padrão USER_{userId}_FLASH_INTENT_*
};

/**
 * Verifica se uma feature flag está ativa usando fallback
 * Prioridade: Redis > Variável de Ambiente > Valor Padrão
 */
export function getFallbackFeatureFlag(flagName: string, userId?: string): boolean {
  try {
    // 1. Tentar variável de ambiente específica
    const envVarName = `FEATURE_FLAG_${flagName.toUpperCase()}`;
    const envValue = process.env[envVarName];
    
    if (envValue !== undefined) {
      const isEnabled = envValue.toLowerCase() === 'true' || envValue === '1';
      console.log(`[Fallback] Feature flag ${flagName} from env: ${isEnabled}`);
      return isEnabled;
    }

    // 2. Para flags de usuário específico, verificar padrão
    if (userId && flagName.startsWith(`USER_${userId}_FLASH_INTENT`)) {
      // Verificar se há uma variável de ambiente para este usuário
      const userEnvVar = `FEATURE_FLAG_USER_${userId}_FLASH_INTENT`;
      const userEnvValue = process.env[userEnvVar];
      
      if (userEnvValue !== undefined) {
        const isEnabled = userEnvValue.toLowerCase() === 'true' || userEnvValue === '1';
        console.log(`[Fallback] User feature flag ${flagName} from env: ${isEnabled}`);
        return isEnabled;
      }
      
      // Fallback para flags de usuário: desabilitado por padrão
      return false;
    }

    // 3. Usar valor padrão da configuração
    const defaultValue = DEFAULT_FEATURE_FLAGS[flagName] ?? false;
    console.log(`[Fallback] Feature flag ${flagName} using default: ${defaultValue}`);
    return defaultValue;

  } catch (error) {
    console.error(`[Fallback] Erro ao verificar feature flag ${flagName}:`, error);
    return false; // Sempre retornar false em caso de erro
  }
}

/**
 * Verifica se Flash Intent está ativa globalmente usando fallback
 */
export function isFlashIntentGloballyEnabledFallback(): boolean {
  try {
    // Verificar flag específica primeiro
    const globalFlag = getFallbackFeatureFlag('FLASH_INTENT_GLOBAL');
    if (globalFlag) {
      return true;
    }

    // Verificar se todas as funcionalidades principais estão ativas
    const allComponentsActive = [
      'NEW_WEBHOOK_PROCESSING',
      'HIGH_PRIORITY_QUEUE',
      'LOW_PRIORITY_QUEUE',
      'UNIFIED_LEAD_MODEL',
      'INTELLIGENT_CACHING',
      'APPLICATION_MONITORING',
    ].every(flag => getFallbackFeatureFlag(flag));

    return allComponentsActive;

  } catch (error) {
    console.error('[Fallback] Erro ao verificar Flash Intent global:', error);
    return false;
  }
}

/**
 * Verifica se Flash Intent está ativa para um usuário específico usando fallback
 */
export function isFlashIntentEnabledForUserFallback(userId: string): boolean {
  try {
    // Primeiro verificar se está ativo globalmente
    if (isFlashIntentGloballyEnabledFallback()) {
      return true;
    }

    // Verificar flags específicas do usuário
    const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
    
    const userComponentsActive = [
      `${userFlagPrefix}_WEBHOOK`,
      `${userFlagPrefix}_HIGH_PRIORITY_QUEUE`,
      `${userFlagPrefix}_LOW_PRIORITY_QUEUE`,
      `${userFlagPrefix}_UNIFIED_MODEL`,
      `${userFlagPrefix}_CACHING`,
    ].every(flag => getFallbackFeatureFlag(flag, userId));

    return userComponentsActive;

  } catch (error) {
    console.error(`[Fallback] Erro ao verificar Flash Intent para usuário ${userId}:`, error);
    return false;
  }
}

/**
 * Obtém status detalhado usando fallback
 */
export function getFlashIntentStatusFallback(userId?: string): {
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
} {
  try {
    const globalEnabled = isFlashIntentGloballyEnabledFallback();
    const userEnabled = userId ? isFlashIntentEnabledForUserFallback(userId) : false;

    const components = {
      newWebhookProcessing: getFallbackFeatureFlag('NEW_WEBHOOK_PROCESSING'),
      highPriorityQueue: getFallbackFeatureFlag('HIGH_PRIORITY_QUEUE'),
      lowPriorityQueue: getFallbackFeatureFlag('LOW_PRIORITY_QUEUE'),
      unifiedLeadModel: getFallbackFeatureFlag('UNIFIED_LEAD_MODEL'),
      intelligentCaching: getFallbackFeatureFlag('INTELLIGENT_CACHING'),
      applicationMonitoring: getFallbackFeatureFlag('APPLICATION_MONITORING'),
    };

    return {
      globalEnabled,
      userEnabled,
      components,
    };

  } catch (error) {
    console.error(`[Fallback] Erro ao obter status para usuário ${userId}:`, error);
    return {
      globalEnabled: false,
      userEnabled: false,
      components: {
        newWebhookProcessing: false,
        highPriorityQueue: false,
        lowPriorityQueue: false,
        unifiedLeadModel: false,
        intelligentCaching: false,
        applicationMonitoring: false,
      },
    };
  }
}

/**
 * Configura feature flags via variáveis de ambiente para desenvolvimento
 * Útil quando Redis não está disponível
 */
export function setupDevelopmentFeatureFlags(): void {
  if (process.env.NODE_ENV === 'development') {
    // Ativar Flash Intent por padrão em desenvolvimento se não estiver definido
    const flags = [
      'FEATURE_FLAG_FLASH_INTENT_GLOBAL',
      'FEATURE_FLAG_NEW_WEBHOOK_PROCESSING',
      'FEATURE_FLAG_HIGH_PRIORITY_QUEUE',
      'FEATURE_FLAG_LOW_PRIORITY_QUEUE',
      'FEATURE_FLAG_UNIFIED_LEAD_MODEL',
      'FEATURE_FLAG_INTELLIGENT_CACHING',
      'FEATURE_FLAG_APPLICATION_MONITORING',
    ];

    flags.forEach(flag => {
      if (process.env[flag] === undefined) {
        process.env[flag] = 'true';
        console.log(`[Development] Ativando ${flag} por padrão`);
      }
    });
  }
}