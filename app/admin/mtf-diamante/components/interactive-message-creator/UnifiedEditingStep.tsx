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
  QuickReplyButton,
  ButtonReaction as CentralButtonReaction,
} from "@/types/interactive-messages";
import type {
  InteractiveButton,
  ButtonReaction as LocalButtonReaction,
} from "../shared/ButtonManager";

// Conversion functions between button types
const convertQuickReplyToInteractive = (
  button: QuickReplyButton
): InteractiveButton => ({
  id: button.id,
  text: button.title,
  type: "reply" as const,
});

const convertInteractiveToQuickReply = (
  button: InteractiveButton
): QuickReplyButton => ({
  id: button.id,
  title: button.text,
  payload: button.id,
  // Include WhatsApp API structure for future compatibility
  type: "reply",
  reply: {
    id: button.id,
    title: button.text,
  },
});

// Conversion functions for ButtonReaction types
const convertCentralToLocal = (
  reaction: CentralButtonReaction
): LocalButtonReaction => ({
  buttonId: reaction.buttonId,
  reaction:
    reaction.type === "emoji" || reaction.type === "text"
      ? {
          type: reaction.type,
          value: reaction.type === "emoji" ? "😊" : "Default text", // Default values
        }
      : undefined,
});

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
}) => {
  const [reactionConfigButton, setReactionConfigButton] = useState<
    string | null
  >(null);
  const [showTextEditor, setShowTextEditor] = useState<
    "body" | "footer" | null
  >(null);

  // State for managing uploaded media files
  const [headerMediaFiles, setHeaderMediaFiles] = useState<MinIOMediaFile[]>(
    message.header?.content
      ? [
          {
            id: "header-media",
            progress: 100,
            status: "success",
            url: message.header.content,
            mime_type:
              message.header?.type === "image"
                ? "image/jpeg"
                : message.header?.type === "video"
                  ? "video/mp4"
                  : "application/pdf",
          },
        ]
      : []
  );

  // Use the new validation hook
  const {
    validationState,
    validateField,
    isFieldValid,
    getFieldErrors,
    canProceed,
    handleValidationError,
  } = useInteractiveMessageValidation(message, reactions, {
    enableRealTimeValidation: true,
    debounceMs: 300,
    validateOnMount: false,
  });

  // Update header media files when message header changes
  useEffect(() => {
    if (message.header?.content && message.header.type !== "text") {
      setHeaderMediaFiles([
        {
          id: "header-media",
          progress: 100,
          status: "success",
          url: message.header.content,
          mime_type:
            message.header?.type === "image"
              ? "image/jpeg"
              : message.header?.type === "video"
                ? "video/mp4"
                : "application/pdf",
        },
      ]);
    } else if (!message.header?.content || message.header.type === "text") {
      setHeaderMediaFiles([]);
    }
  }, [message.header?.content, message.header?.type]);

  // Garantir que o header exista como texto na primeira renderização
  useEffect(() => {
    if (!message.header) {
      onMessageUpdate({ header: { type: "text", content: "" } });
    }
  }, [message.header, onMessageUpdate]);

  // Extract buttons from message action and convert to InteractiveButton format
  const buttons = useMemo(() => {
    if (message.action?.type === "button") {
      return (message.action.buttons || []).map(convertQuickReplyToInteractive);
    }
    return [];
  }, [message.action]);

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

        const updatedHeader: MessageHeader = {
          ...message.header,
          content,
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

  const handleButtonsChange = useCallback(
    (newButtons: InteractiveButton[]) => {
      try {
        // Convert InteractiveButton back to QuickReplyButton
        const quickReplyButtons = newButtons.map(
          convertInteractiveToQuickReply
        );

        onMessageUpdate({
          action: {
            type: "button",
            buttons: quickReplyButtons,
          },
        });
        // Validate buttons immediately
        validateField("action.buttons", quickReplyButtons, {
          ...message,
          action: { type: "button", buttons: quickReplyButtons },
        });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  const handleReactionChange = useCallback(
    (reaction: LocalButtonReaction) => {
      // Convert the local ButtonReaction to the central format
      const centralReaction: Partial<CentralButtonReaction> = {
        buttonId: reaction.buttonId,
        type: (reaction.reaction?.type as any) || "emoji",
        isActive: true,
      };
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
  const handleNext = useCallback(() => {
    if (canProceed()) {
      onNext();
    } else {
      toast.error("Please fix validation errors before proceeding");
    }
  }, [canProceed, onNext]);

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
          {message.type === "button" && (
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
                  reactions={reactions}
                  showReactionIndicators={true}
                  showReactionConfig={true}
                  onButtonReactionChange={(buttonId, reaction) => {
                    // Convert the reaction format to match the expected type
                    const reactionUpdate: Partial<CentralButtonReaction> = {
                      buttonId,
                      type: reaction.emoji ? "emoji" : "text",
                      emoji: reaction.emoji,
                      textResponse: reaction.textResponse,
                      isActive: true,
                    };
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
