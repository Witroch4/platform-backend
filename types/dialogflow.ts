// Tipos compartilhados para Dialogflow - baseados no schema Prisma atual

export interface AgenteDialogflow {
  id: string;
  nome: string;
  projectId: string;
  credentials: string;
  region: string;
  hookId: string | null;
  ativo: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  usuarioChatwitId: string;
  inboxId: string;
}

export interface AssistenteCaptiao {
  id: string;
  linkId: string | null;    // null se não conectado
  nome: string;
  ativo: boolean;           // se o link está ativo
  conectado: boolean;       // se há um link (mesmo que inativo)
  model: string;
  description?: string | null;
  tipo: 'capitao';
}

export interface ChatwitInbox {
  id: string;
  nome: string;
  inboxId: string;
  channelType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  usuarioChatwitId: string;
  whatsappApiKey: string | null;
  phoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  fallbackParaInboxId: string | null;
  agentes?: AgenteDialogflow[];
  assistentes?: AssistenteCaptiao[];
}

// Tipos para APIs
export interface CriarCaixaRequest {
  nome: string;
  accountId: string;
  inboxId: string;
  inboxName: string; // Usado apenas para logs, não salvo no banco
  channelType: string;
}

export interface CriarAgenteRequest {
  nome: string;
  projectId: string;
  credentials: string;
  region: string;
  inboxId: string;
}

export interface AtualizarAgenteRequest {
  id: string;
  nome?: string;
  projectId?: string;
  credentials?: string;
  region?: string;
}

// Tipos para respostas da API
export interface ListarCaixasResponse {
  caixas: ChatwitInbox[];
}

export interface InboxExterna {
  id: string;
  name: string;
  channel_type: string;
  account_id: string;
}

export interface ListarInboxesResponse {
  inboxes: InboxExterna[];
}

// Regiões disponíveis do Dialogflow
export const DIALOGFLOW_REGIONS = [
  { value: 'global', label: 'Global - Default' },
  { value: 'asia-northeast1', label: 'AS-NE1 - Tokyo, Japan' },
  { value: 'australia-southeast1', label: 'AU-SE1 - Sydney, Australia' },
  { value: 'europe-west1', label: 'EU-W1 - St. Ghislain, Belgium' },
  { value: 'europe-west2', label: 'EU-W2 - London, England' },
  { value: 'us-central1', label: 'US-C1 - Iowa, USA' },
  { value: 'us-east1', label: 'US-E1 - South Carolina, USA' },
  { value: 'us-west1', label: 'US-W1 - Oregon, USA' },
] as const;

export type DialogflowRegion = typeof DIALOGFLOW_REGIONS[number]['value'];