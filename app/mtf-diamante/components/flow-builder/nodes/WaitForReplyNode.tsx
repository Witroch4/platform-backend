"use client";

import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import type { WaitForReplyNodeData } from "@/types/flow-builder";
import { NODE_COLORS, FlowNodeType } from "@/types/flow-builder";

const colors = NODE_COLORS[FlowNodeType.WAIT_FOR_REPLY];

type WaitForReplyNodeProps = NodeProps & {
	data: WaitForReplyNodeData & { [key: string]: unknown };
};

export const WaitForReplyNode = memo(({ id, data, selected }: WaitForReplyNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();
	const isConfigured = data.isConfigured && !!data.promptText && !!data.variableName;

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `wait_for_reply-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Aguardar Resposta"} (cópia)`,
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
					"min-w-[200px] max-w-[260px] rounded-lg border-2 shadow-md transition-all",
					colors.bg,
					colors.border,
					selected && "ring-2 ring-primary ring-offset-2",
					!isConfigured && "border-dashed opacity-80",
				)}
			>
				{/* Handle de entrada (top) */}
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-amber-500 !border-2 !border-white" />

				{/* Header */}
				<div className="flex items-center gap-2 border-b px-3 py-2 bg-amber-100/50 dark:bg-amber-900/30">
					<MessageSquareText className={cn("h-4 w-4", colors.icon)} />
					<span className="font-medium text-sm">{data.label || "Aguardar Resposta"}</span>
				</div>

				{/* Body */}
				<div className="px-3 py-3 space-y-2">
					{data.promptText ? (
						<p className="text-xs text-muted-foreground line-clamp-2">{data.promptText}</p>
					) : (
						<p className="text-xs text-muted-foreground italic">Configure a pergunta...</p>
					)}

					{data.variableName && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-muted-foreground">Variável:</span>
							<code className="text-[10px] bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded font-mono">
								{`{{${data.variableName}}}`}
							</code>
						</div>
					)}

					{data.validationRegex && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-muted-foreground">Validação:</span>
							<code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
								{data.validationRegex}
							</code>
						</div>
					)}
				</div>

				{/* Handle de saída (bottom) — edge default (texto válido ou skip) */}
				<Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-amber-500 !border-2 !border-white" />
			</div>
		</NodeContextMenu>
	);
});

WaitForReplyNode.displayName = "WaitForReplyNode";

export default WaitForReplyNode;
