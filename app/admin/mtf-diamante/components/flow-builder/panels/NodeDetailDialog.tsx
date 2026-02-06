'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { FlowNodeType } from '@/types/flow-builder';
import type {
  FlowNodeData,
  InteractiveMessageElement,
  InteractiveMessageNodeData,
  TextMessageNodeData,
  EmojiReactionNodeData,
  TextReactionNodeData,
  HandoffNodeData,
  AddTagNodeData,
  EndConversationNodeData,
  StartNodeData,
} from '@/types/flow-builder';
import {
  elementsToLegacyFields,
  getInteractiveMessageElements,
  hasConfiguredBody,
} from '@/lib/flow-builder/interactiveMessageElements';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Play,
  Smile,
  Type,
  UserRoundCog,
  TagIcon,
  CircleStop,
  Save,
} from 'lucide-react';

// =============================================================================
// EMOJI PICKER
// =============================================================================

const COMMON_EMOJIS = [
  // Favoritos/Comuns
  '👍', '❤️', '😊', '🥳', '🔥', '✅', '👏', '🙏', '💯', '✨', '😍', '🤔', '👀', '🚀', '💭', '🏷️',
  // Carinhas
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '🙂', '🙃', '😉', '😇', '🥰', '😘', '😋', '😛', '😜',
  '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
  '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
  '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮',
  '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃',
  // Gestos/Corpo
  '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
  '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
  '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄',
  // Corações/Símbolos
  '💋', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💌', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙',
  '💜', '🖤', '🤍', '🤎', '💟', '💤', '💢', '💣', '💥', '💦', '💨', '💫', '💬', '🗨️', '🗯️', '💭',
  // Animais/Natureza
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵',
  '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗',
  '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎',
  // Comida/Bebida
  '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
  '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🥕', '🧄', '🥔', '🥐', '🍞', '🥖', '🥨', '🥯', '🥞',
  '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥘', '🍲', '🥣', '🥗',
  '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥',
  '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛',
  '☕', '🍵', '🧉', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🍾',
  // Objetos/Atividades/Flags
  '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🎱', '🧿', '🎮', '🕹️', '🎰', '🎲', '🧩', '🧸',
  '🎨', '🧵', '🧶', '🎬', '🎤', '🎧', '🎸', '🎹', '🎺', '🎻', '🎳', '🎯', '🛹', '🚲', '🛵', '🏍️',
  '🏎️', '🚗', '🚕', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🚨', '🇧🇷', '🇺🇸', '🇪🇸', '🇫🇷', '🇵🇹',
];

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

// =============================================================================
// NODE ICON MAP
// =============================================================================

function getNodeIcon(type: FlowNodeType) {
  switch (type) {
    case FlowNodeType.START:
      return <Play className="h-5 w-5 text-green-500" />;
    case FlowNodeType.INTERACTIVE_MESSAGE:
      return <MessageSquare className="h-5 w-5 text-blue-500" />;
    case FlowNodeType.TEXT_MESSAGE:
      return <Type className="h-5 w-5 text-slate-500" />;
    case FlowNodeType.EMOJI_REACTION:
      return <Smile className="h-5 w-5 text-yellow-500" />;
    case FlowNodeType.TEXT_REACTION:
      return <Type className="h-5 w-5 text-purple-500" />;
    case FlowNodeType.HANDOFF:
      return <UserRoundCog className="h-5 w-5 text-orange-500" />;
    case FlowNodeType.ADD_TAG:
      return <TagIcon className="h-5 w-5 text-pink-500" />;
    case FlowNodeType.END_CONVERSATION:
      return <CircleStop className="h-5 w-5 text-red-500" />;
    default:
      return <MessageSquare className="h-5 w-5" />;
  }
}

function getNodeTypeName(type: FlowNodeType): string {
  const map: Record<string, string> = {
    [FlowNodeType.START]: 'Início',
    [FlowNodeType.INTERACTIVE_MESSAGE]: 'Mensagem Interativa',
    [FlowNodeType.TEXT_MESSAGE]: 'Texto Simples',
    [FlowNodeType.EMOJI_REACTION]: 'Reação Emoji',
    [FlowNodeType.TEXT_REACTION]: 'Resposta de Texto',
    [FlowNodeType.HANDOFF]: 'Transferência',
    [FlowNodeType.ADD_TAG]: 'Adicionar Tag',
    [FlowNodeType.END_CONVERSATION]: 'Encerrar Conversa',
  };
  return map[type] ?? 'Nó';
}

// =============================================================================
// DIALOG
// =============================================================================

interface NodeDetailDialogProps {
  node: Node | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
  interactiveMessages?: Array<{
    id: string;
    name: string;
    body?: { text?: string };
    header?: { type?: string; text?: string };
    footer?: { text?: string };
    action?: Record<string, unknown>;
  }>;
}

export function NodeDetailDialog({
  node,
  open,
  onOpenChange,
  onUpdateNodeData,
  interactiveMessages = [],
}: NodeDetailDialogProps) {
  if (!node) return null;

  const nodeType = node.type as FlowNodeType;
  const nodeData = node.data as unknown as FlowNodeData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0">
          {getNodeIcon(nodeType)}
          <div>
            <DialogTitle className="text-base">
              {(nodeData as FlowNodeData & { label?: string }).label ||
                getNodeTypeName(nodeType)}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getNodeTypeName(nodeType)}
            </p>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-2">
          <div className="py-2">
            {nodeType === FlowNodeType.START && (
              <StartDetailEditor
                node={node}
                data={nodeData as StartNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.INTERACTIVE_MESSAGE && (
              <InteractiveMessageDetailEditor
                node={node}
                data={nodeData as InteractiveMessageNodeData}
                onUpdate={onUpdateNodeData}
                interactiveMessages={interactiveMessages}
              />
            )}

            {nodeType === FlowNodeType.TEXT_MESSAGE && (
              <TextMessageDetailEditor
                node={node}
                data={nodeData as TextMessageNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.EMOJI_REACTION && (
              <EmojiReactionDetailEditor
                node={node}
                data={nodeData as EmojiReactionNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.TEXT_REACTION && (
              <TextReactionDetailEditor
                node={node}
                data={nodeData as TextReactionNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.HANDOFF && (
              <HandoffDetailEditor
                node={node}
                data={nodeData as HandoffNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.ADD_TAG && (
              <AddTagDetailEditor
                node={node}
                data={nodeData as AddTagNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}

            {nodeType === FlowNodeType.END_CONVERSATION && (
              <EndConversationDetailEditor
                node={node}
                data={nodeData as EndConversationNodeData}
                onUpdate={onUpdateNodeData}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DETAIL EDITORS
// =============================================================================

interface EditorProps<T> {
  node: Node;
  data: T;
  onUpdate: (nodeId: string, data: Partial<FlowNodeData>) => void;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
function StartDetailEditor({ node, data, onUpdate }: EditorProps<StartNodeData>) {
  const [label, setLabel] = useState(data.label ?? 'Início');

  useEffect(() => {
    setLabel(data.label ?? 'Início');
  }, [data.label]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome do fluxo</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, { label, isConfigured: true } as Partial<FlowNodeData>)
          }
          placeholder="Ex: Fluxo Principal, Boas-vindas..."
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Este nome identifica o fluxo e aparece no nó de início.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive Message
// ---------------------------------------------------------------------------
function InteractiveMessageDetailEditor({
  node,
  data,
  onUpdate,
  interactiveMessages,
}: EditorProps<InteractiveMessageNodeData> & {
  interactiveMessages: Array<{
    id: string;
    name: string;
    body?: { text?: string };
    header?: { type?: string; text?: string };
    footer?: { text?: string };
    action?: Record<string, unknown>;
  }>;
}) {
  const [mode, setMode] = useState<'create' | 'link'>(data.messageId ? 'link' : 'create');
  const [label, setLabel] = useState(data.label ?? '');
  const [elements, setElements] = useState<InteractiveMessageElement[]>(
    getInteractiveMessageElements(data)
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLabel(data.label ?? '');
    setMode(data.messageId ? 'link' : 'create');

    // Atualizar elementos somente quando estiver em modo create (inline)
    if (!data.messageId) {
      setElements(getInteractiveMessageElements(data));
    }
  }, [data, data.label, data.messageId]);

  const selectedMsg = useMemo(() => {
    if (!data.messageId) return null;
    return interactiveMessages.find((m) => m.id === data.messageId) ?? null;
  }, [data.messageId, interactiveMessages]);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return interactiveMessages;
    const q = search.toLowerCase();
    return interactiveMessages.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.body?.text?.toLowerCase().includes(q)
    );
  }, [search, interactiveMessages]);

  const handleSelectMessage = useCallback(
    (msg: (typeof interactiveMessages)[number]) => {
      setLabel(msg.name);
      onUpdate(node.id, {
        label: msg.name,
        messageId: msg.id,
        message: msg as InteractiveMessageNodeData['message'],
        isConfigured: true,
        // Limpar criação inline
        elements: undefined,
        header: undefined,
        body: undefined,
        footer: undefined,
        buttons: undefined,
      } as Partial<InteractiveMessageNodeData>);
      setMode('link');
    },
    [node.id, onUpdate]
  );

  const handleClearMessage = useCallback(() => {
    onUpdate(node.id, {
      messageId: undefined,
      message: undefined,
      isConfigured: false,
    } as unknown as Partial<FlowNodeData>);
    setMode('create');
  }, [node.id, onUpdate]);

  const commitElements = useCallback(
    (next: InteractiveMessageElement[]) => {
      const legacy = elementsToLegacyFields(next);
      onUpdate(node.id, {
        label,
        elements: next,
        ...legacy,
        messageId: undefined,
        message: undefined,
        isConfigured: hasConfiguredBody(next),
      } as Partial<InteractiveMessageNodeData>);
    },
    [label, node.id, onUpdate]
  );

  const handleRemoveElement = useCallback(
    (elementId: string) => {
      const next = elements.filter((e) => e.id !== elementId);
      setElements(next);
      commitElements(next);
    },
    [commitElements, elements]
  );

  const updateElement = useCallback(
    (elementId: string, patch: Partial<InteractiveMessageElement>) => {
      const next = elements.map((e) => (e.id === elementId ? ({ ...e, ...patch } as InteractiveMessageElement) : e));
      setElements(next);
      return next;
    },
    [elements]
  );

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
        <button
          type="button"
          onClick={() => {
            // Se estava vinculado, copiar para elementos e desvincular
            const derived = getInteractiveMessageElements(data);
            setElements(derived);
            const legacy = elementsToLegacyFields(derived);
            onUpdate(node.id, {
              messageId: undefined,
              message: undefined,
              elements: derived,
              ...legacy,
              isConfigured: hasConfiguredBody(derived),
            } as Partial<InteractiveMessageNodeData>);
            setMode('create');
          }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'create'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Criar mensagem
        </button>
        <button
          type="button"
          onClick={() => setMode('link')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'link'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Vincular existente
        </button>
      </div>

      {mode === 'create' ? (
        /* CREATE MODE - Criar mensagem diretamente */
        <div className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nome da mensagem</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => commitElements(elements)}
              placeholder="Ex: Boas-vindas, Menu Principal..."
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Adicione blocos arrastando pela lateral e solte dentro do nó.
            </p>
          </div>

          {/* Elementos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Elementos</Label>
              <span className="text-xs text-muted-foreground">
                {elements.filter((e) => e.type === 'button').length}/3 botões
              </span>
            </div>

            {elements.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">
                  Nenhum bloco adicionado ainda.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Arraste “Body” para começar.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {elements.map((el) => (
                  <div key={el.id} className="rounded-lg border p-3 bg-background space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {el.type === 'header_text'
                            ? 'Header (texto)'
                            : el.type === 'header_image'
                              ? 'Header (imagem)'
                              : el.type === 'body'
                                ? 'Body'
                                : el.type === 'footer'
                                  ? 'Footer'
                                  : 'Botão'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveElement(el.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>

                    {el.type === 'header_text' && (
                      <Input
                        value={el.text}
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => commitElements(elements)}
                        placeholder="Título"
                        className="text-sm"
                      />
                    )}

                    {el.type === 'header_image' && (
                      <div className="space-y-2">
                        <Input
                          value={el.url ?? ''}
                          onChange={(e) => updateElement(el.id, { url: e.target.value })}
                          onBlur={() => commitElements(elements)}
                          placeholder="URL da imagem"
                          className="text-sm"
                        />
                        <Input
                          value={el.caption ?? ''}
                          onChange={(e) => updateElement(el.id, { caption: e.target.value })}
                          onBlur={() => commitElements(elements)}
                          placeholder="Legenda (opcional)"
                          className="text-sm"
                        />
                      </div>
                    )}

                    {el.type === 'body' && (
                      <Textarea
                        value={el.text}
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => commitElements(elements)}
                        placeholder="Digite o texto principal..."
                        rows={4}
                        className="text-sm resize-y"
                      />
                    )}

                    {el.type === 'footer' && (
                      <Input
                        value={el.text}
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => commitElements(elements)}
                        placeholder="Texto de rodapé"
                        className="text-sm"
                      />
                    )}

                    {el.type === 'button' && (
                      <div className="space-y-2">
                        <Input
                          value={el.title}
                          onChange={(e) => updateElement(el.id, { title: e.target.value })}
                          onBlur={() => commitElements(elements)}
                          placeholder="Título do botão"
                          className="text-sm"
                        />
                        <Input
                          value={el.description ?? ''}
                          onChange={(e) => updateElement(el.id, { description: e.target.value })}
                          onBlur={() => commitElements(elements)}
                          placeholder="Descrição (opcional)"
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Dica: botões viram pontos de conexão no fluxo.
            </p>
          </div>
        </div>
      ) : (
        /* LINK MODE - Vincular mensagem existente */
        <div className="space-y-4">
          {/* Nome do nó */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nome do nó</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
              placeholder="Mensagem Interativa"
              className="text-sm"
            />
          </div>

          {/* Currently linked message */}
          {selectedMsg ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mensagem vinculada</Label>
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{selectedMsg.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    vinculada
                  </Badge>
                </div>
                {selectedMsg.header?.text && (
                  <p className="text-xs font-bold">{selectedMsg.header.text}</p>
                )}
                {selectedMsg.body?.text && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-5">
                    {selectedMsg.body.text}
                  </p>
                )}
                {selectedMsg.footer?.text && (
                  <p className="text-xs text-muted-foreground italic">
                    {selectedMsg.footer.text}
                  </p>
                )}

                {/* Show buttons in the preview */}
                {(() => {
                  const action = selectedMsg.action as {
                    buttons?: Array<{ id: string; title: string }>;
                  } | undefined;
                  const btns = action?.buttons ?? [];
                  if (btns.length === 0) return null;
                  return (
                    <div className="border-t pt-2 mt-2 space-y-1">
                      {btns.map((b) => (
                        <div
                          key={b.id}
                          className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                        >
                          {b.title}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={handleClearMessage}
                >
                  Trocar mensagem
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecionar mensagem</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar mensagem..."
                className="text-sm mb-2"
              />
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                {filteredMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    Nenhuma mensagem encontrada.
                  </p>
                ) : (
                  filteredMessages.map((msg) => (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => handleSelectMessage(msg)}
                      className="w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="font-medium text-sm truncate">{msg.name}</p>
                      {msg.body?.text && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {msg.body.text}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text Message
// ---------------------------------------------------------------------------
function TextMessageDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<TextMessageNodeData>) {
  const [label, setLabel] = useState(data.label ?? '');
  const [text, setText] = useState(data.text ?? '');

  useEffect(() => {
    setLabel(data.label ?? '');
    setText(data.text ?? '');
  }, [data.label, data.text]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome do nó</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
          placeholder="Texto Simples"
          className="text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Texto da mensagem</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, {
              text,
              isConfigured: text.trim().length > 0,
            } as Partial<FlowNodeData>)
          }
          placeholder="Digite o texto que será enviado ao usuário..."
          rows={6}
          className="text-sm resize-y"
        />
        <p className="text-xs text-muted-foreground">
          {text.length} caractere(s)
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emoji Reaction
// ---------------------------------------------------------------------------
function EmojiReactionDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<EmojiReactionNodeData>) {
  const [selected, setSelected] = useState(data.emoji ?? '');

  useEffect(() => {
    setSelected(data.emoji ?? '');
  }, [data.emoji]);

  const handleSelect = useCallback(
    (emoji: string) => {
      setSelected(emoji);
      onUpdate(node.id, {
        emoji,
        isConfigured: true,
      } as Partial<FlowNodeData>);
    },
    [node.id, onUpdate]
  );

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Escolha o emoji de reação</Label>
      <ScrollArea className="h-[300px] border rounded-md p-2">
        <div className="grid grid-cols-8 gap-2">
          {Array.from(new Set(COMMON_EMOJIS)).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelect(emoji)}
              className={`text-2xl p-2 rounded-lg border transition-all hover:scale-110 ${
                selected === emoji
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-transparent hover:border-border'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </ScrollArea>
      {selected && (
        <p className="text-sm text-muted-foreground text-center">
          Selecionado: <span className="text-2xl">{selected}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text Reaction
// ---------------------------------------------------------------------------
function TextReactionDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<TextReactionNodeData>) {
  const [label, setLabel] = useState(data.label ?? '');
  const [textReaction, setTextReaction] = useState(data.textReaction ?? '');

  useEffect(() => {
    setLabel(data.label ?? '');
    setTextReaction(data.textReaction ?? '');
  }, [data.label, data.textReaction]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome do nó</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
          className="text-sm"
          placeholder="Resposta de Texto"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Texto de resposta</Label>
        <Textarea
          value={textReaction}
          onChange={(e) => setTextReaction(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, {
              textReaction,
              isConfigured: textReaction.trim().length > 0,
            } as Partial<FlowNodeData>)
          }
          placeholder="Texto que será enviado como resposta..."
          rows={5}
          className="text-sm resize-y"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------
function HandoffDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<HandoffNodeData>) {
  const [targetTeam, setTargetTeam] = useState(data.targetTeam ?? '');

  useEffect(() => {
    setTargetTeam(data.targetTeam ?? '');
  }, [data.targetTeam]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Equipe de destino</Label>
        <Input
          value={targetTeam}
          onChange={(e) => setTargetTeam(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, {
              targetTeam,
              isConfigured: true,
            } as Partial<FlowNodeData>)
          }
          className="text-sm"
          placeholder="Nome da equipe ou setor"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        A conversa será transferida para um agente humano da equipe informada.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Tag
// ---------------------------------------------------------------------------
function AddTagDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<AddTagNodeData>) {
  const [tagName, setTagName] = useState(data.tagName ?? '');
  const [tagColor, setTagColor] = useState(data.tagColor ?? TAG_COLORS[0]);

  useEffect(() => {
    setTagName(data.tagName ?? '');
    setTagColor(data.tagColor ?? TAG_COLORS[0]);
  }, [data.tagName, data.tagColor]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome da tag</Label>
        <Input
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, {
              tagName,
              tagColor,
              isConfigured: tagName.trim().length > 0,
            } as Partial<FlowNodeData>)
          }
          className="text-sm"
          placeholder="Ex: Leads quentes"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Cor da tag</Label>
        <div className="flex gap-3 flex-wrap">
          {TAG_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                setTagColor(color);
                onUpdate(node.id, {
                  tagName,
                  tagColor: color,
                  isConfigured: tagName.trim().length > 0,
                } as Partial<FlowNodeData>);
              }}
              className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: color,
                borderColor:
                  tagColor === color
                    ? 'hsl(var(--primary))'
                    : 'transparent',
              }}
            />
          ))}
        </div>
      </div>
      {tagName && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">Prévia:</span>
          <Badge
            style={{ backgroundColor: tagColor, color: '#fff' }}
            className="text-xs"
          >
            {tagName}
          </Badge>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// End Conversation
// ---------------------------------------------------------------------------
function EndConversationDetailEditor({
  node,
  data,
  onUpdate,
}: EditorProps<EndConversationNodeData>) {
  const [endMessage, setEndMessage] = useState(data.endMessage ?? '');

  useEffect(() => {
    setEndMessage(data.endMessage ?? '');
  }, [data.endMessage]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Mensagem de encerramento (opcional)
        </Label>
        <Textarea
          value={endMessage}
          onChange={(e) => setEndMessage(e.target.value)}
          onBlur={() =>
            onUpdate(node.id, {
              endMessage,
              isConfigured: true,
            } as Partial<FlowNodeData>)
          }
          placeholder="Obrigado por entrar em contato!"
          rows={3}
          className="text-sm resize-y"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        A conversa será marcada como encerrada. A mensagem acima será enviada
        como despedida (se preenchida).
      </p>
    </div>
  );
}

export default NodeDetailDialog;
