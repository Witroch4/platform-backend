"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	Search,
	Filter,
	RefreshCw,
	Eye,
	Edit,
	Trash2,
	Plus,
	MessageSquare,
	MessageCircle,
	Bot,
	Globe,
	Lock,
	ChevronLeft,
	ChevronRight,
	Copy,
	BarChart3,
} from "lucide-react";
import { TemplateType, TemplateScope, TemplateStatus } from "@prisma/client";

interface UnifiedTemplate {
	id: string;
	name: string;
	description: string | null;
	type: TemplateType;
	scope: TemplateScope;
	status: TemplateStatus;
	language: string;
	tags: string[];
	isActive: boolean;
	usageCount: number;
	simpleReplyText: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: {
		id: string;
		name: string | null;
		email: string;
	};
	inbox: {
		id: string;
		nome: string;
		inboxId: string;
	} | null;
	interactiveContent?: {
		id: string;
		header?: { type: string; content: string } | null;
		body: { text: string };
		footer?: { text: string } | null;
		actionCtaUrl?: { displayText: string; url: string } | null;
		actionReplyButton?: { buttons: any } | null;
		actionList?: { buttonText: string; sections: any } | null;
		actionFlow?: { flowId: string; flowCta: string } | null;
		actionLocationRequest?: { requestText: string } | null;
	} | null;
	whatsappOfficialInfo?: {
		id: string;
		metaTemplateId: string;
		status: string;
		category: string;
		qualityScore: string | null;
		components: any;
	} | null;
	mapeamentos: {
		id: string;
		intentName: string;
		inboxId: string;
	}[];
	approvalRequests: {
		id: string;
		status: string;
		requestMessage: string | null;
		requestedAt: string;
		requestedBy: {
			id: string;
			name: string | null;
		};
	}[];
	stats: {
		mapeamentosCount: number;
		approvalRequestsCount: number;
	};
}

interface TemplatesManagerProps {
	onTemplateSelect?: (template: UnifiedTemplate) => void;
	showActions?: boolean;
	compact?: boolean;
	inboxId?: string;
}

export function UnifiedTemplatesManager({
	onTemplateSelect,
	showActions = true,
	compact = false,
	inboxId,
}: TemplatesManagerProps) {
	const router = useRouter();
	const [templates, setTemplates] = useState<UnifiedTemplate[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [typeFilter, setTypeFilter] = useState<TemplateType | "all">("all");
	const [scopeFilter, setScopeFilter] = useState<TemplateScope | "all">("all");
	const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
	const [sortBy, setSortBy] = useState("createdAt");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [pagination, setPagination] = useState({
		page: 1,
		limit: 20,
		total: 0,
		totalPages: 0,
		hasNextPage: false,
		hasPrevPage: false,
	});

	useEffect(() => {
		fetchTemplates();
	}, [searchQuery, typeFilter, scopeFilter, statusFilter, sortBy, sortOrder, pagination.page, inboxId]);

	const fetchTemplates = async () => {
		setIsLoading(true);
		try {
			const params = new URLSearchParams({
				page: pagination.page.toString(),
				limit: pagination.limit.toString(),
				sortBy,
				sortOrder,
			});

			if (searchQuery.trim()) {
				params.append("search", searchQuery.trim());
			}

			if (typeFilter !== "all") {
				params.append("type", typeFilter);
			}

			if (scopeFilter !== "all") {
				params.append("scope", scopeFilter);
			}

			if (statusFilter !== "all") {
				params.append("status", statusFilter);
			}

			if (inboxId) {
				params.append("inboxId", inboxId);
			}

			const response = await fetch(`/api/admin/templates?${params.toString()}`);
			const data = await response.json();

			if (response.ok) {
				setTemplates(data.templates);
				setPagination(data.pagination);
			} else {
				throw new Error(data.error || "Erro ao buscar templates");
			}
		} catch (error) {
			console.error("Erro ao buscar templates:", error);
			toast.error("Erro", {
				description: "Não foi possível carregar os templates. Tente novamente.",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteTemplate = async (templateId: string) => {
		if (!confirm("Tem certeza que deseja excluir este template?")) return;

		try {
			const response = await fetch(`/api/admin/templates/${templateId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("Template excluído com sucesso!");
				fetchTemplates();
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao excluir template");
			}
		} catch (error: any) {
			console.error("Erro ao excluir template:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível excluir o template.",
			});
		}
	};

	const handleDuplicateTemplate = async (template: UnifiedTemplate) => {
		try {
			const duplicateData = {
				name: `${template.name} (Cópia)`,
				description: template.description,
				type: template.type,
				scope: TemplateScope.PRIVATE,
				language: template.language,
				tags: template.tags,
				inboxId: template.inbox?.id,
				simpleReplyText: template.simpleReplyText,
				interactiveContent: template.interactiveContent,
				whatsappOfficialInfo: template.whatsappOfficialInfo,
			};

			const response = await fetch("/api/admin/templates", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(duplicateData),
			});

			if (response.ok) {
				toast.success("Template duplicado com sucesso!");
				fetchTemplates();
			} else {
				const data = await response.json();
				throw new Error(data.error || "Erro ao duplicar template");
			}
		} catch (error: any) {
			console.error("Erro ao duplicar template:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível duplicar o template.",
			});
		}
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

	const getTypeColor = (type: TemplateType) => {
		switch (type) {
			case TemplateType.WHATSAPP_OFFICIAL:
				return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
			case TemplateType.INTERACTIVE_MESSAGE:
				return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
			case TemplateType.AUTOMATION_REPLY:
				return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
		}
	};

	const getScopeIcon = (scope: TemplateScope) => {
		return scope === TemplateScope.GLOBAL ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />;
	};

	const getStatusColor = (status: TemplateStatus) => {
		switch (status) {
			case TemplateStatus.APPROVED:
				return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
			case TemplateStatus.PENDING:
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
			case TemplateStatus.REJECTED:
				return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
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

	const renderTemplatePreview = (template: UnifiedTemplate) => {
		switch (template.type) {
			case TemplateType.AUTOMATION_REPLY:
				return (
					<div className="text-xs text-muted-foreground max-w-[200px] truncate">
						{template.simpleReplyText || "Sem texto"}
					</div>
				);
			case TemplateType.INTERACTIVE_MESSAGE:
				if (template.interactiveContent) {
					return (
						<div className="text-xs text-muted-foreground">
							{template.interactiveContent.header && <div>Header: {template.interactiveContent.header.type}</div>}
							<div className="max-w-[200px] truncate">{template.interactiveContent.body.text}</div>
						</div>
					);
				}
				break;
			case TemplateType.WHATSAPP_OFFICIAL:
				if (template.whatsappOfficialInfo) {
					return (
						<div className="text-xs text-muted-foreground">
							<div>Categoria: {template.whatsappOfficialInfo.category}</div>
							<div>Meta ID: {template.whatsappOfficialInfo.metaTemplateId}</div>
						</div>
					);
				}
				break;
		}
		return null;
	};

	if (compact) {
		return (
			<div className="space-y-2">
				{templates.map((template) => (
					<div
						key={template.id}
						className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
						onClick={() => onTemplateSelect?.(template)}
					>
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-2">
								{getTypeIcon(template.type)}
								<div>
									<div className="font-medium">{template.name}</div>
									<div className="text-sm text-muted-foreground">{template.description || "Sem descrição"}</div>
								</div>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Badge className={getTypeColor(template.type)}>{template.type}</Badge>
							{getScopeIcon(template.scope)}
						</div>
					</div>
				))}
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<MessageSquare className="h-5 w-5" />
						Templates Unificados
					</CardTitle>
					<Button onClick={() => router.push("/admin/templates/create")}>
						<Plus className="h-4 w-4 mr-2" />
						Novo Template
					</Button>
				</div>

				{/* Filters */}
				<div className="flex flex-col sm:flex-row gap-4">
					<div className="flex-1">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Buscar por nome ou descrição..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10"
							/>
						</div>
					</div>
					<Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TemplateType | "all")}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Filtrar por tipo" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos os tipos</SelectItem>
							<SelectItem value={TemplateType.WHATSAPP_OFFICIAL}>WhatsApp Oficial</SelectItem>
							<SelectItem value={TemplateType.INTERACTIVE_MESSAGE}>Mensagem Interativa</SelectItem>
							<SelectItem value={TemplateType.AUTOMATION_REPLY}>Resposta Automática</SelectItem>
						</SelectContent>
					</Select>
					<Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as TemplateScope | "all")}>
						<SelectTrigger className="w-[150px]">
							<SelectValue placeholder="Escopo" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value={TemplateScope.GLOBAL}>Global</SelectItem>
							<SelectItem value={TemplateScope.PRIVATE}>Privado</SelectItem>
						</SelectContent>
					</Select>
					<Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TemplateStatus | "all")}>
						<SelectTrigger className="w-[150px]">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value={TemplateStatus.APPROVED}>Aprovado</SelectItem>
							<SelectItem value={TemplateStatus.PENDING}>Pendente</SelectItem>
							<SelectItem value={TemplateStatus.REJECTED}>Rejeitado</SelectItem>
						</SelectContent>
					</Select>
					<Button variant="outline" onClick={fetchTemplates} disabled={isLoading}>
						<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				{isLoading ? (
					<div className="flex justify-center py-8">
						<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : templates.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<h3 className="text-lg font-medium mb-2">Nenhum template encontrado</h3>
						<p className="text-sm">
							{searchQuery || typeFilter !== "all" || scopeFilter !== "all" || statusFilter !== "all"
								? "Tente ajustar os filtros de busca."
								: "Comece criando seu primeiro template."}
						</p>
					</div>
				) : (
					<>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Template</TableHead>
										<TableHead>Tipo</TableHead>
										<TableHead>Escopo/Status</TableHead>
										<TableHead>Inbox</TableHead>
										<TableHead>Preview</TableHead>
										<TableHead>Estatísticas</TableHead>
										<TableHead>Criado em</TableHead>
										{showActions && <TableHead className="w-[120px]">Ações</TableHead>}
									</TableRow>
								</TableHeader>
								<TableBody>
									{templates.map((template) => (
										<TableRow key={template.id}>
											<TableCell>
												<div>
													<div className="font-medium">{template.name}</div>
													<div className="text-sm text-muted-foreground">{template.description || "Sem descrição"}</div>
													{template.tags.length > 0 && (
														<div className="flex gap-1 mt-1">
															{template.tags.slice(0, 2).map((tag) => (
																<Badge key={tag} variant="outline" className="text-xs">
																	{tag}
																</Badge>
															))}
															{template.tags.length > 2 && (
																<Badge variant="outline" className="text-xs">
																	+{template.tags.length - 2}
																</Badge>
															)}
														</div>
													)}
												</div>
											</TableCell>
											<TableCell>
												<Badge className={getTypeColor(template.type)}>
													<div className="flex items-center gap-1">
														{getTypeIcon(template.type)}
														{template.type.replace("_", " ")}
													</div>
												</Badge>
											</TableCell>
											<TableCell>
												<div className="space-y-1">
													<div className="flex items-center gap-1">
														{getScopeIcon(template.scope)}
														<span className="text-xs">{template.scope}</span>
													</div>
													<Badge className={getStatusColor(template.status)} variant="outline">
														{template.status}
													</Badge>
												</div>
											</TableCell>
											<TableCell>
												{template.inbox ? (
													<div className="text-sm">
														<div className="font-medium">{template.inbox.nome}</div>
														<div className="text-xs text-muted-foreground">ID: {template.inbox.inboxId}</div>
													</div>
												) : (
													<span className="text-sm text-muted-foreground">Global</span>
												)}
											</TableCell>
											<TableCell>{renderTemplatePreview(template)}</TableCell>
											<TableCell>
												<div className="text-xs text-muted-foreground">
													<div className="flex items-center gap-1">
														<BarChart3 className="h-3 w-3" />
														{template.usageCount} usos
													</div>
													<div>Mapeamentos: {template.stats.mapeamentosCount}</div>
													{template.stats.approvalRequestsCount > 0 && (
														<div className="text-yellow-600">Aprovações: {template.stats.approvalRequestsCount}</div>
													)}
												</div>
											</TableCell>
											<TableCell>
												<div className="text-sm text-muted-foreground">{formatDate(template.createdAt)}</div>
												<div className="text-xs text-muted-foreground">
													por {template.createdBy.name || template.createdBy.email}
												</div>
											</TableCell>
											{showActions && (
												<TableCell>
													<div className="flex items-center gap-1">
														<Button
															variant="ghost"
															size="icon"
															onClick={() => router.push(`/admin/templates/${template.id}`)}
														>
															<Eye className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															onClick={() => router.push(`/admin/templates/${template.id}/edit`)}
														>
															<Edit className="h-4 w-4" />
														</Button>
														<Button variant="ghost" size="icon" onClick={() => handleDuplicateTemplate(template)}>
															<Copy className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															onClick={() => handleDeleteTemplate(template.id)}
															className="text-destructive hover:text-destructive"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												</TableCell>
											)}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						{/* Pagination */}
						{pagination.totalPages > 1 && (
							<div className="flex items-center justify-between mt-4">
								<div className="text-sm text-muted-foreground">
									Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
									{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} templates
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
										disabled={!pagination.hasPrevPage}
									>
										<ChevronLeft className="h-4 w-4" />
										Anterior
									</Button>
									<span className="text-sm">
										Página {pagination.page} de {pagination.totalPages}
									</span>
									<Button
										variant="outline"
										onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
										disabled={!pagination.hasNextPage}
									>
										Próxima
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
