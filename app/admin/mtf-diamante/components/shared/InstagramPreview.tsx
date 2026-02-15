'use client';

import { useTheme } from 'next-themes';
import { Smartphone, Instagram, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  QuickRepliesNodeData,
  CarouselNodeData,
  InteractiveMessageNodeData,
} from '@/types/flow-builder';

// =============================================================================
// TYPES
// =============================================================================

type MessageType = 'quick_replies' | 'button_template' | 'carousel' | 'text';

interface InstagramPreviewProps {
  /** Tipo de mensagem */
  messageType: MessageType;
  /** Dados da mensagem - varia conforme o tipo */
  data: QuickRepliesNodeData | CarouselNodeData | InteractiveMessageNodeData | { text: string };
  /** Canal: instagram ou facebook */
  channel?: 'instagram' | 'facebook';
  className?: string;
}

// =============================================================================
// HELPER: Parse formatting (similar to WhatsApp)
// =============================================================================

function parseFormatting(text: string, isDark: boolean): React.ReactNode {
  if (!text) return null;

  const patterns = [
    { regex: /\*([^*]+)\*/g, render: (match: string, key: number) => <strong key={key}>{match}</strong> },
    { regex: /_([^_]+)_/g, render: (match: string, key: number) => <em key={key}>{match}</em> },
    { regex: /\{\{([^}]+)\}\}/g, render: (match: string, key: number) => (
      <span key={key} className={cn("px-1 py-0.5 rounded text-xs", isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700")}>
        {`{{${match}}}`}
      </span>
    )},
  ];

  let result: React.ReactNode[] = [text];
  let keyCounter = 0;

  for (const { regex, render } of patterns) {
    const newResult: React.ReactNode[] = [];

    for (const part of result) {
      if (typeof part !== 'string') {
        newResult.push(part);
        continue;
      }

      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const localRegex = new RegExp(regex.source, 'g');

      while ((match = localRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          newResult.push(part.slice(lastIndex, match.index));
        }
        newResult.push(render(match[1], keyCounter++));
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < part.length) {
        newResult.push(part.slice(lastIndex));
      }
    }

    result = newResult;
  }

  return <>{result}</>;
}

// =============================================================================
// QUICK REPLIES PREVIEW
// =============================================================================

interface QuickRepliesPreviewProps {
  data: QuickRepliesNodeData;
  isDark: boolean;
}

function QuickRepliesPreview({ data, isDark }: QuickRepliesPreviewProps) {
  return (
    <div className="space-y-3">
      {/* Message bubble */}
      {data.promptText && (
        <div
          className={cn(
            "max-w-[220px] rounded-2xl px-3 py-2 shadow-sm",
            isDark ? "bg-[#3a3d42]" : "bg-white"
          )}
        >
          <p className={cn("text-sm break-words", isDark ? "text-white" : "text-gray-900")}>
            {parseFormatting(data.promptText, isDark)}
          </p>
        </div>
      )}

      {/* Quick reply chips */}
      {data.quickReplies && data.quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-w-[260px]">
          {data.quickReplies.map((qr, idx) => (
            <button
              key={qr.id || idx}
              type="button"
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                isDark
                  ? "border-blue-500 text-blue-400 hover:bg-blue-900/30"
                  : "border-blue-500 text-blue-600 hover:bg-blue-50"
              )}
            >
              {qr.title || 'Resposta'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// BUTTON TEMPLATE PREVIEW
// =============================================================================

interface ButtonTemplatePreviewProps {
  data: InteractiveMessageNodeData;
  isDark: boolean;
}

function ButtonTemplatePreview({ data, isDark }: ButtonTemplatePreviewProps) {
  const bodyText = data.body ?? data.elements?.find((e) => e.type === 'body')?.text ?? '';
  const buttons = data.buttons ?? data.elements?.filter((e) => e.type === 'button') ?? [];

  return (
    <div className="space-y-0">
      {/* Message bubble with buttons */}
      <div
        className={cn(
          "max-w-[240px] rounded-2xl overflow-hidden shadow-sm",
          isDark ? "bg-[#3a3d42]" : "bg-white"
        )}
      >
        {/* Body text */}
        {bodyText && (
          <div className="px-3 py-2.5">
            <p className={cn("text-sm break-words", isDark ? "text-white" : "text-gray-900")}>
              {parseFormatting(bodyText, isDark)}
            </p>
          </div>
        )}

        {/* Buttons */}
        {buttons.length > 0 && (
          <div className={cn("border-t", isDark ? "border-gray-600" : "border-gray-100")}>
            {buttons.map((btn, idx) => (
              <button
                key={(btn as { id?: string }).id || idx}
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-center text-sm font-medium transition-colors",
                  isDark
                    ? "text-blue-400 hover:bg-gray-700 border-gray-600"
                    : "text-blue-600 hover:bg-gray-50 border-gray-100",
                  idx < buttons.length - 1 && "border-b"
                )}
              >
                {(btn as { title?: string }).title || 'Botão'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CAROUSEL PREVIEW
// =============================================================================

interface CarouselPreviewProps {
  data: CarouselNodeData;
  isDark: boolean;
}

function CarouselPreview({ data, isDark }: CarouselPreviewProps) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content' }}>
        {data.cards?.map((card, idx) => (
          <div
            key={card.id || idx}
            className={cn(
              "w-[160px] rounded-xl overflow-hidden shadow-sm flex-shrink-0",
              isDark ? "bg-[#3a3d42]" : "bg-white"
            )}
          >
            {/* Card image */}
            <div className="h-20 bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-xs text-gray-400">Imagem</span>
              )}
            </div>

            {/* Card content */}
            <div className="p-2 space-y-1">
              <p className={cn(
                "text-xs font-semibold truncate",
                isDark ? "text-white" : "text-gray-900"
              )}>
                {card.title || 'Título'}
              </p>
              {card.subtitle && (
                <p className={cn(
                  "text-[10px] truncate",
                  isDark ? "text-gray-400" : "text-gray-500"
                )}>
                  {card.subtitle}
                </p>
              )}

              {/* Card buttons */}
              {card.buttons && card.buttons.length > 0 && (
                <div className={cn("border-t pt-1 mt-1", isDark ? "border-gray-600" : "border-gray-100")}>
                  {card.buttons.slice(0, 2).map((btn, btnIdx) => (
                    <button
                      key={btn.id || btnIdx}
                      type="button"
                      className={cn(
                        "w-full text-center text-[10px] font-medium py-1",
                        isDark ? "text-blue-400" : "text-blue-600"
                      )}
                    >
                      {btn.title || 'Botão'}
                    </button>
                  ))}
                  {card.buttons.length > 2 && (
                    <p className="text-[9px] text-muted-foreground text-center">
                      +{card.buttons.length - 2} mais
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {(!data.cards || data.cards.length === 0) && (
          <div className={cn(
            "w-[160px] h-[140px] rounded-xl border-2 border-dashed flex items-center justify-center",
            isDark ? "border-gray-600" : "border-gray-300"
          )}>
            <p className="text-xs text-muted-foreground">Nenhum card</p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TEXT PREVIEW
// =============================================================================

interface TextPreviewProps {
  text: string;
  isDark: boolean;
}

function TextPreview({ text, isDark }: TextPreviewProps) {
  return (
    <div
      className={cn(
        "max-w-[220px] rounded-2xl px-3 py-2 shadow-sm",
        isDark ? "bg-[#3a3d42]" : "bg-white"
      )}
    >
      <p className={cn("text-sm break-words", isDark ? "text-white" : "text-gray-900")}>
        {parseFormatting(text, isDark)}
      </p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function InstagramPreview({ messageType, data, channel = 'instagram', className }: InstagramPreviewProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const hasContent = (() => {
    switch (messageType) {
      case 'quick_replies': {
        const qrData = data as QuickRepliesNodeData;
        return qrData.promptText || (qrData.quickReplies?.length ?? 0) > 0;
      }
      case 'carousel': {
        const carouselData = data as CarouselNodeData;
        return (carouselData.cards?.length ?? 0) > 0;
      }
      case 'button_template': {
        const btnData = data as InteractiveMessageNodeData;
        return btnData.body || (btnData.buttons?.length ?? 0) > 0;
      }
      case 'text':
        return (data as { text: string }).text;
      default:
        return false;
    }
  })();

  const ChannelIcon = channel === 'instagram' ? Instagram : MessageCircle;
  const channelLabel = channel === 'instagram' ? 'Instagram' : 'Messenger';

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {/* Channel indicator */}
      <div className="flex items-center gap-2 mb-3 text-muted-foreground">
        <Smartphone className="h-4 w-4" />
        <span className="text-xs font-medium">Preview {channelLabel}</span>
      </div>

      {/* Phone frame */}
      <div
        className={cn(
          "w-[280px] rounded-2xl overflow-hidden shadow-lg border",
          isDark ? "bg-[#1a1a1a]" : "bg-[#fafafa]"
        )}
      >
        {/* App header */}
        <div className={cn(
          "px-3 py-2 flex items-center gap-2",
          channel === 'instagram'
            ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400"
            : "bg-[#0084ff]"
        )}>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <ChannelIcon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-medium">Chatwit</p>
            <p className="text-white/70 text-[10px]">Ativo agora</p>
          </div>
        </div>

        {/* Message area */}
        <div className="p-3 min-h-[280px] max-h-[380px] overflow-y-auto">
          {!hasContent ? (
            <div className="flex items-center justify-center h-[260px]">
              <p className={cn(
                "text-xs text-center px-4",
                isDark ? "text-gray-500" : "text-gray-400"
              )}>
                Configure a mensagem para ver o preview
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-start">
              {messageType === 'quick_replies' && (
                <QuickRepliesPreview data={data as QuickRepliesNodeData} isDark={isDark} />
              )}
              {messageType === 'button_template' && (
                <ButtonTemplatePreview data={data as InteractiveMessageNodeData} isDark={isDark} />
              )}
              {messageType === 'carousel' && (
                <CarouselPreview data={data as CarouselNodeData} isDark={isDark} />
              )}
              {messageType === 'text' && (
                <TextPreview text={(data as { text: string }).text} isDark={isDark} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstagramPreview;
