"use client";

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import {
	useNodesState,
	useEdgesState,
	type Node,
	type Edge,
	type OnNodesChange,
	type OnEdgesChange,
	type OnConnect,
	type Connection,
	addEdge,
} from "@xyflow/react";
import type {
	FlowCanvas,
	FlowNode,
	FlowEdge,
	FlowNodeType,
	FlowNodeData,
	FlowCanvasState,
	FlowExportFormat,
} from "@/types/flow-builder";
import { createFlowNode, createFlowEdge, createEmptyFlowCanvas, FLOW_CANVAS_CONSTANTS } from "@/types/flow-builder";
import { canvasToN8nFormat } from "@/lib/flow-builder/exportImport";

// =============================================================================
// TYPES
// =============================================================================

interface FlowDetail {
	id: string;
	name: string;
	inboxId: string;
	isActive: boolean;
	isCampaign: boolean;
	canvas: FlowCanvas | null;
	createdAt: string;
	updatedAt: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) {
		const error = await res.json();
		throw new Error(error.error || "Erro ao carregar canvas");
	}
	return res.json();
};

const saveCanvas = async (url: string, { arg }: { arg: { inboxId: string; canvas: FlowCanvas } }) => {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(arg),
	});
	if (!res.ok) {
		const error = await res.json();
		throw new Error(error.error || "Erro ao salvar canvas");
	}
	return res.json();
};

// =============================================================================
// HOOK
// =============================================================================

interface UseFlowCanvasOptions {
	autoSave?: boolean;
	autoSaveDelay?: number;
	flowId?: string | null; // ID do flow específico para carregar
	isNewFlow?: boolean; // Indica que estamos criando um flow novo (não carregar canvas legado)
	isCampaign?: boolean; // Flow de campanha (inicia com WHATSAPP_TEMPLATE ao invés de START)
}

// Default auto-save delay: 3 seconds
const DEFAULT_AUTO_SAVE_DELAY = 3000;

export function useFlowCanvas(inboxId: string | null, options: UseFlowCanvasOptions = {}) {
	const { autoSave = false, autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY, flowId = null, isNewFlow = false, isCampaign = false } = options;

	// =========================================================================
	// REFS — valores transientes que NÃO devem causar re-render (React best practice:
	// rerender-use-ref-transient-values)
	// =========================================================================
	const initializedRef = useRef(false);
	const prevFlowIdRef = useRef<string | null>(flowId);

	// Refs para auto-save — valores lidos dentro de callback, não precisam ser
	// dependencies de effects (advanced-event-handler-refs / advanced-use-latest)
	const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastSavedRef = useRef<string>("");
	const isAutoSavingRef = useRef(false);
	const nodesRef = useRef<Node[]>([]);
	const edgesRef = useRef<Edge[]>([]);
	const viewportRef = useRef<FlowCanvas["viewport"] | undefined>(undefined);

	// SWR key para canvas visual (mantido para compatibilidade)
	const canvasSwrKey = inboxId ? `/api/admin/mtf-diamante/flow-canvas?inboxId=${inboxId}` : null;

	// SWR key para flow específico — derivado de primitive `flowId`
	// (rerender-dependencies: usar primitivo, não objeto)
	const flowSwrKey = flowId ? `/api/admin/mtf-diamante/flows/${flowId}` : null;

	// Fetch canvas visual
	const {
		data: canvasResponse,
		error: canvasError,
		isLoading: isLoadingCanvas,
		mutate: mutateCanvas,
	} = useSWR<{ success: boolean; data: FlowCanvasState | null }>(
		!flowId ? canvasSwrKey : null, // Só busca se não tiver flowId
		fetcher,
		{
			revalidateOnFocus: false,
			dedupingInterval: 5000,
			keepPreviousData: false,
		},
	);

	// Fetch flow específico
	const {
		data: flowResponse,
		error: flowError,
		isLoading: isLoadingFlow,
		mutate: mutateFlow,
	} = useSWR<{ success: boolean; data: FlowDetail | null }>(flowSwrKey, fetcher, {
		revalidateOnFocus: false,
		dedupingInterval: 5000,
		keepPreviousData: false,
	});

	// Save mutation
	const { trigger: triggerSave, isMutating: isSaving } = useSWRMutation(
		"/api/admin/mtf-diamante/flow-canvas",
		saveCanvas,
	);

	// Canvas vazio estável (memo depende de isCampaign para tipo do nó inicial)
	const initialCanvas = useMemo(() => {
		return createEmptyFlowCanvas({ isCampaign });
	}, [isCampaign]);

	// Metadados do flow atual — derivados de primitivos
	// (rerender-dependencies: evitar comparação de objeto inteiro)
	const flowDataId = flowResponse?.data?.id;
	const flowDataName = flowResponse?.data?.name;
	const flowDataIsActive = flowResponse?.data?.isActive;
	const currentFlowMeta = useMemo(() => {
		if (flowId && flowDataId) {
			return {
				id: flowDataId,
				name: flowDataName ?? "",
				isActive: flowDataIsActive ?? false,
			};
		}
		return null;
	}, [flowId, flowDataId, flowDataName, flowDataIsActive]);

	// React Flow states
	const [nodes, setNodes, onNodesChange] = useNodesState(initialCanvas.nodes as unknown as Node[]);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges as unknown as Edge[]);

	// Manter refs sincronizados com state (rerender-use-ref-transient-values)
	// Isso evita que auto-save precise de nodes/edges como deps de useCallback
	useEffect(() => {
		nodesRef.current = nodes;
	}, [nodes]);
	useEffect(() => {
		edgesRef.current = edges;
	}, [edges]);

	// Derivar flags primitivas para deps (rerender-dependencies)
	const hasFlowCanvas = !!flowResponse?.data?.canvas;
	const flowCanvasNodeCount = flowResponse?.data?.canvas?.nodes?.length ?? 0;

	// =========================================================================
	// EFEITO 1: Detectar mudança de flowId → resetar estado
	//   Dep: apenas `flowId` (primitivo). Não depende de dados SWR.
	// =========================================================================
	useEffect(() => {
		// Guard: só agir quando flowId realmente mudou
		if (prevFlowIdRef.current === flowId) return;

		console.log("[useFlowCanvas] FlowId mudou:", prevFlowIdRef.current, "->", flowId);
		prevFlowIdRef.current = flowId;
		initializedRef.current = false;
		lastSavedRef.current = "";

		// Limpar canvas ao mudar flowId (campanha inicia com WHATSAPP_TEMPLATE)
		const empty = createEmptyFlowCanvas({ isCampaign });
		setNodes(empty.nodes as unknown as Node[]);
		setEdges(empty.edges as unknown as Edge[]);

		if (!flowId) {
			// Voltou para lista — canvas vazio já está ok
			initializedRef.current = true;
		}
		// Se tem flowId, Efeito 2 cuidará de carregar quando dados chegarem
	}, [flowId, isCampaign, setNodes, setEdges]);

	// =========================================================================
	// EFEITO 2: Sincronizar dados do servidor → preencher canvas
	//   Deps: hasFlowCanvas (bool), flowCanvasNodeCount (number), isLoadingFlow (bool)
	//   Nunca depende de flowResponse (objeto), evitando re-runs espúrios
	// =========================================================================
	useEffect(() => {
		// Já inicializado — não re-sincronizar
		if (initializedRef.current) return;

		// Se tem flowId, aguardar dados carregarem
		if (flowId && !isLoadingFlow && flowResponse) {
			console.log("[useFlowCanvas] Sincronizando flow:", flowId, "- tem canvas?", hasFlowCanvas);

			if (flowResponse.data?.canvas) {
				const canvas = flowResponse.data.canvas;
				setNodes(canvas.nodes as unknown as Node[]);
				setEdges(canvas.edges as unknown as Edge[]);
				viewportRef.current = canvas.viewport;
				// Snapshot inicial para auto-save não disparar imediatamente
				lastSavedRef.current = JSON.stringify({
					nodes: canvas.nodes,
					edges: canvas.edges,
				});
				console.log("[useFlowCanvas] Canvas carregado - nós:", canvas.nodes.length);
			} else {
				// Flow novo sem canvas: inicializar nó inicial com nome do flow
				const flowName = flowResponse.data?.name;
				const flowIsCampaign = flowResponse.data?.isCampaign ?? false;
				if (flowIsCampaign) {
					// Campanha: canvas vazio com WHATSAPP_TEMPLATE como primeiro nó
					const campaignCanvas = createEmptyFlowCanvas({ isCampaign: true });
					setNodes(campaignCanvas.nodes as unknown as Node[]);
					setEdges(campaignCanvas.edges as unknown as Edge[]);
					console.log("[useFlowCanvas] Flow campanha novo - WHATSAPP_TEMPLATE inicializado");
				} else if (flowName) {
					setNodes((nds) =>
						nds.map((node) =>
							node.type === "start" ? { ...node, data: { ...node.data, label: flowName } } : node,
						),
					);
					console.log("[useFlowCanvas] Flow novo sem canvas - START inicializado com nome:", flowName);
				}
			}
			initializedRef.current = true;
			return;
		}

		// Se não tem flowId e os dados do canvas global carregaram
		// IMPORTANTE: Não carregar canvas legado se estamos criando um flow novo
		if (!flowId && !isNewFlow && !isLoadingCanvas && canvasResponse?.data?.canvas) {
			console.log("[useFlowCanvas] Sincronizando canvas visual");
			const canvas = canvasResponse.data.canvas;
			setNodes(canvas.nodes as unknown as Node[]);
			setEdges(canvas.edges as unknown as Edge[]);
			initializedRef.current = true;
			return;
		}

		// Flow novo sem flowId - manter canvas vazio
		if (!flowId && isNewFlow && !initializedRef.current) {
			console.log("[useFlowCanvas] Flow novo - mantendo canvas vazio");
			initializedRef.current = true;
			return;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [flowId, isNewFlow, hasFlowCanvas, flowCanvasNodeCount, isLoadingFlow, isLoadingCanvas, setNodes, setEdges]);

	// Computed states
	const isLoading = isLoadingCanvas || isLoadingFlow;
	const error = canvasError || flowError;
	const canvasVersion = canvasResponse?.data?.version ?? 0;

	// Auto-save state
	const [isAutoSaving, setIsAutoSaving] = useState(false);
	const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);

	// ==========================================================================
	// AUTO-SAVE LOGIC
	// Usa refs para ler valores atuais sem precisar recriá-la a cada render
	// (advanced-event-handler-refs + rerender-use-ref-transient-values)
	// ==========================================================================

	const performAutoSave = useCallback(async () => {
		if (!inboxId || !flowId || !initializedRef.current) return;
		if (isAutoSavingRef.current) return;

		// Ler de refs para evitar stale closures E evitar deps que mudam sempre
		const currentNodes = nodesRef.current;
		const currentEdges = edgesRef.current;
		const currentState = JSON.stringify({ nodes: currentNodes, edges: currentEdges });

		if (currentState === lastSavedRef.current) return;

		try {
			isAutoSavingRef.current = true;
			setIsAutoSaving(true);

			const canvas: FlowCanvas = {
				nodes: currentNodes as unknown as FlowNode[],
				edges: currentEdges as unknown as FlowEdge[],
				viewport: viewportRef.current ?? FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT,
			};

			const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ canvas }),
			});

			if (response.ok) {
				lastSavedRef.current = currentState;
				setLastAutoSaveTime(new Date());
				console.log("[useFlowCanvas] Auto-save concluído");
			}
		} catch (err) {
			console.error("[useFlowCanvas] Auto-save error:", err);
		} finally {
			isAutoSavingRef.current = false;
			setIsAutoSaving(false);
		}
	}, [inboxId, flowId]); // ← deps mínimas (primitivos estáveis)

	// Efeito para disparar auto-save com debounce
	// Deps: nodes.length e edges.length (primitivos) em vez de arrays inteiros
	// (rerender-dependencies: narrow deps)
	const nodesLength = nodes.length;
	const edgesLength = edges.length;

	useEffect(() => {
		if (!autoSave || !flowId || !initializedRef.current || isLoading) {
			return;
		}

		if (autoSaveTimeoutRef.current) {
			clearTimeout(autoSaveTimeoutRef.current);
		}

		autoSaveTimeoutRef.current = setTimeout(() => {
			performAutoSave();
		}, autoSaveDelay);

		return () => {
			if (autoSaveTimeoutRef.current) {
				clearTimeout(autoSaveTimeoutRef.current);
			}
		};
		// Reage a mudanças de tamanho + nodes/edges identity (useNodesState retorna novo array)
	}, [autoSave, flowId, nodes, edges, nodesLength, edgesLength, autoSaveDelay, isLoading, performAutoSave]);

	// Handle connection
	const onConnect: OnConnect = useCallback(
		(connection: Connection) => {
			const newEdge = createFlowEdge(
				connection.source!,
				connection.target!,
				connection.sourceHandle ?? undefined,
				connection.sourceHandle ? { buttonId: connection.sourceHandle } : undefined,
			);
			setEdges((eds) => addEdge(newEdge as unknown as Edge, eds));
		},
		[setEdges],
	);

	// Add node
	const addNode = useCallback(
		(type: FlowNodeType, position?: { x: number; y: number }) => {
			const defaultPosition = position ?? {
				x: 250,
				y: (nodes.length + 1) * FLOW_CANVAS_CONSTANTS.NODE_SPACING_Y,
			};
			const newNode = createFlowNode(type, defaultPosition);
			setNodes((nds) => [...nds, newNode as unknown as Node]);
			return newNode.id;
		},
		[nodes.length, setNodes],
	);

	// Update node data
	const updateNodeData = useCallback(
		(nodeId: string, data: Partial<FlowNodeData>) => {
			setNodes((nds) =>
				nds.map((node) => {
					if (node.id === nodeId) {
						return {
							...node,
							data: { ...node.data, ...data },
						};
					}
					return node;
				}),
			);
		},
		[setNodes],
	);

	// Delete node
	const deleteNode = useCallback(
		(nodeId: string) => {
			setNodes((nds) => nds.filter((node) => node.id !== nodeId));
			// Also remove connected edges
			setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
		},
		[setNodes, setEdges],
	);

	// Update flow name via PATCH (sincroniza quando label do START muda)
	const updateFlowName = useCallback(
		async (name: string): Promise<boolean> => {
			if (!flowId || !name.trim()) return false;
			try {
				const res = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: name.trim() }),
				});
				if (!res.ok) {
					const err = await res.json();
					throw new Error(err.error || "Falha ao renomear flow");
				}
				// Atualizar cache SWR do flow
				await mutateFlow();
				return true;
			} catch (err) {
				console.error("[useFlowCanvas] updateFlowName error:", err);
				throw err;
			}
		},
		[flowId, mutateFlow],
	);

	// Delete edge
	const deleteEdge = useCallback(
		(edgeId: string) => {
			setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
		},
		[setEdges],
	);

	// Get current canvas state
	// Usa viewportRef em vez de flowResponse para evitar deps de objeto
	const getCanvasState = useCallback(
		(viewport?: { x: number; y: number; zoom: number }): FlowCanvas => {
			return {
				nodes: nodes as unknown as FlowNode[],
				edges: edges as unknown as FlowEdge[],
				viewport: viewport ?? viewportRef.current ?? FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT,
			};
		},
		[nodes, edges],
	);

	// Save canvas (rerender-move-effect-to-event: save é ação do usuário)
	const saveFlow = useCallback(
		async (viewport?: { x: number; y: number; zoom: number }) => {
			if (!inboxId) return;

			// Atualizar viewport ref quando o usuário salva manualmente
			if (viewport) {
				viewportRef.current = viewport;
			}

			const canvas = getCanvasState(viewport);

			try {
				// Se estiver editando um flow específico, salvar no Flow.canvasJson
				if (flowId) {
					const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ canvas }),
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || "Falha ao salvar canvas do flow");
					}

					// Atualizar snapshot para evitar auto-save duplicado
					lastSavedRef.current = JSON.stringify({
						nodes: canvas.nodes,
						edges: canvas.edges,
					});

					// NÃO chamar mutateFlow() — evita re-fetch que causaria re-sync desnecessário
					// O canvas local já é a fonte de verdade durante a edição
					console.log("[useFlowCanvas] Canvas salvo no flow", flowId);
					return await response.json();
				}

				// Se não tem flowId, usar API antiga (canvas visual da inbox)
				const result = await triggerSave({ inboxId, canvas });
				await mutateCanvas();
				console.log("[useFlowCanvas] Canvas visual salvo na inbox", inboxId);
				return result;
			} catch (err) {
				console.error("[useFlowCanvas] Save error:", err);
				throw err;
			}
		},
		[inboxId, flowId, getCanvasState, triggerSave, mutateCanvas],
	);

	// Reset canvas
	const resetCanvas = useCallback(() => {
		const empty = createEmptyFlowCanvas({ isCampaign });
		setNodes(empty.nodes as unknown as Node[]);
		setEdges(empty.edges as unknown as Edge[]);
		initializedRef.current = true; // Evitar re-sincronização
	}, [isCampaign, setNodes, setEdges]);

	// Load canvas from flow (para trocar entre flows)
	const loadCanvas = useCallback(
		(canvas: FlowCanvas) => {
			setNodes(canvas.nodes as unknown as Node[]);
			setEdges(canvas.edges as unknown as Edge[]);
			initializedRef.current = true;
		},
		[setNodes, setEdges],
	);

	// Find node by ID
	const findNode = useCallback(
		(nodeId: string) => {
			return nodes.find((n) => n.id === nodeId);
		},
		[nodes],
	);

	// Get edges connected to a node
	const getNodeEdges = useCallback(
		(nodeId: string) => {
			return edges.filter((e) => e.source === nodeId || e.target === nodeId);
		},
		[edges],
	);

	// ==========================================================================
	// EXPORT/IMPORT FUNCTIONS
	// ==========================================================================

	/**
	 * Exporta o flow atual como JSON n8n-style (dispara download)
	 */
	const exportFlowAsJson = useCallback(async () => {
		if (!flowId) {
			throw new Error("Nenhum flow selecionado para exportar");
		}

		const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}/export`);
		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Falha ao exportar flow");
		}

		// Extrair filename do header Content-Disposition
		const contentDisposition = response.headers.get("Content-Disposition");
		const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
		const filename = filenameMatch?.[1] || `flow-export-${Date.now()}.json`;

		// Criar blob e disparar download
		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [flowId]);

	/**
	 * Importa flow a partir de arquivo JSON
	 */
	const importFlowFromJson = useCallback(
		async (
			file: File,
			options?: { newName?: string },
		): Promise<{ id: string; name: string; nodeCount: number; connectionCount: number }> => {
			if (!inboxId) {
				throw new Error("Nenhuma inbox selecionada");
			}

			const text = await file.text();
			let flowData: unknown;

			try {
				flowData = JSON.parse(text);
			} catch {
				throw new Error("Arquivo JSON inválido");
			}

			const response = await fetch("/api/admin/mtf-diamante/flows/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					inboxId,
					flowData,
					newName: options?.newName,
				}),
			});

			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || "Falha ao importar flow");
			}

			// Revalidar lista de flows
			await mutateCanvas();

			return result.data;
		},
		[inboxId, mutateCanvas],
	);

	/**
	 * Retorna o canvas atual em formato n8n (para preview/debug)
	 */
	const getCanvasAsN8nFormat = useCallback((): FlowExportFormat => {
		const canvas = getCanvasState();
		return canvasToN8nFormat(canvas, {
			flowId: flowId || undefined,
			flowName: currentFlowMeta?.name || "Untitled",
			inboxId: inboxId || undefined,
		});
	}, [getCanvasState, flowId, currentFlowMeta?.name, inboxId]);

	return {
		// State
		nodes,
		edges,
		isLoading,
		isSaving,
		isAutoSaving,
		lastAutoSaveTime,
		error,
		canvasVersion,
		currentFlowMeta, // Metadados do flow atual (id, name, isActive)

		// Node operations
		setNodes,
		onNodesChange,
		addNode,
		updateNodeData,
		deleteNode,
		findNode,

		// Edge operations
		setEdges,
		onEdgesChange,
		onConnect,
		deleteEdge,
		getNodeEdges,

		// Canvas operations
		getCanvasState,
		saveFlow,
		resetCanvas,
		loadCanvas, // Nova função para carregar canvas manualmente
		mutate: mutateCanvas,
		updateFlowName,

		// Export/Import operations
		exportFlowAsJson,
		importFlowFromJson,
		getCanvasAsN8nFormat,
	};
}

export type UseFlowCanvasReturn = ReturnType<typeof useFlowCanvas>;
