"use client";

import { useEffect, useRef, useCallback } from "react";
import type { LeadChatwit } from "../types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface SSEConnectionManagerProps {
	leads: LeadChatwit[];
	onLeadUpdate: (lead: LeadChatwit) => void;
	onForceRefresh?: () => void; // Nova prop para refresh manual
}

export function SSEConnectionManager({ leads, onLeadUpdate, onForceRefresh }: SSEConnectionManagerProps) {
	const connectionsRef = useRef<Map<string, EventSource>>(new Map());
	const reconnectTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
	const isMountedRef = useRef(true);

	// Função para criar conexão SSE individual
	const createSSEConnection = useCallback(
		(leadId: string) => {
			console.log(`[SSE Manager] 🔌 Conectando SSE: ${leadId}`);

			// Fechar conexão existente se houver
			const existingConnection = connectionsRef.current.get(leadId);
			if (existingConnection) {
				existingConnection.close();
				connectionsRef.current.delete(leadId);
			}

			const eventSource = new EventSource(`/api/admin/leads-chatwit/notifications?leadId=${leadId}`);

			eventSource.onopen = () => {
				console.log(`[SSE Manager] ✅ Conectado: ${leadId}`);
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					if (data.type === "error") {
						console.error(`[SSE Manager] ❌ Erro SSE:`, data.message);
						return;
					}

					if (data.type === "connected") {
						return; // 🔇 Log silencioso para confirmações
					}

					// Tratar estrutura correta da notificação
					const notificationData = data.data || data; // Compatibilidade com ambas estruturas

					if (notificationData.type === "leadUpdate" && notificationData.leadData) {
						console.log(`[SSE Manager] 🔄 Atualizando lead ${leadId} com dados:`, notificationData.leadData);

						// ✅ Atualização não invasiva - apenas chamar o callback para atualizar estado local
						onLeadUpdate(notificationData.leadData);

						// Disparar evento para atualizar o indicador no header
						window.dispatchEvent(new CustomEvent("leads-waiting-update"));

						// 🎯 Toasts com botão de atualizar ao invés de refresh automático
						const leadName = notificationData.leadData.name || notificationData.leadData.nome || "Lead";
						const isProvaComplete =
							notificationData.leadData.manuscritoProcessado && !notificationData.leadData.aguardandoManuscrito;
						const isEspelhoComplete =
							notificationData.leadData.espelhoProcessado && !notificationData.leadData.aguardandoEspelho;
						const isAnaliseComplete =
							notificationData.leadData.analiseProcessada && !notificationData.leadData.aguardandoAnalise;

						// 📢 Toast com botão de recarregar para atualizações importantes
						if (isProvaComplete) {
							toast.success(`Prova processada`, {
								description: `"${leadName}" está pronto para visualização`,
								duration: 8000,
								action: onForceRefresh
									? {
											label: (
												<div className="flex items-center gap-1">
													<RefreshCw className="h-3 w-3" />
													Atualizar
												</div>
											),
											onClick: onForceRefresh,
										}
									: undefined,
							});
						} else if (isEspelhoComplete) {
							toast.success(`Espelho processado`, {
								description: `"${leadName}" está pronto para consulta`,
								duration: 8000,
								action: onForceRefresh
									? {
											label: (
												<div className="flex items-center gap-1">
													<RefreshCw className="h-3 w-3" />
													Atualizar
												</div>
											),
											onClick: onForceRefresh,
										}
									: undefined,
							});
						} else if (isAnaliseComplete) {
							toast.success(`Análise processada`, {
								description: `"${leadName}" está pronta para visualização`,
								duration: 8000,
								action: onForceRefresh
									? {
											label: (
												<div className="flex items-center gap-1">
													<RefreshCw className="h-3 w-3" />
													Atualizar
												</div>
											),
											onClick: onForceRefresh,
										}
									: undefined,
							});
						}
					}
				} catch (error) {
					console.error(`[SSE Manager] ❌ Erro ao processar notificação para ${leadId}:`, error);
				}
			};

			eventSource.onerror = (error) => {
				console.error(`[SSE Manager] ❌ Erro na conexão SSE para ${leadId}:`, error);
				console.log(`[SSE Manager] 🔍 Estado da conexão:`, {
					readyState: eventSource.readyState,
					url: eventSource.url,
					withCredentials: eventSource.withCredentials,
				});

				// Tentar reconectar após 5 segundos se ainda montado
				if (isMountedRef.current) {
					const timeout = setTimeout(() => {
						if (isMountedRef.current && connectionsRef.current.has(leadId)) {
							console.log(`[SSE Manager] 🔄 Tentando reconectar para: ${leadId}`);
							createSSEConnection(leadId);
						}
					}, 5000);

					reconnectTimeoutsRef.current.set(leadId, timeout);
				}
			};

			connectionsRef.current.set(leadId, eventSource);
		},
		[onLeadUpdate, onForceRefresh],
	);

	// Função para forçar reconexão de um lead específico
	const forceReconnectLead = useCallback(
		(leadId: string, reason?: string) => {
			console.log(`[SSE Manager] 🔥 Forçando reconexão para lead: ${leadId} (motivo: ${reason})`);
			createSSEConnection(leadId);
		},
		[createSSEConnection],
	);

	// Limpar todas as conexões
	const cleanupAllConnections = useCallback(() => {
		console.log(`[SSE Manager] 🧹 Limpando todas as conexões...`);

		// Fechar todas as conexões
		connectionsRef.current.forEach((connection, leadId) => {
			console.log(`[SSE Manager] 🔌 Fechando conexão para: ${leadId}`);
			connection.close();
		});
		connectionsRef.current.clear();

		// Limpar timeouts de reconexão
		reconnectTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
		reconnectTimeoutsRef.current.clear();
	}, []);

	// Atualizar conexões baseado nos leads
	const updateConnections = useCallback(() => {
		if (!isMountedRef.current) return;

		const leadsNeedingSSE = leads.filter(
			(lead) => lead.aguardandoManuscrito || lead.aguardandoEspelho || lead.aguardandoAnalise,
		);

		// 🔇 Log resumido
		if (leadsNeedingSSE.length > 0) {
			console.log(`[SSE Manager] 📊 ${leadsNeedingSSE.length} leads precisando SSE`);
		}

		const currentConnections = new Set(connectionsRef.current.keys());
		const leadsNeeding = new Set(leadsNeedingSSE.map((lead) => lead.id));

		// Remover conexões desnecessárias
		for (const leadId of currentConnections) {
			if (!leadsNeeding.has(leadId)) {
				console.log(`[SSE Manager] ❌ Desconectando: ${leadId}`);
				const connection = connectionsRef.current.get(leadId);
				if (connection) {
					connection.close();
					connectionsRef.current.delete(leadId);
				}
			}
		}

		// Criar novas conexões necessárias
		for (const leadId of leadsNeeding) {
			if (!currentConnections.has(leadId)) {
				createSSEConnection(leadId);
			}
		}
	}, [leads, createSSEConnection]);

	// Listener para evento de reconexão forçada
	useEffect(() => {
		const handleForceReconnect = (event: CustomEvent) => {
			const { leadId, reason } = event.detail;
			if (leadId) {
				console.log(`[SSE Manager] 🎯 Recebido evento de reconexão forçada para: ${leadId} (${reason})`);
				forceReconnectLead(leadId, reason);
			}
		};

		window.addEventListener("force-sse-reconnect", handleForceReconnect as EventListener);

		return () => {
			window.removeEventListener("force-sse-reconnect", handleForceReconnect as EventListener);
		};
	}, [forceReconnectLead]);

	// Effect principal - atualizar conexões quando leads mudam
	useEffect(() => {
		updateConnections();

		// Disparar evento para atualizar o indicador no header
		window.dispatchEvent(new CustomEvent("leads-waiting-update"));
	}, [updateConnections]);

	// Cleanup no unmount
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			cleanupAllConnections();
		};
	}, [cleanupAllConnections]);

	// Componente invisível - apenas gerencia as conexões SSE
	// A contagem de leads aguardando será exibida no header
	return null;
}
