import { useState, useEffect } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Library, Upload, Settings, Eye, Edit, FileUp, Loader2, Plus, Send, Edit2 } from "lucide-react";
import type { LeadChatwit } from "../types";
import { EspelhoDialog } from "./espelho-dialog";

interface EspelhoBiblioteca {
	id: string;
	nome: string;
	descricao?: string;
	textoDOEspelho?: any;
	espelhoCorrecao?: string;
	isAtivo: boolean;
	totalUsos: number;
	espelhoBibliotecaProcessado: boolean;
	aguardandoEspelho: boolean;
	createdAt: string;
	updatedAt: string;
}

interface BibliotecaEspelhosDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	lead: LeadChatwit;
	onLeadUpdate: (lead: LeadChatwit) => void;
	usuarioId: string;
}

export function BibliotecaEspelhosDrawer({
	isOpen,
	onClose,
	lead,
	onLeadUpdate,
	usuarioId,
}: BibliotecaEspelhosDrawerProps) {
	const [espelhos, setEspelhos] = useState<EspelhoBiblioteca[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [enviandoSistemaExterno, setEnviandoSistemaExterno] = useState(false);
	const [selectedEspelhoId, setSelectedEspelhoId] = useState<string | null>(lead.espelhoBibliotecaId || null);
	const [showEspelhoDialog, setShowEspelhoDialog] = useState(false);
	const [editingEspelho, setEditingEspelho] = useState<EspelhoBiblioteca | null>(null);
	const [newEspelhoName, setNewEspelhoName] = useState("");
	const [editingNameId, setEditingNameId] = useState<string | null>(null);
	const [tempName, setTempName] = useState("");
	const [showConfirmExternalDialog, setShowConfirmExternalDialog] = useState(false);
	const [pendingEspelhoData, setPendingEspelhoData] = useState<{ espelhoId: string; imageUrls: string[] } | null>(null);

	// Carregar espelhos da biblioteca
	useEffect(() => {
		if (isOpen) {
			fetchEspelhos();
		}
	}, [isOpen, usuarioId]);

	// Verificar periodicamente se o texto foi gerado para espelhos aguardando processamento
	useEffect(() => {
		const espelhosAguardando = espelhos.filter((e) => e.aguardandoEspelho);

		if (espelhosAguardando.length > 0) {
			const interval = setInterval(async () => {
				try {
					const response = await fetch(`/api/admin/leads-chatwit/biblioteca-espelhos?usuarioId=${usuarioId}`);
					if (response.ok) {
						const data = await response.json();
						const espelhosAtualizados: EspelhoBiblioteca[] = data.espelhos || [];

						// Verificar quais espelhos foram processados (têm texto e não estão mais aguardando)
						const idsProcessados: string[] = [];
						espelhosAguardando.forEach((espelhoAnterior) => {
							const espelhoAtual = espelhosAtualizados.find((e) => e.id === espelhoAnterior.id);
							if (espelhoAtual && espelhoAtual.textoDOEspelho && !espelhoAtual.aguardandoEspelho) {
								idsProcessados.push(espelhoAtual.id);
							}
						});

						// Atualizar a lista de espelhos
						setEspelhos(espelhosAtualizados);

						// Mostrar toast de sucesso para espelhos processados
						if (idsProcessados.length > 0) {
							idsProcessados.forEach((id) => {
								const espelho = espelhosAtualizados.find((e) => e.id === id);
								if (espelho) {
									toast("Texto gerado!", {
										description: `O texto para "${espelho.nome}" foi gerado com sucesso!`,
									});
								}
							});
						}
					}
				} catch (error) {
					console.error("Erro ao verificar status dos espelhos:", error);
				}
			}, 3000); // Verificar a cada 3 segundos

			return () => clearInterval(interval);
		}
	}, [espelhos, usuarioId, toast]);

	const fetchEspelhos = async () => {
		try {
			setLoading(true);
			const response = await fetch(`/api/admin/leads-chatwit/biblioteca-espelhos?usuarioId=${usuarioId}`);

			if (!response.ok) {
				throw new Error("Erro ao carregar biblioteca de espelhos");
			}

			const data = await response.json();
			setEspelhos(data.espelhos || []);
		} catch (error: any) {
			console.error("Erro ao carregar espelhos:", error);
			toast("Erro", { description: "Não foi possível carregar a biblioteca de espelhos." });
		} finally {
			setLoading(false);
		}
	};

	// Selecionar/deselecionar espelho para o lead
	const handleToggleEspelho = async (espelhoId: string, usar: boolean) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/associar-espelho", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					leadId: lead.id,
					espelhoId: usar ? espelhoId : null,
				}),
			});

			if (!response.ok) {
				throw new Error("Erro ao associar espelho");
			}

			// Atualizar estado local
			setSelectedEspelhoId(usar ? espelhoId : null);

			// Atualizar lead
			onLeadUpdate({
				...lead,
				espelhoBibliotecaId: usar ? espelhoId : undefined,
				_skipDialog: true,
			});

			toast(usar ? "Espelho selecionado" : "Espelho removido", {
				description: usar
					? "Este espelho será usado para a análise deste lead."
					: "Nenhum espelho da biblioteca está selecionado.",
			});

			// Recarregar lista para atualizar contadores
			fetchEspelhos();
		} catch (error: any) {
			console.error("Erro ao associar espelho:", error);
			toast("Erro", { description: "Não foi possível associar o espelho." });
		}
	};

	// Upload de novo espelho para biblioteca
	const handleUploadEspelho = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*,application/pdf";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				// Extrair nome original do arquivo (sem extensão)
				const nomeOriginal = file.name.replace(/\.[^/.]+$/, "");
				setNewEspelhoName(nomeOriginal);
				processUploadEspelho(file, nomeOriginal);
			}
		};
		input.click();
	};

	const processUploadEspelho = async (file: File, nomeArquivo: string) => {
		if (!file) return;

		setUploading(true);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("purpose", "vision");
			formData.append("sessionId", `espelho-biblioteca-${usuarioId}`);

			const response = await fetch("/api/upload/process-files", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Erro no upload");
			}

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Falha no processamento");
			}

			const imageUrls = data.image_urls || [];

			if (imageUrls.length === 0) {
				throw new Error("Nenhuma imagem foi processada");
			}

			// Criar espelho na biblioteca
			const createResponse = await fetch("/api/admin/leads-chatwit/biblioteca-espelhos", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					nome: newEspelhoName || nomeArquivo,
					espelhoCorrecao: JSON.stringify(imageUrls),
					usuarioId: usuarioId,
				}),
			});

			if (!createResponse.ok) {
				throw new Error("Erro ao salvar na biblioteca");
			}

			const createData = await createResponse.json();

			toast("Upload concluído", {
				description: `Espelho "${newEspelhoName || nomeArquivo}" adicionado à biblioteca com ${imageUrls.length} imagem(ns).`,
			});

			// Recarregar lista
			fetchEspelhos();
			setNewEspelhoName("");

			// Perguntar se quer enviar pro sistema externo via dialog
			if (createData.espelho) {
				setPendingEspelhoData({
					espelhoId: createData.espelho.id,
					imageUrls: imageUrls,
				});
				setShowConfirmExternalDialog(true);
			}
		} catch (error: any) {
			console.error("Erro no upload:", error);
			toast("Erro", { description: error.message || "Não foi possível fazer upload do espelho." });
		} finally {
			setUploading(false);
		}
	};

	// Confirmar envio para sistema externo
	const handleConfirmExternalSend = async () => {
		if (pendingEspelhoData) {
			setShowConfirmExternalDialog(false);
			await handleEnviarParaSistemaExterno(pendingEspelhoData.espelhoId, pendingEspelhoData.imageUrls, true);
			setPendingEspelhoData(null);
		}
	};

	// Cancelar envio para sistema externo
	const handleCancelExternalSend = () => {
		setShowConfirmExternalDialog(false);
		setPendingEspelhoData(null);
	};

	// Enviar espelho para sistema externo gerar texto
	const handleEnviarParaSistemaExterno = async (
		espelhoId: string,
		imageUrls: string[],
		isBibliotecaContext = false,
	) => {
		try {
			setEnviandoSistemaExterno(true);

			const payload = {
				leadID: isBibliotecaContext ? espelhoId : lead.id,
				nome: lead.nomeReal || lead.name || "Lead sem nome",
				telefone: lead.phoneNumber,
				espelhoparabiblioteca: true,
				arquivos:
					lead.arquivos?.map((a: { id: string; dataUrl: string; fileType: string }) => ({
						id: a.id,
						url: a.dataUrl,
						tipo: a.fileType,
						nome: a.fileType,
					})) || [],
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
					id: `${espelhoId}-espelho-${index}`,
					url: url,
					nome: `Espelho ${index + 1}`,
				})),
				metadata: {
					leadUrl: lead.leadUrl,
					sourceId: lead.sourceId,
					concluido: lead.concluido,
					fezRecurso: lead.fezRecurso,
					espelhoBibliotecaId: espelhoId,
				},
				espelhoBibliotecaId: espelhoId,
				usuarioId: usuarioId,
				nomeEspelho: espelhos.find((e) => e.id === espelhoId)?.nome || "Espelho da Biblioteca",
			};

			const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao enviar espelho para processamento");
			}

			// Marcar espelho como aguardando processamento no banco
			await fetch("/api/admin/leads-chatwit/biblioteca-espelhos", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: espelhoId,
					aguardandoEspelho: true,
				}),
			});

			// Atualizar estado local
			setEspelhos((prev) => prev.map((esp) => (esp.id === espelhoId ? { ...esp, aguardandoEspelho: true } : esp)));

			const nomeEspelho = espelhos.find((e) => e.id === espelhoId)?.nome || "Espelho";

			toast("Processando...", {
				description: `"${nomeEspelho}" foi enviado para processamento! O texto será gerado automaticamente e aparecerá em breve.`,
			});
		} catch (error: any) {
			console.error("Erro ao enviar espelho para sistema externo:", error);
			const nomeEspelho = espelhos.find((e) => e.id === espelhoId)?.nome || "Espelho";
			toast.error("Erro no processamento", {
				description: `Não foi possível processar "${nomeEspelho}". Tente novamente.`,
			});
		} finally {
			setEnviandoSistemaExterno(false);
		}
	};

	// Atualizar nome do espelho
	const handleUpdateName = async (espelhoId: string, novoNome: string) => {
		try {
			const response = await fetch("/api/admin/leads-chatwit/biblioteca-espelhos", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: espelhoId,
					nome: novoNome,
				}),
			});

			if (!response.ok) {
				throw new Error("Erro ao atualizar nome");
			}

			setEditingNameId(null);
			setTempName("");
			fetchEspelhos();

			toast.success("Nome atualizado", {
				description: "Nome alterado com sucesso",
				duration: 2000,
			});
		} catch (error: any) {
			console.error("Erro ao atualizar nome:", error);
			toast("Erro", { description: "Não foi possível atualizar o nome." });
		}
	};

	// Enviar espelho exclusivo (fluxo atual)
	const handleEnviarEspelhoExclusivo = () => {
		// Usar o diálogo de espelho atual para criar um espelho exclusivo
		setEditingEspelho(null);
		setShowEspelhoDialog(true);
	};

	// Editar espelho da biblioteca
	const handleEditarEspelho = (espelho: EspelhoBiblioteca) => {
		setEditingEspelho(espelho);
		setShowEspelhoDialog(true);
	};

	// Salvar espelho editado
	const handleSaveEspelhoDialog = async (texto: any, imagens: string[]) => {
		try {
			if (editingEspelho) {
				// Editar espelho da biblioteca
				const response = await fetch("/api/admin/leads-chatwit/biblioteca-espelhos", {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						id: editingEspelho.id,
						textoDOEspelho: texto,
						espelhoCorrecao: JSON.stringify(imagens),
					}),
				});

				if (!response.ok) {
					throw new Error("Erro ao atualizar espelho da biblioteca");
				}

				toast.success("Espelho atualizado", {
					description: "Biblioteca atualizada com sucesso",
					duration: 2000,
				});

				fetchEspelhos();
			} else {
				// Criar espelho exclusivo para o lead (fluxo atual)
				onLeadUpdate({
					...lead,
					textoDOEspelho: texto,
					espelhoCorrecao: JSON.stringify(imagens),
					_skipDialog: true,
				});

				toast("Espelho exclusivo criado", { description: "Espelho exclusivo criado para este lead!" });
			}

			setShowEspelhoDialog(false);
			setEditingEspelho(null);
		} catch (error: any) {
			console.error("Erro ao salvar espelho:", error);
			toast("Erro", { description: error.message || "Não foi possível salvar o espelho." });
		}
	};

	return (
		<>
			<Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DrawerContent className="h-[90vh] max-h-[90vh] flex flex-col">
					<div className="container mx-auto max-w-6xl h-full flex flex-col">
						<DrawerHeader className="px-6 py-4">
							<DrawerTitle className="text-2xl flex items-center gap-2">
								<Library className="h-6 w-6" />
								Biblioteca de Espelhos
							</DrawerTitle>
							<DrawerDescription>
								Gerencie espelhos reutilizáveis ou crie espelhos exclusivos para este lead.
							</DrawerDescription>
						</DrawerHeader>

						<div className="flex-1 px-6 overflow-hidden">
							<Tabs defaultValue="biblioteca" className="h-full flex flex-col">
								<TabsList className="grid w-full grid-cols-3">
									<TabsTrigger value="biblioteca" className="flex items-center gap-2">
										<Library className="h-4 w-4" />
										Biblioteca
									</TabsTrigger>
									<TabsTrigger value="exclusivo" className="flex items-center gap-2">
										<Upload className="h-4 w-4" />
										Espelho Exclusivo
									</TabsTrigger>
									<TabsTrigger value="controle" className="flex items-center gap-2">
										<Settings className="h-4 w-4" />
										Controle
									</TabsTrigger>
								</TabsList>

								{/* Aba 1 - Biblioteca de Espelhos */}
								<TabsContent value="biblioteca" className="flex-1 overflow-hidden">
									<div className="h-full flex flex-col">
										<div className="flex justify-between items-center mb-4">
											<h3 className="text-lg font-semibold">Espelhos Disponíveis</h3>
											<div className="flex gap-2">
												<Button onClick={handleUploadEspelho} disabled={uploading}>
													{uploading ? (
														<>
															<Loader2 className="h-4 w-4 mr-2 animate-spin" />
															Enviando...
														</>
													) : (
														<>
															<Plus className="h-4 w-4 mr-2" />
															Adicionar à Biblioteca
														</>
													)}
												</Button>
											</div>
										</div>

										{/* Campo para nome personalizado */}
										{newEspelhoName && (
											<div className="mb-4 p-4 border rounded-lg bg-muted">
												<Label htmlFor="nome-espelho">Nome do espelho:</Label>
												<div className="flex gap-2 mt-2">
													<Input
														id="nome-espelho"
														value={newEspelhoName}
														onChange={(e) => setNewEspelhoName(e.target.value)}
														placeholder="Digite o nome do espelho..."
													/>
													<Button variant="outline" onClick={() => setNewEspelhoName("")}>
														Cancelar
													</Button>
												</div>
											</div>
										)}

										<div className="flex-1 overflow-y-auto space-y-3">
											{loading ? (
												<div className="flex items-center justify-center py-8">
													<Loader2 className="h-8 w-8 animate-spin" />
													<span className="ml-2">Carregando espelhos...</span>
												</div>
											) : espelhos.length === 0 ? (
												<div className="text-center py-8 text-muted-foreground">
													<Library className="h-12 w-12 mx-auto mb-4 opacity-50" />
													<p>Nenhum espelho na biblioteca</p>
													<p className="text-sm">Use o botão acima para adicionar o primeiro espelho</p>
												</div>
											) : (
												espelhos.map((espelho) => (
													<div
														key={espelho.id}
														className="border rounded-lg p-4 flex items-center justify-between bg-card"
													>
														<div className="flex-1">
															<div className="flex items-center gap-3 mb-2">
																{editingNameId === espelho.id ? (
																	<div className="flex items-center gap-2">
																		<Input
																			value={tempName}
																			onChange={(e) => setTempName(e.target.value)}
																			className="h-8"
																			onKeyPress={(e) => {
																				if (e.key === "Enter") {
																					handleUpdateName(espelho.id, tempName);
																				}
																			}}
																		/>
																		<Button onClick={() => handleUpdateName(espelho.id, tempName)}>Salvar</Button>
																		<Button
																			variant="outline"
																			onClick={() => {
																				setEditingNameId(null);
																				setTempName("");
																			}}
																		>
																			Cancelar
																		</Button>
																	</div>
																) : (
																	<div className="flex items-center gap-2">
																		<h4 className="font-medium">{espelho.nome}</h4>
																		<Button
																			variant="ghost"
																			onClick={() => {
																				setEditingNameId(espelho.id);
																				setTempName(espelho.nome);
																			}}
																		>
																			<Edit2 className="h-3 w-3" />
																		</Button>
																	</div>
																)}
																<Badge variant="secondary">{espelho.totalUsos} uso(s)</Badge>
																{selectedEspelhoId === espelho.id && <Badge variant="default">Em uso</Badge>}
															</div>
															{espelho.descricao && (
																<p className="text-sm text-muted-foreground mb-2">{espelho.descricao}</p>
															)}
															<p className="text-xs text-muted-foreground">
																Criado em {new Date(espelho.createdAt).toLocaleDateString()}
															</p>
														</div>

														<div className="flex items-center gap-3">
															<div className="flex items-center gap-2">
																<span className="text-sm">Usar:</span>
																<Switch
																	checked={selectedEspelhoId === espelho.id}
																	onCheckedChange={(checked) => handleToggleEspelho(espelho.id, checked)}
																/>
															</div>

															{/* Botão para enviar para sistema externo */}
															{espelho.espelhoCorrecao && !espelho.textoDOEspelho && (
																<Button
																	variant="outline"
																	onClick={() => {
																		const imagens = JSON.parse(espelho.espelhoCorrecao || "[]");
																		handleEnviarParaSistemaExterno(espelho.id, imagens, true);
																	}}
																	disabled={espelho.aguardandoEspelho || enviandoSistemaExterno}
																>
																	{espelho.aguardandoEspelho ? (
																		<>
																			<Loader2 className="h-4 w-4 mr-1 animate-spin" />
																			Processando...
																		</>
																	) : (
																		<>
																			<Send className="h-4 w-4 mr-1" />
																			Gerar Texto
																		</>
																	)}
																</Button>
															)}

															<Button variant="outline" onClick={() => handleEditarEspelho(espelho)}>
																<Eye className="h-4 w-4 mr-1" />
																Ver/Editar
															</Button>
														</div>
													</div>
												))
											)}
										</div>
									</div>
								</TabsContent>

								{/* Aba 2 - Espelho Exclusivo */}
								<TabsContent value="exclusivo" className="flex-1">
									<div className="space-y-4">
										<h3 className="text-lg font-semibold">Enviar Espelho Exclusivo</h3>
										<p className="text-muted-foreground">
											Crie um espelho específico apenas para este lead, sem adicionar à biblioteca.
										</p>

										<Button onClick={handleEnviarEspelhoExclusivo} className="w-full">
											<Upload className="h-4 w-4 mr-2" />
											Criar Espelho Exclusivo
										</Button>
									</div>
								</TabsContent>

								{/* Aba 3 - Controle */}
								<TabsContent value="controle" className="flex-1">
									<div className="space-y-6">
										<h3 className="text-lg font-semibold">Resumo e Controle</h3>

										<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
											<div className="bg-card border rounded-lg p-4">
												<h4 className="font-medium mb-2">Total de Espelhos</h4>
												<p className="text-2xl font-bold text-primary">{espelhos.length}</p>
											</div>

											<div className="bg-card border rounded-lg p-4">
												<h4 className="font-medium mb-2">Espelhos Ativos</h4>
												<p className="text-2xl font-bold text-green-600">{espelhos.filter((e) => e.isAtivo).length}</p>
											</div>

											<div className="bg-card border rounded-lg p-4">
												<h4 className="font-medium mb-2">Total de Usos</h4>
												<p className="text-2xl font-bold text-blue-600">
													{espelhos.reduce((acc, e) => acc + e.totalUsos, 0)}
												</p>
											</div>
										</div>

										<div className="space-y-3">
											<h4 className="font-medium">Lista Completa</h4>
											{espelhos.map((espelho) => (
												<div key={espelho.id} className="flex items-center justify-between p-3 border rounded-lg">
													<div className="flex items-center gap-3">
														<span className="font-medium">{espelho.nome}</span>
														<Badge variant="outline">{espelho.totalUsos} usos</Badge>
													</div>

													<div className="flex items-center gap-2">
														<Switch
															checked={selectedEspelhoId === espelho.id}
															onCheckedChange={(checked) => handleToggleEspelho(espelho.id, checked)}
														/>
														<Button variant="outline" onClick={() => handleEditarEspelho(espelho)}>
															<Edit className="h-4 w-4" />
														</Button>
													</div>
												</div>
											))}
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</div>

						<DrawerFooter className="px-6">
							<Button variant="outline" onClick={onClose}>
								Fechar
							</Button>
						</DrawerFooter>
					</div>
				</DrawerContent>
			</Drawer>

			{/* Dialog de Confirmação para Sistema Externo */}
			<Dialog open={showConfirmExternalDialog} onOpenChange={setShowConfirmExternalDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Gerar Texto Automaticamente</DialogTitle>
						<DialogDescription>
							Deseja enviar as imagens do espelho "
							{pendingEspelhoData?.espelhoId
								? espelhos.find((e) => e.id === pendingEspelhoData.espelhoId)?.nome || "Novo Espelho"
								: "Novo Espelho"}
							" para o sistema externo gerar o texto automaticamente?
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<p className="text-sm text-muted-foreground">
							Esta ação irá enviar as imagens para processamento automático e o texto será gerado em alguns minutos.
						</p>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelExternalSend}>
							Não, apenas salvar na biblioteca
						</Button>
						<Button onClick={handleConfirmExternalSend}>
							<Send className="h-4 w-4 mr-2" />
							Sim, gerar texto
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog de edição de espelho */}
			<EspelhoDialog
				isOpen={showEspelhoDialog}
				onClose={() => {
					setShowEspelhoDialog(false);
					setEditingEspelho(null);
				}}
				leadId={editingEspelho ? editingEspelho.id : lead.id}
				leadData={lead}
				textoEspelho={editingEspelho?.textoDOEspelho || null}
				imagensEspelho={editingEspelho?.espelhoCorrecao ? JSON.parse(editingEspelho.espelhoCorrecao) : []}
				onSave={handleSaveEspelhoDialog}
			/>
		</>
	);
}
