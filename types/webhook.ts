// types/webhook.ts

/**
 * Dados do usuário vindos do Chatwit
 */
export interface Usuario {
    inbox: {
      id: number;
      name: string;
    };
    account: {
      id: number;
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
    arquivos: Array<{
      file_type: string;
      data_url: string;
    }>;
    leadUrl: string;
  }
  
  /**
 * Payload completo do webhook Chatwit
 */
export interface WebhookPayload {
  usuario: Usuario;
  origemLead: OrigemLead;
}
  