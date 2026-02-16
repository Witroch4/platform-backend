"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	ArrowLeft,
	Save,
	RefreshCw,
	User,
	Instagram,
	Scale,
	Mail,
	Phone,
	Calendar,
	Tag,
	MessageSquare,
	Bot,
	Send,
	Edit,
	Trash2,
	Eye,
	BarChart3,
} from "lucide-react";
import { LeadSource } from "@prisma/client";

interface UnifiedLeadDetail {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	avatarUrl: string | null;
	source: LeadSource;
	sourceIdentifier: string;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	user: {
		id: string;
		name: string | null;
		email: string;
	} | null;
	account: {
		id: string;
		provider: string;
		igUserId: string | null;
		igUsername: string | null;
	} | null;
	instagramProfile?: {
		id: string;
		isFollower: boolean;
		lastMessageAt: string | null;
		isOnline: boolean;
	} | null;
	oabData?: {
		id: string;
		concluido: boolean;
		anotacoes: string | null;
		seccional: string | null;
		areaJuridica: string | null;
		notaFinal: number | null;
		situacao: string | null;
		inscricao: string | null;
		especialidade: string | null;
		usuarioChatwit: {
			id: string;
			name: string;
			accountName: string;
		};
		arquivos: {
			id: string;
			fileType: string;
			dataUrl: string;
			pdfConvertido: string | null;
			createdAt: string;
		}[];
		espelhoBiblioteca: {
			id: string;
			nome: string;
			descricao: string | null;
		} | null;
	} | null;
	automacoes: {
		id: string;
		automacao: {
			id: string;
			palavrasChave: string | null;
			fraseBoasVindas: string | null;
			live: boolean;
			createdAt: string;
		};
	}[];
	chats: {
		id: string;
		messages: {
			id: string;
			content: string;
			isFromLead: boolean;
			createdAt: string;
		}[];
	}[];
	disparos: {
		id: string;
		templateName: string;
		status: string;
		scheduledAt: string | null;
		sentAt: string | null;
		errorMessage: string | null;
		createdAt: string;
	}[];
	stats: {
		chatsCount: number;
		automacoesCount: number;
		disparosCount: number;
	};
}

interface UnifiedLeadDetailProps {
	leadId: string;
	onUpdate?: () => void;
	onDelete?: () => void;
}

export function UnifiedLeadDetail({ leadId, onUpdate, onDelete }: UnifiedLeadDetailProps) {
	const router = useRouter();
	const [lead, setLead] = useState<UnifiedLeadDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isEditing, setIsEditing] = useState(false);

	// Form state
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		phone: "",
		tags: [] as string[],
		// Instagram specific
		instagramProfile: {
			isFollower: false,
			isOnline: false,
		},
		// OAB specific
		oabData: {
			concluido: false,
			anotacoes: "",
			seccional: "",
			areaJuridica: "",
			notaFinal: null as number | null,
			situacao: "",
			inscricao: "",
			especialidade: "",
		},
	});

	useEffect(() => {
		fetchLead();
	}, [leadId]);

	const fetchLead = async () => {
		setIsLoading(true);
		try {
			const response = await fetch(`/api/admin/leads/${leadId}`);
			const data = await response.json();

			if (response.ok) {
				setLead(data);
				setFormData({
					name: data.name || "",
					email: data.email || "",
					phone: data.phone || "",
					tags: data.tags || [],
					instagramProfile: {
						isFollower: data.instagramProfile?.isFollower || false,
						isOnline: data.instagramProfile?.isOnline || false,
					},
					oabData: {
						concluido: data.oabData?.concluido || false,
						anotacoes: data.oabData?.anotacoes || "",
						seccional: data.oabData?.seccional || "",
						areaJuridica: data.oabData?.areaJuridica || "",
						notaFinal: data.oabData?.notaFinal || null,
						situacao: data.oabData?.situacao || "",
						inscricao: data.oabData?.inscricao || "",
						especialidade: data.oabData?.especialidade || "",
					},
				});
			} else {
				throw new Error(data.error || "Erro ao buscar lead");
			}
		} catch (error) {
			console.error("Erro ao buscar lead:", error);
			toast.error("Erro", {
				description: "Não foi possível carregar os dados do lead.",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleSave = async () => {
		setIsSaving(true);
		try {
			const updateData: any = {
				name: formData.name,
				email: formData.email,
				phone: formData.phone,
				tags: formData.tags,
			};

			// Add source-specific data
			if (lead?.source === LeadSource.INSTAGRAM) {
				updateData.instagramProfile = formData.instagramProfile;
			} else if (lead?.source === LeadSource.CHATWIT_OAB) {
				updateData.oabData = formData.oabData;
			}

			const response = await fetch(`/api/admin/leads/${leadId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updateData),
			});

			if (response.ok) {
				const updatedLead = await response.json();
				setLead(updatedLead);
				setIsEditing(false);
				toast.success("Lead atualizado com sucesso!");
				onUpdate?.();
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao atualizar lead");
			}
		} catch (error: any) {
			console.error("Erro ao atualizar lead:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível atualizar o lead.",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!confirm("Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.")) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/leads/${leadId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("Lead excluído com sucesso!");
				onDelete?.();
				router.push("/admin/leads");
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao excluir lead");
			}
		} catch (error: any) {
			console.error("Erro ao excluir lead:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível excluir o lead.",
			});
		}
	};

	const getSourceIcon = (source: LeadSource) => {
		switch (source) {
			case LeadSource.INSTAGRAM:
				return <Instagram className="h-5 w-5" />;
			case LeadSource.CHATWIT_OAB:
				return <Scale className="h-5 w-5" />;
			case LeadSource.MANUAL:
				return <User className="h-5 w-5" />;
			default:
				return <User className="h-5 w-5" />;
		}
	};

	const getSourceColor = (source: LeadSource) => {
		switch (source) {
			case LeadSource.INSTAGRAM:
				return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400";
			case LeadSource.CHATWIT_OAB:
				return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
			case LeadSource.MANUAL:
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("pt-BR", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
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

	if (isLoading) {
		return (
			<div className="flex justify-center py-8">
				<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!lead) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				<User className="h-12 w-12 mx-auto mb-4 opacity-50" />
				<h3 className="text-lg font-medium mb-2">Lead não encontrado</h3>
				<p className="text-sm">O lead solicitado não existe ou foi removido.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold flex items-center gap-2">
							{lead.avatarUrl && (
								<img src={lead.avatarUrl} alt={lead.name || "Avatar"} className="h-8 w-8 rounded-full" />
							)}
							{lead.name || "Lead sem nome"}
						</h1>
						<div className="flex items-center gap-2 text-muted-foreground">
							<Badge className={getSourceColor(lead.source)}>
								<div className="flex items-center gap-1">
									{getSourceIcon(lead.source)}
									{lead.source}
								</div>
							</Badge>
							<span>•</span>
							<span>ID: {lead.sourceIdentifier}</span>
							<span>•</span>
							<span>Criado em {formatDate(lead.createdAt)}</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{isEditing ? (
						<>
							<Button variant="outline" onClick={() => setIsEditing(false)}>
								Cancelar
							</Button>
							<Button onClick={handleSave} disabled={isSaving}>
								<Save className="h-4 w-4 mr-2" />
								{isSaving ? "Salvando..." : "Salvar"}
							</Button>
						</>
					) : (
						<>
							<Button variant="outline" onClick={() => setIsEditing(true)}>
								<Edit className="h-4 w-4 mr-2" />
								Editar
							</Button>
							<Button variant="destructive" onClick={handleDelete}>
								<Trash2 className="h-4 w-4 mr-2" />
								Excluir
							</Button>
						</>
					)}
				</div>
			</div>

			<Tabs defaultValue="general" className="space-y-6">
				<TabsList>
					<TabsTrigger value="general">Informações Gerais</TabsTrigger>
					{lead.source === LeadSource.INSTAGRAM && <TabsTrigger value="instagram">Instagram</TabsTrigger>}
					{lead.source === LeadSource.CHATWIT_OAB && <TabsTrigger value="oab">Dados OAB</TabsTrigger>}
					<TabsTrigger value="interactions">Interações</TabsTrigger>
					<TabsTrigger value="stats">Estatísticas</TabsTrigger>
				</TabsList>

				{/* General Information Tab */}
				<TabsContent value="general">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<Card>
							<CardHeader>
								<CardTitle>Dados Básicos</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="name">Nome</Label>
									<Input
										id="name"
										value={formData.name}
										onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
										disabled={!isEditing}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="email">Email</Label>
									<Input
										id="email"
										type="email"
										value={formData.email}
										onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
										disabled={!isEditing}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="phone">Telefone</Label>
									<Input
										id="phone"
										value={formData.phone}
										onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
										disabled={!isEditing}
									/>
								</div>
								<div className="space-y-2">
									<Label>Tags</Label>
									<div className="flex flex-wrap gap-2 mb-2">
										{formData.tags.map((tag) => (
											<Badge key={tag} variant="outline" className="flex items-center gap-1">
												<Tag className="h-3 w-3" />
												{tag}
												{isEditing && (
													<button
														onClick={() => removeTag(tag)}
														className="ml-1 text-muted-foreground hover:text-destructive"
													>
														×
													</button>
												)}
											</Badge>
										))}
									</div>
									{isEditing && (
										<Input
											placeholder="Adicionar tag (pressione Enter)"
											onKeyPress={(e) => {
												if (e.key === "Enter") {
													addTag(e.currentTarget.value);
													e.currentTarget.value = "";
												}
											}}
										/>
									)}
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Informações do Sistema</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label>Origem</Label>
									<Badge className={getSourceColor(lead.source)}>
										<div className="flex items-center gap-1">
											{getSourceIcon(lead.source)}
											{lead.source}
										</div>
									</Badge>
								</div>
								<div className="space-y-2">
									<Label>Identificador na Origem</Label>
									<Input value={lead.sourceIdentifier} disabled />
								</div>
								{lead.user && (
									<div className="space-y-2">
										<Label>Usuário Responsável</Label>
										<div className="text-sm">
											<div className="font-medium">{lead.user.name || "Sem nome"}</div>
											<div className="text-muted-foreground">{lead.user.email}</div>
										</div>
									</div>
								)}
								{lead.account && (
									<div className="space-y-2">
										<Label>Conta Conectada</Label>
										<div className="text-sm">
											<div className="font-medium">{lead.account.provider}</div>
											{lead.account.igUsername && (
												<div className="text-muted-foreground">@{lead.account.igUsername}</div>
											)}
										</div>
									</div>
								)}
								<div className="space-y-2">
									<Label>Datas</Label>
									<div className="text-sm space-y-1">
										<div>Criado: {formatDate(lead.createdAt)}</div>
										<div>Atualizado: {formatDate(lead.updatedAt)}</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				{/* Instagram Tab */}
				{lead.source === LeadSource.INSTAGRAM && (
					<TabsContent value="instagram">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Instagram className="h-5 w-5" />
									Dados do Instagram
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								{lead.instagramProfile ? (
									<>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div className="space-y-2">
												<Label>Status de Seguidor</Label>
												<Badge variant={lead.instagramProfile.isFollower ? "default" : "outline"}>
													{lead.instagramProfile.isFollower ? "Seguidor" : "Não seguidor"}
												</Badge>
											</div>
											<div className="space-y-2">
												<Label>Status Online</Label>
												<Badge variant={lead.instagramProfile.isOnline ? "default" : "outline"}>
													{lead.instagramProfile.isOnline ? "Online" : "Offline"}
												</Badge>
											</div>
										</div>
										{lead.instagramProfile.lastMessageAt && (
											<div className="space-y-2">
												<Label>Última Mensagem</Label>
												<div className="text-sm text-muted-foreground">
													{formatDate(lead.instagramProfile.lastMessageAt)}
												</div>
											</div>
										)}
									</>
								) : (
									<div className="text-center py-8 text-muted-foreground">
										<Instagram className="h-12 w-12 mx-auto mb-4 opacity-50" />
										<p>Nenhum dado específico do Instagram disponível.</p>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				)}

				{/* OAB Tab */}
				{lead.source === LeadSource.CHATWIT_OAB && (
					<TabsContent value="oab">
						<div className="space-y-6">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Scale className="h-5 w-5" />
										Dados da OAB
									</CardTitle>
								</CardHeader>
								<CardContent>
									{lead.oabData ? (
										<div className="space-y-4">
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div className="space-y-2">
													<Label>Status</Label>
													<Badge variant={lead.oabData.concluido ? "default" : "outline"}>
														{lead.oabData.concluido ? "Concluído" : "Em andamento"}
													</Badge>
												</div>
												<div className="space-y-2">
													<Label>Inscrição OAB</Label>
													<Input
														value={formData.oabData.inscricao}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																oabData: { ...prev.oabData, inscricao: e.target.value },
															}))
														}
														disabled={!isEditing}
													/>
												</div>
												<div className="space-y-2">
													<Label>Seccional</Label>
													<Input
														value={formData.oabData.seccional}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																oabData: { ...prev.oabData, seccional: e.target.value },
															}))
														}
														disabled={!isEditing}
													/>
												</div>
												<div className="space-y-2">
													<Label>Área Jurídica</Label>
													<Input
														value={formData.oabData.areaJuridica}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																oabData: { ...prev.oabData, areaJuridica: e.target.value },
															}))
														}
														disabled={!isEditing}
													/>
												</div>
												<div className="space-y-2">
													<Label>Especialidade</Label>
													<Input
														value={formData.oabData.especialidade}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																oabData: { ...prev.oabData, especialidade: e.target.value },
															}))
														}
														disabled={!isEditing}
													/>
												</div>
												<div className="space-y-2">
													<Label>Situação</Label>
													<Input
														value={formData.oabData.situacao}
														onChange={(e) =>
															setFormData((prev) => ({
																...prev,
																oabData: { ...prev.oabData, situacao: e.target.value },
															}))
														}
														disabled={!isEditing}
													/>
												</div>
											</div>
											{lead.oabData.notaFinal && (
												<div className="space-y-2">
													<Label>Nota Final</Label>
													<div className="text-2xl font-bold text-primary">{lead.oabData.notaFinal}</div>
												</div>
											)}
											<div className="space-y-2">
												<Label>Anotações</Label>
												<Textarea
													value={formData.oabData.anotacoes}
													onChange={(e) =>
														setFormData((prev) => ({
															...prev,
															oabData: { ...prev.oabData, anotacoes: e.target.value },
														}))
													}
													disabled={!isEditing}
													rows={4}
												/>
											</div>
											{lead.oabData.arquivos && lead.oabData.arquivos.length > 0 && (
												<div className="space-y-2">
													<Label>Arquivos ({lead.oabData.arquivos.length})</Label>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
														{lead.oabData.arquivos.map((arquivo) => (
															<div key={arquivo.id} className="flex items-center gap-2 p-2 border rounded">
																<div className="flex-1">
																	<div className="text-sm font-medium">{arquivo.fileType}</div>
																	<div className="text-xs text-muted-foreground">{formatDate(arquivo.createdAt)}</div>
																</div>
																<Button variant="outline" onClick={() => window.open(arquivo.dataUrl, "_blank")}>
																	<Eye className="h-4 w-4" />
																</Button>
															</div>
														))}
													</div>
												</div>
											)}
										</div>
									) : (
										<div className="text-center py-8 text-muted-foreground">
											<Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
											<p>Nenhum dado específico da OAB disponível.</p>
										</div>
									)}
								</CardContent>
							</Card>
						</div>
					</TabsContent>
				)}

				{/* Interactions Tab */}
				<TabsContent value="interactions">
					<div className="space-y-6">
						{/* Automations */}
						{lead.automacoes.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Bot className="h-5 w-5" />
										Automações ({lead.automacoes.length})
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										{lead.automacoes.map((automacao) => (
											<div key={automacao.id} className="flex items-center justify-between p-3 border rounded">
												<div>
													<div className="font-medium">
														{automacao.automacao.palavrasChave || "Automação sem palavras-chave"}
													</div>
													<div className="text-sm text-muted-foreground">{automacao.automacao.fraseBoasVindas}</div>
													<div className="text-xs text-muted-foreground">
														Criada em {formatDate(automacao.automacao.createdAt)}
													</div>
												</div>
												<Badge variant={automacao.automacao.live ? "default" : "outline"}>
													{automacao.automacao.live ? "Ativa" : "Inativa"}
												</Badge>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}

						{/* Messages */}
						{lead.chats.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<MessageSquare className="h-5 w-5" />
										Conversas ({lead.chats.length})
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{lead.chats.map((chat) => (
											<div key={chat.id} className="space-y-2">
												<div className="font-medium">Chat {chat.id}</div>
												<div className="space-y-2 max-h-60 overflow-y-auto">
													{chat.messages.map((message) => (
														<div
															key={message.id}
															className={`p-2 rounded max-w-[80%] ${
																message.isFromLead
																	? "bg-muted ml-0 mr-auto"
																	: "bg-primary text-primary-foreground ml-auto mr-0"
															}`}
														>
															<div className="text-sm">{message.content}</div>
															<div className="text-xs opacity-70 mt-1">{formatDate(message.createdAt)}</div>
														</div>
													))}
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}

						{/* Dispatches */}
						{lead.disparos.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Send className="h-5 w-5" />
										Disparos ({lead.disparos.length})
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										{lead.disparos.map((disparo) => (
											<div key={disparo.id} className="flex items-center justify-between p-3 border rounded">
												<div>
													<div className="font-medium">{disparo.templateName}</div>
													<div className="text-sm text-muted-foreground">Criado em {formatDate(disparo.createdAt)}</div>
													{disparo.scheduledAt && (
														<div className="text-xs text-muted-foreground">
															Agendado para {formatDate(disparo.scheduledAt)}
														</div>
													)}
													{disparo.sentAt && (
														<div className="text-xs text-green-600">Enviado em {formatDate(disparo.sentAt)}</div>
													)}
													{disparo.errorMessage && (
														<div className="text-xs text-red-600">Erro: {disparo.errorMessage}</div>
													)}
												</div>
												<Badge
													variant={
														disparo.status === "SENT"
															? "default"
															: disparo.status === "PENDING"
																? "outline"
																: "destructive"
													}
												>
													{disparo.status}
												</Badge>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				</TabsContent>

				{/* Statistics Tab */}
				<TabsContent value="stats">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<MessageSquare className="h-5 w-5" />
									Conversas
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{lead.stats.chatsCount}</div>
								<div className="text-sm text-muted-foreground">Total de conversas iniciadas</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Bot className="h-5 w-5" />
									Automações
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{lead.stats.automacoesCount}</div>
								<div className="text-sm text-muted-foreground">Automações ativas</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Send className="h-5 w-5" />
									Disparos
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{lead.stats.disparosCount}</div>
								<div className="text-sm text-muted-foreground">Mensagens enviadas</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
