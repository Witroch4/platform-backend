/**
 * SyncBridge — Controle da ponte síncrona com harvest
 *
 * Modelo Harvest + Barrier:
 *   - Coletar todos os nós leves (text, reaction, interactive) até barreira
 *   - Combinar em um único payload sync (button_reaction com mapped)
 *   - Após barreira (MEDIA/DELAY), tudo é async via API
 *
 * @see docs/interative_message_flow_builder.md §14.2
 */

import log from '@/lib/log';
import type { SynchronousResponse } from '@/types/flow-engine';

/** Componentes coletados para o payload sync combinado */
interface HarvestedComponents {
  emoji?: string;
  targetMessageId?: string;
  /** ID da mensagem de contexto (para reply em contexto, mesmo sem emoji) */
  contextMessageId?: string;
  texts: string[];
  interactive?: Record<string, unknown>;
}

export class SyncBridge {
  private syncPayload: SynchronousResponse | null = null;
  private syncConsumed: boolean = false;

  /** Reação pendente para combinar com o próximo texto (formato button_reaction) */
  private pendingReaction: { emoji: string; targetMessageId: string } | null = null;

  /** Componentes coletados durante harvest */
  private harvestedComponents: HarvestedComponents = { texts: [] };

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

  // ---------------------------------------------------------------------------
  // Harvest Components (para combinar múltiplos itens no sync)
  // ---------------------------------------------------------------------------

  /**
   * Define o message_id de contexto (wamid do botão clicado).
   * Usado como fallback quando não há REACTION para fornecer targetMessageId.
   */
  setContextMessageId(messageId: string): void {
    this.harvestedComponents.contextMessageId = messageId;
    log.debug('[SyncBridge] Context message_id definido', { messageId });
  }

  /**
   * Adiciona texto ao harvest.
   */
  addHarvestedText(text: string): void {
    this.harvestedComponents.texts.push(text);
    log.debug('[SyncBridge] Texto adicionado ao harvest', {
      textPreview: text.slice(0, 50),
      totalTexts: this.harvestedComponents.texts.length,
    });
  }

  /**
   * Define o emoji do harvest.
   */
  setHarvestedEmoji(emoji: string, targetMessageId: string): void {
    this.harvestedComponents.emoji = emoji;
    this.harvestedComponents.targetMessageId = targetMessageId;
    log.debug('[SyncBridge] Emoji adicionado ao harvest', { emoji });
  }

  /**
   * Define a mensagem interativa do harvest.
   */
  setHarvestedInteractive(payload: Record<string, unknown>): void {
    this.harvestedComponents.interactive = payload;
    log.debug('[SyncBridge] Interactive adicionado ao harvest');
  }

  /**
   * Tem conteúdo harvested pendente?
   */
  hasHarvestedContent(): boolean {
    return (
      this.harvestedComponents.texts.length > 0 ||
      !!this.harvestedComponents.emoji ||
      !!this.harvestedComponents.interactive
    );
  }

  /**
   * Constrói e retorna o payload sync combinado (formato legado button_reaction).
   * Combina: emoji + textos + interactive em um único JSON.
   *
   * Formato de saída:
   * {
   *   action_type: 'button_reaction',
   *   emoji: '❤️',
   *   text: 'texto combinado',
   *   whatsapp: { message_id, reaction_emoji, response_text },
   *   mapped: { whatsapp: { type: 'interactive', interactive: {...} } }
   * }
   */
  buildCombinedPayload(channel: string): SynchronousResponse | null {
    if (!this.hasHarvestedContent() && !this.pendingReaction) {
      return null;
    }

    // Usar pending reaction se não tiver harvested emoji
    const emoji = this.harvestedComponents.emoji ?? this.pendingReaction?.emoji;
    const targetMessageId = this.harvestedComponents.targetMessageId
      ?? this.pendingReaction?.targetMessageId
      ?? this.harvestedComponents.contextMessageId;

    // Combinar todos os textos
    const combinedText = this.harvestedComponents.texts.join('\n\n');

    // Sem nada para enviar?
    if (!emoji && !combinedText && !this.harvestedComponents.interactive) {
      return null;
    }

    // Construir payload base
    const payload: Record<string, unknown> = {
      action_type: 'button_reaction',
    };

    if (emoji) payload.emoji = emoji;
    if (combinedText) payload.text = combinedText;

    // Construir channel payload (whatsapp/instagram/facebook)
    const channelPayload: Record<string, unknown> = {};
    if (targetMessageId) channelPayload.message_id = targetMessageId;
    if (emoji) channelPayload.reaction_emoji = emoji;
    if (combinedText) channelPayload.response_text = combinedText;

    if (Object.keys(channelPayload).length > 0) {
      const channelKey = channel === 'instagram' ? 'instagram'
        : channel === 'facebook' ? 'facebook'
        : 'whatsapp';
      payload[channelKey] = channelPayload;
    }

    // Adicionar interactive se existir (no formato mapped)
    if (this.harvestedComponents.interactive) {
      const channelKey = channel === 'instagram' ? 'instagram'
        : channel === 'facebook' ? 'facebook'
        : 'whatsapp';

      payload.mapped = {
        [channelKey]: {
          type: 'interactive',
          interactive: this.harvestedComponents.interactive,
        },
      };
    }

    log.debug('[SyncBridge] Payload combinado construído', {
      hasEmoji: !!emoji,
      hasText: !!combinedText,
      hasInteractive: !!this.harvestedComponents.interactive,
    });

    // Limpar harvest após construir
    this.clearHarvest();

    return payload as SynchronousResponse;
  }

  /**
   * Limpa os componentes harvested.
   */
  clearHarvest(): void {
    this.harvestedComponents = { texts: [] };
    this.pendingReaction = null;
  }
}
