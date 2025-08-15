import { CostBudget } from "@prisma/client";
import { getRedisInstance } from "@/lib/connections";
import {
  budgetNotificationService,
  BudgetNotificationData,
} from "./notification-service";

const redis = getRedisInstance();

/**
 * Tipos de alerta de orçamento
 */
export type BudgetAlertType = "WARNING" | "EXCEEDED";

/**
 * Configuração de controles de orçamento
 */
export const BUDGET_CONTROLS_CONFIG = {
  // Prefixos Redis para flags de controle
  REDIS_PREFIXES: {
    INBOX_BLOCKED: "cost:blocked:inbox:",
    USER_BLOCKED: "cost:blocked:user:",
    MODEL_DOWNGRADE: "cost:downgrade:",
    ALERT_SENT: "cost:alert:sent:",
  },

  // TTL para flags (em segundos)
  TTL: {
    BLOCK_FLAG: 3600, // 1 hora
    ALERT_COOLDOWN: 1800, // 30 minutos entre alertas
    DOWNGRADE_FLAG: 7200, // 2 horas
  },

  // Configurações de downgrade de modelo
  MODEL_DOWNGRADES: {
    "gpt-4o": "gpt-4o-mini",
    "gpt-4": "gpt-3.5-turbo",
    "gpt-4-turbo": "gpt-4o-mini",
  },

  // Limites para diferentes ações
  THRESHOLDS: {
    SOFT_LIMIT: 0.8, // 80% - enviar alerta
    HARD_LIMIT: 1.0, // 100% - aplicar controles
    CRITICAL_LIMIT: 1.2, // 120% - bloqueio total
  },
};

/**
 * Envia alerta de orçamento por email/notificação
 */
export async function sendBudgetAlert(
  budget: CostBudget,
  currentSpending: number,
  percentage: number,
  alertType: BudgetAlertType
): Promise<boolean> {
  try {
    // Preparar dados da notificação
    const notificationData: BudgetNotificationData = {
      budgetId: budget.id,
      budgetName: budget.name,
      currentSpending,
      limitUSD: Number(budget.limitUSD),
      percentage,
      period: budget.period,
      inboxId: budget.inboxId || undefined,
      userId: budget.userId || undefined,
      type: alertType === "EXCEEDED" ? "EXCEEDED" : "WARNING",
      timestamp: new Date().toISOString(),
      actions: alertType === "EXCEEDED" ? ["CONTROLS_APPLIED"] : [],
    };

    // Configurar canais de notificação
    const notificationConfig = {
      channels: ["email", "dashboard"] as ("email" | "dashboard")[],
      emailRecipients: await getBudgetAlertRecipients(budget),
      cooldownMinutes: 30,
    };

    // Enviar notificação através do serviço
    const result = await budgetNotificationService.sendBudgetNotification(
      budget,
      notificationData,
      notificationConfig
    );

    if (result.success) {
      console.log(
        `📧 Alerta de orçamento enviado: ${budget.name} (${alertType})`
      );
      return true;
    } else {
      console.warn(
        `⚠️ Falha ao enviar alerta de orçamento ${budget.name}:`,
        result.errors
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao enviar alerta de orçamento ${budget.id}:`, error);
    return false;
  }
}

/**
 * Aplica controles de orçamento (bloqueios, downgrades)
 */
export async function applyBudgetControls(budget: CostBudget): Promise<void> {
  try {
    const currentSpending = await getCurrentSpending(budget);
    const percentage = currentSpending / Number(budget.limitUSD);

    // Aplicar controles baseados na severidade
    if (percentage >= BUDGET_CONTROLS_CONFIG.THRESHOLDS.CRITICAL_LIMIT) {
      // Bloqueio total - 120%+
      await applyTotalBlock(budget);
      console.log(`🚫 Bloqueio total aplicado para orçamento ${budget.name}`);
    } else if (percentage >= BUDGET_CONTROLS_CONFIG.THRESHOLDS.HARD_LIMIT) {
      // Controles parciais - 100%+
      await applyPartialControls(budget);
      console.log(
        `⚠️ Controles parciais aplicados para orçamento ${budget.name}`
      );
    }

    // Log da ação para auditoria
    await logBudgetAction(budget, "CONTROLS_APPLIED", {
      currentSpending,
      percentage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Erro ao aplicar controles para orçamento ${budget.id}:`,
      error
    );
    throw error;
  }
}

/**
 * Remove controles de orçamento quando volta ao normal
 */
export async function removeBudgetControls(budget: CostBudget): Promise<void> {
  try {
    const keys = [];

    // Remover flags de bloqueio
    if (budget.inboxId) {
      keys.push(
        `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.INBOX_BLOCKED}${budget.inboxId}`
      );
    }

    if (budget.userId) {
      keys.push(
        `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.USER_BLOCKED}${budget.userId}`
      );
    }

    // Remover flags de downgrade
    const downgradeKey = `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.MODEL_DOWNGRADE}${budget.id}`;
    keys.push(downgradeKey);

    // Remover todas as keys de uma vez
    if (keys.length > 0) {
      const deleted = await redis.del(...keys);
      if (deleted > 0) {
        console.log(
          `✅ Controles removidos para orçamento ${budget.name} (${deleted} flags)`
        );

        // Log da ação para auditoria
        await logBudgetAction(budget, "CONTROLS_REMOVED", {
          keysRemoved: keys,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error(
      `❌ Erro ao remover controles para orçamento ${budget.id}:`,
      error
    );
  }
}

/**
 * Verifica se um inbox está bloqueado por orçamento
 */
export async function isInboxBlocked(inboxId: string): Promise<boolean> {
  try {
    const key = `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.INBOX_BLOCKED}${inboxId}`;
    const blocked = await redis.get(key);
    return !!blocked;
  } catch (error) {
    console.error(`❌ Erro ao verificar bloqueio do inbox ${inboxId}:`, error);
    return false;
  }
}

/**
 * Verifica se um usuário está bloqueado por orçamento
 */
export async function isUserBlocked(userId: string): Promise<boolean> {
  try {
    const key = `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.USER_BLOCKED}${userId}`;
    const blocked = await redis.get(key);
    return !!blocked;
  } catch (error) {
    console.error(`❌ Erro ao verificar bloqueio do usuário ${userId}:`, error);
    return false;
  }
}

/**
 * Obtém modelo alternativo se houver downgrade ativo
 */
export async function getDowngradedModel(
  originalModel: string,
  inboxId?: string,
  userId?: string
): Promise<string> {
  try {
    // Verificar se há downgrade ativo para o contexto
    const keys = [];
    if (inboxId)
      keys.push(
        `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.MODEL_DOWNGRADE}inbox:${inboxId}`
      );
    if (userId)
      keys.push(
        `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.MODEL_DOWNGRADE}user:${userId}`
      );

    for (const key of keys) {
      const downgrade = await redis.get(key);
      if (downgrade) {
        const downgradedModel =
          BUDGET_CONTROLS_CONFIG.MODEL_DOWNGRADES[
            originalModel as keyof typeof BUDGET_CONTROLS_CONFIG.MODEL_DOWNGRADES
          ];
        if (downgradedModel) {
          console.log(
            `📉 Modelo downgraded: ${originalModel} → ${downgradedModel}`
          );
          return downgradedModel;
        }
      }
    }

    return originalModel;
  } catch (error) {
    console.error(`❌ Erro ao verificar downgrade de modelo:`, error);
    return originalModel;
  }
}

// Funções auxiliares privadas

/**
 * Aplica bloqueio total (crítico)
 */
async function applyTotalBlock(budget: CostBudget): Promise<void> {
  const ttl = BUDGET_CONTROLS_CONFIG.TTL.BLOCK_FLAG;

  if (budget.inboxId) {
    await redis.setex(
      `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.INBOX_BLOCKED}${budget.inboxId}`,
      ttl,
      "CRITICAL_LIMIT_EXCEEDED"
    );
  }

  if (budget.userId) {
    await redis.setex(
      `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.USER_BLOCKED}${budget.userId}`,
      ttl,
      "CRITICAL_LIMIT_EXCEEDED"
    );
  }
}

/**
 * Aplica controles parciais (downgrade de modelo)
 */
async function applyPartialControls(budget: CostBudget): Promise<void> {
  const ttl = BUDGET_CONTROLS_CONFIG.TTL.DOWNGRADE_FLAG;

  // Aplicar downgrade de modelo baseado no escopo
  if (budget.inboxId) {
    await redis.setex(
      `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.MODEL_DOWNGRADE}inbox:${budget.inboxId}`,
      ttl,
      "HARD_LIMIT_EXCEEDED"
    );
  }

  if (budget.userId) {
    await redis.setex(
      `${BUDGET_CONTROLS_CONFIG.REDIS_PREFIXES.MODEL_DOWNGRADE}user:${budget.userId}`,
      ttl,
      "HARD_LIMIT_EXCEEDED"
    );
  }
}

/**
 * Obtém destinatários para alertas de orçamento
 */
async function getBudgetAlertRecipients(budget: CostBudget): Promise<string[]> {
  // Por enquanto, retornar emails de admin
  // TODO: Implementar lógica para buscar emails baseado no escopo do orçamento
  const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
  return adminEmails.filter((email) => email.trim().length > 0);
}

/**
 * Calcula gastos atuais (função auxiliar)
 */
async function getCurrentSpending(budget: CostBudget): Promise<number> {
  // Esta função seria implementada similar à do budget-monitor
  // Por simplicidade, retornando 0 aqui - deve ser implementada
  return 0;
}

/**
 * Log de ações de orçamento para auditoria
 */
async function logBudgetAction(
  budget: CostBudget,
  action: string,
  metadata: any
): Promise<void> {
  try {
    // Log estruturado para auditoria
    console.log(`[BUDGET_AUDIT] ${action}`, {
      budgetId: budget.id,
      budgetName: budget.name,
      inboxId: budget.inboxId,
      userId: budget.userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    });

    // TODO: Persistir em tabela de auditoria se necessário
  } catch (error) {
    console.error("❌ Erro ao fazer log de ação de orçamento:", error);
  }
}
