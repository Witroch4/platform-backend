// app/admin/leads-chatwit/components/batch-processor/useLeadBatchProcessor.ts

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { ExtendedLead } from "../../types";
import { TurboModePDFProcessor } from "./TurboModePDFProcessor";
import { TurboModeImageGenerator } from "./TurboModeImageGenerator";
import type { ParallelProcessingResult } from "./TurboModePDFProcessor";
import type { TurboModeConfig, TurboModeMetrics } from "./useTurboMode";

// Defina os tipos para os dados que você coletará nos diálogos
type ManuscritoData = { selectedImages: string[] };
type EspelhoData = { selectedImages: string[] };

type CollectedData = {
	manuscrito?: ManuscritoData;
	espelho?: EspelhoData;
};

// Tipos para as filas de processamento
type ProcessingQueue = {
	pdfUnification: ExtendedLead[];
	imageGeneration: ExtendedLead[];
	manuscriptProcessing: ExtendedLead[];
	mirrorProcessing: ExtendedLead[];
	preliminaryAnalysis: ExtendedLead[];
};

type ProcessingStep =
	| "idle"
	| "analyzing"
	| "unifying-pdf"
	| "generating-images"
	| "dispatching-manuscripts"
	| "manuscript"
	| "mirror"
	| "preliminary-analysis"
	| "done";

type ProcessingStats = {
	totalLeads: number;
	processedLeads: number;
	skippedAnalysis: ExtendedLead[];
	completedTasks: {
		pdfUnified: number;
		imagesGenerated: number;
		manuscriptsProcessed: number;
		mirrorsProcessed: number;
		analysisCompleted: number;
	};
};

// Tipos para SSE
type SSENotification = {
	type: string;
	message: string;
	leadId: string;
	leadData?: any;
	timestamp: string;
	data?: any; // Para compatibilidade com diferentes estruturas de notificação
};

type ManuscriptDispatchItem = {
	lead: ExtendedLead;
	selectedImages: string[];
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const useLeadBatchProcessor = (
	leads: ExtendedLead[],
	onUpdate?: () => void,
	turboModeConfig?: TurboModeConfig | null,
	turboModeEnabled?: boolean,
	onTurboModeMetricsUpdate?: (metrics: Partial<TurboModeMetrics>) => void,
) => {
	console.log("[useLeadBatchProcessor] Inicializando hook com leads:", leads.length);

	const [isOpen, setIsOpen] = useState(false);
	const [currentStep, setCurrentStep] = useState<ProcessingStep>("idle");
	const [progress, setProgress] = useState({ current: 0, total: leads.length });
	const [collectedData, setCollectedData] = useState<Map<string, CollectedData>>(new Map());

	// Novos estados para orquestração inteligente
	const [processingQueues, setProcessingQueues] = useState<ProcessingQueue>({
		pdfUnification: [],
		imageGeneration: [],
		manuscriptProcessing: [],
		mirrorProcessing: [],
		preliminaryAnalysis: [],
	});
	const [stats, setStats] = useState<ProcessingStats>({
		totalLeads: leads.length,
		processedLeads: 0,
		skippedAnalysis: [],
		completedTasks: {
			pdfUnified: 0,
			imagesGenerated: 0,
			manuscriptsProcessed: 0,
			mirrorsProcessed: 0,
			analysisCompleted: 0,
		},
	});
	const [currentProcessingLead, setCurrentProcessingLead] = useState<ExtendedLead | null>(null);
	const [currentManualLeadIndex, setCurrentManualLeadIndex] = useState(0);
	const [showAutomatedDialog, setShowAutomatedDialog] = useState(false);
	const [showContinueButton, setShowContinueButton] = useState(false);

	// Estados para SSE
	const [sseConnections, setSseConnections] = useState<Map<string, EventSource>>(new Map());
	const [leadsBeingProcessed, setLeadsBeingProcessed] = useState<Set<string>>(new Set());
	const [connectionHealthCheck, setConnectionHealthCheck] = useState<NodeJS.Timeout | null>(null);
	const [leadProcessingTimestamps, setLeadProcessingTimestamps] = useState<Map<string, number>>(new Map());
	const batchDispatchConcurrency = useMemo(
		() =>
			parsePositiveInteger(
				process.env.NEXT_PUBLIC_OAB_EVAL_BATCH_DISPATCH_CONCURRENCY,
				turboModeConfig?.maxParallelLeads ?? 10,
			),
		[turboModeConfig?.maxParallelLeads],
	);

	const currentLead = useMemo(() => {
		console.log("[useLeadBatchProcessor] Calculando currentLead:", {
			currentStep,
			currentManualLeadIndex,
			manuscriptQueueLength: processingQueues.manuscriptProcessing.length,
			mirrorQueueLength: processingQueues.mirrorProcessing.length,
			manuscriptQueue: processingQueues.manuscriptProcessing.map((l) => l.nome),
			mirrorQueue: processingQueues.mirrorProcessing.map((l) => l.nome),
		});

		if (currentStep === "manuscript") {
			const lead = processingQueues.manuscriptProcessing[currentManualLeadIndex] || null;
			console.log("[useLeadBatchProcessor] CurrentLead para manuscript:", lead?.nome || "null");
			return lead;
		} else if (currentStep === "mirror") {
			const lead = processingQueues.mirrorProcessing[currentManualLeadIndex] || null;
			console.log("[useLeadBatchProcessor] CurrentLead para mirror:", lead?.nome || "null");
			return lead;
		}
		return null;
	}, [currentStep, processingQueues.manuscriptProcessing, processingQueues.mirrorProcessing, currentManualLeadIndex]);

	// Função para criar conexão SSE para um lead com reconexão automática
	const createSSEConnection = (leadId: string, retryCount = 0) => {
		console.log(
			`[Batch SSE] Usando SSE centralizada para lead ${leadId}${retryCount > 0 ? ` (tentativa ${retryCount + 1})` : ""}`,
		);
	};

	// Função para processar atualizações do lead via SSE
	const handleSSELeadUpdate = (leadId: string, notificationData: any) => {
		const leadData = notificationData.leadData;
		if (!leadData) return;

		console.log(`[Batch SSE] 🔄 Processando atualização para ${leadId}:`, {
			manuscritoProcessado: leadData.manuscritoProcessado,
			aguardandoManuscrito: leadData.aguardandoManuscrito,
			espelhoProcessado: leadData.espelhoProcessado,
			aguardandoEspelho: leadData.aguardandoEspelho,
			analiseProcessada: leadData.analiseProcessada,
			aguardandoAnalise: leadData.aguardandoAnalise,
		});

		// Atualizar estatísticas baseado na notificação
		if (leadData.manuscritoProcessado && !leadData.aguardandoManuscrito) {
			console.log(`[Batch SSE] ✅ Manuscrito processado para ${leadData.name || leadId}`);

			// Remover da lista de processamento e timestamps
			removeLeadFromTracking(leadId);

			// Fechar conexão SSE após processamento concluído
			setTimeout(() => {
				closeSSEConnection(leadId);
				console.log(`[Batch SSE] 🧹 Conexão fechada para ${leadId} após processamento de manuscrito`);
			}, 2000); // Aguardar 2s para garantir que todas as atualizações foram processadas

			// Mostrar toast de sucesso
			toast.success(`✅ Manuscrito de "${leadData.name || "Lead"}" processado!`, {
				description: "O texto foi extraído e está disponível para visualização.",
				duration: 5000,
			});

			// Atualizar lista para refletir mudança no botão
			if (onUpdate) {
				setTimeout(() => onUpdate(), 300);
			}
		}

		if (leadData.espelhoProcessado && !leadData.aguardandoEspelho) {
			console.log(`[Batch SSE] ✅ Espelho processado para ${leadData.name || leadId}`);

			// Remover da lista de processamento e timestamps
			removeLeadFromTracking(leadId);

			// Fechar conexão SSE após processamento concluído
			setTimeout(() => {
				closeSSEConnection(leadId);
				console.log(`[Batch SSE] 🧹 Conexão fechada para ${leadId} após processamento de espelho`);
			}, 2000); // Aguardar 2s para garantir que todas as atualizações foram processadas

			// Mostrar toast de sucesso
			toast.success(`✅ Espelho de "${leadData.name || "Lead"}" processado!`, {
				description: "A correção foi finalizada e está disponível para consulta.",
				duration: 5000,
			});

			// Atualizar lista para refletir mudança no botão
			if (onUpdate) {
				setTimeout(() => onUpdate(), 300);
			}
		}

		if (leadData.analiseProcessada && !leadData.aguardandoAnalise) {
			console.log(`[Batch SSE] ✅ Análise processada para ${leadData.name || leadId}`);

			// Remover da lista de processamento e timestamps
			removeLeadFromTracking(leadId);

			// Fechar conexão SSE após processamento concluído
			setTimeout(() => {
				closeSSEConnection(leadId);
				console.log(`[Batch SSE] 🧹 Conexão fechada para ${leadId} após processamento de análise`);
			}, 2000); // Aguardar 2s para garantir que todas as atualizações foram processadas

			// Verificar se é análise preliminar ou final
			const isAnalisePreliminar = leadData.analisePreliminar && !leadData.analiseUrl;
			const title = isAnalisePreliminar
				? `📋 Pré-análise de "${leadData.name || "Lead"}" processada!`
				: `📊 Análise de "${leadData.name || "Lead"}" processada!`;
			const description = isAnalisePreliminar
				? "A pré-análise foi concluída e está disponível para consulta."
				: "A análise foi concluída e os resultados estão disponíveis.";

			toast.success(title, { description, duration: 8000 });

			// Atualizar lista para refletir mudança no botão
			if (onUpdate) {
				setTimeout(() => onUpdate(), 300);
			}
		}

		// Chamar callback de atualização se fornecido
		if (onUpdate) {
			onUpdate();
		}
	};

	// Função para fechar conexão SSE
	const closeSSEConnection = (leadId: string) => {
		const connection = sseConnections.get(leadId);
		if (connection) {
			console.log(`[Batch SSE] 🔌 Fechando conexão SSE para ${leadId}`);
			connection.close();
			setSseConnections((prev) => {
				const newMap = new Map(prev);
				newMap.delete(leadId);
				return newMap;
			});
		}
	};

	const removeLeadFromTracking = (leadId: string) => {
		setLeadsBeingProcessed((prev) => {
			const newSet = new Set(prev);
			newSet.delete(leadId);
			return newSet;
		});
		setLeadProcessingTimestamps((prev) => {
			const newMap = new Map(prev);
			newMap.delete(leadId);
			return newMap;
		});
	};

	// Função para fechar todas as conexões SSE
	const closeAllSSEConnections = () => {
		console.log(`[Batch SSE] 🔌 Fechando todas as conexões SSE (${sseConnections.size})`);
		sseConnections.forEach((connection, leadId) => {
			connection.close();
		});
		setSseConnections(new Map());
		setLeadsBeingProcessed(new Set());
		setLeadProcessingTimestamps(new Map());

		// Limpar health check
		if (connectionHealthCheck) {
			clearInterval(connectionHealthCheck);
			setConnectionHealthCheck(null);
		}
	};

	// Função para monitorar saúde das conexões SSE
	const startConnectionHealthCheck = () => {
		if (connectionHealthCheck) {
			clearInterval(connectionHealthCheck);
		}

		const interval = setInterval(() => {
			console.log(`[Batch SSE] 🔍 Verificando saúde das conexões (${sseConnections.size} ativas)`);

			// Verificar conexões que podem estar inativas
			sseConnections.forEach((connection, leadId) => {
				if (connection.readyState === EventSource.CLOSED) {
					console.log(`[Batch SSE] 🔄 Reconectando conexão fechada para ${leadId}`);
					closeSSEConnection(leadId);

					// Reconectar apenas se ainda estivermos processando
					if (leadsBeingProcessed.has(leadId)) {
						createSSEConnection(leadId);
					}
				} else if (connection.readyState === EventSource.CONNECTING) {
					console.log(`[Batch SSE] ⏳ Conexão ainda conectando para ${leadId}`);
				}
			});

			// Limpar leads que não estão mais sendo processados ou que estão há muito tempo sem atividade
			const leadsToRemove: string[] = [];
			const now = Date.now();
			const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

			sseConnections.forEach((connection, leadId) => {
				if (!leadsBeingProcessed.has(leadId)) {
					console.log(`[Batch SSE] 🧹 Limpando conexão inativa para ${leadId}`);
					leadsToRemove.push(leadId);
				} else {
					// Verificar timeout
					const timestamp = leadProcessingTimestamps.get(leadId);
					if (timestamp && now - timestamp > TIMEOUT_MS) {
						console.log(
							`[Batch SSE] ⏰ Lead ${leadId} em timeout (${Math.round((now - timestamp) / 1000)}s), removendo da lista`,
						);
						leadsToRemove.push(leadId);

						// Mostrar toast de timeout
						toast.warning(`Lead ${leadId} removido da lista de processamento por timeout (10 minutos sem atividade)`, {
							duration: 5000,
						});
					}
				}
			});

			leadsToRemove.forEach((leadId) => {
				closeSSEConnection(leadId);
				// Remover também da lista de processamento e timestamps
				setLeadsBeingProcessed((prev) => {
					const newSet = new Set(prev);
					newSet.delete(leadId);
					return newSet;
				});
				setLeadProcessingTimestamps((prev) => {
					const newMap = new Map(prev);
					newMap.delete(leadId);
					return newMap;
				});
			});

			// Parar health check se não há mais conexões
			if (sseConnections.size === 0) {
				console.log("[Batch SSE] 🛑 Nenhuma conexão ativa, parando health check");
				if (connectionHealthCheck) {
					clearInterval(connectionHealthCheck);
					setConnectionHealthCheck(null);
				}
			}
		}, 30000); // Verificar a cada 30 segundos

		setConnectionHealthCheck(interval);
	};

	// Cleanup ao desmontar o componente
	useEffect(() => {
		const handleLeadUpdateEvent = (event: Event) => {
			const customEvent = event as CustomEvent<{ leadId?: string; leadData?: any }>;
			const leadId = customEvent.detail?.leadId;
			const leadData = customEvent.detail?.leadData;
			if (!leadId || !leadData || !leadsBeingProcessed.has(leadId)) {
				return;
			}
			handleSSELeadUpdate(leadId, { leadData });
		};

		const handleLeadOperationEvent = (event: Event) => {
			const customEvent = event as CustomEvent<{
				leadId?: string;
				status?: string;
				stage?: string;
				message?: string;
				error?: string;
			}>;
			const operation = customEvent.detail;
			if (!operation?.leadId || !leadsBeingProcessed.has(operation.leadId)) {
				return;
			}

			if (operation.status === "failed" || operation.status === "canceled" || operation.status === "inconsistent") {
				removeLeadFromTracking(operation.leadId);
				toast.warning(`Processamento interrompido para ${operation.leadId}`, {
					description: operation.error || operation.message || "A operação saiu do fluxo em lote.",
					duration: 6000,
				});
				onUpdate?.();
			}
		};

		window.addEventListener("lead-update", handleLeadUpdateEvent as EventListener);
		window.addEventListener("lead-operation", handleLeadOperationEvent as EventListener);

		return () => {
			window.removeEventListener("lead-update", handleLeadUpdateEvent as EventListener);
			window.removeEventListener("lead-operation", handleLeadOperationEvent as EventListener);
			closeAllSSEConnections();
		};
	}, [leadsBeingProcessed, onUpdate]);

	const start = () => {
		console.log("[useLeadBatchProcessor] Função start() chamada");
		if (leads.length === 0) {
			console.log("[useLeadBatchProcessor] Nenhum lead selecionado");
			toast.warning("Nenhum lead selecionado.");
			return;
		}
		console.log("[useLeadBatchProcessor] Iniciando processo com", leads.length, "leads");

		// NÃO criar conexões SSE imediatamente - apenas quando necessário
		// As conexões serão criadas dinamicamente quando leads forem enviados para processamento

		// Iniciar monitoramento de saúde das conexões (apenas se houver conexões)
		// startConnectionHealthCheck() - será iniciado quando primeira conexão for criada

		// Reset dos stats para começar do zero
		const resetStats = {
			totalLeads: leads.length,
			processedLeads: 0,
			skippedAnalysis: [],
			completedTasks: {
				pdfUnified: 0,
				imagesGenerated: 0,
				manuscriptsProcessed: 0,
				mirrorsProcessed: 0,
				analysisCompleted: 0,
			},
		};
		console.log("[useLeadBatchProcessor] Resetando stats para:", resetStats);
		setStats(resetStats);

		setIsOpen(true);
		setCurrentStep("analyzing");
		setProgress({ current: 0, total: leads.length });
		setCurrentManualLeadIndex(0);
		setShowContinueButton(false);
		analyzeLeadsAndCreateQueues();
	};

	const close = () => {
		console.log("[useLeadBatchProcessor] Fechando processo");

		// Fechar todas as conexões SSE
		closeAllSSEConnections();

		setIsOpen(false);
		setShowAutomatedDialog(false);
		setShowContinueButton(false);
		// Delay para resetar o estado e permitir animação de saída
		setTimeout(() => {
			setCurrentStep("idle");
			setCollectedData(new Map());
			setCurrentManualLeadIndex(0);
			setProcessingQueues({
				pdfUnification: [],
				imageGeneration: [],
				manuscriptProcessing: [],
				mirrorProcessing: [],
				preliminaryAnalysis: [],
			});
		}, 300);
	};

	const continueProcess = () => {
		console.log("[useLeadBatchProcessor] Continuando processo...");
		setShowContinueButton(false);
		finishProcessing();
	};

	// Passo 1: Análise e Enfileiramento
	const analyzeLeadsAndCreateQueues = async () => {
		console.log("[useLeadBatchProcessor] Analisando leads e criando filas...");

		const queues: ProcessingQueue = {
			pdfUnification: [],
			imageGeneration: [],
			manuscriptProcessing: [],
			mirrorProcessing: [],
			preliminaryAnalysis: [],
		};

		// Análise inteligente: verificar as necessidades de cada lead individualmente
		for (const lead of leads) {
			console.log(`[useLeadBatchProcessor] Analisando lead ${lead.nome}:`, {
				pdfUnificado: !!lead.pdfUnificado,
				imagensConvertidas: !!lead.imagensConvertidas,
				provaManuscrita: !!lead.provaManuscrita,
				textoDOEspelho: !!lead.textoDOEspelho,
				analisePreliminar: !!lead.analisePreliminar,
			});

			// Verificar se precisa unificar PDF
			if (!lead.pdfUnificado) {
				queues.pdfUnification.push(lead);
				console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa unificar PDF`);
			}

			// Verificar se precisa gerar imagens
			if (!lead.imagensConvertidas) {
				queues.imageGeneration.push(lead);
				console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa gerar imagens`);
			}

			// Verificar se precisa processar prova manuscrita (SÓ se há imagens convertidas)
			if (!lead.provaManuscrita && lead.imagensConvertidas) {
				queues.manuscriptProcessing.push(lead);
				console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa processar manuscrito`);
			}
		}

		setProcessingQueues(queues);

		console.log("[useLeadBatchProcessor] Filas criadas:", {
			pdfUnification: queues.pdfUnification.length,
			imageGeneration: queues.imageGeneration.length,
			manuscriptProcessing: queues.manuscriptProcessing.length,
			mirrorProcessing: queues.mirrorProcessing.length,
			preliminaryAnalysis: queues.preliminaryAnalysis.length,
		});

		// Iniciar processamento automático para outros leads
		await executeAutomatedTasks(queues);
	};

	// Passo 2: Execução Automatizada - Unificação de PDF e Geração de Imagens
	const executeAutomatedTasks = async (queues: ProcessingQueue) => {
		console.log("[useLeadBatchProcessor] Iniciando tarefas automatizadas...");

		// Unificação de PDFs
		if (queues.pdfUnification.length > 0) {
			setCurrentStep("unifying-pdf");
			setShowAutomatedDialog(true);
			await processUnifyPdfs(queues.pdfUnification);
		}

		// Geração de Imagens (incluindo leads que acabaram de ter PDF unificado)
		const allLeadsNeedingImages = [...queues.imageGeneration, ...queues.pdfUnification];
		if (allLeadsNeedingImages.length > 0) {
			setCurrentStep("generating-images");
			setShowAutomatedDialog(true);
			await processGenerateImages(allLeadsNeedingImages);
		}

		setShowAutomatedDialog(false);

		// Reanalizar leads após geração de imagens para atualizar filas de manuscrito/espelho
		const updatedQueues = await reanalyzeLeadsAfterImageGeneration(queues);

		// Passo 3: Processos Manuais (Manuscrito e Espelho)
		await executeManualTasks(updatedQueues);
	};

	// Função para reanalizar leads após geração de imagens
	const reanalyzeLeadsAfterImageGeneration = async (originalQueues: ProcessingQueue): Promise<ProcessingQueue> => {
		console.log("[useLeadBatchProcessor] Reanalisando leads após geração de imagens...");

		// Buscar dados atualizados dos leads do banco
		const updatedQueues: ProcessingQueue = {
			pdfUnification: [],
			imageGeneration: [],
			manuscriptProcessing: [],
			mirrorProcessing: [],
			preliminaryAnalysis: [],
		};

		for (const lead of leads) {
			// Verificar se o lead estava nas filas de processamento de imagens/PDF
			const wasInPdfQueue = originalQueues.pdfUnification.some((l) => l.id === lead.id);
			const wasInImageQueue = originalQueues.imageGeneration.some((l) => l.id === lead.id);
			const hasImagesNow = lead.imagensConvertidas || wasInPdfQueue || wasInImageQueue;

			console.log(
				`[useLeadBatchProcessor] Lead ${lead.nome}: provaManuscrita=${!!lead.provaManuscrita}, hasImagesNow=${hasImagesNow}`,
			);

			// Verificar se precisa processar prova manuscrita (SÓ se há imagens convertidas)
			if (!lead.provaManuscrita && hasImagesNow) {
				updatedQueues.manuscriptProcessing.push(lead);
				console.log(`[useLeadBatchProcessor] ✅ Adicionado à fila de manuscrito: ${lead.nome}`);
			}

		}

		console.log("[useLeadBatchProcessor] Filas atualizadas após geração de imagens:", {
			manuscriptProcessing: updatedQueues.manuscriptProcessing.length,
			mirrorProcessing: updatedQueues.mirrorProcessing.length,
			preliminaryAnalysis: updatedQueues.preliminaryAnalysis.length,
		});

		return updatedQueues;
	};

	const processUnifyPdfs = async (leadsToProcess: ExtendedLead[]) => {
		console.log("[useLeadBatchProcessor] Processando unificação de PDFs...");

		// Use TURBO mode if enabled and configured
		if (turboModeEnabled && turboModeConfig && leadsToProcess.length > 1) {
			console.log("[useLeadBatchProcessor] Using TURBO mode for PDF unification");

			const turboProcessor = new TurboModePDFProcessor({
				config: turboModeConfig,
				onProgress: (leadId, progress) => {
					console.log(`[TURBO PDF] Progress for ${leadId}: ${progress}%`);
				},
				onComplete: (leadId, result) => {
					console.log(`[TURBO PDF] Completed for ${leadId}:`, result);
					if (result.success) {
						setStats((prev) => ({
							...prev,
							completedTasks: {
								...prev.completedTasks,
								pdfUnified: prev.completedTasks.pdfUnified + 1,
							},
						}));
					}
				},
				onError: (leadId, error) => {
					console.error(`[TURBO PDF] Error for ${leadId}:`, error);
					toast.error(`Falha ao unificar PDF para o lead: ${leadId}`);
				},
			});

			try {
				const startTime = Date.now();
				const results = await turboProcessor.processLeadsInParallel(leadsToProcess);
				const endTime = Date.now();

				const successCount = results.filter((r) => r.success).length;
				const timeSaved = Math.max(0, leadsToProcess.length * 10000 - (endTime - startTime)); // Estimate time saved

				// Update TURBO mode metrics
				if (onTurboModeMetricsUpdate) {
					onTurboModeMetricsUpdate({
						totalLeads: leadsToProcess.length,
						parallelProcessed: successCount,
						timeSaved: timeSaved / 1000, // Convert to seconds
						averageProcessingTime: (endTime - startTime) / leadsToProcess.length / 1000,
					});
				}

				console.log(`[TURBO PDF] Processed ${successCount}/${leadsToProcess.length} leads successfully`);

				// Update interface
				if (onUpdate) {
					onUpdate();
				}

				return;
			} catch (error) {
				console.error("[TURBO PDF] TURBO mode failed, falling back to sequential:", error);
				toast.warning("TURBO mode encontrou um erro, continuando com processamento sequencial");
			}
		}

		// Sequential processing (original implementation)
		console.log("[useLeadBatchProcessor] Using sequential PDF processing");

		for (let i = 0; i < leadsToProcess.length; i++) {
			const lead = leadsToProcess[i];
			setCurrentProcessingLead(lead);
			setProgress({ current: i, total: leadsToProcess.length });

			try {
				console.log(`[useLeadBatchProcessor] Unificando PDFs para ${lead.nome}`);
				const response = await fetch(`/api/admin/leads-chatwit/unify`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ leadId: lead.id }),
				});

				if (response.ok) {
					setStats((prev) => ({
						...prev,
						completedTasks: {
							...prev.completedTasks,
							pdfUnified: prev.completedTasks.pdfUnified + 1,
						},
					}));

					// Atualizar lista na interface
					if (onUpdate) {
						onUpdate();
					}
				}
			} catch (error) {
				console.error(`[useLeadBatchProcessor] Erro ao unificar PDF para ${lead.nome}:`, error);
				toast.error(`Falha ao unificar PDF para o lead: ${lead.nome}`);
			}
		}
	};

	const processGenerateImages = async (leadsToProcess: ExtendedLead[]) => {
		console.log("[useLeadBatchProcessor] Processando geração de imagens...");

		// Use TURBO mode if enabled and configured
		if (turboModeEnabled && turboModeConfig && leadsToProcess.length > 1) {
			console.log("[useLeadBatchProcessor] Using TURBO mode for image generation");

			const turboImageGenerator = new TurboModeImageGenerator({
				config: turboModeConfig,
				onProgress: (leadId, progress) => {
					console.log(`[TURBO IMAGE] Progress for ${leadId}: ${progress}%`);
				},
				onComplete: (leadId, result) => {
					console.log(`[TURBO IMAGE] Completed for ${leadId}:`, result);
					if (result.success) {
						setStats((prev) => ({
							...prev,
							completedTasks: {
								...prev.completedTasks,
								imagesGenerated: prev.completedTasks.imagesGenerated + 1,
							},
						}));
					}
				},
				onError: (leadId, error) => {
					console.error(`[TURBO IMAGE] Error for ${leadId}:`, error);
					toast.error(`Falha ao gerar imagens para o lead: ${leadId}`);
				},
			});

			try {
				const startTime = Date.now();
				const results = await turboImageGenerator.generateImagesInParallel(leadsToProcess);
				const endTime = Date.now();

				const successCount = results.filter((r: ParallelProcessingResult) => r.success).length;
				const timeSaved = Math.max(0, leadsToProcess.length * 15000 - (endTime - startTime)); // Estimate time saved for image generation

				// Update TURBO mode metrics
				if (onTurboModeMetricsUpdate) {
					onTurboModeMetricsUpdate({
						totalLeads: leadsToProcess.length,
						parallelProcessed: successCount,
						timeSaved: timeSaved / 1000, // Convert to seconds
						averageProcessingTime: (endTime - startTime) / leadsToProcess.length / 1000,
					});
				}

				console.log(`[TURBO IMAGE] Processed ${successCount}/${leadsToProcess.length} leads successfully`);

				// Update interface
				if (onUpdate) {
					onUpdate();
				}

				return;
			} catch (error) {
				console.error("[TURBO IMAGE] TURBO mode failed, falling back to sequential:", error);
				toast.warning("TURBO mode encontrou um erro na geração de imagens, continuando com processamento sequencial");
			}
		}

		// Sequential processing (original implementation)
		console.log("[useLeadBatchProcessor] Using sequential image processing");

		for (let i = 0; i < leadsToProcess.length; i++) {
			const lead = leadsToProcess[i];
			setCurrentProcessingLead(lead);
			setProgress({ current: i, total: leadsToProcess.length });

			try {
				console.log(`[useLeadBatchProcessor] Convertendo PDF para imagem para ${lead.nome}`);
				const response = await fetch(`/api/admin/leads-chatwit/convert-to-images`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ leadId: lead.id }),
				});

				if (response.ok) {
					// Buscar os dados atualizados do lead para obter as URLs das imagens
					// Pequeno delay para garantir que o banco foi atualizado
					await new Promise((resolve) => setTimeout(resolve, 1000));

					try {
						let retries = 3;
						let updatedLead = null;

						while (retries > 0 && !updatedLead?.imagensConvertidas) {
							const updatedLeadResponse = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`);
							if (updatedLeadResponse.ok) {
								updatedLead = await updatedLeadResponse.json();
								if (updatedLead.imagensConvertidas && updatedLead.imagensConvertidas !== "processed") {
									lead.imagensConvertidas = updatedLead.imagensConvertidas;
									console.log(
										`[useLeadBatchProcessor] URLs das imagens atualizadas para ${lead.nome}:`,
										lead.imagensConvertidas,
									);
									break;
								}
							}
							retries--;
							if (retries > 0) {
								await new Promise((resolve) => setTimeout(resolve, 2000)); // Aguardar 2s antes de tentar novamente
							}
						}

						if (!updatedLead?.imagensConvertidas || updatedLead.imagensConvertidas === "processed") {
							// Fallback para flag temporária se não conseguir buscar dados atualizados
							lead.imagensConvertidas = "processed";
							console.warn(
								`[useLeadBatchProcessor] Não foi possível obter URLs atualizadas para ${lead.nome}, usando fallback`,
							);
						}
					} catch (error) {
						console.error(`[useLeadBatchProcessor] Erro ao buscar dados atualizados para ${lead.nome}:`, error);
						lead.imagensConvertidas = "processed";
					}

					setStats((prev) => ({
						...prev,
						completedTasks: {
							...prev.completedTasks,
							imagesGenerated: prev.completedTasks.imagesGenerated + 1,
						},
					}));
					console.log(`[useLeadBatchProcessor] Imagens geradas com sucesso para ${lead.nome}`);

					// Atualizar lista na interface
					if (onUpdate) {
						onUpdate();
					}
				}
			} catch (error) {
				console.error(`[useLeadBatchProcessor] Erro ao gerar imagens para ${lead.nome}:`, error);
				toast.error(`Falha ao gerar imagens para o lead: ${lead.nome}`);
			}
		}

		// Pequeno delay para garantir que o processo seja finalizado
		await new Promise((resolve) => setTimeout(resolve, 1000));
	};

	// Passo 3: Execução com Intervenção do Usuário
	const executeManualTasks = async (queues: ProcessingQueue) => {
		console.log("[useLeadBatchProcessor] Iniciando tarefas manuais...");
		console.log("[useLeadBatchProcessor] Filas recebidas para tarefas manuais:", {
			manuscriptProcessing: queues.manuscriptProcessing.map((l) => l.nome),
			mirrorProcessing: queues.mirrorProcessing.map((l) => l.nome),
		});

		// Atualizar o estado das filas ANTES de definir o step
		setProcessingQueues(queues);

		// Primeiro processar manuscritos
		if (queues.manuscriptProcessing.length > 0) {
			console.log(
				"[useLeadBatchProcessor] Definindo step como manuscript para",
				queues.manuscriptProcessing.length,
				"leads",
			);
			setCurrentStep("manuscript");
			setProgress({ current: 0, total: queues.manuscriptProcessing.length });
			return; // O usuário vai interagir
		}

		console.log("[useLeadBatchProcessor] Nenhum manuscrito pendente. Encerrando batch nesta etapa.");
		finishProcessing();
	};

	// Passo 4: Análise Preliminar
	const executePreliminaryAnalysis = async (leadsToAnalyze: ExtendedLead[]) => {
		if (leadsToAnalyze.length === 0) {
			finishProcessing();
			return;
		}

		console.log("[useLeadBatchProcessor] Executando análise preliminar...");
		setCurrentStep("preliminary-analysis");
		setShowAutomatedDialog(true);

		// Buscar dados atualizados dos leads antes de processar
		const updatedLeads: ExtendedLead[] = [];
		for (const lead of leadsToAnalyze) {
			try {
				const response = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`);
				if (response.ok) {
					const updatedLead = await response.json();
					updatedLeads.push(updatedLead);
					console.log(`[useLeadBatchProcessor] ✅ Dados atualizados para ${lead.nome}:`, {
						provaManuscrita: !!updatedLead.provaManuscrita,
						textoDOEspelho: !!updatedLead.textoDOEspelho,
						analisePreliminar: !!updatedLead.analisePreliminar,
					});
				} else {
					console.warn(
						`[useLeadBatchProcessor] Falha ao buscar dados atualizados para ${lead.nome}, usando dados originais`,
					);
					updatedLeads.push(lead);
				}
			} catch (error) {
				console.warn(`[useLeadBatchProcessor] Erro ao buscar dados para ${lead.nome}:`, error);
				updatedLeads.push(lead);
			}
		}

		// Filtrar apenas leads que realmente podem ser analisados
		const validLeadsForAnalysis = updatedLeads.filter(
			(lead) => !lead.analisePreliminar && lead.provaManuscrita && lead.textoDOEspelho,
		);

		if (validLeadsForAnalysis.length === 0) {
			console.log("[useLeadBatchProcessor] Nenhum lead válido para análise após verificação");
			setShowAutomatedDialog(false);
			finishProcessing();
			return;
		}

		console.log(
			`[useLeadBatchProcessor] Processando análise para ${validLeadsForAnalysis.length} leads válidos:`,
			validLeadsForAnalysis.map((l) => l.nome),
		);

		for (let i = 0; i < validLeadsForAnalysis.length; i++) {
			const lead = validLeadsForAnalysis[i];
			setCurrentProcessingLead(lead);
			setProgress({ current: i, total: validLeadsForAnalysis.length });

			// Criar conexão SSE apenas quando necessário
			createSSEConnection(lead.id);

			// Iniciar health check se for a primeira conexão
			if (sseConnections.size === 0) {
				startConnectionHealthCheck();
			}

			// Adicionar lead à lista de processamento para monitoramento SSE
			setLeadsBeingProcessed((prev) => new Set(prev.add(lead.id)));
			setLeadProcessingTimestamps((prev) => new Map(prev.set(lead.id, Date.now())));

			try {
				console.log(`[useLeadBatchProcessor] Enviando para análise: ${lead.nome}`);

				// Mostrar toast informativo sobre o processamento
				toast.info(`🔄 Análise de "${lead.nome}" enviada para processamento`, {
					description: "Aguardando resposta do sistema de análise...",
					duration: 3000,
				});

				const response = await fetch(`/api/admin/leads-chatwit/enviar-analise`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ leadId: lead.id }),
				});

				if (response.ok) {
					console.log(`[useLeadBatchProcessor] ✅ Análise de ${lead.nome} enviada com sucesso!`);
					// Nota: As estatísticas serão atualizadas via SSE quando a análise for concluída
				} else {
					const errorData = await response.json();

					// Remover da lista de processamento em caso de erro
					setLeadsBeingProcessed((prev) => {
						const newSet = new Set(prev);
						newSet.delete(lead.id);
						return newSet;
					});

					throw new Error(errorData.error || `Erro ${response.status} ao enviar análise`);
				}
			} catch (error: any) {
				console.error(`[useLeadBatchProcessor] Erro na análise para ${lead.nome}:`, error);

				// Remover da lista de processamento em caso de erro
				setLeadsBeingProcessed((prev) => {
					const newSet = new Set(prev);
					newSet.delete(lead.id);
					return newSet;
				});

				toast.error(`Falha na análise preliminar para ${lead.nome}: ${error.message}`);
			}
		}

		setShowAutomatedDialog(false);

		// Atualizar lista de leads imediatamente para mostrar estado "aguardando" nos botões
		if (onUpdate) {
			console.log("[useLeadBatchProcessor] Análises enviadas - atualizando lista para mostrar estado de aguardando...");
			onUpdate();
		}

		// Mostrar resultado da análise
		const totalAnalises = validLeadsForAnalysis.length;
		let sucessos = 0;

		// Contar sucessos baseado nos logs
		setStats((prev) => {
			sucessos = prev.completedTasks.analysisCompleted;
			return prev;
		});

		setTimeout(() => {
			setStats((currentStats) => {
				const finalSucessos = currentStats.completedTasks.analysisCompleted;
				if (finalSucessos === totalAnalises) {
					toast.success(
						`✅ Análise preliminar enviada com sucesso para ${totalAnalises} lead${totalAnalises > 1 ? "s" : ""}!`,
						{ duration: 6000 },
					);
				} else {
					toast.warning(
						`⚠️ Análise concluída com ${finalSucessos}/${totalAnalises} sucessos. Verifique os erros acima.`,
						{ duration: 8000 },
					);
				}
				return currentStats;
			});
		}, 100);

		finishProcessing();
	};

	async function mapConcurrent<T>(
		items: T[],
		limit: number,
		fn: (item: T, index: number) => Promise<void>,
	): Promise<Array<{ index: number; error: unknown }>> {
		const errors: Array<{ index: number; error: unknown }> = [];
		let nextIndex = 0;

		async function worker() {
			while (true) {
				const currentIndex = nextIndex++;
				if (currentIndex >= items.length) {
					return;
				}

				try {
					await fn(items[currentIndex], currentIndex);
				} catch (error) {
					errors.push({ index: currentIndex, error });
				}
			}
		}

		await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
		return errors;
	}

	const buildManuscriptPayload = (lead: ExtendedLead, selectedImages: string[]) => ({
		leadID: lead.id,
		nome: lead.nome || "Lead sem nome",
		telefone: lead.phoneNumber,
		manuscrito: true,
		selectedProvider: "GEMINI" as const,
		priority: 10,
		arquivos:
			lead.arquivos?.map((arquivo: any) => ({
				id: arquivo.id,
				url: arquivo.dataUrl,
				tipo: arquivo.fileType,
				nome: arquivo.fileType,
			})) || [],
		arquivos_pdf: lead.pdfUnificado
			? [
					{
						id: lead.id,
						url: lead.pdfUnificado,
						nome: "PDF Unificado",
					},
				]
			: [],
		arquivos_imagens_manuscrito: selectedImages.map((url: string, index: number) => ({
			id: `${lead.id}-manuscrito-${index}`,
			url,
			nome: `Manuscrito ${index + 1}`,
			page: index + 1,
		})),
		metadata: {
			leadUrl: lead.leadUrl,
			sourceId: lead.sourceId,
			concluido: lead.concluido,
			fezRecurso: lead.fezRecurso,
		},
	});

	const dispatchCollectedManuscripts = async () => {
		const dispatchItems: ManuscriptDispatchItem[] = processingQueues.manuscriptProcessing.flatMap((lead) => {
			const selectedImages = collectedData.get(lead.id)?.manuscrito?.selectedImages || [];
			return selectedImages.length > 0 ? [{ lead, selectedImages }] : [];
		});
		const skippedCount = processingQueues.manuscriptProcessing.length - dispatchItems.length;

		if (dispatchItems.length === 0) {
			if (skippedCount > 0) {
				toast.warning(
					`${skippedCount} lead${skippedCount > 1 ? "s foram" : " foi"} pulado${skippedCount > 1 ? "s" : ""} na etapa de digitação.`,
				);
			}
			return;
		}

		console.log(
			`[useLeadBatchProcessor] Enfileirando ${dispatchItems.length} manuscritos com concorrência ${batchDispatchConcurrency}`,
		);

		if (sseConnections.size === 0) {
			startConnectionHealthCheck();
		}

		let completedDispatches = 0;
		setCurrentStep("dispatching-manuscripts");
		setShowAutomatedDialog(true);
		setProgress({ current: 0, total: dispatchItems.length });

		const errors = await mapConcurrent(dispatchItems, batchDispatchConcurrency, async ({ lead, selectedImages }, index) => {
			setCurrentProcessingLead(lead);
			createSSEConnection(lead.id);
			setLeadsBeingProcessed((prev) => {
				const newSet = new Set(prev);
				newSet.add(lead.id);
				return newSet;
			});
			setLeadProcessingTimestamps((prev) => {
				const newMap = new Map(prev);
				newMap.set(lead.id, Date.now());
				return newMap;
			});

			const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(buildManuscriptPayload(lead, selectedImages)),
			});

			if (!response.ok) {
				removeLeadFromTracking(lead.id);
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || `Erro ao enfileirar digitação para ${lead.nome || lead.id}`);
			}

			completedDispatches += 1;
			setProgress({ current: completedDispatches, total: dispatchItems.length });
			setStats((prev) => ({
				...prev,
				completedTasks: {
					...prev.completedTasks,
					manuscriptsProcessed: prev.completedTasks.manuscriptsProcessed + 1,
				},
			}));

			console.log(
				`[useLeadBatchProcessor] ✅ Digitação enfileirada para ${lead.nome || lead.id} (${index + 1}/${dispatchItems.length})`,
			);
		});

		if (onUpdate) {
			setTimeout(() => onUpdate(), 500);
		}

		if (skippedCount > 0) {
			toast.warning(
				`${skippedCount} lead${skippedCount > 1 ? "s foram" : " foi"} pulado${skippedCount > 1 ? "s" : ""} porque nenhuma imagem foi selecionada.`,
				{ duration: 6000 },
			);
		}

		if (errors.length > 0) {
			toast.warning(
				`${errors.length} lead${errors.length > 1 ? "s falharam" : " falhou"} ao entrar na fila de digitação.`,
				{ duration: 8000 },
			);
		}

		toast.success(
			`Digitação enviada em lote: ${dispatchItems.length - errors.length}/${dispatchItems.length} leads aceitos na fila.`,
			{ duration: 6000 },
		);
	};

	const finishProcessing = () => {
		console.log("[useLeadBatchProcessor] Processamento concluído");

		setStats((prev) => {
			const finalStats = { ...prev, skippedAnalysis: [] };
			console.log("[useLeadBatchProcessor] Stats finais:", finalStats);
			return finalStats;
		});
		setShowAutomatedDialog(false);
		setCurrentStep("done");

		// Atualizar lista de leads para refletir mudanças nos botões
		if (onUpdate) {
			console.log("[useLeadBatchProcessor] Atualizando lista de leads...");
			onUpdate();
		}

		toast.success("Fluxo em lote concluído até a etapa de digitação das provas.");
	};

	const handleManuscriptSubmit = async (leadId: string, data: ManuscritoData) => {
		console.log("[useLeadBatchProcessor] Manuscrito submetido para lead:", leadId, data);

		const currentData = collectedData.get(leadId) || {};
		collectedData.set(leadId, { ...currentData, manuscrito: data });
		setCollectedData(new Map(collectedData));

		// Verificar se há mais manuscritos para processar
		const hasMoreManuscripts = currentManualLeadIndex < processingQueues.manuscriptProcessing.length - 1;

		if (hasMoreManuscripts) {
			// Há mais manuscritos - avançar para o próximo
			console.log(
				`[useLeadBatchProcessor] Avançando para próximo manuscrito (${currentManualLeadIndex + 1}/${processingQueues.manuscriptProcessing.length})`,
			);
			const nextIndex = currentManualLeadIndex + 1;
			setCurrentManualLeadIndex(nextIndex);
			setProgress({ current: nextIndex, total: processingQueues.manuscriptProcessing.length });

			// Mostrar toast de sucesso individual
			const currentLeadName = leads.find((l) => l.id === leadId)?.nome || "Lead";
			if (data.selectedImages.length > 0) {
				toast.success(`Seleção de ${currentLeadName} salva. Continuando para o próximo...`);
			} else {
				toast.warning(`${currentLeadName} foi pulado. Continuando para o próximo...`);
			}

			// Em modo batch, não permitir que o ImageGalleryDialog feche
			// O diálogo vai se atualizar automaticamente para o próximo lead
		} else {
			const totalManuscritos = processingQueues.manuscriptProcessing.length;

			toast.info(
				`Seleção concluída para ${totalManuscritos} lead${totalManuscritos > 1 ? "s" : ""}. Enfileirando digitações em paralelo...`,
				{ duration: 4000 },
			);

			await dispatchCollectedManuscripts();
			finishProcessing();
		}
	};

	const handleMirrorSubmit = async (leadId: string, data: EspelhoData) => {
		console.log("[useLeadBatchProcessor] Espelho submetido para lead:", leadId, data);

		// Criar conexão SSE apenas quando necessário
		createSSEConnection(leadId);

		// Iniciar health check se for a primeira conexão
		if (sseConnections.size === 0) {
			startConnectionHealthCheck();
		}

		// Adicionar lead à lista de processamento para monitoramento SSE
		setLeadsBeingProcessed((prev) => new Set(prev.add(leadId)));
		setLeadProcessingTimestamps((prev) => new Map(prev.set(leadId, Date.now())));

		// Enviar espelho para o sistema externo
		try {
			const lead = leads.find((l) => l.id === leadId);
			if (!lead) {
				console.error("Lead não encontrado:", leadId);
				return;
			}

			const payload = {
				leadID: lead.id,
				nome: lead.nome || "Lead sem nome",
				telefone: lead.phoneNumber,
				espelho: true,
				arquivos:
					lead.arquivos?.map((a: any) => ({
						id: a.id,
						url: a.dataUrl,
						tipo: a.fileType,
						nome: a.fileType,
					})) || [],
				arquivos_pdf: lead.pdfUnificado
					? [
							{
								id: lead.id,
								url: lead.pdfUnificado,
								nome: "PDF Unificado",
							},
						]
					: [],
				arquivos_imagens_espelho: data.selectedImages.map((url: string, index: number) => ({
					id: `${lead.id}-espelho-${index}`,
					url: url,
					nome: `Espelho ${index + 1}`,
				})),
				metadata: {
					leadUrl: lead.leadUrl,
					sourceId: lead.sourceId,
					concluido: lead.concluido,
					fezRecurso: lead.fezRecurso,
				},
			};

			const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao enviar espelho");
			}

			console.log(`[useLeadBatchProcessor] Espelho de ${lead.nome} enviado com sucesso!`);

			// Mostrar toast informativo sobre o processamento
			toast.info(`🔄 Espelho de "${lead.nome}" enviado para processamento`, {
				description: "Aguardando resposta do sistema de correção...",
				duration: 3000,
			});

			// Atualizar lista imediatamente para mostrar estado "aguardando" no botão
			if (onUpdate) {
				setTimeout(() => onUpdate(), 500); // Small delay para garantir que o estado foi atualizado no servidor
			}
		} catch (error: any) {
			console.error(`[useLeadBatchProcessor] Erro ao enviar espelho:`, error);

			// Remover da lista de processamento em caso de erro
			setLeadsBeingProcessed((prev) => {
				const newSet = new Set(prev);
				newSet.delete(leadId);
				return newSet;
			});

			throw error; // Re-throw para ser tratado pelo ImageGalleryDialog
		}

		const currentData = collectedData.get(leadId) || {};
		collectedData.set(leadId, { ...currentData, espelho: data });
		setCollectedData(new Map(collectedData));

		setStats((prev) => ({
			...prev,
			completedTasks: {
				...prev.completedTasks,
				mirrorsProcessed: prev.completedTasks.mirrorsProcessed + 1,
			},
		}));

		// Verificar se há mais espelhos para processar
		const hasMoreMirrors = currentManualLeadIndex < processingQueues.mirrorProcessing.length - 1;

		if (hasMoreMirrors) {
			// Há mais espelhos - avançar para o próximo
			console.log(
				`[useLeadBatchProcessor] Avançando para próximo espelho (${currentManualLeadIndex + 1}/${processingQueues.mirrorProcessing.length})`,
			);
			setCurrentManualLeadIndex((prev) => prev + 1);
			setProgress((prev) => ({ ...prev, current: prev.current + 1 }));

			// NÃO fechar o modal - vamos continuar com o próximo
			// Mostrar toast de sucesso individual
			const currentLeadName = leads.find((l) => l.id === leadId)?.nome || "Lead";
			toast.success(`✅ Espelho de ${currentLeadName} enviado! Continuando para o próximo...`);

			// Em modo batch, não permitir que o ImageGalleryDialog feche
			// O diálogo vai se atualizar automaticamente para o próximo lead
		} else {
			// Terminaram espelhos - mostrar feedback
			const totalEspelhos = processingQueues.mirrorProcessing.length;
			const temAnalises = processingQueues.preliminaryAnalysis.length > 0;

			let message = `✅ Espelhos de correção enviados com sucesso para ${totalEspelhos} lead${totalEspelhos > 1 ? "s" : ""}!`;

			if (temAnalises) {
				message += `\n\n📊 Próximo passo: Análise preliminar automática (${processingQueues.preliminaryAnalysis.length} lead${processingQueues.preliminaryAnalysis.length > 1 ? "s" : ""})`;
				message += "\n\n⏰ Continue o processo quando estiver pronto.";

				toast.info(message, { duration: 8000 });

				// Se há análises pendentes, mostrar botão para continuar
				setShowContinueButton(true);
				// Reset do índice para a análise
				setCurrentManualLeadIndex(0);
			} else {
				message += "\n\n🎉 Processo concluído!";

				toast.success(message, { duration: 6000 });

				// Atualizar lista de leads para refletir mudanças nos botões
				if (onUpdate) {
					console.log("[useLeadBatchProcessor] Espelhos concluídos - atualizando lista de leads...");
					onUpdate();
				}
			}

			// Fechar o modal temporariamente para dar feedback
			setIsOpen(false);
		}
	};

	console.log("[useLeadBatchProcessor] Estado atual:", {
		isOpen,
		currentStep,
		progress,
		currentLead: currentLead?.nome,
		showAutomatedDialog,
		currentProcessingLead: currentProcessingLead?.nome,
		sseConnections: sseConnections.size,
		leadsBeingProcessed: Array.from(leadsBeingProcessed),
	});

	return {
		isOpen,
		currentStep,
		progress,
		currentLead,
		start,
		close,
		continueProcess,
		handleManuscriptSubmit,
		handleMirrorSubmit,
		// Novos dados para orquestração
		processingQueues,
		stats,
		showAutomatedDialog,
		showContinueButton,
		currentProcessingLead,
		// Estados SSE
		sseConnections: sseConnections.size,
		leadsBeingProcessed: Array.from(leadsBeingProcessed),
		createSSEConnection,
		closeSSEConnection,
		closeAllSSEConnections,
	};
};
