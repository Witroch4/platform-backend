import { useCallback, useState, useMemo, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Node, Viewport } from "@xyflow/react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { useFlowCanvas } from "./useFlowCanvas";
import { useHandlePopover } from "../panels/HandlePopover";
import { useMtfData } from "@/app/admin/mtf-diamante/context/SwrProvider";
import {
	FlowNodeType,
	type FlowNodeData,
	type InteractiveMessageElementType,
	type InteractiveMessageNodeData,
	type TemplateElementType,
} from "@/types/flow-builder";
import {
	createInteractiveMessageElement,
	elementsToLegacyFields,
	getInteractiveMessageElements,
} from "@/lib/flow-builder/interactiveMessageElements";
import {
	validateCanvasForSave,
	calculateAutoLayout,
	validateInteractiveMessageElementDrop,
	validateTemplateElementDrop,
	handleWhatsAppTemplateElementDrop,
	handleButtonTemplateQuickReplyDrop,
	handleCouponOrWhatsAppQuickReplyDrop,
	handleUrlButtonDrop,
	handlePhoneButtonDrop,
	handleVoiceCallButtonDrop,
	handleCopyCodeButtonDrop,
	formatMessagesForDialog,
	type ImportStatus,
	type FormattedMessage,
	type ExtendedReaction,
} from "../services/FlowBuilderTabService";

// =============================================================================
// Types
// =============================================================================

export interface UseFlowBuilderTabReturn {
	// Flow selection state
	selectedFlowId: string | null;
	isEditing: boolean;
	setSelectedFlowId: (id: string | null) => void;
	setIsEditing: (editing: boolean) => void;

	// Flow canvas data
	nodes: Node[];
	edges: ReturnType<typeof useFlowCanvas>["edges"];
	onNodesChange: ReturnType<typeof useFlowCanvas>["onNodesChange"];
	onEdgesChange: ReturnType<typeof useFlowCanvas>["onEdgesChange"];
	onConnect: ReturnType<typeof useFlowCanvas>["onConnect"];
	setNodes: ReturnType<typeof useFlowCanvas>["setNodes"];

	// Flow canvas meta
	canvasVersion: number;
	currentFlowMeta: ReturnType<typeof useFlowCanvas>["currentFlowMeta"];
	isLoading: boolean;
	isSaving: boolean;
	isAutoSaving: boolean;
	lastAutoSaveTime: ReturnType<typeof useFlowCanvas>["lastAutoSaveTime"];
	error: ReturnType<typeof useFlowCanvas>["error"];

	// Export/Import
	exportFlowAsJson: ReturnType<typeof useFlowCanvas>["exportFlowAsJson"];
	importFlowFromJson: ReturnType<typeof useFlowCanvas>["importFlowFromJson"];
	getCanvasAsN8nFormat: ReturnType<typeof useFlowCanvas>["getCanvasAsN8nFormat"];

	// Dialog state
	selectedNodeId: string | null;
	selectedNode: Node | null;
	dialogOpen: boolean;
	templateDialogOpen: boolean;
	showResetDialog: boolean;
	showImportDialog: boolean;
	isImporting: boolean;
	setDialogOpen: (open: boolean) => void;
	setTemplateDialogOpen: (open: boolean) => void;
	setShowResetDialog: (open: boolean) => void;
	setShowImportDialog: (open: boolean) => void;

	// Import status
	canImport: boolean;
	importStats: { messages: number; reactions: number } | undefined;

	// Popover state
	popoverState: ReturnType<typeof useHandlePopover>["popoverState"];
	closePopover: ReturnType<typeof useHandlePopover>["closePopover"];
	pendingConnectionRef: React.MutableRefObject<{
		sourceNodeId: string;
		sourceHandleId: string;
		flowPosition: { x: number; y: number };
	} | null>;

	// Data
	channelType: string;
	messagesForDialog: FormattedMessage[];

	// Handlers
	handleSelectFlow: (flowId: string | null) => void;
	handleCreateNew: () => void;
	handleBackToList: () => void;
	handleDrop: (type: FlowNodeType, position: { x: number; y: number }) => void;
	handleDropElement: (
		elementType: InteractiveMessageElementType,
		position: { x: number; y: number },
		targetNodeId: string | null,
	) => void;
	handleDropTemplateElement: (elementType: TemplateElementType, targetNodeId: string) => void;
	handleNodeDoubleClick: (nodeId: string) => void;
	handleNodeSelect: (nodeId: string | null) => void;
	handleUpdateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
	handleLinkMessageWithReactions: (
		nodeId: string,
		messageId: string,
		buttons: Array<{ id: string; title: string }>,
	) => void;
	handleCloseDialog: (open: boolean) => void;
	handleConnectEnd: (
		sourceNodeId: string,
		sourceHandleId: string,
		screenX: number,
		screenY: number,
		flowPosition: { x: number; y: number },
	) => void;
	handlePopoverSelect: (type: FlowNodeType) => void;
	handleSave: () => Promise<void>;
	handleAutoLayout: () => void;
	handleReset: () => void;
	handleImport: () => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useFlowBuilderTab(caixaId: string): UseFlowBuilderTabReturn {
	// Estado do flow selecionado
	const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
	const [isEditing, setIsEditing] = useState(false);

	// SWR global mutate — para invalidar a lista de flows após salvar
	const { mutate: globalMutate } = useSWRConfig();

	const {
		nodes,
		edges,
		onNodesChange,
		onEdgesChange,
		onConnect,
		addNode,
		updateNodeData,
		deleteNode,
		saveFlow,
		resetCanvas,
		loadCanvas,
		isLoading,
		isSaving,
		isAutoSaving,
		lastAutoSaveTime,
		error,
		canvasVersion,
		currentFlowMeta,
		setNodes,
		exportFlowAsJson,
		importFlowFromJson,
		getCanvasAsN8nFormat,
		updateFlowName,
	} = useFlowCanvas(caixaId, { flowId: selectedFlowId, autoSave: true });

	const { interactiveMessages, caixas, buttonReactions } = useMtfData();

	// Obtém o channelType da caixa atual
	const channelType = useMemo(() => {
		const currentCaixa = caixas?.find((c) => c.id === caixaId);
		return currentCaixa?.channelType ?? "Channel::WhatsApp";
	}, [caixas, caixaId]);

	const reactFlowInstance = useReactFlow();

	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
	const [showResetDialog, setShowResetDialog] = useState(false);
	const [showImportDialog, setShowImportDialog] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	// Check if there are reactions to import (only when canvas is empty)
	const { data: importStatus, mutate: mutateImportStatus } = useSWR<ImportStatus>(
		canvasVersion === 0 && !selectedFlowId
			? `/api/admin/mtf-diamante/flow-canvas/import?inboxId=${caixaId}`
			: null,
		async (url: string) => {
			const res = await fetch(url);
			return res.json();
		},
		{ revalidateOnFocus: false },
	);

	const canImport = importStatus?.data?.canImport ?? false;
	const importStats = importStatus?.data?.stats;

	// Handle popover state (appears when dragging from handle to empty canvas)
	const { popoverState, openPopover, closePopover } = useHandlePopover();
	const pendingConnectionRef = useRef<{
		sourceNodeId: string;
		sourceHandleId: string;
		flowPosition: { x: number; y: number };
	} | null>(null);

	// Selected node
	const selectedNode = useMemo(
		() => (selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null),
		[selectedNodeId, nodes],
	);

	// Formatted messages for the detail dialog
	const messagesForDialog = useMemo(
		() => formatMessagesForDialog(interactiveMessages),
		[interactiveMessages],
	);

	// ---------------------------------------------------------------------------
	// Flow Selection Handlers
	// ---------------------------------------------------------------------------

	const handleSelectFlow = useCallback((flowId: string | null) => {
		setSelectedFlowId(flowId);
		if (flowId) {
			setIsEditing(true);
		}
	}, []);

	const handleCreateNew = useCallback(() => {
		setIsEditing(true);
	}, []);

	const handleBackToList = useCallback(() => {
		setIsEditing(false);
		setSelectedFlowId(null);
		setSelectedNodeId(null);
		setDialogOpen(false);

		// Revalidar a lista de flows quando volta — garante SWR sincronizado
		globalMutate((key) => {
			if (typeof key === 'string' && key.includes('/api/admin/mtf-diamante/flows')) {
				return true; // Revalidar chaves de flows
			}
			return false;
		});
	}, [globalMutate]);

	// ---------------------------------------------------------------------------
	// Node Handlers
	// ---------------------------------------------------------------------------

	const handleDrop = useCallback(
		(type: FlowNodeType, position: { x: number; y: number }) => {
			addNode(type, position);
		},
		[addNode],
	);

	const handleDropElement = useCallback(
		(
			elementType: InteractiveMessageElementType,
			_position: { x: number; y: number },
			targetNodeId: string | null,
		) => {
			if (!targetNodeId) {
				toast.error("Solte o bloco dentro da mensagem", {
					description: "Arraste o elemento e solte em cima de um nó de Mensagem ou Template.",
				});
				return;
			}

			const targetNode = nodes.find((n) => n.id === targetNodeId) ?? null;
			if (!targetNode) {
				toast.error("Nó não encontrado");
				return;
			}

			const validNodeTypes = [
				FlowNodeType.INTERACTIVE_MESSAGE,
				FlowNodeType.WHATSAPP_TEMPLATE,
				FlowNodeType.BUTTON_TEMPLATE,
				FlowNodeType.COUPON_TEMPLATE,
				FlowNodeType.CALL_TEMPLATE,
				FlowNodeType.URL_TEMPLATE,
			];

			if (!validNodeTypes.includes(targetNode.type as FlowNodeType)) {
				toast.error("Destino inválido", {
					description: "Os elementos só podem ser soltos dentro de uma Mensagem Interativa ou Template.",
				});
				return;
			}

			// Para Mensagem Interativa
			if (targetNode.type === FlowNodeType.INTERACTIVE_MESSAGE) {
				const targetData = targetNode.data as unknown as InteractiveMessageNodeData;
				const result = validateInteractiveMessageElementDrop(targetData, elementType);
				if (!result.success) {
					toast.error(result.error!.title, { description: result.error!.description });
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				return;
			}

			// Para Templates
			const result = validateTemplateElementDrop(targetNode, elementType);
			if (!result.success) {
				toast.error(result.error!.title, { description: result.error!.description });
				return;
			}
			updateNodeData(targetNodeId, result.newData!);
		},
		[nodes, updateNodeData],
	);

	const handleDropTemplateElement = useCallback(
		(elementType: TemplateElementType, targetNodeId: string) => {
			const targetNode = nodes.find((n) => n.id === targetNodeId) ?? null;
			if (!targetNode) {
				toast.error("Nó não encontrado");
				return;
			}

			const validTemplateTypes = [
				FlowNodeType.WHATSAPP_TEMPLATE,
				FlowNodeType.BUTTON_TEMPLATE,
				FlowNodeType.COUPON_TEMPLATE,
				FlowNodeType.CALL_TEMPLATE,
				FlowNodeType.URL_TEMPLATE,
			];
			if (!validTemplateTypes.includes(targetNode.type as FlowNodeType)) {
				toast.error("Destino inválido", {
					description: "Os elementos de template só podem ser soltos dentro de um container de Template.",
				});
				return;
			}

			const nodeType = targetNode.type as FlowNodeType;

			// WHATSAPP_TEMPLATE shared elements
			if (nodeType === FlowNodeType.WHATSAPP_TEMPLATE) {
				const result = handleWhatsAppTemplateElementDrop(targetNode, elementType);
				if (!result.success) {
					if (result.error?.description) {
						toast.info(result.error.title, { description: result.error.description });
					}
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				const successMessages: Record<string, string> = {
					body: "Body adicionado",
					header_text: "Header texto adicionado",
					header_image: "Header imagem adicionado",
					footer: "Footer adicionado",
					button: "Botão adicionado",
				};
				toast.success(successMessages[elementType] || "Elemento adicionado");
				return;
			}

			// Legacy templates handling
			if (elementType === "body") {
				const currentData = targetNode.data as Record<string, unknown>;
				if (currentData.body && (currentData.body as { text?: string }).text) {
					toast.info("Body já existe", {
						description: "Clique duas vezes no nó para editar o texto.",
					});
					return;
				}
				updateNodeData(targetNodeId, {
					body: { text: "", variables: [] },
				} as Partial<FlowNodeData>);
				toast.success("Body adicionado", {
					description: "Clique duas vezes no nó para editar o texto.",
				});
				return;
			}

			if (elementType === "button_quick_reply") {
				const validTypes: FlowNodeType[] = [
					FlowNodeType.WHATSAPP_TEMPLATE,
					FlowNodeType.BUTTON_TEMPLATE,
					FlowNodeType.COUPON_TEMPLATE,
				];
				if (!validTypes.includes(nodeType)) {
					toast.error("Elemento incompatível", {
						description:
							"Botões QUICK_REPLY podem ser adicionados ao Template WhatsApp, Button Template ou Coupon Template.",
					});
					return;
				}

				const nodeTypeChecked = nodeType as FlowNodeType;
				if (
					nodeTypeChecked === FlowNodeType.WHATSAPP_TEMPLATE ||
					nodeTypeChecked === FlowNodeType.COUPON_TEMPLATE
				) {
					const result = handleCouponOrWhatsAppQuickReplyDrop(targetNode, nodeTypeChecked);
					if (!result.success) {
						toast.error(result.error!.title, { description: result.error!.description });
						return;
					}
					updateNodeData(targetNodeId, result.newData!);
					toast.success("Botão adicionado");
					return;
				}

				const result = handleButtonTemplateQuickReplyDrop(targetNode);
				if (!result.success) {
					toast.error(result.error!.title, { description: result.error!.description });
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				toast.success("Botão adicionado");
				return;
			}

			if (elementType === "button_url") {
				const validTypes = [FlowNodeType.WHATSAPP_TEMPLATE, FlowNodeType.URL_TEMPLATE, FlowNodeType.COUPON_TEMPLATE];
				if (!validTypes.includes(nodeType)) {
					toast.error("Elemento incompatível", {
						description: "Botões URL só podem ser adicionados ao Template WhatsApp, URL Template ou Coupon Template.",
					});
					return;
				}
				const result = handleUrlButtonDrop(targetNode, nodeType);
				if (!result.success) {
					toast.error(result.error!.title, { description: result.error!.description });
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				toast.success("Botão URL adicionado");
				return;
			}

			if (elementType === "button_phone") {
				const validTypes = [FlowNodeType.WHATSAPP_TEMPLATE, FlowNodeType.CALL_TEMPLATE, FlowNodeType.COUPON_TEMPLATE];
				if (!validTypes.includes(nodeType)) {
					toast.error("Elemento incompatível", {
						description:
							"Botão de ligação só pode ser adicionado ao Template WhatsApp, Call Template ou Coupon Template.",
					});
					return;
				}
				const result = handlePhoneButtonDrop(targetNode, nodeType);
				if (!result.success) {
					if (result.error?.description) {
						toast.info(result.error.title, { description: result.error.description });
					} else {
						toast.error(result.error!.title);
					}
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				toast.success("Botão de ligação adicionado");
				return;
			}

			if (elementType === "button_voice_call") {
				if ((nodeType as FlowNodeType) !== FlowNodeType.WHATSAPP_TEMPLATE) {
					toast.error("Elemento incompatível", {
						description: "Botão Ligar WhatsApp só pode ser adicionado ao Template WhatsApp.",
					});
					return;
				}
				const result = handleVoiceCallButtonDrop(targetNode);
				if (!result.success) {
					toast.error(result.error!.title, { description: result.error!.description });
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				toast.success("Botão Ligar WhatsApp adicionado");
				return;
			}

			if (elementType === "button_copy_code") {
				const validTypes: FlowNodeType[] = [FlowNodeType.WHATSAPP_TEMPLATE, FlowNodeType.COUPON_TEMPLATE];
				if (!validTypes.includes(nodeType)) {
					toast.error("Elemento incompatível", {
						description: "Botão de copiar só pode ser adicionado ao Template WhatsApp ou Coupon Template.",
					});
					return;
				}
				const nodeTypeChecked = nodeType as FlowNodeType;
				const result = handleCopyCodeButtonDrop(targetNode, nodeTypeChecked);
				if (!result.success) {
					if (result.error?.description) {
						toast.info(result.error.title, { description: result.error.description });
					} else {
						toast.error(result.error!.title);
					}
					return;
				}
				updateNodeData(targetNodeId, result.newData!);
				toast.success(
					nodeTypeChecked === FlowNodeType.WHATSAPP_TEMPLATE
						? "Botão Copiar Código adicionado"
						: "Botão de copiar adicionado",
				);
				return;
			}
		},
		[nodes, updateNodeData],
	);

	const handleNodeDoubleClick = useCallback(
		(nodeId: string) => {
			const node = nodes.find((n) => n.id === nodeId);
			if (!node) return;

			const inlineOnlyNodes = [FlowNodeType.DELAY, FlowNodeType.QUICK_REPLIES, FlowNodeType.CAROUSEL];
			if (inlineOnlyNodes.includes(node.type as FlowNodeType)) return;

			const templateNodeTypes = [
				FlowNodeType.TEMPLATE,
				FlowNodeType.WHATSAPP_TEMPLATE,
				FlowNodeType.BUTTON_TEMPLATE,
				FlowNodeType.URL_TEMPLATE,
				FlowNodeType.CALL_TEMPLATE,
				FlowNodeType.COUPON_TEMPLATE,
			];
			if (templateNodeTypes.includes(node.type as FlowNodeType)) {
				setSelectedNodeId(nodeId);
				setTemplateDialogOpen(true);
				return;
			}

			setSelectedNodeId(nodeId);
			setDialogOpen(true);
		},
		[nodes],
	);

	const handleNodeSelect = useCallback((nodeId: string | null) => {
		setSelectedNodeId(nodeId);
	}, []);

	const handleUpdateNodeData = useCallback(
		(nodeId: string, data: Partial<FlowNodeData>) => {
			updateNodeData(nodeId, data);

			// Sincronizar label do nó START com o nome do flow
			if (data.label !== undefined) {
				const node = nodes.find((n) => n.id === nodeId);
				if (node?.type === FlowNodeType.START) {
					toast.promise(updateFlowName(data.label as string), {
						loading: "Renomeando flow...",
						success: "Flow renomeado",
						error: (err: Error) => err.message || "Erro ao renomear flow",
					});
				}
			}
		},
		[updateNodeData, updateFlowName, nodes],
	);

	const handleLinkMessageWithReactions = useCallback(
		(nodeId: string, _messageId: string, buttons: Array<{ id: string; title: string }>) => {
			const buttonIds = new Set(buttons.map((b) => b.id));
			const allReactions = (buttonReactions ?? []) as ExtendedReaction[];
			const messageReactions = allReactions.filter((r) => r.buttonId && buttonIds.has(r.buttonId));

			if (messageReactions.length === 0) {
				console.log("🔍 [handleLinkMessageWithReactions] Nenhuma reação encontrada", {
					buttonIds: Array.from(buttonIds),
					availableReactions: allReactions.map((r) => r.buttonId),
				});
				return;
			}

			const currentNode = nodes.find((n) => n.id === nodeId);
			if (!currentNode) return;

			const baseX = currentNode.position.x + 400;
			let offsetY = currentNode.position.y - 50;

			const createAndConnectNode = (
				nodeType: FlowNodeType,
				nodeData: Partial<FlowNodeData>,
				buttonId: string,
			) => {
				const newNodeId = addNode(nodeType, { x: baseX, y: offsetY });

				if (newNodeId && Object.keys(nodeData).length > 0) {
					updateNodeData(newNodeId, nodeData);
				}

				if (newNodeId) {
					onConnect({
						source: nodeId,
						target: newNodeId,
						sourceHandle: buttonId,
						targetHandle: null,
					});
				}

				offsetY += 180;
				return newNodeId;
			};

			for (const button of buttons) {
				const buttonReactionsForBtn = messageReactions.filter((r) => r.buttonId === button.id);
				if (buttonReactionsForBtn.length === 0) continue;

				for (const reaction of buttonReactionsForBtn) {
					// Checar handoff action (pode ser "handoff" ou "HANDOFF_ACTION")
					const isHandoff = reaction.action === "handoff" || reaction.action === "HANDOFF_ACTION";
					if (isHandoff) {
						createAndConnectNode(
							FlowNodeType.HANDOFF,
							{ label: "Transferir para atendente", isConfigured: true },
							button.id,
						);
					}

					const linkedMsgId = reaction.linkedMessageId || reaction.actionPayload?.messageId;
					if (linkedMsgId) {
						const linkedMsg = interactiveMessages?.find((m) => m.id === linkedMsgId);
						if (linkedMsg) {
							const content = (linkedMsg as unknown as Record<string, unknown>).content as
								| Record<string, unknown>
								| undefined;
							createAndConnectNode(
								FlowNodeType.INTERACTIVE_MESSAGE,
								{
									label: linkedMsg.name ?? "Mensagem",
									messageId: linkedMsg.id,
									message: {
										id: linkedMsg.id ?? "",
										name: linkedMsg.name ?? "",
										body: content?.body ?? linkedMsg.body,
										header: content?.header ?? linkedMsg.header,
										footer: content?.footer ?? linkedMsg.footer,
										action: content?.action ?? linkedMsg.action,
									} as InteractiveMessageNodeData["message"],
									isConfigured: true,
								},
								button.id,
							);
						}
					}

					const textContent = reaction.textReaction || reaction.textResponse;
					if (textContent) {
						createAndConnectNode(
							FlowNodeType.TEXT_MESSAGE,
							{ label: button.title, text: textContent, isConfigured: true },
							button.id,
						);
					}

					if (reaction.emoji) {
						createAndConnectNode(
							FlowNodeType.EMOJI_REACTION,
							{ label: button.title, emoji: reaction.emoji, isConfigured: true },
							button.id,
						);
					}
				}
			}

			toast.success(`${messageReactions.length} reação(ões) importada(s) automaticamente`);
		},
		[nodes, buttonReactions, addNode, updateNodeData, onConnect, interactiveMessages],
	);

	const handleCloseDialog = useCallback((open: boolean) => {
		setDialogOpen(open);
		if (!open) setSelectedNodeId(null);
	}, []);

	// ---------------------------------------------------------------------------
	// Connection Handlers
	// ---------------------------------------------------------------------------

	const handleConnectEnd = useCallback(
		(
			sourceNodeId: string,
			sourceHandleId: string,
			screenX: number,
			screenY: number,
			flowPosition: { x: number; y: number },
		) => {
			pendingConnectionRef.current = { sourceNodeId, sourceHandleId, flowPosition };
			openPopover(sourceNodeId, sourceHandleId, screenX, screenY);
		},
		[openPopover],
	);

	const handlePopoverSelect = useCallback(
		(type: FlowNodeType) => {
			const pending = pendingConnectionRef.current;
			if (!pending) return;

			const newNodeId = addNode(type, {
				x: pending.flowPosition.x - 140,
				y: pending.flowPosition.y + 20,
			});

			if (newNodeId) {
				onConnect({
					source: pending.sourceNodeId,
					target: newNodeId,
					sourceHandle: pending.sourceHandleId,
					targetHandle: null,
				});
			}

			pendingConnectionRef.current = null;
			closePopover();
		},
		[addNode, onConnect, closePopover],
	);

	// ---------------------------------------------------------------------------
	// Save / Layout / Reset / Import
	// ---------------------------------------------------------------------------

	const handleSave = useCallback(async () => {
		const viewport = reactFlowInstance.getViewport();
		const validation = validateCanvasForSave(nodes, edges, viewport);

		if (!validation.valid) {
			toast.error("Não foi possível salvar", {
				description: validation.errors.join("\n"),
			});
			return;
		}

		if (validation.warnings && validation.warnings.length > 0) {
			toast.warning("Atenção", {
				description: validation.warnings.join("\n"),
			});
		}

		const promise = saveFlow(viewport).then((result) => {
			globalMutate(
				(key) => typeof key === "string" && key.startsWith("/api/admin/mtf-diamante/flows?"),
				undefined,
				{ revalidate: true },
			);
			return result;
		});
		toast.promise(promise, {
			loading: "Salvando fluxo…",
			success: "Fluxo salvo com sucesso!",
			error: (err) => err?.message ?? "Erro ao salvar fluxo",
		});
	}, [nodes, edges, saveFlow, reactFlowInstance, globalMutate]);

	const handleAutoLayout = useCallback(() => {
		const positions = calculateAutoLayout(nodes, edges);

		setNodes((nds) =>
			nds.map((node) => {
				const pos = positions.get(node.id);
				if (!pos) return node;
				return { ...node, position: pos };
			}),
		);

		setTimeout(() => reactFlowInstance.fitView({ padding: 0.3 }), 50);
		toast.success("Layout organizado automaticamente");
	}, [nodes, edges, setNodes, reactFlowInstance]);

	const handleReset = useCallback(() => {
		resetCanvas();
		setSelectedNodeId(null);
		setDialogOpen(false);
		setShowResetDialog(false);
		toast.success("Canvas reiniciado");
	}, [resetCanvas]);

	const handleImport = useCallback(async () => {
		setIsImporting(true);
		try {
			const res = await fetch("/api/admin/mtf-diamante/flow-canvas/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ inboxId: caixaId }),
			});
			const result = await res.json();

			if (!result.success) {
				throw new Error(result.error || "Erro ao importar");
			}

			window.location.reload();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao importar reações");
		} finally {
			setIsImporting(false);
			setShowImportDialog(false);
		}
	}, [caixaId]);

	return {
		// Flow selection state
		selectedFlowId,
		isEditing,
		setSelectedFlowId,
		setIsEditing,

		// Flow canvas data
		nodes,
		edges,
		onNodesChange,
		onEdgesChange,
		onConnect,
		setNodes,

		// Flow canvas meta
		canvasVersion,
		currentFlowMeta,
		isLoading,
		isSaving,
		isAutoSaving,
		lastAutoSaveTime,
		error,

		// Export/Import
		exportFlowAsJson,
		importFlowFromJson,
		getCanvasAsN8nFormat,

		// Dialog state
		selectedNodeId,
		selectedNode,
		dialogOpen,
		templateDialogOpen,
		showResetDialog,
		showImportDialog,
		isImporting,
		setDialogOpen,
		setTemplateDialogOpen,
		setShowResetDialog,
		setShowImportDialog,

		// Import status
		canImport,
		importStats,

		// Popover state
		popoverState,
		closePopover,
		pendingConnectionRef,

		// Data
		channelType,
		messagesForDialog,

		// Handlers
		handleSelectFlow,
		handleCreateNew,
		handleBackToList,
		handleDrop,
		handleDropElement,
		handleDropTemplateElement,
		handleNodeDoubleClick,
		handleNodeSelect,
		handleUpdateNodeData,
		handleLinkMessageWithReactions,
		handleCloseDialog,
		handleConnectEnd,
		handlePopoverSelect,
		handleSave,
		handleAutoLayout,
		handleReset,
		handleImport,
	};
}
