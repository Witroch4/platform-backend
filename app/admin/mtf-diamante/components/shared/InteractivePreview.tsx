"use client";

import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smile, Settings, Zap, FileText, Download, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { EmojiPicker } from "./EmojiPicker";
import { WhatsAppTextEditor } from "./WhatsAppTextEditor";
import { toast } from "sonner";
import type {
  InteractiveMessage,
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
    reaction: { emoji?: string; textResponse?: string }
  ) => void;
  className?: string;
  title?: string;
  debounceMs?: number;
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
}: InteractivePreviewProps) {
  const { theme } = useTheme();
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showTextEditor, setShowTextEditor] = useState<string | null>(null);
  const [configMode, setConfigMode] = useState(false);

  // Debounce the message to prevent excessive re-renders during real-time updates
  const debouncedMessage = useDebounce(message, debounceMs);

  // Memoize WhatsApp background to prevent unnecessary recalculations
  const whatsappBackground = useMemo(() => {
    return theme === "dark"
      ? "/fundo_whatsapp_black.jpg"
      : "/fundo_whatsapp.jpg";
  }, [theme]);

  // Get reaction for a button
  const getButtonReaction = useCallback(
    (buttonId: string) => {
      return reactions.find((r) => r.buttonId === buttonId);
    },
    [reactions]
  );

  // Get buttons from message action
  const buttons = useMemo(() => {
    if (!debouncedMessage.action || debouncedMessage.action.type !== "button") {
      return [];
    }
    return debouncedMessage.action.buttons || [];
  }, [debouncedMessage.action]);

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
      } else {
        // Configure emoji
        onButtonReactionChange?.(buttonId, { emoji, textResponse: "" });
        setShowEmojiPicker(null);
        toast.success(`Emoji ${emoji} configurado para o botão`);
      }
    },
    [onButtonReactionChange]
  );

  // Handle text response save
  const handleTextResponseSave = useCallback(
    (buttonId: string, text: string) => {
      onButtonReactionChange?.(buttonId, { emoji: "", textResponse: text });
      setShowTextEditor(null);
      toast.success("Resposta de texto configurada para o botão");
    },
    [onButtonReactionChange]
  );

  // Remove reaction
  const removeReaction = useCallback(
    (buttonId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onButtonReactionChange?.(buttonId, { emoji: "", textResponse: "" });
      toast.success("Reação removida");
    },
    [onButtonReactionChange]
  );

  // Render header media component
  const renderHeaderMedia = useCallback((header: MessageHeader) => {
    const mediaUrl = header.mediaUrl || header.content;

    // Não renderizar se não há URL válida
    if (!mediaUrl || mediaUrl.trim() === "") {
      return null;
    }

    switch (header.type) {
      case "image":
        return (
          <div className="mb-2 relative flex justify-center">
            <div className="relative">
              <img
                src={mediaUrl}
                alt="Header image"
                className="max-w-full h-auto rounded-lg max-h-48 object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            </div>
          </div>
        );

      case "video":
        return (
          <div className="mb-2 relative flex justify-center">
            <div className="relative">
              <video
                src={mediaUrl}
                controls
                className="max-w-full h-auto rounded-lg max-h-48"
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  target.style.display = "none";
                }}
              />
            </div>
          </div>
        );

      case "document":
        return (
          <div className="mb-2 flex justify-center">
            <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border w-full">
              <div className="flex-shrink-0">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {header.filename || "Document"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Documento
                </p>
              </div>
              <div className="flex-shrink-0">
                <Download className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with title and config toggle */}
      {(title || showReactionConfig) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {showReactionConfig && (
            <div className="flex items-center gap-2">
              <Button
                variant={configMode ? "default" : "outline"}
                size="sm"
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
            {debouncedMessage.header?.type === "text" &&
              debouncedMessage.header.content && (
                <div
                  className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
                  dangerouslySetInnerHTML={{
                    __html: processWhatsAppFormatting(
                      debouncedMessage.header.content
                    ),
                  }}
                />
              )}

            {/* Header Media */}
            {debouncedMessage.header &&
              debouncedMessage.header.type !== "text" &&
              renderHeaderMedia(debouncedMessage.header)}

            {/* Body */}
            <div
              className="text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{
                __html: processWhatsAppFormatting(debouncedMessage.body.text),
              }}
            />

            {/* Footer */}
            {debouncedMessage.footer?.text && (
              <div
                className="text-xs text-gray-500 dark:text-gray-400 mb-2 break-words overflow-wrap-anywhere"
                dangerouslySetInnerHTML={{
                  __html: processWhatsAppFormatting(
                    debouncedMessage.footer.text
                  ),
                }}
              />
            )}

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="mt-3 space-y-1">
                {buttons.map((button) => {
                  const reaction = getButtonReaction(button.id);
                  const hasReaction = reaction?.emoji || reaction?.textResponse;

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
                            {/* Reaction indicator (⚡️ icon) */}
                            {showReactionIndicators && hasReaction && (
                              <Zap className="h-3 w-3 text-yellow-500" />
                            )}
                            {reaction?.emoji && (
                              <span className="text-lg">{reaction.emoji}</span>
                            )}
                            {hasReaction && (
                              <Badge variant="secondary" className="text-xs">
                                {reaction?.emoji ? "Emoji" : "Texto"}
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

                      {/* Remove reaction button */}
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

            {/* Empty state */}
            {!debouncedMessage.body.text && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-2xl mb-2">💬</div>
                <p className="text-sm">Sua mensagem aparecerá aqui</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          isOpen={true}
          onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
          onClose={() => setShowEmojiPicker(null)}
        />
      )}

      {/* WhatsApp Text Editor */}
      {showTextEditor && (
        <WhatsAppTextEditor
          onSave={(text) => handleTextResponseSave(showTextEditor, text)}
          onClose={() => setShowTextEditor(null)}
          placeholder="Digite a resposta que será enviada quando este botão for clicado..."
        />
      )}
    </div>
  );
}
