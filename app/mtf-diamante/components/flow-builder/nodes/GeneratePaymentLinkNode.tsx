"use client";

import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import type { GeneratePaymentLinkNodeData } from "@/types/flow-builder";
import { NODE_COLORS, FlowNodeType } from "@/types/flow-builder";

const colors = NODE_COLORS[FlowNodeType.GENERATE_PAYMENT_LINK];

type GeneratePaymentLinkNodeProps = NodeProps & {
	data: GeneratePaymentLinkNodeData & { [key: string]: unknown };
};

const PROVIDER_LABELS: Record<string, string> = {
	infinitepay: "InfinitePay",
	mercadopago: "MercadoPago",
	asaas: "Asaas",
};

export const GeneratePaymentLinkNode = memo(({ id, data, selected }: GeneratePaymentLinkNodeProps) => {
	const { setNodes, setEdges, getNodes } = useReactFlow();
	const isConfigured = data.isConfigured && !!data.handle && !!data.amountCents && !!data.outputVariable;

	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `generate_payment_link-${Date.now()}`;
		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentNode.data.label || "Link de Pagamento"} (cópia)`,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	const providerLabel = PROVIDER_LABELS[data.provider] ?? data.provider ?? "InfinitePay";

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
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-emerald-500 !border-2 !border-white" />

				{/* Header */}
				<div className="flex items-center gap-2 border-b px-3 py-2 bg-emerald-100/50 dark:bg-emerald-900/30">
					<CreditCard className={cn("h-4 w-4", colors.icon)} />
					<span className="font-medium text-sm">{data.label || "Link de Pagamento"}</span>
					<span className="ml-auto text-[10px] text-muted-foreground bg-emerald-200/60 dark:bg-emerald-800/60 px-1.5 py-0.5 rounded">
						{providerLabel}
					</span>
				</div>

				{/* Body */}
				<div className="px-3 py-3 space-y-1.5">
					{data.handle ? (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-muted-foreground">Handle:</span>
							<code className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
								{data.handle}
							</code>
						</div>
					) : (
						<p className="text-xs text-muted-foreground italic">Configure o handle...</p>
					)}

					{data.amountCents && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-muted-foreground">Valor:</span>
							<code className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
								{data.amountCents}
							</code>
						</div>
					)}

					{data.description && (
						<p className="text-[10px] text-muted-foreground line-clamp-1">{data.description}</p>
					)}

					{data.outputVariable && (
						<div className="flex items-center gap-1.5 pt-1 border-t border-dashed">
							<span className="text-[10px] text-muted-foreground">Salva em:</span>
							<code className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded font-mono">
								{`{{${data.outputVariable}}}`}
							</code>
						</div>
					)}
				</div>

				{/* Handle de saída (bottom) */}
				<Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-emerald-500 !border-2 !border-white" />
			</div>
		</NodeContextMenu>
	);
});

GeneratePaymentLinkNode.displayName = "GeneratePaymentLinkNode";

export default GeneratePaymentLinkNode;
