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
 * Extrai arquivos do histórico de mensagens com deduplicação inteligente
 * Itera sobre TODAS as mensagens da conversa e deduplica por chatwitFileId (attachment.id)
 */
function extractAndDeduplicateArquivos(conversation: any): SanitizedArquivo[] {
  const arquivosMap = new Map<number, SanitizedArquivo>();

  // Iterar sobre todas as mensagens do histórico
  const messages = conversation?.messages || [];

  messages.forEach((msg: any) => {
    const attachments = msg.attachments || [];

    attachments.forEach((att: any) => {
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

  // 7. Extrair e deduplicar arquivos
  const arquivos = extractAndDeduplicateArquivos(body.conversation);

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
