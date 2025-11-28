// types/webhook.ts

/**
 * Dados do usuário vindos do Chatwit
 */
export interface Usuario {
  inbox: {
    id: string;
    name: string;
  };
  account: {
    id: string;
    name: string;
  };
  channel: string;
  CHATWIT_ACCESS_TOKEN: string;
}

/**
 * Dados da origem do lead (lead information)
 */
export interface OrigemLead {
  source_id: string;
  name: string;
  phone_number: string;
  thumbnail: string;
  leadUrl: string;
  arquivos: Array<{
    file_type: string;
    data_url: string;
    chatwitFileId: number; // ID único do arquivo no Chatwit para deduplicação
  }>;
}

/**
 * Payload completo do webhook Chatwit (após sanitização)
 */
export interface WebhookPayload {
  usuario: Usuario;
  origemLead: OrigemLead;
}
