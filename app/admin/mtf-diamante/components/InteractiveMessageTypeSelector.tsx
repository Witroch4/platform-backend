'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ExternalLink, 
  Workflow, 
  List, 
  MousePointer, 
  MapPin, 
  Navigation, 
  Smile, 
  Image as ImageIcon,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InteractiveMessageType } from './InteractiveMessageCreator';

interface MessageTypeConfig {
  id: InteractiveMessageType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
  examples: string[];
  complexity: 'Simples' | 'Médio' | 'Avançado';
  whatsappApiExample: string;
}

const MESSAGE_TYPES: MessageTypeConfig[] = [
  {
    id: 'button',
    label: 'Botões de Resposta Rápida',
    description: 'Botões simples para respostas rápidas do usuário',
    icon: MousePointer,
    features: ['Até 3 botões', 'Respostas instantâneas', 'Fácil de usar'],
    examples: ['Menu principal', 'Confirmação de agendamento', 'Opções de atendimento'],
    complexity: 'Simples',
    whatsappApiExample: `{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Como posso ajudar?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "info", "title": "Informações" } },
        { "type": "reply", "reply": { "id": "support", "title": "Suporte" } }
      ]
    }
  }
}`
  },
  {
    id: 'list',
    label: 'Lista de Opções',
    description: 'Menu organizado com múltiplas seções e opções',
    icon: List,
    features: ['Múltiplas seções', 'Até 10 itens por seção', 'Descrições detalhadas'],
    examples: ['Catálogo de produtos', 'Menu de serviços', 'Opções de entrega'],
    complexity: 'Médio',
    whatsappApiExample: `{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Escolha uma opção:" },
    "action": {
      "button": "Ver Opções",
      "sections": [
        {
          "title": "Serviços",
          "rows": [
            { "id": "service1", "title": "Consultoria", "description": "Consultoria jurídica" }
          ]
        }
      ]
    }
  }
}`
  },
  {
    id: 'cta_url',
    label: 'Botão Call-to-Action com URL',
    description: 'Botão que direciona para um link externo',
    icon: ExternalLink,
    features: ['Link externo', 'Rastreamento de cliques', 'Personalização de texto'],
    examples: ['Agendar consulta', 'Ver site', 'Baixar documento'],
    complexity: 'Simples',
    whatsappApiExample: `{
  "type": "interactive",
  "interactive": {
    "type": "cta_url",
    "body": { "text": "Acesse nosso site para mais informações" },
    "action": {
      "name": "cta_url",
      "parameters": {
        "display_text": "Acessar Site",
        "url": "https://exemplo.com"
      }
    }
  }
}`
  },
  {
    id: 'flow',
    label: 'Fluxo Interativo',
    description: 'Inicia um fluxo complexo do WhatsApp Business',
    icon: Workflow,
    features: ['Fluxos personalizados', 'Coleta de dados', 'Experiência rica'],
    examples: ['Agendamento completo', 'Cadastro de cliente', 'Pesquisa de satisfação'],
    complexity: 'Avançado',
    whatsappApiExample: `{
  "type": "interactive",
  "interactive": {
    "type": "flow",
    "body": { "text": "Vamos agendar sua consulta" },
    "action": {
      "name": "flow",
      "parameters": {
        "flow_id": "YOUR_FLOW_ID",
        "flow_cta": "Iniciar Agendamento"
      }
    }
  }
}`
  },
  {
    id: 'location',
    label: 'Localização',
    description: 'Envia uma localização específica para o usuário',
    icon: MapPin,
    features: ['Coordenadas GPS', 'Nome do local', 'Endereço completo'],
    examples: ['Localização do escritório', 'Ponto de encontro', 'Endereço de entrega'],
    complexity: 'Simples',
    whatsappApiExample: `{
  "type": "location",
  "location": {
    "latitude": "-23.5505",
    "longitude": "-46.6333",
    "name": "Escritório Central",
    "address": "Av. Paulista, 1000 - São Paulo, SP"
  }
}`
  },
  {
    id: 'location_request',
    label: 'Solicitar Localização',
    description: 'Solicita que o usuário compartilhe sua localização',
    icon: Navigation,
    features: ['Solicitação de GPS', 'Localização em tempo real', 'Fácil compartilhamento'],
    examples: ['Localização para entrega', 'Encontrar cliente', 'Serviço no local'],
    complexity: 'Simples',
    whatsappApiExample: `{
  "type": "interactive",
  "interactive": {
    "type": "location_request_message",
    "body": { "text": "Compartilhe sua localização para continuarmos" },
    "action": { "name": "send_location" }
  }
}`
  },
  {
    id: 'reaction',
    label: 'Reação',
    description: 'Reage a uma mensagem anterior com emoji',
    icon: Smile,
    features: ['Emojis diversos', 'Resposta rápida', 'Feedback instantâneo'],
    examples: ['Confirmação com ❤️', 'Aprovação com 👍', 'Celebração com 🎉'],
    complexity: 'Simples',
    whatsappApiExample: `{
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.xxx",
    "emoji": "❤️"
  }
}`
  },
  {
    id: 'sticker',
    label: 'Sticker/Figurinha',
    description: 'Envia um sticker ou figurinha personalizada',
    icon: ImageIcon,
    features: ['Stickers personalizados', 'Expressão visual', 'Engajamento alto'],
    examples: ['Sticker de boas-vindas', 'Figurinha de agradecimento', 'Emoji personalizado'],
    complexity: 'Médio',
    whatsappApiExample: `{
  "type": "sticker",
  "sticker": {
    "id": "YOUR_STICKER_MEDIA_ID"
  }
}`
  }
];

interface InteractiveMessageTypeSelectorProps {
  selectedType?: InteractiveMessageType;
  onTypeSelect: (type: InteractiveMessageType) => void;
  showExamples?: boolean;
}

export const InteractiveMessageTypeSelector: React.FC<InteractiveMessageTypeSelectorProps> = ({
  selectedType,
  onTypeSelect,
  showExamples = false
}) => {
  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'Simples':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Médio':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Avançado':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Escolha o Tipo de Mensagem Interativa
        </h3>
        <p className="text-sm text-muted-foreground">
          Selecione o tipo de mensagem que melhor atende às suas necessidades
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MESSAGE_TYPES.map((type) => {
          const IconComponent = type.icon;
          const isSelected = selectedType === type.id;

          return (
            <Card
              key={type.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary"
              )}
              onClick={() => onTypeSelect(type.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium text-foreground">
                        {type.label}
                      </CardTitle>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="p-1 rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-2">
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getComplexityColor(type.complexity))}
                  >
                    {type.complexity}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <CardDescription className="text-xs mb-3">
                  {type.description}
                </CardDescription>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-medium text-foreground mb-1">Recursos:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {type.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-1">
                          <div className="w-1 h-1 bg-primary rounded-full" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {showExamples && (
                    <div>
                      <h4 className="text-xs font-medium text-foreground mb-1">Exemplos de uso:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {type.examples.slice(0, 2).map((example, index) => (
                          <li key={index} className="flex items-center gap-1">
                            <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                            {example}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="w-full mt-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTypeSelect(type.id);
                  }}
                >
                  {isSelected ? 'Selecionado' : 'Selecionar'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedType && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="p-1 rounded bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </div>
              Tipo Selecionado: {MESSAGE_TYPES.find(t => t.id === selectedType)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              <p className="mb-2">
                {MESSAGE_TYPES.find(t => t.id === selectedType)?.description}
              </p>
              <p>
                Você pode prosseguir para configurar os detalhes desta mensagem interativa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InteractiveMessageTypeSelector;