"use client";

import type React from "react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMtfData } from "../../context/MtfDataProvider";
import { isInstagramChannel } from "@/types/interactive-messages";

// Import refactored components
import {
  MessageConfiguration,
  HeaderSection,
  BodySection,
  FooterSection,
  ButtonsSection,
  CtaUrlSection,
  NavigationSection,
  PreviewSection,
  VALIDATION_LIMITS,
  convertBackendToInteractive,
  convertInteractiveToBackend,
  convertCentralToLocal,
  generatePrefixedId,
  type UnifiedEditingStepProps,
  type InteractiveButton,
  type LocalButtonReaction,
  type CentralButtonReaction,
} from "./unified-editing-step";

// Import legacy components that are still needed
import { WhatsAppTextEditor } from "../shared/WhatsAppTextEditor";
import { ReactionConfigManager } from "../shared/ReactionConfigManager";
import MinIOMediaUpload, { MinIOMediaFile } from "../shared/MinIOMediaUpload";

// Import validation hook
import { useInteractiveMessageValidation } from "../../hooks/useInteractiveMessageValidation";

export const UnifiedEditingStep: React.FC<UnifiedEditingStepProps> = ({
  message,
  reactions,
  variables = [],
  channelType = 'Channel::WhatsApp',
  onMessageUpdate,
  onReactionUpdate,
  onNext,
  onBack,
  disabled = false,
  className,
  inboxId,
}) => {
  const [reactionConfigButton, setReactionConfigButton] = useState<string | null>(null);
  const [showTextEditor, setShowTextEditor] = useState<"body" | "footer" | null>(null);

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

  // Use the validation hook
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

  // Get MtfData context for reactions management
  const { caixas } = useMtfData();

  // Update header media files when message header changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
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
    }, 150); // Debounce updates

    return () => clearTimeout(timeout);
  }, [message.header?.content, message.header?.media_url, message.header?.mediaUrl, message.header?.type]);

  // Ensure header exists as text on first render
  useEffect(() => {
    if (!message.header) {
      onMessageUpdate({
        header: { type: "text", content: "" },
      });
    }
  }, [message.header, onMessageUpdate]);

  // Extract buttons from message action and convert to InteractiveButton format
  const buttons = useMemo(() => {
    const candidates: any[] = [];
    const fromAction = (message.action as any)?.buttons;
    if (Array.isArray(fromAction)) candidates.push(...fromAction);

    const fromContentAction = (message as any)?.content?.action?.buttons;
    if (Array.isArray(fromContentAction)) candidates.push(...fromContentAction);

    const fromReplyModel = (message as any)?.actionReplyButton?.buttons;
    if (Array.isArray(fromReplyModel)) candidates.push(...fromReplyModel);

    const fromInteractiveContent = (message as any)?.interactiveContent?.actionReplyButton?.buttons;
    if (Array.isArray(fromInteractiveContent)) candidates.push(...fromInteractiveContent);

    const fromContentReplyModel = (message as any)?.content?.interactiveContent?.actionReplyButton?.buttons;
    if (Array.isArray(fromContentReplyModel)) candidates.push(...fromContentReplyModel);

    const unique = new Map<string, any>();
    for (const btn of candidates) {
      const key = btn?.id || btn?.reply?.id || btn?.title || btn?.reply?.title;
      if (key && !unique.has(key)) {
        unique.set(key, btn);
      }
    }

    return Array.from(unique.values()).map((btn, idx) => {
      const converted = convertBackendToInteractive(btn);
      if (!converted.id.startsWith(channelType === 'Channel::Instagram' ? 'ig_' : 'btn_')) {
        converted.id = generatePrefixedId(channelType, converted.id || `${idx}`);
      }
      return converted;
    });
  }, [message.action, (message as any)?.content?.action, (message as any)?.actionReplyButton, (message as any)?.interactiveContent, channelType]);

  // Helper function to get error messages from validation errors
  const getErrorMessages = useCallback(
    (fieldName: string): string[] => {
      const errors = getFieldErrors(fieldName);
      return errors.map((error) => error.message);
    },
    [getFieldErrors]
  );

  // CTA URL handlers and flags
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
      clearValidation();
    },
    [onMessageUpdate, currentCtaDisplay, clearValidation]
  );

  const handleButtonsChange = useCallback(
    (newButtons: InteractiveButton[]) => {
      try {
        const backendButtons = newButtons.map(convertInteractiveToBackend);
        const action = { type: "button" as const, buttons: backendButtons };
        onMessageUpdate({ action });
        validateField("action.buttons", backendButtons, { ...message, action });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  const handleReactionChange = useCallback(
    (reaction: LocalButtonReaction) => {
      const centralReaction: Partial<CentralButtonReaction> = {
        buttonId: reaction.buttonId,
        type: (reaction.reaction?.type as any) || 'emoji',
        isActive: true,
      };

      if (reaction.reaction?.type === 'emoji') {
        centralReaction.emoji = reaction.reaction.value;
        centralReaction.textResponse = undefined;
      }
      if (reaction.reaction?.type === 'text') {
        centralReaction.textResponse = reaction.reaction.value;
        centralReaction.emoji = undefined;
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
    console.log('🔄 [Next] Iniciando validação...');
    
    if (message.header?.type === "text" && !message.header.content?.trim()) {
      console.log('🔧 [Next] Removendo header de texto vazio');
      onMessageUpdate({ header: undefined });
    }

    const messageState = {
      name: message.name,
      type: message.type,
      bodyLength: message.body?.text?.length || 0,
      hasHeader: !!message.header?.content,
      buttonsCount: buttons.length,
      footerLength: message.footer?.text?.length || 0
    };
    console.log('� [Next] Estado da mensagem:', messageState);

    const immediate = await validateMessage({ ...message });
    const canProceedResult = canProceed();
    
    if (immediate.isValid && canProceedResult) {
      console.log('✅ [Next] Validação OK - avançando para próxima etapa');
      onNext();
    } else {
      console.warn('⚠️ [Next] Validação pendente:', {
        validationValid: immediate.isValid,
        canProceed: canProceedResult,
        errorsCount: immediate.errors.length
      });
      toast.error("Por favor, corrija os erros de validação antes de continuar");
    }
  }, [validateMessage, message, canProceed, onNext, onMessageUpdate, buttons]);

  // Check if form has errors
  const hasErrors = validationState.hasErrors || !canProceed();

  // Get all error messages for display
  const allErrorMessages = useMemo(() => {
    const messages: string[] = [];
    
    // Get errors from message validation if available
    if (validationState.messageValidation?.errors) {
      validationState.messageValidation.errors.forEach(error => {
        messages.push(error.message);
      });
    }
    
    // Get field-specific errors
    Object.values(validationState.fieldValidations).forEach(fieldValidation => {
      if (fieldValidation.errors) {
        fieldValidation.errors.forEach(error => {
          messages.push(error.message);
        });
      }
    });
    
    return messages;
  }, [validationState.messageValidation, validationState.fieldValidations]);

  // Normalize reactions from backend
  const normalizedReactions = useMemo(() => {
    return (reactions || []).map((r) => {
      const anyReaction = r as any;
      
      // Se já está no formato correto (com campos diretos type, emoji, textResponse, action)
      if (anyReaction.type && (anyReaction.emoji || anyReaction.textResponse || anyReaction.action)) {
        return anyReaction;
      }
      
      // Se tem o formato .reaction nested
      if (anyReaction.reaction) {
        const nestedReaction = anyReaction.reaction;
        return {
          ...anyReaction,
          type: nestedReaction.type,
          emoji: nestedReaction.type === 'emoji' ? nestedReaction.value : undefined,
          textResponse: nestedReaction.type === 'text' ? nestedReaction.value : undefined,
          action: nestedReaction.type === 'action' ? nestedReaction.value : undefined,
        };
      }
      
      // Converter do formato do backend (textResponse, emoji diretos sem type)
      if (anyReaction.textResponse || anyReaction.textReaction) {
        return {
          ...anyReaction,
          type: 'text',
          textResponse: anyReaction.textResponse || anyReaction.textReaction,
          emoji: undefined,
          action: undefined
        };
      }
      
      if (anyReaction.emoji) {
        return {
          ...anyReaction,
          type: 'emoji',
          emoji: anyReaction.emoji,
          textResponse: undefined,
          action: undefined
        };
      }
      
      if (anyReaction.action) {
        return {
          ...anyReaction,
          type: 'action',
          action: anyReaction.action,
          emoji: undefined,
          textResponse: undefined
        };
      }
      
      // Fallback - manter original
      return {
        ...anyReaction,
        textResponse: anyReaction.textResponse ?? anyReaction.textReaction ?? undefined,
      };
    });
  }, [reactions]);

  // Determine if we should show Header and Footer sections
  // For Instagram Quick Replies, header and footer are not supported
  const isInstagram = isInstagramChannel(channelType);
  const isQuickReplies = message.type === 'quick_replies';
  const shouldShowHeaderAndFooter = !(isInstagram && isQuickReplies);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editing area */}
        <div className="lg:col-span-2 space-y-6">
          <MessageConfiguration
            message={message}
            onMessageUpdate={onMessageUpdate}
            disabled={disabled}
            isFieldValid={isFieldValid}
            getFieldErrors={getFieldErrors}
            handleValidationError={handleValidationError}
            validateField={validateField}
          />

          {shouldShowHeaderAndFooter && (
            <HeaderSection
              message={message}
              onMessageUpdate={onMessageUpdate}
              disabled={disabled}
              isFieldValid={isFieldValid}
              headerMediaFiles={headerMediaFiles}
              setHeaderMediaFiles={setHeaderMediaFiles}
              handleValidationError={handleValidationError}
              validateField={validateField}
              channelType={channelType || undefined}
            />
          )}

          <BodySection
            message={message}
            onMessageUpdate={onMessageUpdate}
            disabled={disabled}
            isFieldValid={isFieldValid}
            validationLimits={VALIDATION_LIMITS}
            channelType={channelType || undefined}
          />

          {shouldShowHeaderAndFooter && (
            <FooterSection
              message={message}
              onMessageUpdate={onMessageUpdate}
              disabled={disabled}
              isFieldValid={isFieldValid}
              validationLimits={VALIDATION_LIMITS}
              channelType={channelType || undefined}
            />
          )}

          <CtaUrlSection
            message={message}
            isCtaUrl={isCtaUrl}
            currentCtaDisplay={currentCtaDisplay}
            currentCtaUrl={currentCtaUrl}
            onCtaDisplayChange={handleCtaDisplayChange}
            onCtaUrlChange={handleCtaUrlChange}
            disabled={disabled}
          />

          {!isCtaUrl && (
            <ButtonsSection
              message={message}
              buttons={buttons}
              reactions={normalizedReactions}
              onButtonsChange={handleButtonsChange}
              onReactionChange={handleReactionChange}
              disabled={disabled}
              channelType={channelType || undefined}
              validationLimits={VALIDATION_LIMITS}
            />
          )}

          <NavigationSection
            onBack={onBack}
            onNext={handleNext}
            disabled={disabled}
            hasErrors={hasErrors}
            errorMessages={allErrorMessages}
          />
        </div>

        {/* Preview area */}
        <div className="lg:col-span-1">
          <PreviewSection
            message={message}
            variables={variables}
            channelType={channelType || undefined}
            reactions={normalizedReactions}
            onReactionChange={(buttonId, reaction) => {
              // Buscar reação existente para manter valores não alterados
              const existingReaction = normalizedReactions.find(r => r.buttonId === buttonId);
              
              const centralReaction: Partial<CentralButtonReaction> = {
                buttonId,
                type: reaction.action ? 'action' : (reaction.emoji ? 'emoji' : 'text'),
                isActive: true,
              };

              // Manter valores existentes e aplicar novas mudanças
              if (existingReaction?.emoji) centralReaction.emoji = existingReaction.emoji;
              if (existingReaction?.textResponse) centralReaction.textResponse = existingReaction.textResponse;
              if (existingReaction?.action) centralReaction.action = existingReaction.action;

              // Aplicar novas mudanças
              if (reaction.action !== undefined) {
                centralReaction.action = reaction.action;
                centralReaction.type = reaction.action ? 'action' : (centralReaction.emoji ? 'emoji' : 'text');
              }
              if (reaction.emoji !== undefined) {
                centralReaction.emoji = reaction.emoji;
                if (!reaction.action) {
                  centralReaction.type = reaction.emoji ? 'emoji' : (centralReaction.textResponse ? 'text' : 'emoji');
                }
              }
              if (reaction.textResponse !== undefined) {
                centralReaction.textResponse = reaction.textResponse;
                if (!reaction.action && !reaction.emoji) {
                  centralReaction.type = reaction.textResponse ? 'text' : 'emoji';
                }
              }

              onReactionUpdate(buttonId, centralReaction);
            }}
          />
        </div>
      </div>

      {/* Legacy modals/editors that are still needed */}
      {showTextEditor === "body" && (
        <WhatsAppTextEditor
          initialText={message.body.text}
          onSave={(text) => {
            onMessageUpdate({ body: { text } });
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
            onMessageUpdate({ footer: { text } });
            setShowTextEditor(null);
          }}
          onClose={() => setShowTextEditor(null)}
          placeholder="Enter footer text..."
          maxLength={VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
          showPreview={false}
          accountId="mtf-diamante"
        />
      )}

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
