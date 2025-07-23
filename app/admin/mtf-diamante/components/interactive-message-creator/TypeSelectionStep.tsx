import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  MousePointer, 
  List, 
  ExternalLink, 
  Workflow, 
  MapPin, 
  Navigation, 
  Smile, 
  Image as ImageIcon,
  Check,
  ChevronRight,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InteractiveMessageType } from './types';

interface TypeSelectionStepProps {
  selectedType: InteractiveMessageType;
  onTypeSelect: (type: InteractiveMessageType) => void;
}

interface MessageTypeConfig {
  id: InteractiveMessageType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
  examples: string[];
  complexity: 'Simples' | 'Médio' | 'Avançado';
  recommended?: boolean;
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
    recommended: true,
  },
  {
    id: 'list',
    label: 'Lista de Opções',
    description: 'Menu organizado com múltiplas seções e opções',
    icon: List,
    features: ['Múltiplas seções', 'Até 10 itens por seção', 'Descrições detalhadas'],
    examples: ['Catálogo de produtos', 'Menu de serviços', 'Opções de entrega'],
    complexity: 'Médio',
    recommended: true,
  },
  {
    id: 'cta_url',
    label: 'Botão Call-to-Action',
    description: 'Botão que direciona para um link externo',
    icon: ExternalLink,
    features: ['Link externo', 'Rastreamento de cliques', 'Personalização de texto'],
    examples: ['Agendar consulta', 'Ver site', 'Baixar documento'],
    complexity: 'Simples',
  },
  {
    id: 'flow',
    label: 'Fluxo Interativo',
    description: 'Inicia um fluxo complexo do WhatsApp Business',
    icon: Workflow,
    features: ['Fluxos personalizados', 'Coleta de dados', 'Experiência rica'],
    examples: ['Agendamento completo', 'Cadastro de cliente', 'Pesquisa de satisfação'],
    complexity: 'Avançado',
  },
  {
    id: 'location',
    label: 'Enviar Localização',
    description: 'Envia uma localização específica para o usuário',
    icon: MapPin,
    features: ['Coordenadas GPS', 'Nome do local', 'Endereço completo'],
    examples: ['Localização do escritório', 'Ponto de encontro', 'Endereço de entrega'],
    complexity: 'Simples',
  },
  {
    id: 'location_request',
    label: 'Solicitar Localização',
    description: 'Solicita que o usuário compartilhe sua localização',
    icon: Navigation,
    features: ['Solicitação de GPS', 'Localização em tempo real', 'Fácil compartilhamento'],
    examples: ['Localização para entrega', 'Encontrar cliente', 'Serviço no local'],
    complexity: 'Simples',
  },
];

export const TypeSelectionStep: React.FC<TypeSelectionStepProps> = ({ 
  selectedType, 
  onTypeSelect 
}) => {
  const [showAllTypes, setShowAllTypes] = useState(false);

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

  const recommendedTypes = MESSAGE_TYPES.filter(type => type.recommended);
  const otherTypes = MESSAGE_TYPES.filter(type => !type.recommended);
  const typesToShow = showAllTypes ? MESSAGE_TYPES : recommendedTypes;

  const handleTypeSelect = (type: InteractiveMessageType) => {
    onTypeSelect(type);
  };

  const selectedTypeConfig = MESSAGE_TYPES.find(t => t.id === selectedType);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Escolher Tipo de Mensagem Interativa
          </CardTitle>
          <CardDescription>
            Selecione o tipo de mensagem que melhor atende às suas necessidades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Recommended Types Section */}
          {!showAllTypes && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-medium text-foreground">Tipos Recomendados</h3>
                <Badge variant="secondary" className="text-xs">
                  Mais Populares
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendedTypes.map((type) => (
                  <TypeCard
                    key={type.id}
                    type={type}
                    isSelected={selectedType === type.id}
                    onSelect={handleTypeSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Types Section */}
          {showAllTypes && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-4">Todos os Tipos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {MESSAGE_TYPES.map((type) => (
                  <TypeCard
                    key={type.id}
                    type={type}
                    isSelected={selectedType === type.id}
                    onSelect={handleTypeSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Toggle Button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowAllTypes(!showAllTypes)}
              className="flex items-center gap-2"
            >
              {showAllTypes ? 'Ver Apenas Recomendados' : 'Ver Todos os Tipos'}
              <ChevronRight className={cn(
                "h-4 w-4 transition-transform",
                showAllTypes && "rotate-90"
              )} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selected Type Summary */}
      {selectedTypeConfig && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="p-1 rounded bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </div>
              Tipo Selecionado: {selectedTypeConfig.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedTypeConfig.description}
              </p>
              
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getComplexityColor(selectedTypeConfig.complexity))}
                >
                  {selectedTypeConfig.complexity}
                </Badge>
                {selectedTypeConfig.recommended && (
                  <Badge variant="secondary" className="text-xs">
                    Recomendado
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Recursos:</h4>
                  <ul className="text-muted-foreground space-y-1">
                    {selectedTypeConfig.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-primary rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-foreground mb-2">Exemplos de uso:</h4>
                  <ul className="text-muted-foreground space-y-1">
                    {selectedTypeConfig.examples.slice(0, 3).map((example, index) => (
                      <li key={index} className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Você pode prosseguir para configurar os detalhes desta mensagem interativa no próximo passo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// TypeCard Component
interface TypeCardProps {
  type: MessageTypeConfig;
  isSelected: boolean;
  onSelect: (type: InteractiveMessageType) => void;
}

const TypeCard: React.FC<TypeCardProps> = ({ type, isSelected, onSelect }) => {
  const IconComponent = type.icon;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        isSelected && "ring-2 ring-primary border-primary bg-primary/5"
      )}
      onClick={() => onSelect(type.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg transition-colors",
              isSelected 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted text-muted-foreground"
            )}>
              <IconComponent className="h-4 w-4" />
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
            className={cn("text-xs", 
              type.complexity === 'Simples' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
              type.complexity === 'Médio' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
              type.complexity === 'Avançado' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            )}
          >
            {type.complexity}
          </Badge>
          {type.recommended && (
            <Badge variant="secondary" className="text-xs">
              Recomendado
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <CardDescription className="text-xs mb-3">
          {type.description}
        </CardDescription>

        <div className="space-y-2">
          <div>
            <h4 className="text-xs font-medium text-foreground mb-1">Principais recursos:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              {type.features.slice(0, 2).map((feature, index) => (
                <li key={index} className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-primary rounded-full" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Button
          variant={isSelected ? "default" : "outline"}
          size="sm"
          className="w-full mt-4"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(type.id);
          }}
        >
          {isSelected ? 'Selecionado' : 'Selecionar'}
        </Button>
      </CardContent>
    </Card>
  );
};
