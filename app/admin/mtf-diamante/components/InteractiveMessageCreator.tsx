"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Plus,
  Trash2,
  Eye,
  Save,
  MapPin,
  Phone,
  ExternalLink,
  List,
  Workflow,
  MousePointer,
  Navigation,
  Smile,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { EnhancedTextArea } from "./EnhancedTextArea";
import { TemplatePreview } from "./TemplatesTab/components/template-preview";
import { useVariableManager } from "../hooks/useVariableManager";
import { TemplateLibraryService } from "@/app/lib/template-library-service";
import { useSession } from "next-auth/react";
import MinIOMediaUpload, {
  type MinIOMediaFile,
} from "./shared/MinIOMediaUpload";
import { InteractiveMessageTypeSelector } from "./InteractiveMessageTypeSelector";
import { ButtonReactionConfig } from "./shared/ButtonReactionConfig";
import { useButtonReactions } from "../hooks/useButtonReactions";
import { ButtonEmojiMapper } from "./shared/ButtonEmojiMapper";
import { InteractivePreview } from "./shared/InteractivePreview";
import { SaveToLibraryButton } from "./shared/SaveToLibraryButton";
import { TemplateLibrarySelector } from "./TemplateLibrarySelector";
import { InteractiveMessageTester } from "./InteractiveMessageTester";

// Tipos de mensagens interativas
export type InteractiveMessageType =
  | "cta_url"
  | "flow"
  | "list"
  | "button"
  | "location"
  | "location_request"
  | "reaction"
  | "sticker";

// Interface para botões de resposta rápida
interface QuickReplyButton {
  id: string;
  title: string;
}

// Interface para seções de lista
interface ListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

// Interface para parâmetros de fluxo
interface FlowParameters {
  flow_message_version: string;
  flow_token: string;
  flow_id: string;
  flow_cta: string;
  flow_action: "navigate" | "data_exchange";
  flow_action_payload?: {
    screen?: string;
    data?: Record<string, any>;
  };
}

// Interface principal da mensagem interativa
interface InteractiveMessage {
  id?: string;
  name: string;
  type: InteractiveMessageType;

  // Conteúdo básico
  header?: {
    type: "text" | "image" | "video" | "document";
    text?: string;
    media_url?: string;
    media_id?: string;
    filename?: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };

  // Ações específicas por tipo
  action?: {
    // Para CTA URL
    name?: "cta_url";
    parameters?: {
      display_text: string;
      url: string;
    };

    // Para Flow
    flow_parameters?: FlowParameters;

    // Para List
    button?: string;
    sections?: ListSection[];

    // Para Buttons (Quick Reply)
    buttons?: QuickReplyButton[];

    // Para Location Request
    location_action?: "send_location";
  };

  // Para Location (não interativa, mas incluída)
  location?: {
    latitude: string;
    longitude: string;
    name?: string;
    address?: string;
  };

  // Para Reaction
  reaction?: {
    message_id: string;
    emoji: string;
  };

  // Para Sticker
  sticker?: {
    id?: string;
    url?: string;
  };
}

interface InteractiveMessageCreatorProps {
  caixaId: string;
  onSave?: (message: InteractiveMessage) => void;
  editingMessage?: InteractiveMessage;
}

const MESSAGE_TYPES = {
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

export const InteractiveMessageCreator: React.FC<
  InteractiveMessageCreatorProps
> = ({ caixaId, onSave, editingMessage }) => {
  const { data: session } = useSession();
  const {
    variables,
    loading: variablesLoading,
    getAutoFooter,
  } = useVariableManager();

  // Estado para controlar o passo atual
  const [currentStep, setCurrentStep] = useState<
    "type-selection" | "configuration" | "preview"
  >("type-selection");

  // Estado principal da mensagem
  const [message, setMessage] = useState<InteractiveMessage>({
    name: "",
    type: "button",
    body: { text: "" },
  });

  // Estados para upload de mídia
  const [uploadedFiles, setUploadedFiles] = useState<MinIOMediaFile[]>([]);
  const [saving, setSaving] = useState(false);

  // Carregar mensagem para edição
  useEffect(() => {
    if (editingMessage) {
      setMessage(editingMessage);
      setCurrentStep("configuration"); // Pular seleção de tipo se editando
    }
  }, [editingMessage]);

  // Sincronizar upload de arquivos com media_url
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      const latestFile = uploadedFiles[uploadedFiles.length - 1];
      console.log("Upload files changed:", uploadedFiles);
      console.log("Latest file:", latestFile);
      console.log("Current message header:", message.header);

      if (latestFile.url && latestFile.progress === 100) {
        console.log("Atualizando media_url com:", latestFile.url);
        updateHeader({ media_url: latestFile.url });
      }
    }
  }, [uploadedFiles]);

  // Auto-popular rodapé com valor real da variável
  useEffect(() => {
    if (!variablesLoading && variables.length > 0 && !message.footer?.text) {
      const companyNameVar = variables.find(v => v.chave === 'nome_do_escritorio_rodape');
      if (companyNameVar?.valor) {
        setMessage((prev) => ({
          ...prev,
          footer: { text: companyNameVar.valor }, // Usar o valor real, não a variável
        }));
      }
    }
  }, [variables, variablesLoading, message.footer?.text]);

  // Atualizar mensagem
  const updateMessage = (updates: Partial<InteractiveMessage>) => {
    setMessage((prev) => ({ ...prev, ...updates }));
  };

  // Atualizar header
  const updateHeader = (
    headerUpdates: Partial<InteractiveMessage["header"]>
  ) => {
    setMessage((prev) => ({
      ...prev,
      header: prev.header
        ? { ...prev.header, ...headerUpdates }
        : (headerUpdates as InteractiveMessage["header"]),
    }));
  };

  // Atualizar body
  const updateBody = (text: string) => {
    setMessage((prev) => ({
      ...prev,
      body: { text },
    }));
  };

  // Atualizar footer
  const updateFooter = (text: string) => {
    setMessage((prev) => ({
      ...prev,
      footer: { text },
    }));
  };

  // Atualizar action
  const updateAction = (
    actionUpdates: Partial<InteractiveMessage["action"]>
  ) => {
    setMessage((prev) => ({
      ...prev,
      action: { ...prev.action, ...actionUpdates },
    }));
  };

  // Salvar mensagem
  const handleSave = async () => {
    if (!message.name || !message.body.text) {
      toast.error("Nome e texto do corpo são obrigatórios");
      return;
    }

    try {
      setSaving(true);

      const url = editingMessage
        ? `/api/admin/mtf-diamante/interactive-messages/${editingMessage.id}`
        : "/api/admin/mtf-diamante/interactive-messages";

      const method = editingMessage ? "PUT" : "POST";

      console.log("Enviando mensagem para API:", { caixaId, message });

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caixaId, message }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Erro da API:", errorData);
        throw new Error(errorData.error || "Falha ao salvar mensagem");
      }

      const result = await response.json();
      console.log("Resposta da API:", result);
      
      // Atualizar o estado da mensagem com o ID retornado
      if (result.message?.id && !editingMessage) {
        setMessage(prev => ({ ...prev, id: result.message.id }));
      }
      
      toast.success(
        `Mensagem interativa ${editingMessage ? "atualizada" : "salva"} com sucesso!`
      );
      onSave?.(result.message);
    } catch (error) {
      console.error("Erro ao salvar mensagem:", error);
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Gerar componentes para preview
  const generatePreviewComponents = () => {
    const components = [];

    // Header
    if (message.header) {
      if (message.header.type === "text" && message.header.text) {
        components.push({
          type: "header",
          text: message.header.text,
        });
      } else if (message.header.media_url) {
        components.push({
          type: "header",
          format: message.header.type,
          url: message.header.media_url,
          filename: message.header.filename,
        });
      }
    }

    // Body
    components.push({
      type: "body",
      text: message.body.text,
    });

    // Footer
    if (message.footer?.text) {
      components.push({
        type: "footer",
        text: message.footer.text,
      });
    }

    // Buttons baseado no tipo
    if (message.type === "button" && message.action?.buttons) {
      components.push({
        type: "buttons",
        buttons: message.action.buttons.map((btn) => ({
          type: "QUICK_REPLY",
          text: btn.title,
        })),
      });
    } else if (message.type === "cta_url" && message.action?.parameters) {
      components.push({
        type: "buttons",
        buttons: [
          {
            type: "URL",
            text: message.action.parameters.display_text,
            url: message.action.parameters.url,
          },
        ],
      });
    } else if (message.type === "list" && message.action?.sections) {
      // Para lista, mostrar como um botão que abre a lista
      components.push({
        type: "buttons",
        buttons: [
          {
            type: "LIST",
            text: message.action.button || "Ver opções",
          },
        ],
      });
    }

    return components;
  };

  // Função para avançar para configuração
  const handleTypeSelection = (type: InteractiveMessageType) => {
    updateMessage({ type });
    setCurrentStep("configuration");
  };

  // Componente do indicador de etapas
  const StepIndicator = () => {
    const steps = [
      { key: "type-selection", label: "Selecionar Tipo", number: 1 },
      { key: "configuration", label: "Configurar Mensagem", number: 2 },
      { key: "preview", label: "Visualizar e Salvar", number: 3 },
    ];

    const getCurrentStepIndex = () => {
      return steps.findIndex((step) => step.key === currentStep);
    };

    const currentStepIndex = getCurrentStepIndex();

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <React.Fragment key={step.key}>
              <div
                className={`flex items-center rounded-full border-2 ${
                  index <= currentStepIndex
                    ? "border-blue-500 bg-blue-50 text-blue-500"
                    : "border-gray-300 text-gray-400"
                } w-10 h-10 justify-center font-bold`}
              >
                {step.number}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    index < currentStepIndex ? "bg-blue-500" : "bg-gray-300"
                  }`}
                ></div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm px-1">
          {steps.map((step, index) => (
            <div
              key={step.key}
              className={`${
                index <= currentStepIndex
                  ? "text-blue-500 font-medium"
                  : "text-gray-500"
              } text-center flex-1`}
            >
              {step.label}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Renderizar passo de seleção de tipo
  if (currentStep === "type-selection") {
    return (
      <div className="space-y-6">
        <StepIndicator />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Criar Nova Mensagem Interativa
            </CardTitle>
            <CardDescription>
              Primeiro, escolha o tipo de mensagem interativa que deseja criar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InteractiveMessageTypeSelector
              selectedType={message.type}
              onTypeSelect={handleTypeSelection}
              showExamples={true}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Renderizar passo de preview
  if (currentStep === "preview") {
    return (
      <div className="space-y-6">
        <StepIndicator />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Visualizar e Salvar Mensagem
              <Badge variant="outline" className="ml-2">
                {MESSAGE_TYPES[message.type].label}
              </Badge>
            </CardTitle>
            <CardDescription>
              Revise sua mensagem interativa antes de salvar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preview da mensagem */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                Visualização da Mensagem
              </h3>
              {message.name || message.body.text ? (
                <TemplatePreview
                  components={generatePreviewComponents()}
                  title={message.name || "Mensagem Interativa"}
                  description={`Tipo: ${MESSAGE_TYPES[message.type].label}`}
                  useAlternativeFormat={true}
                  variables={variables}
                  previewMode="interactive"
                />
              ) : (
                <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Nenhuma mensagem para visualizar</p>
                  <p className="text-sm">
                    Configure sua mensagem para ver a visualização
                  </p>
                </div>
              )}
            </div>

            {/* Resumo da configuração */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Resumo da Configuração</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Nome da Mensagem
                  </Label>
                  <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                    {message.name || "Não definido"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo</Label>
                  <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                    {MESSAGE_TYPES[message.type].label}
                  </p>
                </div>
                {message.header && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Cabeçalho</Label>
                    <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                      {message.header.type === "text"
                        ? message.header.text || "Texto não definido"
                        : `${message.header.type} - ${message.header.media_url ? "Mídia anexada" : "Mídia não anexada"}`}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Corpo</Label>
                  <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                    {message.body.text || "Não definido"}
                  </p>
                </div>
                {message.footer?.text && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Rodapé</Label>
                    <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                      {message.footer.text}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Botões de navegação e ação */}
            <div className="flex justify-between items-center pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentStep("configuration")}
              >
                ← Voltar para Configuração
              </Button>

              <div className="flex gap-2">
                <InteractiveMessageTester
                  messageId={message.id || editingMessage?.id}
                  messageName={message.name}
                  disabled={!message.name || !message.body.text || saving}
                />

                <SaveToLibraryButton
                  templateData={{
                    name: message.name,
                    category: "interactive_messages",
                    language: "pt_BR",
                    headerType: message.header?.type || "NONE",
                    headerText: message.header?.text || "",
                    bodyText: message.body.text,
                    footerText: message.footer?.text || "",
                    buttons: message.action?.buttons || [],
                    headerMetaMedia: message.header?.media_url
                      ? [{ url: message.header.media_url }]
                      : [],
                  }}
                  messageType="interactive_message"
                  disabled={!message.name || !message.body.text || saving}
                />

                <Button
                  onClick={() => {
                    if (saving) return;
                    if (!message.name && !message.body.text) {
                      toast.error(
                        "Preencha o nome e o corpo da mensagem para salvar."
                      );
                      return;
                    }
                    if (!message.name) {
                      toast.error("Preencha o nome da mensagem para salvar.");
                      return;
                    }
                    if (!message.body.text) {
                      toast.error("Preencha o corpo da mensagem para salvar.");
                      return;
                    }
                    handleSave();
                  }}
                  disabled={saving || !message.name || !message.body.text}
                  className="min-w-[120px]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {editingMessage ? "Atualizar" : "Salvar"} Mensagem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {editingMessage ? "Editar" : "Configurar"} Mensagem Interativa
            <Badge variant="outline" className="ml-2">
              {MESSAGE_TYPES[message.type].label}
            </Badge>
          </CardTitle>
          <CardDescription>
            Configure os detalhes da sua mensagem interativa do tipo{" "}
            {MESSAGE_TYPES[message.type].label}
          </CardDescription>
          {!editingMessage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep("type-selection")}
              className="w-fit mt-2"
            >
              ← Voltar para seleção de tipo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Configuração Básica</TabsTrigger>
              <TabsTrigger value="advanced">Configuração Avançada</TabsTrigger>
              <TabsTrigger value="preview">Visualização</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              {/* Nome da mensagem */}
              <div className="space-y-2">
                <Label htmlFor="message-name">
                  Nome da Mensagem <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="message-name"
                  placeholder="Ex: Menu Principal, Confirmação de Agendamento..."
                  value={message.name}
                  onChange={(e) => updateMessage({ name: e.target.value })}
                  className={
                    !message.name ? "border-red-300 focus:border-red-500" : ""
                  }
                />
                {!message.name && (
                  <p className="text-xs text-red-500 mt-1">
                    O nome da mensagem é obrigatório para salvar
                  </p>
                )}
              </div>

              {/* Tipo de mensagem */}
              <div className="space-y-2">
                <Label htmlFor="message-type">Tipo de Mensagem</Label>
                <Select
                  value={message.type}
                  onValueChange={(value: InteractiveMessageType) => {
                    updateMessage({
                      type: value,
                      action: undefined, // Reset action when changing type
                      location: undefined,
                      reaction: undefined,
                      sticker: undefined,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MESSAGE_TYPES).map(([key, config]) => {
                      const IconComponent = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <IconComponent className="h-4 w-4" />
                            <div>
                              <div className="font-medium">{config.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {config.description}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Header (opcional) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Cabeçalho (Opcional)</Label>
                  <Badge variant="outline">Opcional</Badge>
                </div>

                <Select
                  value={message.header?.type || "none"}
                  onValueChange={(value) => {
                    if (value === "none") {
                      updateMessage({ header: undefined });
                    } else {
                      updateHeader({
                        type: value as any,
                        text: "",
                        media_url: "",
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de cabeçalho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cabeçalho</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>

                {message.header?.type === "text" && (
                  <EnhancedTextArea
                    value={message.header.text || ""}
                    onChange={(text) => updateHeader({ text })}
                    variables={variables}
                    placeholder="Texto do cabeçalho..."
                    multiline={false}
                    label="Texto do Cabeçalho"
                  />
                )}

                {message.header?.type && message.header.type !== "text" && (
                  <div className="space-y-4">
                    <div>
                      <Label>Upload de Mídia para MinIO</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Para mensagens interativas, a mídia é enviada apenas
                        para o MinIO (não para a Meta API)
                      </p>
                      <MinIOMediaUpload
                        uploadedFiles={uploadedFiles}
                        setUploadedFiles={setUploadedFiles}
                        allowedTypes={
                          message.header.type === "image"
                            ? ["image/jpeg", "image/png", "image/jpg"]
                            : message.header.type === "video"
                              ? ["video/mp4", "video/webm"]
                              : [
                                  "application/pdf",
                                  "application/msword",
                                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                ]
                        }
                        maxSizeMB={16}
                        title={`Upload de ${message.header.type === "image" ? "Imagem" : message.header.type === "video" ? "Vídeo" : "Documento"}`}
                        description={`Faça upload da ${message.header.type === "image" ? "imagem" : message.header.type === "video" ? "vídeo" : "documento"} que será usado no cabeçalho`}
                        maxFiles={1}
                        onUploadComplete={(file) => {
                          // Para mensagens interativas, usamos apenas a URL do MinIO
                          if (file.url) {
                            updateHeader({
                              media_url: file.url,
                              media_id: undefined, // Não usar media_id para mensagens interativas
                            });
                          }
                        }}
                      />
                    </div>

                    {message.header.type === "document" && (
                      <div className="space-y-2">
                        <Label>Nome do Arquivo</Label>
                        <Input
                          placeholder="documento.pdf"
                          value={message.header.filename || ""}
                          onChange={(e) =>
                            updateHeader({ filename: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Body (obrigatório) */}
              <EnhancedTextArea
                value={message.body.text}
                onChange={updateBody}
                variables={variables}
                placeholder="Texto principal da mensagem..."
                rows={4}
                label="Corpo da Mensagem"
                description="Conteúdo principal da mensagem. Use clique direito para inserir variáveis."
              />

              {/* Footer (opcional) */}
              <EnhancedTextArea
                value={message.footer?.text || ""}
                onChange={updateFooter}
                variables={variables}
                placeholder="Texto do rodapé (opcional)..."
                multiline={false}
                label="Rodapé"
                description="Texto opcional no rodapé. Nome da empresa é preenchido automaticamente."
              />
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              {/* Configurações específicas por tipo */}
              {message.type === "cta_url" && (
                <CTAUrlConfig message={message} updateAction={updateAction} />
              )}

              {message.type === "flow" && (
                <FlowConfig message={message} updateAction={updateAction} />
              )}

              {message.type === "list" && (
                <ListConfig message={message} updateAction={updateAction} />
              )}

              {message.type === "button" && (
                <ButtonConfig message={message} updateAction={updateAction} />
              )}

              {message.type === "location" && (
                <LocationConfig
                  message={message}
                  updateMessage={updateMessage}
                />
              )}

              {message.type === "location_request" && (
                <LocationRequestConfig
                  message={message}
                  updateAction={updateAction}
                />
              )}

              {message.type === "reaction" && (
                <ReactionConfig
                  message={message}
                  updateMessage={updateMessage}
                />
              )}

              {message.type === "sticker" && (
                <StickerConfig
                  message={message}
                  updateMessage={updateMessage}
                  uploadedFiles={uploadedFiles}
                  setUploadedFiles={setUploadedFiles}
                />
              )}
            </TabsContent>

            <TabsContent value="preview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Visualização da Mensagem
                  </CardTitle>
                  <CardDescription>
                    Como sua mensagem aparecerá no WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {message.name || message.body.text ? (
                    <TemplatePreview
                      components={generatePreviewComponents()}
                      title={message.name || "Mensagem Interativa"}
                      description={`Tipo: ${MESSAGE_TYPES[message.type].label}`}
                      useAlternativeFormat={true}
                      variables={variables}
                      previewMode="interactive"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">
                        Nenhuma mensagem para visualizar
                      </p>
                      <p className="text-sm">
                        Configure sua mensagem para ver a visualização
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Botões de navegação e ação */}
          <div className="flex justify-between items-center pt-6 border-t">
            <div className="flex gap-2">
              {!editingMessage && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep("type-selection")}
                >
                  ← Voltar
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <TemplateLibrarySelector
                type="interactive_message"
                onSelect={(template) => {
                  // Load interactive message data from library
                  const content = template.content as any;
                  setMessage({
                    ...message,
                    name: template.name,
                    header: content.header
                      ? {
                          type: content.mediaType || "text",
                          text: content.header,
                          media_url: content.mediaUrl,
                        }
                      : undefined,
                    body: { text: content.body || "" },
                    footer: content.footer
                      ? { text: content.footer }
                      : undefined,
                    action: content.actionData || undefined,
                  });
                  toast.success("Mensagem interativa carregada da biblioteca!");
                }}
              />

              <Button
                variant="outline"
                onClick={() => setCurrentStep("preview")}
                disabled={!message.name || !message.body.text}
              >
                Visualizar →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Componentes de configuração específicos para cada tipo
const CTAUrlConfig: React.FC<{
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}> = ({ message, updateAction }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <ExternalLink className="h-4 w-4" />
        Configuração do Botão URL
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>Texto do Botão</Label>
        <Input
          placeholder="Ex: Ver Mais, Acessar Site..."
          value={message.action?.parameters?.display_text || ""}
          onChange={(e) =>
            updateAction({
              name: "cta_url",
              parameters: {
                ...message.action?.parameters,
                display_text: e.target.value,
                url: message.action?.parameters?.url || "",
              },
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>URL de Destino</Label>
        <Input
          placeholder="https://exemplo.com"
          value={message.action?.parameters?.url || ""}
          onChange={(e) =>
            updateAction({
              name: "cta_url",
              parameters: {
                ...message.action?.parameters,
                display_text: message.action?.parameters?.display_text || "",
                url: e.target.value,
              },
            })
          }
        />
      </div>
    </CardContent>
  </Card>
);

const FlowConfig: React.FC<{
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}> = ({ message, updateAction }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Workflow className="h-4 w-4" />
        Configuração do Fluxo
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>ID do Fluxo</Label>
        <Input
          placeholder="YOUR_FLOW_ID"
          value={message.action?.flow_parameters?.flow_id || ""}
          onChange={(e) =>
            updateAction({
              flow_parameters: {
                ...message.action?.flow_parameters,
                flow_id: e.target.value,
                flow_message_version:
                  message.action?.flow_parameters?.flow_message_version || "3",
                flow_token: message.action?.flow_parameters?.flow_token || "",
                flow_cta: message.action?.flow_parameters?.flow_cta || "",
                flow_action:
                  message.action?.flow_parameters?.flow_action || "navigate",
              },
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Texto do Botão</Label>
        <Input
          placeholder="Ex: Iniciar, Agendar..."
          value={message.action?.flow_parameters?.flow_cta || ""}
          onChange={(e) =>
            updateAction({
              flow_parameters: {
                ...message.action?.flow_parameters,
                flow_cta: e.target.value,
                flow_message_version:
                  message.action?.flow_parameters?.flow_message_version || "3",
                flow_token: message.action?.flow_parameters?.flow_token || "",
                flow_id: message.action?.flow_parameters?.flow_id || "",
                flow_action:
                  message.action?.flow_parameters?.flow_action || "navigate",
              },
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Token do Fluxo</Label>
        <Input
          placeholder="AQAAAAACS5FpgQ_cAAAAAD0QI3s."
          value={message.action?.flow_parameters?.flow_token || ""}
          onChange={(e) =>
            updateAction({
              flow_parameters: {
                ...message.action?.flow_parameters,
                flow_token: e.target.value,
                flow_message_version:
                  message.action?.flow_parameters?.flow_message_version || "3",
                flow_cta: message.action?.flow_parameters?.flow_cta || "",
                flow_id: message.action?.flow_parameters?.flow_id || "",
                flow_action:
                  message.action?.flow_parameters?.flow_action || "navigate",
              },
            })
          }
        />
      </div>
    </CardContent>
  </Card>
);

const ListConfig: React.FC<{
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}> = ({ message, updateAction }) => {
  // Função para gerar ID único para item da lista
  const generateListItemId = (title: string, sectionIndex: number, rowIndex: number): string => {
    const baseId = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    const timestamp = Date.now().toString().slice(-6);
    return baseId ? `list_${baseId}_${timestamp}` : `list_s${sectionIndex}_r${rowIndex}_${timestamp}`;
  };

  const addSection = () => {
    const currentSections = message.action?.sections || [];
    const newSectionIndex = currentSections.length;
    const newRowId = generateListItemId("", newSectionIndex, 0);
    
    updateAction({
      sections: [
        ...currentSections,
        { title: "", rows: [{ id: newRowId, title: "", description: "" }] },
      ],
    });
  };

  const updateSection = (index: number, updates: Partial<ListSection>) => {
    const sections = [...(message.action?.sections || [])];
    sections[index] = { ...sections[index], ...updates };
    updateAction({ sections });
  };

  const removeSection = (index: number) => {
    const sections =
      message.action?.sections?.filter((_, i) => i !== index) || [];
    updateAction({ sections });
  };

  const addRow = (sectionIndex: number) => {
    const sections = [...(message.action?.sections || [])];
    const newRowIndex = sections[sectionIndex].rows.length;
    const newRowId = generateListItemId("", sectionIndex, newRowIndex);
    
    sections[sectionIndex].rows.push({ id: newRowId, title: "", description: "" });
    updateAction({ sections });
  };

  const updateRow = (
    sectionIndex: number,
    rowIndex: number,
    updates: Partial<ListSection["rows"][0]>
  ) => {
    const sections = [...(message.action?.sections || [])];
    
    // IMPORTANTE: ID nunca muda após ser criado, apenas atualiza outros campos
    sections[sectionIndex].rows[rowIndex] = {
      ...sections[sectionIndex].rows[rowIndex],
      ...updates,
    };
    
    updateAction({ sections });
  };

  const removeRow = (sectionIndex: number, rowIndex: number) => {
    const sections = [...(message.action?.sections || [])];
    sections[sectionIndex].rows = sections[sectionIndex].rows.filter(
      (_, i) => i !== rowIndex
    );
    updateAction({ sections });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-4 w-4" />
          Configuração da Lista
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Texto do Botão da Lista</Label>
          <Input
            placeholder="Ex: Ver Opções, Escolher..."
            value={message.action?.button || ""}
            onChange={(e) => updateAction({ button: e.target.value })}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Seções da Lista</Label>
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Seção
            </Button>
          </div>

          {message.action?.sections?.map((section, sectionIndex) => (
            <Card key={sectionIndex} className="border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Seção {sectionIndex + 1}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSection(sectionIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título da Seção</Label>
                  <Input
                    placeholder="Ex: Opções Rápidas"
                    value={section.title}
                    onChange={(e) =>
                      updateSection(sectionIndex, { title: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Itens da Seção</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addRow(sectionIndex)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar Item
                    </Button>
                  </div>

                  {section.rows.map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="border rounded p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          Item {rowIndex + 1}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(sectionIndex, rowIndex)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Título</Label>
                            <Input
                              placeholder="Título do item"
                              value={row.title}
                              onChange={(e) =>
                                updateRow(sectionIndex, rowIndex, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Descrição</Label>
                            <Input
                              placeholder="Descrição opcional"
                              value={row.description || ""}
                              onChange={(e) =>
                                updateRow(sectionIndex, rowIndex, {
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">ID Gerado Automaticamente</Label>
                          <div className="text-xs font-mono bg-gray-50 p-2 rounded border">
                            {row.id || 'ID será gerado quando você digitar o título'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const ButtonConfig: React.FC<{
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}> = ({ message, updateAction }) => {
  // Função para gerar ID único para botão
  const generateButtonId = (title: string, index: number): string => {
    const baseId = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    const timestamp = Date.now().toString().slice(-6);
    return baseId ? `btn_${baseId}_${timestamp}` : `btn_${index + 1}_${timestamp}`;
  };

  const addButton = () => {
    const currentButtons = message.action?.buttons || [];
    if (currentButtons.length < 3) {
      const newButtonIndex = currentButtons.length;
      const newButtonId = generateButtonId("", newButtonIndex);
      
      updateAction({
        buttons: [...currentButtons, { id: newButtonId, title: "" }],
      });
    }
  };

  const updateButton = (index: number, updates: Partial<QuickReplyButton>) => {
    const buttons = [...(message.action?.buttons || [])];
    
    // IMPORTANTE: ID nunca muda após ser criado, apenas atualiza outros campos
    buttons[index] = { ...buttons[index], ...updates };
    
    updateAction({ buttons });
  };

  const removeButton = (index: number) => {
    const buttons =
      message.action?.buttons?.filter((_, i) => i !== index) || [];
    updateAction({ buttons });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MousePointer className="h-4 w-4" />
          Configuração dos Botões de Resposta
        </CardTitle>
        <CardDescription>Máximo de 3 botões de resposta rápida</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Botões ({message.action?.buttons?.length || 0}/3)</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addButton}
            disabled={(message.action?.buttons?.length || 0) >= 3}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Botão
          </Button>
        </div>

        {message.action?.buttons?.map((button, index) => (
          <div key={index} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline">Botão {index + 1}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeButton(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Texto do Botão</Label>
                <Input
                  placeholder="Texto do botão"
                  value={button.title}
                  onChange={(e) =>
                    updateButton(index, { title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ID Gerado Automaticamente</Label>
                <div className="text-xs font-mono bg-gray-50 p-2 rounded border">
                  {button.id || 'ID será gerado quando você digitar o texto'}
                </div>
              </div>
            </div>
          </div>
        ))}

        {(!message.action?.buttons || message.action.buttons.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <MousePointer className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum botão adicionado ainda</p>
            <p className="text-xs">
              Clique em "Adicionar Botão" para criar seu primeiro botão
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const LocationConfig: React.FC<{
  message: InteractiveMessage;
  updateMessage: (updates: Partial<InteractiveMessage>) => void;
}> = ({ message, updateMessage }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Configuração da Localização
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input
            placeholder="-23.5505"
            value={message.location?.latitude || ""}
            onChange={(e) =>
              updateMessage({
                location: {
                  ...message.location,
                  latitude: e.target.value,
                  longitude: message.location?.longitude || "",
                  name: message.location?.name,
                  address: message.location?.address,
                },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input
            placeholder="-46.6333"
            value={message.location?.longitude || ""}
            onChange={(e) =>
              updateMessage({
                location: {
                  ...message.location,
                  longitude: e.target.value,
                  latitude: message.location?.latitude || "",
                  name: message.location?.name,
                  address: message.location?.address,
                },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Nome do Local (Opcional)</Label>
        <Input
          placeholder="Ex: Escritório Central"
          value={message.location?.name || ""}
          onChange={(e) =>
            updateMessage({
              location: {
                ...message.location,
                name: e.target.value,
                latitude: message.location?.latitude || "",
                longitude: message.location?.longitude || "",
                address: message.location?.address,
              },
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Endereço (Opcional)</Label>
        <Input
          placeholder="Ex: Rua das Flores, 123 - São Paulo, SP"
          value={message.location?.address || ""}
          onChange={(e) =>
            updateMessage({
              location: {
                ...message.location,
                address: e.target.value,
                latitude: message.location?.latitude || "",
                longitude: message.location?.longitude || "",
                name: message.location?.name,
              },
            })
          }
        />
      </div>
    </CardContent>
  </Card>
);

const LocationRequestConfig: React.FC<{
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}> = ({ message, updateAction }) => {
  // Para location request, apenas definimos a ação
  React.useEffect(() => {
    updateAction({ location_action: "send_location" });
  }, [updateAction]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-4 w-4" />
          Solicitação de Localização
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Navigation className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">
            Esta mensagem solicitará a localização do usuário
          </p>
          <p className="text-xs">Não há configurações adicionais necessárias</p>
        </div>
      </CardContent>
    </Card>
  );
};

const ReactionConfig: React.FC<{
  message: InteractiveMessage;
  updateMessage: (updates: Partial<InteractiveMessage>) => void;
}> = ({ message, updateMessage }) => {
  const commonEmojis = [
    "😀",
    "😂",
    "❤️",
    "👍",
    "👎",
    "😢",
    "😡",
    "😮",
    "🎉",
    "🔥",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smile className="h-4 w-4" />
          Configuração da Reação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>ID da Mensagem Original</Label>
          <Input
            placeholder="wamid.xxx..."
            value={message.reaction?.message_id || ""}
            onChange={(e) =>
              updateMessage({
                reaction: {
                  ...message.reaction,
                  message_id: e.target.value,
                  emoji: message.reaction?.emoji || "😀",
                },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Emoji da Reação</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {commonEmojis.map((emoji) => (
              <Button
                key={emoji}
                variant={
                  message.reaction?.emoji === emoji ? "default" : "outline"
                }
                size="sm"
                onClick={() =>
                  updateMessage({
                    reaction: {
                      ...message.reaction,
                      emoji,
                      message_id: message.reaction?.message_id || "",
                    },
                  })
                }
              >
                {emoji}
              </Button>
            ))}
          </div>
          <Input
            placeholder="😀"
            value={message.reaction?.emoji || ""}
            onChange={(e) =>
              updateMessage({
                reaction: {
                  ...message.reaction,
                  emoji: e.target.value,
                  message_id: message.reaction?.message_id || "",
                },
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};

const StickerConfig: React.FC<{
  message: InteractiveMessage;
  updateMessage: (updates: Partial<InteractiveMessage>) => void;
  uploadedFiles: MinIOMediaFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<MinIOMediaFile[]>>;
}> = ({ message, updateMessage, uploadedFiles, setUploadedFiles }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        Configuração do Sticker
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label>Upload do Sticker</Label>
        <MinIOMediaUpload
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          allowedTypes={["image/webp", "image/png", "image/jpeg"]}
          maxSizeMB={1}
          title="Upload de Sticker"
          description="Faça upload do sticker/figurinha (formato WebP recomendado)"
          maxFiles={1}
          onUploadComplete={(file) => {
            if (file.url) {
              updateMessage({
                sticker: {
                  ...message.sticker,
                  url: file.url,
                },
              });
            }
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>ID do Sticker (alternativo)</Label>
        <Input
          placeholder="YOUR_STICKER_MEDIA_ID"
          value={message.sticker?.id || ""}
          onChange={(e) =>
            updateMessage({
              sticker: {
                ...message.sticker,
                id: e.target.value,
              },
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>URL do Sticker (alternativo)</Label>
        <Input
          placeholder="https://exemplo.com/sticker.webp"
          value={message.sticker?.url || ""}
          onChange={(e) =>
            updateMessage({
              sticker: {
                ...message.sticker,
                url: e.target.value,
                id: message.sticker?.id || "",
              },
            })
          }
        />
      </div>
    </CardContent>
  </Card>
);

export default InteractiveMessageCreator;
