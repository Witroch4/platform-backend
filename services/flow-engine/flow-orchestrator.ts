/**
 * FlowOrchestrator — Endpoint unificado de entrada
 *
 * Recebe webhooks do Chatwit, decide se é um novo fluxo ou
 * continuação de sessão (clique de botão), e executa o flow.
 *
 * Integra DeadlineGuard + FlowExecutor para a arquitetura
 * "deadline-first": tenta na ponte; se não dá tempo, migra pra async.
 *
 * @see docs/interative_message_flow_builder.md §14.2
 */

import log from '@/lib/log';
import { DeadlineGuard } from './deadline-guard';
import { FlowExecutor } from './flow-executor';
import { getPrismaInstance } from '@/lib/connections';
import type {
  ChatwitWebhookPayload,
  DeliveryContext,
  SynchronousResponse,
  RuntimeFlow,
  RuntimeFlowNode,
  RuntimeFlowEdge,
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
  private readonly deadlineMs: number;
  private readonly safetyMarginMs: number;

  constructor(options?: { deadlineMs?: number; safetyMarginMs?: number }) {
    this.deadlineMs = options?.deadlineMs ?? 28_000;
    this.safetyMarginMs = options?.safetyMarginMs ?? 5_000;
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  async handle(
    payload: ChatwitWebhookPayload,
    deliveryContext: DeliveryContext,
  ): Promise<OrchestratorResult> {
    // 1. Cronômetro começa
    const deadline = new DeadlineGuard(this.deadlineMs, this.safetyMarginMs);

    try {
      // 2. Extrair buttonId (se for clique de botão)
      const buttonId = this.extractButtonId(payload);

      // 3. Verificar FlowSession ativo (esperando botão)
      if (buttonId) {
        const session = await this.findActiveSession(deliveryContext);
        if (session) {
          return this.resumeSession(session, buttonId, deliveryContext, deadline);
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

      return this.executeNewFlow(flow, deliveryContext, deadline);
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
    deadline: DeadlineGuard,
  ): Promise<OrchestratorResult> {
    const prisma = getPrismaInstance();
    const executor = new FlowExecutor(ctx);

    // Criar sessão
    const session = await prisma.flowSession.create({
      data: {
        flowId: flow.id,
        conversationId: String(ctx.conversationId),
        contactId: String(ctx.contactId),
        inboxId: String(ctx.inboxId),
        status: 'ACTIVE',
        variables: {},
        executionLog: [],
      },
    });

    const result = await executor.execute(flow, deadline);

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

    return {
      syncResponse: deadline.consumeSyncPayload(),
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
    deadline: DeadlineGuard,
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
    const result = await executor.resumeFromButton(flow, session, buttonId, deadline);

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

    return {
      syncResponse: deadline.consumeSyncPayload(),
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
        inboxId: String(ctx.inboxId),
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

    // inboxId no Prisma é string, mas DeliveryContext usa number
    const inboxIdStr = String(ctx.inboxId);

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

    // 3. Fallback: Flow default ativo da inbox (se existir)
    if (inboxIdStr) {
      const defaultFlow = await prisma.flow.findFirst({
        where: {
          inboxId: inboxIdStr,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (defaultFlow?.id) {
        log.debug('[FlowOrchestrator] Flow default encontrado para inbox', {
          inboxId: inboxIdStr,
          flowId: defaultFlow.id,
        });
        return defaultFlow.id;
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

    return null;
  }
}
