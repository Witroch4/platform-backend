"use client";

import type React from "react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Type,
  FileText,
  Image,
  Video,
  AlertCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Import existing components
import { InteractivePreview } from "../shared/InteractivePreview";
import { WhatsAppTextEditor } from "../shared/WhatsAppTextEditor";
import { ButtonManager } from "../shared/ButtonManager";
import { ReactionConfigManager } from "../shared/ReactionConfigManager";
import MinIOMediaUpload, { MinIOMediaFile } from "../shared/MinIOMediaUpload";

// Import validation and error handling
import { useInteractiveMessageValidation } from "../../hooks/useInteractiveMessageValidation";

// Import types
import type {
  InteractiveMessage,
  MessageHeader,
  HeaderType,
  ButtonReaction as CentralButtonReaction,
} from "@/types/interactive-messages";
import type {
  InteractiveButton,
  ButtonReaction as LocalButtonReaction,
} from "../shared/ButtonManager";

// Conversion helpers between backend-stored buttons and UI InteractiveButton
const convertBackendToInteractive = (button: any): InteractiveButton => {
  const detectedType = (button?.type as any) || (button?.reply ? 'reply' : 'reply');
  const id = button?.id || button?.reply?.id || `btn_${Math.random().toString(36).slice(2, 11)}`;
  const title = button?.title || button?.reply?.title || button?.text || '';
  if (detectedType === 'url') {
    return { id, text: title, type: 'url', url: button?.url };
  }
  if (detectedType === 'phone_number') {
    return { id, text: title, type: 'phone_number', phone_number: button?.phone_number };
  }
  return { id, text: title, type: 'reply' };
};

const convertInteractiveToBackend = (button: InteractiveButton): any => {
  if (button.type === 'url') {
    return {
      id: button.id,
      type: 'url',
      title: button.text,
      url: button.url || '',
    };
  }
  if (button.type === 'phone_number') {
    return {
      id: button.id,
      type: 'phone_number',
      title: button.text,
      phone_number: button.phone_number || '',
    };
  }
  // reply default
  return {
    id: button.id,
    title: button.text,
    payload: button.id,
    type: 'reply',
    reply: {
      id: button.id,
      title: button.text,
    },
  };
};

// Conversion functions for ButtonReaction types
const convertCentralToLocal = (
  reaction: CentralButtonReaction
): LocalButtonReaction => {
  // Preferir valores reais quando vierem do backend
  const value = reaction.type === 'emoji' 
    ? (reaction.emoji || (reaction as any).emoji || '') 
    : (reaction.textResponse || (reaction as any).textReaction || '');
  return {
    buttonId: reaction.buttonId,
    reaction:
      reaction.type === 'emoji' || reaction.type === 'text'
        ? {
            type: reaction.type,
            value: value,
          }
        : undefined,
  };
};

interface UnifiedEditingStepProps {
  message: InteractiveMessage;
  reactions: CentralButtonReaction[];
  variables?: Array<{ chave: string; valor: string; }>;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  onReactionUpdate: (
    buttonId: string,
    reaction: Partial<CentralButtonReaction>
  ) => void;
  onNext: () => void;
  onBack: () => void;
  disabled?: boolean;
  className?: string;
  inboxId?: string;
}

// Validation constants
const VALIDATION_LIMITS = {
  NAME_MAX_LENGTH: 100,
  HEADER_TEXT_MAX_LENGTH: 60,
  BODY_TEXT_MAX_LENGTH: 1024,
  FOOTER_TEXT_MAX_LENGTH: 60,
  BUTTON_MAX_COUNT: 3,
  // Instagram specific limits
  INSTAGRAM_QUICK_REPLIES_MAX_LENGTH: 1000,
} as const;

export const UnifiedEditingStep: React.FC<UnifiedEditingStepProps> = ({
  message,
  reactions,
  variables = [],
  onMessageUpdate,
  onReactionUpdate,
  onNext,
  onBack,
  disabled = false,
  className,
  inboxId,
}) => {
  const [reactionConfigButton, setReactionConfigButton] = useState<
    string | null
  >(null);
  const [showTextEditor, setShowTextEditor] = useState<
    "body" | "footer" | null
  >(null);

  // State for managing uploaded media files
  const [headerMediaFiles, setHeaderMediaFiles] = useState<MinIOMediaFile[]>(() => {
    const mediaUrl = message.header?.media_url || message.header?.mediaUrl || message.header?.content;
    if (message.header && message.header.type !== "text" && mediaUrl) {
      return [
        {
          id: "header-media",
          progress: 100,
          status: "success",
          url: mediaUrl,
          mime_type:
            message.header.type === "image"
              ? "image/jpeg"
              : message.header.type === "video"
                ? "video/mp4"
                : "application/pdf",
        },
      ];
    }
    return [];
  });

  // Use the new validation hook
  const {
    validationState,
    validateMessage,
    validateField,
    isFieldValid,
    getFieldErrors,
    canProceed,
    handleValidationError,
    clearValidation,
  } = useInteractiveMessageValidation(message, reactions, {
    enableRealTimeValidation: true,
    debounceMs: 300,
    validateOnMount: false,
  });

  // Detect channel type of current inbox to decide button id prefix
  const [channelType, setChannelType] = useState<string | null>(null);
  useEffect(() => {
    const fetchChannelType = async () => {
      if (!inboxId) return;
      try {
        const resp = await fetch(`/api/admin/mtf-diamante/dialogflow/caixas`);
        if (!resp.ok) return;
        const data = await resp.json();
        const caixa = (data?.caixas || []).find((c: any) => c.id === inboxId);
        if (caixa?.channelType) setChannelType(caixa.channelType);
      } catch {
        // ignore errors; fallback to no prefix
      }
    };
    fetchChannelType();
  }, [inboxId]);

  const generatePrefixedId = useCallback((fallbackSuffix: string) => {
    const prefix = channelType === 'Channel::Instagram' ? 'ig_' : '';
    return `${prefix}btn_${fallbackSuffix}`;
  }, [channelType]);

  // Update header media files when message header changes
  useEffect(() => {
    const mediaUrl = message.header?.media_url || message.header?.mediaUrl || message.header?.content;
    if (message.header && message.header.type !== "text" && mediaUrl) {
      setHeaderMediaFiles([
        {
          id: "header-media",
          progress: 100,
          status: "success",
          url: mediaUrl,
          mime_type:
            message.header.type === "image"
              ? "image/jpeg"
              : message.header.type === "video"
                ? "video/mp4"
                : "application/pdf",
        },
      ]);
    } else if (!mediaUrl || message.header?.type === "text") {
      setHeaderMediaFiles([]);
    }
  }, [message.header?.content, message.header?.media_url, message.header?.mediaUrl, message.header?.type]);

  // Garantir que o header exista como texto na primeira renderização
  useEffect(() => {
    if (!message.header) {
      onMessageUpdate({ header: { type: "text", content: "" } });
    }
  }, [message.header, onMessageUpdate]);

  // Extract buttons from message action and convert to InteractiveButton format
  const buttons = useMemo(() => {
    // Coleta possíveis fontes de botões (compatibilidade com várias formas)
    const candidates: any[] = [];
    const fromAction = (message.action as any)?.buttons;
    if (Array.isArray(fromAction)) candidates.push(...fromAction);

    const fromContentAction = (message as any)?.content?.action?.buttons;
    if (Array.isArray(fromContentAction)) candidates.push(...fromContentAction);

    const fromReplyModel = (message as any)?.actionReplyButton?.buttons; // quando vier direto do Prisma include
    if (Array.isArray(fromReplyModel)) candidates.push(...fromReplyModel);

    const fromInteractiveContent = (message as any)?.interactiveContent?.actionReplyButton?.buttons;
    if (Array.isArray(fromInteractiveContent)) candidates.push(...fromInteractiveContent);

    const fromContentReplyModel = (message as any)?.content?.interactiveContent?.actionReplyButton?.buttons;
    if (Array.isArray(fromContentReplyModel)) candidates.push(...fromContentReplyModel);

    // Evitar duplicatas por id/title
    const unique = new Map<string, any>();
    for (const btn of candidates) {
      const key = btn?.id || btn?.reply?.id || JSON.stringify(btn);
      if (!unique.has(key)) unique.set(key, btn);
    }

    return Array.from(unique.values()).map((btn, idx) => {
      const base: InteractiveButton = convertBackendToInteractive(btn);
      if (!base.id) {
        const uniqueSuffix = `${Date.now()}_${idx}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        return { ...base, id: generatePrefixedId(uniqueSuffix) };
      }
      return base;
    });
  }, [message.action, (message as any)?.content?.action, (message as any)?.actionReplyButton, (message as any)?.interactiveContent, generatePrefixedId]);

  // Helper function to get error messages from validation errors
  const getErrorMessages = useCallback(
    (fieldName: string): string[] => {
      const errors = getFieldErrors(fieldName);
      return errors.map((error) => error.message);
    },
    [getFieldErrors]
  );

  // Handle field updates with validation
  const handleNameChange = useCallback(
    (name: string) => {
      try {
        onMessageUpdate({ name });
        // Validate field immediately
        validateField("name", name, { ...message, name });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  const handleHeaderTypeChange = useCallback(
    (type: HeaderType) => {
      try {
        const newHeader: MessageHeader = {
          type,
          content: type === "text" ? message.header?.content || "" : "",
        };
        onMessageUpdate({ header: newHeader });

        // Clear header media files when switching to text type
        if (type === "text") {
          setHeaderMediaFiles([]);
        }
      } catch (error) {
        handleValidationError(error);
      }
    },
    [
      onMessageUpdate,
      message.header,
      handleValidationError,
      setHeaderMediaFiles,
    ]
  );

  const handleHeaderContentChange = useCallback(
    (content: string) => {
      try {
        if (!message.header) return;

        // Se header é de texto e o conteúdo está vazio, remover header (opcional)
        if (message.header.type === "text" && !content.trim()) {
          onMessageUpdate({ header: undefined });
          return;
        }

        const updatedHeader: MessageHeader = {
          ...message.header,
          content,
          // Sempre persistir também em media_url para compatibilidade
          ...(message.header.type !== "text" && { media_url: content }),
        };
        onMessageUpdate({ header: updatedHeader });

        // Validate header content immediately
        validateField("header.content", content, {
          ...message,
          header: updatedHeader,
        });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [
      onMessageUpdate,
      message.header,
      validateField,
      message,
      handleValidationError,
      setHeaderMediaFiles,
    ]
  );

  const handleBodyTextChange = useCallback(
    (text: string) => {
      try {
        onMessageUpdate({ body: { text } });
        // Validate body immediately
        validateField("body.text", text, { ...message, body: { text } });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  const handleFooterTextChange = useCallback(
    (text: string) => {
      try {
        onMessageUpdate({ footer: { text } });
        // Validate footer immediately
        validateField("footer.text", text, { ...message, footer: { text } });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  // --- CTA URL handlers and flags ---
  const isCtaUrl = useMemo(() => {
    const a: any = message.action || {};
    return message.type === 'cta_url' || a?.type === 'cta_url' || a?.name === 'cta_url';
  }, [message.type, message.action]);

  const currentCtaDisplay = useMemo(() => {
    const a: any = message.action || {};
    return a.action?.displayText || a.displayText || a.parameters?.display_text || '';
  }, [message.action]);

  const currentCtaUrl = useMemo(() => {
    const a: any = message.action || {};
    return a.action?.url || a.url || a.parameters?.url || '';
  }, [message.action]);

  const handleCtaDisplayChange = useCallback(
    (value: string) => {
      const url = currentCtaUrl || '';
      const action: any = {
        type: 'cta_url',
        action: { displayText: value, url },
        displayText: value,
        url
      };
      onMessageUpdate({ type: 'cta_url' as any, action });
      // Evita travar com erro antigo de action.buttons
      clearValidation();
    },
    [onMessageUpdate, currentCtaUrl, clearValidation]
  );

  const handleCtaUrlChange = useCallback(
    (value: string) => {
      const text = currentCtaDisplay || '';
      const action: any = {
        type: 'cta_url',
        action: { displayText: text, url: value },
        displayText: text,
        url: value
      };
      onMessageUpdate({ type: 'cta_url' as any, action });
      // Evita travar com erro antigo de action.buttons
      clearValidation();
    },
    [onMessageUpdate, currentCtaDisplay, clearValidation]
  );

  const handleButtonsChange = useCallback(
    (newButtons: InteractiveButton[]) => {
      try {
        const prefix = channelType === 'Channel::Instagram' ? 'ig_' : '';
        const backendButtons = newButtons.map((btn, idx) => {
          const needsPrefix = prefix && (!btn.id || !String(btn.id).startsWith(prefix));
          const uniqueSuffix = `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
          const newId = needsPrefix ? `${prefix}${btn.id || `btn_${uniqueSuffix}`}` : btn.id || `btn_${uniqueSuffix}`;
          const normalized: InteractiveButton = { ...btn, id: newId };
          return convertInteractiveToBackend(normalized);
        });

        // Determine if we should persist as CTA URL instead of Reply Buttons
        const urlButtons = newButtons.filter((b) => b.type === 'url');
        const phoneButtons = newButtons.filter((b) => b.type === 'phone_number');
        const replyButtons = newButtons.filter((b) => b.type === 'reply');

        if (urlButtons.length === 1 && phoneButtons.length === 0 && replyButtons.length === 0) {
          const urlBtn = urlButtons[0];
          const actionPayload: any = {
            type: 'cta_url',
            action: { displayText: urlBtn.text, url: urlBtn.url || '' },
            displayText: urlBtn.text,
            url: urlBtn.url || ''
          };
          if (process.env.NODE_ENV !== 'production') {
            console.log('[UnifiedEditingStep] Switching to CTA URL', actionPayload);
          }
          onMessageUpdate({
            type: 'cta_url' as any,
            action: actionPayload,
          });
          clearValidation();
          // No field-level validation needed; full validation will run debounced
        } else if (phoneButtons.length === 1 && urlButtons.length === 0 && replyButtons.length === 0) {
          const phoneBtn = phoneButtons[0];
          const telUrl = phoneBtn.phone_number ? `tel:${phoneBtn.phone_number}` : '';
          const actionPayload: any = {
            type: 'cta_url',
            action: { displayText: phoneBtn.text, url: telUrl },
            displayText: phoneBtn.text,
            url: telUrl
          };
          if (process.env.NODE_ENV !== 'production') {
            console.log('[UnifiedEditingStep] Switching to CTA TEL', actionPayload);
          }
          onMessageUpdate({ type: 'cta_url' as any, action: actionPayload });
          clearValidation();
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[UnifiedEditingStep] Using Reply Buttons', backendButtons);
          }
          onMessageUpdate({
            type: 'button' as any,
            action: {
              type: 'button',
              buttons: backendButtons,
            } as any,
          });
          // Validate buttons immediately
          validateField('action.buttons', backendButtons, {
            ...message,
            action: { type: 'button', buttons: backendButtons },
          });
        }
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  const handleReactionChange = useCallback(
    (reaction: LocalButtonReaction) => {
      // Permitir coexistência: sempre enviar os dois campos conforme presentes
      const centralReaction: Partial<CentralButtonReaction> = {
        buttonId: reaction.buttonId,
        type: (reaction.reaction?.type as any) || 'emoji',
        isActive: true,
      };

      if (reaction.reaction?.type === 'emoji') {
        centralReaction.emoji = reaction.reaction.value;
      }
      if (reaction.reaction?.type === 'text') {
        centralReaction.textResponse = reaction.reaction.value;
      }

      onReactionUpdate(reaction.buttonId, centralReaction);
    },
    [onReactionUpdate]
  );

  const handleReactionRemove = useCallback(
    (buttonId: string) => {
      onReactionUpdate(buttonId, { buttonId });
    },
    [onReactionUpdate]
  );

  // Handle next step
  const handleNext = useCallback(async () => {
    // Sanitizar header vazio (opcional) antes de validar
    if (message.header?.type === "text" && !message.header.content?.trim()) {
      onMessageUpdate({ header: undefined });
    }

    // Forçar uma validação síncrona imediata para evitar estado obsoleto do debounce
    const immediate = await validateMessage({ ...message });
    if (immediate.isValid && canProceed()) {
      onNext();
    } else {
      toast.error("Please fix validation errors before proceeding");
    }
  }, [validateMessage, message, canProceed, onNext, onMessageUpdate]);

  // Instagram template type determination
  const getInstagramTemplateType = useCallback(() => {
    const bodyLength = message.body.text.length;
    const hasImage =
      message.header?.type === "image" && message.header?.content;

    if (bodyLength > 640) {
      const isOverQuickRepliesLimit =
        bodyLength > VALIDATION_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH;
      return {
        type: "quick_replies",
        reason: `Quick Replies (${bodyLength} chars > 640)${isOverQuickRepliesLimit ? " - EXCEDE LIMITE INSTAGRAM" : ""}`,
        isOverLimit: isOverQuickRepliesLimit,
      };
    } else if (bodyLength <= 80) {
      return {
        type: "generic",
        reason: `Generic Template (${bodyLength} chars ≤ 80)`,
      };
    } else {
      return {
        type: "button",
        reason: `Button Template (${bodyLength} chars: 81-640)`,
      };
    }
  }, [message.body.text, message.header]);

  const instagramTemplate = getInstagramTemplateType();

  // Check if form has errors
  const hasErrors = validationState.hasErrors || !canProceed();

  // Normalize reactions from backend to always expose textResponse
  const normalizedReactions = useMemo(() => {
    return (reactions || []).map((r) => ({
      ...r,
      textResponse: (r as any).textResponse ?? (r as any).textReaction ?? undefined,
    }));
  }, [reactions]);

  // Function to resolve variables in text
  const resolveVariables = useCallback((text: string): string => {
    if (!text || !variables.length) return text;
    
    let resolvedText = text;
    variables.forEach(variable => {
      const regex = new RegExp(`\\{\\{${variable.chave}\\}\\}`, 'g');
      resolvedText = resolvedText.replace(regex, variable.valor);
    });
    
    return resolvedText;
  }, [variables]);

  // Create a resolved version of the message for preview (mantendo nomes)
  const resolvedMessage = useMemo((): InteractiveMessage => {
    const resolvedVars: Record<string, string> = {};
    variables.forEach(v => (resolvedVars[v.chave] = v.valor));

    const headerContentSafe = message.header
      ? message.header.type === 'text'
        ? resolveVariables(message.header.content || '')
        : (message.header.content || '')
      : '';
    const bodyText = resolveVariables(message.body.text);
    const footerText = message.footer ? resolveVariables(message.footer.text) : undefined;

    return {
      ...message,
      header: message.header ? { ...message.header, content: headerContentSafe } : undefined,
      body: { ...message.body, text: bodyText },
      footer: message.footer ? { ...message.footer, text: footerText || '' } : undefined,
    };
  }, [message, variables, resolveVariables]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Step Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Edit Message Content</h2>
          <p className="text-sm text-muted-foreground">
            Configure your message content and see a real-time preview
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Step 2 of 3
        </Badge>
      </div>

      {/* Main Content - Dual Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Panel - Configuration (60%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Message Name Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Message Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message-name" className="text-sm font-medium">
                  Message Name *
                </Label>
                <Input
                  id="message-name"
                  value={message.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter a descriptive name for this message"
                  disabled={disabled}
                  className={cn(
                    !isFieldValid("name") &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                />
                <div className="flex justify-between items-center text-xs">
                  <div className="text-muted-foreground">
                    Used for internal organization and tracking
                  </div>
                  <Badge
                    variant={
                      message.name.length >
                      VALIDATION_LIMITS.NAME_MAX_LENGTH * 0.8
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {message.name.length}/{VALIDATION_LIMITS.NAME_MAX_LENGTH}
                  </Badge>
                </div>
                {!isFieldValid("name") && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages("name")[0]}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Header Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Header (Optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add a header to make your message more engaging
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Header Type</Label>
                <Select
                  value={message.header?.type || "text"}
                  onValueChange={(value: HeaderType) =>
                    handleHeaderTypeChange(value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <Type className="h-4 w-4" />
                        Text Header
                      </div>
                    </SelectItem>
                    <SelectItem value="image">
                      <div className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Image Header
                      </div>
                    </SelectItem>
                    <SelectItem value="video">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Video Header
                      </div>
                    </SelectItem>
                    <SelectItem value="document">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Document Header
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(message.header?.type || "text") === "text" ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Header Text</Label>
                  <Input
                    value={message.header?.content ?? ""}
                    onChange={(e) => handleHeaderContentChange(e.target.value)}
                    placeholder="Enter header text..."
                    disabled={disabled}
                    maxLength={VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH}
                    className={cn(
                      !isFieldValid("header.content") &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <div className="flex justify-between items-center text-xs">
                    <div className="text-muted-foreground">
                      Keep it short and impactful
                    </div>
                    <Badge
                      variant={
                        (message.header?.content?.length || 0) >
                        VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH * 0.8
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {(message.header?.content?.length || 0)}/
                      {VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH}
                    </Badge>
                  </div>
                  {!isFieldValid("header.content") && (
                    <div className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      <span>{getErrorMessages("header.content")[0]}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <MinIOMediaUpload
                    uploadedFiles={headerMediaFiles}
                    setUploadedFiles={(files) => {
                      setHeaderMediaFiles(files);
                      if (Array.isArray(files) && files.length > 0) {
                        const file = files[0];
                        if (file && file.url) {
                          handleHeaderContentChange(file.url);
                        }
                      }
                    }}
                    allowedTypes={
                      message.header?.type === "image"
                        ? ["image/jpeg", "image/png", "image/jpg"]
                        : message.header?.type === "video"
                          ? ["video/mp4", "video/webm"]
                          : [
                              "application/pdf",
                              "application/msword",
                              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            ]
                    }
                    title={`Upload de ${message.header?.type === "image" ? "Imagem" : message.header?.type === "video" ? "Vídeo" : "Documento"}`}
                    description={`Faça upload de ${message.header?.type === "image" ? "uma imagem" : message.header?.type === "video" ? "um vídeo" : "um documento"} para o cabeçalho da mensagem`}
                    maxFiles={1}
                    onUploadComplete={(file: MinIOMediaFile) => {
                      if (file && file.url) {
                        handleHeaderContentChange(file.url);
                      }
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Message Body *</CardTitle>
              <p className="text-sm text-muted-foreground">
                The main content of your message
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Body Text</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTextEditor("body")}
                    disabled={disabled}
                  >
                    <Type className="h-3 w-3 mr-1" />
                    Rich Editor
                  </Button>
                </div>

                <WhatsAppTextEditor
                  initialText={message.body.text}
                  onChange={handleBodyTextChange}
                  onSave={(text) => handleBodyTextChange(text)}
                  placeholder="Enter your message content..."
                  maxLength={VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH}
                  inline={true}
                  showPreview={false}
                  accountId="mtf-diamante"
                  className={cn(
                    !isFieldValid("body.text") && "border-destructive"
                  )}
                />

                {/* Character counters */}
                <div className="flex justify-between items-center text-xs">
                  <div className="text-muted-foreground">
                    {instagramTemplate.type === "quick_replies" && (
                      <span className="font-medium">
                        Instagram Quick Replies: {message.body.text.length}/
                        {VALIDATION_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {instagramTemplate.type === "quick_replies" &&
                      message.body.text.length >
                        VALIDATION_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH && (
                        <Badge variant="destructive" className="text-xs">
                          EXCEDE LIMITE INSTAGRAM
                        </Badge>
                      )}
                    <Badge
                      variant={
                        message.body.text.length >
                        VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH * 0.9
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {message.body.text.length}/
                      {VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH}
                    </Badge>
                  </div>
                </div>

                {!isFieldValid("body.text") && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages("body.text")[0]}</span>
                  </div>
                )}

                {/* Instagram Template Info */}
                <div
                  className={cn(
                    "mt-3 p-3 rounded-lg border",
                    instagramTemplate.type === "quick_replies"
                      ? instagramTemplate.isOverLimit
                        ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                        : "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800"
                      : instagramTemplate.type === "generic"
                        ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                        : "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Info
                      className={cn(
                        "h-4 w-4 mt-0.5 flex-shrink-0",
                        instagramTemplate.type === "quick_replies"
                          ? instagramTemplate.isOverLimit
                            ? "text-red-600 dark:text-red-400"
                            : "text-yellow-600 dark:text-yellow-400"
                          : instagramTemplate.type === "generic"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-green-600 dark:text-green-400"
                      )}
                    />
                    <div
                      className={cn(
                        "text-xs",
                        instagramTemplate.type === "quick_replies"
                          ? instagramTemplate.isOverLimit
                            ? "text-red-700 dark:text-red-300"
                            : "text-yellow-700 dark:text-yellow-300"
                          : instagramTemplate.type === "generic"
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-green-700 dark:text-green-300"
                      )}
                    >
                      <p className="font-medium mb-1">
                        Instagram Template:{" "}
                        {instagramTemplate.type.toUpperCase().replace("_", " ")}
                      </p>
                      <p>{instagramTemplate.reason}</p>
                      {instagramTemplate.type === "generic" && (
                        <p className="mt-1">
                          • Suporta imagem, título, subtítulo e botões
                        </p>
                      )}
                      {instagramTemplate.type === "button" && (
                        <p className="mt-1">
                          • Apenas texto e botões (imagem e rodapé serão
                          descartados)
                        </p>
                      )}
                      {instagramTemplate.type === "quick_replies" && (
                        <>
                          <p className="mt-1">
                            • Texto longo com respostas rápidas (imagem e rodapé
                            serão descartados)
                          </p>
                          {instagramTemplate.isOverLimit && (
                            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-800">
                              <p className="font-semibold text-red-800 dark:text-red-200">
                                ⚠️ AVISO IMPORTANTE:
                              </p>
                              <p className="text-red-700 dark:text-red-300">
                                Esta mensagem excede o limite de{" "}
                                {
                                  VALIDATION_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH
                                }{" "}
                                caracteres para Quick Replies do Instagram.
                                <strong>
                                  Esta mensagem não será vinculada ao Instagram.
                                </strong>
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Footer (Optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add additional context or information
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Footer Text</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTextEditor("footer")}
                    disabled={disabled}
                  >
                    <Type className="h-3 w-3 mr-1" />
                    Rich Editor
                  </Button>
                </div>

                <Input
                  value={message.footer?.text || ""}
                  onChange={(e) => handleFooterTextChange(e.target.value)}
                  placeholder="Enter footer text..."
                  disabled={disabled}
                  maxLength={VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
                  className={cn(
                    !isFieldValid("footer.text") &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                />

                <div className="flex justify-between items-center text-xs">
                  <div className="text-muted-foreground">
                    Usually used for disclaimers or additional info
                  </div>
                  <Badge
                    variant={
                      (message.footer?.text?.length || 0) >
                      VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH * 0.8
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {message.footer?.text?.length || 0}/
                    {VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
                  </Badge>
                </div>

                {!isFieldValid("footer.text") && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages("footer.text")[0]}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Buttons Section - Only for button type messages */}
  {(
    message.type === "button" ||
    message.action?.type === "button" ||
    Array.isArray((message.action as any)?.buttons) ||
    Array.isArray((message as any)?.content?.action?.buttons) ||
    buttons.length > 0
  ) && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Interactive Buttons</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add buttons for user interaction
                </p>
              </CardHeader>
              <CardContent>
                <ButtonManager
                  buttons={buttons}
                  reactions={reactions.map(convertCentralToLocal)}
                  onChange={handleButtonsChange}
                  onReactionChange={(reactions) => {
                    reactions.forEach((reaction) => {
                      handleReactionChange(reaction);
                    });
                  }}
                  maxButtons={VALIDATION_LIMITS.BUTTON_MAX_COUNT}
                  disabled={disabled}
                  showReactionConfig={false} // We'll handle this separately
                  idPrefix={channelType === 'Channel::Instagram' ? 'ig_' : undefined}
                />

                {!isFieldValid("action.buttons") && (
                  <div className="flex items-center gap-1 text-sm text-destructive mt-2">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages("action.buttons")[0]}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CTA URL Section */}
          {isCtaUrl && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">CTA URL</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Configure o texto do botão e a URL do CTA
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Button Label</Label>
                  <Input
                    value={currentCtaDisplay}
                    onChange={(e) => handleCtaDisplayChange(e.target.value)}
                    placeholder="Ex.: Abrir link"
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">URL</Label>
                  <Input
                    value={currentCtaUrl}
                    onChange={(e) => handleCtaUrlChange(e.target.value)}
                    placeholder="https://exemplo.com ou tel:+5511999999999"
                    disabled={disabled}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Preview (40%) */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Live Preview</CardTitle>
                <p className="text-sm text-muted-foreground">
                  See how your message will appear to recipients
                </p>
              </CardHeader>
              <CardContent>
                <InteractivePreview
                  message={resolvedMessage}
                  reactions={normalizedReactions}
                  showReactionIndicators={true}
                  showReactionConfig={true}
                  onButtonReactionChange={(buttonId, reaction) => {
                    // Permitir coexistência: atualizar seletivamente sem apagar o outro campo
                    const reactionUpdate: Partial<CentralButtonReaction> = {
                      buttonId,
                      isActive: true,
                    };
                    if (typeof reaction.emoji === 'string') {
                      reactionUpdate.type = 'emoji' as any;
                      reactionUpdate.emoji = reaction.emoji;
                    }
                    if (typeof reaction.textResponse === 'string') {
                      reactionUpdate.type = 'text' as any;
                      reactionUpdate.textResponse = reaction.textResponse;
                    }
                    onReactionUpdate(buttonId, reactionUpdate);
                  }}
                  debounceMs={300}
                  className="min-h-[400px]"
                />

                {/* Preview Info */}
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">Preview Notes:</p>
                      <ul className="space-y-1">
                        <li>• Changes update in real-time</li>
                        <li>• ⚡️ icon indicates buttons with reactions</li>
                        <li>• Preview shows WhatsApp-style formatting</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="border-t" />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Type Selection
        </Button>

        <div className="flex items-center gap-4">
          {hasErrors && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>Please fix errors before continuing</span>
            </div>
          )}

          <Button
            onClick={handleNext}
            disabled={disabled || hasErrors}
            className="flex items-center gap-2"
          >
            Continue to Review
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Text Editor Modals */}
      {showTextEditor === "body" && (
        <WhatsAppTextEditor
          initialText={message.body.text}
          onSave={(text) => {
            handleBodyTextChange(text);
            setShowTextEditor(null);
          }}
          onClose={() => setShowTextEditor(null)}
          placeholder="Enter your message content..."
          maxLength={VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH}
          showPreview={false}
          accountId="mtf-diamante"
        />
      )}

      {showTextEditor === "footer" && (
        <WhatsAppTextEditor
          initialText={message.footer?.text || ""}
          onSave={(text) => {
            handleFooterTextChange(text);
            setShowTextEditor(null);
          }}
          onClose={() => setShowTextEditor(null)}
          placeholder="Enter footer text..."
          maxLength={VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
          showPreview={false}
          accountId="mtf-diamante"
        />
      )}

      {/* Reaction Configuration Modal */}
      {reactionConfigButton && (
        <ReactionConfigManager
          buttonId={reactionConfigButton}
          buttonText={
            buttons.find((b) => b.id === reactionConfigButton)?.text || ""
          }
          currentReaction={
            reactions.find((r) => r.buttonId === reactionConfigButton)
              ? convertCentralToLocal(
                  reactions.find((r) => r.buttonId === reactionConfigButton)!
                )
              : undefined
          }
          onReactionChange={handleReactionChange}
          onReactionRemove={() => handleReactionRemove(reactionConfigButton)}
          isOpen={true}
          onClose={() => setReactionConfigButton(null)}
        />
      )}
    </div>
  );
};

export default UnifiedEditingStep;
