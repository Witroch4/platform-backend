"use client";

import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Smile, MessageCircle, UserCheck, Tag, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import type {
	EmojiReactionNodeData,
	TextReactionNodeData,
	HandoffNodeData,
	AddTagNodeData,
	EndConversationNodeData,
} from "@/types/flow-builder";
import { NODE_COLORS, FlowNodeType } from "@/types/flow-builder";

// =============================================================================
// EMOJI REACTION NODE
// =============================================================================

const emojiColors = NODE_COLORS[FlowNodeType.EMOJI_REACTION];

type EmojiReactionNodeProps = NodeProps & {
	data: EmojiReactionNodeData & { [key: string]: unknown };
};

export const EmojiReactionNode = memo(({ id, data, selected }: EmojiReactionNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Cópia"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"min-w-[160px] rounded-lg border-2 shadow-md transition-all",
					emojiColors.bg,
					emojiColors.border,
					selected && "ring-2 ring-primary ring-offset-2",
					!data.isConfigured && "border-dashed opacity-80",
				)}
			>
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-yellow-500 !border-2 !border-white" />

				<div className="flex items-center gap-3 px-4 py-3">
					{data.emoji ? (
						<span className="text-3xl">{data.emoji}</span>
					) : (
						<Smile className={cn("h-6 w-6", emojiColors.icon)} />
					)}
					<div>
						<p className="font-medium text-sm">{data.label || "Emoji"}</p>
						{data.emoji ? (
							<p className="text-xs text-muted-foreground">Reação</p>
						) : (
							<p className="text-xs text-muted-foreground italic">Clique para configurar</p>
						)}
					</div>
				</div>

				<Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-yellow-500 !border-2 !border-white" />
			</div>
		</NodeContextMenu>
	);
});

EmojiReactionNode.displayName = "EmojiReactionNode";

// =============================================================================
// TEXT REACTION NODE
// =============================================================================

const textColors = NODE_COLORS[FlowNodeType.TEXT_REACTION];

type TextReactionNodeProps = NodeProps & {
	data: TextReactionNodeData & { [key: string]: unknown };
};

export const TextReactionNode = memo(({ id, data, selected }: TextReactionNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Cópia"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"min-w-[200px] max-w-[280px] rounded-lg border-2 shadow-md transition-all",
					textColors.bg,
					textColors.border,
					selected && "ring-2 ring-primary ring-offset-2",
					!data.isConfigured && "border-dashed opacity-80",
				)}
			>
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-purple-500 !border-2 !border-white" />

				<div className="flex items-start gap-2 px-3 py-3">
					<MessageCircle className={cn("h-5 w-5 mt-0.5 shrink-0", textColors.icon)} />
					<div className="min-w-0">
						<p className="font-medium text-sm">{data.label || "Texto"}</p>
						{data.textReaction ? (
							<p className="text-xs text-muted-foreground line-clamp-2 mt-1">"{data.textReaction}"</p>
						) : (
							<p className="text-xs text-muted-foreground italic mt-1">Clique para configurar</p>
						)}
					</div>
				</div>

				<Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-purple-500 !border-2 !border-white" />
			</div>
		</NodeContextMenu>
	);
});

TextReactionNode.displayName = "TextReactionNode";

// =============================================================================
// HANDOFF NODE
// =============================================================================

const handoffColors = NODE_COLORS[FlowNodeType.HANDOFF];

type HandoffNodeProps = NodeProps & {
	data: HandoffNodeData & { [key: string]: unknown };
};

export const HandoffNode = memo(({ id, data, selected }: HandoffNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Cópia"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"min-w-[180px] rounded-lg border-2 shadow-md transition-all",
					handoffColors.bg,
					handoffColors.border,
					selected && "ring-2 ring-primary ring-offset-2",
				)}
			>
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-orange-500 !border-2 !border-white" />

				<div className="flex items-center gap-3 px-4 py-3">
					<div className={cn("flex h-8 w-8 items-center justify-center rounded-full", "bg-orange-500 text-white")}>
						<UserCheck className="h-4 w-4" />
					</div>
					<div>
						<p className="font-medium text-sm">{data.label || "Transferir"}</p>
						<p className="text-xs text-muted-foreground">{data.targetTeam || "Para agente humano"}</p>
					</div>
				</div>
			</div>
		</NodeContextMenu>
	);
});

HandoffNode.displayName = "HandoffNode";

// =============================================================================
// ADD TAG NODE
// =============================================================================

const tagColors = NODE_COLORS[FlowNodeType.ADD_TAG];

type AddTagNodeProps = NodeProps & {
	data: AddTagNodeData & { [key: string]: unknown };
};

export const AddTagNode = memo(({ id, data, selected }: AddTagNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Cópia"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"min-w-[160px] rounded-lg border-2 shadow-md transition-all",
					tagColors.bg,
					tagColors.border,
					selected && "ring-2 ring-primary ring-offset-2",
					!data.isConfigured && "border-dashed opacity-80",
				)}
			>
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-pink-500 !border-2 !border-white" />

				<div className="flex items-center gap-3 px-4 py-3">
					<Tag className={cn("h-5 w-5", tagColors.icon)} />
					<div>
						<p className="font-medium text-sm">{data.label || "Tag"}</p>
						{data.tagName ? (
							<span
								className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full"
								style={{
									backgroundColor: data.tagColor ?? "#e5e7eb",
									color: data.tagColor ? "#fff" : "#374151",
								}}
							>
								{data.tagName}
							</span>
						) : (
							<p className="text-xs text-muted-foreground italic">Clique para configurar</p>
						)}
					</div>
				</div>

				<Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-pink-500 !border-2 !border-white" />
			</div>
		</NodeContextMenu>
	);
});

AddTagNode.displayName = "AddTagNode";

// =============================================================================
// END CONVERSATION NODE
// =============================================================================

const endColors = NODE_COLORS[FlowNodeType.END_CONVERSATION];

type EndConversationNodeProps = NodeProps & {
	data: EndConversationNodeData & { [key: string]: unknown };
};

export const EndConversationNode = memo(({ id, data, selected }: EndConversationNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Cópia"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"min-w-[180px] rounded-lg border-2 shadow-md transition-all",
					endColors.bg,
					endColors.border,
					selected && "ring-2 ring-primary ring-offset-2",
				)}
			>
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-red-500 !border-2 !border-white" />

				<div className="flex items-center gap-3 px-4 py-3">
					<div className={cn("flex h-8 w-8 items-center justify-center rounded-full", "bg-red-500 text-white")}>
						<CheckCircle className="h-4 w-4" />
					</div>
					<div>
						<p className="font-medium text-sm">{data.label || "Finalizar"}</p>
						<p className="text-xs text-muted-foreground">{data.endMessage || "Encerrar conversa"}</p>
					</div>
				</div>
			</div>
		</NodeContextMenu>
	);
});
// =============================================================================
// EXPORTS
// =============================================================================

export const reactionNodeTypes = {
	emoji_reaction: EmojiReactionNode,
	text_reaction: TextReactionNode,
	handoff: HandoffNode,
	add_tag: AddTagNode,
	end: EndConversationNode,
};
