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

		console.log("[useTranscriptionProgress] 🎧 Conectando ao SSE para lead:", leadID);

		const eventSource = new EventSource(`/api/admin/leads-chatwit/sse?leadId=${leadID}`);

		eventSource.onmessage = handleSSEMessage;

		eventSource.onerror = (error) => {
			console.error("[useTranscriptionProgress] ❌ Erro no SSE:", error);

			// Tentar reconectar após 3 segundos
			setTimeout(() => {
				console.log("[useTranscriptionProgress] 🔄 Tentando reconectar...");
				eventSource.close();
			}, 3000);
		};

		eventSource.addEventListener("connection", (event: any) => {
			console.log("[useTranscriptionProgress] ✅ Conectado ao SSE:", event.data);
		});

		return () => {
			console.log("[useTranscriptionProgress] 🔌 Desconectando do SSE");
			eventSource.close();
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
