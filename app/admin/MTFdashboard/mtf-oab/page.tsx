"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Upload, FileText, Check, X, Loader2, Download, Trash2, Eye, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import useSWR from "swr";

interface UploadedFile {
	id: string;
	name: string;
	size: number;
	type: string;
	status: "uploading" | "processing" | "completed" | "error";
	progress: number;
	uploadedAt: Date;
	description?: string;
	agentId?: string;
}

interface RubricFromDB {
	id: string;
	exam: string | null;
	area: string | null;
	version: string | null;
	createdAt: string;
	updatedAt: string;
	meta: Record<string, any> | null;
	counts: {
		itens: number;
		grupos: number;
	};
	pontuacao: {
		geral: { total: number; esperado: number; desvio: number; ok: boolean };
		peca: { total: number; esperado: number; desvio: number; ok: boolean };
		questoes: { total: number; esperado: number; desvio: number; ok: boolean };
	} | null;
}

export default function MTFOABUploadPage() {
	const [files, setFiles] = useState<UploadedFile[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>("");
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [rubricToDelete, setRubricToDelete] = useState<{ id: string; name: string } | null>(null);

	// Buscar gabaritos do banco
	const {
		data: rubricsData,
		mutate: refreshRubrics,
		isLoading: isLoadingRubrics,
	} = useSWR<{
		success: boolean;
		rubrics: RubricFromDB[];
		total: number;
	}>(
		"/api/oab-eval/rubrics",
		async (url) => {
			const res = await fetch(url);
			if (!res.ok) throw new Error("Falha ao carregar gabaritos");
			return res.json();
		},
		{
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			dedupingInterval: 5000,
		},
	);

	// Combinar arquivos da sessão com gabaritos do banco
	const allFiles = useMemo<Array<UploadedFile & { _isFromDB?: boolean; _rubricId?: string }>>(() => {
		const sessionFiles = files.filter((f) => f.status === "completed");
		const dbRubrics = (rubricsData?.rubrics ?? []).map((rubric) => ({
			id: rubric.id,
			name: `${rubric.exam} - ${rubric.area} (${rubric.counts.itens} itens)`,
			size: 0,
			type: "application/pdf" as const,
			status: "completed" as const,
			progress: 100,
			uploadedAt: new Date(rubric.createdAt),
			description: `ID: ${rubric.id} | ${rubric.counts.itens} itens, ${rubric.counts.grupos} grupos`,
			agentId: undefined,
			_isFromDB: true,
			_rubricId: rubric.id,
		}));
		return [...sessionFiles, ...dbRubrics];
	}, [files, rubricsData?.rubrics]);

	const onDrop = useCallback(
		async (acceptedFiles: File[]) => {
			if (acceptedFiles.length === 0) return;

			for (const file of acceptedFiles) {
				const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

				const newFile: UploadedFile = {
					id: fileId,
					name: file.name,
					size: file.size,
					type: file.type,
					status: "uploading",
					progress: 0,
					uploadedAt: new Date(),
					agentId: selectedAgent || undefined,
				};

				setFiles((prev) => [...prev, newFile]);

				try {
					// Simulando progresso de upload (frontend apenas)
					for (let progress = 0; progress <= 90; progress += 30) {
						await new Promise((resolve) => setTimeout(resolve, 100));
						setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress } : f)));
					}

					// Transição para processamento backend
					setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "processing", progress: 0 } : f)));

					// Upload real para o backend
					const formData = new FormData();
					formData.append("file", file);
					formData.append("withEmbeddings", "false");

					const uploadPromise = fetch("/api/oab-eval/rubric/upload", {
						method: "POST",
						body: formData,
					});

					const response = await uploadPromise;

					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.error || "Falha ao enviar arquivo");
					}

					const result = await response.json();

					// Completion
					setFiles((prev) =>
						prev.map((f) =>
							f.id === fileId
								? {
										...f,
										status: "completed",
										progress: 100,
										description: `Rubric ID: ${result.rubricId} | ${result.stats.itens} itens processados`,
									}
								: f,
						),
					);

					toast.success(`Arquivo ${file.name} processado com sucesso! ID: ${result.rubricId}`);

					// Recarregar lista de gabaritos após upload bem-sucedido
					refreshRubrics();
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
					console.error("[MTF-OAB::UPLOAD_ERROR]", errorMessage);

					setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "error" } : f)));
					toast.error(`Erro ao processar ${file.name}: ${errorMessage}`);
				}
			}
		},
		[selectedAgent, refreshRubrics],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: {
			"application/pdf": [".pdf"],
			"application/msword": [".doc"],
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
			"text/plain": [".txt"],
		},
		maxSize: 10 * 1024 * 1024, // 10MB
	});

	const removeFile = (fileId: string) => {
		setFiles((prev) => prev.filter((f) => f.id !== fileId));
		toast.success("Arquivo removido da lista");
	};

	const confirmDeleteRubric = (rubricId: string, fileName: string) => {
		setRubricToDelete({ id: rubricId, name: fileName });
		setDeleteDialogOpen(true);
	};

	const deleteRubricFromDB = async () => {
		if (!rubricToDelete) return;

		const { id: rubricId, name: fileName } = rubricToDelete;

		const deletePromise = (async () => {
			const response = await fetch(`/api/oab-eval/rubrics/${rubricId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Falha ao excluir gabarito");
			}

			return response.json();
		})();

		toast.promise(deletePromise, {
			loading: `Excluindo ${fileName}...`,
			success: () => {
				// Atualizar lista após exclusão
				refreshRubrics();
				return `${fileName} excluído com sucesso`;
			},
			error: (err) => `Erro ao excluir: ${err.message}`,
		});

		// Fechar dialog
		setDeleteDialogOpen(false);
		setRubricToDelete(null);

		return deletePromise;
	};

	const getStatusColor = (status: UploadedFile["status"]) => {
		switch (status) {
			case "uploading":
				return "bg-blue-500";
			case "processing":
				return "bg-yellow-500";
			case "completed":
				return "bg-green-500";
			case "error":
				return "bg-red-500";
			default:
				return "bg-gray-500";
		}
	};

	const getStatusIcon = (status: UploadedFile["status"]) => {
		switch (status) {
			case "uploading":
			case "processing":
				return <Loader2 className="h-4 w-4 animate-spin" />;
			case "completed":
				return <Check className="h-4 w-4" />;
			case "error":
				return <X className="h-4 w-4" />;
			default:
				return <FileText className="h-4 w-4" />;
		}
	};

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
	};

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold text-foreground mb-2">Upload OAB</h1>
						<p className="text-muted-foreground">Upload de arquivos para agentes especializados em documentos da OAB</p>
					</div>
					<Link href="/admin/MTFdashboard/mtf-oab/oab-eval">
						<Button variant="outline" className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4" />
							Avaliação OAB
						</Button>
					</Link>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Upload Area */}
				<div className="lg:col-span-2 space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Upload de Documentos</CardTitle>
							<CardDescription>
								Arraste e solte ou clique para selecionar arquivos PDF, DOC, DOCX ou TXT
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="agent-select">Agente Destino (Opcional)</Label>
									<select
										id="agent-select"
										className="w-full p-2 border rounded-md"
										value={selectedAgent}
										onChange={(e) => setSelectedAgent(e.target.value)}
									>
										<option value="">Selecione um agente...</option>
										<option value="oab-legal-expert">Especialista Legal OAB</option>
										<option value="document-analyzer">Analisador de Documentos</option>
										<option value="citation-validator">Validador de Citações</option>
									</select>
								</div>

								<div
									{...getRootProps()}
									className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
										isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
									}`}
								>
									<input {...getInputProps()} />
									<Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
									{isDragActive ? (
										<p className="text-lg font-medium">Solte os arquivos aqui...</p>
									) : (
										<div>
											<p className="text-lg font-medium mb-2">Arraste arquivos aqui ou clique para selecionar</p>
											<p className="text-sm text-muted-foreground">
												Suporte: PDF, DOC, DOCX, TXT (máx. 10MB por arquivo)
											</p>
										</div>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Files List */}
					{allFiles.length > 0 && (
						<Card>
							<CardHeader className="flex items-center justify-between">
								<CardTitle>Arquivos ({allFiles.length})</CardTitle>
								<Button
									size="sm"
									variant="outline"
									onClick={() => refreshRubrics()}
									disabled={isLoadingRubrics}
									className="gap-2"
								>
									<RefreshCw className={`h-4 w-4 ${isLoadingRubrics ? "animate-spin" : ""}`} />
									{isLoadingRubrics ? "Carregando..." : "Atualizar"}
								</Button>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									{allFiles.map((file) => (
										<div key={file.id} className="border rounded-lg p-4">
											<div className="flex items-center justify-between mb-2">
												<div className="flex items-center gap-3">
													<div className={`p-2 rounded-md ${getStatusColor(file.status)}`}>
														{getStatusIcon(file.status)}
													</div>
													<div className="flex-1 min-w-0">
														<p className="font-medium truncate">{file.name}</p>
														<p className="text-sm text-muted-foreground">
															{formatFileSize(file.size)} • {file.uploadedAt.toLocaleString()}
														</p>
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Badge variant={file.status === "completed" ? "default" : "secondary"}>
														{file.status === "uploading" && "Enviando"}
														{file.status === "processing" && "Processando"}
														{file.status === "completed" && "Concluído"}
														{file.status === "error" && "Erro"}
													</Badge>
													{file.status === "completed" && (
														<>
															<Button size="sm" variant="outline">
																<Eye className="h-4 w-4" />
															</Button>
															<Button size="sm" variant="outline">
																<Download className="h-4 w-4" />
															</Button>
														</>
													)}
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															if (file._isFromDB && file._rubricId) {
																confirmDeleteRubric(file._rubricId, file.name);
															} else {
																removeFile(file.id);
															}
														}}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</div>

											{(file.status === "uploading" || file.status === "processing") && (
												<div className="space-y-2">
													<Progress value={file.progress} className="w-full" />
													<p className="text-xs text-muted-foreground">
														{file.status === "uploading" ? "Enviando..." : "Processando..."} {file.progress}%
													</p>
												</div>
											)}

											{file.agentId && (
												<div className="mt-2">
													<Badge variant="outline">Agente: {file.agentId}</Badge>
												</div>
											)}
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Estatísticas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="text-center p-3 bg-muted rounded-lg">
									<div className="text-2xl font-bold">{allFiles.length}</div>
									<div className="text-xs text-muted-foreground">Gabaritos</div>
								</div>
								<div className="text-center p-3 bg-muted rounded-lg">
									<div className="text-2xl font-bold">{rubricsData?.total ?? 0}</div>
									<div className="text-xs text-muted-foreground">No Banco</div>
								</div>
							</div>

							<div className="text-center p-3 bg-muted rounded-lg">
								<div className="text-lg font-bold">
									{rubricsData?.rubrics?.reduce((acc, r) => acc + r.counts.itens, 0) ?? 0}
								</div>
								<div className="text-xs text-muted-foreground">Total de Itens</div>
							</div>

							<div className="text-center p-3 bg-muted rounded-lg">
								<div className="text-sm font-bold">{isLoadingRubrics ? "Carregando..." : "Sincronizado"}</div>
								<div className="text-xs text-muted-foreground">
									{rubricsData?.rubrics?.[0]?.updatedAt
										? new Date(rubricsData.rubrics[0].updatedAt).toLocaleString("pt-BR")
										: "Nunca"}
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Agentes Disponíveis</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="p-3 border rounded-lg">
								<div className="font-medium">Especialista Legal OAB</div>
								<div className="text-sm text-muted-foreground">Análise especializada de documentos jurídicos</div>
							</div>
							<div className="p-3 border rounded-lg">
								<div className="font-medium">Analisador de Documentos</div>
								<div className="text-sm text-muted-foreground">Extração e estruturação de conteúdo</div>
							</div>
							<div className="p-3 border rounded-lg">
								<div className="font-medium">Validador de Citações</div>
								<div className="text-sm text-muted-foreground">Verificação de referências legais</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<AlertCircle className="h-5 w-5" />
								Informações
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<p>• Arquivos são processados automaticamente</p>
							<p>• Tamanho máximo: 10MB por arquivo</p>
							<p>• Formatos suportados: PDF, DOC, DOCX, TXT</p>
							<p>• Processamento pode levar alguns minutos</p>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Dialog de Confirmação de Exclusão */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-destructive">
							<AlertCircle className="h-5 w-5" />
							Confirmar Exclusão
						</DialogTitle>
						<DialogDescription className="pt-3">
							Tem certeza que deseja excluir permanentemente o gabarito:
							<div className="mt-2 p-3 bg-muted rounded-md">
								<p className="font-semibold text-foreground">{rubricToDelete?.name}</p>
							</div>
							<p className="mt-3 text-destructive font-medium">
								⚠️ Esta ação não pode ser desfeita. Todas as avaliações relacionadas também serão excluídas.
							</p>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							variant="outline"
							onClick={() => {
								setDeleteDialogOpen(false);
								setRubricToDelete(null);
							}}
						>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={deleteRubricFromDB} className="gap-2">
							<Trash2 className="h-4 w-4" />
							Excluir Permanentemente
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
