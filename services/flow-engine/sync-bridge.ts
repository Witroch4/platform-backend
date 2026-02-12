/**
 * SyncBridge — Controle simples da ponte síncrona
 *
 * Regra única: A PRIMEIRA mensagem interativa vai na resposta HTTP.
 * Depois que o Chatwoot recebe, ele fecha a ponte automaticamente.
 * Tudo depois é OBRIGATORIAMENTE async via API Chatwit.
 *
 * Sem cronômetro. Sem margem de segurança. Sem complexidade.
 */

import log from '@/lib/log';
import type { SynchronousResponse } from '@/types/flow-engine';

export class SyncBridge {
  private syncPayload: SynchronousResponse | null = null;
  private syncConsumed: boolean = false;

  /** Reação pendente para combinar com o próximo texto (formato button_reaction) */
  private pendingReaction: { emoji: string; targetMessageId: string } | null = null;

  // ---------------------------------------------------------------------------
  // Sync Payload (apenas 1, a primeira mensagem interativa)
  // ---------------------------------------------------------------------------

  /**
   * Ainda podemos usar a ponte síncrona?
   * TRUE apenas se ainda não enviamos nada sync.
   */
  canSync(): boolean {
    return !this.syncConsumed && this.syncPayload === null;
  }

  /**
   * Define o payload para resposta síncrona.
   * Se já tiver payload, ignora (só a primeira conta).
   */
  setSyncPayload(payload: SynchronousResponse): void {
    if (this.syncConsumed) {
      log.debug('[SyncBridge] setSyncPayload ignorado — ponte já foi usada');
      return;
    }
    if (this.syncPayload !== null) {
      log.debug('[SyncBridge] setSyncPayload ignorado — já tem payload pendente');
      return;
    }
    this.syncPayload = payload;
    log.debug('[SyncBridge] Payload sync definido');
  }

  /**
   * Tem payload pendente para enviar na ponte?
   */
  hasSyncPayload(): boolean {
    return this.syncPayload !== null;
  }

  /**
   * Consome o payload sync (para enviar na resposta HTTP).
   * Marca a ponte como usada — depois disso, tudo é async.
   */
  consumeSyncPayload(): SynchronousResponse | null {
    if (this.syncPayload === null) {
      return null;
    }
    const payload = this.syncPayload;
    this.syncPayload = null;
    this.syncConsumed = true;
    log.debug('[SyncBridge] Payload sync consumido — ponte fechada');
    return payload;
  }

  /**
   * A ponte já foi usada?
   */
  isBridgeClosed(): boolean {
    return this.syncConsumed;
  }

  // ---------------------------------------------------------------------------
  // Pending Reaction (para combinar REACTION + TEXT em um único payload)
  // ---------------------------------------------------------------------------

  /**
   * Armazena uma reação pendente para combinar com o próximo texto.
   */
  setPendingReaction(emoji: string, targetMessageId: string): void {
    this.pendingReaction = { emoji, targetMessageId };
    log.debug('[SyncBridge] Reação pendente armazenada', { emoji, targetMessageId });
  }

  /**
   * Consome e retorna a reação pendente (se houver).
   */
  consumePendingReaction(): { emoji: string; targetMessageId: string } | null {
    const reaction = this.pendingReaction;
    this.pendingReaction = null;
    return reaction;
  }

  /**
   * Tem reação pendente?
   */
  hasPendingReaction(): boolean {
    return this.pendingReaction !== null;
  }
}
