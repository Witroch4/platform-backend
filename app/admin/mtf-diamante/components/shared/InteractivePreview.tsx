"use client";

import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smile, Settings, Zap, FileText, Download, Info, List, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { ButtonReactionPicker } from "./ButtonReactionPicker";
import { WhatsAppTextEditor } from "./WhatsAppTextEditor";
import { toast } from "sonner";
import type {
  InteractiveMessage,
  InteractiveMessageWithContent,
  ButtonReaction,
  QuickReplyButton,
  MessageHeader,
} from "@/types/interactive-messages";

// Debounce hook for real-time updates
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Process WhatsApp formatting (bold, italic, strikethrough, etc.)
const processWhatsAppFormatting = (text: string): string => {
  if (!text) return text;

  return text
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/~(.*?)~/g, "<del>$1</del>")
    .replace(
      /`(.*?)`/g,
      '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">$1</code>'
    )
    .replace(
      /^> (.+)$/gm,
      '<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400">$1</blockquote>'
    )
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\n/g, "<br>");
};

interface InteractivePreviewProps {
  message: InteractiveMessage;
  reactions?: ButtonReaction[];
  onButtonClick?: (buttonId: string) => void;
  showReactionIndicators?: boolean;
  showReactionConfig?: boolean;
  onButtonReactionChange?: (
    buttonId: string,
    reaction: { emoji?: string; textResponse?: string; action?: string }
  ) => void;
  className?: string;
  title?: string;
  debounceMs?: number;
  inboxId?: string;
  templateName?: string; // Nome do template/mensagem para exibir no badge
  channelType?: string; // Tipo do canal para controlar abas disponíveis
}

export function InteractivePreview({
  message,
  reactions = [],
  onButtonClick,
  showReactionIndicators = true,
  showReactionConfig = false,
  onButtonReactionChange,
  className = "",
  title,
  debounceMs = 300,
  inboxId,
  templateName,
  channelType,
}: InteractivePreviewProps) {
  const { theme } = useTheme();
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showTextEditor, setShowTextEditor] = useState<string | null>(null);
  const [configMode, setConfigMode] = useState(false);
  const [showAllButtons, setShowAllButtons] = useState(false);
  const [actionConfig, setActionConfig] = useState<{ buttonId: string; defaultMode: 'send_template' | 'send_interactive' } | null>(null);

  // Use immediate message for faster preview, only debounce for heavy operations
  const debouncedMessage = useMemo(() => message, [message]);

  // Memoize and preload WhatsApp background for faster rendering
  const whatsappBackground = useMemo(() => {
    const bgUrl = theme === "dark" ? "/fundo_whatsapp_black.jpg" : "/fundo_whatsapp.jpg";

    // Preload background image for immediate display
    if (typeof window !== 'undefined') {
      const img = new Image();
      img.src = bgUrl;
    }

    return bgUrl;
  }, [theme]);

  // Get reaction for a button (merge multiple entries per buttonId)
  const getButtonReaction = useCallback(
    (buttonId: string) => {
      const entries = reactions.filter((r) => r.buttonId === buttonId);
      if (entries.length === 0) return undefined as any;
      const merged: any = { buttonId };
      for (const r of entries) {
        if (r.emoji) merged.emoji = r.emoji;
        if (r.textResponse) merged.textResponse = r.textResponse;
        if (r.action) merged.action = r.action;
      }

      // Debug para todas as ações
      if (merged.action) {
        console.log('🔍 [InteractivePreview] Reaction com action encontrada:', {
          buttonId,
          action: merged.action,
          type: typeof merged.action,
          merged,
          originalEntries: entries,
          hasReaction: !!(merged.emoji || merged.textResponse || merged.action)
        });
      }

      return merged as any;
    },
    [reactions]
  );

  // Get buttons from message action (multiple sources like MensagensInterativasTab)
  const buttons = useMemo(() => {
    const source: any = debouncedMessage;
    const action: any = source.action || {};

    // Coletar botões de múltiplas fontes possíveis
    const candidates: any[] = [];

    // 1. Action direto (formato padrão WhatsApp)
    if (Array.isArray(action?.buttons)) candidates.push(...action.buttons);

    // 2. Quick replies (Instagram/Facebook)
    if (Array.isArray(action?.quick_replies)) candidates.push(...action.quick_replies);

    // 3. Botões no nível raiz da mensagem
    if (Array.isArray(source.botoes)) candidates.push(...source.botoes);

    // 4. Content.action (dados salvos no genericPayload)
    if (Array.isArray(source.content?.action?.buttons))
      candidates.push(...source.content.action.buttons);
    if (Array.isArray(source.content?.action?.quick_replies))
      candidates.push(...source.content.action.quick_replies);

    // 5. ActionReplyButton (formato alternativo)
    if (Array.isArray(source.actionReplyButton?.buttons))
      candidates.push(...source.actionReplyButton.buttons);
    if (Array.isArray(source.interactiveContent?.actionReplyButton?.buttons))
      candidates.push(...source.interactiveContent.actionReplyButton.buttons);
    if (Array.isArray(source.content?.interactiveContent?.actionReplyButton?.buttons))
      candidates.push(...source.content.interactiveContent.actionReplyButton.buttons);

    // Remove duplicados por id e normaliza
    const seen = new Map<string, any>();
    for (const btn of candidates) {
      const id = btn.id || btn?.reply?.id || btn.payload || `btn_${Math.random()}`;
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          title: btn.title || btn?.reply?.title || btn.titulo || btn.text || '',
          type: btn.type || 'reply',
          payload: btn.payload || id
        });
      }
    }

    return Array.from(seen.values());
  }, [debouncedMessage]);

  // Get carousel elements from message action
  const carouselElements = useMemo(() => {
    if (!debouncedMessage || debouncedMessage.type !== 'generic') {
      return [] as any[];
    }

    const source: InteractiveMessageWithContent = debouncedMessage as InteractiveMessageWithContent;
    const action = (source.action as any) || {};

    let elements: any[] = Array.isArray(action.elements)
      ? action.elements
      : Array.isArray(action.action?.elements)
        ? action.action.elements
        : [];

    const content = source.content || {};
    const contentAction = (content as any)?.action;

    if (!elements.length && Array.isArray(contentAction?.elements)) {
      elements = contentAction.elements;
    }

    if (!elements.length && Array.isArray(content?.genericPayload?.elements)) {
      elements = content.genericPayload.elements;
    }

    return Array.isArray(elements)
      ? elements.map((el: any) => ({
          ...el,
          buttons: Array.isArray(el.buttons) ? el.buttons : [],
        }))
      : [];
  }, [debouncedMessage]);

  // CTA URL preview support
  const ctaUrl = useMemo(() => {
    const action: any = debouncedMessage.action || {};
    const isCta = debouncedMessage.type === 'cta_url' || action?.type === 'cta_url' || action?.name === 'cta_url';
    if (!isCta) return null as any;
    const displayText = action.action?.displayText || action.displayText || action.parameters?.display_text || action?.cta_text || 'Abrir link';
    const url = action.action?.url || action.url || action.parameters?.url || action?.cta_url || '';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InteractivePreview] CTA detected', { messageType: debouncedMessage.type, action });
    }
    return { displayText, url } as { displayText: string; url: string };
  }, [debouncedMessage.type, debouncedMessage.action]);

  // Handle button click in preview mode
  const handleButtonClick = useCallback(
    (button: QuickReplyButton) => {
      if (onButtonClick) {
        onButtonClick(button.id);
        return;
      }

      if (!showReactionConfig) {
        // Normal preview mode - just show what would happen
        const reaction = getButtonReaction(button.id);
        if (reaction?.emoji) {
          toast.success(`Reação configurada: ${reaction.emoji}`, {
            description: `Será enviada quando "${button.title}" for clicado`,
          });
        } else if (reaction?.textResponse) {
          toast.success(`Mensagem configurada: "${reaction.textResponse}"`, {
            description: `Será enviada quando "${button.title}" for clicado`,
          });
        } else {
          toast.info(`Botão "${button.title}" clicado`, {
            description: "Nenhuma reação configurada para este botão",
          });
        }
        return;
      }

      // Config mode - open emoji picker
      if (configMode) {
        setShowEmojiPicker(button.id);
      }
    },
    [onButtonClick, showReactionConfig, getButtonReaction, configMode]
  );

  // Handle emoji selection
  const handleEmojiSelect = useCallback(
    (buttonId: string, emoji: string) => {
      if (emoji === "TEXT_RESPONSE") {
        // Open text editor
        setShowEmojiPicker(null);
        setShowTextEditor(buttonId);
      } else if (emoji === "HANDOFF_ACTION") {
        // Configure handoff action
        onButtonReactionChange?.(buttonId, { action: "handoff" });
        setShowEmojiPicker(null);
        toast.success(`🚨 Transferência para atendente configurada para o botão`);
      } else if (emoji.startsWith('send_template:') || emoji.startsWith('send_interactive:')) {
        // Tokens retornados pelo ButtonReactionPicker (Tabs Templates/Interativas)
        onButtonReactionChange?.(buttonId, { action: emoji });
        setShowEmojiPicker(null);

        // Feedback visual imediato com detalhes do que foi configurado
        const isTemplate = emoji.startsWith('send_template:');
        const configuredId = emoji.split(':')[1];

        toast.success(
          isTemplate
            ? `📄 Template configurado para o botão`
            : `📱 Mensagem interativa configurada para o botão`,
          {
            description: `ID: ${configuredId}`,
            duration: 3000,
          }
        );
      } else if (emoji === "SEND_TEMPLATE") {
        setShowEmojiPicker(null);
        setActionConfig({ buttonId, defaultMode: 'send_template' });
      } else if (emoji === "SEND_INTERACTIVE") {
        setShowEmojiPicker(null);
        setActionConfig({ buttonId, defaultMode: 'send_interactive' });
      } else {
        // Configure emoji (não apaga texto existente)
        onButtonReactionChange?.(buttonId, { emoji });
        setShowEmojiPicker(null);
        toast.success(`Emoji ${emoji} configurado para o botão`);
      }
    },
    [onButtonReactionChange]
  );

  // Handle text response save
  const handleTextResponseSave = useCallback(
    (buttonId: string, text: string) => {
      // Configure texto (não apaga emoji existente)
      onButtonReactionChange?.(buttonId, { textResponse: text });
      setShowTextEditor(null);
      toast.success("Resposta de texto configurada para o botão");
    },
    [onButtonReactionChange]
  );

  // Remove reaction
  const removeReaction = useCallback(
    (buttonId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onButtonReactionChange?.(buttonId, { emoji: "", textResponse: "", action: "" });
      toast.success("Reação removida");
    },
    [onButtonReactionChange]
  );


  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with title and config toggle */}
      {(title || showReactionConfig || templateName) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title && <h3 className="text-lg font-semibold">{title}</h3>}
            {templateName && (
              <Badge variant="outline" className="text-xs">
                {templateName}
              </Badge>
            )}
          </div>
          {showReactionConfig && (
            <div className="flex items-center gap-2">
              <Button
                variant={configMode ? "default" : "outline"}
                
                onClick={() => setConfigMode(!configMode)}
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                {configMode ? "Sair do Config" : "Configurar Reações"}
              </Button>
              {configMode && (
                <Badge variant="secondary" className="text-xs">
                  Modo Configuração Ativo
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* WhatsApp-style preview */}
      <div className="flex justify-center items-center w-full">
        <div
          className={cn(
            "whatsapp-preview rounded-lg p-4 max-w-sm w-full mx-auto",
            "bg-cover bg-center bg-no-repeat min-h-[300px]",
            "relative flex justify-center"
          )}
          style={{
            backgroundImage: `url('${whatsappBackground}')`,
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-md border border-gray-200 dark:border-gray-700 w-full">
            {/* Header Text */}
            {(() => {
              const header = debouncedMessage.header || (debouncedMessage as any).content?.header;
              return header?.type === "text" && header.content && (
                <div
                  className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
                  dangerouslySetInnerHTML={{
                    __html: processWhatsAppFormatting(header.content),
                  }}
                />
              );
            })()}

            {/* Header Media - Force render if there's any media URL */}
            {(() => {
              const header = debouncedMessage.header || (debouncedMessage as any).content?.header;

              // Verificar se existe URL de mídia, independente do tipo
              if (header) {
                const mediaUrl = header.media_url || header.mediaUrl || header.content || (header as any).url || (header as any).link;
                const isImageUrl = mediaUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl);

                // Log apenas se há mudança de tipo suspeita
                if (header?.type === 'text' && mediaUrl) {
                  console.log('[InteractivePreview] ⚠️ Header type is "text" but has media URL:', {
                    headerType: header?.type,
                    mediaUrl: mediaUrl.substring(0, 50) + '...'
                  });
                }

                // FORÇA a renderização se há URL válida, ignorando tipo completamente
                if (mediaUrl && mediaUrl.trim() !== "") {
                  return (
                    <div className="mb-2 relative flex justify-center">
                      <div className="relative">
                        <img
                          src={mediaUrl}
                          alt="Header media"
                          className="max-w-full h-auto rounded-lg max-h-48 object-cover transition-opacity duration-200"
                          loading="eager"
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.opacity = "1";
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                          style={{ opacity: 0 }}
                        />
                      </div>
                    </div>
                  );
                }
              }

              return null;
            })()}

            {/* Body */}
            {(() => {
              const bodyText = debouncedMessage.body?.text ||
                              (debouncedMessage as any).content?.body?.text ||
                              (debouncedMessage as any).texto ||
                              "";
              return bodyText && (
                <div
                  className="text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
                  dangerouslySetInnerHTML={{
                    __html: processWhatsAppFormatting(bodyText),
                  }}
                />
              );
            })()}

            {/* Footer */}
            {(() => {
              const footerText = debouncedMessage.footer?.text ||
                                (debouncedMessage as any).content?.footer?.text;
              return footerText && (
                <div
                  className="text-xs text-gray-500 dark:text-gray-400 mb-2 break-words overflow-wrap-anywhere"
                  dangerouslySetInnerHTML={{
                    __html: processWhatsAppFormatting(footerText),
                  }}
                />
              );
            })()}

            {/* CTA URL */}
            {ctaUrl && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (ctaUrl.url) window.open(ctaUrl.url, '_blank', 'noopener');
                  }}
                  className={cn(
                    "w-full p-2 text-sm border rounded transition-colors text-left",
                    "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                    "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  )}
                >
                  <span>{ctaUrl.displayText || 'Abrir link'}</span>
                </button>
              </div>
            )}

            {/* Carousel Elements */}
            {!ctaUrl && carouselElements.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">
                  Carrossel ({carouselElements.length} elementos)
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {carouselElements.map((element: any, index: number) => (
                    <div key={index} className="flex-shrink-0 w-48 border rounded-lg bg-gray-50 dark:bg-gray-800">
                      {/* Element Image */}
                      {element.image_url && (
                        <div className="w-full h-32 mb-2">
                          <img
                            src={element.image_url}
                            alt={element.title}
                            className="w-full h-full object-cover rounded-t-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                        </div>
                      )}

                      <div className="p-2">
                        {/* Element Title */}
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {element.title}
                        </div>

                        {/* Element Subtitle */}
                        {element.subtitle && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                            {element.subtitle}
                          </div>
                        )}

                        {/* Element Buttons */}
                        {element.buttons && element.buttons.length > 0 && (
                          <div className="space-y-1">
                            {element.buttons.map((button: any, btnIndex: number) => {
                              const buttonId = button.id || `${element.id || index}_btn_${btnIndex}`;
                              const reaction = getButtonReaction(buttonId);
                              const hasReaction = reaction?.emoji || reaction?.textResponse || reaction?.action;

                              return (
                                <button
                                  key={btnIndex}
                                  onClick={() => handleButtonClick({ id: buttonId, title: button.title })}
                                  className={cn(
                                    "w-full p-1.5 text-xs border rounded transition-colors text-left",
                                    "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                                    "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                                    configMode &&
                                      showReactionConfig &&
                                      "ring-1 ring-blue-300 dark:ring-blue-600",
                                    hasReaction &&
                                      "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="truncate">{button.title}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {showReactionIndicators && hasReaction && (
                                        <Zap className="h-2 w-2 text-yellow-500" />
                                      )}
                                      {reaction?.emoji && (
                                        <span className="text-xs">{reaction.emoji}</span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Default Action Button */}
                        {element.default_action?.url && (
                          <button
                            onClick={() => window.open(element.default_action.url, '_blank', 'noopener')}
                            className="w-full mt-1 p-1.5 text-xs border rounded text-center text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Abrir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            {!ctaUrl && !carouselElements.length && buttons.length > 0 && (
              <div className="mt-3 space-y-1">
                {/* Quando houver mais de 3 botões, exibir 2 + "Ver todas as opções" */}
                {buttons.length > 3 ? (
                  <>
                    {buttons.slice(0, 2).map((button) => {
                      const reaction = getButtonReaction(button.id);
                      const hasReaction = reaction?.emoji || reaction?.textResponse || reaction?.action;

                      // Debug específico para verificar se hasReaction está correto
                      if (reaction?.action) {
                        console.log('🔍 [Render Debug] Button render:', {
                          buttonId: button.id,
                          buttonTitle: button.title,
                          reaction,
                          hasReaction,
                          hasEmoji: !!reaction?.emoji,
                          hasTextResponse: !!reaction?.textResponse,
                          hasAction: !!reaction?.action
                        });
                      }

                      return (
                        <div key={button.id} className="relative">
                          <button
                            onClick={() => handleButtonClick(button)}
                            className={cn(
                              "w-full p-2 text-sm border rounded transition-colors text-left",
                              "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                              "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                              configMode &&
                                showReactionConfig &&
                                "ring-2 ring-blue-300 dark:ring-blue-600",
                              hasReaction &&
                                "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{button.title}</span>
                              <div className="flex items-center gap-1">
                                {showReactionIndicators && hasReaction && (
                                  <Zap className="h-3 w-3 text-yellow-500" />
                                )}
                                {reaction?.emoji && (
                                  <span className="text-lg">{reaction.emoji}</span>
                                )}
                                {reaction?.emoji && (
                                  <Badge variant="secondary" className="text-xs">
                                    Emoji
                                  </Badge>
                                )}
                                {reaction?.textResponse && (
                                  <Badge variant="secondary" className="text-xs">
                                    Texto
                                  </Badge>
                                )}
                                {reaction?.action && (
                                  <Badge variant="secondary" className="text-xs">
                                    {reaction.action === 'handoff'
                                      ? 'Atendente'
                                      : (String(reaction.action).startsWith('send_template:')
                                          ? 'Template'
                                          : (String(reaction.action).startsWith('send_interactive:')
                                              ? 'Interativa'
                                              : 'Ação'))}
                                  </Badge>
                                )}
                                {configMode && showReactionConfig && (
                                  <Smile className="h-3 w-3 opacity-50" />
                                )}
                              </div>
                            </div>
                            {reaction?.textResponse && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                "{reaction.textResponse}"
                              </div>
                            )}
                          </button>

                          {hasReaction && configMode && (
                            <button
                              onClick={(e) => removeReaction(button.id, e)}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Linha "Ver todas as opções" */}
                    <button
                      onClick={() => setShowAllButtons((v) => !v)}
                      className={cn(
                        "w-full p-2 text-sm border rounded flex items-center gap-2 justify-center",
                        "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                        "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      )}
                    >
                      <List className="h-4 w-4" />
                      <span>{showAllButtons ? "Ocultar opções" : "Ver todas as opções"}</span>
                      {showAllButtons ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {showAllButtons && (
                      <div className="mt-1 border rounded p-1 max-h-60 overflow-y-auto bg-white/50 dark:bg-gray-900/30">
                        {buttons.map((button) => {
                          const reaction = getButtonReaction(button.id);
                          const hasReaction = reaction?.emoji || reaction?.textResponse || reaction?.action;

                          return (
                            <div key={button.id} className="relative mb-1 last:mb-0">
                              <button
                                onClick={() => handleButtonClick(button)}
                                className={cn(
                                  "w-full p-2 text-sm border rounded transition-colors text-left",
                                  "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                                  "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                                  configMode &&
                                    showReactionConfig &&
                                    "ring-2 ring-blue-300 dark:ring-blue-600",
                                  hasReaction &&
                                    "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{button.title}</span>
                                  <div className="flex items-center gap-1">
                                    {showReactionIndicators && hasReaction && (
                                      <Zap className="h-3 w-3 text-yellow-500" />
                                    )}
                                    {reaction?.emoji && (
                                      <span className="text-lg">{reaction.emoji}</span>
                                    )}
                                    {reaction?.emoji && (
                                      <Badge variant="secondary" className="text-xs">
                                        Emoji
                                      </Badge>
                                    )}
                                    {reaction?.textResponse && (
                                      <Badge variant="secondary" className="text-xs">
                                        Texto
                                      </Badge>
                                    )}
                                    {reaction?.action && (
                                      <Badge variant="secondary" className="text-xs">
                                        {reaction.action === 'handoff'
                                          ? 'Atendente'
                                          : (String(reaction.action).startsWith('send_template:')
                                              ? 'Template'
                                              : (String(reaction.action).startsWith('send_interactive:')
                                                  ? 'Interativa'
                                                  : 'Ação'))}
                                      </Badge>
                                    )}
                                    {configMode && showReactionConfig && (
                                      <Smile className="h-3 w-3 opacity-50" />
                                    )}
                                  </div>
                                </div>
                                {reaction?.textResponse && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                    "{reaction.textResponse}"
                                  </div>
                                )}
                              </button>

                              {hasReaction && configMode && (
                                <button
                                  onClick={(e) => removeReaction(button.id, e)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  // Até 3 botões: renderizar normalmente
                  <>
                    {buttons.map((button) => {
                      const reaction = getButtonReaction(button.id);
                      const hasReaction = reaction?.emoji || reaction?.textResponse || reaction?.action;

                      // Debug específico para verificar se hasReaction está correto
                      if (reaction?.action) {
                        console.log('🔍 [Render Debug] Button render (<=3):', {
                          buttonId: button.id,
                          buttonTitle: button.title,
                          reaction,
                          hasReaction,
                          hasEmoji: !!reaction?.emoji,
                          hasTextResponse: !!reaction?.textResponse,
                          hasAction: !!reaction?.action
                        });
                      }

                      return (
                        <div key={button.id} className="relative">
                          <button
                            onClick={() => handleButtonClick(button)}
                            className={cn(
                              "w-full p-2 text-sm border rounded transition-colors text-left",
                              "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                              "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                              configMode &&
                                showReactionConfig &&
                                "ring-2 ring-blue-300 dark:ring-blue-600",
                              hasReaction &&
                                "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{button.title}</span>
                              <div className="flex items-center gap-1">
                                {showReactionIndicators && hasReaction && (
                                  <Zap className="h-3 w-3 text-yellow-500" />
                                )}
                                {reaction?.emoji && (
                                  <span className="text-lg">{reaction.emoji}</span>
                                )}
                                {reaction?.emoji && (
                                  <Badge variant="secondary" className="text-xs">
                                    Emoji
                                  </Badge>
                                )}
                                {reaction?.textResponse && (
                                  <Badge variant="secondary" className="text-xs">
                                    Texto
                                  </Badge>
                                )}
                                {reaction?.action && (
                                  <Badge variant="secondary" className="text-xs">
                                    {reaction.action === 'handoff'
                                      ? 'Atendente'
                                      : (String(reaction.action).startsWith('send_template:')
                                          ? 'Template'
                                          : (String(reaction.action).startsWith('send_interactive:')
                                              ? 'Interativa'
                                              : 'Ação'))}
                                  </Badge>
                                )}
                                {configMode && showReactionConfig && (
                                  <Smile className="h-3 w-3 opacity-50" />
                                )}
                              </div>
                            </div>
                            {reaction?.textResponse && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                "{reaction.textResponse}"
                              </div>
                            )}
                          </button>

                          {hasReaction && configMode && (
                            <button
                              onClick={(e) => removeReaction(button.id, e)}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* Config mode instructions */}
            {configMode && showReactionConfig && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Smile className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">
                      Modo de Configuração Ativo
                    </p>
                    <p>
                      Clique nos botões acima para configurar reações
                      automáticas que serão enviadas quando os usuários clicarem
                      neles.
                    </p>
                    <p className="mt-1 text-blue-600 dark:text-blue-400">
                      • Escolha um emoji para reação rápida
                    </p>
                    <p className="text-blue-600 dark:text-blue-400">
                      • Ou configure uma resposta de texto personalizada
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Non-config mode info */}
            {!configMode && showReactionConfig && buttons.length > 0 && (
              <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
                <Info className="h-3 w-3 inline mr-1" />
                Ative o "Configurar Reações" para definir respostas automáticas
              </div>
            )}

            {/* Empty state removido para evitar mensagens redundantes */}
          </div>
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <ButtonReactionPicker
          isOpen={true}
          onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
          onClose={() => setShowEmojiPicker(null)}
          inboxId={inboxId}
          channelType={channelType}
        />
      )}

      {actionConfig && (
        <ButtonReactionPicker
          isOpen={true}
          onClose={() => setActionConfig(null)}
          inboxId={inboxId}
          channelType={channelType}
          onEmojiSelect={(value) => {
            if (value === "TEXT_RESPONSE") {
              setShowTextEditor(actionConfig.buttonId);
            } else if (value === "HANDOFF_ACTION") {
              onButtonReactionChange?.(actionConfig.buttonId, { action: 'handoff' });
            } else if (value.startsWith("send_template:")) {
              const templateId = value.replace("send_template:", "");
              onButtonReactionChange?.(actionConfig.buttonId, { action: `send_template:${templateId}` });
            } else if (value.startsWith("send_interactive:")) {
              const messageId = value.replace("send_interactive:", "");
              onButtonReactionChange?.(actionConfig.buttonId, { action: `send_interactive:${messageId}` });
              toast.success(`📱 Mensagem interativa configurada para o botão`);
            } else {
              // É um emoji normal
              onButtonReactionChange?.(actionConfig.buttonId, { emoji: value });
            }
            setActionConfig(null);
          }}
        />
      )}

      {/* WhatsApp Text Editor */}
      {showTextEditor && (() => {
        const buttonReaction = getButtonReaction(showTextEditor);
        const initialText = buttonReaction?.textResponse || "";
        console.log('🔍 [InteractivePreview] Abrindo WhatsAppTextEditor:', {
          showTextEditor,
          buttonReaction,
          initialText,
          hasTextResponse: !!buttonReaction?.textResponse
        });

        return (
          <WhatsAppTextEditor
            onSave={(text) => handleTextResponseSave(showTextEditor, text)}
            onClose={() => setShowTextEditor(null)}
            initialText={initialText}
            placeholder="Digite a resposta que será enviada quando este botão for clicado..."
            key={`text-editor-${showTextEditor}-${initialText}`}
          />
        );
      })()}
    </div>
  );
}
