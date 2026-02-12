/**
 * @deprecated Use SyncBridge em vez deste módulo.
 * Este arquivo é mantido apenas para referência/rollback.
 * Nenhum código ativo importa este módulo.
 *
 * DeadlineGuard — Cronômetro de ponte síncrona (OBSOLETO)
 *
 * Controla quando a resposta HTTP pode ser acumulada na ponte síncrona
 * e quando o flow deve migrar para entrega assíncrona via API Chatwit.
 *
 * Regra: tenta na ponte; se o relógio diz "não dá",
 * migra pra async e nunca volta.
 *
 * @see docs/interative_message_flow_builder.md §14.2
 */

import log from '@/lib/log';
import type { SynchronousResponse, ExecuteResult } from '@/types/flow-engine';

export class DeadlineGuard {
  private readonly startTime: number;
  private readonly deadlineMs: number;
  private readonly safetyMarginMs: number;
  private bridgeResponded: boolean = false;
  private asyncMode: boolean = false;
  private pendingSyncPayloads: SynchronousResponse[] = [];
  /** Flag para sinalizar que o executor deve retornar imediatamente (yield) */
  private shouldYield: boolean = false;
  /** Callback para continuar execução em background após yield */
  private backgroundContinuation: (() => Promise<ExecuteResult | void>) | null = null;
  /** Reação pendente para combinar com o próximo texto (formato button_reaction do Chatwit) */
  private pendingReaction: { emoji: string; targetMessageId: string } | null = null;

  /**
   * @param deadlineMs      Tempo total disponível para a ponte (padrão: 28 000 ms)
   * @param safetyMarginMs  Margem de segurança antes de forçar async (padrão: 5 000 ms)
   */
  constructor(deadlineMs: number = 28_000, safetyMarginMs: number = 5_000) {
    this.startTime = Date.now();
    this.deadlineMs = deadlineMs;
    this.safetyMarginMs = safetyMarginMs;

    log.debug('[DeadlineGuard] Cronômetro iniciado', {
      deadlineMs,
      safetyMarginMs,
      effectiveMs: deadlineMs - safetyMarginMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** Tempo restante em ms (nunca negativo) */
  get remaining(): number {
    return Math.max(0, this.deadlineMs - this.elapsed);
  }

  /** Tempo já consumido em ms */
  get elapsed(): number {
    return Date.now() - this.startTime;
  }

  /** A ponte HTTP já foi respondida? */
  get isBridgeClosed(): boolean {
    return this.bridgeResponded;
  }

  /** Estamos em modo assíncrono (sem volta)? */
  get isAsyncMode(): boolean {
    return this.asyncMode;
  }

  /** O executor deve retornar imediatamente para liberar a resposta HTTP? */
  get shouldYieldToResponse(): boolean {
    return this.shouldYield;
  }

  // ---------------------------------------------------------------------------
  // Decision methods
  // ---------------------------------------------------------------------------

  /**
   * PODE executar algo síncrono na ponte?
   *
   * - A ponte ainda não fechou
   * - Não estamos em modo async (ponto sem retorno)
   * - Tempo restante > margem de segurança
   */
  canSync(): boolean {
    if (this.asyncMode || this.bridgeResponded) {
      return false;
    }
    return this.remaining > this.safetyMarginMs;
  }

  /**
   * Força migração para modo assíncrono.
   * Uma vez chamado, `canSync()` retornará `false` pra sempre.
   */
  ensureAsyncMode(): void {
    if (this.asyncMode) return;

    this.asyncMode = true;
    log.debug('[DeadlineGuard] Migrou para modo assíncrono', {
      elapsedMs: this.elapsed,
      remainingMs: this.remaining,
    });
  }

  /**
   * Sinaliza que o executor deve retornar imediatamente (yield).
   * Usado quando há um DELAY que não pode bloquear a resposta HTTP.
   */
  requestYield(): void {
    this.shouldYield = true;
    log.debug('[DeadlineGuard] Yield solicitado - executor deve retornar', {
      elapsedMs: this.elapsed,
    });
  }

  /**
   * Reseta o flag de yield após o executor ter retornado.
   */
  clearYield(): void {
    this.shouldYield = false;
  }

  /**
   * Agenda uma função para continuar em background após o yield.
   */
  scheduleBackgroundContinuation(continuation: () => Promise<ExecuteResult | void>): void {
    this.backgroundContinuation = continuation;
  }

  /**
   * Executa a continuação em background (se houver).
   * Deve ser chamado APÓS a resposta HTTP ter sido enviada.
   * Retorna o ExecuteResult para que o orquestrador possa salvar o estado correto.
   */
  async executeBackgroundContinuation(): Promise<ExecuteResult | void> {
    if (this.backgroundContinuation) {
      const continuation = this.backgroundContinuation;
      this.backgroundContinuation = null;
      log.debug('[DeadlineGuard] Executando continuação em background');
      return continuation();
    }
  }

  /**
   * Verifica se há continuação pendente.
   */
  hasBackgroundContinuation(): boolean {
    return this.backgroundContinuation !== null;
  }

  // ---------------------------------------------------------------------------
  // Sync payload accumulation
  // ---------------------------------------------------------------------------

  /**
   * Acumula payload para responder na ponte.
   * Apenas o ÚLTIMO payload é enviado (sobrescreve anteriores).
   * Para cenários multi-message, use `appendSyncPayload`.
   */
  setSyncPayload(payload: SynchronousResponse): void {
    if (this.asyncMode || this.bridgeResponded) {
      log.warn('[DeadlineGuard] setSyncPayload ignorado — ponte já fechada ou modo async');
      return;
    }
    this.pendingSyncPayloads = [payload];
  }

  /**
   * Acumula payload adicional (para cenários onde múltiplas msgs cabem na ponte).
   */
  appendSyncPayload(payload: SynchronousResponse): void {
    if (this.asyncMode || this.bridgeResponded) {
      log.warn('[DeadlineGuard] appendSyncPayload ignorado — ponte já fechada ou modo async');
      return;
    }
    this.pendingSyncPayloads.push(payload);
  }

  /**
   * Verifica se há payload pendente na ponte.
   */
  hasPendingSyncPayload(): boolean {
    return this.pendingSyncPayloads.length > 0;
  }

  /**
   * Lê o payload pendente sem consumir (para flush antes de sobrescrever).
   */
  peekSyncPayload(): SynchronousResponse | null {
    return this.pendingSyncPayloads.length > 0 ? this.pendingSyncPayloads[0] : null;
  }

  /**
   * Limpa os payloads pendentes sem marcar a ponte como respondida.
   * Usado após flush manual via API.
   */
  clearSyncPayload(): void {
    this.pendingSyncPayloads = [];
  }

  // ---------------------------------------------------------------------------
  // Pending Reaction (para combinar REACTION + TEXT em um único payload)
  // ---------------------------------------------------------------------------

  /**
   * Armazena uma reação pendente para ser combinada com o próximo texto.
   * Usado quando REACTION é executada directlyAfterButton e deve ser
   * enviada junto com o texto subsequente no formato button_reaction.
   */
  setPendingReaction(emoji: string, targetMessageId: string): void {
    this.pendingReaction = { emoji, targetMessageId };
    log.debug('[DeadlineGuard] Reação pendente armazenada', { emoji, targetMessageId });
  }

  /**
   * Consome e retorna a reação pendente (se houver).
   * Após consumir, a reação é limpa.
   */
  consumePendingReaction(): { emoji: string; targetMessageId: string } | null {
    const reaction = this.pendingReaction;
    this.pendingReaction = null;
    return reaction;
  }

  /**
   * Verifica se há reação pendente para combinar.
   */
  hasPendingReaction(): boolean {
    return this.pendingReaction !== null;
  }

  // ---------------------------------------------------------------------------
  // Bridge management
  // ---------------------------------------------------------------------------

  /**
   * Marca que a ponte HTTP já foi respondida.
   * Chamar antes de enviar a response HTTP.
   */
  markBridgeResponded(): void {
    this.bridgeResponded = true;
  }

  /**
   * Consome os payloads acumulados e marca a ponte como respondida.
   * Retorna `null` se nada foi acumulado ou se já migrou pra async antes de acumular.
   */
  consumeSyncPayload(): SynchronousResponse | null {
    if (this.pendingSyncPayloads.length === 0) {
      return null;
    }

    this.markBridgeResponded();

    // Se só tem um, retorna direto
    if (this.pendingSyncPayloads.length === 1) {
      const payload = this.pendingSyncPayloads[0];
      this.pendingSyncPayloads = [];
      return payload;
    }

    // Se tem múltiplos, merge: último interativo vence, textos concatenam
    const merged: SynchronousResponse = {};
    const textParts: string[] = [];

    for (const p of this.pendingSyncPayloads) {
      if (p.content) textParts.push(p.content);
      // Formato novo: channel-specific (whatsapp/instagram/facebook)
      if (p.whatsapp) {
        merged.whatsapp = p.whatsapp;
      }
      if (p.instagram) {
        merged.instagram = p.instagram;
      }
      if (p.facebook) {
        merged.facebook = p.facebook;
      }
      // Formato legado: type+payload
      if (p.type === 'interactive' && p.payload) {
        merged.type = 'interactive';
        merged.payload = p.payload;
      }
    }

    if (textParts.length > 0 && !merged.whatsapp && !merged.instagram && !merged.facebook && !merged.type) {
      merged.content = textParts.join('\n\n');
    }

    this.pendingSyncPayloads = [];

    log.debug('[DeadlineGuard] Sync payload consumido', {
      elapsedMs: this.elapsed,
      hasInteractive: merged.type === 'interactive',
    });

    return Object.keys(merged).length > 0 ? merged : null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Snapshot do estado atual (para logging / debug).
   */
  snapshot(): {
    elapsedMs: number;
    remainingMs: number;
    canSync: boolean;
    asyncMode: boolean;
    bridgeClosed: boolean;
    pendingPayloads: number;
  } {
    return {
      elapsedMs: this.elapsed,
      remainingMs: this.remaining,
      canSync: this.canSync(),
      asyncMode: this.asyncMode,
      bridgeClosed: this.bridgeResponded,
      pendingPayloads: this.pendingSyncPayloads.length,
    };
  }
}
