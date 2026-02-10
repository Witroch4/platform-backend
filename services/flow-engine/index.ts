/**
 * Flow Engine — Barrel export
 *
 * Motor de execução de flows de mensagens interativas.
 * Arquitetura Deadline-First: tenta na ponte síncrona,
 * migra pra async quando o relógio manda.
 */

export { DeadlineGuard } from './deadline-guard';
export { FlowExecutor } from './flow-executor';
export type { ExecuteResult } from './flow-executor';
export { FlowOrchestrator } from './flow-orchestrator';
export { ChatwitDeliveryService, createDeliveryService } from './chatwit-delivery-service';
export type { DeliveryResult } from './chatwit-delivery-service';
export { VariableResolver } from './variable-resolver';
