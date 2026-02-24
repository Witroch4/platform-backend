"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import type { Node } from "@xyflow/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	FileText,
	Check,
	Clock,
	XCircle,
	FileEdit,
	Plus,
	Trash2,
	Smartphone,
	Search,
	Loader2,
	Link,
	Phone,
	PhoneCall,
	Copy,
	ChevronRight,
	AlertTriangle,
	Lock,
	RefreshCw,
	Settings2,
	Variable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
	TemplateNodeData,
	TemplateButton,
	TemplateCategory,
	TemplateButtonType,
	FlowNodeData,
	InteractiveMessageElement,
	TemplateApprovalStatus,
} from "@/types/flow-builder";
import {
	generateTemplateButtonId,
	validateTemplateNodeData,
	extractVariables,
	TEMPLATE_LIMITS,
	createTemplateButton,
	COPY_CODE_BUTTON_TITLE,
	normalizeMetaComponents,
	metaComponentsToElements,
	type RawMetaComponent,
} from "@/lib/flow-builder/templateElements";
import { generateElementId } from "@/lib/flow-builder/interactiveMessageElements";
import { useApprovedTemplates } from "@/app/admin/mtf-diamante/hooks/useApprovedTemplates";
import MetaMediaUpload, { type MetaMediaFile } from "@/components/custom/MetaMediaUpload";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload } from "lucide-react";

// =============================================================================
// HELPER: Extract data from specialized template nodes (elements array)
// =============================================================================

interface ExtractedTemplateData {
	bodyText: string;
	headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
	headerContent: string;
	headerMediaUrl: string;
	headerMediaHandle: string;
	footerText: string;
	buttons: TemplateButton[];
}

function extractFromElements(elements: InteractiveMessageElement[]): ExtractedTemplateData {
	let bodyText = "";
	let headerType: ExtractedTemplateData["headerType"] = "NONE";
	let headerContent = "";
	let headerMediaUrl = "";
	let headerMediaHandle = "";
	let footerText = "";
	const buttons: TemplateButton[] = [];

	for (const el of elements) {
		switch (el.type) {
			case "body":
				bodyText = "text" in el ? el.text : "";
				break;
			case "footer":
				footerText = "text" in el ? el.text : "";
				break;
			case "header_text":
				headerType = "TEXT";
				headerContent = "text" in el ? el.text : "";
				break;
			case "header_image":
				headerType = "IMAGE";
				headerMediaUrl = "url" in el ? (el.url as string) : "";
				headerMediaHandle = "mediaHandle" in el ? (el.mediaHandle as string) : "";
				break;
			case "button":
				buttons.push({
					id: el.id || generateTemplateButtonId(),
					type: "QUICK_REPLY",
					text: "title" in el ? el.title : "",
				});
				break;
			case "button_url":
				buttons.push({
					id: el.id || generateTemplateButtonId(),
					type: "URL",
					text: "title" in el ? el.title : "",
					url: "url" in el ? el.url : "",
				});
				break;
			case "button_phone":
				buttons.push({
					id: el.id || generateTemplateButtonId(),
					type: "PHONE_NUMBER",
					text: "title" in el ? el.title : "",
					phoneNumber: "phoneNumber" in el ? el.phoneNumber : "",
				});
				break;
			case "button_copy_code":
				buttons.push({
					id: el.id || generateTemplateButtonId(),
					type: "COPY_CODE",
					text: COPY_CODE_BUTTON_TITLE, // Título fixo exigido pela Meta API
					exampleCode: "couponCode" in el ? (el.couponCode as string) : "",
				});
				break;
			case "button_voice_call":
				buttons.push({
					id: el.id || generateTemplateButtonId(),
					type: "VOICE_CALL",
					text: "title" in el ? el.title : "Ligar WhatsApp",
					ttlMinutes: "ttlMinutes" in el ? (el.ttlMinutes as number) : 10080,
				});
				break;
		}
	}

	return { bodyText, headerType, headerContent, headerMediaUrl, headerMediaHandle, footerText, buttons };
}

// =============================================================================
// HELPERS: normalize components (delegates to shared utility)
// =============================================================================

/** Verifica se o template tem header IMAGE e retorna a URL pública já armazenada, se houver. */
function getTemplateImageInfo(template: { components?: unknown } | null): {
	hasImage: boolean;
	storedMediaUrl: string | null;
} {
	if (!template?.components) return { hasImage: false, storedMediaUrl: null };
	const comps = template.components as Record<string, unknown>;
	const header = normalizeMetaComponents(comps).find((c) => c.type === "HEADER" && c.format === "IMAGE");
	const storedMediaUrl = !Array.isArray(comps) ? (comps.publicMediaUrl as string | undefined) ?? null : null;
	return { hasImage: !!header, storedMediaUrl };
}

// =============================================================================
// TYPES
// =============================================================================

interface TemplateConfigDialogProps {
	node: Node | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
	caixaId: string;
}

interface WhatsAppTemplate {
	id: string;
	name: string;
	status: "APPROVED" | "PENDING" | "REJECTED";
	category: string;
	language: string;
	components?: Array<{
		type: string;
		text?: string;
		format?: string;
		buttons?: Array<{ type: string; text: string }>;
	}>;
}

// =============================================================================
// STATUS HELPERS
// =============================================================================

function getStatusIcon(status: TemplateNodeData["status"]) {
	switch (status) {
		case "APPROVED":
			return <Check className="h-3 w-3" />;
		case "PENDING":
			return <Clock className="h-3 w-3" />;
		case "REJECTED":
			return <XCircle className="h-3 w-3" />;
		case "DRAFT":
		default:
			return <FileEdit className="h-3 w-3" />;
	}
}

function getStatusColors(status: TemplateNodeData["status"]) {
	switch (status) {
		case "APPROVED":
			return "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-800";
		case "PENDING":
			return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800";
		case "REJECTED":
			return "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800";
		case "DRAFT":
		default:
			return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700";
	}
}

function getStatusLabel(status: TemplateNodeData["status"]) {
	switch (status) {
		case "APPROVED":
			return "Aprovado";
		case "PENDING":
			return "Pendente";
		case "REJECTED":
			return "Rejeitado";
		case "DRAFT":
		default:
			return "Rascunho";
	}
}

// =============================================================================
// WHATSAPP PREVIEW
// =============================================================================

interface TemplatePreviewProps {
	header?: { type: string; content?: string; mediaUrl?: string; isLoadingMedia?: boolean };
	body?: string;
	footer?: string;
	buttons?: Array<{ text: string; type: string }>;
}

function TemplatePreview({ header, body, footer, buttons }: TemplatePreviewProps) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";
	const [imageError, setImageError] = useState(false);

	// Reseta erro quando a URL muda
	useEffect(() => {
		setImageError(false);
	}, [header?.mediaUrl]);

	const hasContent = header?.content || header?.mediaUrl || body || footer || (buttons && buttons.length > 0);

	// Parse variables in text
	const renderText = (text: string) => {
		return text.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
			return `[${varName}]`;
		});
	};

	return (
		<div className="flex flex-col items-center">
			<div className="flex items-center gap-2 mb-3 text-muted-foreground">
				<Smartphone className="h-4 w-4" />
				<span className="text-xs font-medium">Preview WhatsApp</span>
			</div>

			<div
				className={cn(
					"w-[260px] rounded-2xl overflow-hidden shadow-lg border",
					isDark ? "bg-[#0b141a]" : "bg-[#efeae2]",
				)}
			>
				{/* WhatsApp header bar */}
				<div className={cn("px-3 py-2 flex items-center gap-2", isDark ? "bg-[#202c33]" : "bg-[#075e54]")}>
					<div className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center">
						<span className="text-white text-xs font-bold">C</span>
					</div>
					<div className="flex-1">
						<p className="text-white text-sm font-medium">Chatwit</p>
						<p className="text-white/70 text-[10px]">online</p>
					</div>
				</div>

				{/* Message area */}
				<div className="p-3 min-h-[280px] max-h-[350px] overflow-y-auto">
					{!hasContent ? (
						<div className="flex items-center justify-center h-[250px]">
							<p className={cn("text-xs text-center px-4", isDark ? "text-gray-500" : "text-gray-400")}>
								Configure o template para ver o preview
							</p>
						</div>
					) : (
						<div className="flex justify-start">
							<div
								className={cn(
									"max-w-[220px] rounded-lg overflow-hidden shadow-sm",
									isDark ? "bg-[#202c33]" : "bg-white",
								)}
							>
								{/* Header */}
								{header?.type === "TEXT" && header.content && (
									<div className="px-2.5 pt-2.5">
										<p className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>
											{renderText(header.content)}
										</p>
									</div>
								)}
								{["IMAGE", "VIDEO"].includes(header?.type || "") && (
									<div className="w-full h-28 bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
										{header?.isLoadingMedia ? (
											<div className="w-full h-full animate-pulse bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
												<Loader2 className="h-4 w-4 animate-spin text-gray-400" />
											</div>
										) : header?.mediaUrl && !imageError ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={header.mediaUrl}
												alt=""
												className="w-full h-full object-cover"
												onError={() => setImageError(true)}
											/>
										) : (
											<span className="text-xs text-gray-400">
												{header?.type === "IMAGE" ? "🖼️ Imagem" : "🎬 Vídeo"}
											</span>
										)}
									</div>
								)}
								{header?.type === "DOCUMENT" && (
									<div className="w-full h-14 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
										<span className="text-xs text-gray-400">📄 Documento</span>
									</div>
								)}

								{/* Body */}
								<div className="p-2.5 space-y-1">
									{body && (
										<p
											className={cn(
												"text-sm break-words whitespace-pre-wrap",
												isDark ? "text-gray-200" : "text-gray-800",
											)}
										>
											{renderText(body)}
										</p>
									)}

									{/* Footer */}
									{footer && (
										<p className={cn("text-[11px] mt-1", isDark ? "text-gray-400" : "text-gray-500")}>{footer}</p>
									)}

									{/* Timestamp */}
									<div className="flex justify-end">
										<span className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-400")}>
											{new Date().toLocaleTimeString("pt-BR", {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</div>
								</div>

								{/* Buttons */}
								{buttons && buttons.length > 0 && (
									<div className={cn("border-t", isDark ? "border-gray-700" : "border-gray-100")}>
										{buttons.map((btn, idx) => (
											<div
												key={idx}
												className={cn(
													"w-full px-3 py-2 text-center text-sm font-medium flex items-center justify-center gap-1.5",
													isDark ? "text-[#00a884] border-gray-700" : "text-[#00a884] border-gray-100",
													idx < buttons.length - 1 && "border-b",
												)}
											>
												{btn.type === "URL" && <Link className="h-3 w-3" />}
												{btn.type === "PHONE_NUMBER" && <Phone className="h-3 w-3" />}
												{btn.type === "VOICE_CALL" && <PhoneCall className="h-3 w-3" />}
												{btn.type === "COPY_CODE" && <Copy className="h-3 w-3" />}
												{btn.type === "QUICK_REPLY" && <ChevronRight className="h-3 w-3" />}
												{btn.text || "Botão"}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// =============================================================================
// TEMPLATE CONFIG DIALOG
// =============================================================================

export function TemplateConfigDialog({
	node,
	open,
	onOpenChange,
	onUpdateNodeData,
	caixaId,
}: TemplateConfigDialogProps) {
	const [mode, setMode] = useState<"import" | "create">("create");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isEditingApproved, setIsEditingApproved] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);

	// Use SWR hook for approved templates (only fetch when dialog is open in import mode)
	const { templates, isLoading } = useApprovedTemplates(caixaId, !open || mode !== "import");

	// Media resolution para preview de IMAGE no modo import
	const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null);
	const [isResolvingMedia, setIsResolvingMedia] = useState(false);

	useEffect(() => {
		if (!selectedTemplate) {
			setResolvedMediaUrl(null);
			setIsResolvingMedia(false);
			return;
		}

		const { hasImage, storedMediaUrl } = getTemplateImageInfo(selectedTemplate);

		if (!hasImage) {
			setResolvedMediaUrl(null);
			return;
		}

		if (storedMediaUrl) {
			setResolvedMediaUrl(storedMediaUrl);
			return;
		}

		// Sem URL pública: chamar template-info para baixar e subir pro MinIO
		setIsResolvingMedia(true);
		setResolvedMediaUrl(null);

		// selectedTemplate.id é o metaTemplateId numérico — a Graph API exige o ID, não o nome
		fetch(`/api/admin/mtf-diamante/template-info?template=${encodeURIComponent(selectedTemplate.id)}`)
			.then((r) => r.json())
			.then((data) => {
				setResolvedMediaUrl((data?.template?.publicMediaUrl as string) || null);
			})
			.catch(() => setResolvedMediaUrl(null))
			.finally(() => setIsResolvingMedia(false));
	}, [selectedTemplate]);

	// Form state
	const [templateName, setTemplateName] = useState("");
	const [category, setCategory] = useState<TemplateCategory>("MARKETING");
	const [language, setLanguage] = useState("pt_BR");
	const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE");
	const [headerContent, setHeaderContent] = useState("");
	const [headerMediaUrl, setHeaderMediaUrl] = useState("");
	const [bodyText, setBodyText] = useState("");
	const [footerText, setFooterText] = useState("");
	const [buttons, setButtons] = useState<TemplateButton[]>([]);

	// Runtime parameters state (editáveis mesmo para templates aprovados)
	const [runtimeMediaUrl, setRuntimeMediaUrl] = useState("");
	const [runtimeVariables, setRuntimeVariables] = useState<Record<string, string>>({});
	const [runtimeButtonParams, setRuntimeButtonParams] = useState<Record<number, { couponCode?: string }>>({});

	// Upload de mídia
	const [headerMediaMode, setHeaderMediaMode] = useState<"url" | "upload">("upload");
	const [uploadedFiles, setUploadedFiles] = useState<MetaMediaFile[]>([]);
	const [headerMediaHandle, setHeaderMediaHandle] = useState<string | null>(null);

	// Extract current node data
	const nodeData = useMemo(() => {
		if (!node) return null;
		return node.data as unknown as TemplateNodeData;
	}, [node]);

	// Helper: determina se campos estruturais devem ser bloqueados
	const isFieldLocked = useCallback((status: TemplateApprovalStatus | undefined) => {
		return status === "APPROVED" || status === "PENDING";
	}, []);

	const canEdit = !isFieldLocked(nodeData?.status) || isEditingApproved;

	// Recuperar metaTemplateId do banco quando não está no node data
	// (templates criados antes do fix que salvava metaTemplateId no node)
	useEffect(() => {
		if (!open || !node || !nodeData?.templateName) return;
		if (nodeData.metaTemplateId) return; // Já tem
		if (nodeData.status !== "PENDING" && nodeData.status !== "APPROVED") return;

		const fetchMetaId = async () => {
			try {
				const res = await fetch(`/api/admin/mtf-diamante/templates?caixaId=${caixaId}`);
				if (!res.ok) return;
				const data = await res.json();
				const templatesList = data.templates || [];
				const match = templatesList.find(
					(t: { name?: string; id?: string }) => t.name === nodeData.templateName && t.id,
				);
				if (match?.id) {
					console.log(`[TemplateConfigDialog] metaTemplateId recuperado do banco: ${match.id}`);
					onUpdateNodeData(node.id, { metaTemplateId: match.id });
				}
			} catch (err) {
				console.error("[TemplateConfigDialog] Erro ao buscar metaTemplateId:", err);
			}
		};
		fetchMetaId();
	}, [open, node, nodeData?.templateName, nodeData?.metaTemplateId, nodeData?.status, caixaId, onUpdateNodeData]);

	// Função para verificar status do template na Meta
	const handleRefreshStatus = useCallback(async () => {
		if (!nodeData?.metaTemplateId || !node) return;

		setIsRefreshing(true);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/templates/${caixaId}/${nodeData.metaTemplateId}/status`);
			const data = await res.json();

			if (!res.ok) {
				toast.error(data.error || "Erro ao verificar status");
				return;
			}

			if (data.statusChanged) {
				onUpdateNodeData(node.id, { status: data.status as TemplateApprovalStatus });
				toast.success(`Status atualizado: ${getStatusLabel(data.status)}`);
			} else {
				toast.info(`Status atual: ${getStatusLabel(data.status)}`);
			}
		} catch (error) {
			console.error("Error refreshing status:", error);
			toast.error("Erro ao verificar status do template");
		} finally {
			setIsRefreshing(false);
		}
	}, [nodeData?.metaTemplateId, node, onUpdateNodeData, caixaId]);

	// Função para duplicar template como novo (rascunho editável)
	const handleDuplicate = useCallback(() => {
		if (!node || !nodeData) return;

		const newName = templateName
			? `${templateName.replace(/_v\d+$/, "")}_v${Date.now() % 1000}`
			: `template_${Date.now() % 10000}`;

		onUpdateNodeData(node.id, {
			...nodeData,
			status: "DRAFT",
			templateId: undefined,
			metaTemplateId: undefined,
			templateName: newName,
			mode: "create",
		} as Partial<TemplateNodeData>);

		setTemplateName(newName);
		toast.success("Template duplicado como rascunho. Você pode editar e reenviar.");
	}, [node, nodeData, templateName, onUpdateNodeData]);

	// Função para ativar modo de edição de template aprovado
	const handleEditApproved = useCallback(() => {
		setIsEditingApproved(true);
		toast.info("Modo de edição ativado. Após salvar, o template será reenviado para validação da Meta.");
	}, []);

	// Initialize form from node data
	useEffect(() => {
		if (!nodeData) return;

		// Se template já configurado (APPROVED/PENDING), mostrar form de edição de parâmetros
		// Se não configurado, mostrar lista de importação
		if (nodeData.templateId && (nodeData.status === "APPROVED" || nodeData.status === "PENDING")) {
			setMode("create"); // Mostra o form com campos editáveis
		} else if (nodeData.templateId) {
			setMode("import");
		} else {
			setMode(nodeData.mode === "import" ? "import" : "create");
		}

		setTemplateName(nodeData.templateName || "");
		setCategory(nodeData.category || "MARKETING");
		setLanguage(nodeData.language || "pt_BR");

		// Check if node uses elements array (specialized templates)
		const rawData = nodeData as unknown as Record<string, unknown>;
		const elements = rawData.elements as InteractiveMessageElement[] | undefined;

		if (elements && elements.length > 0) {
			// Extract data from elements array (ButtonTemplate, UrlTemplate, etc.)
			const extracted = extractFromElements(elements);
			setHeaderType(extracted.headerType);
			setHeaderContent(extracted.headerContent);
			setBodyText(extracted.bodyText);
			setButtons(extracted.buttons);
			setFooterText(extracted.footerText);
			setHeaderMediaUrl(extracted.headerMediaUrl);
			setHeaderMediaHandle(extracted.headerMediaHandle || null);
		} else {
			// Traditional format (TemplateNode)
			setHeaderType(nodeData.header?.type || "NONE");
			setHeaderContent(nodeData.header?.content || "");
			setHeaderMediaUrl(nodeData.header?.mediaUrl || "");
			setHeaderMediaHandle(null); // Não tem handle no formato tradicional
			setBodyText(nodeData.body?.text || "");
			setFooterText(nodeData.footer?.text || "");
			setButtons(nodeData.buttons || []);
		}

		// Initialize runtime parameters (editáveis mesmo para templates aprovados)
		const rawNodeData = nodeData as unknown as Record<string, unknown>;
		setRuntimeMediaUrl((rawNodeData.runtimeMediaUrl as string) || nodeData.header?.mediaUrl || "");
		setRuntimeVariables((rawNodeData.runtimeVariables as Record<string, string>) || {});
		setRuntimeButtonParams((rawNodeData.runtimeButtonParams as Record<number, { couponCode?: string }>) || {});
	}, [nodeData]);

	// Reset selected template and edit mode when dialog closes
	useEffect(() => {
		if (!open) {
			setSelectedTemplate(null);
			setIsEditingApproved(false);
		}
	}, [open]);

	// Filter templates by search
	const filteredTemplates = useMemo(() => {
		if (!searchQuery.trim()) return templates;
		const q = searchQuery.toLowerCase();
		return templates.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
	}, [templates, searchQuery]);

	// Extract body variables
	const bodyVariables = useMemo(() => extractVariables(bodyText), [bodyText]);
	const headerVariables = useMemo(
		() => (headerType === "TEXT" ? extractVariables(headerContent) : []),
		[headerType, headerContent],
	);

	// Validation
	const validation = useMemo(() => {
		const data: TemplateNodeData = {
			label: templateName,
			isConfigured: false,
			mode: "create",
			status: "DRAFT",
			templateName,
			category,
			language,
			header:
				headerType !== "NONE" ? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl } : undefined,
			body: { text: bodyText, variables: bodyVariables },
			footer: footerText ? { text: footerText } : undefined,
			buttons,
		};
		const result = validateTemplateNodeData(data);
		// Debug validation
		if (!result.valid) {
			console.log("[TemplateConfigDialog] Validation failed:", result.errors);
		}
		return result;
	}, [
		templateName,
		category,
		language,
		headerType,
		headerContent,
		headerMediaUrl,
		bodyText,
		bodyVariables,
		footerText,
		buttons,
	]);

	// Handle import template
	const handleImportTemplate = useCallback(
		(template: WhatsAppTemplate) => {
			if (!node) return;

			// Suporta array e indexed-object (com publicMediaUrl)
			const comps = normalizeMetaComponents(template.components);
			const headerComp = comps.find((c) => c.type === "HEADER");
			const bodyComp = comps.find((c) => c.type === "BODY");
			const footerComp = comps.find((c) => c.type === "FOOTER");
			const buttonsComp = comps.find((c) => c.type === "BUTTONS");

			// Converter para sistema unificado de elementos (igual Mensagem Interativa)
			// Inclui a publicMediaUrl já resolvida no header_image
			const elements = metaComponentsToElements(comps, resolvedMediaUrl);
			const buttonIds = elements.filter((e) => e.type.startsWith("button")).map((e) => e.id);

			// Legacy buttons (backward compat com TemplateNodeData)
			const importedButtons: TemplateButton[] =
				buttonsComp?.buttons?.map((btn) => ({
					id: generateTemplateButtonId(),
					type: (btn.type as TemplateButtonType) || "QUICK_REPLY",
					text: btn.text,
				})) || [];

			onUpdateNodeData(node.id, {
				label: template.name,
				isConfigured: true,
				mode: "import",
				status: template.status as TemplateNodeData["status"],
				templateId: template.id,
				metaTemplateId: template.id,
				templateName: template.name,
				category: template.category as TemplateCategory,
				language: template.language,
				// Sistema unificado de elementos (renderizado no canvas)
				elements,
				buttonIds,
				// Legacy fields (backward compat)
				header:
					headerComp?.format === "TEXT"
						? { type: "TEXT", content: headerComp.text }
						: headerComp?.format
							? {
								type: headerComp.format as "IMAGE" | "VIDEO" | "DOCUMENT",
								mediaUrl: resolvedMediaUrl || undefined,
							}
							: undefined,
				body: bodyComp?.text ? { text: bodyComp.text, variables: extractVariables(bodyComp.text) } : undefined,
				footer: footerComp?.text ? { text: footerComp.text } : undefined,
				buttons: importedButtons,
				importedComponents: template.components,
				// Salvar URL original para permitir restauração posterior
				originalHeaderMediaUrl: resolvedMediaUrl || undefined,
			} as Partial<FlowNodeData>);

			toast.success(`Template "${template.name}" importado com ${elements.length} elementos`);
			onOpenChange(false);
		},
		[node, onUpdateNodeData, onOpenChange, resolvedMediaUrl],
	);

	// =============================================================================
	// SYNC IN REAL-TIME: commitTemplateData (similar to InteractiveMessage)
	// =============================================================================
	// This function is called on every field change to keep canvas in sync
	const commitTemplateData = useCallback(
		(overrides?: {
			name?: string;
			cat?: TemplateCategory;
			lang?: string;
			hType?: typeof headerType;
			hContent?: string;
			hMediaUrl?: string;
			hMediaHandle?: string | null;
			bText?: string;
			fText?: string;
			btns?: TemplateButton[];
		}) => {
			if (!node || !canEdit) return;

			const name = overrides?.name ?? templateName;
			const cat = overrides?.cat ?? category;
			const lang = overrides?.lang ?? language;
			const hType = overrides?.hType ?? headerType;
			const hContent = overrides?.hContent ?? headerContent;
			const hMediaUrl = overrides?.hMediaUrl ?? headerMediaUrl;
			const hMediaHandle = overrides?.hMediaHandle !== undefined ? overrides.hMediaHandle : headerMediaHandle;
			const bText = overrides?.bText ?? bodyText;
			const fText = overrides?.fText ?? footerText;
			const btns = overrides?.btns ?? buttons;

			// Reconstruct elements array for visual consistency on canvas
			const newElements: InteractiveMessageElement[] = [];

			// Header
			if (hType !== "NONE") {
				if (hType === "TEXT") {
					newElements.push({
						id: generateElementId("header_text"),
						type: "header_text",
						text: hContent,
					});
				} else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(hType)) {
					newElements.push({
						id: generateElementId("header_image"),
						type: "header_image",
						url: hMediaUrl,
						caption: "",
						mediaHandle: hMediaHandle || undefined,
					});
				}
			}

			// Body
			if (bText) {
				newElements.push({
					id: generateElementId("body"),
					type: "body",
					text: bText,
				});
			}

			// Footer
			if (fText) {
				newElements.push({
					id: generateElementId("footer"),
					type: "footer",
					text: fText,
				});
			}

			// Buttons (preserve IDs to keep connections)
			btns.forEach((btn) => {
				if (btn.type === "URL") {
					newElements.push({
						id: btn.id,
						type: "button_url",
						title: btn.text,
						url: btn.url || "",
					});
				} else if (btn.type === "PHONE_NUMBER") {
					newElements.push({
						id: btn.id,
						type: "button_phone",
						title: btn.text,
						phoneNumber: btn.phoneNumber || "",
					});
				} else if (btn.type === "COPY_CODE") {
					newElements.push({
						id: btn.id,
						type: "button_copy_code",
						title: btn.text,
						couponCode: btn.exampleCode || "",
					});
				} else if (btn.type === "VOICE_CALL") {
					newElements.push({
						id: btn.id,
						type: "button_voice_call",
						title: btn.text,
						ttlMinutes: btn.ttlMinutes || 10080,
					});
				} else {
					// QUICK_REPLY
					newElements.push({
						id: btn.id,
						type: "button",
						title: btn.text,
					});
				}
			});

			const hVars = hType === "TEXT" ? extractVariables(hContent) : [];
			const bVars = extractVariables(bText);

			// Build template data
			const templateData: Partial<TemplateNodeData> & { elements?: unknown } = {
				label: name || "Template",
				isConfigured: bText.trim().length > 0,
				mode: "create",
				status: nodeData?.status || "DRAFT",
				templateName: name,
				category: cat,
				language: lang,
				header:
					hType !== "NONE"
						? {
								type: hType,
								content: hType === "TEXT" ? hContent : undefined,
								mediaUrl: ["IMAGE", "VIDEO", "DOCUMENT"].includes(hType) ? hMediaUrl : undefined,
								mediaHandle: ["IMAGE", "VIDEO", "DOCUMENT"].includes(hType) ? (hMediaHandle || undefined) : undefined,
								variables: hVars,
							}
						: undefined,
				body: {
					text: bText,
					variables: bVars,
					namedParams: bVars.map((v) => ({ name: v, example: `exemplo_${v}` })),
				},
				footer: fText ? { text: fText } : undefined,
				buttons: btns,
				elements: newElements,
			};

			onUpdateNodeData(node.id, templateData);
		},
		[
			node,
			canEdit,
			nodeData?.status,
			templateName,
			category,
			language,
			headerType,
			headerContent,
			headerMediaUrl,
			headerMediaHandle,
			bodyText,
			footerText,
			buttons,
			onUpdateNodeData,
		],
	);

	// Handle submit to Meta
	const handleSubmitToMeta = useCallback(async () => {
		if (!node) return;

		// Validate
		if (!validation.valid) {
			toast.error(validation.errors[0]);
			return;
		}

		if (!templateName) {
			toast.error("Nome do template é obrigatório para enviar à Meta");
			return;
		}

		setIsSubmitting(true);

		try {
			// Build payload for Meta API
			const payload = {
				name: templateName,
				category,
				language,
				components: [] as Array<Record<string, unknown>>,
				parameter_format: "NAMED",
			};

			// Add header component
			if (headerType !== "NONE") {
				const headerComp: Record<string, unknown> = { type: "HEADER" };
				if (headerType === "TEXT") {
					headerComp.format = "TEXT";
					headerComp.text = headerContent;
					if (headerVariables.length > 0) {
						headerComp.example = { header_text: headerVariables.map((v) => `exemplo_${v}`) };
					}
				} else {
					// Para IMAGE, VIDEO, DOCUMENT - precisa do header_handle (obrigatório pela API Meta)
					headerComp.format = headerType;
					if (headerMediaHandle) {
						headerComp.example = {
							header_handle: [headerMediaHandle],
							_minioUrl: headerMediaUrl, // URL do MinIO para salvar no banco
						};
					} else if (headerMediaUrl) {
						// Fallback: se temos URL mas não handle, a API vai falhar
						// mas registramos para debug
						console.warn("[TemplateConfigDialog] Mídia sem header_handle - upload para Meta API necessário");
						toast.error("Faça upload da mídia antes de enviar (precisa do handle da Meta)");
						return;
					}
				}
				payload.components.push(headerComp);
			}

			// Add body component
			payload.components.push({
				type: "BODY",
				text: bodyText,
				...(bodyVariables.length > 0 && {
					example: { body_text: [bodyVariables.map((v) => `exemplo_${v}`)] },
				}),
			});

			// Add footer component
			if (footerText) {
				payload.components.push({
					type: "FOOTER",
					text: footerText,
				});
			}

			// Add buttons component
			if (buttons.length > 0) {
				payload.components.push({
					type: "BUTTONS",
					buttons: buttons.map((btn) => {
						const metaBtn: Record<string, unknown> = {
							type: btn.type,
							text: btn.text,
						};
						if (btn.type === "URL" && btn.url) metaBtn.url = btn.url;
						if (btn.type === "PHONE_NUMBER" && btn.phoneNumber) metaBtn.phone_number = btn.phoneNumber;
						if (btn.type === "VOICE_CALL") metaBtn.ttl_minutes = btn.ttlMinutes || 10080;
						if (btn.type === "COPY_CODE" && btn.exampleCode) metaBtn.example = [btn.exampleCode];
						return metaBtn;
					}),
				});
			}

			// Submit to API - Use PUT if editing an existing template
			const isEditing = isEditingApproved && nodeData?.metaTemplateId;
			const url = isEditing
				? `/api/admin/mtf-diamante/templates/edit/${nodeData.metaTemplateId}`
				: "/api/admin/mtf-diamante/templates";
			const method = isEditing ? "PUT" : "POST";

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || (isEditing ? "Erro ao editar template" : "Erro ao criar template"));
			}

			const result = await response.json();

			// Extrair o metaTemplateId da resposta da API
			// A API retorna: { result: { id, status }, template: { id, name, status } }
			const metaId = result.metaTemplateId || result.result?.id || result.template?.id || result.id;

			// Update node with pending status and template ID
			// Reconstruct elements array for visual consistency (same as handleSaveTemplate)
			const newElements: InteractiveMessageElement[] = [];

			// Header
			if (headerType !== "NONE") {
				if (headerType === "TEXT") {
					newElements.push({
						id: generateElementId("header_text"),
						type: "header_text",
						text: headerContent,
					});
				} else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
					newElements.push({
						id: generateElementId("header_image"),
						type: "header_image",
						url: headerMediaUrl,
						caption: "",
					});
				}
			}

			// Body
			if (bodyText) {
				newElements.push({
					id: generateElementId("body"),
					type: "body",
					text: bodyText,
				});
			}

			// Footer
			if (footerText) {
				newElements.push({
					id: generateElementId("footer"),
					type: "footer",
					text: footerText,
				});
			}

			// Buttons (preserve IDs)
			buttons.forEach((btn) => {
				if (btn.type === "URL") {
					newElements.push({
						id: btn.id,
						type: "button_url",
						title: btn.text,
						url: btn.url || "",
					});
				} else if (btn.type === "PHONE_NUMBER") {
					newElements.push({
						id: btn.id,
						type: "button_phone",
						title: btn.text,
						phoneNumber: btn.phoneNumber || "",
					});
				} else if (btn.type === "COPY_CODE") {
					newElements.push({
						id: btn.id,
						type: "button_copy_code",
						title: btn.text,
						couponCode: btn.exampleCode || "",
					});
				} else if (btn.type === "VOICE_CALL") {
					newElements.push({
						id: btn.id,
						type: "button_voice_call",
						title: btn.text,
						ttlMinutes: btn.ttlMinutes || 10080,
					});
				} else {
					// QUICK_REPLY
					newElements.push({
						id: btn.id,
						type: "button",
						title: btn.text,
					});
				}
			});

			// Update node with pending status and template ID
			const updateData: Partial<TemplateNodeData> & { elements?: unknown } = {
				label: templateName,
				isConfigured: true,
				mode: "create",
				status: "PENDING",
				templateId: result.templateId || result.id,
				metaTemplateId: metaId,
				templateName,
				category,
				language,
				header:
					headerType !== "NONE"
						? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl, variables: headerVariables }
						: undefined,
				body: { text: bodyText, variables: bodyVariables },
				footer: footerText ? { text: footerText } : undefined,
				buttons,
				elements: newElements,
			};

			onUpdateNodeData(node.id, updateData);

			// Reset edit mode and show appropriate message
			setIsEditingApproved(false);
			toast.success(isEditing
				? "Template atualizado e reenviado para validação da Meta"
				: "Template enviado para aprovação da Meta"
			);
			onOpenChange(false);
		} catch (error) {
			console.error("Error submitting template:", error);
			toast.error(error instanceof Error ? error.message : "Erro ao enviar template");
		} finally {
			setIsSubmitting(false);
		}
	}, [
		node,
		nodeData?.metaTemplateId,
		isEditingApproved,
		validation,
		templateName,
		category,
		language,
		headerType,
		headerContent,
		headerMediaUrl,
		headerMediaHandle,
		headerVariables,
		bodyText,
		bodyVariables,
		footerText,
		buttons,
		onUpdateNodeData,
		onOpenChange,
	]);

	// Add button
	const handleAddButton = useCallback(
		(type: TemplateButtonType) => {
			if (buttons.length >= TEMPLATE_LIMITS.maxButtons) {
				toast.error(`Máximo de ${TEMPLATE_LIMITS.maxButtons} botões`);
				return;
			}
			const newButtons = [...buttons, createTemplateButton(type, "Novo botão")];
			setButtons(newButtons);
			commitTemplateData({ btns: newButtons });
		},
		[buttons, commitTemplateData],
	);

	// Remove button
	const handleRemoveButton = useCallback(
		(index: number) => {
			const newButtons = buttons.filter((_, i) => i !== index);
			setButtons(newButtons);
			commitTemplateData({ btns: newButtons });
		},
		[buttons, commitTemplateData],
	);

	// Update button
	const handleUpdateButton = useCallback(
		(index: number, updates: Partial<TemplateButton>) => {
			const newButtons = buttons.map((btn, i) => (i === index ? { ...btn, ...updates } : btn));
			setButtons(newButtons);
			return newButtons; // Return for onBlur usage
		},
		[buttons],
	);

	// Commit button update (called on blur)
	const commitButtonUpdate = useCallback(
		(index: number, updates: Partial<TemplateButton>) => {
			const newButtons = buttons.map((btn, i) => (i === index ? { ...btn, ...updates } : btn));
			commitTemplateData({ btns: newButtons });
		},
		[buttons, commitTemplateData],
	);

	// Handle media upload complete
	const handleMediaUploadComplete = useCallback(
		(mediaHandle: string, file: MetaMediaFile) => {
			if (file.url) {
				setHeaderMediaUrl(file.url);
				setHeaderMediaHandle(mediaHandle);
				commitTemplateData({ hMediaUrl: file.url, hMediaHandle: mediaHandle });
				toast.success("Mídia carregada com sucesso para API Meta");
				console.log(`[TemplateConfigDialog] Mídia carregada - URL: ${file.url}, Handle: ${mediaHandle}`);
			}
		},
		[commitTemplateData],
	);

	// Save runtime parameters (para templates aprovados)
	const handleSaveRuntimeParams = useCallback(() => {
		if (!node || !nodeData) return;

		// Atualizar header.mediaUrl se tiver imagem e runtimeMediaUrl foi alterado
		const updatedHeader = nodeData.header ? { ...nodeData.header } : undefined;
		if (updatedHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(updatedHeader.type || "")) {
			updatedHeader.mediaUrl = runtimeMediaUrl || updatedHeader.mediaUrl;
		}

		// Atualizar elements se existirem (para atualizar a URL da imagem no canvas)
		const rawData = nodeData as unknown as Record<string, unknown>;
		let updatedElements = rawData.elements as InteractiveMessageElement[] | undefined;
		if (updatedElements && runtimeMediaUrl) {
			updatedElements = updatedElements.map((el) => {
				if (el.type === "header_image") {
					return { ...el, url: runtimeMediaUrl };
				}
				// Atualizar couponCode nos botões COPY_CODE
				if (el.type === "button_copy_code") {
					const btnIndex = updatedElements!.filter((e) => e.type.startsWith("button")).indexOf(el);
					const btnParams = runtimeButtonParams[btnIndex];
					if (btnParams?.couponCode) {
						return { ...el, couponCode: btnParams.couponCode };
					}
				}
				return el;
			});
		}

		onUpdateNodeData(node.id, {
			header: updatedHeader,
			elements: updatedElements,
			runtimeMediaUrl: runtimeMediaUrl || undefined,
			runtimeVariables: Object.keys(runtimeVariables).length > 0 ? runtimeVariables : undefined,
			runtimeButtonParams: Object.keys(runtimeButtonParams).length > 0 ? runtimeButtonParams : undefined,
		} as Partial<FlowNodeData>);

		toast.success("Parâmetros de envio salvos");
		onOpenChange(false);
	}, [node, nodeData, runtimeMediaUrl, runtimeVariables, runtimeButtonParams, onUpdateNodeData, onOpenChange]);

	// Check if template has editable runtime params
	const hasRuntimeParams = useMemo(() => {
		if (!nodeData) return false;
		const hasMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(nodeData.header?.type || "");
		const hasVariables = (nodeData.body?.variables?.length || 0) > 0 || (nodeData.header?.variables?.length || 0) > 0;
		const hasCopyCodeButton = buttons.some((btn) => btn.type === "COPY_CODE");
		return hasMediaHeader || hasVariables || hasCopyCodeButton;
	}, [nodeData, buttons]);

	if (!node) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[96vw] sm:max-w-4xl max-h-[90vh] flex flex-col">
				<DialogHeader className="flex flex-row items-center gap-3 space-y-0">
					<FileText className="h-5 w-5 text-emerald-500" />
					<div className="flex-1">
						<DialogTitle className="text-base">{nodeData?.templateName || "Template Oficial WhatsApp"}</DialogTitle>
						<p className="text-xs text-muted-foreground mt-0.5">
							{nodeData?.metaTemplateId
								? `Meta ID: ${nodeData.metaTemplateId}`
								: "Configure um template oficial para envio via WhatsApp"}
						</p>
					</div>
					<div className="flex items-center gap-2">
						{nodeData?.metaTemplateId && (
							<Button
								variant="ghost"
								size="icon"
								onClick={handleRefreshStatus}
								disabled={isRefreshing}
								title="Verificar status na Meta"
								className="h-8 w-8"
							>
								<RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
							</Button>
						)}
						{nodeData?.status && (
							<Badge
								variant="outline"
								className={cn("text-[10px] px-2 py-0.5 font-medium gap-1 border", getStatusColors(nodeData.status))}
							>
								{getStatusIcon(nodeData.status)}
								{getStatusLabel(nodeData.status)}
								{!canEdit && <Lock className="h-2.5 w-2.5 ml-0.5" />}
							</Badge>
						)}
					</div>
				</DialogHeader>

				{/* Mode toggle */}
				<div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
					<button
						type="button"
						onClick={() => setMode("import")}
						className={cn(
							"flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
							mode === "import"
								? "bg-background shadow text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Importar template aprovado
					</button>
					<button
						type="button"
						onClick={() => setMode("create")}
						className={cn(
							"flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
							mode === "create"
								? "bg-background shadow text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Criar novo template
					</button>
				</div>

				<div className="flex gap-6 flex-1 min-h-0">
					{/* Left: Form */}
					<ScrollArea className="flex-1 min-w-0 pr-4">
						<div className="py-2 space-y-4">
							{mode === "import" ? (
								/* IMPORT MODE */
								<div className="space-y-4">
									<div className="space-y-2">
										<Label className="text-sm font-medium">Buscar template</Label>
										<div className="relative">
											<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												placeholder="Buscar por nome..."
												className="pl-9 text-sm"
											/>
										</div>
									</div>

									{isLoading ? (
										<div className="flex items-center justify-center py-8">
											<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									) : filteredTemplates.length === 0 ? (
										<div className="text-center py-8">
											<p className="text-sm text-muted-foreground">Nenhum template aprovado encontrado</p>
											<Button variant="outline" size="sm" className="mt-3" onClick={() => setMode("create")}>
												Criar novo template
											</Button>
										</div>
									) : (
										<div className="space-y-2 max-h-[350px] overflow-y-auto">
											{filteredTemplates.map((template) => (
												<button
													key={template.id}
													type="button"
													onClick={() => setSelectedTemplate(template)}
													className={cn(
														"w-full text-left rounded-lg border p-3 transition-colors",
														selectedTemplate?.id === template.id
															? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
															: "hover:bg-accent",
													)}
												>
													<div className="flex items-center justify-between gap-2">
														<span className="font-medium text-sm truncate">{template.name}</span>
														<Badge
															variant="outline"
															className={cn("text-[10px] shrink-0", getStatusColors(template.status))}
														>
															{getStatusLabel(template.status)}
														</Badge>
													</div>
													<div className="flex items-center gap-2 mt-1">
														<Badge variant="secondary" className="text-[10px]">
															{template.category}
														</Badge>
														<span className="text-[10px] text-muted-foreground">{template.language}</span>
													</div>
												</button>
											))}
										</div>
									)}
								</div>
							) : (
								/* CREATE MODE */
								<div className="space-y-5">
									{/* Aviso de campos bloqueados */}
									{!canEdit && (
										<div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
											<div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
												<Lock className="h-3 w-3 shrink-0" />
												<span>
													Template {nodeData?.status === "APPROVED" ? "aprovado pela Meta" : "em análise"}. Campos
													estruturais bloqueados. Use &quot;Duplicar como Novo&quot; para criar uma versão editável.
												</span>
											</div>
										</div>
									)}

									{/* PARÂMETROS DE ENVIO - Variáveis (só aparecem se tiver variáveis) */}
									{!canEdit && ((nodeData?.body?.variables?.length || 0) > 0 || (nodeData?.header?.variables?.length || 0) > 0) && (
										<div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-4">
											<div className="flex items-center gap-2">
												<Variable className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
												<Label className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
													Variáveis do Template
												</Label>
												<span className="text-[10px] text-emerald-600 dark:text-emerald-500 ml-auto">
													Editáveis para cada disparo
												</span>
											</div>
											{[...(nodeData?.header?.variables || []), ...(nodeData?.body?.variables || [])].map((varName) => (
												<div key={varName} className="space-y-1">
													<Label className="text-[10px] text-muted-foreground">{`{{${varName}}}`}</Label>
													<Input
														value={runtimeVariables[varName] || ""}
														onChange={(e) =>
															setRuntimeVariables((prev) => ({
																...prev,
																[varName]: e.target.value,
															}))
														}
														placeholder={`Valor para ${varName}`}
														className="text-sm h-8"
													/>
												</div>
											))}
											<p className="text-[10px] text-muted-foreground">
												Defina valores fixos ou deixe vazio para usar variáveis do contexto
											</p>
										</div>
									)}

									{/* Basic info */}
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label className="text-sm font-medium">Nome do template</Label>
											<Input
												value={templateName}
												onChange={(e) => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
												onBlur={() => commitTemplateData({ name: templateName })}
												placeholder="meu_template"
												disabled={!canEdit}
												className={cn("text-sm", !canEdit && "opacity-60 cursor-not-allowed")}
											/>
											<p className="text-[10px] text-muted-foreground">
												Apenas letras minúsculas, números e underscore
											</p>
										</div>
										<div className="space-y-2">
											<Label className="text-sm font-medium">Categoria</Label>
											<Select
												value={category}
												onValueChange={(v) => {
													setCategory(v as TemplateCategory);
													commitTemplateData({ cat: v as TemplateCategory });
												}}
												disabled={!canEdit}
											>
												<SelectTrigger className={cn("text-sm", !canEdit && "opacity-60 cursor-not-allowed")}>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="MARKETING">Marketing</SelectItem>
													<SelectItem value="UTILITY">Utilitário</SelectItem>
													<SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>

									{/* Header */}
									<div className="space-y-2">
										<Label className="text-sm font-medium">Header (opcional)</Label>
										<Select
											value={headerType}
											onValueChange={(v) => {
												const newType = v as typeof headerType;
												setHeaderType(newType);
												commitTemplateData({ hType: newType });
											}}
											disabled={!canEdit}
										>
											<SelectTrigger className={cn("text-sm", !canEdit && "opacity-60 cursor-not-allowed")}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="NONE">Nenhum</SelectItem>
												<SelectItem value="TEXT">Texto</SelectItem>
												<SelectItem value="IMAGE">Imagem</SelectItem>
												<SelectItem value="VIDEO">Vídeo</SelectItem>
												<SelectItem value="DOCUMENT">Documento</SelectItem>
											</SelectContent>
										</Select>
										{headerType === "TEXT" && (
											<Input
												value={headerContent}
												onChange={(e) => setHeaderContent(e.target.value)}
												onBlur={() => commitTemplateData({ hContent: headerContent })}
												placeholder="Título do template (até 60 caracteres)"
												maxLength={60}
												disabled={!canEdit}
												className={cn("text-sm mt-2", !canEdit && "opacity-60 cursor-not-allowed")}
											/>
										)}
										{["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
											<div className="space-y-2 mt-2">
												{canEdit ? (
													<>
														<Tabs value={headerMediaMode} onValueChange={(v) => setHeaderMediaMode(v as "url" | "upload")} className="w-full">
															<TabsList className="grid w-full grid-cols-2 h-8">
																<TabsTrigger value="upload" className="text-xs gap-1">
																	<Upload className="h-3 w-3" />
																	Upload
																</TabsTrigger>
																<TabsTrigger value="url" className="text-xs gap-1">
																	<Link className="h-3 w-3" />
																	URL
																</TabsTrigger>
															</TabsList>
														</Tabs>
														{headerMediaMode === "upload" ? (
															<div className="nodrag">
																<MetaMediaUpload
																	uploadedFiles={uploadedFiles}
																	setUploadedFiles={setUploadedFiles}
																	allowedTypes={
																		headerType === "IMAGE"
																			? ["image/jpeg", "image/png", "image/jpg"]
																			: headerType === "VIDEO"
																				? ["video/mp4", "video/webm"]
																				: ["application/pdf"]
																	}
																	maxSizeMB={headerType === "VIDEO" ? 16 : 5}
																	title={`Upload de ${headerType === "IMAGE" ? "imagem" : headerType === "VIDEO" ? "vídeo" : "documento"}`}
																	description={`Faça upload para a API Meta (necessário para criar template)`}
																	maxFiles={1}
																	onUploadComplete={handleMediaUploadComplete}
																/>
																{headerMediaUrl && headerMediaHandle && (
																	<p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-1">
																		✓ Mídia pronta: {headerMediaUrl.split("/").pop()}
																	</p>
																)}
																{headerMediaUrl && !headerMediaHandle && (
																	<p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
																		⚠ Mídia precisa de upload para Meta API
																	</p>
																)}
															</div>
														) : (
															<Input
																value={headerMediaUrl}
																onChange={(e) => setHeaderMediaUrl(e.target.value)}
																onBlur={() => commitTemplateData({ hMediaUrl: headerMediaUrl })}
																placeholder="URL da mídia"
																className="text-sm"
															/>
														)}
													</>
												) : (
													<>
														<Input
															value={runtimeMediaUrl}
															onChange={(e) => setRuntimeMediaUrl(e.target.value)}
															placeholder="URL da mídia"
															className="text-sm"
														/>
														<p className="text-[10px] text-emerald-600 dark:text-emerald-500">
															Editável para cada disparo
														</p>
													</>
												)}
											</div>
										)}
									</div>

									{/* Body */}
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label className="text-sm font-medium">Corpo da mensagem</Label>
											<span
												className={cn(
													"text-[10px]",
													bodyText.length > TEMPLATE_LIMITS.bodyMaxLength ? "text-red-500" : "text-muted-foreground",
												)}
											>
												{bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}
											</span>
										</div>
										<Textarea
											value={bodyText}
											onChange={(e) => setBodyText(e.target.value)}
											onBlur={() => commitTemplateData({ bText: bodyText })}
											placeholder="Digite o texto da mensagem. Use {{variavel}} para parâmetros."
											rows={4}
											disabled={!canEdit}
											className={cn("text-sm resize-y", !canEdit && "opacity-60 cursor-not-allowed")}
										/>
										{bodyVariables.length > 0 && (
											<div className="flex flex-wrap gap-1 mt-1">
												{bodyVariables.map((v) => (
													<Badge key={v} variant="secondary" className="text-[10px]">
														{`{{${v}}}`}
													</Badge>
												))}
											</div>
										)}
									</div>

									{/* Footer */}
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label className="text-sm font-medium">Rodapé (opcional)</Label>
											<span
												className={cn(
													"text-[10px]",
													footerText.length > TEMPLATE_LIMITS.footerMaxLength
														? "text-red-500"
														: "text-muted-foreground",
												)}
											>
												{footerText.length}/{TEMPLATE_LIMITS.footerMaxLength}
											</span>
										</div>
										<Input
											value={footerText}
											onChange={(e) => setFooterText(e.target.value)}
											onBlur={() => commitTemplateData({ fText: footerText })}
											placeholder="Texto do rodapé"
											maxLength={60}
											disabled={!canEdit}
											className={cn("text-sm", !canEdit && "opacity-60 cursor-not-allowed")}
										/>
									</div>

									{/* Buttons */}
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<Label className="text-sm font-medium">Botões</Label>
											<span className="text-[10px] text-muted-foreground">
												{buttons.length}/{TEMPLATE_LIMITS.maxButtons}
											</span>
										</div>

										{buttons.map((btn, idx) => (
											<div key={btn.id} className={cn("rounded-lg border p-3 space-y-2", !canEdit && "opacity-70")}>
												<div className="flex items-center justify-between gap-2">
													<Badge variant="outline" className="text-[10px]">
														{(btn.type || "QUICK_REPLY").replace("_", " ")}
													</Badge>
													{canEdit && (
														<button
															type="button"
															onClick={() => handleRemoveButton(idx)}
															className="text-red-500 hover:text-red-700"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													)}
												</div>
												<Input
													value={btn.type === "COPY_CODE" ? COPY_CODE_BUTTON_TITLE : btn.text}
													onChange={(e) => btn.type !== "COPY_CODE" && handleUpdateButton(idx, { text: e.target.value })}
													onBlur={() => btn.type !== "COPY_CODE" && commitButtonUpdate(idx, { text: btn.text })}
													placeholder="Texto do botão"
													maxLength={25}
													disabled={!canEdit || btn.type === "COPY_CODE"}
													className={cn("text-sm", (!canEdit || btn.type === "COPY_CODE") && "cursor-not-allowed opacity-60")}
													title={btn.type === "COPY_CODE" ? "Título fixo exigido pela Meta API" : undefined}
												/>
												{btn.type === "URL" && (
													<Input
														value={btn.url || ""}
														onChange={(e) => handleUpdateButton(idx, { url: e.target.value })}
														onBlur={() => commitButtonUpdate(idx, { url: btn.url })}
														placeholder="https://..."
														disabled={!canEdit}
														className={cn("text-sm", !canEdit && "cursor-not-allowed")}
													/>
												)}
												{btn.type === "PHONE_NUMBER" && (
													<Input
														value={btn.phoneNumber || ""}
														onChange={(e) => handleUpdateButton(idx, { phoneNumber: e.target.value })}
														onBlur={() => commitButtonUpdate(idx, { phoneNumber: btn.phoneNumber })}
														placeholder="+5511999999999"
														disabled={!canEdit}
														className={cn("text-sm", !canEdit && "cursor-not-allowed")}
													/>
												)}
												{btn.type === "COPY_CODE" && (
													<div className="space-y-1">
														<Input
															value={canEdit ? (btn.exampleCode || "") : (runtimeButtonParams[idx]?.couponCode || btn.exampleCode || "")}
															onChange={(e) => canEdit
																? handleUpdateButton(idx, { exampleCode: e.target.value })
																: setRuntimeButtonParams((prev) => ({
																	...prev,
																	[idx]: { ...prev[idx], couponCode: e.target.value },
																}))
															}
															onBlur={() => canEdit && commitButtonUpdate(idx, { exampleCode: btn.exampleCode })}
															placeholder="Código (até 15 caracteres)"
															maxLength={15}
															className="text-sm font-mono"
														/>
														{!canEdit && (
															<p className="text-[10px] text-emerald-600 dark:text-emerald-500">
																Editável para cada disparo (ex: chave PIX)
															</p>
														)}
													</div>
												)}
												{btn.type === "VOICE_CALL" && (
													<div className="space-y-1">
														<span className="text-[10px] text-muted-foreground">
															Validade da chamada: {btn.ttlMinutes ? Math.round(btn.ttlMinutes / 1440) : 7} dias
														</span>
														<Select
															value={String(btn.ttlMinutes || 10080)}
															onValueChange={(v) => {
																handleUpdateButton(idx, { ttlMinutes: Number(v) });
																commitButtonUpdate(idx, { ttlMinutes: Number(v) });
															}}
															disabled={!canEdit}
														>
															<SelectTrigger className={cn("text-sm h-8", !canEdit && "cursor-not-allowed")}>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="1440">1 dia</SelectItem>
																<SelectItem value="4320">3 dias</SelectItem>
																<SelectItem value="10080">7 dias (padrão)</SelectItem>
																<SelectItem value="20160">14 dias</SelectItem>
															</SelectContent>
														</Select>
													</div>
												)}
											</div>
										))}

										{buttons.length < TEMPLATE_LIMITS.maxButtons && canEdit && (
											<div className="flex flex-wrap gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleAddButton("QUICK_REPLY")}
													className="text-xs"
												>
													<Plus className="h-3 w-3 mr-1" />
													Resposta rápida
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleAddButton("URL")}
													className="text-xs"
												>
													<Link className="h-3 w-3 mr-1" />
													URL
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleAddButton("PHONE_NUMBER")}
													className="text-xs"
												>
													<Phone className="h-3 w-3 mr-1" />
													Telefone
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleAddButton("VOICE_CALL")}
													className="text-xs"
												>
													<PhoneCall className="h-3 w-3 mr-1" />
													Ligar WhatsApp
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleAddButton("COPY_CODE")}
													className="text-xs"
												>
													<Copy className="h-3 w-3 mr-1" />
													Copiar código
												</Button>
											</div>
										)}
									</div>

									{/* Validation warnings */}
									{validation.warnings.length > 0 && (
										<div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3">
											{validation.warnings.map((w, i) => (
												<div key={i} className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
													<AlertTriangle className="h-3 w-3 shrink-0" />
													{w}
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					</ScrollArea>

					{/* Right: Preview */}
					<div className="hidden sm:block w-[280px] shrink-0 border-l pl-6">
						{mode === "import" ? (
							/* Preview do template selecionado no modo import */
							selectedTemplate ? (
								(() => {
									// Suporta array e indexed-object (com publicMediaUrl) vindos do banco
									const comps = normalizeMetaComponents(selectedTemplate.components);
									const headerComp = comps.find((c) => c.type === "HEADER");
									const bodyComp = comps.find((c) => c.type === "BODY");
									const footerComp = comps.find((c) => c.type === "FOOTER");
									const buttonsComp = comps.find((c) => c.type === "BUTTONS");

									return (
										<TemplatePreview
											header={
												headerComp
													? {
														type:
															headerComp.format === "TEXT"
																? "TEXT"
																: (headerComp.format as "IMAGE" | "VIDEO" | "DOCUMENT") || "TEXT",
														content: headerComp.text,
														mediaUrl: resolvedMediaUrl ?? undefined,
														isLoadingMedia: isResolvingMedia,
													}
													: undefined
											}
											body={bodyComp?.text}
											footer={footerComp?.text}
											buttons={buttonsComp?.buttons?.map((b) => ({ text: b.text, type: b.type })) || []}
										/>
									);
								})()
							) : (
								<div className="flex flex-col items-center justify-center h-[350px] text-center">
									<Smartphone className="h-8 w-8 text-muted-foreground/50 mb-3" />
									<p className="text-xs text-muted-foreground px-4">
										Selecione um template na lista para visualizar o preview
									</p>
								</div>
							)
						) : (
							/* Preview do form no modo create */
							<TemplatePreview
								header={
									headerType !== "NONE"
										? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl }
										: undefined
								}
								body={bodyText}
								footer={footerText}
								buttons={buttons.map((b) => ({ text: b.text, type: b.type }))}
							/>
						)}
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
						Fechar
					</Button>

					{/* Botão Importar no modo import */}
					{mode === "import" && selectedTemplate && (
						<Button
							size="sm"
							onClick={() => handleImportTemplate(selectedTemplate)}
							disabled={isResolvingMedia}
							className="bg-emerald-600 hover:bg-emerald-700"
						>
							{isResolvingMedia ? (
								<>
									<Loader2 className="h-3 w-3 mr-1 animate-spin" />
									Carregando mídia...
								</>
							) : (
								`Importar "${selectedTemplate.name}"`
							)}
						</Button>
					)}

					{/* Botões para templates não editáveis (APPROVED/PENDING) - quando NÃO está em modo de edição */}
					{mode === "create" && !canEdit && (
						<>
							<Button variant="secondary" size="sm" onClick={handleDuplicate}>
								<Copy className="h-3 w-3 mr-1" />
								Duplicar como Novo
							</Button>
							{nodeData?.status === "APPROVED" && nodeData?.metaTemplateId && (
								<Button variant="outline" size="sm" onClick={handleEditApproved}>
									<FileEdit className="h-3 w-3 mr-1" />
									Editar
								</Button>
							)}
							{hasRuntimeParams && (
								<Button
									size="sm"
									onClick={handleSaveRuntimeParams}
									className="bg-emerald-600 hover:bg-emerald-700"
								>
									<Settings2 className="h-3 w-3 mr-1" />
									Salvar Parâmetros
								</Button>
							)}
						</>
					)}

					{/* Botões de ação para templates editáveis (DRAFT, REJECTED, ou em modo de edição) */}
					{mode === "create" && canEdit && (
						<>
							{isEditingApproved && (
								<Button variant="ghost" size="sm" onClick={() => setIsEditingApproved(false)}>
									Cancelar Edição
								</Button>
							)}
							<Button
								size="sm"
								onClick={handleSubmitToMeta}
								disabled={!validation.valid || !templateName || isSubmitting}
								className="bg-emerald-600 hover:bg-emerald-700"
							>
								{isSubmitting ? (
									<>
										<Loader2 className="h-3 w-3 mr-1 animate-spin" />
										Enviando...
									</>
								) : isEditingApproved ? (
									"Reenviar para Validação"
								) : nodeData?.status === "REJECTED" ? (
									"Reenviar para Meta"
								) : (
									"Enviar para Meta"
								)}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default TemplateConfigDialog;
