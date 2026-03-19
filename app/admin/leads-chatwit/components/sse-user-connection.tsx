"use client";

import { useEffect, useRef } from "react";
import type { LeadChatwit } from "../types";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

interface SSEUserConnectionProps {
	onLeadUpdate: (lead: LeadChatwit) => void;
	onForceRefresh?: () => void;
}

/**
 * Conexão SSE persistente por usuário.
 * Abre 1 EventSource ao montar, fecha ao desmontar.
 * Usa refs para callbacks — NUNCA reconecta por causa de re-render do parent.
 */
export function SSEUserConnection({ onLeadUpdate, onForceRefresh }: SSEUserConnectionProps) {
	// Refs estáveis para callbacks — evita reconexão no re-render
	const onLeadUpdateRef = useRef(onLeadUpdate);
	const onForceRefreshRef = useRef(onForceRefresh);
	onLeadUpdateRef.current = onLeadUpdate;
	onForceRefreshRef.current = onForceRefresh;

	useEffect(() => {
		let eventSource: EventSource | null = null;
		let reconnectTimeout: NodeJS.Timeout | null = null;
		let reconnectAttempt = 0;
		let hasConnectedOnce = false;
		let isMounted = true;

		function connect() {
			if (!isMounted) return;

			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}

			console.log("[SSE User] Conectando...");
			eventSource = new EventSource("/api/admin/leads-chatwit/notifications");

			eventSource.onopen = () => {
				console.log("[SSE User] Conectado.");
				window.dispatchEvent(
					new CustomEvent("lead-operations-connection", {
						detail: { status: "connected", timestamp: new Date().toISOString() },
					}),
				);
				const wasReconnect = hasConnectedOnce || reconnectAttempt > 0;
				hasConnectedOnce = true;
				reconnectAttempt = 0;

				if (wasReconnect) {
					console.log("[SSE User] Reconectado. Nenhum refresh automático será disparado.");
				}
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					window.dispatchEvent(
						new CustomEvent("lead-sse-message", {
							detail: data,
						}),
					);

					if (data.type === "error") {
						console.error("[SSE User] Erro:", data.message);
						return;
					}
					if (data.type === "connected" || data.type === "connection") {
						return;
					}

					const notificationData = data.data || data;
					const leadId = data.leadId || notificationData.leadId || notificationData.leadData?.id;

					window.dispatchEvent(
						new CustomEvent("lead-notification", {
							detail: {
								leadId,
								notification: notificationData,
								raw: data,
							},
						}),
					);

					if (notificationData.type === "leadUpdate" && notificationData.leadData) {
						const leadData = notificationData.leadData;
						console.log(`[SSE User] Lead ${leadData.id} atualizado`);
						window.dispatchEvent(
							new CustomEvent("lead-update", {
								detail: {
									leadId: leadData.id,
									leadData,
									notification: notificationData,
								},
							}),
						);
						onLeadUpdateRef.current(leadData);

						window.dispatchEvent(new CustomEvent("leads-waiting-update"));

						const leadName = leadData.name || leadData.nomeReal || "Lead";
						const isProvaComplete = leadData.manuscritoProcessado && !leadData.aguardandoManuscrito;
						const isEspelhoComplete = leadData.espelhoProcessado && !leadData.aguardandoEspelho;
						const isAnaliseComplete = leadData.analiseProcessada && !leadData.aguardandoAnalise;

						const refreshAction = onForceRefreshRef.current
							? {
									label: (
										<div className="flex items-center gap-1">
											<RefreshCw className="h-3 w-3" />
											Atualizar
										</div>
									),
									onClick: () => onForceRefreshRef.current?.(),
								}
							: undefined;

						const isPdfUnificado = !!leadData.pdfUnificado;

						if (isPdfUnificado) {
							toast.success("PDF unificado", {
								description: `Arquivos de "${leadName}" foram unificados com sucesso`,
								duration: 5000,
								action: refreshAction,
							});
						} else if (isProvaComplete) {
							toast.success("Prova processada", {
								description: `"${leadName}" está pronto para visualização`,
								duration: 8000,
								action: refreshAction,
							});
						} else if (isEspelhoComplete) {
							toast.success("Espelho processado", {
								description: `"${leadName}" está pronto para consulta`,
								duration: 8000,
								action: refreshAction,
							});
						} else if (isAnaliseComplete) {
							toast.success("Análise processada", {
								description: `"${leadName}" está pronta para visualização`,
								duration: 8000,
								action: refreshAction,
							});
						}
					} else if (notificationData.type === "leadOperation") {
						window.dispatchEvent(
							new CustomEvent("lead-operation", {
								detail: notificationData,
							}),
						);

						if (notificationData.status === "processingRetry") {
							toast.info("Processamento retomado", {
								description: notificationData.message || "O worker retomou a operação automaticamente.",
								duration: 5000,
							});
						}
					}
				} catch (error) {
					console.error("[SSE User] Erro ao processar mensagem:", error);
				}
			};

			eventSource.onerror = () => {
				console.error("[SSE User] Erro na conexão.");
				window.dispatchEvent(
					new CustomEvent("lead-operations-connection", {
						detail: { status: "disconnected", timestamp: new Date().toISOString() },
					}),
				);
				if (!isMounted) return;

				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}

				const delay = Math.min(5000 * 2 ** reconnectAttempt, 60000);
				reconnectAttempt++;

				console.log(`[SSE User] Reconectando em ${delay / 1000}s (tentativa ${reconnectAttempt})...`);

				reconnectTimeout = setTimeout(() => {
					if (isMounted) connect();
				}, delay);
			};
		}

		connect();

		return () => {
			isMounted = false;
			if (reconnectTimeout) clearTimeout(reconnectTimeout);
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
			console.log("[SSE User] Desconectado (unmount).");
		};
	}, []); // ← sem dependências — roda uma vez, nunca reconecta por re-render

	return null;
}
