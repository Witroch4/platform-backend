"use client";

import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Layers, Plus, X, ChevronLeft, ChevronRight, Link2, MousePointer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CarouselNodeData, CarouselCard, CarouselCardButton } from "@/types/flow-builder";
import { INSTAGRAM_VALIDATION } from "@/types/flow-builder";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MinIOMediaUpload, { type MinIOMediaFile } from "@/app/mtf-diamante/components/shared/MinIOMediaUpload";

// =============================================================================
// ID GENERATION
// =============================================================================

const FLOW_CAROUSEL_BTN_PREFIX = "flow_carousel_";

function generateCardId(): string {
	return `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateButtonId(): string {
	return `${FLOW_CAROUSEL_BTN_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// TYPES
// =============================================================================

type CarouselNodeProps = NodeProps & {
	data: CarouselNodeData & { [key: string]: unknown };
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CarouselNode - Nó de Carrossel (Generic Template) para Instagram/Facebook
 *
 * Características:
 * - Até 10 cards
 * - Cada card: título (80), subtítulo (80), imagem, até 3 botões
 * - Botões podem ser web_url (abre link) ou postback (envia payload)
 * - Apenas botões postback geram source handles para conexão
 */
export const CarouselNode = memo(({ id, data, selected }: CarouselNodeProps) => {
	const { setNodes, getNodes, setEdges } = useReactFlow();
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const [cardMediaFiles, setCardMediaFiles] = useState<Record<string, MinIOMediaFile[]>>({});

	const cards = data.cards ?? [];
	const canAddMoreCards = cards.length < INSTAGRAM_VALIDATION.genericTemplate.maxElements;
	const activeCard = cards[activeCardIndex];

	// Sync cardMediaFiles when card has existing imageUrl
	useEffect(() => {
		if (activeCard?.imageUrl && !cardMediaFiles[activeCard.id]?.length) {
			// Card já tem imagem, não mostrar upload vazio
		}
	}, [activeCard, cardMediaFiles]);

	// Update cards
	const updateCards = useCallback(
		(updater: (cards: CarouselCard[]) => CarouselCard[]) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as CarouselNodeData;
						const updatedCards = updater(currentData.cards ?? []);
						return {
							...node,
							data: {
								...currentData,
								cards: updatedCards,
								isConfigured: updatedCards.length > 0 && updatedCards.some((c) => c.title.trim().length > 0),
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Add new card
	const addCard = useCallback(() => {
		if (!canAddMoreCards) return;

		const newCard: CarouselCard = {
			id: generateCardId(),
			title: "",
			subtitle: "",
			imageUrl: "",
			buttons: [],
		};

		updateCards((cards) => [...cards, newCard]);
		setActiveCardIndex(cards.length); // Switch to new card
	}, [canAddMoreCards, updateCards, cards.length]);

	// Remove card
	const removeCard = useCallback(
		(cardId: string) => {
			const cardIndex = cards.findIndex((c) => c.id === cardId);
			const cardToRemove = cards[cardIndex];

			// Remove edges connected to this card's buttons
			if (cardToRemove?.buttons) {
				const buttonIds = cardToRemove.buttons.map((b) => b.id);
				setEdges((edges) => edges.filter((e) => !buttonIds.includes(e.sourceHandle ?? "")));
			}

			updateCards((cards) => cards.filter((c) => c.id !== cardId));

			// Adjust active index
			if (activeCardIndex >= cards.length - 1) {
				setActiveCardIndex(Math.max(0, cards.length - 2));
			}
		},
		[cards, updateCards, activeCardIndex, setEdges],
	);

	// Update card field
	const updateCardField = useCallback(
		(cardId: string, field: keyof CarouselCard, value: string) => {
			updateCards((cards) => cards.map((c) => (c.id === cardId ? { ...c, [field]: value } : c)));
		},
		[updateCards],
	);

	// Handle MinIO upload complete
	const handleUploadComplete = useCallback(
		(cardId: string, file: MinIOMediaFile) => {
			if (file.url) {
				updateCardField(cardId, "imageUrl", file.url);
			}
		},
		[updateCardField],
	);

	// Clear media files for a card
	const clearCardMedia = useCallback(
		(cardId: string) => {
			setCardMediaFiles((prev) => ({ ...prev, [cardId]: [] }));
			updateCardField(cardId, "imageUrl", "");
		},
		[updateCardField],
	);

	// Add button to card
	const addButtonToCard = useCallback(
		(cardId: string) => {
			const card = cards.find((c) => c.id === cardId);
			if (!card || (card.buttons?.length ?? 0) >= INSTAGRAM_VALIDATION.genericTemplate.maxButtonsPerElement) {
				return;
			}

			const newButton: CarouselCardButton = {
				id: generateButtonId(),
				type: "postback",
				title: "",
			};

			updateCards((cards) =>
				cards.map((c) => (c.id === cardId ? { ...c, buttons: [...(c.buttons ?? []), newButton] } : c)),
			);
		},
		[cards, updateCards],
	);

	// Update button
	const updateButton = useCallback(
		(cardId: string, buttonId: string, updates: Partial<CarouselCardButton>) => {
			updateCards((cards) =>
				cards.map((c) => {
					if (c.id !== cardId) return c;
					return {
						...c,
						buttons: (c.buttons ?? []).map((b) => (b.id === buttonId ? { ...b, ...updates } : b)),
					};
				}),
			);
		},
		[updateCards],
	);

	// Remove button
	const removeButton = useCallback(
		(cardId: string, buttonId: string) => {
			updateCards((cards) =>
				cards.map((c) => {
					if (c.id !== cardId) return c;
					return {
						...c,
						buttons: (c.buttons ?? []).filter((b) => b.id !== buttonId),
					};
				}),
			);

			// Remove edges connected to this button
			setEdges((edges) => edges.filter((e) => e.sourceHandle !== buttonId));
		},
		[updateCards, setEdges],
	);

	// Duplicate node
	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `carousel-${Date.now()}`;
		const currentData = currentNode.data as unknown as CarouselNodeData;

		// Clone cards with new IDs
		const clonedCards = (currentData.cards ?? []).map((card) => ({
			...card,
			id: generateCardId(),
			buttons: (card.buttons ?? []).map((btn) => ({
				...btn,
				id: generateButtonId(),
			})),
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
				label: `${currentData.label || "Carrossel"} (cópia)`,
				cards: clonedCards,
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

	// Get all postback buttons for handle rendering
	const allPostbackButtons = cards.flatMap((card, cardIndex) =>
		(card.buttons ?? [])
			.filter((btn) => btn.type === "postback")
			.map((btn, btnIndex) => ({
				...btn,
				cardIndex,
				globalIndex:
					cards
						.slice(0, cardIndex)
						.reduce((acc, c) => acc + (c.buttons?.filter((b) => b.type === "postback").length ?? 0), 0) + btnIndex,
			})),
	);

	// Calculate handle positions
	const getHandleTop = (index: number, total: number): string => {
		if (total === 0) return "50%";
		const startY = 280; // After header + card preview
		const spacing = 32;
		return `${startY + index * spacing}px`;
	};

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				className={cn(
					"w-[360px] rounded-xl border-2 bg-white dark:bg-gray-900 shadow-lg transition-all",
					selected
						? "border-amber-500 ring-2 ring-amber-200 dark:ring-amber-800"
						: "border-amber-300 dark:border-amber-700",
					"hover:shadow-xl",
				)}
			>
				{/* Target Handle (top) */}
				<Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-amber-500 !border-2 !border-white" />

				{/* Header */}
				<div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 rounded-t-lg">
					<div className="flex items-center gap-2 text-white">
						<Layers className="h-5 w-5" />
						<span className="font-semibold text-sm">Carrossel</span>
						<span className="ml-auto text-xs opacity-80">
							{cards.length}/{INSTAGRAM_VALIDATION.genericTemplate.maxElements} cards
						</span>
					</div>
				</div>

				{/* Content */}
				<div className="p-3 space-y-3">
					{cards.length === 0 ? (
						<div className="text-center py-6 border border-dashed rounded-lg">
							<Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
							<p className="text-sm text-muted-foreground">Nenhum card adicionado</p>
							<Button variant="outline" size="sm" onClick={addCard} className="mt-3">
								<Plus className="h-4 w-4 mr-1" />
								Adicionar card
							</Button>
						</div>
					) : (
						<>
							{/* Card Navigation */}
							<div className="flex items-center justify-between">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setActiveCardIndex(Math.max(0, activeCardIndex - 1))}
									disabled={activeCardIndex === 0}
									className="h-8 w-8"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>

								<span className="text-sm font-medium">
									Card {activeCardIndex + 1} de {cards.length}
								</span>

								<Button
									variant="ghost"
									size="icon"
									onClick={() => setActiveCardIndex(Math.min(cards.length - 1, activeCardIndex + 1))}
									disabled={activeCardIndex === cards.length - 1}
									className="h-8 w-8"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>

							{/* Active Card Editor */}
							{activeCard && (
								<div className="space-y-2 p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/30">
									{/* Card Image Upload / Preview */}
									{activeCard.imageUrl ? (
										<div className="relative h-24 bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden group">
											<img
												src={activeCard.imageUrl}
												alt="Card"
												className="w-full h-full object-cover"
												onError={(e) => {
													(e.target as HTMLImageElement).style.display = "none";
												}}
											/>
											<button
												type="button"
												onClick={() => clearCardMedia(activeCard.id)}
												className="absolute top-1 right-1 p-1.5 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
												title="Remover imagem"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									) : (
										<MinIOMediaUpload
											uploadedFiles={cardMediaFiles[activeCard.id] ?? []}
											setUploadedFiles={(files) => {
												const updater =
													typeof files === "function" ? files(cardMediaFiles[activeCard.id] ?? []) : files;
												setCardMediaFiles((prev) => ({ ...prev, [activeCard.id]: updater }));
											}}
											allowedTypes={["image/jpeg", "image/png", "image/jpg", "image/webp"]}
											maxSizeMB={5}
											maxFiles={1}
											title=""
											description="Arraste imagem ou clique"
											onUploadComplete={(file) => handleUploadComplete(activeCard.id, file)}
										/>
									)}

									{/* Title */}
									<Input
										value={activeCard.title}
										onChange={(e) => updateCardField(activeCard.id, "title", e.target.value)}
										placeholder="Título do card..."
										maxLength={INSTAGRAM_VALIDATION.genericTemplate.titleMaxLength}
										className="text-sm font-medium"
									/>

									{/* Subtitle */}
									<Input
										value={activeCard.subtitle ?? ""}
										onChange={(e) => updateCardField(activeCard.id, "subtitle", e.target.value)}
										placeholder="Subtítulo (opcional)..."
										maxLength={INSTAGRAM_VALIDATION.genericTemplate.subtitleMaxLength}
										className="text-xs"
									/>

									{/* Buttons */}
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Botões ({activeCard.buttons?.length ?? 0}/
											{INSTAGRAM_VALIDATION.genericTemplate.maxButtonsPerElement})
										</label>

										{(activeCard.buttons ?? []).map((btn) => (
											<div key={btn.id} className="flex items-center gap-1.5 group">
												<button
													type="button"
													onClick={() =>
														updateButton(activeCard.id, btn.id, {
															type: btn.type === "postback" ? "web_url" : "postback",
														})
													}
													className={cn(
														"p-1.5 rounded transition-colors flex-shrink-0",
														btn.type === "postback"
															? "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300"
															: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",
													)}
													title={btn.type === "postback" ? "Postback (conecta no flow)" : "URL (abre link)"}
												>
													{btn.type === "postback" ? (
														<MousePointer className="h-3 w-3" />
													) : (
														<Link2 className="h-3 w-3" />
													)}
												</button>

												<Input
													value={btn.title}
													onChange={(e) => updateButton(activeCard.id, btn.id, { title: e.target.value })}
													placeholder="Título..."
													maxLength={20}
													className="text-xs h-7 flex-1"
												/>

												{btn.type === "web_url" && (
													<Input
														value={btn.url ?? ""}
														onChange={(e) => updateButton(activeCard.id, btn.id, { url: e.target.value })}
														placeholder="URL..."
														className="text-xs h-7 flex-1"
													/>
												)}

												<button
													type="button"
													onClick={() => removeButton(activeCard.id, btn.id)}
													className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900"
												>
													<X className="h-3 w-3 text-red-500" />
												</button>
											</div>
										))}

										{(activeCard.buttons?.length ?? 0) < INSTAGRAM_VALIDATION.genericTemplate.maxButtonsPerElement && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => addButtonToCard(activeCard.id)}
												className="w-full h-7 text-xs border-dashed border"
											>
												<Plus className="h-3 w-3 mr-1" />
												Adicionar botão
											</Button>
										)}
									</div>

									{/* Remove Card */}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => removeCard(activeCard.id)}
										className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
									>
										<X className="h-3 w-3 mr-1" />
										Remover card
									</Button>
								</div>
							)}

							{/* Add Card Button */}
							{canAddMoreCards && (
								<Button
									variant="outline"
									size="sm"
									onClick={addCard}
									className="w-full border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
								>
									<Plus className="h-4 w-4 mr-1" />
									Adicionar card
								</Button>
							)}
						</>
					)}
				</div>

				{/* Source Handles (right side, one per postback button) */}
				{allPostbackButtons.map((btn, index) => (
					<Handle
						key={btn.id}
						type="source"
						position={Position.Right}
						id={btn.id}
						style={{ top: getHandleTop(index, allPostbackButtons.length) }}
						className="!h-3 !w-3 !bg-amber-500 !border-2 !border-white"
					/>
				))}
			</div>
		</NodeContextMenu>
	);
});

CarouselNode.displayName = "CarouselNode";

export default CarouselNode;
