/**
 * Hook para monitorar progresso de transcrição via SSE
 * Conecta-se ao SSE e escuta eventos de progresso de digitação
 */

import { useEffect, useState, useCallback } from "react";
import type { TranscriptionEvent } from "@/lib/oab-eval/transcription-queue";

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

		const handleConnectionStatus = async (event: Event) => {
			const customEvent = event as CustomEvent<{ status?: string }>;
			if (customEvent.detail?.status !== "disconnected") {
				return;
			}

			try {
				const response = await fetch(`/api/admin/leads-chatwit/operations/status?leadId=${encodeURIComponent(leadID)}&stage=transcription`);
				if (!response.ok) return;
				const operation = await response.json();
				if (operation.status === "completed") {
					setStatus({
						leadID,
						status: "completed",
						percentage: 100,
					});
				} else if (operation.status === "failed" || operation.status === "inconsistent") {
					setStatus({
						leadID,
						status: "failed",
						error: operation.error || operation.message || "Falha ao consultar status da transcrição.",
					});
				}
			} catch (error) {
				console.error("[useTranscriptionProgress] ❌ Erro ao consultar status:", error);
			}
		};

		window.addEventListener("lead-notification", handleLeadNotification as EventListener);
		window.addEventListener("lead-operations-connection", handleConnectionStatus as EventListener);

		return () => {
			console.log("[useTranscriptionProgress] 🔌 Removendo listeners centralizados");
			window.removeEventListener("lead-notification", handleLeadNotification as EventListener);
			window.removeEventListener("lead-operations-connection", handleConnectionStatus as EventListener);
		};
	}, [leadID, enabled, handleSSEMessage]);

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
