
// ============================================================================
// INTERFACES
// ============================================================================

export interface WorkerResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  processingTime: number;
  correlationId: string;
}

export interface WhatsAppCredentials {
  token: string;
  phoneNumberId: string;
  businessId: string;
}

export interface TemplateMapping {
  id: string;
  customVariables?: any; // Variáveis customizadas do mapeamento
  template: {
    id: string;
    name: string;
    type: "WHATSAPP_OFFICIAL" | "INTERACTIVE_MESSAGE" | "AUTOMATION_REPLY";
    simpleReplyText?: string;
    interactiveContent?: any;
    whatsappOfficialInfo?: any;
  };
}

export interface ButtonActionMapping {
  id: string;
  buttonId: string;
  actionType: "SEND_TEMPLATE" | "ADD_TAG" | "START_FLOW" | "ASSIGN_TO_AGENT";
  actionPayload: any;
}
