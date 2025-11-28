/**
 * Sanitização e normalização de payload bruto do webhook Chatwit
 * Elimina dependência do n8n para transformação de dados
 */

export interface SanitizedArquivo {
  file_type: string;
  data_url: string;
  chatwitFileId: number;
}

export interface SanitizedChatwitPayload {
  usuario: {
    account: { id: string; name: string };
    inbox: { id: string; name: string };
    channel: string;
    CHATWIT_ACCESS_TOKEN: string;
  };
  origemLead: {
    source_id: string;
    name: string;
    phone_number: string;
    thumbnail: string;
    leadUrl: string;
    arquivos: SanitizedArquivo[];
  };
}

export type SanitizedOrigemLead = SanitizedChatwitPayload['origemLead'];

/**
 * Extrai arquivos do histórico de mensagens E dos attachments raiz com deduplicação inteligente
 * Processa DUAS fontes:
 * 1. conversation.messages[].attachments (histórico da conversa)
 * 2. body.attachments (arquivo atual/raiz do payload)
 *
 * Deduplica por chatwitFileId (attachment.id)
 */
function extractAndDeduplicateArquivos(conversation: any, rootAttachments: any[] = []): SanitizedArquivo[] {
  const arquivosMap = new Map<number, SanitizedArquivo>();

  // ===== FONTE 1: Attachments do histórico de mensagens =====
  const messages = conversation?.messages || [];

  console.log(`[extractAndDeduplicateArquivos] Total de mensagens no histórico: ${messages.length}`);

  messages.forEach((msg: any, msgIndex: number) => {
    const attachments = msg.attachments || [];

    attachments.forEach((att: any, attIndex: number) => {
      // Log de cada attachment encontrado
      const isNew = !arquivosMap.has(att.id);
      console.log(`[extractAndDeduplicateArquivos] Mensagem ${msgIndex + 1}, Attachment ${attIndex + 1}:`, {
        chatwitFileId: att.id,
        fileType: att.file_type || 'file',
        dataUrl: att.data_url ? att.data_url.substring(0, 80) + (att.data_url.length > 80 ? '...' : '') : 'SEM URL',
        isNovo: isNew,
        jaExistia: !isNew,
      });

      // Usar att.id como chave única (chatwitFileId)
      if (att.id && !arquivosMap.has(att.id)) {
        arquivosMap.set(att.id, {
          file_type: att.file_type || 'file',
          data_url: att.data_url || '',
          chatwitFileId: att.id
        });
      }
    });
  });

  // ===== FONTE 2: Attachments raiz (arquivo atual do payload) =====
  console.log(`[extractAndDeduplicateArquivos] Total de attachments raiz (payload atual): ${rootAttachments.length}`);

  rootAttachments.forEach((att: any, attIndex: number) => {
    const isNew = !arquivosMap.has(att.id);
    console.log(`[extractAndDeduplicateArquivos] Root Attachment ${attIndex + 1}:`, {
      chatwitFileId: att.id,
      fileType: att.file_type || 'file',
      dataUrl: att.data_url ? att.data_url.substring(0, 80) + (att.data_url.length > 80 ? '...' : '') : 'SEM URL',
      isNovo: isNew,
      jaExistia: !isNew,
    });

    // Usar att.id como chave única (chatwitFileId)
    if (att.id && !arquivosMap.has(att.id)) {
      arquivosMap.set(att.id, {
        file_type: att.file_type || 'file',
        data_url: att.data_url || '',
        chatwitFileId: att.id
      });
    }
  });

  console.log(`[extractAndDeduplicateArquivos] Total de arquivos únicos após deduplicação (histórico + raiz): ${arquivosMap.size}`);

  return Array.from(arquivosMap.values());
}

/**
 * Sanitiza payload bruto do webhook Chatwit
 * Recebe array, extrai primeiro item, normaliza e deduplica
 *
 * @param rawPayload - Array ou objeto com dados brutos do webhook
 * @returns Payload sanitizado e normalizado
 * @throws Error se dados críticos forem ausentes
 */
export function sanitizeChatwitPayload(rawPayload: any): SanitizedChatwitPayload {
  // 1. Extrair primeiro item se for array
  const item = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;

  if (!item) {
    throw new Error('Payload vazio ou inválido');
  }

  // 2. Extrair body (pode estar em item.body ou diretamente em item)
  const body = item.body || item;

  if (!body) {
    throw new Error('Campo body não encontrado no payload');
  }

  // 3. Validar dados críticos
  if (!body.account?.id || !body.account?.name) {
    throw new Error('Dados da account ausentes');
  }

  if (!body.inbox?.id || !body.inbox?.name) {
    throw new Error('Dados do inbox ausentes');
  }

  if (!body.conversation?.id) {
    throw new Error('ID da conversa ausente');
  }

  if (!body.ACCESS_TOKEN) {
    throw new Error('ACCESS_TOKEN ausente');
  }

  // 4. Extrair informações do sender (contato/lead)
  const sender = body.sender || body.conversation?.meta?.sender || {};

  // 5. Extrair contact_id (pode estar em body.contact_id ou body.sender.id)
  const contactId = body.contact_id || sender.id;

  if (!contactId) {
    throw new Error('ID do contato ausente');
  }

  // 6. Montar leadUrl dinamicamente
  const leadUrl = `https://chatwit.witdev.com.br/app/accounts/${body.account.id}/conversations/${body.conversation.id}`;

  // 7. Extrair e deduplicar arquivos (histórico + attachments raiz)
  const rootAttachments = body.attachments || [];
  const arquivos = extractAndDeduplicateArquivos(body.conversation, rootAttachments);

  // 8. Montar payload sanitizado
  const sanitized: SanitizedChatwitPayload = {
    usuario: {
      account: {
        id: String(body.account.id),
        name: body.account.name
      },
      inbox: {
        id: String(body.inbox.id),
        name: body.inbox.name
      },
      channel: body.channel_type?.replace('Channel::', '').toLowerCase() || 'whatsapp',
      CHATWIT_ACCESS_TOKEN: body.ACCESS_TOKEN
    },
    origemLead: {
      source_id: String(contactId),
      name: sender.name || 'Lead sem nome',
      phone_number: sender.phone_number || '',
      thumbnail: sender.thumbnail || '',
      leadUrl,
      arquivos
    }
  };

  // 9. Log de debug
  console.log(`[sanitizeChatwitPayload] Payload sanitizado:`, {
    accountId: sanitized.usuario.account.id,
    inboxId: sanitized.usuario.inbox.id,
    contactId: sanitized.origemLead.source_id,
    arquivosCount: arquivos.length,
    arquivosIds: arquivos.map(a => a.chatwitFileId)
  });

  return sanitized;
}
