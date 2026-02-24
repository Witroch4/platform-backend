import { toast } from "sonner";
import { getConvertedImages } from "@/app/admin/leads-chatwit/components/lead-item/componentes-lead-item/utils";
import type { LeadChatwit } from "@/app/admin/leads-chatwit/types";
import type { ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { Prisma } from "@prisma/client";
import { useOptimisticFileDeletion } from "./useOptimisticFileDeletion";
import { getColumnProvider } from "@/app/admin/leads-chatwit/components/provider-switch";

interface UseLeadHandlersProps {
	lead: LeadChatwit;
	onEdit: (lead: LeadChatwit) => void;
	onDelete: (id: string) => void;
	onUnificar: (id: string) => void;
	onConverter: (id: string) => void;
	onDigitarProva: (lead: LeadChatwit) => void;

	// Estados dos diálogos
	setDetailsOpen: (open: boolean) => void;
	setConfirmDelete: (open: boolean) => void;
	setShowGallery: (open: boolean) => void;
	setShowProcessDialog: (open: boolean) => void;
	setProcessType: (type: "unify" | "convert") => void;
	setProcessStartTime: (time: number | null) => void;
	setShowProvaDialog: (open: boolean) => void;
	setShowManuscritoImageSeletor: (open: boolean) => void;
	setIsDigitando: (loading: boolean) => void;
	setShowEspelhoSeletor: (open: boolean) => void;
	setShowEspelhoDialog: (open: boolean) => void;
	setConfirmDeleteEspelho: (open: boolean) => void;
	setShowAnaliseDialog: (open: boolean) => void;
	setShowAnalisePreviewDrawer: (open: boolean) => void;
	setShowRecursoDialog: (open: boolean) => void;
	setConfirmDeleteAllFiles: (open: boolean) => void;
	setConfirmDeleteManuscrito: (open: boolean) => void;
	setManuscritoToDelete: (id: string | null) => void;
	manuscritoToDelete: string | null;
	setIsEnviandoEspelho: (loading: boolean) => void;
	setIsUploadingEspelho: (loading: boolean) => void;
	setIsEnviandoAnalise: (loading: boolean) => void;
	setIsEnviandoPdf: (loading: boolean) => void;
	setIsEnviandoAnaliseValidada: (loading: boolean) => void;
	setIsDownloading: (loading: boolean) => void;
	setIsLoadingImages: (loading: boolean) => void;
	setSelectedEspelhoImages: (images: string[]) => void;
	setUploadingFile: (file: File | null) => void;
	setIsSaving: (loading: boolean) => void;
	setShowFullImage: (show: boolean) => void;
	setIsDeletedFile: (fileId: string | null) => void;
	isDeletedFile: string | null;

	// Estados locais
	manuscritoProcessadoLocal: boolean;
	hasEspelho: boolean;
	consultoriaAtiva: boolean;
	localAnaliseState: {
		analiseUrl?: string;
		aguardandoAnalise: boolean;
		analisePreliminar?: any;
		analiseValidada: boolean;
	};
	localRecursoState: {
		recursoUrl?: string;
		aguardandoRecurso: boolean;
		recursoPreliminar?: any;
		recursoValidado: boolean;
	};
	localManuscritoState: {
		manuscritoProcessado: boolean;
		aguardandoManuscrito: boolean;
		provaManuscrita: any;
	};
	localEspelhoState: {
		hasEspelho: boolean;
		aguardandoEspelho: boolean;
		espelhoCorrecao: any;
		textoDOEspelho: any;
	};

	// Métodos de atualização de estado
	updateEspelhoState: (value: boolean | any) => void;
	updateManuscritoState: (value: boolean | any) => void;
	updateAnaliseState: (updates: any) => void;
	updateRecursoState: (updates: any) => void;
	updateConsultoriaState: (value: boolean) => void;
	forceRefresh: () => void;
	forceServerRefresh: () => void; // Nova função para refresh explícito do servidor
}

export function useLeadHandlers({
	lead,
	onEdit,
	onDelete,
	onUnificar,
	onConverter,
	setDetailsOpen,
	setConfirmDelete,
	setShowGallery,
	setShowProcessDialog,
	setProcessType,
	setProcessStartTime,
	setShowProvaDialog,
	setShowManuscritoImageSeletor,
	setIsDigitando,
	setShowEspelhoSeletor,
	setShowEspelhoDialog,
	setConfirmDeleteEspelho,
	setShowAnaliseDialog,
	setShowAnalisePreviewDrawer,
	setShowRecursoDialog,
	setConfirmDeleteAllFiles,
	setConfirmDeleteManuscrito,
	setManuscritoToDelete,
	manuscritoToDelete,
	setIsEnviandoEspelho,
	setIsUploadingEspelho,
	setIsEnviandoAnalise,
	setIsEnviandoPdf,
	setIsEnviandoAnaliseValidada,
	setIsDownloading,
	setIsLoadingImages,
	setSelectedEspelhoImages,
	setUploadingFile,
	setIsSaving,
	setShowFullImage,
	setIsDeletedFile,
	isDeletedFile,
	manuscritoProcessadoLocal,
	hasEspelho,
	consultoriaAtiva,
	localAnaliseState,
	localManuscritoState,
	localEspelhoState,
	localRecursoState,
	updateEspelhoState,
	updateManuscritoState,
	updateAnaliseState,
	updateRecursoState,
	updateConsultoriaState,
	forceRefresh,
	forceServerRefresh,
}: UseLeadHandlersProps) {
	// Hook para exclusão otimista
	const { optimisticDeleteFiles, optimisticDeletePdf, optimisticDeleteImages, rollbackDeletion, clearDeletionState } =
		useOptimisticFileDeletion();

	const handleEditLead = async (leadData: any) => {
		try {
			setIsSaving(true);

			if (leadData._skipDialog) {
				await onEdit(leadData);
				return;
			}

			await onEdit({
				...leadData,
				_internal: true,
			});

			toast("Sucesso", { description: "Lead atualizado com sucesso!" });
		} catch (error) {
			toast("Erro", { description: "Houve um erro ao atualizar o lead" });
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = () => {
		setConfirmDelete(false);
		onDelete(lead.id);
	};

	const handleViewDetails = () => {
		setDetailsOpen(true);
	};

	const handleShowFullImage = () => {
		setShowFullImage(true);
	};

	const handleShowGallery = () => {
		setShowGallery(true);
	};

	const handleDeleteFile = async (fileId: string, type: "arquivo" | "pdf" | "imagem") => {
		try {
			// ✅ EXCLUSÃO OTIMISTA: Remover da UI imediatamente
			if (type === "arquivo") {
				optimisticDeleteFiles(lead, [fileId], onEdit);
			} else if (type === "pdf") {
				optimisticDeletePdf(lead, onEdit);
			} else if (type === "imagem") {
				optimisticDeleteImages(lead, onEdit);
			}

			setIsDeletedFile(fileId);

			// Criar promise para o backend
			const deletePromise = (async () => {
				const params = new URLSearchParams();

				if (type === "arquivo") {
					params.append("id", fileId);
					params.append("type", "arquivo");
				} else if (type === "pdf" || type === "imagem") {
					params.append("leadId", lead.id);
					params.append("type", type);
				}

				const response = await fetch(`/api/admin/leads-chatwit/arquivos?${params.toString()}`, {
					method: "DELETE",
				});

				const data = await response.json();

				if (response.ok) {
					// ✅ Sucesso: limpar estado de deleção otimista
					clearDeletionState();
					return `${type === "pdf" ? "PDF unificado" : type === "imagem" ? "Imagens convertidas" : "Arquivo"} excluído com sucesso.`;
				} else {
					// ❌ Erro: reverter a UI para o estado anterior
					rollbackDeletion(onEdit);
					throw new Error(data.error || "Erro ao excluir arquivo");
				}
			})();

			// ✅ Usar toast.promise para feedback visual
			toast.promise(deletePromise, {
				loading: `Excluindo ${type === "pdf" ? "PDF" : type === "imagem" ? "imagens" : "arquivo"}...`,
				success: (message) => message,
				error: (error) => error?.message || "Não foi possível excluir o arquivo. Tente novamente.",
			});

			await deletePromise;
			return Promise.resolve();
		} catch (error: any) {
			// ❌ Garantir rollback em caso de erro de rede
			rollbackDeletion(onEdit);
			return Promise.reject(error);
		} finally {
			setIsDeletedFile(null);
		}
	};

	const reloadAfterDelete = () => {
		if (typeof forceServerRefresh === "function") {
			forceServerRefresh();
		}

		window.setTimeout(() => {
			if (typeof forceServerRefresh === "function") {
				forceServerRefresh();
			}

			toast("Atualizado", { description: "Lista de arquivos atualizada com sucesso" });
		}, 500);
	};

	const handleUnificarArquivos = (leadId: string) => {
		setProcessType("unify");
		setShowProcessDialog(true);
		setProcessStartTime(Date.now());

		setTimeout(() => {
			onUnificar(leadId);
		}, 500);
	};

	const handlePdfToImages = async () => {
		setProcessType("convert");
		setShowProcessDialog(true);
		setProcessStartTime(Date.now());

		try {
			setIsLoadingImages(true);
			await new Promise((resolve) => setTimeout(resolve, 500));
			await onConverter(lead.id);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			toast("Sucesso", { description: "Conversão de PDF para imagens concluída" });
		} catch (error: any) {
			console.error("Erro ao converter PDF para imagens:", error);
			toast("Erro", {
				description: error.message || "Não foi possível converter o PDF para imagens. Tente novamente.",
			});
		} finally {
			setIsLoadingImages(false);
			setTimeout(() => {
				setShowProcessDialog(false);
			}, 500);
		}
	};

	const handleDigitarClick = async () => {
		if (manuscritoProcessadoLocal) {
			setShowProvaDialog(true);
		} else {
			setShowManuscritoImageSeletor(true);
		}
	};

	const handleEnviarManuscrito = async (selectedImages: string[]) => {
		if (selectedImages.length === 0) {
			toast("Aviso", { description: "Selecione pelo menos uma imagem para o manuscrito." });
			return;
		}

		setShowManuscritoImageSeletor(false);
		setIsDigitando(true);

		updateManuscritoState({ aguardandoManuscrito: true });

		try {
			console.log("🔌 [Pre-Send] Forçando reconexão SSE para leadId:", lead.id);
			window.dispatchEvent(
				new CustomEvent("force-sse-reconnect", {
					detail: { leadId: lead.id, reason: "pre-manuscrito-send" },
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 2000));
			console.log("✅ [Pre-Send] Aguardo de conexão SSE concluído");

			// ⭐ Obter provider selecionado pelo switch no topo da coluna PROVA_CELL
			const selectedProvider = getColumnProvider("PROVA_CELL", "GEMINI");
			console.log(`[Envio] 🎛️ Provider selecionado para PROVA_CELL: ${selectedProvider}`);

			const payload = {
				leadID: lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				telefone: lead.phoneNumber,
				selectedProvider, // ⭐ Passa o provider selecionado pelo usuário
				manuscrito: true,
				arquivos: lead.arquivos.map((a: any) => ({
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
				arquivos_imagens_manuscrito: selectedImages.map((url: string, index: number) => ({
					id: `${lead.id}-manuscrito-${index}`,
					url: url,
					nome: `Manuscrito ${index + 1}`,
				})),
				metadata: {
					leadUrl: lead.leadUrl,
					sourceId: lead.sourceId,
					concluido: lead.concluido,
					fezRecurso: lead.fezRecurso,
				},
			};

			console.log("📤 [Envio] Enviando manuscrito para processamento...");
			const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao enviar manuscrito para processamento");
			}

			const result = await response.json();

			// Liberar botão imediatamente após enfileirar (não aguardar conclusão)
			setIsDigitando(false);

			console.log("✅ [Post-Send] Manuscrito enfileirado com sucesso:", result);

			// Mostrar toast de confirmação
			if (result.mode === "queued") {
				toast.success("Prova adicionada à fila de digitação", {
					description: `${result.totalPages} páginas serão processadas. Você será notificado quando concluir.`,
				});
			}

			// Atualizar lead local para mostrar status de aguardando
			console.log("🔄 [Post-Send] Atualizando lead local para aguardandoManuscrito: true");
			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					aguardandoManuscrito: true,
					manuscritoProcessado: false,
					_skipDialog: true,
				} as any);
			}

			console.log("✅ [Post-Send] SSE cuidará de atualizar quando concluir...");
		} catch (error: any) {
			console.error("Erro ao enviar manuscrito:", error);
			setIsDigitando(false);
			updateManuscritoState({ aguardandoManuscrito: false });
			toast("Erro", { description: error.message || "Não foi possível processar o manuscrito. Tente novamente." });
		}
	};

	const handleSaveManuscrito = async (texto: string) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/manuscrito", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					leadId: lead.id,
					texto: texto,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao salvar manuscrito");
			}

			toast("Manuscrito salvo", { description: "Manuscrito atualizado com sucesso!" });

			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					provaManuscrita: texto,
					_skipDialog: true,
				} as any);
			}
		} catch (error: any) {
			throw error;
		}
	};

	const handleExcluirManuscrito = async () => {
		if (!manuscritoToDelete) return;

		try {
			setIsDigitando(true);
			setConfirmDeleteManuscrito(false);

			const response = await fetch(`/api/admin/leads-chatwit/manuscrito?leadId=${manuscritoToDelete}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao excluir manuscrito");
			}

			toast("Manuscrito excluído", { description: "Manuscrito excluído com sucesso!" });

			updateManuscritoState({
				manuscritoProcessado: false,
				aguardandoManuscrito: false,
				provaManuscrita: undefined,
			});

			updateAnaliseState({
				analiseUrl: undefined,
				aguardandoAnalise: false,
				analisePreliminar: undefined,
				analiseValidada: false,
			});

			updateConsultoriaState(false);

			updateEspelhoState({
				...localEspelhoState,
				aguardandoEspelho: false,
				espelhoProcessado: false,
			});

			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					provaManuscrita: undefined,
					manuscritoProcessado: false,
					aguardandoManuscrito: false,
					analiseUrl: undefined,
					analiseProcessada: false,
					aguardandoAnalise: false,
					analisePreliminar: undefined,
					analiseValidada: false,
					consultoriaFase2: false,
					aguardandoEspelho: false,
					espelhoProcessado: false,
					_skipDialog: true,
				} as any);
			}

			forceRefresh();
			setManuscritoToDelete(null);
		} catch (error: any) {
			console.error("Erro ao excluir manuscrito:", error);
			toast("Erro", { description: error.message || "Não foi possível excluir o manuscrito. Tente novamente." });
		} finally {
			setIsDigitando(false);
		}
	};

	const handleEspelhoClick = () => {
		setShowEspelhoDialog(true);
	};

	const handleOpenFileUpload = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*,application/pdf";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				handleEspelhoFileUpload(file);
			}
		};
		input.click();
	};

	const handleEspelhoFileUpload = async (file: File) => {
		if (!file) return;

		setIsUploadingEspelho(true);
		setUploadingFile(file);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("purpose", "vision");
			formData.append("sessionId", `espelho-${lead.id}`);

			const response = await fetch("/api/upload/process-files", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro no upload");
			}

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Falha no processamento");
			}

			const imageUrls = data.image_urls || [];

			if (imageUrls.length === 0) {
				throw new Error("Nenhuma imagem foi processada");
			}

			updateEspelhoState({ aguardandoEspelho: true });

			const payload = {
				leadID: lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				telefone: lead.phoneNumber,
				...(consultoriaAtiva ? { espelhoparabiblioteca: true } : { espelho: true }),
				...((lead as any).espelhoPadraoId && { espelhoPadraoId: (lead as any).espelhoPadraoId }), // ⭐ NOVO
				arquivos: lead.arquivos.map((a: any) => ({
					id: a.id,
					url: a.dataUrl,
					tipo: a.fileType,
					nome: a.fileType,
				})),
				arquivos_pdf: lead.pdfUnificado
					? [
						{
							id: `${lead.id}-pdf-unificado`,
							url: lead.pdfUnificado,
							nome: "PDF Unificado",
						},
					]
					: [],
				arquivos_imagens_espelho: imageUrls.map((url: string, index: number) => ({
					id: `<span class="math-inline">\{lead\.id\}\-espelho\-</span>{index}`,
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

			const espelhoResponse = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!espelhoResponse.ok) {
				const espelhoData = await espelhoResponse.json();
				throw new Error(espelhoData.error || "Erro ao enviar espelho para sistema externo");
			}

			toast("Espelho enviado", {
				description: "Espelho enviado para o sistema externo com sucesso! Aguarde o processamento.",
			});
		} catch (error: any) {
			console.error("Erro no upload do espelho:", error);
			toast("Erro", { description: error.message || "Não foi possível fazer upload do espelho. Tente novamente." });
		} finally {
			setIsUploadingEspelho(false);
			setUploadingFile(null);
		}
	};

	const handleEnviarEspelhoAuto = async (imageUrls: string[]) => {
		try {
			const payload = {
				leadID: lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				telefone: lead.phoneNumber,
				...((lead as any).espelhoPadraoId && { espelhoPadraoId: (lead as any).espelhoPadraoId }), // ⭐ NOVO
				...(consultoriaAtiva ? { espelhoparabiblioteca: true } : { espelho: true }),
				arquivos: lead.arquivos.map((a: any) => ({
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
				arquivos_imagens_espelho: imageUrls.map((url: string, index: number) => ({
					id: `<span class="math-inline">\{lead\.id\}\-espelho\-</span>{index}`,
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

			const espelhoResponse = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!espelhoResponse.ok) {
				const espelhoData = await espelhoResponse.json();
				throw new Error(espelhoData.error || "Erro ao enviar espelho para sistema externo");
			}

			toast("Espelho enviado", {
				description: "Espelho enviado para o sistema externo com sucesso! Aguarde o processamento.",
			});
		} catch (espelhoError: any) {
			console.error("Erro ao enviar espelho para sistema externo:", espelhoError);
			toast("Aviso", { description: "Upload concluído com sucesso, mas houve erro ao enviar para o sistema externo." });
		}
	};

	const handleAnaliseClick = async () => {
		if (lead.analiseUrl) {
			setShowAnaliseDialog(true);
			return;
		}

		if (lead.analisePreliminar) {
			setShowAnalisePreviewDrawer(true);
			return;
		}

		if (lead.aguardandoAnalise) {
			setShowAnaliseDialog(true);
			return;
		}

		try {
			setIsEnviandoAnalise(true);
			updateAnaliseState({ aguardandoAnalise: true });

			console.log("🔌 [Pre-Send] Forçando reconexão SSE para leadId:", lead.id);
			window.dispatchEvent(
				new CustomEvent("force-sse-reconnect", {
					detail: { leadId: lead.id, reason: "pre-analise-send" },
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 2000));
			console.log("✅ [Pre-Send] Aguardo de conexão SSE concluído");

			const apiEndpoint = consultoriaAtiva
				? "/api/admin/leads-chatwit/enviar-consultoriafase2"
				: "/api/admin/leads-chatwit/enviar-analise";

			console.log("📤 [Envio] Enviando análise para processamento...");

			// Promise para o toast da análise
			const analisePromise = async () => {
				const selectedProvider = getColumnProvider("ANALISE_CELL", "OPENAI");
				const response = await fetch(apiEndpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ leadID: lead.id, selectedProvider }),
				});

				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.error || "Erro ao solicitar análise");
				}

				return { type: consultoriaAtiva ? "consultoria" : "analise" };
			};

			// Executar o toast promise e aguardar o resultado
			await toast.promise(analisePromise, {
				loading: consultoriaAtiva
					? "🔍 Enviando consultoria para processamento..."
					: "📊 Enviando análise para processamento...",
				success: (data) => {
					return data.type === "consultoria"
						? "🎉 Consultoria fase 2 enviada com sucesso!"
						: "🎉 Análise enviada com sucesso!";
				},
				error: "Erro ao enviar para processamento",
			});

			console.log("🔄 [Post-Send] Atualizando lead local para aguardandoAnalise: true");
			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					aguardandoAnalise: true,
					analiseProcessada: false,
					_skipDialog: true,
				} as any);
			}

			console.log("✅ [Post-Send] Aguardando notificação SSE para atualização automática...");
			setShowAnaliseDialog(true);
		} catch (error: any) {
			console.error("Erro ao solicitar análise:", error);
			updateAnaliseState({ aguardandoAnalise: false });
			toast("Erro", { description: error.message || "Não foi possível solicitar a análise. Tente novamente." });
		} finally {
			setIsEnviandoAnalise(false);
		}
	};

	const handleContextMenuAction = async (action: ContextAction, data?: any) => {
		document.body.click();
		await new Promise((resolve) => setTimeout(resolve, 100));

		switch (action) {
			case "atualizarLista":
				toast("Atualizando", { description: "Atualizando lista de leads..." });
				break;
			case "abrirLead":
				setDetailsOpen(true);
				break;
			case "reunificarArquivos":
				handleUnificarArquivos(lead.id);
				break;
			case "reconverterImagem":
				handlePdfToImages();
				break;
			case "excluirArquivo":
				if (data) {
					handleDeleteFile(data.id, data.type);
				}
				break;
			case "excluirTodosArquivos":
				setConfirmDeleteAllFiles(true);
				break;
			case "editarProva":
				if (lead.manuscritoProcessado) {
					setShowProvaDialog(true);
				}
				break;
			case "reenviarProva":
				if (data && data.id) {
					setShowManuscritoImageSeletor(true);
				}
				break;
			case "excluirProva":
				if (data && data.id) {
					setManuscritoToDelete(data.id);
					setConfirmDeleteManuscrito(true);
				}
				break;
			case "cancelarProva":
				handleCancelarManuscrito();
				break;
			case "selecionarEspelho":
				setShowEspelhoSeletor(true);
				break;
			case "enviarEspelhoUpload":
				handleOpenFileUpload();
				break;
			case "verEspelho":
				if (lead.espelhoCorrecao || lead.textoDOEspelho) {
					setShowEspelhoDialog(true);
				} else {
					toast("Espelho não encontrado", {
						description: "Não foi possível encontrar o espelho de correção. Crie um novo selecionando imagens.",
					});
				}
				break;
			case "excluirEspelho":
				const temEspelhoParaExcluir =
					lead.espelhoProcessado || lead.espelhoCorrecao || lead.textoDOEspelho || localEspelhoState.hasEspelho;

				if (temEspelhoParaExcluir) {
					setConfirmDeleteEspelho(true);
				} else {
					toast("Aviso", { description: "Não há espelho para excluir." });
				}
				break;
			case "cancelarEspelho":
				handleCancelarEspelho();
				break;
			case "excluirAnalise":
				handleExcluirAnalise();
				break;
			case "excluirRecurso":
				handleExcluirRecurso();
				break;
			case "verAnalise":
				if (localAnaliseState.analiseUrl) {
					setShowAnaliseDialog(true);
				} else if (localAnaliseState.analisePreliminar) {
					setShowAnalisePreviewDrawer(true);
				} else {
					toast("Análise não encontrada", { description: "Não foi possível encontrar a análise." });
				}
				break;
			default:
				break;
		}
	};

	const handleConsultoriaToggle = async (ativo: boolean) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: lead.id,
					consultoriaFase2: ativo,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao atualizar modo consultoria");
			}

			updateConsultoriaState(ativo);

			onEdit({
				...lead,
				consultoriaFase2: ativo,
				_skipDialog: true,
			} as any);

			toast(ativo ? "Consultoria ativada" : "Consultoria desativada", {
				description: ativo
					? "Modo consultoria fase 2 ativado. Agora você pode fazer upload direto do espelho."
					: "Modo consultoria fase 2 desativado. Voltou ao funcionamento normal.",
			});
		} catch (error: any) {
			console.error("Erro ao alterar modo consultoria:", error);
			toast("Erro", { description: error.message || "Não foi possível alterar o modo consultoria." });
		}
	};

	const handleExcluirEspelho = async () => {
		try {
			setConfirmDeleteEspelho(false);

			console.log(`[handleExcluirEspelho] Excluindo espelho do lead: ${lead.id}`);

			const response = await fetch(`/api/admin/leads-chatwit/deletar-espelho?leadId=${lead.id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao excluir espelho");
			}

			const data = await response.json();
			console.log(`[handleExcluirEspelho] Espelho excluído com sucesso:`, data);

			updateEspelhoState({
				hasEspelho: false,
				aguardandoEspelho: false,
				espelhoCorrecao: undefined,
				textoDOEspelho: undefined,
			});

			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					espelhoCorrecao: undefined,
					textoDOEspelho: undefined,
					espelhoProcessado: false,
					aguardandoEspelho: false,
					_skipDialog: true,
					_forceUpdate: true,
				} as any);
			}

			forceRefresh();

			toast("Espelho excluído", { description: "O espelho de correção foi removido completamente com sucesso." });
		} catch (error: any) {
			console.error("[handleExcluirEspelho] Erro ao excluir espelho:", error);
			toast("Erro", { description: error.message || "Não foi possível excluir o espelho. Tente novamente." });
		}
	};

	const handleValidarAnalise = async (analiseData: any) => {
		try {
			setIsEnviandoAnaliseValidada(true);

			const isAnaliseSimulado = consultoriaAtiva;

			const payload = {
				leadID: lead.id,
				analiseData: {
					...analiseData,
					...(isAnaliseSimulado ? { analisesimuladovalidado: true } : { analiseValidada: true }),
				},
			};

			console.log("[ValidarAnalise] Enviando payload:", payload);

			const response = await fetch("/api/admin/leads-chatwit/enviar-analise-validada", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao validar análise");
			}

			updateAnaliseState({
				analiseValidada: true,
				aguardandoAnalise: true,
			});

			toast(isAnaliseSimulado ? "Análise de simulado validada" : "Análise validada", {
				description: isAnaliseSimulado
					? "A análise de simulado foi validada e enviada para gerar o PDF final."
					: "A análise foi validada e enviada para gerar o PDF final.",
			});
		} catch (error: any) {
			console.error("Erro ao validar análise:", error);
			toast("Erro", { description: error.message || "Não foi possível validar a análise. Tente novamente." });
		} finally {
			setIsEnviandoAnaliseValidada(false);
		}
	};

	const handleExecuteDeleteAllFiles = async () => {
		try {
			setConfirmDeleteAllFiles(false);

			toast("Excluindo todos os arquivos", {
				description:
					"Aguarde enquanto excluímos todos os arquivos do lead (arquivos, PDFs, imagens, manuscrito, espelho e análise).",
			});

			const deletePromises = [];

			if (lead.arquivos && lead.arquivos.length > 0) {
				deletePromises.push(...lead.arquivos.map((arquivo) => handleDeleteFile(arquivo.id, "arquivo")));
			}

			if (lead.pdfUnificado) {
				console.log(`[handleExecuteDeleteAllFiles] Iniciando exclusão do PDF: ${lead.pdfUnificado}`);
				deletePromises.push(
					handleDeleteFile(lead.id, "pdf").then(() => {
						console.log(`[handleExecuteDeleteAllFiles] PDF unificado excluído: ${lead.id}`);
					}),
				);
			}

			if (lead.arquivos && lead.arquivos.some((a) => a.pdfConvertido)) {
				deletePromises.push(handleDeleteFile(lead.id, "imagem"));
			}

			if (lead.provaManuscrita || lead.manuscritoProcessado) {
				deletePromises.push(
					fetch(`/api/admin/leads-chatwit/manuscrito?leadId=${lead.id}`, {
						method: "DELETE",
					}).then((response) => {
						if (!response.ok) {
							throw new Error("Erro ao excluir manuscrito");
						}
						return response.json();
					}),
				);
			}

			if (localAnaliseState.analiseUrl || localAnaliseState.analisePreliminar || localAnaliseState.aguardandoAnalise) {
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
							throw new Error("Erro ao excluir análise");
						}
						return response.json();
					}),
				);
			}

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
							throw new Error("Erro ao excluir espelho");
						}
						console.log(`[handleExecuteDeleteAllFiles] Espelho excluído: ${lead.id}`);
						return response.json();
					}),
				);
			}

			await Promise.all(deletePromises);

			console.log(`[handleExecuteDeleteAllFiles] Todas as exclusões concluídas para o lead: ${lead.id}`);

			updateManuscritoState({
				manuscritoProcessado: false,
				aguardandoManuscrito: false,
				provaManuscrita: undefined,
			});

			updateEspelhoState({
				hasEspelho: false,
				aguardandoEspelho: false,
				espelhoCorrecao: undefined,
				textoDOEspelho: undefined,
			});

			updateAnaliseState({
				analiseUrl: undefined,
				aguardandoAnalise: false,
				analisePreliminar: false,
				analiseValidada: false,
			});

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

			console.log(`[handleExecuteDeleteAllFiles] Atualizando lead final:`, {
				id: leadAtualizado.id,
				pdfUnificado: leadAtualizado.pdfUnificado,
				arquivos: leadAtualizado.arquivos.length,
				manuscritoProcessado: leadAtualizado.manuscritoProcessado,
				espelhoProcessado: leadAtualizado.espelhoProcessado,
			});

			await onEdit(leadAtualizado as any);

			forceRefresh();

			toast("Sucesso", {
				description:
					"Todos os arquivos do lead foram excluídos com sucesso! (Arquivos, PDFs, imagens, manuscrito, espelho e análise).",
			});
		} catch (error: any) {
			console.error("Erro ao excluir todos os arquivos:", error);
			toast("Erro", { description: error.message || "Não foi possível excluir todos os arquivos. Tente novamente." });
		}
	};

	const handleExcluirAnalise = async () => {
		try {
			updateAnaliseState({
				analiseUrl: undefined,
				aguardandoAnalise: false,
				analisePreliminar: false,
				analiseValidada: false,
			});

			forceRefresh();

			const payload = {
				id: lead.id,
				analiseUrl: "",
				analiseProcessada: false,
				aguardandoAnalise: false,
				analisePreliminar: false,
				analiseValidada: false,
			};

			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao excluir análise");
			}

			const updatedLead = {
				...lead,
				analiseUrl: undefined,
				analiseProcessada: false,
				aguardandoAnalise: false,
				analisePreliminar: false,
				analiseValidada: false,
				_skipDialog: true,
				_forceUpdate: true,
			};

			await onEdit(updatedLead as any);

			toast("Sucesso", { description: "Análise excluída com sucesso!" });

			setTimeout(() => {
				forceRefresh();
			}, 100);
		} catch (error: any) {
			console.error("Erro ao excluir análise:", error);
			toast("Erro", { description: error.message || "Não foi possível excluir a análise. Tente novamente." });

			updateAnaliseState({
				analiseUrl: lead.analiseUrl,
				aguardandoAnalise: !!lead.aguardandoAnalise,
				analisePreliminar: lead.analisePreliminar,
				analiseValidada: !!lead.analiseValidada,
			});

			forceRefresh();
		}
	};

	const handleExcluirRecurso = async () => {
		try {
			updateRecursoState({
				recursoUrl: undefined,
				aguardandoRecurso: false,
				recursoPreliminar: undefined,
				recursoValidado: false,
			});

			forceRefresh();

			const payload = {
				id: lead.id,
				recursoUrl: null,
				aguardandoRecurso: false,
				recursoPreliminar: null,
				recursoValidado: false,
				fezRecurso: false,
				datasRecurso: null
			};

			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao excluir recurso");
			}

			const updatedLead = {
				...lead,
				recursoUrl: undefined,
				aguardandoRecurso: false,
				recursoPreliminar: undefined,
				recursoValidado: false,
				fezRecurso: false,
				datasRecurso: null,
				_skipDialog: true,
				_forceUpdate: true,
			};

			await onEdit(updatedLead as any);

			toast("Sucesso", { description: "Recurso excluído com sucesso!" });

			setTimeout(() => {
				forceRefresh();
			}, 100);
		} catch (error: any) {
			console.error("Erro ao excluir recurso:", error);
			toast("Erro", { description: error.message || "Não foi possível excluir o recurso. Tente novamente." });

			updateRecursoState({
				recursoUrl: lead.recursoUrl,
				aguardandoRecurso: !!lead.aguardandoRecurso,
				recursoPreliminar: lead.recursoPreliminar,
				recursoValidado: !!lead.recursoValidado,
			});

			forceRefresh();
		}
	};

	const handleSendSelectedImages = async (images: string[]) => {
		try {
			if (images.length === 0) {
				toast("Aviso", { description: "Selecione pelo menos uma imagem." });
				return;
			}

			toast("Enviando imagens", {
				description: `Enviando ${images.length} imagem(ns) selecionada(s)...`,
			});

			toast("Sucesso", { description: "Imagens enviadas com sucesso!" });
		} catch (error: any) {
			console.error("Erro ao enviar imagens:", error);
			toast("Erro", { description: error.message || "Não foi possível enviar as imagens." });
		}
	};

	const handleEnviarEspelho = async (images: string[]) => {
		try {
			if (images.length === 0) {
				toast("Aviso", { description: "Selecione pelo menos uma imagem para o espelho." });
				return;
			}

			setShowEspelhoSeletor(false);
			setIsEnviandoEspelho(true);

			updateEspelhoState({ aguardandoEspelho: true });

			console.log("🔌 [Pre-Send] Forçando reconexão SSE para leadId:", lead.id);
			window.dispatchEvent(
				new CustomEvent("force-sse-reconnect", {
					detail: { leadId: lead.id, reason: "pre-espelho-send" },
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 2000));
			console.log("✅ [Pre-Send] Aguardo de conexão SSE concluído");

			// ⭐ Obter provider selecionado pelo switch no topo da coluna ESPELHO_CELL
			const selectedProvider = getColumnProvider("ESPELHO_CELL", "GEMINI");
			console.log(`[Envio] 🎛️ Provider selecionado para ESPELHO_CELL: ${selectedProvider}`);

			const payload = {
				leadID: lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				telefone: lead.phoneNumber,
				selectedProvider, // ⭐ NOVO: Passa o provider selecionado pelo usuário
				...(consultoriaAtiva ? { espelhoparabiblioteca: true } : { espelho: true }),
				...((lead as any).espelhoPadraoId && { espelhoPadraoId: (lead as any).espelhoPadraoId }),
				arquivos: lead.arquivos.map((a: any) => ({
					id: a.id,
					url: a.dataUrl,
					tipo: a.fileType,
					nome: a.fileType,
				})),
				arquivos_pdf: lead.pdfUnificado
					? [
						{
							id: `${lead.id}-pdf-unificado`,
							url: lead.pdfUnificado,
							nome: "PDF Unificado",
						},
					]
					: [],
				arquivos_imagens_espelho: images.map((url: string, index: number) => ({
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

			console.log("📤 [Envio] Enviando espelho para processamento...");
			const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao enviar espelho para processamento");
			}

			console.log("🔄 [Post-Send] Atualizando lead local para aguardandoEspelho: true");
			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					aguardandoEspelho: true,
					espelhoProcessado: false,
					_skipDialog: true,
				} as any);
			}

			console.log("✅ [Post-Send] Aguardando notificação SSE para atualização automática...");
			setIsEnviandoEspelho(false);
		} catch (error: any) {
			console.error("Erro ao enviar espelho:", error);
			setIsEnviandoEspelho(false);
			updateEspelhoState({ aguardandoEspelho: false });
			toast("Erro", { description: error.message || "Não foi possível processar o espelho. Tente novamente." });
		}
	};

	const handleSaveEspelho = async (texto: any, imagens: string[]) => {
		try {
			console.log(`[handleSaveEspelho] Salvando espelho do lead: ${lead.id}`);
			console.log(`[handleSaveEspelho] Texto:`, texto);
			console.log(`[handleSaveEspelho] Imagens:`, imagens);

			const response = await fetch("/api/admin/leads-chatwit/deletar-espelho", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					leadId: lead.id,
					texto: texto,
					imagens: imagens,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao salvar espelho");
			}

			const data = await response.json();
			console.log(`[handleSaveEspelho] Espelho salvo com sucesso:`, data);

			const hasContent = !!(texto || (imagens && imagens.length > 0));
			updateEspelhoState({
				hasEspelho: hasContent,
				aguardandoEspelho: false,
				espelhoCorrecao: imagens,
				textoDOEspelho: texto,
			});

			if (typeof onEdit === "function") {
				onEdit({
					...lead,
					textoDOEspelho: texto,
					espelhoCorrecao: imagens ? JSON.stringify(imagens) : undefined,
					espelhoProcessado: hasContent,
					aguardandoEspelho: false,
					_skipDialog: true,
				} as any);
			}

			toast("Espelho salvo", { description: "Espelho de correção atualizado com sucesso!" });
		} catch (error: any) {
			console.error("[handleSaveEspelho] Erro ao salvar espelho:", error);
			throw error;
		}
	};

	const handleSaveAnotacoes = async (anotacoes: string) => {
		try {
			await onEdit({
				...lead,
				anotacoes,
				_skipDialog: true,
			} as any);

			toast("Anotações salvas", { description: "Anotações salvas com sucesso!" });
		} catch (error: any) {
			console.error("Erro ao salvar anotações:", error);
			toast("Erro", { description: error.message || "Não foi possível salvar as anotações." });
		}
	};

	const handleEnviarPdf = async (sourceId: string) => {
		try {
			setIsEnviandoPdf(true);

			const response = await fetch("/api/admin/leads-chatwit/enviar-analise", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					leadID: lead.id,
					sourceId,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao enviar PDF para análise");
			}

			updateAnaliseState({ aguardandoAnalise: true });

			toast("PDF enviado", { description: "PDF enviado para análise com sucesso!" });
		} catch (error: any) {
			console.error("Erro ao enviar PDF:", error);
			toast("Erro", { description: error.message || "Não foi possível enviar o PDF." });
		} finally {
			setIsEnviandoPdf(false);
		}
	};

	const handleSaveAnalisePreliminar = async (data: any) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/analise-preliminar", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					leadId: lead.id,
					analisePreliminar: data,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao salvar análise preliminar");
			}

			updateAnaliseState({ analisePreliminar: data });

			await onEdit({
				...lead,
				analisePreliminar: data,
				_skipDialog: true,
			} as any);

			toast("Análise preliminar salva", { description: "Análise preliminar salva com sucesso!" });
		} catch (error: any) {
			console.error("Erro ao salvar análise preliminar:", error);
			toast("Erro", { description: error.message || "Não foi possível salvar a análise preliminar." });
		}
	};

	const handleRecursoClick = async () => {
		console.log(`[HandleRecursoClick] Abrindo dialog de recurso para lead ${lead.id}`);

		// Abrir o dialog de recurso (editor Rich Text)
		// NÃO chamar forceServerRefresh() aqui — isso re-renderiza o pai, remonta o componente e reseta o useState, fechando o dialog instantaneamente
		setShowRecursoDialog(true);
	};

	const handleGerarRecurso = async () => {
		try {
			const selectedProvider = getColumnProvider("RECURSO_CELL", "OPENAI");

			const recursoData = {
				leadID: lead.id,
				leadId: lead.id,
				analiseValidada: localAnaliseState.analisePreliminar,
				selectedProvider,
				dadosAdicionais: {
					nome: lead.nomeReal || lead.name || "Lead sem nome",
					email: lead.email,
					telefone: lead.phoneNumber,
					especialidade: lead.especialidade,
				},
			};

			console.log("[Gerar Recurso] Solicitando geração via AI SDK Interno:", {
				leadId: lead.id,
				temAnalise: Boolean(localAnaliseState.analisePreliminar),
				analiseValidada: localAnaliseState.analiseValidada,
			});

			updateRecursoState({ aguardandoRecurso: true });

			const response = await fetch("/api/admin/leads-chatwit/gerar-recurso-interno", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(recursoData),
			});

			const result = await response.json();

			if (!response.ok) {
				updateRecursoState({ aguardandoRecurso: false });
				toast.error("Erro ao gerar recurso", { description: result.error || "Erro interno ao gerar recurso via AI SDK" });
				return;
			}

			// Atualizar estado local imediatamente com o output da IA
			updateRecursoState({
				aguardandoRecurso: false,
				recursoPreliminar: result.recursoOutput,
			});

			toast.success("Recurso gerado!", {
				description: "O recurso estruturado via AI SDK foi salvo.",
				duration: 4000,
			});
		} catch (error: any) {
			console.error("[Gerar Recurso] Erro:", error);
			updateRecursoState({ aguardandoRecurso: false });
			toast.error("Erro ao gerar recurso", { description: error.message || "Erro inesperado" });
		}
	};

	const handleValidarRecurso = async (data: { html: string; textoRecurso: string; message?: string; accessToken?: string }) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/enviar-recurso-validado", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					leadID: lead.id,
					html: data.html,
					textoRecurso: data.textoRecurso,
					message: data.message,
					accessToken: data.accessToken,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao validar recurso");
			}

			updateRecursoState({
				recursoValidado: true,
				aguardandoRecurso: false,
			});
		} catch (error: any) {
			console.error("[ValidarRecurso] Erro:", error);
			throw error;
		}
	};

	const handleCancelarRecurso = async () => {
		try {
			updateRecursoState({
				aguardandoRecurso: false,
				recursoPreliminar: undefined,
				recursoValidado: false,
			});

			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: lead.id,
					aguardandoRecurso: false,
					recursoPreliminar: null,
					recursoValidado: false,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao cancelar recurso");
			}

			forceRefresh();
		} catch (error: any) {
			console.error("[CancelarRecurso] Erro:", error);
			throw error;
		}
	};

	const handleCancelarManuscrito = async () => {
		try {
			updateManuscritoState({ aguardandoManuscrito: false });
			forceRefresh();

			const payload = {
				id: lead.id,
				aguardandoManuscrito: false,
			};

			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao cancelar processamento do manuscrito");
			}

			const updatedLead = {
				...lead,
				aguardandoManuscrito: false,
				_skipDialog: true,
				_forceUpdate: true,
			};

			await onEdit(updatedLead as any);

			toast("Sucesso", { description: "Processamento do manuscrito cancelado com sucesso!" });

			setTimeout(() => {
				forceRefresh();
			}, 100);
		} catch (error: any) {
			console.error("Erro ao cancelar processamento do manuscrito:", error);
			toast("Erro", { description: error.message || "Não foi possível cancelar o processamento. Tente novamente." });

			updateManuscritoState({ aguardandoManuscrito: !!lead.aguardandoManuscrito });
			forceRefresh();
		}
	};

	const handleCancelarEspelho = async () => {
		try {
			console.log("[Cancelar Espelho] Iniciando cancelamento...");

			setShowEspelhoDialog(false);

			updateEspelhoState({ aguardandoEspelho: false });
			forceRefresh();

			const payload = {
				id: lead.id,
				aguardandoEspelho: false,
				espelhoProcessado: false,
			};

			console.log("[Cancelar Espelho] Enviando payload:", payload);
			console.log("[Cancelar Espelho] Lead atual antes da atualização:", {
				id: lead.id,
				aguardandoEspelho: lead.aguardandoEspelho,
				espelhoProcessado: lead.espelhoProcessado,
			});

			const response = await fetch("/api/admin/leads-chatwit/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const data = await response.json();
				console.error("[Cancelar Espelho] Erro na resposta:", data);
				throw new Error(data.error || "Erro ao cancelar processamento do espelho");
			}

			console.log("[Cancelar Espelho] Resposta OK, atualizando lead...");

			const updatedLead = {
				...lead,
				aguardandoEspelho: false,
				espelhoProcessado: false,
				_skipDialog: true,
				_forceUpdate: true,
			};

			await onEdit(updatedLead as any);

			console.log("[Cancelar Espelho] Lead atualizado com sucesso!");

			toast("Sucesso", { description: "Processamento do espelho cancelado com sucesso!" });

			setTimeout(() => {
				forceRefresh();
			}, 100);
		} catch (error: any) {
			console.error("Erro ao cancelar processamento do espelho:", error);
			toast("Erro", { description: error.message || "Não foi possível cancelar o processamento. Tente novamente." });

			updateEspelhoState({ aguardandoEspelho: !!lead.aguardandoEspelho });
			forceRefresh();
		}
	};

	return {
		handleEditLead,
		handleDelete,
		handleViewDetails,
		handleShowFullImage,
		handleShowGallery,
		handleDeleteFile,
		reloadAfterDelete,
		handleUnificarArquivos,
		handlePdfToImages,
		handleDigitarClick,
		handleEnviarManuscrito,
		handleSaveManuscrito,
		handleExcluirManuscrito,
		handleCancelarManuscrito,
		handleEspelhoClick,
		handleCancelarEspelho,
		handleExcluirEspelho,
		handleOpenFileUpload,
		handleEspelhoFileUpload,
		handleAnaliseClick,
		handleRecursoClick,
		handleGerarRecurso,
		handleValidarRecurso,
		handleCancelarRecurso,
		handleContextMenuAction,
		handleConsultoriaToggle,
		handleValidarAnalise,
		handleExecuteDeleteAllFiles,
		handleExcluirAnalise,
		handleSendSelectedImages,
		handleEnviarEspelho,
		handleSaveEspelho,
		handleSaveAnotacoes,
		handleEnviarPdf,
		handleSaveAnalisePreliminar,
		getConvertedImages: () => getConvertedImages(lead),
	};
}
