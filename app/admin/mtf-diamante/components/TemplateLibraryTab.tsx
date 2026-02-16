"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Search,
	Plus,
	Globe,
	User,
	MessageSquare,
	FileText,
	Eye,
	Edit,
	Trash2,
	Clock,
	CheckCircle,
	XCircle,
	Library,
	Shield,
	Users,
	BookOpen,
} from "lucide-react";
import { useTemplateLibrary } from "../hooks/useTemplateLibrary";
import { useApprovalRequests } from "../../../../hooks/useApprovalRequests";
import type { TemplateLibraryWithCreator } from "@/app/lib/template-library-service";
import { CreateTemplateDialog } from "./TemplateLibraryTab/CreateTemplateDialog";
import { TemplatePreviewDialog } from "./TemplateLibraryTab/TemplatePreviewDialog";
import { ApprovalRequestsTable } from "./TemplateLibraryTab/ApprovalRequestsTable";
import { LibraryManagementInterface } from "./TemplateLibraryTab/LibraryManagementInterface";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

export function TemplateLibraryTab() {
	const { data: session } = useSession();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedType, setSelectedType] = useState<"all" | "template" | "interactive_message">("all");
	const [selectedScope, setSelectedScope] = useState<"all" | "global" | "account_specific">("all");
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [previewTemplate, setPreviewTemplate] = useState<TemplateLibraryWithCreator | null>(null);

	const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";
	const isSuperAdmin = session?.user?.role === "SUPERADMIN";

	const {
		templates,
		loading: templatesLoading,
		error: templatesError,
		fetchTemplates,
		createTemplate,
		deleteTemplate,
		requestApproval,
	} = useTemplateLibrary({
		type: selectedType === "all" ? undefined : selectedType,
		scope: selectedScope === "all" ? undefined : selectedScope,
		search: searchQuery || undefined,
		autoFetch: true,
	});

	const {
		requests,
		loading: requestsLoading,
		processRequest,
	} = useApprovalRequests({
		status: "pending",
		autoFetch: isAdmin,
	});

	const handleSearch = (query: string) => {
		setSearchQuery(query);
	};

	const handleCreateTemplate = async (data: any) => {
		try {
			await createTemplate(data);
			setCreateDialogOpen(false);
		} catch (error) {
			console.error("Error creating template:", error);
		}
	};

	const handleDeleteTemplate = async (templateId: string) => {
		if (confirm("Tem certeza que deseja excluir este template?")) {
			try {
				await deleteTemplate(templateId);
				toast.success("Template excluído com sucesso!");
			} catch (error) {
				console.error("Error deleting template:", error);
				toast.error("Erro ao excluir template");
			}
		}
	};

	const handleRequestApproval = async (templateId: string) => {
		try {
			await requestApproval(templateId, "Por favor, aprove este template para minha conta");
			toast.success("Solicitação de aprovação enviada!");
		} catch (error) {
			console.error("Error requesting approval:", error);
			toast.error("Erro ao solicitar aprovação");
		}
	};

	const getTypeIcon = (type: string) => {
		return type === "template" ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
	};

	const getScopeIcon = (scope: string) => {
		return scope === "GLOBAL" ? <Globe className="h-4 w-4" /> : <User className="h-4 w-4" />;
	};

	const getApprovalStatus = (template: TemplateLibraryWithCreator) => {
		const latestRequest = template.approvalRequests?.[0];
		if (!latestRequest) {
			return <Badge variant="secondary">Sem Aprovação Necessária</Badge>;
		}

		switch (latestRequest.status) {
			case "pending":
				return (
					<Badge variant="default">
						<Clock className="h-3 w-3 mr-1" />
						Pendente
					</Badge>
				);
			case "approved":
				return (
					<Badge variant="default" className="bg-green-500">
						<CheckCircle className="h-3 w-3 mr-1" />
						Aprovado
					</Badge>
				);
			case "rejected":
				return (
					<Badge variant="destructive">
						<XCircle className="h-3 w-3 mr-1" />
						Rejeitado
					</Badge>
				);
			default:
				return <Badge variant="outline">Desconhecido</Badge>;
		}
	};

	const getScopeLabel = (scope: string) => {
		return scope === "GLOBAL" ? "Biblioteca" : "Privado";
	};

	const getScopeBadgeVariant = (scope: string) => {
		return scope === "GLOBAL" ? "default" : "secondary";
	};

	const getTypeLabel = (type: string) => {
		return type === "template" ? "Template" : "Mensagem Interativa";
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Library className="h-8 w-8 text-primary" />
					<div>
						<h2 className="text-2xl font-bold">Biblioteca de Templates</h2>
						<p className="text-muted-foreground">Gerencie templates compartilhados e mensagens interativas</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{isSuperAdmin && (
						<Badge
							variant="outline"
							className="bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
						>
							<Shield className="h-3 w-3 mr-1" />
							SUPERADMIN
						</Badge>
					)}
					{isAdmin && (
						<Button onClick={() => setCreateDialogOpen(true)}>
							<Plus className="h-4 w-4 mr-2" />
							Criar Template
						</Button>
					)}
				</div>
			</div>

			<Tabs defaultValue="library" className="space-y-4">
				<TabsList>
					<TabsTrigger value="library">
						<BookOpen className="h-4 w-4 mr-2" />
						Biblioteca
					</TabsTrigger>
					{isAdmin && (
						<TabsTrigger value="approvals">
							<Users className="h-4 w-4 mr-2" />
							Solicitações de Aprovação
							{requests.length > 0 && (
								<Badge variant="destructive" className="ml-2">
									{requests.length}
								</Badge>
							)}
						</TabsTrigger>
					)}
					{isSuperAdmin && (
						<TabsTrigger value="management">
							<Shield className="h-4 w-4 mr-2" />
							Gerenciamento
						</TabsTrigger>
					)}
				</TabsList>

				<TabsContent value="library" className="space-y-4">
					{/* Filtros */}
					<Card>
						<CardHeader>
							<CardTitle>Filtros</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex flex-col sm:flex-row gap-4">
								<div className="flex-1">
									<div className="relative">
										<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Buscar templates..."
											value={searchQuery}
											onChange={(e) => handleSearch(e.target.value)}
											className="pl-10"
										/>
									</div>
								</div>
								<div className="flex gap-2">
									<select
										value={selectedType}
										onChange={(e) => setSelectedType(e.target.value as any)}
										className="px-3 py-2 border rounded-md bg-background text-foreground"
									>
										<option value="all">Todos os Tipos</option>
										<option value="template">Templates</option>
										<option value="interactive_message">Mensagens Interativas</option>
									</select>
									<select
										value={selectedScope}
										onChange={(e) => setSelectedScope(e.target.value as any)}
										className="px-3 py-2 border rounded-md bg-background text-foreground"
									>
										<option value="all">Todos os Escopos</option>
										<option value="global">Biblioteca (Global)</option>
										<option value="account_specific">Privado (Conta)</option>
									</select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Grade de Templates */}
					{templatesLoading ? (
						<div className="text-center py-8">Carregando templates...</div>
					) : templatesError ? (
						<div className="text-center py-8 text-red-500">Erro: {templatesError}</div>
					) : templates.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							Nenhum template encontrado. {isAdmin && "Crie seu primeiro template para começar."}
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{templates.map((template) => (
								<Card key={template.id} className="hover:shadow-md transition-shadow">
									<CardHeader className="pb-3">
										<div className="flex items-start justify-between">
											<div className="flex items-center gap-2">
												{getTypeIcon(template.type)}
												<CardTitle className="text-lg">{template.name}</CardTitle>
											</div>
											<div className="flex items-center gap-1">
												{getScopeIcon(template.scope)}
												<Badge variant={getScopeBadgeVariant(template.scope)}>{getScopeLabel(template.scope)}</Badge>
											</div>
										</div>
										{template.description && <CardDescription>{template.description}</CardDescription>}
									</CardHeader>
									<CardContent className="space-y-3">
										<div className="flex items-center justify-between text-sm text-muted-foreground">
											<span>Por {template.createdBy.name || template.createdBy.email}</span>
											<span>Usado {template.usageCount ?? 0} vezes</span>
										</div>

										<div className="flex items-center gap-2 flex-wrap">
											<Badge variant="outline" className="text-xs">
												{getTypeLabel(template.type)}
											</Badge>
										</div>

										<div className="flex items-center justify-between">{getApprovalStatus(template)}</div>

										<div className="flex gap-2">
											<Button variant="outline" onClick={() => setPreviewTemplate(template)}>
												<Eye className="h-4 w-4 mr-1" />
												Visualizar
											</Button>

											{template.approvalRequests && !template.approvalRequests.some((r) => r.status === "approved") && (
												<Button variant="outline" onClick={() => handleRequestApproval(template.id)}>
													Solicitar Aprovação
												</Button>
											)}

											{(template.createdById === session?.user?.id || isAdmin) && (
												<Button variant="outline" onClick={() => handleDeleteTemplate(template.id)}>
													<Trash2 className="h-4 w-4" />
												</Button>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</TabsContent>

				{isAdmin && (
					<TabsContent value="approvals">
						<ApprovalRequestsTable requests={requests} loading={requestsLoading} onProcessRequest={processRequest} />
					</TabsContent>
				)}

				{isSuperAdmin && (
					<TabsContent value="management">
						<LibraryManagementInterface onCreateGlobal={() => setCreateDialogOpen(true)} />
					</TabsContent>
				)}
			</Tabs>

			{/* Dialogs */}
			<CreateTemplateDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSubmit={handleCreateTemplate}
			/>

			<TemplatePreviewDialog
				template={previewTemplate}
				open={!!previewTemplate}
				onOpenChange={(open) => !open && setPreviewTemplate(null)}
			/>
		</div>
	);
}
