/**
 * Flow Engine — Barrel export
 *
 * Motor de execução de flows de mensagens interativas.
 * Primeira mensagem interativa → sync, tudo depois → async.
 */

export { SyncBridge } from "./sync-bridge";
export { FlowExecutor } from "./flow-executor";
export type { ExecuteResult } from "./flow-executor";
export { FlowOrchestrator } from "./flow-orchestrator";
export { ChatwitDeliveryService, createDeliveryService } from "./chatwit-delivery-service";
export type { DeliveryResult } from "./chatwit-delivery-service";
export { VariableResolver } from "./variable-resolver";
