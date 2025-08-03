/**
 * Sistema de Monitoramento de Produção
 * Implementa alertas de infraestrutura, backup automático e disaster recovery
 */

import { getPrismaInstance, getRedisInstance } from '@/lib/connections';
import { z } from 'zod';

// Tipos e interfaces
interface InfrastructureAlert {
  id: string;
  type: 'CONNECTION_FAILURE' | 'HIGH_MEMORY' | 'HIGH_CPU' | 'DISK_SPACE' | 'QUEUE_OVERLOAD';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  component: 'PRISMA' | 'REDIS' | 'SYSTEM' | 'QUEUE';
  message: string;
  metrics?: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

interface ConnectionHealth {
  component: 'PRISMA' | 'REDIS';
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  responseTime: number;
  lastCheck: Date;
  errorCount: number;
  uptime: number;
  metadata?: Record<string, any>;
}

interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
  timestamp: Date;
}

interface BackupStatus {
  id: string;
  type: 'CONFIGURATION' | 'QUEUE_STATE' | 'METRICS';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: Date;
  completedAt?: Date;
  size?: number;
  location: string;
  error?: string;
}

// Schema de validação
const AlertConfigSchema = z.object({
  memoryThreshold: z.number().min(0).max(100).default(85),
  cpuThreshold: z.number().min(0).max(100).default(80),
  responseTimeThreshold: z.number().min(0).default(5000),
  errorRateThreshold: z.number().min(0).max(100).default(5),
  queueDepthThreshold: z.number().min(0).default(1000),
});

type AlertConfig = z.infer<typeof AlertConfigSchema>;

class ProductionMonitor {
  private static instance: ProductionMonitor;
  private prisma = getPrismaInstance();
  private redis = getRedisInstance();
  private alerts: Map<string, InfrastructureAlert> = new Map();
  private connectionHealth: Map<string, ConnectionHealth> = new Map();
  private config: AlertConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private backupInterval?: NodeJS.Timeout;

  private constructor(config: Partial<AlertConfig> = {}) {
    this.config = AlertConfigSchema.parse(config);
    this.initializeMonitoring();
  }

  static getInstance(config?: Partial<AlertConfig>): ProductionMonitor {
    if (!ProductionMonitor.instance) {
      ProductionMonitor.instance = new ProductionMonitor(config);
    }
    return ProductionMonitor.instance;
  }

  /**
   * Inicializa o sistema de monitoramento
   */
  private initializeMonitoring(): void {
    console.log('[ProductionMonitor] Inicializando monitoramento de produção...');
    
    // Monitoramento contínuo a cada 30 segundos
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        console.error('[ProductionMonitor] Erro no health check:', error);
      });
    }, 30000);

    // Backup automático a cada 6 horas
    this.backupInterval = setInterval(() => {
      this.performAutomaticBackup().catch(error => {
        console.error('[ProductionMonitor] Erro no backup automático:', error);
      });
    }, 6 * 60 * 60 * 1000);

    // Health check inicial
    this.performHealthChecks().catch(error => {
      console.error('[ProductionMonitor] Erro no health check inicial:', error);
    });

    console.log('[ProductionMonitor] ✅ Monitoramento de produção inicializado');
  }

  /**
   * Realiza verificações de saúde das conexões
   */
  async performHealthChecks(): Promise<void> {
    const checks = [
      this.checkPrismaHealth(),
      this.checkRedisHealth(),
      this.checkSystemMetrics(),
    ];

    await Promise.allSettled(checks);
  }

  /**
   * Verifica saúde da conexão Prisma
   */
  private async checkPrismaHealth(): Promise<void> {
    const startTime = Date.now();
    let health: ConnectionHealth;

    try {
      // Teste simples de conectividade
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      health = {
        component: 'PRISMA',
        status: responseTime > this.config.responseTimeThreshold ? 'DEGRADED' : 'HEALTHY',
        responseTime,
        lastCheck: new Date(),
        errorCount: this.connectionHealth.get('PRISMA')?.errorCount || 0,
        uptime: process.uptime(),
        metadata: {
          connectionString: process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@'),
        },
      };

      // Reset error count se conexão está saudável
      if (health.status === 'HEALTHY') {
        health.errorCount = 0;
      }

      this.connectionHealth.set('PRISMA', health);

      // Alerta se tempo de resposta alto
      if (responseTime > this.config.responseTimeThreshold) {
        await this.createAlert({
          type: 'HIGH_CPU',
          severity: 'MEDIUM',
          component: 'PRISMA',
          message: `Tempo de resposta do Prisma alto: ${responseTime}ms`,
          metrics: { responseTime, threshold: this.config.responseTimeThreshold },
        });
      }

    } catch (error) {
      const errorCount = (this.connectionHealth.get('PRISMA')?.errorCount || 0) + 1;
      
      health = {
        component: 'PRISMA',
        status: 'FAILED',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        errorCount,
        uptime: process.uptime(),
        metadata: {
          error: (error as Error).message,
        },
      };

      this.connectionHealth.set('PRISMA', health);

      await this.createAlert({
        type: 'CONNECTION_FAILURE',
        severity: errorCount > 3 ? 'CRITICAL' : 'HIGH',
        component: 'PRISMA',
        message: `Falha na conexão Prisma: ${(error as Error).message}`,
        metrics: { errorCount, consecutiveFailures: errorCount },
      });
    }
  }

  /**
   * Verifica saúde da conexão Redis
   */
  private async checkRedisHealth(): Promise<void> {
    const startTime = Date.now();
    let health: ConnectionHealth;

    try {
      // Teste de ping
      await this.redis.ping();
      const responseTime = Date.now() - startTime;

      // Obter informações do Redis
      const info = await this.redis.info('memory');
      const memoryInfo = this.parseRedisInfo(info);

      health = {
        component: 'REDIS',
        status: responseTime > this.config.responseTimeThreshold ? 'DEGRADED' : 'HEALTHY',
        responseTime,
        lastCheck: new Date(),
        errorCount: this.connectionHealth.get('REDIS')?.errorCount || 0,
        uptime: process.uptime(),
        metadata: {
          memoryUsed: memoryInfo.used_memory_human,
          memoryPeak: memoryInfo.used_memory_peak_human,
          connectedClients: memoryInfo.connected_clients,
        },
      };

      // Reset error count se conexão está saudável
      if (health.status === 'HEALTHY') {
        health.errorCount = 0;
      }

      this.connectionHealth.set('REDIS', health);

      // Verificar uso de memória
      const memoryUsage = parseInt(memoryInfo.used_memory || '0');
      const maxMemory = parseInt(memoryInfo.maxmemory || '0');
      
      if (maxMemory > 0) {
        const memoryPercentage = (memoryUsage / maxMemory) * 100;
        
        if (memoryPercentage > this.config.memoryThreshold) {
          await this.createAlert({
            type: 'HIGH_MEMORY',
            severity: memoryPercentage > 95 ? 'CRITICAL' : 'HIGH',
            component: 'REDIS',
            message: `Uso de memória Redis alto: ${memoryPercentage.toFixed(1)}%`,
            metrics: { memoryPercentage, memoryUsed: memoryUsage, maxMemory },
          });
        }
      }

    } catch (error) {
      const errorCount = (this.connectionHealth.get('REDIS')?.errorCount || 0) + 1;
      
      health = {
        component: 'REDIS',
        status: 'FAILED',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        errorCount,
        uptime: process.uptime(),
        metadata: {
          error: (error as Error).message,
        },
      };

      this.connectionHealth.set('REDIS', health);

      await this.createAlert({
        type: 'CONNECTION_FAILURE',
        severity: errorCount > 3 ? 'CRITICAL' : 'HIGH',
        component: 'REDIS',
        message: `Falha na conexão Redis: ${(error as Error).message}`,
        metrics: { errorCount, consecutiveFailures: errorCount },
      });
    }
  }

  /**
   * Verifica métricas do sistema
   */
  private async checkSystemMetrics(): Promise<void> {
    try {
      const metrics = await this.getSystemMetrics();
      
      // Alerta para uso alto de memória
      if (metrics.memory.percentage > this.config.memoryThreshold) {
        await this.createAlert({
          type: 'HIGH_MEMORY',
          severity: metrics.memory.percentage > 95 ? 'CRITICAL' : 'HIGH',
          component: 'SYSTEM',
          message: `Uso de memória do sistema alto: ${metrics.memory.percentage.toFixed(1)}%`,
          metrics: metrics.memory,
        });
      }

      // Alerta para uso alto de CPU
      if (metrics.cpu.usage > this.config.cpuThreshold) {
        await this.createAlert({
          type: 'HIGH_CPU',
          severity: metrics.cpu.usage > 95 ? 'CRITICAL' : 'HIGH',
          component: 'SYSTEM',
          message: `Uso de CPU alto: ${metrics.cpu.usage.toFixed(1)}%`,
          metrics: metrics.cpu,
        });
      }

    } catch (error) {
      console.error('[ProductionMonitor] Erro ao verificar métricas do sistema:', error);
    }
  }

  /**
   * Cria um alerta de infraestrutura
   */
  private async createAlert(alertData: Omit<InfrastructureAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: InfrastructureAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    // Evitar spam de alertas similares
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.type === alert.type && 
           a.component === alert.component && 
           !a.resolved &&
           (Date.now() - a.timestamp.getTime()) < 300000 // 5 minutos
    );

    if (existingAlert) {
      return; // Não criar alerta duplicado
    }

    this.alerts.set(alert.id, alert);

    // Log do alerta
    console.warn(`[ProductionMonitor] 🚨 ALERTA ${alert.severity}: ${alert.message}`);

    // Salvar no banco de dados se possível
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: 'system',
          action: 'INFRASTRUCTURE_ALERT',
          resourceType: 'MONITORING',
          resourceId: alert.id,
          details: {
            type: alert.type,
            severity: alert.severity,
            component: alert.component,
            message: alert.message,
            metrics: alert.metrics,
          },
          ipAddress: '127.0.0.1',
          userAgent: 'ProductionMonitor',
        },
      });
    } catch (error) {
      console.error('[ProductionMonitor] Erro ao salvar alerta no banco:', error);
    }

    // Enviar notificação se crítico
    if (alert.severity === 'CRITICAL') {
      await this.sendCriticalAlert(alert);
    }
  }

  /**
   * Envia alerta crítico
   */
  private async sendCriticalAlert(alert: InfrastructureAlert): Promise<void> {
    try {
      // Aqui você pode integrar com sistemas de notificação
      // Por exemplo: Slack, email, PagerDuty, etc.
      console.error(`[ProductionMonitor] 🚨 ALERTA CRÍTICO: ${alert.message}`);
      
      // Exemplo de integração com webhook (descomente se necessário)
      /*
      if (process.env.ALERT_WEBHOOK_URL) {
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 ALERTA CRÍTICO: ${alert.message}`,
            alert,
          }),
        });
      }
      */
    } catch (error) {
      console.error('[ProductionMonitor] Erro ao enviar alerta crítico:', error);
    }
  }

  /**
   * Realiza backup automático das configurações
   */
  async performAutomaticBackup(): Promise<BackupStatus[]> {
    console.log('[ProductionMonitor] Iniciando backup automático...');
    
    const backups: BackupStatus[] = [];
    
    // Backup das configurações de fila
    const configBackup = await this.backupQueueConfigurations();
    backups.push(configBackup);
    
    // Backup do estado das filas
    const stateBackup = await this.backupQueueState();
    backups.push(stateBackup);
    
    // Backup das métricas recentes
    const metricsBackup = await this.backupRecentMetrics();
    backups.push(metricsBackup);
    
    console.log(`[ProductionMonitor] ✅ Backup automático concluído: ${backups.length} backups`);
    
    return backups;
  }

  /**
   * Helper para criar diretório de backup e salvar arquivo
   */
  private async saveBackupFile(location: string, data: any): Promise<number> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Criar diretório se não existir
    const backupDir = path.dirname(location);
    await fs.mkdir(backupDir, { recursive: true });
    
    // Salvar arquivo
    await fs.writeFile(location, JSON.stringify(data, null, 2));
    
    // Retornar tamanho do arquivo
    const stats = await fs.stat(location);
    return stats.size;
  }

  /**
   * Backup das configurações de fila
   */
  private async backupQueueConfigurations(): Promise<BackupStatus> {
    const backup: BackupStatus = {
      id: `config_backup_${Date.now()}`,
      type: 'CONFIGURATION',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      location: `/tmp/queue_configs_${Date.now()}.json`,
    };

    try {
      // Buscar configurações do banco
      const configs = await this.prisma.queueConfig?.findMany() || [];
      
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        configs,
      };

      // Salvar arquivo de backup
      const size = await this.saveBackupFile(backup.location, backupData);
      
      backup.status = 'COMPLETED';
      backup.completedAt = new Date();
      backup.size = size;
      
    } catch (error) {
      backup.status = 'FAILED';
      backup.error = (error as Error).message;
      console.error('[ProductionMonitor] Erro no backup de configurações:', error);
    }

    return backup;
  }

  /**
   * Backup do estado atual das filas
   */
  private async backupQueueState(): Promise<BackupStatus> {
    const backup: BackupStatus = {
      id: `state_backup_${Date.now()}`,
      type: 'QUEUE_STATE',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      location: `/tmp/queue_state_${Date.now()}.json`,
    };

    try {
      // Obter estado das filas do Redis
      const queueStates: Record<string, any> = {};
      
      // Buscar todas as chaves de fila no Redis
      const keys = await this.redis.keys('bull:*');
      
      for (const key of keys.slice(0, 100)) { // Limitar para evitar sobrecarga
        try {
          const type = await this.redis.type(key);
          if (type === 'list') {
            queueStates[key] = await this.redis.lrange(key, 0, -1);
          } else if (type === 'hash') {
            queueStates[key] = await this.redis.hgetall(key);
          } else if (type === 'set') {
            queueStates[key] = await this.redis.smembers(key);
          }
        } catch (keyError) {
          console.warn(`[ProductionMonitor] Erro ao fazer backup da chave ${key}:`, keyError);
        }
      }

      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        queueStates,
        totalKeys: keys.length,
      };

      // Salvar arquivo de backup
      const size = await this.saveBackupFile(backup.location, backupData);
      
      backup.status = 'COMPLETED';
      backup.completedAt = new Date();
      backup.size = size;
      
    } catch (error) {
      backup.status = 'FAILED';
      backup.error = (error as Error).message;
      console.error('[ProductionMonitor] Erro no backup do estado das filas:', error);
    }

    return backup;
  }

  /**
   * Backup das métricas recentes
   */
  private async backupRecentMetrics(): Promise<BackupStatus> {
    const backup: BackupStatus = {
      id: `metrics_backup_${Date.now()}`,
      type: 'METRICS',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      location: `/tmp/queue_metrics_${Date.now()}.json`,
    };

    try {
      // Buscar métricas das últimas 24 horas
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const metrics = await this.prisma.queueMetrics?.findMany({
        where: {
          timestamp: {
            gte: yesterday,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      }) || [];

      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        timeRange: {
          from: yesterday.toISOString(),
          to: new Date().toISOString(),
        },
        metrics,
        totalRecords: metrics.length,
      };

      // Salvar arquivo de backup
      const size = await this.saveBackupFile(backup.location, backupData);
      
      backup.status = 'COMPLETED';
      backup.completedAt = new Date();
      backup.size = size;
      
    } catch (error) {
      backup.status = 'FAILED';
      backup.error = (error as Error).message;
      console.error('[ProductionMonitor] Erro no backup de métricas:', error);
    }

    return backup;
  }

  /**
   * Obtém métricas do sistema
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Converter para segundos
      },
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }

  /**
   * Parse das informações do Redis
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * Obtém alertas ativos
   */
  getActiveAlerts(): InfrastructureAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Obtém saúde das conexões
   */
  getConnectionsHealth(): ConnectionHealth[] {
    return Array.from(this.connectionHealth.values());
  }

  /**
   * Resolve um alerta
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    
    console.log(`[ProductionMonitor] ✅ Alerta resolvido: ${alert.message}`);
    
    return true;
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = undefined;
    }
    
    console.log('[ProductionMonitor] 🛑 Monitoramento parado');
  }

  /**
   * Obtém status geral do monitoramento
   */
  getMonitoringStatus() {
    const activeAlerts = this.getActiveAlerts();
    const connectionsHealth = this.getConnectionsHealth();
    
    return {
      isRunning: !!this.monitoringInterval,
      activeAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter(a => a.severity === 'CRITICAL').length,
      connectionsHealth: connectionsHealth.reduce((acc, conn) => {
        acc[conn.component] = conn.status;
        return acc;
      }, {} as Record<string, string>),
      lastCheck: Math.max(...connectionsHealth.map(c => c.lastCheck.getTime())),
      uptime: process.uptime(),
    };
  }
}

export { ProductionMonitor, type InfrastructureAlert, type ConnectionHealth, type BackupStatus };