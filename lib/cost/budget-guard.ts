import { isInboxBlocked, isUserBlocked, getDowngradedModel } from "./budget-controls";

/**
 * Exceção lançada quando operação é bloqueada por orçamento
 */
export class BudgetExceededException extends Error {
  constructor(
    message: string,
    public readonly budgetType: 'inbox' | 'user',
    public readonly identifier: string
  ) {
    super(message);
    this.name = 'BudgetExceededException';
  }
}

/**
 * Resultado da verificação de orçamento
 */
export interface BudgetCheckResult {
  allowed: boolean;
  blocked: boolean;
  originalModel?: string;
  suggestedModel?: string;
  reason?: string;
}

/**
 * Verifica se uma operação de IA é permitida baseada nos orçamentos
 */
export async function checkBudgetLimits(
  inboxId?: string,
  userId?: string
): Promise<BudgetCheckResult> {
  try {
    // Verificar bloqueios
    const [inboxBlocked, userBlocked] = await Promise.all([
      inboxId ? isInboxBlocked(inboxId) : false,
      userId ? isUserBlocked(userId) : false,
    ]);

    if (inboxBlocked) {
      return {
        allowed: false,
        blocked: true,
        reason: `Inbox ${inboxId} bloqueado por excesso de orçamento`,
      };
    }

    if (userBlocked) {
      return {
        allowed: false,
        blocked: true,
        reason: `Usuário ${userId} bloqueado por excesso de orçamento`,
      };
    }

    return {
      allowed: true,
      blocked: false,
    };

  } catch (error) {
    console.error('❌ Erro ao verificar limites de orçamento:', error);
    // Em caso de erro, permitir operação (fail-open)
    return {
      allowed: true,
      blocked: false,
      reason: 'Erro na verificação - permitindo operação',
    };
  }
}

/**
 * Middleware para verificar orçamento antes de operações OpenAI
 */
export async function guardOpenAIOperation(
  model: string,
  inboxId?: string,
  userId?: string
): Promise<{
  allowed: boolean;
  model: string;
  reason?: string;
}> {
  try {
    // Verificar se operação é permitida
    const budgetCheck = await checkBudgetLimits(inboxId, userId);
    
    if (!budgetCheck.allowed) {
      return {
        allowed: false,
        model,
        reason: budgetCheck.reason,
      };
    }

    // Verificar se há downgrade de modelo
    const suggestedModel = await getDowngradedModel(model, inboxId, userId);
    
    return {
      allowed: true,
      model: suggestedModel,
      reason: suggestedModel !== model ? 
        `Modelo downgraded de ${model} para ${suggestedModel} devido a orçamento` : 
        undefined,
    };

  } catch (error) {
    console.error('❌ Erro no guard OpenAI:', error);
    // Fail-open: permitir operação em caso de erro
    return {
      allowed: true,
      model,
      reason: 'Erro na verificação - permitindo operação',
    };
  }
}

/**
 * Middleware para verificar orçamento antes de envios WhatsApp
 */
export async function guardWhatsAppOperation(
  inboxId?: string,
  userId?: string
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  try {
    const budgetCheck = await checkBudgetLimits(inboxId, userId);
    
    return {
      allowed: budgetCheck.allowed,
      reason: budgetCheck.reason,
    };

  } catch (error) {
    console.error('❌ Erro no guard WhatsApp:', error);
    // Fail-open: permitir operação em caso de erro
    return {
      allowed: true,
      reason: 'Erro na verificação - permitindo operação',
    };
  }
}

/**
 * Wrapper que aplica verificação de orçamento a uma função
 */
export function withBudgetGuard<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  extractContext: (args: Parameters<T>) => { inboxId?: string; userId?: string }
): T {
  return (async (...args: Parameters<T>) => {
    const context = extractContext(args);
    const budgetCheck = await checkBudgetLimits(context.inboxId, context.userId);
    
    if (!budgetCheck.allowed) {
      throw new BudgetExceededException(
        budgetCheck.reason || 'Operação bloqueada por orçamento',
        context.inboxId ? 'inbox' : 'user',
        context.inboxId || context.userId || 'unknown'
      );
    }
    
    return fn(...args);
  }) as T;
}

/**
 * Utilitário para log de operações bloqueadas
 */
export function logBlockedOperation(
  operation: string,
  reason: string,
  context: { inboxId?: string; userId?: string; model?: string }
): void {
  console.warn(`🚫 [BUDGET_BLOCK] ${operation} bloqueada`, {
    reason,
    inboxId: context.inboxId,
    userId: context.userId,
    model: context.model,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Utilitário para log de downgrades de modelo
 */
export function logModelDowngrade(
  originalModel: string,
  downgradedModel: string,
  context: { inboxId?: string; userId?: string }
): void {
  console.info(`📉 [MODEL_DOWNGRADE] ${originalModel} → ${downgradedModel}`, {
    originalModel,
    downgradedModel,
    inboxId: context.inboxId,
    userId: context.userId,
    timestamp: new Date().toISOString(),
  });
}