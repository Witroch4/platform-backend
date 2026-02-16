"use client";

import { memo, useMemo, useState, DragEvent, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { MessageSquare, Settings, GripVertical, Plus, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	InteractiveMessageNodeData,
	InteractiveMessageElement,
	InteractiveMessageHeaderTextElement,
	InteractiveMessageBodyElement,
	InteractiveMessageFooterElement,
} from "@/types/flow-builder";
import { CHANNEL_CHAR_LIMITS } from "@/types/flow-builder";
import {
	getInteractiveMessageElements,
	hasConfiguredBody,
	elementsToLegacyFields,
	generateElementId,
} from "@/lib/flow-builder/interactiveMessageElements";
import { EditableText } from "../ui/EditableText";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import MinIOMediaUpload, { type MinIOMediaFile } from "../../shared/MinIOMediaUpload";
import { Button } from "@/components/ui/button";

type InteractiveMessageNodeProps = NodeProps & {
	data: InteractiveMessageNodeData & { [key: string]: unknown };
};

/**
 * InteractiveMessageNode - Estilo Typebot
 *
 * Mostra a mensagem completa com:
 * - Header (se existir)
 * - Body (texto principal)
 * - Footer (se existir)
 * - Lista de botões, cada um com handle de saída individual
 */
export const InteractiveMessageNode = memo(({ id, data, selected }: InteractiveMessageNodeProps) => {
	const { setNodes, getNodes, getEdges, setEdges } = useReactFlow();
	const [isDragOver, setIsDragOver] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState<MinIOMediaFile[]>([]);
	const [showUpload, setShowUpload] = useState(false);

	const elements = useMemo(() => getInteractiveMessageElements(data), [data]);

	// Duplicate node
	const handleDuplicate = useCallback(() => {
		const nodes = getNodes();
		const currentNode = nodes.find((n) => n.id === id);
		if (!currentNode) return;

		const newId = `${currentNode.type}-${Date.now()}`;
		const currentData = currentNode.data as unknown as InteractiveMessageNodeData;

		// Deep-clone elements com IDs novos para evitar buttonIds duplicados no flow
		const sourceElements = getInteractiveMessageElements(currentData);
		const clonedElements = sourceElements.map((el) => ({
			...el,
			id: generateElementId(el.type),
		}));

		// Regenera campos legados (buttons, header, body, footer) a partir dos elements clonados
		// para garantir que os IDs do array buttons correspondam aos IDs dos elements
		const legacyFields = elementsToLegacyFields(clonedElements);

		const newNode = {
			...currentNode,
			id: newId,
			position: {
				x: currentNode.position.x + 50,
				y: currentNode.position.y + 50,
			},
			data: {
				...currentNode.data,
				label: `${currentData.label || "Mensagem Interativa"} (cópia)`,
				elements: clonedElements,
				...legacyFields, // Sobrescreve buttons/header/body/footer com IDs novos
			},
			selected: false,
		};

		setNodes((nodes) => [...nodes, newNode]);
	}, [id, getNodes, setNodes]);

	// Delete node
	const handleDelete = useCallback(() => {
		// Remove node
		setNodes((nodes) => nodes.filter((n) => n.id !== id));

		// Remove edges connected to this node
		setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
	}, [id, setNodes, setEdges]);

	// Atualiza o conteúdo de um elemento (texto, url, etc)
	const updateElementContent = useCallback(
		(elementId: string, newContent: Partial<InteractiveMessageElement>) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as InteractiveMessageNodeData;
						const currentElements =
							currentData.elements && currentData.elements.length > 0
								? [...currentData.elements]
								: getInteractiveMessageElements(currentData);

						const elementIndex = currentElements.findIndex((el) => el.id === elementId);
						if (elementIndex !== -1) {
							const el = currentElements[elementIndex];
							// Type assertion seguro aqui pois sabemos que o tipo bate pelo ID/UI
							currentElements[elementIndex] = { ...el, ...newContent } as InteractiveMessageElement;
						}

						return {
							...node,
							data: {
								...currentData,
								elements: currentElements,
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Handle image upload complete
	const handleUploadComplete = useCallback(
		(file: MinIOMediaFile) => {
			if (file.url) {
				// Find header_image element and update its URL
				const headerImageElement = elements.find((e) => e.type === "header_image");
				if (headerImageElement) {
					updateElementContent(headerImageElement.id, { url: file.url });
				}
				setShowUpload(false);
				setUploadedFiles([]);
			}
		},
		[elements, updateElementContent],
	);

	// Remove header image
	const handleRemoveHeaderImage = useCallback(() => {
		const headerImageElement = elements.find((e) => e.type === "header_image");
		if (headerImageElement) {
			updateElementContent(headerImageElement.id, { url: "" });
		}
		setUploadedFiles([]);
	}, [elements, updateElementContent]);

	// Remove element from node
	const handleRemoveElement = useCallback(
		(elementId: string) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as InteractiveMessageNodeData;
						const currentElements =
							currentData.elements && currentData.elements.length > 0
								? [...currentData.elements]
								: getInteractiveMessageElements(currentData);

						const nextElements = currentElements.filter((el) => el.id !== elementId);
						const legacy = elementsToLegacyFields(nextElements);

						return {
							...node,
							data: {
								...currentData,
								elements: nextElements,
								...legacy,
								isConfigured: hasConfiguredBody(nextElements),
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Duplicate element within node
	const handleDuplicateElement = useCallback(
		(elementId: string) => {
			setNodes((nodes) =>
				nodes.map((node) => {
					if (node.id === id) {
						const currentData = node.data as unknown as InteractiveMessageNodeData;
						const currentElements =
							currentData.elements && currentData.elements.length > 0
								? [...currentData.elements]
								: getInteractiveMessageElements(currentData);

						const elementToDuplicate = currentElements.find((el) => el.id === elementId);
						if (!elementToDuplicate) return node;

						// Prevent duplicating header elements
						if (elementToDuplicate.type === "header_text" || elementToDuplicate.type === "header_image") {
							return node;
						}

						// Check button limit
						if (elementToDuplicate.type === "button") {
							const buttonCount = currentElements.filter((e) => e.type === "button").length;
							if (buttonCount >= 3) {
								return node;
							}
						}

						// Prevent duplicating body/footer
						if (elementToDuplicate.type === "body" || elementToDuplicate.type === "footer") {
							return node;
						}

						// Create duplicate with new ID (safeId garante prefixo flow_button_ para botões)
						const duplicatedElement: InteractiveMessageElement = {
							...elementToDuplicate,
							id: generateElementId(elementToDuplicate.type),
						};

						// Add (cópia) to title if it's a button — garante título único
						if (duplicatedElement.type === "button" && "title" in duplicatedElement && duplicatedElement.title) {
							const existingTitles = new Set(
								currentElements
									.filter(
										(e): e is typeof e & { title: string } =>
											e.type === "button" &&
											"title" in e &&
											typeof (e as unknown as { title: string }).title === "string",
									)
									.map((e) => (e as unknown as { title: string }).title),
							);
							let candidate = `${duplicatedElement.title} (cópia)`;
							let suffix = 2;
							while (existingTitles.has(candidate)) {
								candidate = `${duplicatedElement.title} (cópia ${suffix})`;
								suffix++;
							}
							duplicatedElement.title = candidate;
						}

						const elementIndex = currentElements.findIndex((el) => el.id === elementId);
						const nextElements = [
							...currentElements.slice(0, elementIndex + 1),
							duplicatedElement,
							...currentElements.slice(elementIndex + 1),
						];
						const legacy = elementsToLegacyFields(nextElements);

						return {
							...node,
							data: {
								...currentData,
								elements: nextElements,
								...legacy,
								isConfigured: hasConfiguredBody(nextElements),
							},
						};
					}
					return node;
				}),
			);
		},
		[id, setNodes],
	);

	// Atualiza o título de um botão específico
	const updateButtonTitle = useCallback(
		(btnId: string, newTitle: string) => {
			updateElementContent(btnId, { title: newTitle });
		},
		[updateElementContent],
	);

	const headerTextElement = useMemo(() => {
		return elements.find((e) => e.type === "header_text") as InteractiveMessageHeaderTextElement | undefined;
	}, [elements]);

	const headerImage = useMemo(() => {
		const el = elements.find((e) => e.type === "header_image");
		return el && "url" in el ? { url: el.url ?? "", caption: el.caption ?? "" } : null;
	}, [elements]);

	const bodyElement = useMemo(() => {
		return elements.find((e) => e.type === "body") as InteractiveMessageBodyElement | undefined;
	}, [elements]);

	const footerElement = useMemo(() => {
		return elements.find((e) => e.type === "footer") as InteractiveMessageFooterElement | undefined;
	}, [elements]);

	const buttons = useMemo(() => elements.filter((e) => e.type === "button"), [elements]);

	// Show content if there are ANY elements (even empty ones) or a linked message
	const showContent = Boolean(data.message || elements.length > 0);
	const isConfigured = data.message ? true : hasConfiguredBody(elements);

	// Fallback name
	const messageName = data.message?.name || data.label || "Mensagem Interativa";

	// Estado para gerenciar o "gap" dinâmico
	const [insertIndex, setInsertIndex] = useState<number | null>(null);

	// Helpers de Drag & Drop
	const handleDragOverContainer = (e: DragEvent) => {
		e.preventDefault();
		// Mouse sobre o próprio container (não sobre item): assume final
		if (!isDragOver) setIsDragOver(true);
		// Se não estiver setado em um item filho, assume fim
		if (insertIndex === null) setInsertIndex(elements.length);
	};

	const handleDragLeaveContainer = (e: DragEvent) => {
		if (e.currentTarget.contains(e.relatedTarget as Node)) return;
		setIsDragOver(false);
		setInsertIndex(null);
	};

	const handleDrop = (e: DragEvent) => {
		setIsDragOver(false);
		setInsertIndex(null);
		// O FlowCanvas captura o drop real
	};

	// Detecta posição relativa ao item para definir índice de inserção
	const handleItemDragOver = (e: DragEvent, index: number) => {
		e.preventDefault();
		e.stopPropagation(); // Impede o container de assumir
		setIsDragOver(true);

		const rect = e.currentTarget.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;

		// Se na metade superior, insere na posição do item (empurra ele pra baixo)
		// Se na metade inferior, insere na posição seguinte
		if (e.clientY < midY) {
			setInsertIndex(index);
		} else {
			setInsertIndex(index + 1);
		}
	};

	// Impede que duplo clique no corpo abra o painel lateral
	const stopPropagation = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	// Duplo clique SÓ no header deve propagar (para abrir drawer)
	// No resto do corpo deve ser bloqueado

	return (
		<NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
			<div
				onDragOver={handleDragOverContainer}
				onDragLeave={handleDragLeaveContainer}
				onDrop={handleDrop}
				className={cn(
					"w-[340px] rounded-xl shadow-xl transition-all bg-card overflow-hidden",
					// Borda mais espessa conforme solicitado (3px)
					"border-[3px]",
					selected
						? "ring-2 ring-primary ring-offset-2 border-primary"
						: isDragOver
							? "border-blue-500 scale-[1.02] shadow-2xl ring-2 ring-blue-200"
							: "border-border/60 hover:border-border",
				)}
			>
				{/* Handle de entrada (top) */}
				<Handle
					type="target"
					position={Position.Top}
					className="!h-3.5 !w-3.5 !bg-blue-500 !border-2 !border-white !-top-[7px]"
				/>

				{/* Header do nó - Nome da mensagem */}
				<div
					className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white cursor-pointer hover:bg-blue-600/90 transition-colors"
					onDoubleClick={(e) => {
						// EXCEÇÃO: Permite propagar no header para abrir o sidebar
						// O evento onDoubleClick do pai (stopPropagation) não captura eventos dos filhos que também têm handler?
						// Na vdd, o evento da bolha sobe. Se eu stop aqui, ele não chega no pai?
						// Não, eu quero que ele chegue no Flow que escuta onNodeDoubleClick.
						// Entao no header eu NÃO chamo stopPropagation.
						// Mas o pai tem onDoubleClick={stopPropagation}.
						// O React dispara o handler do filho e depois sobe pro pai.
						// Se o pai tem stopPropagation, ele para de subir DEPOIS do pai? Não, stopPropagation para a subida.
						// Se o handler está no PAI, ele é chamado quando o evento passa por lá.
						// Solução: Remover onDoubleClick do Container principal e colocar SÓ no corpo onde quero bloquear?
						// Ou usar e.stopPropagation() aqui? Não, quero que suba pro ReactFlow wrapper.
						// React Flow escuta no wrapper do nó.
						// Se eu der stopPropagation no container principal, o React Flow não recebe.
						// Entao:
						// 1. Container Principal: onDoubleClick = STOP (para não abrir drawer)
						// 2. Header Azul: onDoubleClick = não faz nada (deixa subir pro container, que dá stop?)
						// NÃO. Se o container dá stop, o React Flow NUNCA sabe.
						// O que eu quero:
						// Header Azul -> Sobe -> React Flow (Abre Drawer)
						// Resto -> onDoubleClick -> STOP -> React Flow não sabe
						// Então o Handler de STOP tem que estar no "Conteúdo da mensagem", não no container raiz.
					}}
				>
					<MessageSquare className="h-4 w-4 shrink-0" />
					<span className="font-semibold text-sm truncate flex-1 select-none">{messageName}</span>
					{!isConfigured && !data.message && <Settings className="h-4 w-4 shrink-0 opacity-80" />}
				</div>

				{/* Conteúdo da mensagem */}
				<div
					className={cn(
						"p-0 bg-slate-50 dark:bg-slate-950/20 min-h-[60px] transition-all",
						isDragOver ? "bg-blue-50/50 dark:bg-blue-900/10" : "",
					)}
					onDoubleClick={stopPropagation} // AQUI: Bloqueia abertura do painel ao clicar no corpo
				>
					{showContent || isDragOver ? (
						<div className="flex flex-col gap-1 p-2">
							{/* Header text (bloco) */}
							{showContent && headerTextElement && (
								<NodeContextMenu onDelete={() => handleRemoveElement(headerTextElement.id)}>
									<div className="relative group transition-all" onDragOver={(e) => handleItemDragOver(e, 0)}>
										<div
											className={cn(
												"rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm transition-all duration-300",
												insertIndex === 0 && "translate-y-2", // Pequeno movimento para indicar inserção
											)}
										>
											<div className="flex items-start gap-2">
												<div className="flex-1 min-w-0">
													<EditableText
														value={headerTextElement.text}
														onChange={(val) => updateElementContent(headerTextElement.id, { text: val })}
														label="Cabeçalho Texto"
														placeholder="Cabeçalho (vazio)"
														className="text-xs font-bold text-foreground/90 uppercase tracking-wide"
														minRows={1}
														maxLength={CHANNEL_CHAR_LIMITS.whatsapp.headerText}
													/>
												</div>
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleRemoveElement(headerTextElement.id);
													}}
													className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
													title="Remover cabeçalho"
												>
													<X className="h-3 w-3" />
												</button>
											</div>
										</div>
										{/* Drop Zone Animada (Before Header) */}
										<div
											className={cn(
												"absolute -top-1 left-0 w-full transition-all duration-300 ease-in-out overflow-hidden pointer-events-none",
												insertIndex === 0 && isDragOver ? "h-12 opacity-100 -translate-y-full pb-1" : "h-0 opacity-0",
											)}
										>
											<div className="h-full w-full border-2 border-dashed border-blue-400 bg-blue-100/30 rounded-md flex items-center justify-center animate-pulse">
												<span className="text-xs font-medium text-blue-600">Solte aqui</span>
											</div>
										</div>
									</div>
								</NodeContextMenu>
							)}

							{/* Header image (bloco) */}
							{elements.some((e) => e.type === "header_image") && (
								<NodeContextMenu
									onDelete={() => {
										const headerImgEl = elements.find((e) => e.type === "header_image");
										if (headerImgEl) handleRemoveElement(headerImgEl.id);
									}}
								>
									<div className="relative group rounded-md border bg-white dark:bg-card overflow-hidden shadow-sm">
										{/* Delete button for header_image element */}
										<button
											onClick={(e) => {
												e.stopPropagation();
												const headerImgEl = elements.find((e) => e.type === "header_image");
												if (headerImgEl) handleRemoveElement(headerImgEl.id);
											}}
											className="absolute top-2 left-2 z-10 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
											title="Remover header de imagem"
										>
											<X className="h-3 w-3" />
										</button>
										{headerImage?.url ? (
											<>
												<div
													className="h-24 w-full bg-cover bg-center relative"
													style={{ backgroundImage: `url(${headerImage.url})` }}
												>
													{!headerImage.url.startsWith("http") && (
														<div className="w-full h-full flex items-center justify-center bg-muted">
															<span className="text-xs text-muted-foreground">URL Inválida</span>
														</div>
													)}
													{/* Remove button */}
													<button
														onClick={handleRemoveHeaderImage}
														className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
													>
														<X className="h-3 w-3" />
													</button>
												</div>
												{!!headerImage?.caption && (
													<div className="px-2 py-1 bg-muted/20 border-t">
														<p className="text-xs text-muted-foreground truncate">{headerImage.caption}</p>
													</div>
												)}
											</>
										) : (
											<div
												className="nodrag"
												onDragOver={(e) => {
													e.stopPropagation();
												}}
												onDragEnter={(e) => {
													e.stopPropagation();
												}}
												onDragLeave={(e) => {
													e.stopPropagation();
												}}
												onDrop={(e) => {
													e.stopPropagation();
												}}
											>
												{showUpload ? (
													<div className="p-2" onClick={(e) => e.stopPropagation()}>
														<MinIOMediaUpload
															uploadedFiles={uploadedFiles}
															setUploadedFiles={setUploadedFiles}
															allowedTypes={["image/jpeg", "image/png", "image/jpg"]}
															maxSizeMB={5}
															title="Upload de Imagem"
															description="Arraste uma imagem aqui"
															maxFiles={1}
															onUploadComplete={handleUploadComplete}
														/>
														<Button
															variant="ghost"
															size="sm"
															onClick={(e) => {
																e.stopPropagation();
																setShowUpload(false);
																setUploadedFiles([]);
															}}
															className="w-full mt-2 text-xs"
														>
															Cancelar
														</Button>
													</div>
												) : (
													<button
														onClick={(e) => {
															e.stopPropagation();
															setShowUpload(true);
														}}
														className="h-16 w-full flex flex-col items-center justify-center bg-muted/30 border-dashed border border-muted-foreground/20 hover:bg-muted/50 transition-colors"
													>
														<Upload className="h-4 w-4 text-muted-foreground mb-1" />
														<span className="text-xs text-muted-foreground">Clique para fazer upload</span>
													</button>
												)}
											</div>
										)}
									</div>
								</NodeContextMenu>
							)}

							{/* Body - texto principal */}
							{bodyElement && (
								<NodeContextMenu onDelete={() => handleRemoveElement(bodyElement.id)}>
									<div className="relative group rounded-md border bg-white dark:bg-card px-3 py-3 shadow-sm min-h-[40px]">
										<div className="flex items-start gap-2">
											<div className="flex-1 min-w-0">
												<EditableText
													value={bodyElement.text}
													onChange={(val) => updateElementContent(bodyElement.id, { text: val })}
													label="Corpo da mensagem"
													placeholder="Digite a mensagem..."
													className="text-sm"
													minRows={2}
													maxLength={CHANNEL_CHAR_LIMITS.whatsapp.body}
												/>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleRemoveElement(bodyElement.id);
												}}
												className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
												title="Remover corpo"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									</div>
								</NodeContextMenu>
							)}

							{/* Footer (se existir) */}
							{footerElement && (
								<NodeContextMenu onDelete={() => handleRemoveElement(footerElement.id)}>
									<div className="relative group rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm">
										<div className="flex items-start gap-2">
											<div className="flex-1 min-w-0">
												<EditableText
													value={footerElement.text}
													onChange={(val) => updateElementContent(footerElement.id, { text: val })}
													label="Rodapé"
													placeholder="Rodapé (opcional)"
													className="text-xs text-muted-foreground italic"
													minRows={1}
													maxLength={CHANNEL_CHAR_LIMITS.whatsapp.footer}
												/>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleRemoveElement(footerElement.id);
												}}
												className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
												title="Remover rodapé"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									</div>
								</NodeContextMenu>
							)}

							{/* Botões */}
							{buttons.length > 0 && (
								<div className="mt-1 flex flex-col gap-1.5 transition-all">
									{buttons.map((btn, idx) => {
										const btnGlobalIndex = elements.findIndex((e) => e.id === btn.id);
										const isTargetBefore = insertIndex === btnGlobalIndex && isDragOver;

										return (
											<NodeContextMenu
												key={btn.id}
												onDuplicate={() => handleDuplicateElement(btn.id)}
												onDelete={() => handleRemoveElement(btn.id)}
											>
												<div
													className="relative group transition-all duration-300"
													onDragOver={(e) => handleItemDragOver(e, btnGlobalIndex)}
												>
													{/* Drop Zone Animada (Before Button) */}
													<div
														className={cn(
															"w-full transition-all duration-300 ease-in-out overflow-hidden pointer-events-none",
															isTargetBefore ? "h-12 opacity-100 mb-2" : "h-0 opacity-0",
														)}
													>
														<div className="h-full w-full border-2 border-dashed border-blue-400 bg-blue-100/30 rounded-md flex items-center justify-center animate-pulse">
															<span className="text-xs font-medium text-blue-600">Solte aqui</span>
														</div>
													</div>

													<div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm transition-colors hover:border-blue-300 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent">
														<div className="flex items-center">
															<div className="flex items-center justify-center text-center flex-1">
																<input
																	type="text"
																	className={cn(
																		"nodrag w-full bg-transparent border-none p-0 text-sm font-semibold focus:outline-none focus:ring-0 text-center placeholder:text-blue-300",
																		("title" in btn ? btn.title.length : 0) > CHANNEL_CHAR_LIMITS.whatsapp.buttonTitle
																			? "text-red-500 dark:text-red-400"
																			: "text-blue-600 dark:text-blue-400",
																	)}
																	value={"title" in btn ? btn.title : ""}
																	onChange={(e) => updateButtonTitle(btn.id, e.target.value)}
																	placeholder="Nome do botão"
																	autoFocus={"title" in btn && btn.title === "Novo botão"}
																	onKeyDown={(e) => {
																		e.stopPropagation(); // Impede delete do node ao teclar backspace/delete
																		if (e.key === "Enter") e.currentTarget.blur();
																	}}
																	onClick={(e) => {
																		e.stopPropagation();
																		e.currentTarget.focus();
																	}}
																/>
															</div>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	handleRemoveElement(btn.id);
																}}
																className="ml-2 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
																title="Remover botão"
															>
																<X className="h-3 w-3" />
															</button>
														</div>
														{/* Alerta de título duplicado */}
														{(() => {
															const btnTitle = "title" in btn ? btn.title : "";
															const isDuplicate =
																btnTitle.trim() !== "" &&
																buttons.filter((b) => {
																	const t = "title" in b ? b.title : "";
																	return t.trim() === btnTitle.trim();
																}).length > 1;
															return isDuplicate ? (
																<p className="text-[10px] text-red-500 font-medium text-center mt-0.5">
																	Título duplicado — WhatsApp rejeita
																</p>
															) : null;
														})()}
														{/* Contador de caracteres do botão */}
														{(() => {
															const btnTitle = "title" in btn ? btn.title : "";
															const btnLength = btnTitle.length;
															const btnLimit = CHANNEL_CHAR_LIMITS.whatsapp.buttonTitle;
															const isOver = btnLength > btnLimit;
															const isNear = btnLength >= btnLimit * 0.9;
															return (
																<div className="flex items-center gap-1 mt-1">
																	<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
																		<div
																			className={cn(
																				"h-full transition-all duration-200 rounded-full",
																				isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-blue-400",
																			)}
																			style={{ width: `${Math.min((btnLength / btnLimit) * 100, 100)}%` }}
																		/>
																	</div>
																	<span
																		className={cn(
																			"text-[10px] tabular-nums",
																			isOver
																				? "text-red-500 font-bold"
																				: isNear
																					? "text-amber-500"
																					: "text-muted-foreground/60",
																		)}
																	>
																		{btnLength}/{btnLimit}
																	</span>
																</div>
															);
														})()}
														{"description" in btn && btn.description && (
															<p className="text-[10px] text-muted-foreground text-center mt-1 truncate">
																{btn.description}
															</p>
														)}
													</div>

													{/* Handle de saída por botão */}
													<Handle
														type="source"
														position={Position.Right}
														id={btn.id}
														className="!h-3.5 !w-3.5 !bg-blue-500 !border-2 !border-white hover:!bg-blue-600 !transition-colors !-right-[7px]"
														style={{
															top: "50%",
															right: "-7px",
															transform: "translateY(-50%)",
														}}
													/>
												</div>
											</NodeContextMenu>
										);
									})}
								</div>
							)}

							{/* Drop Zone Animada (Final / Append) - Único ponto de entrada final */}
							<div
								className={cn(
									"w-full transition-all duration-300 ease-in-out overflow-hidden pointer-events-none",
									(insertIndex === null || insertIndex >= elements.length) && isDragOver
										? "h-12 opacity-100 mt-1"
										: "h-0 opacity-0",
								)}
							>
								<div className="h-full w-full border-2 border-dashed border-blue-400 bg-blue-100/30 rounded-md flex items-center justify-center animate-pulse">
									<span className="text-xs font-medium text-blue-600">Solte aqui</span>
								</div>
							</div>
						</div>
					) : (
						/* Estado não configurado */
						<div className="p-6 text-center border-2 border-dashed border-border/40 m-2 rounded-lg pointer-events-none">
							<div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 mx-auto mb-2 flex items-center justify-center">
								<Plus className="h-5 w-5 text-blue-500" />
							</div>
							<p className="text-xs text-muted-foreground/70">Arraste blocos aqui</p>
						</div>
					)}
				</div>

				{/* Handle de saída padrão (bottom) - só se não tiver botões (para manter fluxo sem botões) */}
				{buttons.length === 0 && (
					<Handle
						type="source"
						position={Position.Bottom}
						className="!h-3.5 !w-3.5 !bg-blue-500 !border-2 !border-white !-bottom-[7px]"
					/>
				)}
			</div>
		</NodeContextMenu>
	);
});

InteractiveMessageNode.displayName = "InteractiveMessageNode";

export default InteractiveMessageNode;
