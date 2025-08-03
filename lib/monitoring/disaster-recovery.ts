/**
 * Sistema de Disaster Recovery para Filas BullMQ
 * Implementa procedimentos automáticos de recuperação em caso de falhas críticas
 */

import { getPrismaInstance, getRedisInstance } from '@/lib/connections';
import { ProductionMonitor } from './production-monitor';

interface RecoveryProcedure {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  steps: RecoveryStep[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoExecute: boolean;
}

interface RecoveryStep {
  id: string;
  name: string;
  description: string;
  action: () => Promise<RecoveryResult>;
  rollback?: () => Promise<void>;
  timeout: number; // milliseconds
}

interface RecoveryResult {
  success: boolean;
  message: string;
  details?: any;
  duration: number;
}

interface RecoveryExecution {
  procedureId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  steps: {
    stepId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    result?: RecoveryResult;
    startedAt?: Date;
    completedAt?: Date;
  }[];
  error?: string;
}

class DisasterRecoveryManager {
  private static instance: DisasterRecoveryManager;
  private prisma = getPrismaInstance();
  private redis = getRedisInstance();
  private monitor: ProductionMonitor;
  private procedures: Map<string, RecoveryProcedure> = new Map();
  private executions: Map<string, RecoveryExecution> = new Map();

  private constructor() {
    this.monitor = ProductionMonitor.getInstance();
    this.initializeProcedures();
    this.startMonitoring();
  }

  static getInstance(): DisasterRecoveryManager {
    if (!DisasterRecoveryManager.instance) {
      DisasterRecoveryManager.instance = new DisasterRecoveryManager();
    }
    return DisasterRecoveryManager.instance;
  }

  /**
   * Inicializa os procedimentos de recuperação
   */
  private initializeProcedures(): void {
    // Procedimento para falha de conexão Redis
    this.registerProcedure({
      id: 'redis_connection_failure',
      name: 'Recuperação de Conexão Redis',
      description: 'Procedimento para recuperar conexão com Redis em caso de falha',
      triggerConditions: ['CONNECTION_FAILURE:REDIS'],
      priority: 'CRITICAL',
      autoExecute: true,
      steps: [
        {
          id: 'verify_redis_status',
          name: 'Verificar Status do Redis',
          description: 'Verifica se o Redis está respondendo',
          timeout: 10000,
          action: async () => {
            const startTime = Date.now();
            try {
              await this.redis.ping();
              return {
                success: true,
                message: 'Redis está respondendo',
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Redis não está respondendo: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'reconnect_redis',
          name: 'Reconectar Redis',
          description: 'Força reconexão com Redis',
          timeout: 15000,
          action: async () => {
            const startTime = Date.now();
            try {
              await this.redis.disconnect();
              await new Promise(resolve => setTimeout(resolve, 2000));
              await this.redis.connect();
              await this.redis.ping();
              
              return {
                success: true,
                message: 'Redis reconectado com sucesso',
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Falha ao reconectar Redis: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'verify_queue_integrity',
          name: 'Verificar Integridade das Filas',
          description: 'Verifica se as filas estão funcionando após reconexão',
          timeout: 20000,
          action: async () => {
            const startTime = Date.now();
            try {
              // Verificar algumas chaves de fila
              const keys = await this.redis.keys('bull:*');
              const sampleKeys = keys.slice(0, 5);
              
              for (const key of sampleKeys) {
                await this.redis.exists(key);
              }
              
              return {
                success: true,
                message: `Integridade verificada: ${keys.length} chaves de fila encontradas`,
                details: { totalKeys: keys.length, sampledKeys: sampleKeys.length },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro ao verificar integridade: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
      ],
    });

    // Procedimento para falha de conexão Prisma
    this.registerProcedure({
      id: 'prisma_connection_failure',
      name: 'Recuperação de Conexão Prisma',
      description: 'Procedimento para recuperar conexão com banco de dados',
      triggerConditions: ['CONNECTION_FAILURE:PRISMA'],
      priority: 'CRITICAL',
      autoExecute: true,
      steps: [
        {
          id: 'verify_database_status',
          name: 'Verificar Status do Banco',
          description: 'Verifica se o banco de dados está respondendo',
          timeout: 15000,
          action: async () => {
            const startTime = Date.now();
            try {
              await this.prisma.$queryRaw`SELECT 1`;
              return {
                success: true,
                message: 'Banco de dados está respondendo',
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Banco não está respondendo: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'reconnect_prisma',
          name: 'Reconectar Prisma',
          description: 'Força reconexão com banco de dados',
          timeout: 20000,
          action: async () => {
            const startTime = Date.now();
            try {
              await this.prisma.$disconnect();
              await new Promise(resolve => setTimeout(resolve, 3000));
              await this.prisma.$connect();
              await this.prisma.$queryRaw`SELECT 1`;
              
              return {
                success: true,
                message: 'Prisma reconectado com sucesso',
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Falha ao reconectar Prisma: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
      ],
    });

    // Procedimento para alta utilização de memória
    this.registerProcedure({
      id: 'high_memory_usage',
      name: 'Recuperação de Memória Alta',
      description: 'Procedimento para liberar memória em caso de uso excessivo',
      triggerConditions: ['HIGH_MEMORY:SYSTEM', 'HIGH_MEMORY:REDIS'],
      priority: 'HIGH',
      autoExecute: false, // Requer aprovação manual
      steps: [
        {
          id: 'analyze_memory_usage',
          name: 'Analisar Uso de Memória',
          description: 'Analisa o uso atual de memória',
          timeout: 10000,
          action: async () => {
            const startTime = Date.now();
            try {
              const memUsage = process.memoryUsage();
              const redisInfo = await this.redis.info('memory');
              
              return {
                success: true,
                message: 'Análise de memória concluída',
                details: {
                  node: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024),
                  },
                  redis: redisInfo,
                },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro na análise de memória: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'cleanup_completed_jobs',
          name: 'Limpar Jobs Concluídos',
          description: 'Remove jobs antigos concluídos para liberar memória',
          timeout: 30000,
          action: async () => {
            const startTime = Date.now();
            try {
              // Buscar chaves de jobs concluídos
              const completedKeys = await this.redis.keys('bull:*:completed');
              let cleanedCount = 0;
              
              for (const key of completedKeys) {
                const length = await this.redis.llen(key);
                if (length > 100) { // Manter apenas os 100 mais recentes
                  const toRemove = length - 100;
                  await this.redis.ltrim(key, -100, -1);
                  cleanedCount += toRemove;
                }
              }
              
              return {
                success: true,
                message: `${cleanedCount} jobs antigos removidos`,
                details: { cleanedJobs: cleanedCount, processedQueues: completedKeys.length },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro na limpeza: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'force_garbage_collection',
          name: 'Forçar Garbage Collection',
          description: 'Força coleta de lixo do Node.js',
          timeout: 5000,
          action: async () => {
            const startTime = Date.now();
            try {
              const beforeGC = process.memoryUsage();
              
              if (global.gc) {
                global.gc();
              }
              
              const afterGC = process.memoryUsage();
              const freed = beforeGC.heapUsed - afterGC.heapUsed;
              
              return {
                success: true,
                message: `Garbage collection executado, ${Math.round(freed / 1024 / 1024)}MB liberados`,
                details: { before: beforeGC, after: afterGC, freed },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro no garbage collection: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
      ],
    });

    // Procedimento para sobrecarga de filas
    this.registerProcedure({
      id: 'queue_overload',
      name: 'Recuperação de Sobrecarga de Filas',
      description: 'Procedimento para lidar com filas sobrecarregadas',
      triggerConditions: ['QUEUE_OVERLOAD'],
      priority: 'HIGH',
      autoExecute: true,
      steps: [
        {
          id: 'analyze_queue_status',
          name: 'Analisar Status das Filas',
          description: 'Analisa o estado atual de todas as filas',
          timeout: 15000,
          action: async () => {
            const startTime = Date.now();
            try {
              const queueKeys = await this.redis.keys('bull:*:waiting');
              const queueStatus: Record<string, number> = {};
              
              for (const key of queueKeys) {
                const queueName = key.split(':')[1];
                const waitingCount = await this.redis.llen(key);
                queueStatus[queueName] = waitingCount;
              }
              
              const overloadedQueues = Object.entries(queueStatus)
                .filter(([, count]) => count > 1000)
                .sort(([, a], [, b]) => b - a);
              
              return {
                success: true,
                message: `${overloadedQueues.length} filas sobrecarregadas encontradas`,
                details: { queueStatus, overloadedQueues },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro na análise das filas: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          id: 'pause_overloaded_queues',
          name: 'Pausar Filas Sobrecarregadas',
          description: 'Pausa temporariamente filas com muitos jobs',
          timeout: 20000,
          action: async () => {
            const startTime = Date.now();
            try {
              const queueKeys = await this.redis.keys('bull:*:waiting');
              const pausedQueues: string[] = [];
              
              for (const key of queueKeys) {
                const queueName = key.split(':')[1];
                const waitingCount = await this.redis.llen(key);
                
                if (waitingCount > 2000) { // Pausar filas com mais de 2000 jobs
                  await this.redis.set(`bull:${queueName}:paused`, '1');
                  pausedQueues.push(queueName);
                }
              }
              
              return {
                success: true,
                message: `${pausedQueues.length} filas pausadas temporariamente`,
                details: { pausedQueues },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Erro ao pausar filas: ${(error as Error).message}`,
                duration: Date.now() - startTime,
              };
            }
          },
          rollback: async () => {
            // Rollback: despausar as filas
            const pausedKeys = await this.redis.keys('bull:*:paused');
            for (const key of pausedKeys) {
              await this.redis.del(key);
            }
          },
        },
      ],
    });

    console.log(`[DisasterRecovery] ✅ ${this.procedures.size} procedimentos de recuperação registrados`);
  }

  /**
   * Registra um novo procedimento de recuperação
   */
  registerProcedure(procedure: RecoveryProcedure): void {
    this.procedures.set(procedure.id, procedure);
    console.log(`[DisasterRecovery] Procedimento registrado: ${procedure.name}`);
  }

  /**
   * Inicia o monitoramento para triggers automáticos
   */
  private startMonitoring(): void {
    setInterval(() => {
      this.checkTriggerConditions().catch(error => {
        console.error('[DisasterRecovery] Erro ao verificar condições de trigger:', error);
      });
    }, 60000); // Verificar a cada minuto

    console.log('[DisasterRecovery] ✅ Monitoramento de triggers iniciado');
  }

  /**
   * Verifica condições de trigger para execução automática
   */
  private async checkTriggerConditions(): Promise<void> {
    const activeAlerts = this.monitor.getActiveAlerts();
    
    for (const alert of activeAlerts) {
      const triggerCondition = `${alert.type}:${alert.component}`;
      
      // Buscar procedimentos que podem ser executados para este alerta
      for (const procedure of this.procedures.values()) {
        if (procedure.autoExecute && 
            procedure.triggerConditions.includes(triggerCondition) &&
            !this.isExecutionInProgress(procedure.id)) {
          
          console.log(`[DisasterRecovery] 🚨 Trigger detectado: ${triggerCondition} -> ${procedure.name}`);
          
          // Executar procedimento automaticamente
          this.executeProcedure(procedure.id, `auto_trigger_${alert.id}`)
            .catch(error => {
              console.error(`[DisasterRecovery] Erro na execução automática de ${procedure.name}:`, error);
            });
        }
      }
    }
  }

  /**
   * Executa um procedimento de recuperação
   */
  async executeProcedure(procedureId: string, executionId?: string): Promise<RecoveryExecution> {
    const procedure = this.procedures.get(procedureId);
    if (!procedure) {
      throw new Error(`Procedimento não encontrado: ${procedureId}`);
    }

    const execId = executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const execution: RecoveryExecution = {
      procedureId,
      startedAt: new Date(),
      status: 'RUNNING',
      steps: procedure.steps.map(step => ({
        stepId: step.id,
        status: 'PENDING',
      })),
    };

    this.executions.set(execId, execution);

    console.log(`[DisasterRecovery] 🔧 Iniciando procedimento: ${procedure.name}`);

    try {
      // Executar cada step sequencialmente
      for (let i = 0; i < procedure.steps.length; i++) {
        const step = procedure.steps[i];
        const stepExecution = execution.steps[i];
        
        stepExecution.status = 'RUNNING';
        stepExecution.startedAt = new Date();
        
        console.log(`[DisasterRecovery] ⚙️ Executando step: ${step.name}`);
        
        try {
          // Executar step com timeout
          const result = await Promise.race([
            step.action(),
            new Promise<RecoveryResult>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), step.timeout)
            ),
          ]);
          
          stepExecution.result = result;
          stepExecution.status = result.success ? 'COMPLETED' : 'FAILED';
          stepExecution.completedAt = new Date();
          
          if (!result.success) {
            console.error(`[DisasterRecovery] ❌ Step falhou: ${step.name} - ${result.message}`);
            
            // Se step crítico falhou, parar execução
            execution.status = 'FAILED';
            execution.error = `Step '${step.name}' falhou: ${result.message}`;
            break;
          } else {
            console.log(`[DisasterRecovery] ✅ Step concluído: ${step.name} - ${result.message}`);
          }
          
        } catch (error) {
          stepExecution.status = 'FAILED';
          stepExecution.completedAt = new Date();
          stepExecution.result = {
            success: false,
            message: (error as Error).message,
            duration: Date.now() - (stepExecution.startedAt?.getTime() || Date.now()),
          };
          
          console.error(`[DisasterRecovery] ❌ Erro no step ${step.name}:`, error);
          
          execution.status = 'FAILED';
          execution.error = `Erro no step '${step.name}': ${(error as Error).message}`;
          break;
        }
      }
      
      // Se chegou até aqui sem falhas, procedimento foi bem-sucedido
      if (execution.status === 'RUNNING') {
        execution.status = 'COMPLETED';
        console.log(`[DisasterRecovery] ✅ Procedimento concluído com sucesso: ${procedure.name}`);
      }
      
    } catch (error) {
      execution.status = 'FAILED';
      execution.error = (error as Error).message;
      console.error(`[DisasterRecovery] ❌ Erro geral no procedimento ${procedure.name}:`, error);
    }
    
    execution.completedAt = new Date();
    
    // Salvar log da execução no banco
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: 'system',
          action: 'DISASTER_RECOVERY',
          resourceType: 'PROCEDURE',
          resourceId: procedureId,
          details: {
            executionId: execId,
            procedureName: procedure.name,
            status: execution.status,
            duration: execution.completedAt.getTime() - execution.startedAt.getTime(),
            steps: execution.steps.map(step => ({
              stepId: step.stepId,
              status: step.status,
              result: step.result ? {
                success: step.result.success,
                message: step.result.message,
                duration: step.result.duration,
                details: step.result.details
              } : undefined,
              startedAt: step.startedAt?.toISOString(),
              completedAt: step.completedAt?.toISOString(),
            })),
            error: execution.error,
          },
          ipAddress: '127.0.0.1',
          userAgent: 'DisasterRecoveryManager',
        },
      });
    } catch (dbError) {
      console.error('[DisasterRecovery] Erro ao salvar log da execução:', dbError);
    }
    
    return execution;
  }

  /**
   * Verifica se há execução em progresso para um procedimento
   */
  private isExecutionInProgress(procedureId: string): boolean {
    return Array.from(this.executions.values()).some(
      exec => exec.procedureId === procedureId && exec.status === 'RUNNING'
    );
  }

  /**
   * Obtém todos os procedimentos disponíveis
   */
  getProcedures(): RecoveryProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Obtém histórico de execuções
   */
  getExecutions(): RecoveryExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Obtém execução específica
   */
  getExecution(executionId: string): RecoveryExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Executa rollback de uma execução
   */
  async rollbackExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execução não encontrada: ${executionId}`);
    }

    const procedure = this.procedures.get(execution.procedureId);
    if (!procedure) {
      throw new Error(`Procedimento não encontrado: ${execution.procedureId}`);
    }

    console.log(`[DisasterRecovery] 🔄 Iniciando rollback: ${procedure.name}`);

    // Executar rollback dos steps em ordem reversa
    const completedSteps = execution.steps
      .filter(step => step.status === 'COMPLETED')
      .reverse();

    for (const stepExecution of completedSteps) {
      const step = procedure.steps.find(s => s.id === stepExecution.stepId);
      if (step?.rollback) {
        try {
          await step.rollback();
          console.log(`[DisasterRecovery] ✅ Rollback do step: ${step.name}`);
        } catch (error) {
          console.error(`[DisasterRecovery] ❌ Erro no rollback do step ${step.name}:`, error);
        }
      }
    }

    execution.status = 'ROLLED_BACK';
    console.log(`[DisasterRecovery] ✅ Rollback concluído: ${procedure.name}`);
  }
}

export { DisasterRecoveryManager, type RecoveryProcedure, type RecoveryExecution, type RecoveryResult };