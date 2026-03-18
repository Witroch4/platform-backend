"use client";

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import type { Node } from "@xyflow/react";
import { useTheme } from "next-themes";
import { FlowNodeType } from "@/types/flow-builder";
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
	ChatwitActionNodeData,
	WaitForReplyNodeData,
	GeneratePaymentLinkNodeData,
} from "@/types/flow-builder";
import { ChatwitActionDetailEditor } from "./editors/ChatwitActionDetailEditor";
import {
	elementsToLegacyFields,
	generateElementId,
	getInteractiveMessageElements,
	hasConfiguredBody,
} from "@/lib/flow-builder/interactiveMessageElements";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Play, Smile, Type, UserRoundCog, TagIcon, CircleStop, Smartphone, Workflow, MessageSquareText, CreditCard as CreditCardIcon, Variable, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlowBuilderContext } from "../context/FlowBuilderContext";
import {
	type FlowBuilderVariable,
	STATIC_FLOW_VARIABLES,
	CATEGORY_LABELS,
	CATEGORY_COLORS,
} from "../constants/flow-variables";

// =============================================================================
// EMOJI PICKER
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
	"🧉",
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

const TAG_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

// =============================================================================
// WHATSAPP PREVIEW COMPONENT
// =============================================================================

/**
 * Parse WhatsApp formatting and return React elements
 * Supports: *bold*, _italic_, ~strikethrough~, ```monospace```, > quote
 */
function parseWhatsAppFormatting(
	text: string,
	isDark: boolean,
	mtfVariables?: Array<{ name: string; value?: string; category: string }>,
): React.ReactNode {
	if (!text) return null;

	const lines = text.split("\n");
	const elements: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check for quote (> at start of line)
		if (line.startsWith(">")) {
			const quoteText = line.slice(1).trim();
			elements.push(
				<div
					key={`line-${i}`}
					className={cn(
						"border-l-4 pl-2 my-1",
						isDark ? "border-[#00a884] text-gray-300" : "border-[#25d366] text-gray-600",
					)}
				>
					{parseInlineFormatting(quoteText, isDark, mtfVariables)}
				</div>,
			);
		} else {
			// Normal line with inline formatting
			elements.push(
				<span key={`line-${i}`}>
					{parseInlineFormatting(line, isDark, mtfVariables)}
					{i < lines.length - 1 && <br />}
				</span>,
			);
		}
	}

	return <>{elements}</>;
}

/**
 * Parse inline WhatsApp formatting: *bold*, _italic_, ~strikethrough~, ```code```, {{variables}}
 * Variables are processed FIRST to protect underscores from italic matching.
 */
function parseInlineFormatting(
	text: string,
	isDark: boolean,
	mtfVariables?: Array<{ name: string; value?: string; category: string }>,
): React.ReactNode {
	if (!text) return null;

	// Regex patterns for WhatsApp formatting
	// IMPORTANT: {{variable}} MUST be first — underscores in var names break italic otherwise
	const patterns = [
		{
			regex: /\{\{([^}]+)\}\}/g,
			render: (match: string, key: number) => {
				const trimmed = match.trim();
				const variable = mtfVariables?.find((v) => v.name === trimmed);

				if (variable?.category === "mtf" && variable.value) {
					return (
						<span
							key={key}
							className={cn(
								"px-1 py-0.5 rounded text-xs",
								isDark ? "bg-amber-900/50 text-amber-300" : "bg-amber-100 text-amber-700",
							)}
						>
							{variable.value}
						</span>
					);
				}

				return (
					<span
						key={key}
						className={cn(
							"px-1 py-0.5 rounded text-xs",
							isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700",
						)}
					>
						{`{{${trimmed}}}`}
					</span>
				);
			},
		},
		{ regex: /\*([^*]+)\*/g, render: (match: string, key: number) => <strong key={key}>{match}</strong> },
		{ regex: /_([^_]+)_/g, render: (match: string, key: number) => <em key={key}>{match}</em> },
		{ regex: /~([^~]+)~/g, render: (match: string, key: number) => <del key={key}>{match}</del> },
		{
			regex: /```([^`]+)```/g,
			render: (match: string, key: number) => (
				<code key={key} className={cn("px-1 py-0.5 rounded text-xs font-mono", isDark ? "bg-gray-700" : "bg-gray-100")}>
					{match}
				</code>
			),
		},
		{
			regex: /`([^`]+)`/g,
			render: (match: string, key: number) => (
				<code key={key} className={cn("px-1 py-0.5 rounded text-xs font-mono", isDark ? "bg-gray-700" : "bg-gray-100")}>
					{match}
				</code>
			),
		},
	];

	let result: React.ReactNode[] = [text];
	let keyCounter = 0;

	for (const { regex, render } of patterns) {
		const newResult: React.ReactNode[] = [];

		for (const part of result) {
			if (typeof part !== "string") {
				newResult.push(part);
				continue;
			}

			let lastIndex = 0;
			let match: RegExpExecArray | null;
			const localRegex = new RegExp(regex.source, "g");

			while ((match = localRegex.exec(part)) !== null) {
				// Add text before match
				if (match.index > lastIndex) {
					newResult.push(part.slice(lastIndex, match.index));
				}
				// Add formatted element
				newResult.push(render(match[1], keyCounter++));
				lastIndex = match.index + match[0].length;
			}

			// Add remaining text
			if (lastIndex < part.length) {
				newResult.push(part.slice(lastIndex));
			}
		}

		result = newResult;
	}

	return <>{result}</>;
}

interface WhatsAppPreviewProps {
	header?: { type?: string; text?: string; url?: string; caption?: string };
	body?: string;
	footer?: string;
	buttons?: Array<{ id: string; title: string; description?: string }>;
	className?: string;
	mtfVariables?: Array<{ name: string; value?: string; category: string }>;
}

function WhatsAppPreview({ header, body, footer, buttons, className, mtfVariables }: WhatsAppPreviewProps) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	const hasContent = header?.text || header?.url || body || footer || (buttons && buttons.length > 0);

	return (
		<div className={cn("flex flex-col items-center", className)}>
			{/* Phone frame */}
			<div className="flex items-center gap-2 mb-3 text-muted-foreground">
				<Smartphone className="h-4 w-4" />
				<span className="text-xs font-medium">Preview WhatsApp</span>
			</div>

			<div
				className={cn(
					"w-[280px] rounded-2xl overflow-hidden shadow-lg border",
					isDark ? "bg-[#0b141a]" : "bg-[#efeae2]",
				)}
				style={{
					backgroundImage: isDark
						? 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mNkAAJGRkZGBgYGBgYYDQAOPQB2yx+U4QAAAABJRU5ErkJggg==")'
						: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8+f//fwYGBgYGRkZGBgYAJQQDHxNL3tEAAAAASUVORK5CYII=")',
				}}
			>
				{/* WhatsApp header bar */}
				<div className={cn("px-3 py-2 flex items-center gap-2", isDark ? "bg-[#202c33]" : "bg-[#075e54]")}>
					<div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
						<span className="text-white text-xs font-bold">C</span>
					</div>
					<div className="flex-1">
						<p className="text-white text-sm font-medium">Chatwit</p>
						<p className="text-white/70 text-[10px]">online</p>
					</div>
				</div>

				{/* Message area */}
				<div className="p-3 min-h-[300px] max-h-[400px] overflow-y-auto">
					{!hasContent ? (
						<div className="flex items-center justify-center h-[280px]">
							<p className={cn("text-xs text-center px-4", isDark ? "text-gray-500" : "text-gray-400")}>
								Configure a mensagem para ver o preview
							</p>
						</div>
					) : (
						<div className="flex justify-start">
							<div
								className={cn(
									"max-w-[240px] rounded-lg overflow-hidden shadow-sm",
									isDark ? "bg-[#202c33]" : "bg-white",
								)}
							>
								{/* Header image */}
								{header?.type === "image" && header.url && (
									<div className="w-full h-32 bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
										<img
											src={header.url}
											alt="Header"
											className="w-full h-full object-cover"
											onError={(e) => {
												(e.target as HTMLImageElement).style.display = "none";
												(e.target as HTMLImageElement).parentElement!.innerHTML =
													'<span class="text-xs text-gray-400">Imagem</span>';
											}}
										/>
									</div>
								)}

								<div className="p-2.5 space-y-1">
									{/* Header text */}
									{header?.type === "text" && header.text && (
										<p className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>
											{parseInlineFormatting(header.text, isDark, mtfVariables)}
										</p>
									)}

									{/* Body */}
									{body && (
										<div className={cn("text-sm break-words", isDark ? "text-gray-200" : "text-gray-800")}>
											{parseWhatsAppFormatting(body, isDark, mtfVariables)}
										</div>
									)}

									{/* Footer */}
									{footer && (
										<p className={cn("text-[11px] mt-1", isDark ? "text-gray-400" : "text-gray-500")}>
											{parseInlineFormatting(footer, isDark, mtfVariables)}
										</p>
									)}

									{/* Timestamp */}
									<div className="flex justify-end">
										<span className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-400")}>
											{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
										</span>
									</div>
								</div>

								{/* Buttons */}
								{buttons && buttons.length > 0 && (
									<div className={cn("border-t", isDark ? "border-gray-700" : "border-gray-100")}>
										{buttons.map((btn, idx) => (
											<button
												key={btn.id || idx}
												type="button"
												className={cn(
													"w-full px-3 py-2.5 text-center text-sm font-medium transition-colors",
													isDark
														? "text-[#00a884] hover:bg-[#182229] border-gray-700"
														: "text-[#00a884] hover:bg-gray-50 border-gray-100",
													idx < buttons.length - 1 && "border-b",
												)}
											>
												{btn.title || "Botão"}
											</button>
										))}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

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
		case FlowNodeType.CHATWIT_ACTION:
			return <Workflow className="h-5 w-5 text-indigo-500" />;
		case FlowNodeType.WAIT_FOR_REPLY:
			return <MessageSquareText className="h-5 w-5 text-amber-500" />;
		case FlowNodeType.GENERATE_PAYMENT_LINK:
			return <CreditCardIcon className="h-5 w-5 text-emerald-500" />;
		case FlowNodeType.END_CONVERSATION:
			return <CircleStop className="h-5 w-5 text-red-500" />;
		default:
			return <MessageSquare className="h-5 w-5" />;
	}
}

function getNodeTypeName(type: FlowNodeType): string {
	const map: Record<string, string> = {
		[FlowNodeType.START]: "Início",
		[FlowNodeType.INTERACTIVE_MESSAGE]: "Mensagem Interativa",
		[FlowNodeType.TEXT_MESSAGE]: "Texto Simples",
		[FlowNodeType.EMOJI_REACTION]: "Reação Emoji",
		[FlowNodeType.TEXT_REACTION]: "Resposta de Texto",
		[FlowNodeType.HANDOFF]: "Transferência",
		[FlowNodeType.ADD_TAG]: "Adicionar Tag",
		[FlowNodeType.CHATWIT_ACTION]: "Ação Chatwit",
		[FlowNodeType.WAIT_FOR_REPLY]: "Aguardar Resposta",
		[FlowNodeType.GENERATE_PAYMENT_LINK]: "Link de Pagamento",
		[FlowNodeType.END_CONVERSATION]: "Encerrar Conversa",
	};
	return map[type] ?? "Nó";
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
		header?: { type?: string; text?: string; content?: string; media_url?: string };
		footer?: { text?: string };
		action?: Record<string, unknown>;
	}>;
	/** Callback para criar nós de reação automaticamente ao vincular uma mensagem */
	onLinkMessageWithReactions?: (
		nodeId: string,
		messageId: string,
		buttons: Array<{ id: string; title: string }>,
	) => void;
}

export function NodeDetailDialog({
	node,
	open,
	onOpenChange,
	onUpdateNodeData,
	interactiveMessages = [],
	onLinkMessageWithReactions,
}: NodeDetailDialogProps) {
	if (!node) return null;

	const nodeType = node.type as FlowNodeType;
	const nodeData = node.data as unknown as FlowNodeData;
	const isInteractiveMessage = nodeType === FlowNodeType.INTERACTIVE_MESSAGE;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"max-h-[85vh] flex flex-col",
					isInteractiveMessage ? "w-[96vw] sm:max-w-5xl" : "w-[96vw] sm:max-w-2xl",
				)}
			>
				<DialogHeader className="flex flex-row items-center gap-3 space-y-0">
					{getNodeIcon(nodeType)}
					<div>
						<DialogTitle className="text-base">
							{(nodeData as FlowNodeData & { label?: string }).label || getNodeTypeName(nodeType)}
						</DialogTitle>
						<p className="text-xs text-muted-foreground mt-0.5">{getNodeTypeName(nodeType)}</p>
					</div>
				</DialogHeader>

				<ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-2">
					<div className="py-2">
						{nodeType === FlowNodeType.START && (
							<StartDetailEditor node={node} data={nodeData as StartNodeData} onUpdate={onUpdateNodeData} />
						)}

						{nodeType === FlowNodeType.INTERACTIVE_MESSAGE && (
							<InteractiveMessageDetailEditor
								node={node}
								data={nodeData as InteractiveMessageNodeData}
								onUpdate={onUpdateNodeData}
								interactiveMessages={interactiveMessages}
								onLinkMessageWithReactions={onLinkMessageWithReactions}
							/>
						)}

						{nodeType === FlowNodeType.TEXT_MESSAGE && (
							<TextMessageDetailEditor node={node} data={nodeData as TextMessageNodeData} onUpdate={onUpdateNodeData} />
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
							<HandoffDetailEditor node={node} data={nodeData as HandoffNodeData} onUpdate={onUpdateNodeData} />
						)}

						{nodeType === FlowNodeType.ADD_TAG && (
							<AddTagDetailEditor node={node} data={nodeData as AddTagNodeData} onUpdate={onUpdateNodeData} />
						)}

						{nodeType === FlowNodeType.END_CONVERSATION && (
							<EndConversationDetailEditor
								node={node}
								data={nodeData as EndConversationNodeData}
								onUpdate={onUpdateNodeData}
							/>
						)}

						{nodeType === FlowNodeType.CHATWIT_ACTION && (
							<ChatwitActionDetailEditor
								node={node}
								data={nodeData as ChatwitActionNodeData}
								onUpdate={onUpdateNodeData}
							/>
						)}

						{nodeType === FlowNodeType.WAIT_FOR_REPLY && (
							<WaitForReplyDetailEditor
								node={node}
								data={nodeData as WaitForReplyNodeData}
								onUpdate={onUpdateNodeData}
							/>
						)}

						{nodeType === FlowNodeType.GENERATE_PAYMENT_LINK && (
							<GeneratePaymentLinkDetailEditor
								node={node}
								data={nodeData as GeneratePaymentLinkNodeData}
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
	const [label, setLabel] = useState(data.label ?? "Início");

	useEffect(() => {
		setLabel(data.label ?? "Início");
	}, [data.label]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Nome do fluxo</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					onBlur={() => onUpdate(node.id, { label, isConfigured: true } as Partial<FlowNodeData>)}
					placeholder="Ex: Fluxo Principal, Boas-vindas..."
					className="text-sm"
				/>
				<p className="text-xs text-muted-foreground">Este nome identifica o fluxo e aparece no nó de início.</p>
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
	onLinkMessageWithReactions,
}: EditorProps<InteractiveMessageNodeData> & {
	interactiveMessages: Array<{
		id: string;
		name: string;
		body?: { text?: string };
		header?: { type?: string; text?: string; content?: string; media_url?: string };
		footer?: { text?: string };
		action?: Record<string, unknown>;
	}>;
	onLinkMessageWithReactions?: (
		nodeId: string,
		messageId: string,
		buttons: Array<{ id: string; title: string }>,
	) => void;
}) {
	const ctx = useFlowBuilderContext();
	const mtfVarsForPreview = useMemo(
		() => ctx?.allVariables.filter((v) => v.category === "mtf" && v.value) ?? [],
		[ctx?.allVariables],
	);

	const [mode, setMode] = useState<"create" | "link">(data.messageId ? "link" : "create");
	const [label, setLabel] = useState(data.label ?? "");
	const [elements, setElements] = useState<InteractiveMessageElement[]>(getInteractiveMessageElements(data));
	const [search, setSearch] = useState("");

	useEffect(() => {
		setLabel(data.label ?? "");
		setMode(data.messageId ? "link" : "create");

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
			(m) => m.name?.toLowerCase().includes(q) || m.body?.text?.toLowerCase().includes(q),
		);
	}, [search, interactiveMessages]);

	// Compute preview data from elements or selected message
	const previewData = useMemo(() => {
		if (mode === "link" && selectedMsg) {
			// Preview from linked message
			// FIX: Normalizar header (pode ser text, image, video, document) e buttons
			const header = selectedMsg.header as
				| { type?: string; text?: string; content?: string; media_url?: string }
				| undefined;

			const action = selectedMsg.action as
				| {
					type?: string;
					buttons?: Array<{ id: string; title: string; reply?: { id: string; title: string } }>;
				}
				| undefined;

			// Normalizar header para o formato esperado pelo WhatsAppPreview
			let normalizedHeader: { type?: string; text?: string; url?: string; caption?: string } | undefined;
			if (header?.type === "text") {
				normalizedHeader = { type: "text", text: header.text || header.content || "" };
			} else if (header?.type && ["image", "video", "document"].includes(header.type)) {
				normalizedHeader = {
					type: header.type,
					url: header.media_url || header.content || "",
					caption: header.text,
				};
			}

			// Normalizar buttons (podem ter formato { id, title } ou { reply: { id, title } })
			const buttons = (action?.buttons ?? []).map((btn) => ({
				id: btn.id || btn.reply?.id || "",
				title: btn.title || btn.reply?.title || "",
			}));

			return {
				header: normalizedHeader,
				body: selectedMsg.body?.text,
				footer: selectedMsg.footer?.text,
				buttons,
			};
		}

		// Preview from elements (create mode)
		const headerTextEl = elements.find((e) => e.type === "header_text") as { text: string } | undefined;
		const headerImageEl = elements.find((e) => e.type === "header_image") as
			| { url?: string; caption?: string }
			| undefined;
		const bodyEl = elements.find((e) => e.type === "body") as { text: string } | undefined;
		const footerEl = elements.find((e) => e.type === "footer") as { text: string } | undefined;
		const buttonEls = elements.filter((e) => e.type === "button") as Array<{
			id: string;
			title: string;
			description?: string;
		}>;

		return {
			header: headerTextEl
				? { type: "text", text: headerTextEl.text }
				: headerImageEl
					? { type: "image", url: headerImageEl.url, caption: headerImageEl.caption }
					: undefined,
			body: bodyEl?.text,
			footer: footerEl?.text,
			buttons: buttonEls,
		};
	}, [mode, selectedMsg, elements]);

	const handleSelectMessage = useCallback(
		(msg: (typeof interactiveMessages)[number]) => {
			setLabel(msg.name);
			onUpdate(node.id, {
				label: msg.name,
				messageId: msg.id,
				message: msg as InteractiveMessageNodeData["message"],
				isConfigured: true,
				// Limpar criação inline
				elements: undefined,
				header: undefined,
				body: undefined,
				footer: undefined,
				buttons: undefined,
			} as Partial<InteractiveMessageNodeData>);
			setMode("link");

			// Extrair botões da mensagem e criar nós de reação automaticamente
			if (onLinkMessageWithReactions && msg.action) {
				const action = msg.action as {
					buttons?: Array<{ id?: string; title?: string; reply?: { id: string; title: string } }>;
				};
				// Regenerar IDs com prefixo flow_ para roteamento correto no webhook
				const buttons = (action.buttons ?? []).map((btn) => ({
					id: generateElementId("button"),
					title: btn.title || btn.reply?.title || "",
				})).filter((b) => b.id && b.title);

				if (buttons.length > 0) {
					// Usar setTimeout para garantir que o nó foi atualizado antes de criar os filhos
					setTimeout(() => {
						onLinkMessageWithReactions(node.id, msg.id, buttons);
					}, 100);
				}
			}
		},
		[node.id, onUpdate, onLinkMessageWithReactions],
	);

	const handleClearMessage = useCallback(() => {
		onUpdate(node.id, {
			messageId: undefined,
			message: undefined,
			isConfigured: false,
		} as unknown as Partial<FlowNodeData>);
		setMode("create");
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
		[label, node.id, onUpdate],
	);

	const handleRemoveElement = useCallback(
		(elementId: string) => {
			const next = elements.filter((e) => e.id !== elementId);
			setElements(next);
			commitElements(next);
		},
		[commitElements, elements],
	);

	const updateElement = useCallback(
		(elementId: string, patch: Partial<InteractiveMessageElement>) => {
			const next = elements.map((e) => (e.id === elementId ? ({ ...e, ...patch } as InteractiveMessageElement) : e));
			setElements(next);
			return next;
		},
		[elements],
	);

	return (
		<div className="flex gap-6">
			{/* Left column: Form */}
			<div className="flex-1 min-w-0 space-y-5">
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
							setMode("create");
						}}
						className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "create" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
							}`}
					>
						Criar mensagem
					</button>
					<button
						type="button"
						onClick={() => setMode("link")}
						className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "link" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
							}`}
					>
						Vincular existente
					</button>
				</div>

				{mode === "create" ? (
					/* CREATE MODE - Criar mensagem diretamente */
					<div className="space-y-4">
						{/* Nome */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Nome da mensagem</Label>
							<InputWithVariablePicker
								value={label}
								onChange={setLabel}
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
									{elements.filter((e) => e.type === "button").length}/3 botões
								</span>
							</div>

							{elements.length === 0 ? (
								<div className="rounded-lg border bg-muted/20 p-3">
									<p className="text-sm text-muted-foreground">Nenhum bloco adicionado ainda.</p>
									<p className="text-xs text-muted-foreground mt-1">Arraste "Body" para começar.</p>
								</div>
							) : (
								<div className="space-y-2">
									{elements.map((el) => (
										<div key={el.id} className="rounded-lg border p-3 bg-background space-y-2">
											<div className="flex items-center justify-between gap-2">
												<div className="min-w-0">
													<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{el.type === "header_text"
															? "Header (texto)"
															: el.type === "header_image"
																? "Header (imagem)"
																: el.type === "body"
																	? "Body"
																	: el.type === "footer"
																		? "Footer"
																		: "Botão"}
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

											{el.type === "header_text" && (
												<InputWithVariablePicker
													value={el.text}
													onChange={(value) => updateElement(el.id, { text: value })}
													onBlur={() => commitElements(elements)}
													placeholder="Título"
													className="text-sm"
												/>
											)}

											{el.type === "header_image" && (
												<div className="space-y-2">
													<InputWithVariablePicker
														value={el.url ?? ""}
														onChange={(value) => updateElement(el.id, { url: value })}
														onBlur={() => commitElements(elements)}
														placeholder="URL da imagem"
														className="text-sm"
													/>
													<InputWithVariablePicker
														value={el.caption ?? ""}
														onChange={(value) => updateElement(el.id, { caption: value })}
														onBlur={() => commitElements(elements)}
														placeholder="Legenda (opcional)"
														className="text-sm"
													/>
												</div>
											)}

											{el.type === "body" && (
												<TextareaWithVariablePicker
													value={el.text}
													onChange={(value) => updateElement(el.id, { text: value })}
													onBlur={() => commitElements(elements)}
													placeholder="Digite o texto principal..."
													rows={4}
													className="text-sm resize-y"
												/>
											)}

											{el.type === "footer" && (
												<InputWithVariablePicker
													value={el.text}
													onChange={(value) => updateElement(el.id, { text: value })}
													onBlur={() => commitElements(elements)}
													placeholder="Texto de rodapé"
													className="text-sm"
												/>
											)}

											{el.type === "button" && (
												<div className="space-y-2">
													<InputWithVariablePicker
														value={el.title}
														onChange={(value) => updateElement(el.id, { title: value })}
														onBlur={() => commitElements(elements)}
														placeholder="Título do botão"
														className="text-sm"
													/>
													<InputWithVariablePicker
														value={el.description ?? ""}
														onChange={(value) => updateElement(el.id, { description: value })}
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

							<p className="text-xs text-muted-foreground">Dica: botões viram pontos de conexão no fluxo.</p>
						</div>
					</div>
				) : (
					/* LINK MODE - Vincular mensagem existente */
					<div className="space-y-4">
						{/* Nome do nó */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Nome do nó</Label>
							<InputWithVariablePicker
								value={label}
								onChange={setLabel}
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
									{selectedMsg.header?.text && <p className="text-xs font-bold">{selectedMsg.header.text}</p>}
									{selectedMsg.body?.text && (
										<p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
											{selectedMsg.body.text}
										</p>
									)}
									{selectedMsg.footer?.text && (
										<p className="text-xs text-muted-foreground italic">{selectedMsg.footer.text}</p>
									)}

									{/* Show buttons count */}
									{(() => {
										const action = selectedMsg.action as
											| {
												buttons?: Array<{ id: string; title: string }>;
											}
											| undefined;
										const btns = action?.buttons ?? [];
										if (btns.length === 0) return null;
										return <p className="text-xs text-muted-foreground">{btns.length} botão(ões)</p>;
									})()}

									<Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={handleClearMessage}>
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
													<p className="text-xs text-muted-foreground truncate mt-0.5">{msg.body.text}</p>
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

			{/* Right column: WhatsApp Preview */}
			<div className="hidden sm:block w-[300px] flex-shrink-0 border-l pl-6">
				<WhatsAppPreview
					header={previewData.header}
					body={previewData.body}
					footer={previewData.footer}
					buttons={previewData.buttons}
					mtfVariables={mtfVarsForPreview}
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Text Message
// ---------------------------------------------------------------------------
function TextMessageDetailEditor({ node, data, onUpdate }: EditorProps<TextMessageNodeData>) {
	const [label, setLabel] = useState(data.label ?? "");
	const [text, setText] = useState(data.text ?? "");

	useEffect(() => {
		setLabel(data.label ?? "");
		setText(data.text ?? "");
	}, [data.label, data.text]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Nome do nó</Label>
				<InputWithVariablePicker
					value={label}
					onChange={setLabel}
					onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
					placeholder="Texto Simples"
					className="text-sm"
				/>
			</div>
			<div className="space-y-2">
				<Label className="text-sm font-medium">Texto da mensagem</Label>
				<TextareaWithVariablePicker
					value={text}
					onChange={setText}
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
				<p className="text-xs text-muted-foreground">{text.length} caractere(s)</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Emoji Reaction
// ---------------------------------------------------------------------------
function EmojiReactionDetailEditor({ node, data, onUpdate }: EditorProps<EmojiReactionNodeData>) {
	const [selected, setSelected] = useState(data.emoji ?? "");

	useEffect(() => {
		setSelected(data.emoji ?? "");
	}, [data.emoji]);

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
			<Label className="text-sm font-medium">Escolha o emoji de reação</Label>
			<ScrollArea className="h-[300px] border rounded-md p-2">
				<div className="grid grid-cols-8 gap-2">
					{Array.from(new Set(COMMON_EMOJIS)).map((emoji) => (
						<button
							key={emoji}
							type="button"
							onClick={() => handleSelect(emoji)}
							className={`text-2xl p-2 rounded-lg border transition-all hover:scale-110 ${selected === emoji
									? "border-primary bg-primary/10 ring-2 ring-primary/30"
									: "border-transparent hover:border-border"
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
function TextReactionDetailEditor({ node, data, onUpdate }: EditorProps<TextReactionNodeData>) {
	const [label, setLabel] = useState(data.label ?? "");
	const [textReaction, setTextReaction] = useState(data.textReaction ?? "");

	useEffect(() => {
		setLabel(data.label ?? "");
		setTextReaction(data.textReaction ?? "");
	}, [data.label, data.textReaction]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Nome do nó</Label>
				<InputWithVariablePicker
					value={label}
					onChange={setLabel}
					onBlur={() => onUpdate(node.id, { label } as Partial<FlowNodeData>)}
					className="text-sm"
					placeholder="Resposta de Texto"
				/>
			</div>
			<div className="space-y-2">
				<Label className="text-sm font-medium">Texto de resposta</Label>
				<TextareaWithVariablePicker
					value={textReaction}
					onChange={setTextReaction}
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
function HandoffDetailEditor({ node, data, onUpdate }: EditorProps<HandoffNodeData>) {
	const [targetTeam, setTargetTeam] = useState(data.targetTeam ?? "");

	useEffect(() => {
		setTargetTeam(data.targetTeam ?? "");
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
function AddTagDetailEditor({ node, data, onUpdate }: EditorProps<AddTagNodeData>) {
	const [tagName, setTagName] = useState(data.tagName ?? "");
	const [tagColor, setTagColor] = useState(data.tagColor ?? TAG_COLORS[0]);

	useEffect(() => {
		setTagName(data.tagName ?? "");
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
								borderColor: tagColor === color ? "hsl(var(--primary))" : "transparent",
							}}
						/>
					))}
				</div>
			</div>
			{tagName && (
				<div className="flex items-center gap-2 mt-2">
					<span className="text-xs text-muted-foreground">Prévia:</span>
					<Badge style={{ backgroundColor: tagColor, color: "#fff" }} className="text-xs">
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
function EndConversationDetailEditor({ node, data, onUpdate }: EditorProps<EndConversationNodeData>) {
	const [endMessage, setEndMessage] = useState(data.endMessage ?? "");

	useEffect(() => {
		setEndMessage(data.endMessage ?? "");
	}, [data.endMessage]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Mensagem de encerramento (opcional)</Label>
				<TextareaWithVariablePicker
					value={endMessage}
					onChange={setEndMessage}
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
				A conversa será marcada como encerrada. A mensagem acima será enviada como despedida (se preenchida).
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Wait For Reply
// ---------------------------------------------------------------------------
function WaitForReplyDetailEditor({ node, data, onUpdate }: EditorProps<WaitForReplyNodeData>) {
	const [promptText, setPromptText] = useState(data.promptText ?? "");
	const [variableName, setVariableName] = useState(data.variableName ?? "user_reply");
	const [validationRegex, setValidationRegex] = useState(data.validationRegex ?? "");
	const [validationErrorMessage, setValidationErrorMessage] = useState(data.validationErrorMessage ?? "");
	const [maxAttempts, setMaxAttempts] = useState(data.maxAttempts ?? 2);
	const [skipButtonLabel, setSkipButtonLabel] = useState(data.skipButtonLabel ?? "Pular ⏭️");

	useEffect(() => {
		setPromptText(data.promptText ?? "");
		setVariableName(data.variableName ?? "user_reply");
		setValidationRegex(data.validationRegex ?? "");
		setValidationErrorMessage(data.validationErrorMessage ?? "");
		setMaxAttempts(data.maxAttempts ?? 2);
		setSkipButtonLabel(data.skipButtonLabel ?? "Pular ⏭️");
	}, [data]);

	const save = useCallback(() => {
		onUpdate(node.id, {
			promptText,
			variableName,
			validationRegex: validationRegex || undefined,
			validationErrorMessage: validationErrorMessage || undefined,
			maxAttempts,
			skipButtonLabel,
			isConfigured: !!promptText && !!variableName,
		} as Partial<FlowNodeData>);
	}, [node.id, onUpdate, promptText, variableName, validationRegex, validationErrorMessage, maxAttempts, skipButtonLabel]);

	const VALIDATION_PRESETS = [
		{ label: "Email", regex: "^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$", error: "Por favor, informe um email válido." },
		{ label: "CPF", regex: "^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$", error: "Por favor, informe um CPF válido (000.000.000-00)." },
		{ label: "Telefone", regex: "^\\+?\\d{10,13}$", error: "Por favor, informe um telefone válido." },
		{ label: "Número", regex: "^\\d+$", error: "Por favor, informe apenas números." },
	];

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Pergunta para o usuário</Label>
				<TextareaWithVariablePicker
					value={promptText}
					onChange={setPromptText}
					onBlur={save}
					placeholder="Ex: Qual é o seu email?"
					rows={3}
					className="text-sm resize-y"
				/>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Nome da variável</Label>
				<InputWithVariablePicker
					value={variableName}
					onChange={(value) => setVariableName(value.replace(/[^a-zA-Z0-9_]/g, ""))}
					onBlur={save}
					placeholder="user_email"
					className="text-sm font-mono"
					insertRaw
				/>
				<p className="text-xs text-muted-foreground">
					Use <code className="bg-muted px-1 rounded">{`{{${variableName || "variavel"}}}`}</code> nos nós seguintes para acessar o valor.
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Validação (opcional)</Label>
				<div className="flex gap-1.5 flex-wrap">
					{VALIDATION_PRESETS.map((preset) => (
						<Button
							key={preset.label}
							size="sm"
							variant={validationRegex === preset.regex ? "default" : "outline"}
							className="text-xs h-7"
							onClick={() => {
								setValidationRegex(preset.regex);
								setValidationErrorMessage(preset.error);
								onUpdate(node.id, {
									promptText,
									variableName,
									validationRegex: preset.regex,
									validationErrorMessage: preset.error,
									maxAttempts,
									skipButtonLabel,
									isConfigured: !!promptText && !!variableName,
								} as Partial<FlowNodeData>);
							}}
						>
							{preset.label}
						</Button>
					))}
				</div>
				<InputWithVariablePicker
					value={validationRegex}
					onChange={setValidationRegex}
					onBlur={save}
					placeholder="Regex personalizado (ex: ^[\\w.-]+@...)"
					className="text-sm font-mono"
				/>
			</div>

			{validationRegex && (
				<div className="space-y-2">
					<Label className="text-sm font-medium">Mensagem de erro</Label>
					<InputWithVariablePicker
						value={validationErrorMessage}
						onChange={setValidationErrorMessage}
						onBlur={save}
						placeholder="Formato inválido. Tente novamente."
						className="text-sm"
					/>
				</div>
			)}

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label className="text-sm font-medium">Máx. tentativas</Label>
					<Input
						type="number"
						min={1}
						max={5}
						value={maxAttempts}
						onChange={(e) => setMaxAttempts(Number(e.target.value))}
						onBlur={save}
						className="text-sm"
					/>
				</div>
				<div className="space-y-2">
					<Label className="text-sm font-medium">Botão pular</Label>
					<InputWithVariablePicker
						value={skipButtonLabel}
						onChange={setSkipButtonLabel}
						onBlur={save}
						placeholder="Pular ⏭️"
						className="text-sm"
					/>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Input with Variable Picker (reusable inline picker for form fields)
// ---------------------------------------------------------------------------
function InputWithVariablePicker({
	value,
	onChange,
	onBlur,
	placeholder,
	className,
	insertRaw,
}: {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	placeholder?: string;
	className?: string;
	/** If true, inserts just the variable name (no {{ }}) — for fields that store raw variable names */
	insertRaw?: boolean;
}) {
	const ctx = useFlowBuilderContext();
	const allVariables = ctx?.allVariables ?? STATIC_FLOW_VARIABLES;
	const [showMenu, setShowMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Close menu on click outside
	useEffect(() => {
		if (!showMenu) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as unknown as globalThis.Node)) {
				setShowMenu(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showMenu]);

	const groupedVariables = useMemo(() => {
		const groups: Record<string, FlowBuilderVariable[]> = {};
		for (const v of allVariables) {
			if (!groups[v.category]) groups[v.category] = [];
			groups[v.category].push(v);
		}
		return groups;
	}, [allVariables]);

	const categoryOrder = useMemo(() => {
		const order = ["contact", "conversation", "system"];
		if (groupedVariables.session?.length) order.push("session");
		if (groupedVariables.mtf?.length) order.push("mtf");
		if (groupedVariables.custom?.length) order.push("custom");
		return order.filter((c) => groupedVariables[c]?.length);
	}, [groupedVariables]);

	const mtfSubGroups = useMemo(() => {
		const mtfVars = groupedVariables.mtf || [];
		return {
			special: mtfVars.filter((v) => v.subCategory === "special"),
			normal: mtfVars.filter((v) => v.subCategory === "normal" || !v.subCategory),
			lote: mtfVars.filter((v) => v.subCategory === "lote"),
		};
	}, [groupedVariables]);

	const insertVariable = useCallback(
		(varName: string) => {
			const input = inputRef.current;
			if (insertRaw) {
				// For raw-name fields (e.g., email variable): replace entire value with just the name
				onChange(varName);
				setShowMenu(false);
				return;
			}
			const tag = `{{${varName}}}`;
			if (input) {
				const start = input.selectionStart ?? value.length;
				const newVal = value.substring(0, start) + tag + value.substring(input.selectionEnd ?? start);
				onChange(newVal);
				setTimeout(() => {
					input.focus();
					const pos = start + tag.length;
					input.setSelectionRange(pos, pos);
				}, 0);
			} else {
				onChange(value + tag);
			}
			setShowMenu(false);
		},
		[value, onChange, insertRaw],
	);

	const renderMtfSubGroup = (label: string, vars: FlowBuilderVariable[], icon?: React.ReactNode) => {
		if (!vars.length) return null;
		return (
			<>
				<div className="px-3 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
					{icon}
					{label}
				</div>
				{vars.map((variable) => (
					<button
						key={variable.name}
						className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex flex-col gap-0.5"
						onClick={() => insertVariable(variable.name)}
					>
						<div className="flex items-center justify-between">
							<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
							<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
						</div>
						{variable.value && (
							<span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-full">
								{variable.value.length > 50 ? `${variable.value.slice(0, 50)}…` : variable.value}
							</span>
						)}
					</button>
				))}
			</>
		);
	};

	return (
		<div className="relative" ref={menuRef}>
			<div className="flex gap-1">
				<Input
					ref={inputRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					placeholder={placeholder}
					className={cn("text-sm font-mono flex-1", className)}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-9 w-9 shrink-0"
					onClick={() => setShowMenu(!showMenu)}
					title="Inserir variável"
				>
					<Variable className="h-4 w-4" />
				</Button>
			</div>

			{showMenu && (
				<div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 z-50 overflow-hidden">
					<div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
						<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Selecione uma variável</span>
					</div>
					<div className="max-h-80 overflow-y-auto">
						{categoryOrder.map((category) => (
							<div key={category}>
								<div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50">
									{CATEGORY_LABELS[category] || category}
								</div>
								{category === "mtf" ? (
									<>
										{renderMtfSubGroup("Especiais", mtfSubGroups.special, <Variable className="h-2.5 w-2.5" />)}
										{renderMtfSubGroup("Normais", mtfSubGroups.normal, <Variable className="h-2.5 w-2.5" />)}
										{renderMtfSubGroup("Lote Ativo", mtfSubGroups.lote, <Package className="h-2.5 w-2.5" />)}
									</>
								) : (
									groupedVariables[category]?.map((variable) => (
										<button
											key={variable.name}
											className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-between"
											onClick={() => insertVariable(variable.name)}
										>
											<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
											<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
										</button>
									))
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function TextareaWithVariablePicker({
	value,
	onChange,
	onBlur,
	placeholder,
	className,
	rows = 4,
}: {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	placeholder?: string;
	className?: string;
	rows?: number;
}) {
	const ctx = useFlowBuilderContext();
	const allVariables = ctx?.allVariables ?? STATIC_FLOW_VARIABLES;
	const [showMenu, setShowMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!showMenu) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as unknown as globalThis.Node)) {
				setShowMenu(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showMenu]);

	const groupedVariables = useMemo(() => {
		const groups: Record<string, FlowBuilderVariable[]> = {};
		for (const variable of allVariables) {
			if (!groups[variable.category]) groups[variable.category] = [];
			groups[variable.category].push(variable);
		}
		return groups;
	}, [allVariables]);

	const categoryOrder = useMemo(() => {
		const order = ["contact", "conversation", "system"];
		if (groupedVariables.session?.length) order.push("session");
		if (groupedVariables.mtf?.length) order.push("mtf");
		if (groupedVariables.custom?.length) order.push("custom");
		return order.filter((category) => groupedVariables[category]?.length);
	}, [groupedVariables]);

	const mtfSubGroups = useMemo(() => {
		const mtfVars = groupedVariables.mtf || [];
		return {
			special: mtfVars.filter((v) => v.subCategory === "special"),
			normal: mtfVars.filter((v) => v.subCategory === "normal" || !v.subCategory),
			lote: mtfVars.filter((v) => v.subCategory === "lote"),
		};
	}, [groupedVariables]);

	const insertVariable = useCallback(
		(varName: string) => {
			const textarea = textareaRef.current;
			const tag = `{{${varName}}}`;
			if (textarea) {
				const start = textarea.selectionStart ?? value.length;
				const end = textarea.selectionEnd ?? start;
				onChange(value.slice(0, start) + tag + value.slice(end));
				setTimeout(() => {
					textarea.focus();
					const pos = start + tag.length;
					textarea.setSelectionRange(pos, pos);
				}, 0);
			} else {
				onChange(value + tag);
			}
			setShowMenu(false);
		},
		[value, onChange],
	);

	const renderMtfSubGroup = (label: string, vars: FlowBuilderVariable[], icon?: React.ReactNode) => {
		if (!vars.length) return null;
		return (
			<>
				<div className="px-3 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
					{icon}
					{label}
				</div>
				{vars.map((variable) => (
					<button
						key={variable.name}
						className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex flex-col gap-0.5"
						onClick={() => insertVariable(variable.name)}
					>
						<div className="flex items-center justify-between">
							<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
							<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
						</div>
					</button>
				))}
			</>
		);
	};

	return (
		<div className="relative" ref={menuRef}>
			<div className="flex gap-1 items-start">
				<Textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					placeholder={placeholder}
					rows={rows}
					className={cn("text-sm resize-y flex-1", className)}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-9 w-9 shrink-0"
					onClick={() => setShowMenu(!showMenu)}
					title="Inserir variável"
				>
					<Variable className="h-4 w-4" />
				</Button>
			</div>

			{showMenu && (
				<div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 z-50 overflow-hidden">
					<div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
						<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Selecione uma variável</span>
					</div>
					<div className="max-h-80 overflow-y-auto">
						{categoryOrder.map((category) => (
							<div key={category}>
								<div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50">
									{CATEGORY_LABELS[category] || category}
								</div>
								{category === "mtf" ? (
									<>
										{renderMtfSubGroup("Especiais", mtfSubGroups.special, <Variable className="h-2.5 w-2.5" />)}
										{renderMtfSubGroup("Normais", mtfSubGroups.normal, <Variable className="h-2.5 w-2.5" />)}
										{renderMtfSubGroup("Lote Ativo", mtfSubGroups.lote, <Package className="h-2.5 w-2.5" />)}
									</>
								) : (
									groupedVariables[category]?.map((variable) => (
										<button
											key={variable.name}
											className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-between"
											onClick={() => insertVariable(variable.name)}
										>
											<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
											<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
										</button>
									))
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Generate Payment Link
// ---------------------------------------------------------------------------
function GeneratePaymentLinkDetailEditor({ node, data, onUpdate }: EditorProps<GeneratePaymentLinkNodeData>) {
	const [provider, setProvider] = useState(data.provider ?? "infinitepay");
	const [handle, setHandle] = useState(data.handle ?? "");
	const [amountCents, setAmountCents] = useState(data.amountCents ?? "");
	const [description, setDescription] = useState(data.description ?? "");
	const [customerEmailVar, setCustomerEmailVar] = useState(data.customerEmailVar ?? "");
	const [outputVariable, setOutputVariable] = useState(data.outputVariable ?? "payment_url");
	const [linkIdVariable, setLinkIdVariable] = useState(data.linkIdVariable ?? "");

	useEffect(() => {
		setProvider(data.provider ?? "infinitepay");
		setHandle(data.handle ?? "");
		setAmountCents(data.amountCents ?? "");
		setDescription(data.description ?? "");
		setCustomerEmailVar(data.customerEmailVar ?? "");
		setOutputVariable(data.outputVariable ?? "payment_url");
		setLinkIdVariable(data.linkIdVariable ?? "");
	}, [data]);

	const save = useCallback(() => {
		onUpdate(node.id, {
			provider,
			handle,
			amountCents,
			description,
			customerEmailVar: customerEmailVar || undefined,
			outputVariable,
			linkIdVariable: linkIdVariable || undefined,
			isConfigured: !!handle && !!amountCents && !!outputVariable,
		} as Partial<FlowNodeData>);
	}, [node.id, onUpdate, provider, handle, amountCents, description, customerEmailVar, outputVariable, linkIdVariable]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Provider</Label>
				<select
					value={provider}
					onChange={(e) => {
						setProvider(e.target.value as GeneratePaymentLinkNodeData["provider"]);
						setTimeout(save, 0);
					}}
					className="w-full rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="infinitepay">InfinitePay</option>
					<option value="mercadopago">MercadoPago</option>
					<option value="asaas">Asaas</option>
				</select>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Handle do merchant</Label>
				<InputWithVariablePicker
					value={handle}
					onChange={setHandle}
					onBlur={save}
					placeholder="Ex: {{infinitepay_handle}}"
				/>
				<p className="text-xs text-muted-foreground">
					InfiniteTag sem o $. Use <code className="bg-muted px-1 rounded">{"{{infinitepay_handle}}"}</code> para variável.
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Valor</Label>
				<InputWithVariablePicker
					value={amountCents}
					onChange={setAmountCents}
					onBlur={save}
					placeholder="Ex: {{analise}} ou R$ 27,90"
				/>
				<p className="text-xs text-muted-foreground">
					Aceita "R$ 27,90", "27.90" ou centavos "2790". Variáveis como <code className="bg-muted px-1 rounded">{"{{analise}}"}</code> são resolvidas.
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Descrição</Label>
				<InputWithVariablePicker
					value={description}
					onChange={setDescription}
					onBlur={save}
					placeholder='Ex: Análise Lead {{contact_name}}'
					className="font-sans"
				/>
				<p className="text-xs text-muted-foreground">
					Aparece no checkout. Suporta variáveis.
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Email do cliente (variável)</Label>
				<InputWithVariablePicker
					value={customerEmailVar}
					onChange={(v) => setCustomerEmailVar(v.replace(/[^a-zA-Z0-9_]/g, ""))}
					onBlur={save}
					placeholder="user_email"
					insertRaw
				/>
				<p className="text-xs text-muted-foreground">
					Selecione a variável de sessão que contém o email (ex: coletado via Aguardar Resposta).
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Variável de saída (URL)</Label>
				<Input
					value={outputVariable}
					onChange={(e) => setOutputVariable(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
					onBlur={save}
					placeholder="payment_url"
					className="text-sm font-mono"
				/>
				<p className="text-xs text-muted-foreground">
					A URL do checkout será salva em <code className="bg-muted px-1 rounded">{`{{${outputVariable || "payment_url"}}}`}</code>.
				</p>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Variável do ID do link (opcional)</Label>
				<Input
					value={linkIdVariable}
					onChange={(e) => setLinkIdVariable(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
					onBlur={save}
					placeholder="payment_link_id"
					className="text-sm font-mono"
				/>
			</div>
		</div>
	);
}

export default NodeDetailDialog;
