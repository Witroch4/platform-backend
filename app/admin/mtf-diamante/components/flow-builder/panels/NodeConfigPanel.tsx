"use client";

import { useCallback, useState, useEffect } from "react";
import type { Node } from "@xyflow/react";
import { FlowNodeType } from "@/types/flow-builder";
import type {
	FlowNodeData,
	InteractiveMessageNodeData,
	TextMessageNodeData,
	EmojiReactionNodeData,
	TextReactionNodeData,
	HandoffNodeData,
	AddTagNodeData,
	EndConversationNodeData,
} from "@/types/flow-builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Check } from "lucide-react";

// =============================================================================
// EMOJI PICKER (simple inline)
// =============================================================================

const COMMON_EMOJIS = [
	// Favoritos/Comuns
	"👍",
	"❤️",
	"😊",
	"🥳",
	"🔥",
	"✅",
	"👏",
	"🙏",
	"💯",
	"✨",
	"😍",
	"🤔",
	"👀",
	"🚀",
	"💭",
	"🏷️",
	// Carinhas
	"😀",
	"😃",
	"😄",
	"😁",
	"😅",
	"😂",
	"🤣",
	"🙂",
	"🙃",
	"😉",
	"😇",
	"🥰",
	"😘",
	"😋",
	"😛",
	"😜",
	"🤪",
	"🤨",
	"🧐",
	"🤓",
	"😎",
	"🤩",
	"😏",
	"😒",
	"😞",
	"😔",
	"😟",
	"😕",
	"🙁",
	"☹️",
	"😣",
	"😖",
	"😫",
	"😩",
	"🥺",
	"😢",
	"😭",
	"😤",
	"😠",
	"😡",
	"🤬",
	"🤯",
	"😳",
	"🥵",
	"🥶",
	"😱",
	"😨",
	"😰",
	"😥",
	"😓",
	"🤗",
	"🤔",
	"🤭",
	"🤫",
	"🤥",
	"😶",
	"😐",
	"😑",
	"😬",
	"🙄",
	"😯",
	"😦",
	"😧",
	"😮",
	"😲",
	"🥱",
	"😴",
	"🤤",
	"😪",
	"😵",
	"🤐",
	"🥴",
	"🤢",
	"🤮",
	"🤧",
	"🤒",
	"🤕",
	"🤑",
	"🤠",
	"😈",
	"👿",
	"👹",
	"👺",
	"🤡",
	"💩",
	"👻",
	"💀",
	"☠️",
	"👽",
	"👾",
	"🤖",
	"🎃",
	// Gestos/Corpo
	"👋",
	"🤚",
	"🖐️",
	"✋",
	"🖖",
	"👌",
	"🤏",
	"✌️",
	"🤞",
	"🤟",
	"🤘",
	"🤙",
	"👈",
	"👉",
	"👆",
	"🖕",
	"👇",
	"☝️",
	"👍",
	"👎",
	"✊",
	"👊",
	"🤛",
	"🤜",
	"👏",
	"🙌",
	"👐",
	"🤲",
	"🤝",
	"🙏",
	"✍️",
	"💅",
	"🤳",
	"💪",
	"🦾",
	"🦵",
	"🦿",
	"🦶",
	"👂",
	"🦻",
	"👃",
	"🧠",
	"🦷",
	"🦴",
	"👀",
	"👁️",
	"👅",
	"👄",
	// Corações/Símbolos
	"💋",
	"💘",
	"💝",
	"💖",
	"💗",
	"💓",
	"💞",
	"💕",
	"💌",
	"❣️",
	"💔",
	"❤️",
	"🧡",
	"💛",
	"💚",
	"💙",
	"💜",
	"🖤",
	"🤍",
	"🤎",
	"💟",
	"💤",
	"💢",
	"💣",
	"💥",
	"💦",
	"💨",
	"💫",
	"💬",
	"🗨️",
	"🗯️",
	"💭",
	// Animais/Natureza
	"🐶",
	"🐱",
	"🐭",
	"🐹",
	"🐰",
	"🦊",
	"🐻",
	"🐼",
	"🐨",
	"🐯",
	"🦁",
	"🐮",
	"🐷",
	"🐽",
	"🐸",
	"🐵",
	"🙈",
	"🙉",
	"🙊",
	"🐒",
	"🐔",
	"🐧",
	"🐦",
	"🐤",
	"🐣",
	"🐥",
	"🦆",
	"🦅",
	"🦉",
	"🦇",
	"🐺",
	"🐗",
	"🐴",
	"🦄",
	"🐝",
	"🐛",
	"🦋",
	"🐌",
	"🐞",
	"🐜",
	"🦟",
	"🦗",
	"🕷️",
	"🕸️",
	"🦂",
	"🐢",
	"🐍",
	"🦎",
	// Comida/Bebida
	"🍏",
	"🍎",
	"🍐",
	"🍊",
	"🍋",
	"🍌",
	"🍉",
	"🍇",
	"🍓",
	"🍈",
	"🍒",
	"🍑",
	"🥭",
	"🍍",
	"🥥",
	"🥝",
	"🍅",
	"🍆",
	"🥑",
	"🥦",
	"🥬",
	"🥒",
	"🌽",
	"🥕",
	"🧄",
	"🥔",
	"🥐",
	"🍞",
	"🥖",
	"🥨",
	"🥯",
	"🥞",
	"🧀",
	"🍖",
	"🍗",
	"🥩",
	"🥓",
	"🍔",
	"🍟",
	"🍕",
	"🌭",
	"🥪",
	"🌮",
	"🌯",
	"🥘",
	"🍲",
	"🥣",
	"🥗",
	"🍿",
	"🧈",
	"🧂",
	"🥫",
	"🍱",
	"🍘",
	"🍙",
	"🍚",
	"🍛",
	"🍜",
	"🍝",
	"🍠",
	"🍢",
	"🍣",
	"🍤",
	"🍥",
	"🍦",
	"🍧",
	"🍨",
	"🍩",
	"🍪",
	"🎂",
	"🍰",
	"🧁",
	"🥧",
	"🍫",
	"🍬",
	"🍭",
	"🍮",
	"🍯",
	"🍼",
	"🥛",
	"☕",
	"🍵",
	"粼",
	"🥤",
	"🍶",
	"🍺",
	"🍻",
	"🥂",
	"🍷",
	"🥃",
	"🍸",
	"🍹",
	"🍾",
	// Objetos/Atividades/Flags
	"⚽",
	"🏀",
	"🏈",
	"⚾",
	"🥎",
	"🎾",
	"🏐",
	"🏉",
	"🎱",
	"🧿",
	"🎮",
	"🕹️",
	"🎰",
	"🎲",
	"🧩",
	"🧸",
	"🎨",
	"🧵",
	"🧶",
	"🎬",
	"🎤",
	"🎧",
	"🎸",
	"🎹",
	"🎺",
	"🎻",
	"🎳",
	"🎯",
	"🛹",
	"🚲",
	"🛵",
	"🏍️",
	"🏎️",
	"🚗",
	"🚕",
	"🚓",
	"🚑",
	"🚒",
	"🚐",
	"🚚",
	"🚛",
	"🚜",
	"🚨",
	"🇧🇷",
	"🇺🇸",
	"🇪🇸",
	"🇫🇷",
	"🇵🇹",
];

// =============================================================================
// PANEL
// =============================================================================

interface NodeConfigPanelProps {
	selectedNode: Node | null;
	onUpdateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
	onClose: () => void;
	/** Mensagens interativas disponíveis para seleção */
	interactiveMessages?: Array<{ id: string; name: string; body?: { text?: string } }>;
}

export function NodeConfigPanel({
	selectedNode,
	onUpdateNodeData,
	onClose,
	interactiveMessages = [],
}: NodeConfigPanelProps) {
	if (!selectedNode) return null;

	const nodeType = selectedNode.type as FlowNodeType;
	const nodeData = selectedNode.data as unknown as FlowNodeData;

	return (
		<div className="w-[280px] shrink-0 rounded-lg border bg-background flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2.5 border-b">
				<p className="text-sm font-semibold">Configurar</p>
				<Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea className="flex-1 p-3">
				{/* Render the right editor based on node type */}
				{nodeType === FlowNodeType.INTERACTIVE_MESSAGE && (
					<InteractiveMessageEditor
						node={selectedNode}
						data={nodeData as InteractiveMessageNodeData}
						onUpdate={onUpdateNodeData}
						interactiveMessages={interactiveMessages}
					/>
				)}

				{nodeType === FlowNodeType.TEXT_MESSAGE && (
					<TextMessageEditor node={selectedNode} data={nodeData as TextMessageNodeData} onUpdate={onUpdateNodeData} />
				)}

				{nodeType === FlowNodeType.EMOJI_REACTION && (
					<EmojiReactionEditor
						node={selectedNode}
						data={nodeData as EmojiReactionNodeData}
						onUpdate={onUpdateNodeData}
					/>
				)}

				{nodeType === FlowNodeType.TEXT_REACTION && (
					<TextReactionEditor node={selectedNode} data={nodeData as TextReactionNodeData} onUpdate={onUpdateNodeData} />
				)}

				{nodeType === FlowNodeType.HANDOFF && (
					<HandoffEditor node={selectedNode} data={nodeData as HandoffNodeData} onUpdate={onUpdateNodeData} />
				)}

				{nodeType === FlowNodeType.ADD_TAG && (
					<AddTagEditor node={selectedNode} data={nodeData as AddTagNodeData} onUpdate={onUpdateNodeData} />
				)}

				{nodeType === FlowNodeType.END_CONVERSATION && (
					<EndConversationEditor
						node={selectedNode}
						data={nodeData as EndConversationNodeData}
						onUpdate={onUpdateNodeData}
					/>
				)}

				{nodeType === FlowNodeType.START && (
					<div className="text-sm text-muted-foreground py-4 text-center">
						O nó de início não necessita de configuração.
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

// =============================================================================
// SUB-EDITORS
// =============================================================================

interface EditorProps<T> {
	node: Node;
	data: T;
	onUpdate: (nodeId: string, data: Partial<FlowNodeData>) => void;
}

// ---------------------------------------------------------------------------
// Interactive Message
// ---------------------------------------------------------------------------
function InteractiveMessageEditor({
	node,
	data,
	onUpdate,
	interactiveMessages,
}: EditorProps<InteractiveMessageNodeData> & {
	interactiveMessages: Array<{ id: string; name: string; body?: { text?: string } }>;
}) {
	const [label, setLabel] = useState(data.label ?? "");

	const handleSelectMessage = useCallback(
		(msg: (typeof interactiveMessages)[number]) => {
			onUpdate(node.id, {
				label: msg.name,
				messageId: msg.id,
				message: msg as InteractiveMessageNodeData["message"],
				isConfigured: true,
			} as Partial<InteractiveMessageNodeData>);
		},
		[node.id, onUpdate],
	);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Nome do nó</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
					placeholder="Mensagem Interativa"
					className="h-8 text-sm"
				/>
			</div>

			<div className="space-y-2">
				<Label className="text-xs">Mensagem vinculada</Label>
				{data.messageId ? (
					<div className="rounded border p-2 bg-muted/30 text-xs space-y-1">
						<p className="font-medium">{data.message?.name ?? data.messageId}</p>
						{data.message?.body?.text && <p className="text-muted-foreground line-clamp-2">{data.message.body.text}</p>}
						<Button
							variant="outline"
							size="sm"
							className="w-full h-7 mt-1 text-xs"
							onClick={() =>
								onUpdate(node.id, {
									messageId: undefined,
									message: undefined,
									isConfigured: false,
								} as unknown as Partial<FlowNodeData>)
							}
						>
							Trocar mensagem
						</Button>
					</div>
				) : (
					<div className="space-y-1.5 max-h-[200px] overflow-y-auto">
						{interactiveMessages.length === 0 ? (
							<p className="text-xs text-muted-foreground italic py-2">
								Nenhuma mensagem interativa encontrada nesta caixa.
							</p>
						) : (
							interactiveMessages.map((msg) => (
								<button
									key={msg.id}
									type="button"
									onClick={() => handleSelectMessage(msg)}
									className="w-full text-left rounded border p-2 hover:bg-accent transition-colors text-xs"
								>
									<p className="font-medium truncate">{msg.name}</p>
									{msg.body?.text && <p className="text-muted-foreground truncate mt-0.5">{msg.body.text}</p>}
								</button>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Text Message
// ---------------------------------------------------------------------------
function TextMessageEditor({ node, data, onUpdate }: EditorProps<TextMessageNodeData>) {
	const [label, setLabel] = useState(data.label ?? "");
	const [text, setText] = useState(data.text ?? "");

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Nome do nó</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
					placeholder="Texto Simples"
					className="h-8 text-sm"
				/>
			</div>
			<div className="space-y-2">
				<Label className="text-xs">Texto da mensagem</Label>
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() =>
						onUpdate(node.id, {
							text,
							isConfigured: text.trim().length > 0,
						} as Partial<FlowNodeData>)
					}
					placeholder="Digite o texto que será enviado..."
					rows={4}
					className="text-sm resize-none"
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Emoji Reaction
// ---------------------------------------------------------------------------
function EmojiReactionEditor({ node, data, onUpdate }: EditorProps<EmojiReactionNodeData>) {
	const [selected, setSelected] = useState(data.emoji ?? "");

	const handleSelect = useCallback(
		(emoji: string) => {
			setSelected(emoji);
			onUpdate(node.id, {
				emoji,
				isConfigured: true,
			} as Partial<FlowNodeData>);
		},
		[node.id, onUpdate],
	);

	return (
		<div className="space-y-4">
			<Label className="text-xs">Escolha o emoji de reação</Label>
			<ScrollArea className="h-[400px] border rounded-md p-2">
				<div className="grid grid-cols-4 gap-2">
					{Array.from(new Set(COMMON_EMOJIS)).map((emoji) => (
						<button
							key={emoji}
							type="button"
							onClick={() => handleSelect(emoji)}
							className={`text-2xl p-2 rounded-lg border transition-all hover:scale-110 ${
								selected === emoji
									? "border-primary bg-primary/10 ring-2 ring-primary/30"
									: "border-transparent hover:border-border"
							}`}
						>
							{emoji}
						</button>
					))}
				</div>
			</ScrollArea>
			{selected && <p className="text-xs text-muted-foreground text-center">Selecionado: {selected}</p>}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Text Reaction
// ---------------------------------------------------------------------------
function TextReactionEditor({ node, data, onUpdate }: EditorProps<TextReactionNodeData>) {
	const [label, setLabel] = useState(data.label ?? "");
	const [textReaction, setTextReaction] = useState(data.textReaction ?? "");

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Nome do nó</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
					className="h-8 text-sm"
					placeholder="Resposta de Texto"
				/>
			</div>
			<div className="space-y-2">
				<Label className="text-xs">Texto de resposta</Label>
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
					rows={3}
					className="text-sm resize-none"
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------
function HandoffEditor({ node, data, onUpdate }: EditorProps<HandoffNodeData>) {
	const [targetTeam, setTargetTeam] = useState(data.targetTeam ?? "");

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Equipe de destino</Label>
				<Input
					value={targetTeam}
					onChange={(e) => setTargetTeam(e.target.value)}
					onBlur={() =>
						onUpdate(node.id, {
							targetTeam,
							isConfigured: true,
						} as Partial<FlowNodeData>)
					}
					className="h-8 text-sm"
					placeholder="Nome da equipe ou setor"
				/>
			</div>
			<p className="text-xs text-muted-foreground">A conversa será transferida para um agente humano.</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Add Tag
// ---------------------------------------------------------------------------
const TAG_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

function AddTagEditor({ node, data, onUpdate }: EditorProps<AddTagNodeData>) {
	const [tagName, setTagName] = useState(data.tagName ?? "");
	const [tagColor, setTagColor] = useState(data.tagColor ?? TAG_COLORS[0]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Nome da tag</Label>
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
					className="h-8 text-sm"
					placeholder="Ex: Leads quentes"
				/>
			</div>
			<div className="space-y-2">
				<Label className="text-xs">Cor da tag</Label>
				<div className="flex gap-2 flex-wrap">
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
							className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
							style={{
								backgroundColor: color,
								borderColor: tagColor === color ? "hsl(var(--primary))" : "transparent",
							}}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// End Conversation
// ---------------------------------------------------------------------------
function EndConversationEditor({ node, data, onUpdate }: EditorProps<EndConversationNodeData>) {
	const [endMessage, setEndMessage] = useState(data.endMessage ?? "");

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-xs">Mensagem de encerramento (opcional)</Label>
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
					rows={2}
					className="text-sm resize-none"
				/>
			</div>
			<p className="text-xs text-muted-foreground">A conversa será marcada como encerrada.</p>
		</div>
	);
}

export default NodeConfigPanel;
