/**
 * Hook para monitorar progresso de transcrição via SSE
 * Conecta-se ao SSE e escuta eventos de progresso de digitação
 */

import { useEffect, useState, useCallback } from "react";
import type { TranscriptionEvent } from "@/lib/oab-eval/transcription-queue";
import { useLeadOperationStatus } from "./useLeadOperationStatus";

export interface TranscriptionStatus {
	leadID: string;
	status: "idle" | "queued" | "processing" | "completed" | "failed";
	currentPage?: number;
	totalPages?: number;
	percentage?: number;
	estimatedTimeRemaining?: number; // segundos
	position?: number; // posição na fila
	error?: string;
	startedAt?: string;
}

interface UseTranscriptionProgressOptions {
	leadID: string;
	enabled?: boolean;
	onComplete?: (result: any) => void;
	onError?: (error: string) => void;
}

export function useTranscriptionProgress({
	leadID,
	enabled = true,
	onComplete,
	onError,
}: UseTranscriptionProgressOptions) {
	const [status, setStatus] = useState<TranscriptionStatus>({
		leadID,
		status: "idle",
	});

	const [history, setHistory] = useState<TranscriptionEvent[]>([]);
	const { operation } = useLeadOperationStatus({
		leadId: leadID,
		stage: "transcription",
		enabled: enabled && !!leadID,
	});

	const handleSSEMessage = useCallback(
		(event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);

				// Verificar se é evento de transcrição
				if (data.category !== "transcription" || data.data?.leadID !== leadID) {
					return;
				}

				const transcriptionEvent = data.data.event as TranscriptionEvent;

				// Adicionar ao histórico
				setHistory((prev) => [...prev, transcriptionEvent]);

				console.log("[useTranscriptionProgress] Evento recebido:", transcriptionEvent);

				// Atualizar status baseado no tipo de evento
				switch (transcriptionEvent.type) {
					case "queued":
						setStatus({
							leadID,
							status: "queued",
							position: transcriptionEvent.position,
						});
						break;

					case "started":
						setStatus({
							leadID,
							status: "processing",
							totalPages: transcriptionEvent.totalPages,
							startedAt: transcriptionEvent.startedAt,
							currentPage: 0,
							percentage: 0,
						});
						break;

					case "page-complete":
						setStatus((prev) => ({
							...prev,
							leadID,
							status: "processing",
							currentPage: transcriptionEvent.page,
							totalPages: transcriptionEvent.totalPages,
							percentage: transcriptionEvent.percentage,
							estimatedTimeRemaining: transcriptionEvent.estimatedTimeRemaining,
						}));
						break;

					case "completed":
						setStatus({
							leadID,
							status: "completed",
							percentage: 100,
						});
						if (onComplete) {
							onComplete(transcriptionEvent.result);
						}
						break;

					case "failed":
						setStatus({
							leadID,
							status: "failed",
							error: transcriptionEvent.error,
						});
						if (onError) {
							onError(transcriptionEvent.error);
						}
						break;
				}
			} catch (error) {
				console.error("[useTranscriptionProgress] Erro ao processar mensagem SSE:", error);
			}
		},
		[leadID, onComplete, onError],
	);

	useEffect(() => {
		if (!enabled || !leadID) {
			return;
		}

		console.log("[useTranscriptionProgress] 🎧 Escutando eventos centralizados para lead:", leadID);

		const handleLeadNotification = (event: Event) => {
			const customEvent = event as CustomEvent<{
				leadId?: string;
				notification?: { category?: string; event?: TranscriptionEvent };
			}>;

			if (customEvent.detail?.leadId !== leadID) {
				return;
			}

			if (customEvent.detail?.notification?.category !== "transcription" || !customEvent.detail.notification.event) {
				return;
			}

			handleSSEMessage({
				data: JSON.stringify({
					category: "transcription",
					data: {
						leadID,
						event: customEvent.detail.notification.event,
					},
				}),
			} as MessageEvent);
		};

		window.addEventListener("lead-notification", handleLeadNotification as EventListener);

		return () => {
			console.log("[useTranscriptionProgress] 🔌 Removendo listeners centralizados");
			window.removeEventListener("lead-notification", handleLeadNotification as EventListener);
		};
	}, [leadID, enabled, handleSSEMessage]);

	useEffect(() => {
		if (!operation) {
			return;
		}

		if (operation.status === "queued") {
			setStatus((prev) => ({
				...prev,
				leadID,
				status: "queued",
				position:
					typeof operation.progress === "object" && operation.progress && "position" in operation.progress
						? Number((operation.progress as { position?: number }).position)
						: prev.position,
			}));
			return;
		}

		if (operation.status === "processing" && typeof operation.progress === "object" && operation.progress) {
			const progress = operation.progress as {
				currentPage?: number;
				totalPages?: number;
				percentage?: number;
				estimatedTimeRemaining?: number;
			};

			setStatus((prev) => ({
				...prev,
				leadID,
				status: "processing",
				currentPage: progress.currentPage ?? prev.currentPage,
				totalPages: progress.totalPages ?? prev.totalPages,
				percentage: progress.percentage ?? prev.percentage ?? 0,
				estimatedTimeRemaining: progress.estimatedTimeRemaining ?? prev.estimatedTimeRemaining,
			}));
			return;
		}

		if (operation.status === "completed") {
			setStatus({
				leadID,
				status: "completed",
				percentage: 100,
			});
			return;
		}

		if (
			operation.status === "failed" ||
			operation.status === "canceled" ||
			operation.status === "inconsistent"
		) {
			const errorMessage =
				operation.error ||
				operation.message ||
				(operation.status === "canceled"
					? "A transcrição foi cancelada."
					: "Falha ao consultar status da transcrição.");

			setStatus({
				leadID,
				status: "failed",
				error: errorMessage,
			});

			onError?.(errorMessage);
		}
	}, [leadID, onError, operation]);

	const reset = useCallback(() => {
		setStatus({
			leadID,
			status: "idle",
		});
		setHistory([]);
	}, [leadID]);

	return {
		status,
		history,
		reset,
		isProcessing: status.status === "processing" || status.status === "queued",
		isCompleted: status.status === "completed",
		isFailed: status.status === "failed",
	};
}
