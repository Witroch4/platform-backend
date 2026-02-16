"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	ArrowLeft,
	Save,
	Eye,
	MessageSquare,
	MessageCircle,
	Bot,
	Globe,
	Lock,
	Plus,
	X,
	Upload,
	Link as LinkIcon,
	List,
	MapPin,
	Workflow,
} from "lucide-react";
import { TemplateType, TemplateScope } from "@prisma/client";

interface ChatwitInbox {
	id: string;
	nome: string;
	inboxId: string;
}

interface UnifiedTemplateCreatorProps {
	onSuccess?: (templateId: string) => void;
	initialData?: Partial<TemplateFormData>;
}

interface TemplateFormData {
	name: string;
	description: string;
	type: TemplateType;
	scope: TemplateScope;
	language: string;
	tags: string[];
	inboxId: string;
	// Simple reply
	simpleReplyText: string;
	// Interactive content
	interactiveContent: {
		header?: {
			type: string;
			content: string;
		};
		body: {
			text: string;
		};
		footer?: {
			text: string;
		};
		actionType: "cta_url" | "reply_button" | "list" | "flow" | "location_request" | null;
		actionCtaUrl?: {
			displayText: string;
			url: string;
		};
		actionReplyButton?: {
			buttons: Array<{
				id: string;
				title: string;
			}>;
		};
		actionList?: {
			buttonText: string;
			sections: Array<{
				title: string;
				rows: Array<{
					id: string;
					title: string;
					description?: string;
				}>;
			}>;
		};
		actionFlow?: {
			flowId: string;
			flowCta: string;
			flowMode: string;
		};
		actionLocationRequest?: {
			requestText: string;
		};
	};
	// WhatsApp official
	whatsappOfficialInfo: {
		metaTemplateId: string;
		category: string;
		components: any[];
	};
}

export function UnifiedTemplateCreator({ onSuccess, initialData }: UnifiedTemplateCreatorProps) {
	const router = useRouter();
	const [inboxes, setInboxes] = useState<ChatwitInbox[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [showPreview, setShowPreview] = useState(false);

	const [formData, setFormData] = useState<TemplateFormData>({
		name: "",
		description: "",
		type: TemplateType.AUTOMATION_REPLY,
		scope: TemplateScope.PRIVATE,
		language: "pt_BR",
		tags: [],
		inboxId: "",
		simpleReplyText: "",
		interactiveContent: {
			body: { text: "" },
			actionType: null,
		},
		whatsappOfficialInfo: {
			metaTemplateId: "",
			category: "UTILITY",
			components: [],
		},
		...initialData,
	});

	useEffect(() => {
		fetchInboxes();
	}, []);

	const fetchInboxes = async () => {
		try {
			const response = await fetch("/api/admin/credentials/inbox");
			const data = await response.json();
			if (response.ok) {
				setInboxes(data.inboxConfigs || []);
			}
		} catch (error) {
			console.error("Erro ao carregar inboxes:", error);
		}
	};

	const handleSave = async () => {
		// Validation
		if (!formData.name.trim()) {
			toast.error("Nome é obrigatório");
			return;
		}

		if (formData.type === TemplateType.AUTOMATION_REPLY && !formData.simpleReplyText.trim()) {
			toast.error("Texto de resposta é obrigatório para templates de automação");
			return;
		}

		if (formData.type === TemplateType.INTERACTIVE_MESSAGE && !formData.interactiveContent.body.text.trim()) {
			toast.error("Texto do corpo é obrigatório para mensagens interativas");
			return;
		}

		if (formData.type === TemplateType.WHATSAPP_OFFICIAL && !formData.whatsappOfficialInfo.metaTemplateId.trim()) {
			toast.error("ID do template da Meta é obrigatório para templates oficiais");
			return;
		}

		setIsSaving(true);
		try {
			const payload: any = {
				name: formData.name,
				description: formData.description,
				type: formData.type,
				scope: formData.scope,
				language: formData.language,
				tags: formData.tags,
				inboxId: formData.inboxId && formData.inboxId !== "global" ? formData.inboxId : null,
			};

			// Add type-specific data
			if (formData.type === TemplateType.AUTOMATION_REPLY) {
				payload.simpleReplyText = formData.simpleReplyText;
			} else if (formData.type === TemplateType.INTERACTIVE_MESSAGE) {
				payload.interactiveContent = {
					body: formData.interactiveContent.body,
					header: formData.interactiveContent.header,
					footer: formData.interactiveContent.footer,
					// Add specific action based on actionType
					...(formData.interactiveContent.actionType === "cta_url" && {
						actionCtaUrl: formData.interactiveContent.actionCtaUrl,
					}),
					...(formData.interactiveContent.actionType === "reply_button" && {
						actionReplyButton: formData.interactiveContent.actionReplyButton,
					}),
					...(formData.interactiveContent.actionType === "list" && {
						actionList: formData.interactiveContent.actionList,
					}),
					...(formData.interactiveContent.actionType === "flow" && {
						actionFlow: formData.interactiveContent.actionFlow,
					}),
					...(formData.interactiveContent.actionType === "location_request" && {
						actionLocationRequest: formData.interactiveContent.actionLocationRequest,
					}),
				};
			} else if (formData.type === TemplateType.WHATSAPP_OFFICIAL) {
				payload.whatsappOfficialInfo = formData.whatsappOfficialInfo;
			}

			const response = await fetch("/api/admin/templates", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (response.ok) {
				const newTemplate = await response.json();
				toast.success("Template criado com sucesso!");
				onSuccess?.(newTemplate.id);
				router.push(`/admin/templates/${newTemplate.id}`);
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao criar template");
			}
		} catch (error: any) {
			console.error("Erro ao criar template:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível criar o template.",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const addTag = (tag: string) => {
		if (tag && !formData.tags.includes(tag)) {
			setFormData((prev) => ({
				...prev,
				tags: [...prev.tags, tag],
			}));
		}
	};

	const removeTag = (tagToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			tags: prev.tags.filter((tag) => tag !== tagToRemove),
		}));
	};

	const addReplyButton = () => {
		const buttons = formData.interactiveContent.actionReplyButton?.buttons || [];
		if (buttons.length < 3) {
			setFormData((prev) => ({
				...prev,
				interactiveContent: {
					...prev.interactiveContent,
					actionReplyButton: {
						buttons: [...buttons, { id: `btn_${Date.now()}`, title: "" }],
					},
				},
			}));
		}
	};

	const removeReplyButton = (index: number) => {
		const buttons = formData.interactiveContent.actionReplyButton?.buttons || [];
		setFormData((prev) => ({
			...prev,
			interactiveContent: {
				...prev.interactiveContent,
				actionReplyButton: {
					buttons: buttons.filter((_, i) => i !== index),
				},
			},
		}));
	};

	const addListSection = () => {
		const sections = formData.interactiveContent.actionList?.sections || [];
		setFormData((prev) => ({
			...prev,
			interactiveContent: {
				...prev.interactiveContent,
				actionList: {
					...prev.interactiveContent.actionList!,
					sections: [...sections, { title: "", rows: [] }],
				},
			},
		}));
	};

	const addListRow = (sectionIndex: number) => {
		const sections = [...(formData.interactiveContent.actionList?.sections || [])];
		sections[sectionIndex].rows.push({
			id: `row_${Date.now()}`,
			title: "",
			description: "",
		});

		setFormData((prev) => ({
			...prev,
			interactiveContent: {
				...prev.interactiveContent,
				actionList: {
					...prev.interactiveContent.actionList!,
					sections,
				},
			},
		}));
	};

	const getTypeIcon = (type: TemplateType) => {
		switch (type) {
			case TemplateType.WHATSAPP_OFFICIAL:
				return <MessageSquare className="h-4 w-4" />;
			case TemplateType.INTERACTIVE_MESSAGE:
				return <MessageCircle className="h-4 w-4" />;
			case TemplateType.AUTOMATION_REPLY:
				return <Bot className="h-4 w-4" />;
			default:
				return <MessageSquare className="h-4 w-4" />;
		}
	};

	const renderPreview = () => {
		switch (formData.type) {
			case TemplateType.AUTOMATION_REPLY:
				return (
					<div className="p-4 bg-muted rounded-lg">
						<div className="text-sm font-medium mb-2">Preview - Resposta Automática</div>
						<div className="bg-background p-3 rounded border">
							{formData.simpleReplyText || "Digite o texto da resposta..."}
						</div>
					</div>
				);

			case TemplateType.INTERACTIVE_MESSAGE:
				return (
					<div className="p-4 bg-muted rounded-lg">
						<div className="text-sm font-medium mb-2">Preview - Mensagem Interativa</div>
						<div className="bg-background p-3 rounded border space-y-3">
							{formData.interactiveContent.header && (
								<div className="font-medium text-primary">{formData.interactiveContent.header.content}</div>
							)}
							<div>{formData.interactiveContent.body.text || "Digite o texto do corpo..."}</div>
							{formData.interactiveContent.footer && (
								<div className="text-sm text-muted-foreground">{formData.interactiveContent.footer.text}</div>
							)}

							{/* Action Preview */}
							{formData.interactiveContent.actionType === "cta_url" && formData.interactiveContent.actionCtaUrl && (
								<Button variant="outline" className="w-full">
									<LinkIcon className="h-4 w-4 mr-2" />
									{formData.interactiveContent.actionCtaUrl.displayText || "Clique aqui"}
								</Button>
							)}

							{formData.interactiveContent.actionType === "reply_button" &&
								formData.interactiveContent.actionReplyButton && (
									<div className="space-y-2">
										{formData.interactiveContent.actionReplyButton.buttons.map((button, index) => (
											<Button key={index} variant="outline" className="w-full">
												{button.title || `Botão ${index + 1}`}
											</Button>
										))}
									</div>
								)}

							{formData.interactiveContent.actionType === "list" && formData.interactiveContent.actionList && (
								<Button variant="outline" className="w-full">
									<List className="h-4 w-4 mr-2" />
									{formData.interactiveContent.actionList.buttonText || "Ver opções"}
								</Button>
							)}
						</div>
					</div>
				);

			case TemplateType.WHATSAPP_OFFICIAL:
				return (
					<div className="p-4 bg-muted rounded-lg">
						<div className="text-sm font-medium mb-2">Preview - Template Oficial</div>
						<div className="bg-background p-3 rounded border">
							<div className="text-sm text-muted-foreground mb-2">
								Meta Template ID: {formData.whatsappOfficialInfo.metaTemplateId || "Não definido"}
							</div>
							<div className="text-sm text-muted-foreground">Categoria: {formData.whatsappOfficialInfo.category}</div>
							<div className="mt-2 text-xs text-muted-foreground">
								O preview completo será exibido após sincronização com a Meta
							</div>
						</div>
					</div>
				);

			default:
				return null;
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold">Criar Novo Template</h1>
						<p className="text-muted-foreground">Crie um template unificado para mensagens do WhatsApp</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
						<Eye className="h-4 w-4 mr-2" />
						{showPreview ? "Ocultar" : "Mostrar"} Preview
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						<Save className="h-4 w-4 mr-2" />
						{isSaving ? "Salvando..." : "Salvar Template"}
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Form */}
				<div className="lg:col-span-2 space-y-6">
					{/* Basic Information */}
					<Card>
						<CardHeader>
							<CardTitle>Informações Básicas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="name">Nome do Template *</Label>
									<Input
										id="name"
										value={formData.name}
										onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
										placeholder="Ex: Boas-vindas automática"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="type">Tipo de Template *</Label>
									<Select
										value={formData.type}
										onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as TemplateType }))}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={TemplateType.AUTOMATION_REPLY}>
												<div className="flex items-center gap-2">
													<Bot className="h-4 w-4" />
													Resposta Automática
												</div>
											</SelectItem>
											<SelectItem value={TemplateType.INTERACTIVE_MESSAGE}>
												<div className="flex items-center gap-2">
													<MessageCircle className="h-4 w-4" />
													Mensagem Interativa
												</div>
											</SelectItem>
											<SelectItem value={TemplateType.WHATSAPP_OFFICIAL}>
												<div className="flex items-center gap-2">
													<MessageSquare className="h-4 w-4" />
													Template Oficial WhatsApp
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Descrição</Label>
								<Textarea
									id="description"
									value={formData.description}
									onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
									placeholder="Descreva o propósito deste template..."
									rows={3}
								/>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label htmlFor="scope">Escopo</Label>
									<Select
										value={formData.scope}
										onValueChange={(value) => setFormData((prev) => ({ ...prev, scope: value as TemplateScope }))}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={TemplateScope.PRIVATE}>
												<div className="flex items-center gap-2">
													<Lock className="h-4 w-4" />
													Privado
												</div>
											</SelectItem>
											<SelectItem value={TemplateScope.GLOBAL}>
												<div className="flex items-center gap-2">
													<Globe className="h-4 w-4" />
													Global
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="language">Idioma</Label>
									<Select
										value={formData.language}
										onValueChange={(value) => setFormData((prev) => ({ ...prev, language: value }))}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="pt_BR">Português (BR)</SelectItem>
											<SelectItem value="en_US">Inglês (US)</SelectItem>
											<SelectItem value="es_ES">Espanhol</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="inbox">Inbox</Label>
									<Select
										value={formData.inboxId}
										onValueChange={(value) => setFormData((prev) => ({ ...prev, inboxId: value }))}
									>
										<SelectTrigger>
											<SelectValue placeholder="Selecione um inbox" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="global">Global (todos os inboxes)</SelectItem>
											{inboxes.map((inbox) => (
												<SelectItem key={inbox.id} value={inbox.id}>
													{inbox.nome} ({inbox.inboxId})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Tags</Label>
								<div className="flex flex-wrap gap-2 mb-2">
									{formData.tags.map((tag) => (
										<Badge key={tag} variant="outline" className="flex items-center gap-1">
											{tag}
											<button
												onClick={() => removeTag(tag)}
												className="ml-1 text-muted-foreground hover:text-destructive"
											>
												<X className="h-3 w-3" />
											</button>
										</Badge>
									))}
								</div>
								<Input
									placeholder="Adicionar tag (pressione Enter)"
									onKeyPress={(e) => {
										if (e.key === "Enter") {
											addTag(e.currentTarget.value);
											e.currentTarget.value = "";
										}
									}}
								/>
							</div>
						</CardContent>
					</Card>

					{/* Type-specific Content */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{getTypeIcon(formData.type)}
								Conteúdo do Template
							</CardTitle>
						</CardHeader>
						<CardContent>
							{formData.type === TemplateType.AUTOMATION_REPLY && (
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="simpleReplyText">Texto da Resposta *</Label>
										<Textarea
											id="simpleReplyText"
											value={formData.simpleReplyText}
											onChange={(e) => setFormData((prev) => ({ ...prev, simpleReplyText: e.target.value }))}
											placeholder="Digite o texto que será enviado automaticamente..."
											rows={4}
										/>
									</div>
								</div>
							)}

							{formData.type === TemplateType.INTERACTIVE_MESSAGE && (
								<Tabs defaultValue="content" className="space-y-4">
									<TabsList>
										<TabsTrigger value="content">Conteúdo</TabsTrigger>
										<TabsTrigger value="actions">Ações</TabsTrigger>
									</TabsList>

									<TabsContent value="content" className="space-y-4">
										<div className="space-y-2">
											<Label>Header (Opcional)</Label>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
												<Select
													value={formData.interactiveContent.header?.type || ""}
													onValueChange={(value) =>
														setFormData((prev) => ({
															...prev,
															interactiveContent: {
																...prev.interactiveContent,
																header:
																	value && value !== "none"
																		? { type: value, content: prev.interactiveContent.header?.content || "" }
																		: undefined,
															},
														}))
													}
												>
													<SelectTrigger>
														<SelectValue placeholder="Tipo do header" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="none">Sem header</SelectItem>
														<SelectItem value="text">Texto</SelectItem>
														<SelectItem value="image">Imagem</SelectItem>
														<SelectItem value="video">Vídeo</SelectItem>
														<SelectItem value="document">Documento</SelectItem>
													</SelectContent>
												</Select>
												{formData.interactiveContent.header && (
													<Input
														placeholder="Conteúdo do header"
														value={formData.interactiveContent.header.content}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																interactiveContent: {
																	...prev.interactiveContent,
																	header: { ...prev.interactiveContent.header!, content: e.target.value },
																},
															}))
														}
													/>
												)}
											</div>
										</div>

										<div className="space-y-2">
											<Label htmlFor="bodyText">Texto do Corpo *</Label>
											<Textarea
												id="bodyText"
												value={formData.interactiveContent.body.text}
												onChange={(e) =>
													setFormData((prev) => ({
														...prev,
														interactiveContent: {
															...prev.interactiveContent,
															body: { text: e.target.value },
														},
													}))
												}
												placeholder="Digite o texto principal da mensagem..."
												rows={4}
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor="footerText">Footer (Opcional)</Label>
											<Input
												id="footerText"
												value={formData.interactiveContent.footer?.text || ""}
												onChange={(e) =>
													setFormData((prev) => ({
														...prev,
														interactiveContent: {
															...prev.interactiveContent,
															footer: e.target.value ? { text: e.target.value } : undefined,
														},
													}))
												}
												placeholder="Texto do rodapé..."
											/>
										</div>
									</TabsContent>

									<TabsContent value="actions" className="space-y-4">
										<div className="space-y-2">
											<Label>Tipo de Ação</Label>
											<Select
												value={formData.interactiveContent.actionType || ""}
												onValueChange={(value) =>
													setFormData((prev) => ({
														...prev,
														interactiveContent: {
															...prev.interactiveContent,
															actionType: value === "none" ? null : (value as any),
														},
													}))
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Selecione o tipo de ação" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Nenhuma ação</SelectItem>
													<SelectItem value="cta_url">
														<div className="flex items-center gap-2">
															<LinkIcon className="h-4 w-4" />
															Botão com URL
														</div>
													</SelectItem>
													<SelectItem value="reply_button">
														<div className="flex items-center gap-2">
															<MessageCircle className="h-4 w-4" />
															Botões de Resposta
														</div>
													</SelectItem>
													<SelectItem value="list">
														<div className="flex items-center gap-2">
															<List className="h-4 w-4" />
															Lista de Opções
														</div>
													</SelectItem>
													<SelectItem value="flow">
														<div className="flex items-center gap-2">
															<Workflow className="h-4 w-4" />
															Flow
														</div>
													</SelectItem>
													<SelectItem value="location_request">
														<div className="flex items-center gap-2">
															<MapPin className="h-4 w-4" />
															Solicitar Localização
														</div>
													</SelectItem>
												</SelectContent>
											</Select>
										</div>

										{/* CTA URL Action */}
										{formData.interactiveContent.actionType === "cta_url" && (
											<div className="space-y-4 p-4 border rounded-lg">
												<h4 className="font-medium">Configurar Botão com URL</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
													<div className="space-y-2">
														<Label>Texto do Botão</Label>
														<Input
															value={formData.interactiveContent.actionCtaUrl?.displayText || ""}
															onChange={(e) =>
																setFormData((prev) => ({
																	...prev,
																	interactiveContent: {
																		...prev.interactiveContent,
																		actionCtaUrl: {
																			...prev.interactiveContent.actionCtaUrl!,
																			displayText: e.target.value,
																		},
																	},
																}))
															}
															placeholder="Ex: Visitar Site"
														/>
													</div>
													<div className="space-y-2">
														<Label>URL</Label>
														<Input
															value={formData.interactiveContent.actionCtaUrl?.url || ""}
															onChange={(e) =>
																setFormData((prev) => ({
																	...prev,
																	interactiveContent: {
																		...prev.interactiveContent,
																		actionCtaUrl: {
																			...prev.interactiveContent.actionCtaUrl!,
																			url: e.target.value,
																		},
																	},
																}))
															}
															placeholder="https://exemplo.com"
														/>
													</div>
												</div>
											</div>
										)}

										{/* Reply Buttons Action */}
										{formData.interactiveContent.actionType === "reply_button" && (
											<div className="space-y-4 p-4 border rounded-lg">
												<div className="flex items-center justify-between">
													<h4 className="font-medium">Botões de Resposta</h4>
													<Button
														variant="outline"
														onClick={addReplyButton}
														disabled={(formData.interactiveContent.actionReplyButton?.buttons.length || 0) >= 3}
													>
														<Plus className="h-4 w-4 mr-2" />
														Adicionar Botão
													</Button>
												</div>
												<div className="space-y-2">
													{formData.interactiveContent.actionReplyButton?.buttons.map((button, index) => (
														<div key={index} className="flex items-center gap-2">
															<Input
																value={button.title}
																onChange={(e) => {
																	const buttons = [...(formData.interactiveContent.actionReplyButton?.buttons || [])];
																	buttons[index].title = e.target.value;
																	setFormData((prev) => ({
																		...prev,
																		interactiveContent: {
																			...prev.interactiveContent,
																			actionReplyButton: { buttons },
																		},
																	}));
																}}
																placeholder={`Título do botão ${index + 1}`}
															/>
															<Button variant="outline" size="icon" onClick={() => removeReplyButton(index)}>
																<X className="h-4 w-4" />
															</Button>
														</div>
													))}
												</div>
											</div>
										)}

										{/* List Action */}
										{formData.interactiveContent.actionType === "list" && (
											<div className="space-y-4 p-4 border rounded-lg">
												<h4 className="font-medium">Lista de Opções</h4>
												<div className="space-y-2">
													<Label>Texto do Botão da Lista</Label>
													<Input
														value={formData.interactiveContent.actionList?.buttonText || ""}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																interactiveContent: {
																	...prev.interactiveContent,
																	actionList: {
																		...prev.interactiveContent.actionList!,
																		buttonText: e.target.value,
																	},
																},
															}))
														}
														placeholder="Ex: Ver Opções"
													/>
												</div>
												<div className="space-y-4">
													<div className="flex items-center justify-between">
														<Label>Seções</Label>
														<Button variant="outline" onClick={addListSection}>
															<Plus className="h-4 w-4 mr-2" />
															Adicionar Seção
														</Button>
													</div>
													{formData.interactiveContent.actionList?.sections.map((section, sectionIndex) => (
														<div key={sectionIndex} className="p-3 border rounded space-y-2">
															<Input
																value={section.title}
																onChange={(e) => {
																	const sections = [...(formData.interactiveContent.actionList?.sections || [])];
																	sections[sectionIndex].title = e.target.value;
																	setFormData((prev) => ({
																		...prev,
																		interactiveContent: {
																			...prev.interactiveContent,
																			actionList: {
																				...prev.interactiveContent.actionList!,
																				sections,
																			},
																		},
																	}));
																}}
																placeholder="Título da seção"
															/>
															<div className="space-y-2">
																{section.rows.map((row, rowIndex) => (
																	<div key={rowIndex} className="grid grid-cols-2 gap-2">
																		<Input
																			value={row.title}
																			onChange={(e) => {
																				const sections = [...(formData.interactiveContent.actionList?.sections || [])];
																				sections[sectionIndex].rows[rowIndex].title = e.target.value;
																				setFormData((prev) => ({
																					...prev,
																					interactiveContent: {
																						...prev.interactiveContent,
																						actionList: {
																							...prev.interactiveContent.actionList!,
																							sections,
																						},
																					},
																				}));
																			}}
																			placeholder="Título da opção"
																		/>
																		<Input
																			value={row.description || ""}
																			onChange={(e) => {
																				const sections = [...(formData.interactiveContent.actionList?.sections || [])];
																				sections[sectionIndex].rows[rowIndex].description = e.target.value;
																				setFormData((prev) => ({
																					...prev,
																					interactiveContent: {
																						...prev.interactiveContent,
																						actionList: {
																							...prev.interactiveContent.actionList!,
																							sections,
																						},
																					},
																				}));
																			}}
																			placeholder="Descrição (opcional)"
																		/>
																	</div>
																))}
																<Button variant="outline" onClick={() => addListRow(sectionIndex)}>
																	<Plus className="h-4 w-4 mr-2" />
																	Adicionar Opção
																</Button>
															</div>
														</div>
													))}
												</div>
											</div>
										)}

										{/* Flow Action */}
										{formData.interactiveContent.actionType === "flow" && (
											<div className="space-y-4 p-4 border rounded-lg">
												<h4 className="font-medium">Configurar Flow</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
													<div className="space-y-2">
														<Label>Flow ID</Label>
														<Input
															value={formData.interactiveContent.actionFlow?.flowId || ""}
															onChange={(e) =>
																setFormData((prev) => ({
																	...prev,
																	interactiveContent: {
																		...prev.interactiveContent,
																		actionFlow: {
																			...prev.interactiveContent.actionFlow!,
																			flowId: e.target.value,
																		},
																	},
																}))
															}
															placeholder="ID do flow"
														/>
													</div>
													<div className="space-y-2">
														<Label>Texto do Botão</Label>
														<Input
															value={formData.interactiveContent.actionFlow?.flowCta || ""}
															onChange={(e) =>
																setFormData((prev) => ({
																	...prev,
																	interactiveContent: {
																		...prev.interactiveContent,
																		actionFlow: {
																			...prev.interactiveContent.actionFlow!,
																			flowCta: e.target.value,
																		},
																	},
																}))
															}
															placeholder="Ex: Iniciar Flow"
														/>
													</div>
												</div>
											</div>
										)}

										{/* Location Request Action */}
										{formData.interactiveContent.actionType === "location_request" && (
											<div className="space-y-4 p-4 border rounded-lg">
												<h4 className="font-medium">Solicitar Localização</h4>
												<div className="space-y-2">
													<Label>Texto da Solicitação</Label>
													<Input
														value={formData.interactiveContent.actionLocationRequest?.requestText || ""}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																interactiveContent: {
																	...prev.interactiveContent,
																	actionLocationRequest: {
																		requestText: e.target.value,
																	},
																},
															}))
														}
														placeholder="Ex: Compartilhe sua localização"
													/>
												</div>
											</div>
										)}
									</TabsContent>
								</Tabs>
							)}

							{formData.type === TemplateType.WHATSAPP_OFFICIAL && (
								<div className="space-y-4">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label htmlFor="metaTemplateId">Meta Template ID *</Label>
											<Input
												id="metaTemplateId"
												value={formData.whatsappOfficialInfo.metaTemplateId}
												onChange={(e) =>
													setFormData((prev) => ({
														...prev,
														whatsappOfficialInfo: {
															...prev.whatsappOfficialInfo,
															metaTemplateId: e.target.value,
														},
													}))
												}
												placeholder="ID do template na Meta"
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="category">Categoria</Label>
											<Select
												value={formData.whatsappOfficialInfo.category}
												onValueChange={(value) =>
													setFormData((prev) => ({
														...prev,
														whatsappOfficialInfo: {
															...prev.whatsappOfficialInfo,
															category: value,
														},
													}))
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="UTILITY">Utilidade</SelectItem>
													<SelectItem value="MARKETING">Marketing</SelectItem>
													<SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="p-4 bg-muted rounded-lg">
										<div className="text-sm text-muted-foreground">
											<strong>Nota:</strong> Templates oficiais do WhatsApp devem ser criados e aprovados no Business
											Manager da Meta antes de serem usados aqui. Este formulário apenas registra a referência ao
											template já existente.
										</div>
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Preview */}
				{showPreview && (
					<div className="lg:col-span-1">
						<div className="sticky top-6">{renderPreview()}</div>
					</div>
				)}
			</div>
		</div>
	);
}
