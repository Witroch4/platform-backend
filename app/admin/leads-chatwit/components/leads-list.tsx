"use client";

import { useState, useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LeadItem } from "./lead-item/lead-item";
import { RefreshCw, FileUp, Edit3, Zap, Play, Trash2 } from "lucide-react";
import { ProviderSwitchHeader, type AiProviderType, type LinkedColumnType } from "./provider-switch";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { DialogDetalheLead } from "./dialog-detalhe-lead";
// BatchProgressDialog removido - agora usando apenas o novo sistema
// Imports do sistema antigo removidos - agora usando apenas o novo BatchProcessorTrigger
import { SSEConnectionManager } from "./sse-connection-manager";
import type { LeadChatwit, ExtendedLead } from "../types";
import { BatchProcessorTrigger } from "./batch-processor/BatchProcessorTrigger";

interface LeadsListProps {
	searchQuery: string;
	onRefresh: () => void;
	initialLoading: boolean;
	refreshCounter?: number;
}

export function LeadsList({ searchQuery, onRefresh, initialLoading, refreshCounter = 0 }: LeadsListProps) {
	const [leads, setLeads] = useState<LeadChatwit[]>([]);
	const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isUnifying, setIsUnifying] = useState(false);
	const [isConverting, setIsConverting] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [pagination, setPagination] = useState({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	});
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [currentLead, setCurrentLead] = useState<LeadChatwit | null>(null);

	// Estados para excluir arquivos em lote
	const [confirmBatchDeleteFiles, setConfirmBatchDeleteFiles] = useState(false);
	const [isBatchDeletingFiles, setIsBatchDeletingFiles] = useState(false);

	// Estados para excluir leads em lote
	const [confirmBatchDeleteLeads, setConfirmBatchDeleteLeads] = useState(false);
	const [isBatchDeletingLeads, setIsBatchDeletingLeads] = useState(false);

	// Cache global de espelhos padrão para evitar múltiplas chamadas
	const [espelhosPadraoCache, setEspelhosPadraoCache] = useState<{ [usuarioId: string]: any[] }>({});
	const [loadingEspelhosPadrao, setLoadingEspelhosPadrao] = useState<Set<string>>(new Set());

	// Sistema antigo de batch processor removido - agora usando apenas o novo sistema

	// Função para buscar espelhos padrão de um usuário específico
	const fetchEspelhosPadrao = async (usuarioId: string) => {
		if (espelhosPadraoCache[usuarioId] || loadingEspelhosPadrao.has(usuarioId)) {
			return; // Já tem cache ou está carregando
		}

		try {
			setLoadingEspelhosPadrao((prev) => new Set(prev.add(usuarioId)));

			const response = await fetch(`/api/admin/leads-chatwit/espelhos-padrao?usuarioId=${usuarioId}`);

			if (!response.ok) {
				throw new Error("Erro ao carregar espelhos padrão");
			}

			const data = await response.json();

			setEspelhosPadraoCache((prev) => ({
				...prev,
				[usuarioId]: data.espelhosPadrao || [],
			}));
		} catch (error) {
			console.error("Erro ao carregar espelhos padrão:", error);
		} finally {
			setLoadingEspelhosPadrao((prev) => {
				const newSet = new Set(prev);
				newSet.delete(usuarioId);
				return newSet;
			});
		}
	};

	// Função para obter espelhos padrão de um usuário do cache
	const getEspelhosPadrao = (usuarioId: string) => {
		return espelhosPadraoCache[usuarioId] || [];
	};

	useEffect(() => {
		fetchLeads();
	}, [searchQuery, pagination.page, pagination.limit, refreshCounter]);

	// 🔧 OTIMIZADO: Carregar espelhos padrão apenas uma vez por usuário
	const usuariosCarregados = useRef<Set<string>>(new Set());

	useEffect(() => {
		const usuariosUnicos = Array.from(new Set(leads.map((lead) => lead.usuarioId)));
		usuariosUnicos.forEach((usuarioId) => {
			if (usuarioId && !usuariosCarregados.current.has(usuarioId)) {
				usuariosCarregados.current.add(usuarioId);
				fetchEspelhosPadrao(usuarioId);
				console.log(`[Leads List] 🔄 Carregando espelhos padrão para usuário: ${usuarioId}`);
			}
		});
	}, [leads.length]); // ✅ Usar leads.length em vez de leads completos

	// Listener para o evento de destacar lead
	useEffect(() => {
		console.log("🔧 Registrando listener para evento highlightLead");

		const handleHighlightLead = (event: CustomEvent) => {
			const { leadId } = event.detail;
			console.log("🎯 Evento highlightLead recebido para lead:", leadId);

			// Encontrar o lead na lista atual
			const leadElement = document.querySelector(`[data-lead-id="${leadId}"]`);

			if (leadElement) {
				console.log("✅ Lead encontrado na página atual, destacando...");

				// Scroll suave até o elemento
				leadElement.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});

				// Adicionar classe de destaque temporariamente
				leadElement.classList.add("bg-yellow-100", "dark:bg-yellow-900/30", "border-yellow-400");

				// Remover o destaque após 3 segundos
				setTimeout(() => {
					leadElement.classList.remove("bg-yellow-100", "dark:bg-yellow-900/30", "border-yellow-400");
				}, 3000);

				toast.success("Lead destacado!", {
					description: `Lead ${leadId} foi destacado na lista.`,
					duration: 2000,
				});
			} else {
				console.log("⚠️ Lead não encontrado na página atual");
				toast.info("Lead não visível", {
					description: "O lead pode estar em outra página. Atualizando lista...",
					duration: 3000,
				});

				// Tentar recarregar a lista para encontrar o lead
				fetchLeads();
			}
		};

		// Adicionar o listener
		window.addEventListener("highlightLead", handleHighlightLead as EventListener);

		// Cleanup
		return () => {
			window.removeEventListener("highlightLead", handleHighlightLead as EventListener);
		};
	}, [leads]);

	const fetchLeads = async () => {
		setIsLoading(true);
		try {
			const params = new URLSearchParams({
				page: pagination.page.toString(),
				limit: pagination.limit.toString(),
			});

			if (searchQuery) {
				params.append("search", searchQuery);
			}

			const response = await fetch(`/api/admin/leads-chatwit/leads?${params.toString()}`);
			const data = await response.json();

			if (response.ok) {
				setLeads(data.leads);
				setPagination(data.pagination);
			} else {
				throw new Error(data.error || "Erro ao buscar leads");
			}
		} catch (error) {
			console.error("Erro ao buscar leads:", error);
			toast.error("Erro", { description: "Não foi possível carregar os leads. Tente novamente." });
		} finally {
			setIsLoading(false);
		}
	};

	const handleUnificarArquivos = async (leadId: string) => {
		setIsUnifying(true);
		try {
			const response = await fetch("/api/admin/leads-chatwit/unify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ leadId }),
			});

			const data = await response.json();

			if (response.ok) {
				toast.success("PDF unificado", {
					description: "Arquivos unidos com sucesso",
					duration: 2000,
				});
				fetchLeads(); // Recarrega a lista para mostrar o PDF unificado
			} else {
				throw new Error(data.error || "Erro ao unificar arquivos");
			}
		} catch (error) {
			console.error("Erro ao unificar arquivos:", error);
			toast.error("Erro", {
				description: "Não foi possível unificar os arquivos. Tente novamente.",
			});
		} finally {
			setIsUnifying(false);
		}
	};

	const handleConverterEmImagens = async (leadId: string) => {
		setIsConverting(leadId);
		try {
			const response = await fetch("/api/admin/leads-chatwit/convert-to-images", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ leadId }),
			});

			const data = await response.json();

			if (response.ok) {
				toast.success("Imagens convertidas", {
					description: "PDF convertido com sucesso",
					duration: 2000,
				});
				fetchLeads(); // Recarrega a lista para mostrar as imagens
			} else {
				throw new Error(data.error || "Erro ao converter PDF em imagens");
			}
		} catch (error) {
			console.error("Erro ao converter PDF em imagens:", error);
			toast.error("Erro", {
				description: "Não foi possível converter o PDF em imagens. Tente novamente.",
			});
		} finally {
			setIsConverting(null);
		}
	};

	const handleDeleteLead = async (id: string) => {
		try {
			const response = await fetch(`/api/admin/leads-chatwit/leads?id=${id}`, {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("Lead excluído", {
					description: "Removido com sucesso",
					duration: 2000,
				});
				setLeads(leads.filter((lead) => lead.id !== id));
				setPagination((prev) => ({
					...prev,
					total: prev.total - 1,
				}));
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao excluir lead");
			}
		} catch (error) {
			console.error("Erro ao excluir lead:", error);
			toast.error("Erro", {
				description: "Não foi possível excluir o lead. Tente novamente.",
			});
		}
	};

	// Função específica para atualizações via SSE (não invasiva)
	const handleSSELeadUpdate = (leadData: any) => {
		if (!leadData || !leadData.id) {
			console.error("Dados inválidos recebidos via SSE:", leadData);
			return;
		}

		// ✅ Atualização local não invasiva - apenas atualizar o estado do lead
		setLeads((prevLeads) => prevLeads.map((lead) => (lead.id === leadData.id ? { ...lead, ...leadData } : lead)));

		// ✅ Atualizar o currentLead também se estiver aberto no diálogo
		if (currentLead && currentLead.id === leadData.id) {
			setCurrentLead((prev: any) => (prev ? { ...prev, ...leadData } : null));
		}

		console.log(`[SSE] Lead ${leadData.id} atualizado localmente:`, {
			manuscritoProcessado: leadData.manuscritoProcessado,
			aguardandoManuscrito: leadData.aguardandoManuscrito,
			espelhoProcessado: leadData.espelhoProcessado,
			aguardandoEspelho: leadData.aguardandoEspelho,
			analiseProcessada: leadData.analiseProcessada,
			aguardandoAnalise: leadData.aguardandoAnalise,
		});
	};

	const handleEditLead = (lead: any) => {
		if (!lead || !lead.id) {
			toast.error("Erro", {
				description: "Não foi possível obter os dados do lead",
			});
			return;
		}

		// 🚫 REMOVIDO: Se for uma atualização via SSE (_skipDialog), usar função não invasiva
		if (lead._skipDialog) {
			handleSSELeadUpdate(lead);
			return;
		}

		// Se for uma edição interna (flag _internal = true), usar o fluxo normal
		if (lead._internal) {
			handleSaveLead(lead);
			return;
		}

		setCurrentLead(lead);
		setDetailsOpen(true);
	};

	const handleSaveLead = async (leadData: any) => {
		// Verificar se a edição é interna (do diálogo) ou externa (de outra parte da aplicação)
		const isInternalEdit = leadData._internal;
		const forceUpdate = leadData._forceUpdate;
		const isEspecialidadeUpdate = leadData._especialidadeUpdate;

		// Remover flags temporárias antes de enviar para a API
		const { _internal, _forceUpdate, _refresh, _skipDialog, _especialidadeUpdate, ...dataToSend } = leadData;

		// Se for apenas atualização de especialidade, só atualizar estado local
		if (isEspecialidadeUpdate && !forceUpdate) {
			// Atualizar apenas o lead atual no estado local (a API já foi chamada no EspelhoPadraoCell)
			setLeads((prevLeads) => prevLeads.map((lead) => (lead.id === leadData.id ? { ...lead, ...dataToSend } : lead)));

			// Atualizar o currentLead também para manter o dialog sincronizado
			if (currentLead && currentLead.id === leadData.id) {
				setCurrentLead((prev: LeadChatwit | null) => (prev ? { ...prev, ...dataToSend } : null));
			}

			return Promise.resolve();
		}

		setIsSaving(true);
		try {
			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(dataToSend),
			});

			if (response.ok) {
				// Se for uma edição interna, apenas atualizar o lead atual sem recarregar tudo
				if (isInternalEdit && !forceUpdate) {
					// Atualizar apenas o lead atual no estado
					setLeads((prevLeads) =>
						prevLeads.map((lead) => (lead.id === leadData.id ? { ...lead, ...dataToSend } : lead)),
					);

					// Atualizar o currentLead também para manter o dialog sincronizado
					if (currentLead && currentLead.id === leadData.id) {
						setCurrentLead((prev: LeadChatwit | null) => (prev ? { ...prev, ...dataToSend } : null));
					}
				}
				// Se forçar atualização ou não for uma edição interna, recarregar a lista completa
				else if (forceUpdate || !isInternalEdit) {
					fetchLeads();
				}

				return Promise.resolve();
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao atualizar lead");
			}
		} catch (error) {
			console.error("Erro ao atualizar lead:", error);
			toast.error("Erro", {
				description: "Não foi possível atualizar o lead. Tente novamente.",
			});
			return Promise.reject(error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleToggleAllLeads = (checked: boolean) => {
		if (checked) {
			setSelectedLeads(leads.map((lead) => lead.id));
		} else {
			setSelectedLeads([]);
		}
	};

	const handleToggleLead = (id: string, checked: boolean) => {
		if (checked) {
			setSelectedLeads((prev) => [...prev, id]);
		} else {
			setSelectedLeads((prev) => prev.filter((leadId) => leadId !== id));
		}
	};

	const handleDigitarProva = async (lead: any) => {
		try {
			// Obter as imagens convertidas
			let imagensConvertidas: string[] = [];
			if (lead.imagensConvertidas) {
				try {
					imagensConvertidas = JSON.parse(lead.imagensConvertidas);
				} catch (error) {
					console.error("Erro ao processar URLs de imagens convertidas:", error);
				}
			}

			// Se não houver imagens no campo imagensConvertidas, buscar dos arquivos
			if (!imagensConvertidas || imagensConvertidas.length === 0) {
				imagensConvertidas = lead.arquivos
					.filter((a: { pdfConvertido: string | null }) => a.pdfConvertido)
					.map((a: { pdfConvertido: string }) => a.pdfConvertido)
					.filter((url: string | null) => url && url.length > 0);
			}

			// Preparar os dados para enviar ao webhook
			const webhookData = {
				lead_chatwit: true, // Campo booleano para identificação
				manuscrito: true, // Campo booleano para identificação
				id: lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				email: lead.email,
				telefone: lead.phoneNumber,
				status: lead.status,
				data_criacao: lead.createdAt,
				usuario: {
					id: lead.usuario.id,
					nome: lead.usuario.name,
					email: lead.usuario.email,
					channel: lead.usuario.channel,
				},
				arquivos: lead.arquivos.map((a: { id: string; dataUrl: string; fileType: string }) => ({
					id: a.id,
					url: a.dataUrl,
					tipo: a.fileType,
					nome: a.fileType,
				})),
				arquivos_pdf: lead.pdfUnificado
					? [
						{
							id: lead.id,
							url: lead.pdfUnificado,
							nome: "PDF Unificado",
						},
					]
					: [],
				arquivos_imagens_manuscrito: imagensConvertidas.map((url: string, index: number) => ({
					id: `${lead.id}-manuscrito-${index}`,
					url: url,
					nome: `Manuscrito ${index + 1}`,
				})),
				recursos: lead.datasRecurso
					? JSON.parse(lead.datasRecurso).map((data: string, index: number) => ({
						id: `${lead.id}-recurso-${index}`,
						tipo: "recurso",
						status: "realizado",
						data_criacao: data,
					}))
					: [],
				observacoes: lead.anotacoes || "",
				metadata: {
					leadUrl: lead.leadUrl,
					sourceId: lead.sourceId,
					concluido: lead.concluido,
					fezRecurso: lead.fezRecurso,
				},
			};

			const response = await fetch("/api/admin/leads-chatwit/webhook", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(webhookData),
			});

			if (response.ok) {
				toast.success("Prova enviada", {
					description: "Processamento iniciado",
					duration: 2000,
				});
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao enviar solicitação de digitação");
			}
		} catch (error: any) {
			console.error("Erro ao enviar solicitação de digitação:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível enviar a solicitação de digitação. Tente novamente.",
			});
		}
	};

	// Função para excluir arquivos em lote
	const handleBatchDeleteAllFiles = async () => {
		setIsBatchDeletingFiles(true);
		setConfirmBatchDeleteFiles(false);

		try {
			const selectedLeadsData = leads.filter((lead) => selectedLeads.includes(lead.id));

			toast("Iniciando exclusão", {
				description: `Excluindo todos os arquivos de ${selectedLeadsData.length} leads selecionados. Esta operação pode demorar alguns minutos.`,
			});

			// Processar cada lead selecionado
			for (const lead of selectedLeadsData) {
				try {
					console.log(`[BatchDeleteFiles] Processando lead: ${lead.id}`);

					const deletePromises = [];

					// Excluir arquivos individuais
					if (lead.arquivos && lead.arquivos.length > 0) {
						deletePromises.push(
							...lead.arquivos.map(async (arquivo) => {
								const response = await fetch(`/api/admin/leads-chatwit/arquivos?id=${arquivo.id}&type=arquivo`, {
									method: "DELETE",
								});
								if (!response.ok) {
									throw new Error(`Erro ao excluir arquivo ${arquivo.id}`);
								}
								return response.json();
							}),
						);
					}

					// Excluir PDF unificado
					if (lead.pdfUnificado) {
						deletePromises.push(
							fetch(`/api/admin/leads-chatwit/arquivos?leadId=${lead.id}&type=pdf`, {
								method: "DELETE",
							}).then((response) => {
								if (!response.ok) {
									throw new Error(`Erro ao excluir PDF do lead ${lead.id}`);
								}
								return response.json();
							}),
						);
					}

					// Excluir imagens convertidas
					if (lead.arquivos && lead.arquivos.some((a) => a.pdfConvertido)) {
						deletePromises.push(
							fetch(`/api/admin/leads-chatwit/arquivos?leadId=${lead.id}&type=imagem`, {
								method: "DELETE",
							}).then((response) => {
								if (!response.ok) {
									throw new Error(`Erro ao excluir imagens do lead ${lead.id}`);
								}
								return response.json();
							}),
						);
					}

					// Excluir prova
					if (lead.provaManuscrita || lead.manuscritoProcessado) {
						deletePromises.push(
							fetch(`/api/admin/leads-chatwit/manuscrito?leadId=${lead.id}`, {
								method: "DELETE",
							}).then((response) => {
								if (!response.ok) {
									throw new Error(`Erro ao excluir prova do lead ${lead.id}`);
								}
								return response.json();
							}),
						);
					}

					// Excluir análise
					if (lead.analiseUrl || lead.analisePreliminar || lead.aguardandoAnalise) {
						deletePromises.push(
							fetch("/api/admin/leads-chatwit/leads", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									id: lead.id,
									analiseUrl: "",
									analiseProcessada: false,
									aguardandoAnalise: false,
									analisePreliminar: false,
									analiseValidada: false,
								}),
							}).then((response) => {
								if (!response.ok) {
									throw new Error(`Erro ao excluir análise do lead ${lead.id}`);
								}
								return response.json();
							}),
						);
					}

					// Excluir espelho individual (não da biblioteca)
					const temEspelhoIndividual =
						(lead.espelhoCorrecao && lead.espelhoCorrecao !== "[]") ||
						(lead.textoDOEspelho && lead.textoDOEspelho !== "") ||
						lead.espelhoProcessado ||
						lead.aguardandoEspelho;

					if (temEspelhoIndividual && !lead.espelhoBibliotecaId) {
						deletePromises.push(
							fetch(`/api/admin/leads-chatwit/deletar-espelho?leadId=${lead.id}`, {
								method: "DELETE",
							}).then((response) => {
								if (!response.ok) {
									throw new Error(`Erro ao excluir espelho do lead ${lead.id}`);
								}
								return response.json();
							}),
						);
					}

					// Aguardar todas as exclusões do lead atual
					await Promise.all(deletePromises);

					// Atualizar o lead com dados limpos
					const leadAtualizado = {
						...lead,
						arquivos: [],
						pdfUnificado: undefined,
						imagensConvertidas: JSON.stringify([]),
						provaManuscrita: undefined,
						manuscritoProcessado: false,
						aguardandoManuscrito: false,
						...(temEspelhoIndividual && !lead.espelhoBibliotecaId
							? {
								textoDOEspelho: undefined,
								espelhoCorrecao: undefined,
								espelhoProcessado: false,
								aguardandoEspelho: false,
							}
							: {}),
						analiseUrl: undefined,
						analiseProcessada: false,
						aguardandoAnalise: false,
						analisePreliminar: false,
						analiseValidada: false,
						_skipDialog: true,
						_forceUpdate: true,
					};

					// Atualizar o lead individualmente
					await handleSaveLead(leadAtualizado);

					console.log(`[BatchDeleteFiles] Lead ${lead.id} processado com sucesso`);
				} catch (error: any) {
					console.error(`[BatchDeleteFiles] Erro ao processar lead ${lead.id}:`, error);
					toast.error(`Erro no lead ${lead.nomeReal || lead.name}`, {
						description: error.message || "Erro ao excluir arquivos do lead",
					});
				}
			}

			// Limpar seleção e recarregar lista
			setSelectedLeads([]);
			fetchLeads();

			toast("Exclusão concluída", {
				description: `Todos os arquivos foram excluídos dos ${selectedLeadsData.length} leads selecionados!`,
			});
		} catch (error: any) {
			console.error("Erro na exclusão em lote:", error);
			toast.error("Erro na exclusão", {
				description: error.message || "Erro ao excluir arquivos em lote. Tente novamente.",
			});
		} finally {
			setIsBatchDeletingFiles(false);
		}
	};

	// Função para excluir leads em lote
	const handleBatchDeleteLeads = async () => {
		setIsBatchDeletingLeads(true);
		setConfirmBatchDeleteLeads(false);

		try {
			const selectedLeadsData = leads.filter((lead) => selectedLeads.includes(lead.id));

			toast("Iniciando exclusão", {
				description: `Excluindo ${selectedLeadsData.length} leads selecionados. Esta operação não pode ser desfeita.`,
			});

			// Processar cada lead selecionado
			for (const lead of selectedLeadsData) {
				try {
					console.log(`[BatchDeleteLeads] Processando lead: ${lead.id}`);

					const response = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`, {
						method: "DELETE",
					});

					if (!response.ok) {
						const data = await response.json();
						throw new Error(data.error || `Erro ao excluir lead ${lead.id}`);
					}

					console.log(`[BatchDeleteLeads] Lead ${lead.id} excluído com sucesso`);
				} catch (error: any) {
					console.error(`[BatchDeleteLeads] Erro ao processar lead ${lead.id}:`, error);
					toast.error(`Erro no lead ${lead.nomeReal || lead.name}`, {
						description: error.message || "Erro ao excluir lead",
					});
				}
			}

			// Limpar seleção e recarregar lista
			setSelectedLeads([]);
			fetchLeads();

			toast("Exclusão concluída", {
				description: `${selectedLeadsData.length} leads foram excluídos com sucesso!`,
			});
		} catch (error: any) {
			console.error("Erro na exclusão em lote:", error);
			toast.error("Erro na exclusão", {
				description: error.message || "Erro ao excluir leads em lote. Tente novamente.",
			});
		} finally {
			setIsBatchDeletingLeads(false);
		}
	};

	// Funções do sistema antigo removidas - agora usando apenas o novo BatchProcessorTrigger

	return (
		<div className="space-y-4 bg-background">
			{/* Gerenciador de Conexões SSE */}
			<SSEConnectionManager
				leads={leads}
				onLeadUpdate={(lead) => handleEditLead({ ...lead, _skipDialog: true })}
				onForceRefresh={fetchLeads}
			/>

			{selectedLeads.length > 0 && (
				<div className="flex items-center justify-between bg-muted p-2 rounded-md border border-border">
					<div className="flex items-center gap-3">
						<span className="font-medium text-foreground">{selectedLeads.length} leads selecionados</span>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setSelectedLeads([])} className="border-border hover:bg-accent">
							Limpar seleção
						</Button>
						<Button
							variant="destructive"
							onClick={() => setConfirmBatchDeleteFiles(true)}
							disabled={isBatchDeletingFiles}
							className="border-border hover:bg-destructive/80"
						>
							{isBatchDeletingFiles ? (
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Excluir Todos os Arquivos
						</Button>
						<Button
							variant="destructive"
							onClick={() => setConfirmBatchDeleteLeads(true)}
							disabled={isBatchDeletingLeads}
							className="border-border hover:bg-destructive/80"
						>
							{isBatchDeletingLeads ? (
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Excluir Leads
						</Button>
						<BatchProcessorTrigger
							selectedLeads={leads
								.filter((lead) => selectedLeads.includes(lead.id))
								.map(
									(lead) =>
										({
											...lead,
											nome: lead.nomeReal || lead.name || "Lead sem nome",
											manuscrito: (lead.provaManuscrita as string) || undefined,
										}) as ExtendedLead,
								)}
							onUpdate={fetchLeads}
						/>
						<Button
							variant="outline"
							onClick={() =>
								toast("Não implementado", { description: "Esta funcionalidade será adicionada em breve." })
							}
							className="border-border hover:bg-accent"
						>
							<FileUp className="h-4 w-4 mr-2" />
							Exportar
						</Button>
					</div>
				</div>
			)}

			{isLoading || initialLoading ? (
				<div className="flex justify-center items-center py-8">
					<img src="/animations/broto.svg" alt="Carregando" className="h-24 w-24" />
				</div>
			) : leads.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground">Nenhum lead encontrado.</div>
			) : (
				<div className="overflow-x-auto bg-card rounded-md border border-border">
					<Table className="w-full border-border">
						<TableHeader className="bg-muted/50">
							<TableRow className="border-border hover:bg-muted/50 h-12">
								<TableHead className="min-w-[40px] w-[40px] align-middle text-card-foreground sticky left-0 bg-muted/50 z-20 px-1">
									<Checkbox
										checked={leads.length > 0 && selectedLeads.length === leads.length}
										onCheckedChange={handleToggleAllLeads}
										aria-label="Selecionar todos os leads"
										className="border-border"
									/>
								</TableHead>
								<TableHead className="min-w-[200px] align-middle text-card-foreground sticky left-[40px] bg-muted/50 z-10 px-2 text-sm">
									Lead
								</TableHead>
								<TableHead className="min-w-[80px] align-middle text-card-foreground px-2 text-sm">Usuário</TableHead>
								<TableHead className="min-w-[100px] align-middle text-card-foreground px-2 text-sm">Arquivos</TableHead>
								<TableHead className="min-w-[70px] align-middle text-card-foreground px-1 text-sm">PDF</TableHead>
								<TableHead className="min-w-[70px] align-middle text-card-foreground px-1 text-sm">Imagens</TableHead>
								<TableHead className="min-w-[130px] align-middle text-card-foreground px-1 text-sm">
									<ProviderSwitchHeader column="PROVA_CELL" label="Prova" defaultProvider="GEMINI" />
								</TableHead>
								<TableHead className="min-w-[130px] align-middle text-card-foreground px-1 text-sm">
									<ProviderSwitchHeader column="ESPELHO_CELL" label="Espelho" defaultProvider="GEMINI" />
								</TableHead>
								<TableHead className="min-w-[120px] align-middle text-card-foreground px-1 text-sm">Padrão</TableHead>
								<TableHead className="min-w-[130px] align-middle text-card-foreground px-1 text-sm">
									<ProviderSwitchHeader column="ANALISE_CELL" label="Análise" defaultProvider="OPENAI" />
								</TableHead>
								<TableHead className="min-w-[130px] align-middle text-card-foreground px-1 text-sm">
									<ProviderSwitchHeader column="RECURSO_CELL" label="Recurso" defaultProvider="OPENAI" />
								</TableHead>
								<TableHead className="min-w-[80px] align-middle text-card-foreground px-1 text-sm">
									Consultoria
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{leads.map((lead) => (
								<LeadItem
									key={lead.id}
									lead={lead}
									isSelected={selectedLeads.includes(lead.id)}
									onSelect={handleToggleLead}
									onDelete={handleDeleteLead}
									onEdit={handleEditLead}
									onUnificar={handleUnificarArquivos}
									onConverter={handleConverterEmImagens}
									onDigitarProva={handleDigitarProva}
									onRefresh={fetchLeads}
									isUnifying={isUnifying}
									isConverting={isConverting}
									espelhosPadrao={getEspelhosPadrao(lead.usuarioId)}
									loadingEspelhosPadrao={loadingEspelhosPadrao.has(lead.usuarioId)}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{leads.length > 0 && (
				<div className="flex items-center justify-between bg-card p-4 rounded-md border border-border">
					<div className="text-sm text-muted-foreground">
						Exibindo {(pagination.page - 1) * pagination.limit + 1} a{" "}
						{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} leads
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							disabled={pagination.page === 1 || isLoading}
							onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
							className="border-border hover:bg-accent"
						>
							Anterior
						</Button>
						<Button
							variant="outline"
							disabled={pagination.page === pagination.totalPages || isLoading}
							onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
							className="border-border hover:bg-accent"
						>
							Próximo
						</Button>
					</div>
				</div>
			)}

			{currentLead && (
				<DialogDetalheLead
					lead={currentLead}
					open={detailsOpen}
					onOpenChange={setDetailsOpen}
					onEdit={handleSaveLead}
					isSaving={isSaving}
				/>
			)}

			{/* Diálogo de Confirmação para Exclusão em Lote */}
			<Dialog open={confirmBatchDeleteFiles} onOpenChange={setConfirmBatchDeleteFiles}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar exclusão de arquivos em lote</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja excluir <strong>TODOS os arquivos</strong> de{" "}
							<strong>{selectedLeads.length} leads selecionados</strong>?
						</DialogDescription>
						<div className="space-y-2 mt-4">
							<div className="text-sm bg-muted/50 p-3 rounded-md border-l-4 border-destructive/20">
								<div className="font-medium text-foreground mb-2">Esta ação irá excluir de cada lead selecionado:</div>
								<ul className="text-muted-foreground space-y-1 list-disc list-inside">
									<li>Todos os arquivos individuais</li>
									<li>PDFs unificados</li>
									<li>Imagens convertidas</li>
									<li>Provas digitadas</li>
									<li>Espelhos de correção individuais</li>
									<li>Análises das provas</li>
								</ul>
								<div className="text-destructive font-medium mt-2">⚠️ Esta ação não pode ser desfeita!</div>
								<div className="text-sm text-muted-foreground mt-1">
									Nota: Espelhos da biblioteca não serão afetados.
								</div>
							</div>
						</div>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmBatchDeleteFiles(false)} disabled={isBatchDeletingFiles}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleBatchDeleteAllFiles} disabled={isBatchDeletingFiles}>
							{isBatchDeletingFiles ? (
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Excluir Todos os Arquivos
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Diálogo de Confirmação para Exclusão de Leads em Lote */}
			<Dialog open={confirmBatchDeleteLeads} onOpenChange={setConfirmBatchDeleteLeads}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar exclusão de leads em lote</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja excluir <strong>{selectedLeads.length} leads selecionados</strong>?
						</DialogDescription>
						<div className="space-y-2 mt-4">
							<div className="text-sm bg-muted/50 p-3 rounded-md border-l-4 border-destructive/20">
								<div className="font-medium text-foreground mb-2">Esta ação irá excluir completamente:</div>
								<ul className="text-muted-foreground space-y-1 list-disc list-inside">
									<li>Os leads e todas as suas informações</li>
									<li>Todos os arquivos associados</li>
									<li>PDFs unificados e imagens convertidas</li>
									<li>Provas e espelhos de correção</li>
									<li>Análises e recursos</li>
									<li>Histórico completo dos leads</li>
								</ul>
								<div className="text-destructive font-medium mt-2">⚠️ Esta ação não pode ser desfeita!</div>
								<div className="text-sm text-muted-foreground mt-1">
									Nota: Esta é uma exclusão permanente e irrecuperável.
								</div>
							</div>
						</div>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmBatchDeleteLeads(false)} disabled={isBatchDeletingLeads}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleBatchDeleteLeads} disabled={isBatchDeletingLeads}>
							{isBatchDeletingLeads ? (
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Excluir Leads
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Diálogos do sistema antigo removidos - agora usando apenas o novo BatchProcessorTrigger */}
		</div>
	);
}
