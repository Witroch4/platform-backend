export interface Inbox {
  id: string;
  name: string;
  channel_type: string;
}

export interface AgenteDialogflow {
  id: string;
  nome: string;
  projectId: string;
  region: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaixaEntrada {
  id: string;
  nome: string;
  chatwitAccountId: string;
  inboxId: string;
  inboxName: string;
  channelType: string;
  agentes: AgenteDialogflow[];
  createdAt: string;
  updatedAt: string;
}
