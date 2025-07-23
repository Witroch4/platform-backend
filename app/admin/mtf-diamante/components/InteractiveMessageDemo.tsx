'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ExternalLink, 
  Workflow, 
  List, 
  MousePointer, 
  MapPin, 
  Navigation, 
  Smile, 
  Image as ImageIcon,
  CheckCircle,
  Play
} from 'lucide-react';
import { toast } from 'sonner';

// Exemplos de mensagens interativas para demonstração
const DEMO_MESSAGES = {
  button: {
    name: 'Menu Principal',
    type: 'button',
    body: { text: 'Olá! Como posso ajudá-lo hoje? Escolha uma das opções abaixo:' },
    header: { type: 'text', text: 'Bem-vindo ao Atendimento' },
    footer: { text: 'Estamos aqui para ajudar!' },
    action: {
      buttons: [
        { id: 'info', title: 'Informações' },
        { id: 'support', title: 'Suporte' },
        { id: 'schedule', title: 'Agendar' }
      ]
    }
  },
  cta_url: {
    name: 'Agendar Consulta',
    type: 'cta_url',
    body: { text: 'Agende sua consulta jurídica online de forma rápida e segura.' },
    header: { type: 'image', media_url: 'https://via.placeholder.com/400x200/0066cc/ffffff?text=Agendamento' },
    footer: { text: 'Disponível 24/7' },
    action: {
      name: 'cta_url',
      parameters: {
        display_text: 'Agendar Agora',
        url: 'https://exemplo.com/agendar'
      }
    }
  },
  list: {
    name: 'Serviços Jurídicos',
    type: 'list',
    body: { text: 'Escolha o serviço jurídico que precisa:' },
    header: { type: 'text', text: 'Nossos Serviços' },
    footer: { text: 'Consultoria especializada' },
    action: {
      button: 'Ver Serviços',
      sections: [
        {
          title: 'Direito Civil',
          rows: [
            { id: 'civil_contract', title: 'Contratos', description: 'Elaboração e revisão' },
            { id: 'civil_family', title: 'Direito de Família', description: 'Divórcio, pensão, guarda' }
          ]
        },
        {
          title: 'Direito Empresarial',
          rows: [
            { id: 'business_formation', title: 'Abertura de Empresa', description: 'CNPJ e licenças' },
            { id: 'business_contracts', title: 'Contratos Comerciais', description: 'B2B e fornecedores' }
          ]
        }
      ]
    }
  },
  flow: {
    name: 'Agendamento Completo',
    type: 'flow',
    body: { text: 'Vamos agendar sua consulta de forma personalizada.' },
    header: { type: 'text', text: 'Agendamento Personalizado' },
    footer: { text: 'Processo rápido e seguro' },
    action: {
      flow_parameters: {
        flow_message_version: '3',
        flow_token: 'DEMO_TOKEN',
        flow_id: 'DEMO_FLOW_ID',
        flow_cta: 'Iniciar Agendamento',
        flow_action: 'navigate',
        flow_action_payload: {
          screen: 'APPOINTMENT_SCREEN',
          data: {
            service_type: 'consultation',
            duration: 60
          }
        }
      }
    }
  },
  location: {
    name: 'Localização do Escritório',
    type: 'location',
    body: { text: 'Nosso escritório fica localizado no centro da cidade.' },
    location: {
      latitude: '-23.5505',
      longitude: '-46.6333',
      name: 'Escritório Jurídico Silva & Associados',
      address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100'
    }
  },
  location_request: {
    name: 'Solicitar Localização',
    type: 'location_request',
    body: { text: 'Para melhor atendê-lo, compartilhe sua localização para encontrarmos o escritório mais próximo.' },
    action: {
      location_action: 'send_location'
    }
  },
  reaction: {
    name: 'Reação de Confirmação',
    type: 'reaction',
    body: { text: 'Esta é uma reação automática para confirmar recebimento.' },
    reaction: {
      message_id: 'wamid.demo_message_id',
      emoji: '✅'
    }
  },
  sticker: {
    name: 'Sticker de Boas-vindas',
    type: 'sticker',
    body: { text: 'Enviando sticker de boas-vindas...' },
    sticker: {
      id: 'DEMO_STICKER_ID',
      url: 'https://via.placeholder.com/200x200/00ff00/ffffff?text=👋'
    }
  }
};

const InteractiveMessageDemo: React.FC = () => {
  const [selectedDemo, setSelectedDemo] = useState<keyof typeof DEMO_MESSAGES>('button');
  const [isSimulating, setIsSimulating] = useState(false);

  const simulateSend = async (messageType: keyof typeof DEMO_MESSAGES) => {
    setIsSimulating(true);
    
    // Simular envio
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast.success(`Mensagem ${DEMO_MESSAGES[messageType].name} enviada com sucesso!`, {
      description: `Tipo: ${messageType.toUpperCase()}`
    });
    
    setIsSimulating(false);
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      button: MousePointer,
      cta_url: ExternalLink,
      list: List,
      flow: Workflow,
      location: MapPin,
      location_request: Navigation,
      reaction: Smile,
      sticker: ImageIcon
    };
    return icons[type as keyof typeof icons] || MousePointer;
  };

  const getTypeColor = (type: string) => {
    const colors = {
      button: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      cta_url: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      list: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      flow: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      location: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      location_request: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      reaction: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
      sticker: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Sistema de Mensagens Interativas - Demonstração
          </CardTitle>
          <CardDescription>
            Demonstração completa de todos os tipos de mensagens interativas implementadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            {Object.entries(DEMO_MESSAGES).map(([key, message]) => {
              const IconComponent = getTypeIcon(key);
              return (
                <Button
                  key={key}
                  variant={selectedDemo === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDemo(key as keyof typeof DEMO_MESSAGES)}
                  className="flex items-center gap-2 h-auto p-3"
                >
                  <IconComponent className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium text-xs">{message.name}</div>
                    <div className="text-xs opacity-70">{key.toUpperCase()}</div>
                  </div>
                </Button>
              );
            })}
          </div>

          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preview">Visualização</TabsTrigger>
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="api">Payload API</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={getTypeColor(selectedDemo)}>
                    {selectedDemo.toUpperCase()}
                  </Badge>
                  <span className="font-medium">{DEMO_MESSAGES[selectedDemo].name}</span>
                </div>
                <Button
                  onClick={() => simulateSend(selectedDemo)}
                  disabled={isSimulating}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  {isSimulating ? 'Enviando...' : 'Simular Envio'}
                </Button>
              </div>

              {/* WhatsApp Preview */}
              <div className="flex justify-center">
                <div 
                  className="whatsapp-preview rounded-lg p-4 max-w-sm w-full bg-cover bg-center bg-no-repeat min-h-[300px] relative"
                  style={{
                    backgroundImage: "url('/fundo_whatsapp.jpg')"
                  }}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-md border border-gray-200 dark:border-gray-700">
                    {/* Header */}
                    {DEMO_MESSAGES[selectedDemo].header && (
                      <div className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">
                        {DEMO_MESSAGES[selectedDemo].header?.type === 'text' 
                          ? DEMO_MESSAGES[selectedDemo].header?.text
                          : '📷 Imagem'
                        }
                      </div>
                    )}

                    {/* Body */}
                    <div className="text-sm mb-2 text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {DEMO_MESSAGES[selectedDemo].body.text}
                    </div>

                    {/* Footer */}
                    {DEMO_MESSAGES[selectedDemo].footer && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {DEMO_MESSAGES[selectedDemo].footer.text}
                      </div>
                    )}

                    {/* Action Buttons */}
                    {selectedDemo === 'button' && (
                      <div className="mt-3 space-y-1">
                        {DEMO_MESSAGES.button.action.buttons.map((button, index) => (
                          <button
                            key={index}
                            className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          >
                            {button.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedDemo === 'cta_url' && (
                      <div className="mt-3">
                        <button className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          🔗 {DEMO_MESSAGES.cta_url.action.parameters.display_text}
                        </button>
                      </div>
                    )}

                    {selectedDemo === 'list' && (
                      <div className="mt-3">
                        <button className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          📋 {DEMO_MESSAGES.list.action.button}
                        </button>
                      </div>
                    )}

                    {selectedDemo === 'flow' && (
                      <div className="mt-3">
                        <button className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          🔄 {DEMO_MESSAGES.flow.action.flow_parameters?.flow_cta}
                        </button>
                      </div>
                    )}

                    {selectedDemo === 'location' && (
                      <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-red-500" />
                          <div>
                            <div className="font-medium">{DEMO_MESSAGES.location.location?.name}</div>
                            <div className="text-xs text-gray-500">{DEMO_MESSAGES.location.location?.address}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDemo === 'location_request' && (
                      <div className="mt-3">
                        <button className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          📍 Compartilhar Localização
                        </button>
                      </div>
                    )}

                    {selectedDemo === 'reaction' && (
                      <div className="mt-3 text-center">
                        <div className="inline-flex items-center gap-2 text-2xl">
                          {DEMO_MESSAGES.reaction.reaction?.emoji}
                          <span className="text-sm text-gray-500">Reação enviada</span>
                        </div>
                      </div>
                    )}

                    {selectedDemo === 'sticker' && (
                      <div className="mt-3 text-center">
                        <div className="inline-block p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                          <div className="text-4xl">👋</div>
                          <div className="text-xs text-gray-500 mt-1">Sticker</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuração da Mensagem</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-[400px]">
                    {JSON.stringify(DEMO_MESSAGES[selectedDemo], null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="api" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Payload para WhatsApp API</CardTitle>
                  <CardDescription>
                    Exemplo de como esta mensagem seria enviada para a API do WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-[400px]">
{`{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5511999999999",
  "type": "${selectedDemo === 'location' ? 'location' : selectedDemo === 'reaction' ? 'reaction' : selectedDemo === 'sticker' ? 'sticker' : 'interactive'}",
  ${selectedDemo === 'location' ? `"location": ${JSON.stringify(DEMO_MESSAGES.location.location, null, 2)}` :
    selectedDemo === 'reaction' ? `"reaction": ${JSON.stringify(DEMO_MESSAGES.reaction.reaction, null, 2)}` :
    selectedDemo === 'sticker' ? `"sticker": ${JSON.stringify(DEMO_MESSAGES.sticker.sticker, null, 2)}` :
    `"interactive": {
    "type": "${selectedDemo}",
    ${DEMO_MESSAGES[selectedDemo].header ? `"header": ${JSON.stringify(DEMO_MESSAGES[selectedDemo].header, null, 2)},` : ''}
    "body": ${JSON.stringify(DEMO_MESSAGES[selectedDemo].body, null, 2)},
    ${DEMO_MESSAGES[selectedDemo].footer ? `"footer": ${JSON.stringify(DEMO_MESSAGES[selectedDemo].footer, null, 2)},` : ''}
    "action": ${JSON.stringify(DEMO_MESSAGES[selectedDemo].action, null, 2)}
  }`}
}`}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Resumo das funcionalidades implementadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Funcionalidades Implementadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">✅ Tipos de Mensagem Suportados:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Botões de Resposta Rápida</li>
                <li>• Call-to-Action com URL</li>
                <li>• Listas de Opções</li>
                <li>• Fluxos Interativos</li>
                <li>• Localização</li>
                <li>• Solicitação de Localização</li>
                <li>• Reações</li>
                <li>• Stickers/Figurinhas</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">✅ Recursos Implementados:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Interface unificada com templates</li>
                <li>• Sistema de variáveis compartilhado</li>
                <li>• Upload de mídia com MinIO</li>
                <li>• Preview em tempo real</li>
                <li>• Biblioteca compartilhada</li>
                <li>• Suporte completo ao dark mode</li>
                <li>• APIs para envio via WhatsApp</li>
                <li>• Validação e tratamento de erros</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InteractiveMessageDemo;