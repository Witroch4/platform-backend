/**
 * FlowOrchestrator — Endpoint unificado de entrada
 *
 * Recebe webhooks do Chatwit, decide se é um novo fluxo ou
 * continuação de sessão (clique de botão), e executa o flow.
 *
 * Modelo simples:
 *   - Primeira mensagem interativa → resposta síncrona (ponte HTTP)
 *   - Chatwoot fecha a ponte automaticamente ao receber
 *   - Tudo depois → async via API Chatwit
 *
 * @see docs/interative_message_flow_builder.md §14.2
 */

import log from '@/lib/log';
import { SyncBridge } from './sync-bridge';
import { FlowExecutor } from './flow-executor';
import { getPrismaInstance } from '@/lib/connections';
import type {
  ChatwitWebhookPayload,
  DeliveryContext,
  SynchronousResponse,
  RuntimeFlow,
  RuntimeFlowNode,
  FlowSessionData,
  FlowNodeType,
} from '@/types/flow-engine';

// =============================================================================
// Types
// =============================================================================

interface OrchestratorResult {
  /** Payload para responder na ponte HTTP (null = nada para retornar sync) */
  syncResponse: SynchronousResponse | null;
  /** Se o flow aguarda input (sessão fica WAITING_INPUT) */
  waitingInput: boolean;
  /** Se houve erro */
  error?: string;
}

// =============================================================================
// FlowOrchestrator
// =============================================================================

export class FlowOrchestrator {
  constructor() {
    // SyncBridge não precisa de parâmetros — sem cronômetro, sem margem
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  /**
   * Executa um flow diretamente pelo ID (bypass de lookup).
   * Usado quando já sabemos qual flow executar (ex: intent mapping com flowId).
   */
  async executeFlowById(
    flowId: string,
    deliveryContext: DeliveryContext,
  ): Promise<OrchestratorResult> {
    const bridge = new SyncBridge();

    try {
      const flow = await this.loadFlow(flowId);
      if (!flow) {
        log.warn('[FlowOrchestrator] Flow não encontrado para execução direta', { flowId });
        return {
          syncResponse: null,
          waitingInput: false,
          error: `Flow ${flowId} não encontrado ou inativo`,
        };
      }

      log.info('[FlowOrchestrator] Executando flow por ID', {
        flowId,
        flowName: flow.name,
        conversationId: deliveryContext.conversationId,
      });

      return this.executeNewFlow(flow, deliveryContext, bridge);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('[FlowOrchestrator] Erro ao executar flow por ID', { flowId, error: errorMsg });
      return { syncResponse: null, waitingInput: false, error: errorMsg };
    }
  }

  async handle(
    payload: ChatwitWebhookPayload,
    deliveryContext: DeliveryContext,
  ): Promise<OrchestratorResult> {
    const bridge = new SyncBridge();

    try {
      // 2. Extrair buttonId (se for clique de botão)
      const buttonId = this.extractButtonId(payload);

      // 3. Verificar FlowSession ativo (esperando botão)
      if (buttonId) {
        const session = await this.findActiveSession(deliveryContext);
        if (session) {
          return this.resumeSession(session, buttonId, deliveryContext, bridge);
        }
      }

      // 4. Buscar mapeamento de intent → flow
      const flowId = await this.findFlowForMessage(payload, deliveryContext);
      if (!flowId) {
        log.debug('[FlowOrchestrator] Nenhum flow encontrado para esta mensagem');
        return { syncResponse: null, waitingInput: false };
      }

      // 5. Carregar e executar flow
      const flow = await this.loadFlow(flowId);
      if (!flow) {
        return {
          syncResponse: null,
          waitingInput: false,
          error: `Flow ${flowId} não encontrado`,
        };
      }

      return this.executeNewFlow(flow, deliveryContext, bridge);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('[FlowOrchestrator] Erro no handle', { error: errorMsg });
      return { syncResponse: null, waitingInput: false, error: errorMsg };
    }
  }

  // ---------------------------------------------------------------------------
  // Execute new flow
  // ---------------------------------------------------------------------------

  private async executeNewFlow(
    flow: RuntimeFlow,
    ctx: DeliveryContext,
    bridge: SyncBridge,
  ): Promise<OrchestratorResult> {
    const prisma = getPrismaInstance();
    const executor = new FlowExecutor(ctx);

    // Criar sessão
    const session = await prisma.flowSession.create({
      data: {
        flowId: flow.id,
        conversationId: String(ctx.conversationId),
        contactId: String(ctx.contactId),
        inboxId: ctx.prismaInboxId || String(ctx.inboxId),
        status: 'ACTIVE',
        variables: {},
        executionLog: [],
      },
    });

    const result = await executor.execute(flow, bridge);

    // Atualizar sessão
    await prisma.flowSession.update({
      where: { id: session.id },
      data: {
        status: result.status,
        currentNodeId: result.currentNodeId ?? null,
        variables: result.variables as object,
        executionLog: result.executionLog as object[],
        completedAt: result.status === 'COMPLETED' ? new Date() : null,
      },
    });

    const syncResponse = bridge.consumeSyncPayload();

    return {
      syncResponse,
      waitingInput: result.status === 'WAITING_INPUT',
      error: result.status === 'ERROR' ? 'Erro na execução do flow' : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Resume session (botão clicado)
  // ---------------------------------------------------------------------------

  private async resumeSession(
    session: FlowSessionData,
    buttonId: string,
    ctx: DeliveryContext,
    bridge: SyncBridge,
  ): Promise<OrchestratorResult> {
    const prisma = getPrismaInstance();

    const flow = await this.loadFlow(session.flowId);
    if (!flow) {
      return {
        syncResponse: null,
        waitingInput: false,
        error: `Flow ${session.flowId} não encontrado`,
      };
    }

    const executor = new FlowExecutor(ctx, session.variables);
    const result = await executor.resumeFromButton(flow, session, buttonId, bridge);

    // Atualizar sessão
    await prisma.flowSession.update({
      where: { id: session.id },
      data: {
        status: result.status,
        currentNodeId: result.currentNodeId ?? null,
        variables: result.variables as object,
        executionLog: result.executionLog as object[],
        completedAt: result.status === 'COMPLETED' ? new Date() : null,
      },
    });

    const syncResponse = bridge.consumeSyncPayload();

    return {
      syncResponse,
      waitingInput: result.status === 'WAITING_INPUT',
      error: result.status === 'ERROR' ? 'Erro ao retomar flow' : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Database queries
  // ---------------------------------------------------------------------------

  private async findActiveSession(
    ctx: DeliveryContext,
  ): Promise<FlowSessionData | null> {
    const prisma = getPrismaInstance();

    const session = await prisma.flowSession.findFirst({
      where: {
        conversationId: String(ctx.conversationId),
        inboxId: ctx.prismaInboxId || String(ctx.inboxId),
        status: 'WAITING_INPUT',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!session) return null;

    return {
      id: session.id,
      flowId: session.flowId,
      conversationId: session.conversationId,
      contactId: session.contactId,
      inboxId: session.inboxId,
      status: session.status as FlowSessionData['status'],
      currentNodeId: session.currentNodeId,
      variables: (session.variables as Record<string, unknown>) ?? {},
      executionLog: (session.executionLog as unknown as FlowSessionData['executionLog']) ?? [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
    };
  }

  private async loadFlow(flowId: string): Promise<RuntimeFlow | null> {
    const prisma = getPrismaInstance();

    const flow = await prisma.flow.findUnique({
      where: { id: flowId },
      include: {
        nodes: true,
        edges: true,
      },
    });

    if (!flow || !flow.isActive) return null;

    return {
      id: flow.id,
      name: flow.name,
      inboxId: flow.inboxId,
      nodes: flow.nodes.map((n): RuntimeFlowNode => ({
        id: n.id,
        nodeType: n.nodeType as FlowNodeType,
        config: (n.config as Record<string, unknown>) ?? {},
      })),
      edges: flow.edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        buttonId: e.buttonId,
        conditionBranch: e.conditionBranch,
      })),
    };
  }

  /**
   * Busca um flow mapeado para a mensagem recebida.
   * Procura primeiro por intent mapping, depois por botão com START_FLOW.
   */
  private async findFlowForMessage(
    payload: ChatwitWebhookPayload,
    ctx: DeliveryContext,
  ): Promise<string | null> {
    const prisma = getPrismaInstance();

    // 1. Verificar se um MapeamentoBotao do tipo START_FLOW existe para o botão clicado
    const buttonId = this.extractButtonId(payload);
    if (buttonId) {
      const mapping = await prisma.mapeamentoBotao.findUnique({
        where: { buttonId },
      });

      if (mapping?.actionType === 'START_FLOW') {
        const actionPayload = mapping.actionPayload as Record<string, unknown>;
        return (actionPayload?.flowId as string) ?? null;
      }
    }

    // 2. Buscar MapeamentoIntencao com flowId associado
    // O intent pode vir via payload.intent_name ou payload.detected_intent
    const intentName = (payload as Record<string, unknown>).intent_name as string | undefined
      || (payload as Record<string, unknown>).detected_intent as string | undefined;

    // Usar prismaInboxId (ID interno do Prisma) em vez do numérico externo
    const inboxIdStr = ctx.prismaInboxId || String(ctx.inboxId);

    if (intentName && inboxIdStr) {
      const intentMapping = await prisma.mapeamentoIntencao.findFirst({
        where: {
          intentName,
          inboxId: inboxIdStr,
          flowId: { not: null },
        },
        select: { flowId: true },
      });

      if (intentMapping?.flowId) {
        log.debug('[FlowOrchestrator] Flow encontrado via intent mapping', {
          intentName,
          flowId: intentMapping.flowId,
        });
        return intentMapping.flowId;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractButtonId(payload: ChatwitWebhookPayload): string | null {
    // Clique de quick reply / button
    const buttonReply = payload.content_attributes?.button_reply;
    if (buttonReply?.id) return buttonReply.id;

    // Clique de item de lista
    const listReply = payload.content_attributes?.list_reply;
    if (listReply?.id) return listReply.id;

    // Fallback: content_attributes na mensagem
    const msgAttrs = payload.message?.content_attributes as Record<string, unknown> | undefined;
    if (msgAttrs?.button_reply) {
      const br = msgAttrs.button_reply as { id?: string };
      if (br.id) return br.id;
    }

    // Fallback: button_id direto no metadata (formato Chatwit)
    const metadata = payload.metadata as Record<string, unknown> | undefined;
    if (metadata?.button_id && typeof metadata.button_id === 'string') {
      return metadata.button_id;
    }

    // Fallback: postback_payload (Instagram/Facebook)
    if (msgAttrs?.postback_payload && typeof msgAttrs.postback_payload === 'string') {
      return msgAttrs.postback_payload;
    }

    // Fallback: quick_reply_payload (Instagram/Facebook)
    if (msgAttrs?.quick_reply_payload && typeof msgAttrs.quick_reply_payload === 'string') {
      return msgAttrs.quick_reply_payload;
    }

    return null;
  }
}
