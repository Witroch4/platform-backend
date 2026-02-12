/**
 * FlowExecutor — Motor unificado de execução de flows
 *
 * Regra simples:
 *   - Primeira INTERACTIVE_MESSAGE → resposta síncrona (ponte HTTP)
 *   - Chatwoot fecha a ponte automaticamente ao receber
 *   - Tudo depois → async via API Chatwit
 *
 * Sem cronômetro. Sem margem de segurança. Sem complexidade.
 */

import log from '@/lib/log';
import { SyncBridge } from './sync-bridge';
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
  ExecuteResult,
} from '@/types/flow-engine';

// Re-export ExecuteResult from types for backwards compatibility
export type { ExecuteResult } from '@/types/flow-engine';

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
    bridge: SyncBridge,
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

    return this.executeChain(flow, startNode, bridge);
  }

  // ---------------------------------------------------------------------------
  // Public: retomar de um clique de botão (WAITING_INPUT → próximo nó)
  // ---------------------------------------------------------------------------

  async resumeFromButton(
    flow: RuntimeFlow,
    session: FlowSessionData,
    buttonId: string,
    bridge: SyncBridge,
  ): Promise<ExecuteResult> {
    if (!session.currentNodeId) {
      return {
        status: 'ERROR',
        variables: session.variables,
        executionLog: this.executionLog,
      };
    }

    // Buscar TODAS as edges com este buttonId (suporte a branches paralelos)
    const edges = flow.edges.filter(
      (e) => e.sourceNodeId === session.currentNodeId && e.buttonId === buttonId,
    );

    if (edges.length === 0) {
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

    // Recarrega variáveis da sessão
    for (const [k, v] of Object.entries(session.variables)) {
      this.resolver.setVariable(k, v);
    }

    // Mapear edges para nós de destino
    const targetNodes = edges
      .map((edge) => flow.nodes.find((n) => n.id === edge.targetNodeId))
      .filter((n): n is RuntimeFlowNode => n !== undefined);

    if (targetNodes.length === 0) {
      return {
        status: 'ERROR',
        variables: session.variables,
        executionLog: this.executionLog,
      };
    }

    log.debug('[FlowExecutor] Branches paralelos após botão', {
      buttonId,
      targetCount: targetNodes.length,
      targetTypes: targetNodes.map((n) => n.nodeType),
    });

    // -------------------------------------------------------------------------
    // Separação inteligente de branches:
    //   REACTIONs → fire-and-forget (definem pending reaction, sempre primeiro)
    //   Conteúdo → cadeia principal (o com continuação) + branches paralelos
    //   Se REACTION tem continuação, a continuação vira candidata a main chain
    // -------------------------------------------------------------------------

    // 1. Separar REACTIONs (setup) de nós de conteúdo
    const reactionBranches: RuntimeFlowNode[] = [];
    const contentTargets: RuntimeFlowNode[] = [];

    for (const node of targetNodes) {
      if (node.nodeType === 'REACTION') {
        reactionBranches.push(node);
      } else {
        contentTargets.push(node);
      }
    }

    // 2. Coletar continuações de REACTIONs que têm cadeia após elas
    //    (ex: REACTION → INTERACTIVE_MESSAGE → ...)
    const reactionContinuations: RuntimeFlowNode[] = [];
    for (const reaction of reactionBranches) {
      const nextEdge = flow.edges.find(
        (e) => e.sourceNodeId === reaction.id && !e.buttonId && !e.conditionBranch,
      );
      if (nextEdge) {
        const nextNode = flow.nodes.find((n) => n.id === nextEdge.targetNodeId);
        if (nextNode) reactionContinuations.push(nextNode);
      }
    }

    // 3. Todos os candidatos a cadeia principal = content targets + reaction continuations
    const allCandidates = [...contentTargets, ...reactionContinuations];

    // 4. Escolher cadeia principal: preferir nó com continuação ou INTERACTIVE_MESSAGE
    let mainChainNode: RuntimeFlowNode | null = null;
    const parallelContent: RuntimeFlowNode[] = [];

    for (const node of allCandidates) {
      const hasNextEdge = flow.edges.some(
        (e) => e.sourceNodeId === node.id && !e.buttonId && !e.conditionBranch,
      );
      const isInteractive = node.nodeType === 'INTERACTIVE_MESSAGE';
      const hasContinuation = hasNextEdge || isInteractive;

      if (!mainChainNode) {
        mainChainNode = node;
      } else {
        const mainHasNextEdge = flow.edges.some(
          (e) => e.sourceNodeId === mainChainNode!.id && !e.buttonId && !e.conditionBranch,
        );
        const mainIsInteractive = mainChainNode!.nodeType === 'INTERACTIVE_MESSAGE';
        const mainHasContinuation = mainHasNextEdge || mainIsInteractive;

        if (hasContinuation && !mainHasContinuation) {
          // Novo candidato com continuação substitui folha
          parallelContent.push(mainChainNode);
          mainChainNode = node;
        } else {
          parallelContent.push(node);
        }
      }
    }

    // Fallback: se nenhum candidato, usar primeiro target
    if (!mainChainNode && targetNodes.length > 0) {
      mainChainNode = targetNodes[0];
    }

    log.debug('[FlowExecutor] Branch separation result', {
      reactionCount: reactionBranches.length,
      parallelContentCount: parallelContent.length,
      mainChainType: mainChainNode?.nodeType,
    });

    // ---- EXECUÇÃO ----

    // 5. REACTIONs primeiro (fire-and-forget, definem pending reaction)
    for (const reaction of reactionBranches) {
      log.debug('[FlowExecutor] Executando branch paralelo', {
        nodeId: reaction.id,
        nodeType: reaction.nodeType,
      });
      await this.executeNode(reaction, flow, bridge, true);
      this.pushLog(reaction, Date.now(), bridge.isBridgeClosed() ? 'async' : 'sync', 'ok', 'reaction branch');
    }

    // 6. Conteúdo paralelo (TEXT folhas, emojis soltos, etc.)
    for (const branch of parallelContent) {
      log.debug('[FlowExecutor] Executando branch paralelo', {
        nodeId: branch.id,
        nodeType: branch.nodeType,
      });
      await this.executeNode(branch, flow, bridge, true);
      this.pushLog(branch, Date.now(), bridge.isBridgeClosed() ? 'async' : 'sync', 'ok', 'branch paralelo');
    }

    // 7. Se há pending reaction não consumida (sem TEXT para combinar),
    //    e a main chain NÃO é TEXT_MESSAGE (que consumiria no seu handler),
    //    gerar sync payload só com emoji
    const mainWillConsumeReaction = mainChainNode?.nodeType === 'TEXT_MESSAGE';
    if (bridge.hasPendingReaction() && bridge.canSync() && !mainWillConsumeReaction) {
      const pendingReaction = bridge.consumePendingReaction();
      if (pendingReaction) {
        const channel = this.context.channelType;
        const reactionPayload = this.buildCombinedReactionTextPayload(
          pendingReaction.emoji,
          undefined,
          pendingReaction.targetMessageId,
          channel,
        );
        bridge.setSyncPayload(reactionPayload);
        log.debug('[FlowExecutor] Pending reaction enviada como sync (emoji-only)', {
          emoji: pendingReaction.emoji,
        });
      }
    }

    // 8. Executar cadeia principal (com directlyAfterButton=true)
    if (mainChainNode) {
      return this.executeChain(flow, mainChainNode, bridge, true);
    }

    return {
      status: 'COMPLETED',
      variables: this.resolver.getSessionVariables(),
      executionLog: this.executionLog,
    };
  }

  // ---------------------------------------------------------------------------
  // Core: execute chain (nó a nó até END, WAITING_INPUT ou erro)
  // ---------------------------------------------------------------------------

  private async executeChain(
    flow: RuntimeFlow,
    startNode: RuntimeFlowNode,
    bridge: SyncBridge,
    isFirstNodeAfterButton = false,
  ): Promise<ExecuteResult> {
    let current: RuntimeFlowNode | null = startNode;
    let directlyAfterButton = isFirstNodeAfterButton;

    while (current) {
      const t0 = Date.now();
      let deliveryMode: 'sync' | 'async' = bridge.isBridgeClosed() ? 'async' : 'sync';
      let result: 'ok' | 'error' | 'skipped' = 'ok';
      let detail: string | undefined;

      try {
        const outcome = await this.executeNode(current, flow, bridge, directlyAfterButton);
        directlyAfterButton = false;

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

      deliveryMode = bridge.isBridgeClosed() ? 'async' : 'sync';
      this.pushLog(current, t0, deliveryMode, result, detail);

      if (result === 'error') {
        return {
          status: 'ERROR',
          currentNodeId: current.id,
          variables: this.resolver.getSessionVariables(),
          executionLog: this.executionLog,
        };
      }

      const nextNodeId = detail?.replace('next → ', '');
      current = nextNodeId ? (flow.nodes.find((n) => n.id === nextNodeId) ?? null) : null;
    }

    return {
      status: 'COMPLETED',
      variables: this.resolver.getSessionVariables(),
      executionLog: this.executionLog,
    };
  }

  // ---------------------------------------------------------------------------
  // Execute individual node
  // ---------------------------------------------------------------------------

  private async executeNode(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    bridge: SyncBridge,
    directlyAfterButton = false,
  ): Promise<string> {
    const nodeType = node.nodeType as FlowNodeType;

    switch (nodeType) {
      case 'START':
        return this.findNextNodeId(flow, node);

      case 'END':
        return 'END';

      case 'TEXT_MESSAGE':
        return this.handleTextMessage(node, flow, bridge, directlyAfterButton);

      case 'INTERACTIVE_MESSAGE':
        return this.handleInteractiveMessage(node, flow, bridge, directlyAfterButton);

      case 'MEDIA':
        return this.handleMedia(node, flow, bridge);

      case 'DELAY':
        return this.handleDelay(node, flow);

      case 'CONDITION':
        return this.handleCondition(node, flow);

      case 'SET_VARIABLE':
        return this.handleSetVariable(node, flow);

      case 'HTTP_REQUEST':
        return this.handleHttpRequest(node, flow);

      case 'ADD_TAG':
      case 'REMOVE_TAG':
        return this.handleTag(node, flow, nodeType);

      case 'TRANSFER':
        return this.handleTransfer(node, flow);

      case 'REACTION':
        return this.handleReaction(node, flow, bridge, directlyAfterButton);

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
    bridge: SyncBridge,
    directlyAfterButton = false,
  ): Promise<string> {
    const config = node.config as { text?: string };
    const text = this.resolver.resolve(config.text ?? '');
    const wamid = this.context.sourceMessageId;
    const contextMessageId = directlyAfterButton && wamid ? wamid : undefined;

    // Verificar se há REACTION pendente para combinar
    const pendingReaction = bridge.consumePendingReaction();

    if (pendingReaction && directlyAfterButton && bridge.canSync()) {
      // Combinar reaction + text no formato button_reaction
      const channel = this.context.channelType;
      const combinedPayload = this.buildCombinedReactionTextPayload(
        pendingReaction.emoji,
        text,
        pendingReaction.targetMessageId,
        channel,
      );
      bridge.setSyncPayload(combinedPayload);
      log.debug('[FlowExecutor] TEXT combinado com REACTION pendente', {
        emoji: pendingReaction.emoji,
        textPreview: text.slice(0, 50),
      });
    } else {
      await this.deliver(bridge, { type: 'text', content: text, contextMessageId });
    }

    return this.findNextNodeId(flow, node);
  }

  /**
   * Monta payload button_reaction para resposta síncrona.
   * Suporta 3 variantes:
   *   - Só emoji:  { action_type, emoji, whatsapp: { message_id, reaction_emoji } }
   *   - Só texto:  { action_type, text,  whatsapp: { message_id, response_text } }
   *   - Ambos:     { action_type, emoji, text, whatsapp: { message_id, reaction_emoji, response_text } }
   */
  private buildCombinedReactionTextPayload(
    emoji: string,
    text: string | undefined,
    targetMessageId: string,
    channel: string,
  ): SynchronousResponse {
    const basePayload: Record<string, unknown> = {
      action_type: 'button_reaction',
    };
    if (emoji) basePayload.emoji = emoji;
    if (text) basePayload.text = text;

    const channelPayload: Record<string, unknown> = {
      message_id: targetMessageId,
    };
    if (emoji) channelPayload.reaction_emoji = emoji;
    if (text) channelPayload.response_text = text;

    if (channel === 'instagram') {
      return { ...basePayload, instagram: channelPayload } as SynchronousResponse;
    }
    if (channel === 'facebook') {
      return { ...basePayload, facebook: channelPayload } as SynchronousResponse;
    }
    return { ...basePayload, whatsapp: channelPayload } as SynchronousResponse;
  }

  private async handleInteractiveMessage(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    bridge: SyncBridge,
    directlyAfterButton = false,
  ): Promise<string> {
    const config = node.config as {
      interactivePayload?: Record<string, unknown>;
      elements?: InteractiveMessageElement[];
      body?: string;
      header?: string;
      footer?: string;
      buttons?: Array<{ id: string; title: string }>;
    };

    // Verificar se há REACTION pendente
    const pendingReaction = bridge.consumePendingReaction();
    if (pendingReaction) {
      log.debug('[FlowExecutor] INTERACTIVE_MESSAGE: consumindo reação pendente', {
        emoji: pendingReaction.emoji,
      });
      // Enviar reação via API (não pode combinar com interactive)
      await this.delivery.deliver(this.context, {
        type: 'reaction',
        emoji: pendingReaction.emoji,
        targetMessageId: pendingReaction.targetMessageId,
      });
    }

    // Se tem elements, SEMPRE converter para campos legados
    let effectiveConfig = config;
    if (config.elements?.length) {
      const legacy = elementsToLegacyFields(config.elements);
      effectiveConfig = {
        ...config,
        body: legacy.body,
        header: legacy.header,
        footer: legacy.footer,
        buttons: legacy.buttons,
      };
      log.debug('[FlowExecutor] INTERACTIVE_MESSAGE: converteu elements', {
        buttonsCount: legacy.buttons?.length ?? 0,
        buttonTitles: legacy.buttons?.map(b => b.title),
      });
    }

    const resolvedPayload = effectiveConfig.interactivePayload
      ? JSON.parse(this.resolver.resolve(JSON.stringify(effectiveConfig.interactivePayload)))
      : this.buildInteractivePayload(effectiveConfig);

    await this.deliver(bridge, { type: 'interactive', interactivePayload: resolvedPayload });

    // Se tem botões, STOP e espera resposta
    const hasButtons = effectiveConfig.buttons?.length || (resolvedPayload as Record<string, unknown>)?.action;
    if (hasButtons) {
      return 'WAITING_INPUT';
    }

    return this.findNextNodeId(flow, node);
  }

  private async handleMedia(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    bridge: SyncBridge,
  ): Promise<string> {
    const config = node.config as unknown as MediaConfig;
    const mediaUrl = this.resolver.resolve(config.mediaUrl);
    const caption = config.caption ? this.resolver.resolve(config.caption) : undefined;

    // Mídia SEMPRE via API (não cabe na ponte)
    await this.delivery.deliver(this.context, {
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
  ): Promise<string> {
    const config = node.config as unknown as DelayConfig;
    const delayMs = Math.max(0, Math.min(config.delayMs, 30_000));

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

    const edge = flow.edges.find(
      (e) => e.sourceNodeId === node.id && e.conditionBranch === branch,
    );

    if (!edge) {
      log.warn('[FlowExecutor] CONDITION sem edge para branch', { nodeId: node.id, branch });
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

    log.debug('[FlowExecutor] SET_VARIABLE', { variable: config.variableName, value: resolvedValue });

    return this.findNextNodeId(flow, node);
  }

  private async handleHttpRequest(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
  ): Promise<string> {
    const config = node.config as unknown as HttpRequestConfig;
    const url = this.resolver.resolve(config.url);
    const body = config.body ? this.resolver.resolve(config.body) : undefined;
    const headers = config.headers ? this.resolver.resolveObject(config.headers) : undefined;
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
    log.debug(`[FlowExecutor] ${action}`, { tagName });
    return this.findNextNodeId(flow, node);
  }

  private async handleTransfer(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
  ): Promise<string> {
    const config = node.config as TransferConfig;

    if (config.internalNote) {
      const noteText = this.resolver.resolve(config.internalNote);
      await this.delivery.deliverText(this.context, noteText, true);
    }

    log.debug('[FlowExecutor] TRANSFER', {
      assigneeId: config.assigneeId,
      assigneeType: config.assigneeType,
    });

    return this.findNextNodeId(flow, node);
  }

  private async handleReaction(
    node: RuntimeFlowNode,
    flow: RuntimeFlow,
    bridge: SyncBridge,
    directlyAfterButton = false,
  ): Promise<string> {
    const config = node.config as { emoji?: string; text?: string };
    const channel = this.context.channelType;
    const wamid = this.context.sourceMessageId;

    if (config.emoji) {
      if (directlyAfterButton && wamid) {
        // Armazenar para combinar com próximo TEXT
        const reactionEmoji = channel === 'instagram' ? '❤️' : config.emoji;
        bridge.setPendingReaction(reactionEmoji, wamid);
        log.debug('[FlowExecutor] REACTION armazenada como pendente', { emoji: reactionEmoji });
      } else {
        // Enviar emoji como texto via API
        await this.delivery.deliver(this.context, { type: 'text', content: config.emoji });
      }
    }

    if (config.text) {
      const text = this.resolver.resolve(config.text);
      await this.delivery.deliver(this.context, { type: 'text', content: text });
    }

    return this.findNextNodeId(flow, node);
  }

  // ---------------------------------------------------------------------------
  // deliver — decide sync ou async
  // ---------------------------------------------------------------------------

  private async deliver(
    bridge: SyncBridge,
    payload: DeliveryPayload,
  ): Promise<void> {
    // Mídia nunca na ponte
    if (payload.type === 'media') {
      await this.delivery.deliver(this.context, payload);
      return;
    }

    // Se ponte ainda disponível, usa
    if (bridge.canSync()) {
      bridge.setSyncPayload(this.toSyncResponse(payload));
      return;
    }

    // Ponte já fechou → API
    await this.delivery.deliver(this.context, payload);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toSyncResponse(payload: DeliveryPayload): SynchronousResponse {
    if (payload.type === 'text' && payload.contextMessageId) {
      const channel = this.context.channelType;
      if (channel === 'whatsapp') {
        return {
          whatsapp: {
            type: 'text',
            text: { body: payload.content ?? '' },
            context: { message_id: payload.contextMessageId },
          },
        };
      }
      if (channel === 'instagram') {
        return {
          instagram: {
            message: { text: payload.content ?? '' },
            reply_to: { mid: payload.contextMessageId },
          },
        };
      }
      return { text: payload.content };
    }

    if (payload.type === 'interactive') {
      const channel = this.context.channelType;
      if (channel === 'whatsapp') {
        return {
          whatsapp: {
            type: 'interactive',
            interactive: payload.interactivePayload,
          },
        };
      }
      if (channel === 'instagram' || channel === 'facebook') {
        return { [channel]: payload.interactivePayload };
      }
      return {
        whatsapp: {
          type: 'interactive',
          interactive: payload.interactivePayload,
        },
      };
    }

    return { text: payload.content };
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

  private findNextNodeId(flow: RuntimeFlow, node: RuntimeFlowNode): string {
    const edge = flow.edges.find(
      (e) => e.sourceNodeId === node.id && !e.buttonId && !e.conditionBranch,
    );
    return edge?.targetNodeId ?? 'END';
  }

  private evaluateCondition(
    actual: string,
    operator: ConditionConfig['operator'],
    expected: string,
  ): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'contains': return actual.includes(expected);
      case 'not_contains': return !actual.includes(expected);
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'exists': return actual !== '' && actual !== `{{${expected}}}`;
      case 'not_exists': return actual === '' || actual === `{{${expected}}}`;
      default: return false;
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
