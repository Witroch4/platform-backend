"use client";

import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Zap, Plus, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuickRepliesNodeData, QuickReplyItem } from "@/types/flow-builder";
import { INSTAGRAM_VALIDATION } from "@/types/flow-builder";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import { Button } from "@/components/ui/button";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableItem } from "@/app/mtf-diamante/components/shared/dnd/SortableItem";

// =============================================================================
// ID GENERATION
// =============================================================================

const FLOW_QUICK_REPLY_PREFIX = "flow_qr_";

function generateQuickReplyId(): string {
	return `${FLOW_QUICK_REPLY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// TYPES
// =============================================================================

type QuickRepliesNodeProps = NodeProps & {
	data: QuickRepliesNodeData & { [key: string]: unknown };
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * QuickRepliesNode - Nó de Quick Replies para Instagram/Facebook
 *
 * Características:
 * - Prompt text (max 1000 chars)
 * - Até 13 quick replies
 * - Cada quick reply tem título (max 20 chars) e payload
 * - Cada quick reply gera um source handle para conexão
 */
export const QuickRepliesNode = memo(({ id, data, selected }: QuickRepliesNodeProps) => {
	const { setNodes, getNodes, setEdges } = useReactFlow();

	// @dnd-kit sensors for drag reorder
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	const quickReplies = data.quickReplies ?? [];
	const promptText = data.promptText ?? "";
	const canAddMore = quickReplies.length < INSTAGRAM_VALIDATION.quickReplies.maxCount;

	// Update prompt text
	const updatePromptText = useCallback(
		(text: string) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as QuickRepliesNodeData;
						const hasContent = text.trim().length > 0 || currentData.quickReplies?.length > 0;
						return {
							...node,
							data: {
								...currentData,
								promptText: text,
								isConfigured: hasContent,
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Add new quick reply
	const addQuickReply = useCallback(() => {
		if (!canAddMore) return;

		setNodes((nodes) =>
			nodes.map((node) => {
				if (node.id === id) {
					const currentData = node.data as unknown as QuickRepliesNodeData;
					const newQuickReply: QuickReplyItem = {
						id: generateQuickReplyId(),
						title: "",
						payload: "",
					};
					const updatedReplies = [...(currentData.quickReplies ?? []), newQuickReply];
					return {
						...node,
						data: {
							...currentData,
							quickReplies: updatedReplies,
							isConfigured: currentData.promptText?.trim().length > 0 || updatedReplies.length > 0,
						},
					};
				}
				return node;
			}),
		);
	}, [id, setNodes, canAddMore]);

	// Update quick reply
	const updateQuickReply = useCallback(
		(replyId: string, updates: Partial<QuickReplyItem>) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as QuickRepliesNodeData;
						const updatedReplies = (currentData.quickReplies ?? []).map((qr) =>
							qr.id === replyId ? { ...qr, ...updates } : qr,
						);
						return {
							...node,
							data: {
								...currentData,
								quickReplies: updatedReplies,
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Remove quick reply
	const removeQuickReply = useCallback(
		(replyId: string) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as QuickRepliesNodeData;
						const updatedReplies = (currentData.quickReplies ?? []).filter((qr) => qr.id !== replyId);
						return {
							...node,
							data: {
								...currentData,
								quickReplies: updatedReplies,
								isConfigured: currentData.promptText?.trim().length > 0 || updatedReplies.length > 0,
							},
						};
					}
					return node;
				}),
			);

			// Remove edges connected to this quick reply
			setEdges((edges) => edges.filter((e) => e.sourceHandle !== replyId));
		},
		[id, setNodes, setEdges],
	);

	// Drag reorder handler
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = quickReplies.findIndex((qr) => qr.id === active.id);
			const newIndex = quickReplies.findIndex((qr) => qr.id === over.id);

			if (oldIndex !== -1 && newIndex !== -1) {
				setNodes((nodes) =>
					nodes.map((node) => {
						if (node.id === id) {
							const currentData = node.data as unknown as QuickRepliesNodeData;
							return {
								...node,
								data: {
									...currentData,
									quickReplies: arrayMove(currentData.quickReplies ?? [], oldIndex, newIndex),
								},
							};
						}
						return node;
					}),
				);
			}
		},
		[id, quickReplies, setNodes],
	);

	// Duplicate node
	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `quick_replies-${Date.now()}`;
		const currentData = currentNode.data as unknown as QuickRepliesNodeData;

		// Clone quick replies with new IDs
		const clonedReplies = (currentData.quickReplies ?? []).map((qr) => ({
			...qr,
			id: generateQuickReplyId(),
		}));

		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentData,
				label: `${currentData.label || "Quick Replies"} (cópia)`,
				quickReplies: clonedReplies,
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	// Delete node
	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((n) => n.id !== id));
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	// Calculate handle positions for each quick reply
	const getHandleTop = (index: number, total: number): string => {
		if (total === 0) return "50%";
		// Start at 180px (after header + prompt) and space them evenly
		const startY = 180;
		const spacing = 48; // Height of each quick reply item
		return `${startY + index * spacing + spacing / 2}px`;
	};

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"w-[320px] rounded-xl border-2 bg-white dark:bg-gray-900 shadow-lg transition-all",
					selected
						? "border-violet-500 ring-2 ring-violet-200 dark:ring-violet-800"
						: "border-violet-300 dark:border-violet-700",
					"hover:shadow-xl",
				)}
			>
				{/* Target Handle (top) */}
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-violet-500 !border-2 !border-white" />

				{/* Header */}
				<div className="bg-gradient-to-r from-violet-500 to-pink-500 px-4 py-3 rounded-t-lg">
					<div className="flex items-center gap-2 text-white">
						<Zap className="h-5 w-5" />
						<span className="font-semibold text-sm">Quick Replies</span>
						<span className="ml-auto text-xs opacity-80">
							{quickReplies.length}/{INSTAGRAM_VALIDATION.quickReplies.maxCount}
						</span>
					</div>
				</div>

				{/* Content */}
				<div className="p-3 space-y-3">
					{/* Prompt Text */}
					<div>
						<label className="text-xs font-medium text-muted-foreground mb-1 block">Texto da mensagem</label>
						<textarea
							value={promptText}
							onChange={(e) => updatePromptText(e.target.value)}
							placeholder="Digite a pergunta..."
							maxLength={INSTAGRAM_VALIDATION.quickReplies.promptMaxLength}
							className={cn(
								"w-full text-sm min-h-[60px] p-2 rounded-md border resize-none",
								"bg-transparent focus:outline-none focus:ring-2 focus:ring-violet-500",
								"placeholder:text-muted-foreground/50",
							)}
						/>
						<div className="text-[10px] text-muted-foreground text-right mt-1">
							{promptText.length}/{INSTAGRAM_VALIDATION.quickReplies.promptMaxLength}
						</div>
					</div>

					{/* Quick Replies List */}
					<div className="space-y-2">
						<label className="text-xs font-medium text-muted-foreground">Respostas rápidas</label>

						{quickReplies.length === 0 ? (
							<div className="text-xs text-muted-foreground italic py-2 text-center border border-dashed rounded-lg">
								Nenhuma resposta adicionada
							</div>
						) : (
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
								<SortableContext items={quickReplies.map((qr) => qr.id)} strategy={verticalListSortingStrategy}>
									<div className="space-y-2">
										{quickReplies.map((qr) => (
											<SortableItem key={qr.id} id={qr.id}>
												<div
													className={cn(
														"relative group flex items-center gap-2 p-2 rounded-lg border bg-violet-50 dark:bg-violet-950/50",
														"border-violet-200 dark:border-violet-800",
													)}
												>
													<GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />

													<input
														type="text"
														value={qr.title}
														onChange={(e) => updateQuickReply(qr.id, { title: e.target.value })}
														placeholder="Resposta..."
														maxLength={INSTAGRAM_VALIDATION.quickReplies.titleMaxLength}
														className={cn(
															"flex-1 bg-transparent border-none text-sm focus:outline-none",
															"placeholder:text-muted-foreground/50",
														)}
													/>

													<span className="text-[10px] text-muted-foreground">
														{qr.title.length}/{INSTAGRAM_VALIDATION.quickReplies.titleMaxLength}
													</span>

													<button
														type="button"
														onClick={() => removeQuickReply(qr.id)}
														className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-opacity"
													>
														<X className="h-3 w-3 text-red-500" />
													</button>
												</div>
											</SortableItem>
										))}
									</div>
								</SortableContext>
							</DndContext>
						)}

						{/* Add Button */}
						{canAddMore && (
							<Button
								variant="outline"
								size="sm"
								onClick={addQuickReply}
								className="w-full border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950"
							>
								<Plus className="h-4 w-4 mr-1" />
								Adicionar resposta
							</Button>
						)}
					</div>
				</div>

				{/* Source Handles (right side, one per quick reply) */}
				{quickReplies.map((qr, index) => (
					<Handle
						key={qr.id}
						type="source"
						position={Position.Right}
						id={qr.id}
						style={{ top: getHandleTop(index, quickReplies.length) }}
						className="!h-3 !w-3 !bg-violet-500 !border-2 !border-white"
					/>
				))}
			</div>
		</NodeContextMenu>
	);
});

QuickRepliesNode.displayName = "QuickRepliesNode";

export default QuickRepliesNode;
