"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertCircle, ArrowLeft, Trash2, CheckCircle, Copy, Phone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SendProgressDialog } from "./send-progress-dialog";
import { LeadsSelectorDialog } from "./leads-selector-dialog";
import { InteractivePreview } from "../../shared/InteractivePreview";
import { ButtonReactionPicker } from "../../shared/ButtonReactionPicker";
import { WhatsAppTextEditor } from "../../shared/WhatsAppTextEditor";
import type { InteractiveMessage, HeaderType, ButtonReaction } from "@/types/interactive-messages";

interface TemplateDetail {
	id: string;
	name: string;
	category: string;
	subCategory?: string | null;
	status: string;
	language: string;
	qualityScore?: string | null;
	correctCategory?: string | null;
	ctaUrlLinkTrackingOptedOut?: boolean | null;
	libraryTemplateName?: string | null;
	messageSendTtlSeconds?: number | null;
	parameterFormat?: string | null;
	previousCategory?: string | null;
	lastEdited?: string | null;
	publicMediaUrl?: string | null;
	componentes: Array<{
		type: string;
		format?: string;
		text?: string;
		parameters?: Array<{
			type: string;
			example: string;
		}>;
		buttons?: Array<{
			type: string;
			text: string;
			url?: string | null;
			phone_number?: string | null;
			example?: string[];
		}>;
		example?: any;
	}>;
}

interface TemplateDetailsInternalProps {
	templateId: string;
	onBackToList?: () => void;
}

export default function TemplateDetailsInternal({ templateId, onBackToList }: TemplateDetailsInternalProps) {
	const router = useRouter();
	const [template, setTemplate] = useState<TemplateDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	console.log("TemplateDetailsInternal mounted with templateId:", templateId);

	const [testPhoneNumber, setTestPhoneNumber] = useState("");
	// Variáveis do template para preenchimento na página (HEADER/BODY/CUPOM)
	type PageVar = {
		key: string; // chave para envio em parameters (ex: nome, id_pedido)
		placeholder: string; // ex: {{nome}} ou {{1}}
		scope: "body" | "header" | "coupon";
		name?: string; // quando nomeada (ex: nome)
		index?: number; // ordem quando numérica
		example: string;
		value: string;
	};
	const [pageVariables, setPageVariables] = useState<PageVar[]>([]);
	const [couponCode, setCouponCode] = useState("");
	const [headerMedia, setHeaderMedia] = useState("");
	const [hasHeaderMedia, setHasHeaderMedia] = useState(false);

	const [isSending, setIsSending] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isMassSending, setIsMassSending] = useState(false);
	const [contactList, setContactList] = useState<{ nome: string; numero: string }[]>([]);
	const [showSendProgress, setShowSendProgress] = useState(false);
	const [sendProgressComplete, setSendProgressComplete] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showLeadsSelector, setShowLeadsSelector] = useState(false);

	// Effect para limpar contatos quando o envio é concluído
	useEffect(() => {
		console.log("[MassSend] Effect checking:", {
			sendProgressComplete,
			showSendProgress,
			contactListLength: contactList.length,
		});
		if (sendProgressComplete && !showSendProgress) {
			console.log("[MassSend] CONDITIONS MET - Será executado cleanup em 100ms");
			const cleanupTimer = setTimeout(() => {
				console.log("[MassSend] EXECUTING CLEANUP: limpando contactList, sendProgressComplete, isMassSending");
				setContactList([]);
				setSendProgressComplete(false);
				setIsMassSending(false);
			}, 100); // Pequeno delay para garantir que o dialog fechou

			return () => clearTimeout(cleanupTimer);
		}
	}, [sendProgressComplete, showSendProgress]);

	// Estados para reações de botões
	const [templateReactions, setTemplateReactions] = useState<ButtonReaction[]>([]);
	const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
	const [showTextEditor, setShowTextEditor] = useState<string | null>(null);
	const [reactionConfigMode, setReactionConfigMode] = useState(false);

	useEffect(() => {
		async function fetchTemplate() {
			if (!templateId) {
				setError("ID do template não fornecido");
				setIsLoading(false);
				return;
			}

			try {
				setIsLoading(true);
				setError(null);

				console.log("Buscando template com ID:", templateId);

				const res = await axios.get(`/api/admin/mtf-diamante/template-info?template=${templateId}`).catch((error) => {
					console.error("Erro na requisição:", error);
					throw new Error(
						error.response?.data?.error ||
							error.response?.data?.details ||
							error.message ||
							"Falha na comunicação com o servidor",
					);
				});

				if (!res.data.success) {
					setError(res.data.details || "Erro ao carregar template");
					return;
				}

				const t = res.data.template;
				setTemplate({
					id: templateId,
					name: t.name,
					category: t.category,
					subCategory: t.sub_category,
					status: t.status,
					language: t.language,
					qualityScore: typeof t.quality_score === "string" ? t.quality_score : null,
					correctCategory: t.correct_category,
					ctaUrlLinkTrackingOptedOut: t.cta_url_link_tracking_opted_out,
					libraryTemplateName: t.library_template_name,
					messageSendTtlSeconds: t.message_send_ttl_seconds,
					parameterFormat: t.parameter_format,
					previousCategory: t.previous_category,
					lastEdited: t.lastEdited,
					publicMediaUrl: t.publicMediaUrl,
					componentes: t.components || [],
				});

				// Extrair variáveis (HEADER TEXT, BODY e CUPOM)
				const extracted: PageVar[] = [];

				// CUPOM via COPY_CODE
				try {
					const btns = t.components?.find((c: any) => c.type === "BUTTONS");
					const copyBtn = btns?.buttons?.find((b: any) => String(b?.type || "").toUpperCase() === "COPY_CODE");
					const exampleCoupon = Array.isArray(copyBtn?.example) ? copyBtn.example[0] : "";
					if (copyBtn) {
						extracted.push({
							key: "couponCode",
							placeholder: "{{coupon_code}}",
							scope: "coupon",
							example: exampleCoupon || "",
							value: exampleCoupon || "",
						});
					}
				} catch {}

				// BODY: suporta nomeadas e numéricas
				try {
					const bodyComponent = t.components?.find((c: any) => c.type === "BODY");
					if (bodyComponent?.text) {
						const matches = bodyComponent.text.match(/\{\{([^}]+)\}\}/g) || [];
						matches.forEach((match: string, pos: number) => {
							const raw = match.replace(/[{}]/g, "").trim();
							const isNumeric = /^\d+$/.test(raw);
							// exemplo
							let exampleValue = "";
							if (bodyComponent.example) {
								if (Array.isArray(bodyComponent.example?.body_text?.[0])) {
									exampleValue = bodyComponent.example.body_text[0][pos] || "";
								}
								if (!exampleValue && Array.isArray(bodyComponent.example?.body_text_named_params)) {
									const named = bodyComponent.example.body_text_named_params.find((p: any) => p?.param_name === raw);
									exampleValue = named?.example || "";
								}
							}
							// Para nome_lead, não pré-preencher - deixar vazio
							const initialValue = raw === "nome_lead" ? "" : exampleValue;
							extracted.push({
								key: isNumeric ? `body_${pos}` : raw,
								placeholder: match,
								scope: "body",
								name: isNumeric ? undefined : raw,
								index: isNumeric ? pos : undefined,
								example: exampleValue,
								value: initialValue,
							});
						});
					}
				} catch {}

				// HEADER TEXT: suporta nomeada e numérica
				try {
					const headerComponent = t.components?.find((c: any) => c.type === "HEADER" && c.format === "TEXT");
					if (headerComponent?.text) {
						const matches = headerComponent.text.match(/\{\{([^}]+)\}\}/g) || [];
						matches.forEach((match: string, pos: number) => {
							const raw = match.replace(/[{}]/g, "").trim();
							const isNumeric = /^\d+$/.test(raw);
							let exampleValue = "";
							if (headerComponent.example) {
								if (Array.isArray(headerComponent.example?.header_text?.[0])) {
									exampleValue = headerComponent.example.header_text[0][pos] || "";
								}
								if (!exampleValue && Array.isArray(headerComponent.example?.header_text_named_params)) {
									const named = headerComponent.example.header_text_named_params.find(
										(p: any) => p?.param_name === raw,
									);
									exampleValue = named?.example || "";
								}
							}
							// Para nome_lead, não pré-preencher - deixar vazio
							const initialValue = raw === "nome_lead" ? "" : exampleValue;
							extracted.push({
								key: isNumeric ? `header_${pos}` : raw,
								placeholder: match,
								scope: "header",
								name: isNumeric ? undefined : raw,
								index: isNumeric ? pos : undefined,
								example: exampleValue,
								value: initialValue,
							});
						});
					}
				} catch {}

				console.log(`[TemplateDetailsInternal] Variáveis extraídas:`, extracted);
				setPageVariables(extracted);

				// HEADER media
				const hdr = t.components?.find(
					(c: any) => c.type === "HEADER" && ["VIDEO", "IMAGE", "DOCUMENT", "LOCATION"].includes(c.format),
				);
				if (hdr) {
					setHasHeaderMedia(true);
					// Usar a URL pública do MinIO se disponível, caso contrário usar a URL da Meta
					let mediaUrl = t.publicMediaUrl;

					if (!mediaUrl) {
						mediaUrl =
							hdr.example?.header_handle?.[0] ||
							hdr.example?.header_url ||
							(typeof hdr.example?.header_location === "object" ? JSON.stringify(hdr.example.header_location) : "");
					}

					setHeaderMedia(mediaUrl);
				}

				// pré‑preenche cupom do COPY_CODE (sincronizar estado legado)
				const copyVar = extracted.find((v) => v.scope === "coupon");
				if (copyVar) setCouponCode(copyVar.value || "");
			} catch (err) {
				console.error(err);
				setError("Erro ao carregar informações do template");
			} finally {
				setIsLoading(false);
			}
		}

		fetchTemplate();
	}, [templateId]);

	const handleTestSend = async () => {
		if (!template) return;
		setIsSending(true);
		try {
			let phone = testPhoneNumber.replace(/\D/g, "");
			if (!phone.startsWith("55")) phone = "55" + phone;

			// Montar parâmetros a partir das variáveis
			const params: Record<string, any> = {};
			// CUPOM
			const couponVar = pageVariables.find((v) => v.scope === "coupon");
			params.couponCode = (couponVar?.value ?? couponCode) || "";
			// HEADER nomeado
			const headerNamed = pageVariables.filter((v) => v.scope === "header" && v.name);
			if (headerNamed.length > 0) {
				const headerVal = headerNamed[0].value || headerNamed[0].example || "";
				params.headerVar = headerVal;
				// também mandar pela chave nomeada
				params[headerNamed[0].name as string] = headerVal;
			}
			// BODY nomeadas -> mandar por nome (exceto nome_lead, que vem do lead selecionado)
			const bodyNamed = pageVariables.filter((v) => v.scope === "body" && v.name);
			for (const v of bodyNamed) {
				// Não enviar nome_lead como parâmetro - vai ser preenchido pela API com o nome real do lead
				if (v.name !== "nome_lead") {
					params[v.name as string] = v.value || v.example || "";
				}
			}
			// BODY numéricas -> montar bodyVars em ordem
			const bodyNumeric = pageVariables
				.filter((v) => v.scope === "body" && typeof v.index === "number")
				.sort((a, b) => a.index! - b.index!);
			if (bodyNumeric.length > 0) {
				params.bodyVars = bodyNumeric.map((v) => v.value || v.example || "");
			}

			const payload = {
				templateId: template.id,
				selectedLeads: [phone],
				parameters: params,
			};

			const res = await axios.post("/api/admin/mtf-diamante/disparo", payload);
			if (res.data.success) toast.success("Enviado!");
			else toast.error(res.data.error || "Falha no envio");
		} catch (err: any) {
			console.error(err);
			toast.error(err.response?.data?.error || err.message);
		} finally {
			setIsSending(false);
		}
	};

	const handleDelete = async () => {
		if (!template) return;
		setIsDeleting(true);
		setShowDeleteDialog(false);

		try {
			const res = await axios.delete("/api/admin/mtf-diamante/templates", {
				data: { name: template.name },
			});
			if (res.data.success) {
				toast.success("Template excluído");
				if (onBackToList) {
					onBackToList();
				} else {
					router.push("/mtf-diamante?tab=templates");
				}
			} else {
				toast.error(res.data.error);
			}
		} catch {
			toast.error("Erro ao excluir template");
		} finally {
			setIsDeleting(false);
		}
	};

	function getMediaSourceLabel(url: string, publicMediaUrl: string | null | undefined) {
		if (!url) return "";
		if (publicMediaUrl && url === publicMediaUrl) {
			return "Armazenada no MinIO";
		}
		if (url.includes("whatsapp.net") || url.includes("fbcdn.net")) {
			return "Hospedada nos servidores da Meta";
		}
		return "";
	}

	// Converter template para formato InteractiveMessage
	const convertTemplateToInteractiveMessage = (): InteractiveMessage | null => {
		if (!template) return null;

		const headerComponent = template.componentes.find((c) => c.type === "HEADER");
		const bodyComponent = template.componentes.find((c) => c.type === "BODY");
		const footerComponent = template.componentes.find((c) => c.type === "FOOTER");
		const buttonsComponent = template.componentes.find((c) => c.type === "BUTTONS");

		const message: InteractiveMessage = {
			id: template.id,
			name: template.name,
			type: "button" as const,
			body: {
				text: bodyComponent?.text || "",
			},
			isActive: true,
		};

		// Header
		if (headerComponent) {
			if (headerComponent.format === "TEXT" && headerComponent.text) {
				message.header = {
					type: "text" as HeaderType,
					content: headerComponent.text,
				};
			} else if (headerComponent.format && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComponent.format)) {
				message.header = {
					type: headerComponent.format.toLowerCase() as HeaderType,
					content: "",
					mediaUrl: headerMedia,
					filename: headerComponent.format === "DOCUMENT" ? "Document" : undefined,
				};
			}
		}

		// Footer
		if (footerComponent?.text) {
			message.footer = {
				text: footerComponent.text,
			};
		}

		// Buttons
		if (buttonsComponent?.buttons) {
			message.action = {
				type: "button",
				buttons: buttonsComponent.buttons.map((button, index) => ({
					id: `btn_${index}`,
					title: button.text,
					type: "reply" as const,
				})),
			};
		}

		return message;
	};

	const handleMassSend = async () => {
		console.log("[MassSend] handleMassSend INICIADO");
		if (!template || contactList.length === 0) {
			console.log("[MassSend] Cancelado: !template || contactList vazio");
			return;
		}
		console.log("[MassSend] Iniciando envio com", contactList.length, "contatos");
		setShowSendProgress(true);
		setSendProgressComplete(false);
		setIsMassSending(true);
		try {
			const selectedLeads = contactList.map((contact) => {
				let numero = contact.numero.replace(/\D/g, "");
				if (!numero.startsWith("55")) numero = "55" + numero;
				return numero;
			});
			// Montar parâmetros a partir das variáveis (mesma regra do individual)
			const params: Record<string, any> = {};
			const couponVar = pageVariables.find((v) => v.scope === "coupon");
			params.couponCode = (couponVar?.value ?? couponCode) || "";
			const headerNamed = pageVariables.filter((v) => v.scope === "header" && v.name);
			if (headerNamed.length > 0) {
				const headerVal = headerNamed[0].value || headerNamed[0].example || "";
				params.headerVar = headerVal;
				params[headerNamed[0].name as string] = headerVal;
			}
			const bodyNamed = pageVariables.filter((v) => v.scope === "body" && v.name);
			for (const v of bodyNamed) {
				// Não enviar nome_lead como parâmetro - vai ser preenchido pela API com o nome real do lead
				if (v.name !== "nome_lead") {
					params[v.name as string] = v.value || v.example || "";
				}
			}
			const bodyNumeric = pageVariables
				.filter((v) => v.scope === "body" && typeof v.index === "number")
				.sort((a, b) => a.index! - b.index!);
			if (bodyNumeric.length > 0) {
				params.bodyVars = bodyNumeric.map((v) => v.value || v.example || "");
			}

			const payload = {
				templateId: template.id,
				selectedLeads,
				parameters: params,
			};
			console.log(`Enviando mensagem para ${selectedLeads.length} leads:`, payload);
			const response = await axios.post("/api/admin/mtf-diamante/disparo", payload);
			if (response.data.success) {
				console.log("[MassSend] ✅ Resposta sucesso recebida");
				setSendProgressComplete(true);
				toast.success(`Mensagens enviadas com sucesso para ${selectedLeads.length} leads!`);
				// Aguardar 1.5s para o dialog fechar automaticamente (SendProgressDialog fecha em 1500ms)
				// O useEffect de cleanup vai detectar sendProgressComplete=true e showSendProgress=false
				// e vai limpar tudo automaticamente
				const closeTimer = setTimeout(() => {
					console.log("[MassSend] Fechando showSendProgress após 1600ms");
					setShowSendProgress(false);
				}, 1600);
				return () => clearTimeout(closeTimer);
			} else {
				setShowSendProgress(false);
				toast.error(response.data.error || "Falha ao enviar mensagens em massa");
			}
		} catch (error: any) {
			console.error("Erro ao enviar mensagens em massa:", error);
			setShowSendProgress(false);
			toast.error(error.response?.data?.error || error.message || "Erro ao enviar mensagens");
		} finally {
			setIsMassSending(false);
		}
	};

	const handleLeadsSelection = (selectedLeads: any[]) => {
		const contacts = selectedLeads
			.map((lead) => ({
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				numero: lead.phoneNumber || "",
			}))
			.filter((contact) => contact.numero);

		setContactList(contacts);
		toast.success(`${contacts.length} leads selecionados da base de dados!`);
	};

	// Funções para gerenciar reações de botões
	const handleButtonReactionChange = (buttonId: string, reaction: { emoji?: string; textResponse?: string }) => {
		setTemplateReactions((prev) => {
			const existing = prev.find((r) => r.buttonId === buttonId);
			const reactionType: "emoji" | "text" = reaction.emoji ? "emoji" : "text";

			if (existing) {
				return prev.map((r) =>
					r.buttonId === buttonId
						? {
								...r,
								...reaction,
								type: reactionType,
								isActive: !!(reaction.emoji || reaction.textResponse),
							}
						: r,
				);
			} else {
				return [
					...prev,
					{
						id: `reaction_${buttonId}_${Date.now()}`,
						buttonId,
						messageId: template?.id || "",
						type: reactionType,
						isActive: true,
						...reaction,
					},
				];
			}
		});
	};

	const handleEmojiSelect = (buttonId: string, emoji: string) => {
		if (emoji === "TEXT_RESPONSE") {
			setShowEmojiPicker(null);
			setShowTextEditor(buttonId);
		} else {
			handleButtonReactionChange(buttonId, { emoji, textResponse: "" });
			setShowEmojiPicker(null);
			toast.success(`Emoji ${emoji} configurado para o botão`);
		}
	};

	const handleTextResponseSave = (buttonId: string, text: string) => {
		handleButtonReactionChange(buttonId, { emoji: "", textResponse: text });
		setShowTextEditor(null);
		toast.success("Resposta de texto configurada para o botão");
	};

	const handleButtonClick = (buttonId: string) => {
		if (reactionConfigMode) {
			setShowEmojiPicker(buttonId);
		} else {
			// Modo preview normal - mostrar reação configurada
			const reaction = templateReactions.find((r) => r.buttonId === buttonId);
			if (reaction?.emoji) {
				toast.success(`Reação configurada: ${reaction.emoji}`, {
					description: `Será enviada quando este botão for clicado`,
				});
			} else if (reaction?.textResponse) {
				toast.success(`Mensagem configurada: "${reaction.textResponse}"`, {
					description: `Será enviada quando este botão for clicado`,
				});
			} else {
				toast.info(`Botão clicado`, {
					description: "Nenhuma reação configurada para este botão",
				});
			}
		}
	};

	if (isLoading) {
		return (
			<div className="flex flex-col justify-center items-center h-[60vh]">
				<DotLottieReact
					src="/animations/loading.lottie"
					autoplay
					loop
					style={{ width: 150, height: 150 }}
					aria-label="Carregando informações do template"
				/>
				<p className="mt-4 text-muted-foreground">Carregando informações do template...</p>
			</div>
		);
	}

	if (error || !template) {
		return (
			<Alert variant="destructive">
				<AlertCircle />
				<AlertTitle>Erro</AlertTitle>
				<AlertDescription>{error || "Template não encontrado"}</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="max-w-6xl mx-auto py-10 space-y-6">
			{/* Conteúdo e envio */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="md:col-span-2 space-y-6">
					{/* Visão do template */}
					<Card>
						<CardHeader>
							<CardTitle>Conteúdo do Template</CardTitle>
							<CardDescription>Visualização</CardDescription>
						</CardHeader>
						<CardContent>
							<Tabs defaultValue="visual">
								<TabsList>
									<TabsTrigger value="visual">Visual</TabsTrigger>
									<TabsTrigger value="json">JSON</TabsTrigger>
								</TabsList>
								<TabsContent value="visual">
									{(() => {
										const interactiveMessage = convertTemplateToInteractiveMessage();
										return interactiveMessage ? (
											<InteractivePreview
												message={interactiveMessage}
												reactions={templateReactions}
												onButtonClick={handleButtonClick}
												showReactionIndicators={true}
												showReactionConfig={true}
												onButtonReactionChange={handleButtonReactionChange}
												title="Preview do Template com Reações"
											/>
										) : (
											<div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
												<p className="text-lg">Erro ao carregar preview do template</p>
											</div>
										);
									})()}
								</TabsContent>
								<TabsContent value="json">
									<pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px]">
										{JSON.stringify(template.componentes, null, 2)}
									</pre>
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>

					{/* Enviar teste */}
					<Card>
						<CardHeader>
							<CardTitle>Enviar Mensagem</CardTitle>
							<CardDescription>Testes e envios</CardDescription>
						</CardHeader>
						<CardContent>
							<Tabs defaultValue="individual">
								<TabsList className="grid w-full grid-cols-2 mb-4">
									<TabsTrigger value="individual">Mensagem de Teste</TabsTrigger>
									<TabsTrigger value="massa">Envio em Massa</TabsTrigger>
								</TabsList>

								<TabsContent value="individual" className="space-y-4">
									<div>
										<Label htmlFor="phone">Número (com DDD)</Label>
										<Input
											id="phone"
											type="tel"
											placeholder="11999999999"
											value={testPhoneNumber}
											onChange={(e) => setTestPhoneNumber(e.target.value)}
										/>
									</div>

									{pageVariables.length > 0 && (
										<div>
											<p className="font-medium mb-2">Variáveis</p>
											<div className="space-y-3">
												{pageVariables.map((v, idx) => (
													<div
														key={`${v.placeholder}-${idx}`}
														className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-start"
													>
														<Label className="text-xs sm:text-sm truncate">
															<code className="bg-muted px-1 py-0.5 rounded">{v.placeholder}</code>
															{v.scope === "header" ? " (HEADER)" : v.scope === "body" ? " (BODY)" : " (CUPOM)"}
														</Label>
														<div className="sm:col-span-3">
															<Input
																placeholder={v.example || "Valor"}
																value={v.value}
																onChange={(e) => {
																	const next = [...pageVariables];
																	next[idx] = { ...v, value: e.target.value };
																	setPageVariables(next);
																	if (v.scope === "coupon") setCouponCode(e.target.value);
																}}
															/>
															{v.scope === "coupon" ? (
																<p className="text-xs text-muted-foreground mt-1">Máx. 15 caracteres alfanuméricos</p>
															) : null}
														</div>
													</div>
												))}
											</div>
										</div>
									)}

									{hasHeaderMedia && (
										<div>
											<Label>Mídia do cabeçalho</Label>
											<Input
												placeholder="https://... ou ID"
												value={headerMedia}
												onChange={(e) => setHeaderMedia(e.target.value)}
											/>
											{headerMedia && (
												<p className="text-xs text-muted-foreground mt-1">
													{getMediaSourceLabel(headerMedia, template?.publicMediaUrl)}
													{template?.publicMediaUrl && headerMedia !== template.publicMediaUrl && (
														<Button
															variant="link"
															className="p-0 h-auto text-xs"
															onClick={() => setHeaderMedia(template.publicMediaUrl || "")}
														>
															Usar cópia local
														</Button>
													)}
												</p>
											)}
										</div>
									)}

									<Button onClick={handleTestSend} disabled={isSending || !testPhoneNumber} className="w-full">
										{isSending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
										Enviar Teste
									</Button>
								</TabsContent>

								<TabsContent value="massa" className="space-y-4">
									<div className="space-y-4">
										<Button onClick={() => setShowLeadsSelector(true)} variant="outline" className="w-full">
											Selecionar Leads da Base
										</Button>

										{contactList.length > 0 && (
											<div className="space-y-2">
												<p className="text-sm font-medium">{contactList.length} contatos selecionados</p>
												<div
													className="send-button-wrapper"
													style={{
														animation: isMassSending ? "pulse-glow 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
													}}
												>
													<button
														onClick={handleMassSend}
														disabled={isMassSending}
														style={{
															width: "100%",
															padding: "12px 16px",
															fontSize: "16px",
															fontWeight: "bold",
															height: "48px",
															borderRadius: "6px",
															border: "none",
															cursor: isMassSending ? "default" : "pointer",
															backgroundColor: isMassSending ? "#22c55e" : "#10b981",
															backgroundImage: !isMassSending ? "linear-gradient(to right, #22c55e, #10b981)" : "none",
															color: "white",
															boxShadow: isMassSending
																? "0 0 30px rgba(34, 197, 94, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.1)"
																: "0 10px 25px rgba(34, 197, 94, 0.4)",
															opacity: isMassSending ? 0.95 : 1,
															transition: "all 0.3s ease",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															gap: "8px",
														}}
													>
														{isMassSending ? (
															<Loader2 className="animate-spin h-5 w-5" />
														) : (
															<span className="text-xl">🚀</span>
														)}
														{isMassSending ? "Enviando..." : "Enviar para Todos"}
													</button>
												</div>
												<style jsx global>{`
                          @keyframes pulse-glow {
                            0%, 100% {
                              filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.6)) drop-shadow(0 0 40px rgba(34, 197, 94, 0.4));
                            }
                            50% {
                              filter: drop-shadow(0 0 40px rgba(34, 197, 94, 0.9)) drop-shadow(0 0 80px rgba(34, 197, 94, 0.6));
                            }
                          }
                        `}</style>
											</div>
										)}
									</div>
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center justify-between">
								<span>{template.name}</span>
								<Button variant="destructive" onClick={() => setShowDeleteDialog(true)} disabled={isDeleting}>
									{isDeleting ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : <Trash2 className="mr-1 h-4 w-4" />}
									Excluir
								</Button>
							</CardTitle>
							<CardDescription>
								Categoria: {template.category} | Status: {template.status}
							</CardDescription>
						</CardHeader>
					</Card>
				</div>
			</div>

			{/* Dialogs */}
			<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar Exclusão</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja excluir o template "{template.name}"? Esta ação não pode ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleDelete}>
							Excluir
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<SendProgressDialog
				isOpen={showSendProgress}
				onClose={() => setShowSendProgress(false)}
				isComplete={sendProgressComplete}
				numContacts={contactList.length}
				templateName={template?.name || "Template"}
			/>

			<LeadsSelectorDialog
				isOpen={showLeadsSelector}
				onClose={() => setShowLeadsSelector(false)}
				onConfirm={handleLeadsSelection}
			/>

			{/* Emoji Picker para configurar reações */}
			{showEmojiPicker && (
				<ButtonReactionPicker
					isOpen={true}
					onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
					onClose={() => setShowEmojiPicker(null)}
					inboxId={undefined} // Templates são globais, não têm inbox específico
				/>
			)}

			{/* Editor de texto para respostas automáticas */}
			{showTextEditor && (
				<WhatsAppTextEditor
					onSave={(text) => handleTextResponseSave(showTextEditor, text)}
					onClose={() => setShowTextEditor(null)}
					placeholder="Digite a resposta que será enviada quando este botão for clicado..."
				/>
			)}
		</div>
	);
}
