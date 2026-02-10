/**
 * FlowExecutor — Motor unificado de execução de flows
 *
 * Percorre o grafo nó a nó, usando `smartDeliver()` para decidir
 * automaticamente se entrega via ponte síncrona ou API Chatwit.
 *
 * Regra do Ponto Sem Retorno:
 *   Uma vez que migrou pra async, NUNCA volta pro sync.
 *   O relógio decide; sem complexity analysis.
 *
 * @see docs/interative_message_flow_builder.md §14.3
 */

import log from '@/lib/log';
import { DeadlineGuard } from './deadline-guard';
import { ChatwitDeliveryService, createDeliveryService } from './chatwit-delivery-service';
import { VariableResolver } from './variable-resolver';
import { elementsToLegacyFields } from '@/lib/flow-builder/interactiveMessageElements';
import type { InteractiveMessageElement } from '@/types/flow-builder';
import type {
  DeliveryContext,
  DeliveryPayload,
  SynchronousResponse,
  RuntimeFlow,
  RuntimeFlowNode,
  RuntimeFlowEdge,
  ExecutionLogEntry,
  FlowNodeType,
  FlowSessionData,
  ConditionConfig,
  DelayConfig,
  HttpRequestConfig,
  SetVariableConfig,
  TransferConfig,
  TagConfig,
  MediaConfig,
} from '@/types/flow-engine';
import { getPrismaInstance } from '@/lib/connections';

// =============================================================================
// Types
// =============================================================================

export interface ExecuteResult {
  status: 'COMPLETED' | 'WAITING_INPUT' | 'ERROR';
  currentNodeId?: string;
  variables: Record<string, unknown>;
  executionLog: ExecutionLogEntry[];
}

// =============================================================================
// FlowExecutor
// =============================================================================

export class FlowExecutor {
  private delivery: ChatwitDeliveryService;
  private resolver: VariableResolver;
  private executionLog: ExecutionLogEntry[] = [];

  constructor(
    private readonly context: DeliveryContext,
    sessionVariables: Record<string, unknown> = {},
  ) {
    this.delivery = createDeliveryService(context);
    this.resolver = new VariableResolver(context, sessionVariables);
  }

  // ---------------------------------------------------------------------------
  // Public: execução completa de um flow (desde o START)
  // ---------------------------------------------------------------------------

  async execute(
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<ExecuteResult> {
    const startNode = flow.nodes.find((n) => n.nodeType === 'START');
    if (!startNode) {
      log.error('[FlowExecutor] Flow sem nó START', { flowId: flow.id });
      return {
        status: 'ERROR',
        variables: this.resolver.getSessionVariables(),
        executionLog: this.executionLog,
      };
    }

    return this.executeChain(flow, startNode, deadline);
  }

  // ---------------------------------------------------------------------------
  // Public: retomar de um clique de botão (WAITING_INPUT → próximo nó)
  // ---------------------------------------------------------------------------

  async resumeFromButton(
    flow: RuntimeFlow,
    session: FlowSessionData,
    buttonId: string,
    deadline: DeadlineGuard,
  ): Promise<ExecuteResult> {
    if (!session.currentNodeId) {
      return {
        status: 'ERROR',
        variables: session.variables,
        executionLog: this.executionLog,
      };
    }

    // Encontra edge que sai do nó atual com este buttonId
    const edge = flow.edges.find(
      (e) => e.sourceNodeId === session.currentNodeId && e.buttonId === buttonId,
    );

    if (!edge) {
      log.warn('[FlowExecutor] Nenhuma edge encontrada para botão', {
        currentNodeId: session.currentNodeId,
        buttonId,
      });
      return {
        status: 'ERROR',
        currentNodeId: session.currentNodeId,
        variables: session.variables,
        executionLog: this.executionLog,
      };
    }

    const nextNode = flow.nodes.find((n) => n.id === edge.targetNodeId);
    if (!nextNode) {
      return {
        status: 'ERROR',
        variables: session.variables,
        executionLog: this.executionLog,
      };
    }

    // Recarrega variáveis da sessão
    for (const [k, v] of Object.entries(session.variables)) {
      this.resolver.setVariable(k, v);
    }

    return this.executeChain(flow, nextNode, deadline);
  }

  // ---------------------------------------------------------------------------
  // Core: execute chain (nó a nó até END, WAITING_INPUT ou erro)
  // ---------------------------------------------------------------------------

  private async executeChain(
    flow: RuntimeFlow,
    startNode: RuntimeFlowNode,
    deadline: DeadlineGuard,
  ): Promise<ExecuteResult> {
    let current: RuntimeFlowNode | null = startNode;

    while (current) {
      const t0 = Date.now();
      let deliveryMode: 'sync' | 'async' = deadline.canSync() ? 'sync' : 'async';
      let result: 'ok' | 'error' | 'skipped' = 'ok';
      let detail: string | undefined;

      try {
        const outcome = await this.executeNode(current, flow, deadline);

        if (outcome === 'WAITING_INPUT') {
          this.pushLog(current, t0, deliveryMode, 'ok', 'Aguardando input do usuário');
          return {
            status: 'WAITING_INPUT',
            currentNodeId: current.id,
            variables: this.resolver.getSessionVariables(),
            executionLog: this.executionLog,
          };
        }

        if (outcome === 'END') {
          this.pushLog(current, t0, deliveryMode, 'ok', 'Flow encerrado');
          return {
            status: 'COMPLETED',
            variables: this.resolver.getSessionVariables(),
            executionLog: this.executionLog,
          };
        }

        // outcome é o ID do próximo nó
        detail = `next → ${outcome}`;
      } catch (err) {
        result = 'error';
        detail = err instanceof Error ? err.message : String(err);
        log.error('[FlowExecutor] Erro ao executar nó', {
          nodeId: current.id,
          nodeType: current.nodeType,
          error: detail,
        });
      }

      deliveryMode = deadline.canSync() ? 'sync' : 'async';
      this.pushLog(current, t0, deliveryMode, result, detail);

      if (result === 'error') {
        return {
          status: 'ERROR',
          currentNodeId: current.id,
          variables: this.resolver.getSessionVariables(),
          executionLog: this.executionLog,
        };
      }

      // Avança para o próximo nó
      const nextNodeId = detail?.replace('next → ', '');
      current = nextNodeId ? (flow.nodes.find((n) => n.id === nextNodeId) ?? null) : null;
    }

    // Chegou num dead-end (sem mais nós)
    return {
      status: 'COMPLETED',
      variables: this.resolver.getSessionVariables(),
      executionLog: this.executionLog,
    };
  }

  // ---------------------------------------------------------------------------
  // Execute individual node — retorna 'END' | 'WAITING_INPUT' | nextNodeId
  // ---------------------------------------------------------------------------

  private async executeNode(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    const nodeType = node.nodeType as FlowNodeType;

    switch (nodeType) {
      case 'START':
        return this.findNextNodeId(flow, node);

      case 'END':
        return 'END';

      case 'TEXT_MESSAGE':
        return this.handleTextMessage(node, flow, deadline);

      case 'INTERACTIVE_MESSAGE':
        return this.handleInteractiveMessage(node, flow, deadline);

      case 'MEDIA':
        return this.handleMedia(node, flow, deadline);

      case 'DELAY':
        return this.handleDelay(node, flow, deadline);

      case 'CONDITION':
        return this.handleCondition(node, flow);

      case 'SET_VARIABLE':
        return this.handleSetVariable(node, flow);

      case 'HTTP_REQUEST':
        return this.handleHttpRequest(node, flow, deadline);

      case 'ADD_TAG':
      case 'REMOVE_TAG':
        return this.handleTag(node, flow, nodeType);

      case 'TRANSFER':
        return this.handleTransfer(node, flow, deadline);

      case 'REACTION':
        return this.handleReaction(node, flow, deadline);

      default:
        log.warn('[FlowExecutor] Tipo de nó desconhecido', { nodeType });
        return this.findNextNodeId(flow, node);
    }
  }

  // ---------------------------------------------------------------------------
  // Node handlers
  // ---------------------------------------------------------------------------

  private async handleTextMessage(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    const config = node.config as { text?: string };
    const text = this.resolver.resolve(config.text ?? '');

    await this.smartDeliver(deadline, { type: 'text', content: text });

    return this.findNextNodeId(flow, node);
  }

  private async handleInteractiveMessage(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    const config = node.config as {
      interactivePayload?: Record<string, unknown>;
      elements?: InteractiveMessageElement[];
      body?: string;
      header?: string;
      footer?: string;
      buttons?: Array<{ id: string; title: string }>;
    };

    // Se tem elements (formato novo), converter para campos legados
    let effectiveConfig = config;
    if (config.elements?.length && !config.body) {
      const legacy = elementsToLegacyFields(config.elements);
      effectiveConfig = {
        ...config,
        body: legacy.body,
        header: legacy.header,
        footer: legacy.footer,
        buttons: legacy.buttons,
      };
    }

    // Resolve variáveis no body/header/footer
    const resolvedPayload = effectiveConfig.interactivePayload
      ? JSON.parse(this.resolver.resolve(JSON.stringify(effectiveConfig.interactivePayload)))
      : this.buildInteractivePayload(effectiveConfig);

    await this.smartDeliver(deadline, {
      type: 'interactive',
      interactivePayload: resolvedPayload,
    });

    // Se tem botões, STOP e espera resposta (WAITING_INPUT)
    const hasButtons =
      config.buttons?.length ||
      (resolvedPayload as Record<string, unknown>)?.action;

    if (hasButtons) {
      return 'WAITING_INPUT';
    }

    return this.findNextNodeId(flow, node);
  }

  private async handleMedia(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    // Mídia SEMPRE força async
    deadline.ensureAsyncMode();

    const config = node.config as unknown as MediaConfig;
    const mediaUrl = this.resolver.resolve(config.mediaUrl);
    const caption = config.caption ? this.resolver.resolve(config.caption) : undefined;

    await this.smartDeliver(deadline, {
      type: 'media',
      mediaUrl,
      filename: config.filename,
      content: caption,
    });

    return this.findNextNodeId(flow, node);
  }

  private async handleDelay(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    // Delay SEMPRE força async — segurar a ponte dormindo desperdiça tempo
    deadline.ensureAsyncMode();

    const config = node.config as unknown as DelayConfig;
    const delayMs = Math.max(0, Math.min(config.delayMs, 30_000)); // cap em 30s

    log.debug('[FlowExecutor] DELAY', { delayMs });
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return this.findNextNodeId(flow, node);
  }

  private async handleCondition(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
  ): Promise<string> {
    const config = node.config as unknown as ConditionConfig;
    const actualValue = this.resolver.resolve(`{{${config.variable}}}`);
    const expectedValue = this.resolver.resolve(config.value);

    const result = this.evaluateCondition(actualValue, config.operator, expectedValue);
    const branch = result ? 'true' : 'false';

    // Encontra edge com conditionBranch correspondente
    const edge = flow.edges.find(
      (e) => e.sourceNodeId === node.id && e.conditionBranch === branch,
    );

    if (!edge) {
      log.warn('[FlowExecutor] CONDITION sem edge para branch', {
        nodeId: node.id,
        branch,
      });
      return 'END';
    }

    return edge.targetNodeId;
  }

  private async handleSetVariable(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
  ): Promise<string> {
    const config = node.config as unknown as SetVariableConfig;
    const resolvedValue = this.resolver.resolve(config.expression);
    this.resolver.setVariable(config.variableName, resolvedValue);

    log.debug('[FlowExecutor] SET_VARIABLE', {
      variable: config.variableName,
      value: resolvedValue,
    });

    return this.findNextNodeId(flow, node);
  }

  private async handleHttpRequest(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    // HTTP SEMPRE força async — tempo imprevisível
    deadline.ensureAsyncMode();

    const config = node.config as unknown as HttpRequestConfig;
    const url = this.resolver.resolve(config.url);
    const body = config.body ? this.resolver.resolve(config.body) : undefined;
    const headers = config.headers
      ? this.resolver.resolveObject(config.headers)
      : undefined;

    const timeoutMs = config.timeoutMs ?? 10_000;

    try {
      const { default: axios } = await import('axios');
      const response = await axios({
        method: config.method,
        url,
        headers,
        data: body ? JSON.parse(body) : undefined,
        timeout: timeoutMs,
      });

      if (config.responseVariable) {
        this.resolver.setVariable(config.responseVariable, response.data);
      }

      log.debug('[FlowExecutor] HTTP_REQUEST OK', { url, status: response.status });
    } catch (err) {
      log.error('[FlowExecutor] HTTP_REQUEST falhou', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });

      if (config.responseVariable) {
        this.resolver.setVariable(config.responseVariable, null);
      }
    }

    return this.findNextNodeId(flow, node);
  }

  private async handleTag(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    action: 'ADD_TAG' | 'REMOVE_TAG',
  ): Promise<string> {
    const config = node.config as unknown as TagConfig;
    const tagName = this.resolver.resolve(config.tagName);

    // Tags usam API Chatwit — já é async por natureza
    try {
      // TODO: Implementar chamada real à API de tags do Chatwit
      // POST /api/v1/accounts/:id/conversations/:id/labels
      log.debug(`[FlowExecutor] ${action}`, { tagName });
    } catch (err) {
      log.error(`[FlowExecutor] ${action} falhou`, {
        tagName,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return this.findNextNodeId(flow, node);
  }

  private async handleTransfer(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    deadline.ensureAsyncMode();

    const config = node.config as TransferConfig;

    // Nota interna (se configurada)
    if (config.internalNote) {
      const noteText = this.resolver.resolve(config.internalNote);
      await this.delivery.deliverText(this.context, noteText, true);
    }

    // TODO: Implementar assign via API Chatwit
    // POST /api/v1/accounts/:id/conversations/:id/assignments
    log.debug('[FlowExecutor] TRANSFER', {
      assigneeId: config.assigneeId,
      assigneeType: config.assigneeType,
    });

    return this.findNextNodeId(flow, node);
  }

  private async handleReaction(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    deadline: DeadlineGuard,
  ): Promise<string> {
    const config = node.config as { emoji?: string; text?: string };

    if (config.text) {
      const text = this.resolver.resolve(config.text);
      await this.smartDeliver(deadline, { type: 'text', content: text });
    }

    // TODO: Implementar emoji reaction via API quando suportado

    return this.findNextNodeId(flow, node);
  }

  // ---------------------------------------------------------------------------
  // smartDeliver — o coração da arquitetura deadline-first
  // ---------------------------------------------------------------------------

  private async smartDeliver(
    deadline: DeadlineGuard,
    payload: DeliveryPayload,
  ): Promise<void> {
    // Mídia nunca usa ponte (multipart não cabe no JSON da resposta)
    if (payload.type === 'media') {
      deadline.ensureAsyncMode();
    }

    if (deadline.canSync()) {
      // ✅ PONTE ABERTA e tempo suficiente
      deadline.setSyncPayload(this.toSyncResponse(payload));
      return;
    }

    // ❌ PONTE FECHADA ou sem tempo → API Chatwit
    if (!deadline.isBridgeClosed) {
      deadline.markBridgeResponded();
    }

    await this.delivery.deliver(this.context, payload);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toSyncResponse(payload: DeliveryPayload): SynchronousResponse {
    if (payload.type === 'interactive') {
      return {
        type: 'interactive',
        payload: payload.interactivePayload,
      };
    }
    return { content: payload.content };
  }

  private buildInteractivePayload(config: {
    body?: string;
    header?: string;
    footer?: string;
    buttons?: Array<{ id: string; title: string }>;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type: 'button',
      body: { text: this.resolver.resolve(config.body ?? '') },
    };

    if (config.header) {
      payload.header = { type: 'text', text: this.resolver.resolve(config.header) };
    }
    if (config.footer) {
      payload.footer = { text: this.resolver.resolve(config.footer) };
    }
    if (config.buttons?.length) {
      payload.action = {
        buttons: config.buttons.map((b) => ({
          type: 'reply',
          reply: {
            id: b.id,
            title: this.resolver.resolve(b.title),
          },
        })),
      };
    }

    return payload;
  }

  /**
   * Encontra o próximo nó na cadeia (segue a primeira edge sem buttonId/conditionBranch).
   */
  private findNextNodeId(flow: RuntimeFlow, node: RuntimeFlowNode): string {
    const edge = flow.edges.find(
      (e) =>
        e.sourceNodeId === node.id &&
        !e.buttonId &&
        !e.conditionBranch,
    );

    if (!edge) {
      return 'END';
    }

    return edge.targetNodeId;
  }

  private evaluateCondition(
    actual: string,
    operator: ConditionConfig['operator'],
    expected: string,
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'contains':
        return actual.includes(expected);
      case 'not_contains':
        return !actual.includes(expected);
      case 'gt':
        return Number(actual) > Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'exists':
        return actual !== '' && actual !== `{{${expected}}}`;
      case 'not_exists':
        return actual === '' || actual === `{{${expected}}}`;
      default:
        return false;
    }
  }

  private pushLog(
    node: RuntimeFlowNode,
    startTime: number,
    deliveryMode: 'sync' | 'async',
    result: 'ok' | 'error' | 'skipped',
    detail?: string,
  ): void {
    this.executionLog.push({
      nodeId: node.id,
      nodeType: node.nodeType as FlowNodeType,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      deliveryMode,
      result,
      detail,
    });
  }
}
