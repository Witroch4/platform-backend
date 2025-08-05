/**
 * Daily Budget Guard Service
 * Based on requirements 15.1, 15.3
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { CostTrackingService } from './cost-tracker';
import { EconomicModeService } from './economic-mode';
import log from '@/lib/log';

export interface BudgetGuardConfig {
  enabled: boolean;
  checkIntervalMs: number;
  alertThresholds: number[]; // Percentages: [80, 90, 95]
  emergencyThreshold: number; // Percentage: 100
  gracePeriodMs: number; // Grace period before hard cutoff
}

export interface BudgetAlert {
  accountId: number;
  type: 'warning' | 'critical' | 'emergency';
  threshold: number;
  currentUsage: number;
  budgetLimit: number;
  timestamp: Date;
  message: string;
}

export interface BudgetViolation {
  accountId: number;
  violationType: 'tokens' | 'cost' | 'both';
  tokensUsed: number;
  tokensLimit: number;
  costUsed: number;
  costLimit: number;
  timestamp: Date;
  actionTaken: 'economic_mode' | 'hard_cutoff' | 'alert_only';
}

export class BudgetGuardService {
  private redis: Redis;
  private costTracker: CostTrackingService;
  private economicMode: EconomicModeService;
  private config: BudgetGuardConfig;
  private alertsSent: Set<string> = new Set();

  constructor(redis: Redis) {
    this.redis = redis;
    this.costTracker = new CostTrackingService(redis);
    this.economicMode = new EconomicModeService(redis);
    
    this.config = {
      enabled: process.env.BUDGET_GUARD_ENABLED !== 'false',
      checkIntervalMs: parseInt(process.env.BUDGET_CHECK_INTERVAL_MS || '300000'), // 5 minutes
      alertThresholds: [80, 90, 95],
      emergencyThreshold: 100,
      gracePeriodMs: parseInt(process.env.BUDGET_GRACE_PERIOD_MS || '3600000') // 1 hour
    };
  }

  /**
   * Check if account has exceeded budget and take appropriate action
   */
  async checkBudgetViolation(accountId: number): Promise<BudgetViolation | null> {
    if (!this.config.enabled) return null;

    try {
      const budgetStatus = await this.costTracker.getBudgetStatus(accountId);
      
      // Check if budget is exceeded
      if (budgetStatus.budgetExceeded) {
        const violation: BudgetViolation = {
          accountId,
          violationType: this.determineViolationType(budgetStatus),
          tokensUsed: budgetStatus.tokensUsed,
          tokensLimit: budgetStatus.tokensLimit,
          costUsed: budgetStatus.costUsed,
          costLimit: budgetStatus.costLimit,
          timestamp: new Date(),
          actionTaken: 'hard_cutoff'
        };

        // Apply hard cutoff
        await this.applyHardCutoff(accountId);
        
        // Record violation
        await this.recordViolation(violation);
        
        // Emit metric
        await this.emitBudgetExceededMetric(accountId);

        log.warn('Budget exceeded - hard cutoff applied', {
          accountId,
          tokensUsed: budgetStatus.tokensUsed,
          tokensLimit: budgetStatus.tokensLimit,
          costUsed: budgetStatus.costUsed,
          costLimit: budgetStatus.costLimit
        });

        return violation;
      }

      // Check for warning thresholds
      const percentageUsed = budgetStatus.percentageUsed * 100;
      
      for (const threshold of this.config.alertThresholds) {
        if (percentageUsed >= threshold) {
          await this.sendBudgetAlert(accountId, threshold, budgetStatus);
          
          // Activate economic mode at 80% threshold
          if (threshold >= 80 && !budgetStatus.economicModeActive) {
            await this.activateEconomicMode(accountId, `Budget usage at ${threshold}%`);
          }
          
          break; // Only send the highest threshold alert
        }
      }

      return null;

    } catch (error) {
      log.error('Error checking budget violation', { accountId, error });
      return null;
    }
  }

  /**
   * Check if account is allowed to make AI requests
   */
  async isAccountAllowed(accountId: number): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    try {
      // Check if account is in hard cutoff mode
      const cutoffKey = `budget_cutoff:${accountId}`;
      const cutoff = await this.redis.get(cutoffKey);
      
      if (cutoff) {
        const cutoffData = JSON.parse(cutoff);
        const now = Date.now();
        
        // Check if grace period has expired
        if (now > cutoffData.timestamp + this.config.gracePeriodMs) {
          return { 
            allowed: false, 
            reason: 'Daily budget exceeded - requests blocked until tomorrow' 
          };
        }
        
        // Still in grace period
        return { 
          allowed: true, 
          reason: 'Grace period active - budget exceeded but requests still allowed' 
        };
      }

      // Check current budget status
      const budgetStatus = await this.costTracker.getBudgetStatus(accountId);
      
      if (budgetStatus.budgetExceeded) {
        // Apply cutoff immediately
        await this.applyHardCutoff(accountId);
        
        return { 
          allowed: true, // Allow this request but apply cutoff
          reason: 'Budget just exceeded - applying cutoff after this request' 
        };
      }

      return { allowed: true };

    } catch (error) {
      log.error('Error checking account allowance', { accountId, error });
      // Fail open - allow requests if we can't check budget
      return { allowed: true, reason: 'Budget check failed - allowing request' };
    }
  }

  /**
   * Get budget status with violation history
   */
  async getBudgetStatusWithHistory(accountId: number): Promise<{
    current: any;
    violations: BudgetViolation[];
    alerts: BudgetAlert[];
  }> {
    const current = await this.costTracker.getBudgetStatus(accountId);
    const violations = await this.getViolationHistory(accountId, 7); // Last 7 days
    const alerts = await this.getAlertHistory(accountId, 7); // Last 7 days

    return { current, violations, alerts };
  }

  /**
   * Manually reset budget for account (admin operation)
   */
  async resetAccountBudget(accountId: number, reason: string, userId: string): Promise<void> {
    // Reset daily budget
    await this.costTracker.resetDailyBudget(accountId);
    
    // Remove cutoff
    await this.removeHardCutoff(accountId);
    
    // Clear alerts
    await this.clearAlerts(accountId);

    log.info('Budget manually reset', { accountId, reason, userId });
  }

  /**
   * Set custom budget limits for account
   */
  async setCustomBudgetLimits(
    accountId: number, 
    limits: { dailyTokenLimit?: number; dailyCostLimitBrl?: number },
    userId: string
  ): Promise<void> {
    const customLimitsKey = `budget_limits:${accountId}`;
    const customLimits = {
      ...limits,
      updatedBy: userId,
      updatedAt: new Date()
    };

    await this.redis.setex(customLimitsKey, 86400, JSON.stringify(customLimits));

    log.info('Custom budget limits set', { accountId, limits, userId });
  }

  private determineViolationType(budgetStatus: any): 'tokens' | 'cost' | 'both' {
    const tokenExceeded = budgetStatus.tokensUsed >= budgetStatus.tokensLimit;
    const costExceeded = budgetStatus.costUsed >= budgetStatus.costLimit;

    if (tokenExceeded && costExceeded) return 'both';
    if (tokenExceeded) return 'tokens';
    if (costExceeded) return 'cost';
    return 'both'; // Fallback
  }

  private async applyHardCutoff(accountId: number): Promise<void> {
    const cutoffKey = `budget_cutoff:${accountId}`;
    const cutoffData = {
      timestamp: Date.now(),
      reason: 'Daily budget exceeded',
      gracePeriodEnds: Date.now() + this.config.gracePeriodMs
    };

    // Set cutoff with TTL until tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const ttlSeconds = Math.floor((tomorrow.getTime() - Date.now()) / 1000);

    await this.redis.setex(cutoffKey, ttlSeconds, JSON.stringify(cutoffData));

    log.warn('Hard budget cutoff applied', { 
      accountId, 
      gracePeriodEnds: new Date(cutoffData.gracePeriodEnds) 
    });
  }

  private async removeHardCutoff(accountId: number): Promise<void> {
    const cutoffKey = `budget_cutoff:${accountId}`;
    await this.redis.del(cutoffKey);
  }

  private async activateEconomicMode(accountId: number, reason: string): Promise<void> {
    await this.redis.setex(`economic:${accountId}`, 86400, '1');
    
    log.info('Economic mode activated by budget guard', { accountId, reason });
  }

  private async sendBudgetAlert(accountId: number, threshold: number, budgetStatus: any): Promise<void> {
    const alertKey = `budget_alert:${accountId}:${threshold}`;
    
    // Check if alert already sent today
    if (this.alertsSent.has(alertKey)) return;
    
    const existingAlert = await this.redis.get(alertKey);
    if (existingAlert) return;

    const alert: BudgetAlert = {
      accountId,
      type: threshold >= 95 ? 'critical' : threshold >= 90 ? 'critical' : 'warning',
      threshold,
      currentUsage: budgetStatus.percentageUsed * 100,
      budgetLimit: Math.max(budgetStatus.tokensLimit, budgetStatus.costLimit),
      timestamp: new Date(),
      message: `Budget usage at ${threshold}% for account ${accountId}`
    };

    // Store alert
    await this.redis.setex(alertKey, 86400, JSON.stringify(alert)); // 24h TTL
    
    // Add to sent alerts cache
    this.alertsSent.add(alertKey);

    // This would integrate with notification system
    log.warn('Budget alert sent', alert);
  }

  private async recordViolation(violation: BudgetViolation): Promise<void> {
    const violationKey = `budget_violation:${violation.accountId}:${Date.now()}`;
    await this.redis.setex(violationKey, 86400 * 7, JSON.stringify(violation)); // 7 days TTL
  }

  private async getViolationHistory(accountId: number, days: number): Promise<BudgetViolation[]> {
    const pattern = `budget_violation:${accountId}:*`;
    const keys = await this.redis.keys(pattern);
    
    const violations: BudgetViolation[] = [];
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const violation = JSON.parse(data);
        const violationDate = new Date(violation.timestamp);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        if (violationDate >= cutoffDate) {
          violations.push(violation);
        }
      }
    }

    return violations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private async getAlertHistory(accountId: number, days: number): Promise<BudgetAlert[]> {
    const pattern = `budget_alert:${accountId}:*`;
    const keys = await this.redis.keys(pattern);
    
    const alerts: BudgetAlert[] = [];
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const alert = JSON.parse(data);
        const alertDate = new Date(alert.timestamp);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        if (alertDate >= cutoffDate) {
          alerts.push(alert);
        }
      }
    }

    return alerts.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private async clearAlerts(accountId: number): Promise<void> {
    const pattern = `budget_alert:${accountId}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Clear from memory cache
    for (const alertKey of this.alertsSent) {
      if (alertKey.includes(`${accountId}:`)) {
        this.alertsSent.delete(alertKey);
      }
    }
  }

  private async emitBudgetExceededMetric(accountId: number): Promise<void> {
    // This would integrate with metrics system
    const metricKey = `ai_budget_exceeded_total`;
    await this.redis.hincrby(metricKey, `account_${accountId}`, 1);
    await this.redis.expire(metricKey, 86400 * 7); // Keep for 7 days
  }
}