// app/admin/leads-chatwit/components/batch-processor/BatchProcessorOrchestrator.tsx

"use client";

import { useLeadBatchProcessor } from "./useLeadBatchProcessor";
import { AutomatedProgressDialog } from "./AutomatedProgressDialog";
import { ImageGalleryDialog } from "../image-gallery-dialog";
import { BatchCompletionDialog } from "./BatchCompletionDialog";
import { TurboModeIndicator } from "./TurboModeIndicator";
import type { ExtendedLead } from "../../types";
import { useEffect, useRef, useState } from "react";
import { useTurboMode } from "./useTurboMode";

type BatchProcessorOrchestratorProps = {
	leads: ExtendedLead[];
	onClose?: () => void;
	onUpdate?: () => void;
};

export function BatchProcessorOrchestrator({ leads, onClose, onUpdate }: BatchProcessorOrchestratorProps) {
	console.log("[BatchProcessorOrchestrator] Inicializando com leads:", leads.length);

	const hasStarted = useRef(false);

	// TURBO mode integration
	const { turboModeEnabled, hasAccess, turboModeConfig, checkAccess, turboModeMetrics } = useTurboMode();

	// Helper para buscar imagens convertidas
	const getConvertedImages = async (lead: any): Promise<string[]> => {
		if (!lead.imagensConvertidas) {
			return [];
		}

		try {
			// Verificar se é um JSON válido, caso contrário tentar buscar imagens atualizadas
			if (lead.imagensConvertidas === "processed" || lead.imagensConvertidas === "pending") {
				console.log("[BatchProcessorOrchestrator] Status de processamento detectado, buscando imagens...");
				// Tentar buscar imagens atualizadas
				try {
					const response = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`);
					if (response.ok) {
						const updatedLead = await response.json();
						if (updatedLead.imagensConvertidas && updatedLead.imagensConvertidas !== "processed") {
							const images = JSON.parse(updatedLead.imagensConvertidas);
							console.log("[BatchProcessorOrchestrator] Imagens atualizadas encontradas:", images.length);
							return images;
						}
					}
				} catch (error) {
					console.error("[BatchProcessorOrchestrator] Erro ao buscar imagens atualizadas:", error);
				}
				return [];
			} else {
				return JSON.parse(lead.imagensConvertidas);
			}
		} catch (error) {
			console.error("Erro ao processar URLs de imagens convertidas:", error);
			return [];
		}
	};

	const {
		isOpen,
		currentStep,
		currentLead,
		progress,
		start,
		close,
		handleManuscriptSubmit,
		handleMirrorSubmit,
		showAutomatedDialog,
		currentProcessingLead,
		stats,
		sseConnections,
		leadsBeingProcessed,
	} = useLeadBatchProcessor(leads, onUpdate, turboModeConfig, turboModeEnabled, (metrics) => {
		// Update TURBO mode metrics when received from the hook
		console.log("[BatchProcessorOrchestrator] TURBO mode metrics updated:", metrics);
	});

	console.log("[BatchProcessorOrchestrator] Estado do hook - isOpen:", isOpen, "currentStep:", currentStep);

	// Inicia o processo quando o componente é montado (apenas uma vez)
	useEffect(() => {
		if (!hasStarted.current) {
			console.log("[BatchProcessorOrchestrator] Componente montado, verificando TURBO mode e iniciando processo...");
			hasStarted.current = true;

			// Check TURBO mode access before starting
			checkAccess().then(() => {
				start();
			});
		}
	}, [checkAccess, start]);

	const handleCloseInternal = () => {
		console.log("[BatchProcessorOrchestrator] Fechamento interno chamado");
		close();
		// Notifica o pai imediatamente quando o usuário fecha
		if (onClose) {
			setTimeout(() => {
				onClose();
			}, 100);
		}
	};

	if (!isOpen) {
		console.log("[BatchProcessorOrchestrator] Não está aberto, retornando null");
		return null;
	}

	const renderDialog = () => {
		console.log("[BatchProcessorOrchestrator] Renderizando diálogo para step:", currentStep);

		// Passo 1: Análise inicial
		if (currentStep === "analyzing") {
			return (
				<AutomatedProgressDialog
					isOpen={true}
					progress={{ current: 0, total: 1 }}
					currentStep="analyzing"
					currentTask="Analisando estado dos leads"
				/>
			);
		}

		// Passo 2: Tarefas automatizadas
		if (
			showAutomatedDialog &&
			(
				currentStep === "unifying-pdf"
				|| currentStep === "generating-images"
				|| currentStep === "preliminary-analysis"
				|| currentStep === "dispatching-manuscripts"
			)
		) {
			return (
				<>
					{turboModeEnabled && (
						<TurboModeIndicator
							enabled={true}
							config={turboModeConfig || null}
							metrics={turboModeMetrics}
							currentStep={currentStep}
						/>
					)}
					<AutomatedProgressDialog
						isOpen={true}
						progress={progress}
						currentStep={currentStep}
						currentTask={
							currentStep === "dispatching-manuscripts"
								? "Enfileirando digitações em paralelo"
								: undefined
						}
						leadName={currentStep === "dispatching-manuscripts" ? undefined : currentProcessingLead?.nome}
						sseConnections={sseConnections}
						leadsBeingProcessed={leadsBeingProcessed}
						totalLeads={leads.length}
						turboModeEnabled={turboModeEnabled}
						turboModeConfig={turboModeConfig}
					/>
				</>
			);
		}

		// Passo 3: Tarefas manuais - Manuscrito
		if (currentStep === "manuscript") {
			if (!currentLead) {
				console.error("[BatchProcessorOrchestrator] currentLead é undefined no step manuscript");
				return null;
			}

			// Obter imagens convertidas do lead de forma simples
			let imagensConvertidas: string[] = [];
			if (currentLead.imagensConvertidas) {
				try {
					// Verificar se é um JSON válido, caso contrário usar array vazio
					if (currentLead.imagensConvertidas === "processed" || currentLead.imagensConvertidas === "pending") {
						console.log(
							"[BatchProcessorOrchestrator] Status de processamento detectado, usando array vazio temporariamente...",
						);
						imagensConvertidas = [];
					} else {
						imagensConvertidas = JSON.parse(currentLead.imagensConvertidas);
					}
				} catch (error) {
					console.error("Erro ao processar URLs de imagens convertidas:", error);
					imagensConvertidas = [];
				}
			}

			return (
				<ImageGalleryDialog
					key={currentLead.id}
					isOpen={true}
					onClose={handleCloseInternal}
					images={imagensConvertidas}
					title={`Manuscrito - ${currentLead.nome} (${progress.current + 1}/${progress.total})`}
					description="Selecione as imagens que serão enviadas para digitação do manuscrito deste lead. Selecione apenas as páginas que contêm texto manuscrito para digitação."
					leadId={currentLead.id}
					selectionMode={true}
					mode="prova"
					batchMode={true}
					onSendProva={async (selectedImages: string[]) => {
						await handleManuscriptSubmit(currentLead.id, { selectedImages });
					}}
				/>
			);
		}

		// Passo 3: Tarefas manuais - Espelho
		if (currentStep === "mirror") {
			if (!currentLead) {
				console.error("[BatchProcessorOrchestrator] currentLead é undefined no step mirror");
				return null;
			}

			// Obter imagens convertidas do lead de forma simples
			let imagensConvertidas: string[] = [];
			if (currentLead.imagensConvertidas) {
				try {
					// Verificar se é um JSON válido, caso contrário usar array vazio
					if (currentLead.imagensConvertidas === "processed" || currentLead.imagensConvertidas === "pending") {
						console.log(
							"[BatchProcessorOrchestrator] Status de processamento detectado, usando array vazio temporariamente...",
						);
						imagensConvertidas = [];
					} else {
						imagensConvertidas = JSON.parse(currentLead.imagensConvertidas);
					}
				} catch (error) {
					console.error("Erro ao processar URLs de imagens convertidas:", error);
					imagensConvertidas = [];
				}
			}

			return (
				<ImageGalleryDialog
					key={`${currentLead.id}-espelho`}
					isOpen={true}
					onClose={handleCloseInternal}
					images={imagensConvertidas}
					title={`Espelho - ${currentLead.nome} (${progress.current + 1}/${progress.total})`}
					description="Selecione as imagens do espelho de correção deste lead. Selecione apenas as páginas que mostram as correções da prova."
					leadId={currentLead.id}
					selectionMode={true}
					mode="espelho"
					batchMode={true}
					onSendEspelho={async (selectedImages: string[]) => {
						await handleMirrorSubmit(currentLead.id, { selectedImages });
					}}
				/>
			);
		}

		// Passo 5: Conclusão
		if (currentStep === "done") {
			return (
				<BatchCompletionDialog
					onClose={handleCloseInternal}
					count={leads.length}
					stats={stats}
					turboModeMetrics={turboModeMetrics}
				/>
			);
		}

		console.log("[BatchProcessorOrchestrator] Step desconhecido:", currentStep);
		return null;
	};

	console.log("[BatchProcessorOrchestrator] Renderizando componente");
	return renderDialog();
}
