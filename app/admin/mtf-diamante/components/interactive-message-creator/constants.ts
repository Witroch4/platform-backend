import {
  ExternalLink,
  Workflow,
  List,
  MousePointer,
  MapPin,
  Navigation,
  Smile,
  ImageIcon,
} from "lucide-react";

export const MESSAGE_TYPES = {
  cta_url: {
    label: "Call-to-Action URL",
    icon: ExternalLink,
    description: "Botão que abre um link externo",
  },
  flow: {
    label: "Fluxo Interativo",
    icon: Workflow,
    description: "Inicia um fluxo de WhatsApp Business",
  },
  list: {
    label: "Lista de Opções",
    icon: List,
    description: "Menu com múltiplas opções organizadas",
  },
  button: {
    label: "Botões de Resposta",
    icon: MousePointer,
    description: "Botões de resposta rápida",
  },
  location: {
    label: "Localização",
    icon: MapPin,
    description: "Envia uma localização específica",
  },
  location_request: {
    label: "Solicitar Localização",
    icon: Navigation,
    description: "Solicita localização do usuário",
  },
  reaction: {
    label: "Reação",
    icon: Smile,
    description: "Reação a uma mensagem anterior",
  },
  sticker: {
    label: "Sticker",
    icon: ImageIcon,
    description: "Envia um sticker/figurinha",
  },
};
