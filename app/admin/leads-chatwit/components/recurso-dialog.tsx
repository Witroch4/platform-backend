import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, FileText, ExternalLink, Send, AlertOctagon, Key } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecursoDialogProps {
	isOpen: boolean;
	onClose: () => void;
	leadId: string;
	sourceId: string;
	recursoUrl: string | null;
	recursoArgumentacaoUrl?: string | null;
	anotacoes: string | null;
	aguardandoRecurso: boolean;
	recursoPreliminar: any;
	recursoValidado: boolean;
	onSaveAnotacoes: (anotacoes: string) => Promise<void>;
	onEnviarPdf: (sourceId: string) => Promise<void>;
	onCancelarRecurso?: () => Promise<void>;
	onValidarRecurso?: (textoRecurso: string) => Promise<void>;
}

export function RecursoDialog({
	isOpen,
	onClose,
	leadId,
	sourceId,
	recursoUrl,
	recursoArgumentacaoUrl,
	anotacoes,
	aguardandoRecurso,
	recursoPreliminar,
	recursoValidado,
	onSaveAnotacoes,
	onEnviarPdf,
	onCancelarRecurso,
	onValidarRecurso,
}: RecursoDialogProps) {
	const [textoAnotacoes, setTextoAnotacoes] = useState(anotacoes || "");
	const [textoRecurso, setTextoRecurso] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isEnviando, setIsEnviando] = useState(false);
	const [isCancelando, setIsCancelando] = useState(false);
	const [isValidando, setIsValidando] = useState(false);
	const [isSavingToken, setIsSavingToken] = useState(false);

	// Mensagem padrão para enviar com o PDF
	const MENSAGEM_PADRAO = "Segue o nosso Recurso, qualquer dúvida estamos à disposição";

	// Atualiza as anotações quando o diálogo for aberto ou as props mudarem
	useEffect(() => {
		if (isOpen) {
			// Se não tiver anotações, usar a mensagem padrão
			setTextoAnotacoes(anotacoes || MENSAGEM_PADRAO);

			// Se tem recurso preliminar, carregar o texto
			if (recursoPreliminar) {
				let textoExtraido = "";
				if (typeof recursoPreliminar === "string") {
					textoExtraido = recursoPreliminar;
				} else if (typeof recursoPreliminar === "object" && recursoPreliminar.textoRecurso) {
					textoExtraido = recursoPreliminar.textoRecurso;
				} else {
					textoExtraido = JSON.stringify(recursoPreliminar, null, 2);
				}
				setTextoRecurso(textoExtraido);
			}

			// Buscar token personalizado do banco de dados
			fetchAccessToken();
		}
	}, [isOpen, anotacoes, recursoPreliminar, leadId]);

	// Função para buscar o token personalizado do banco de dados
	const fetchAccessToken = async () => {
		try {
			const response = await fetch(`/api/admin/leads-chatwit/custom-token?leadId=${leadId}`, {
				method: "GET",
			});

			if (response.ok) {
				const data = await response.json();
				setAccessToken(data.chatwitAccessToken || "");
			}
		} catch (error) {
			console.error("Erro ao buscar token personalizado:", error);
			setAccessToken("");
		}
	};

	const handleSaveAnotacoes = async () => {
		try {
			setIsSaving(true);
			await onSaveAnotacoes(textoAnotacoes);
			toast.success("Mensagem salva", {
				description: "Anotações atualizadas",
				duration: 2000,
			});
		} catch (error: any) {
			toast.error("Erro", { description: error.message || "Não foi possível salvar a mensagem." });
		} finally {
			setIsSaving(false);
		}
	};

	const handleSaveAccessToken = async () => {
		try {
			setIsSavingToken(true);

			// Salvar o token no banco de dados
			const response = await fetch("/api/admin/leads-chatwit/custom-token", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					leadId,
					chatwitAccessToken: accessToken,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Erro ao salvar token");
			}

			toast("Sucesso", { description: "Token de acesso salvo com sucesso!" });
		} catch (error: any) {
			toast("Erro", { description: error.message || "Não foi possível salvar o token de acesso." });
		} finally {
			setIsSavingToken(false);
		}
	};

	const handleEnviarPdf = async () => {
		if (!recursoUrl) {
			toast("Erro", { description: "Não há recurso disponível para enviar." });
			return;
		}

		try {
			setIsEnviando(true);

			// Construir a URL com query parameters
			let url = `/api/admin/leads-chatwit/enviar-pdf-recurso-lead?sourceId=${sourceId}`;

			// Adicionar a mensagem das anotações como parâmetro
			if (textoAnotacoes) {
				url += `&message=${encodeURIComponent(textoAnotacoes)}`;
			}

			// Adicionar token personalizado se fornecido
			if (accessToken) {
				url += `&accessToken=${encodeURIComponent(accessToken)}`;
			}

			const response = await fetch(url, {
				method: "POST",
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Não foi possível enviar o PDF");
			}

			toast("Sucesso", { description: "PDF de recurso enviado com sucesso!" });
		} catch (error: any) {
			toast.error("Erro", { description: error.message || "Não foi possível enviar o PDF." });
		} finally {
			setIsEnviando(false);
		}
	};

	const handleCancelarRecurso = async () => {
		if (!onCancelarRecurso) return;

		try {
			setIsCancelando(true);
			await onCancelarRecurso();
			toast("Sucesso", { description: "Solicitação de recurso cancelada com sucesso!" });
			onClose(); // Fechar o diálogo após cancelamento
		} catch (error: any) {
			toast("Erro", { description: error.message || "Não foi possível cancelar o recurso." });
		} finally {
			setIsCancelando(false);
		}
	};

	const handleValidarRecurso = async () => {
		if (!onValidarRecurso) return;

		try {
			setIsValidando(true);
			await onValidarRecurso(textoRecurso);
			toast("Sucesso", { description: "Recurso validado e enviado para processamento!" });
			onClose(); // Fechar o diálogo após validação
		} catch (error: any) {
			toast("Erro", { description: error.message || "Não foi possível validar o recurso." });
		} finally {
			setIsValidando(false);
		}
	};

	const handleClose = () => {
		if (!isSaving && !isEnviando && !isCancelando && !isValidando) {
			onClose();
		}
	};

	const abrirPdfRecurso = () => {
		if (recursoUrl) {
			window.open(recursoUrl, "_blank");
		}
	};

	const abrirPdfArgumentacao = () => {
		if (recursoArgumentacaoUrl) {
			window.open(recursoArgumentacaoUrl, "_blank");
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{recursoValidado ? "Recurso Validado" : "Recurso"}</DialogTitle>
					<DialogDescription>
						{aguardandoRecurso
							? "O recurso está sendo processado. Aguarde..."
							: recursoUrl
								? recursoValidado
									? "Visualize o PDF de recurso validado e envie para o chat do lead."
									: "Visualize o PDF de recurso e adicione anotações."
								: recursoPreliminar
									? "Valide o pré-recurso gerado pelo sistema para continuar o processamento."
									: "Ainda não recebemos o recurso."}
					</DialogDescription>
				</DialogHeader>
				<div className="py-4 space-y-6">
					{/* Status do Recurso */}
					<div className="flex flex-col items-center justify-center">
						{aguardandoRecurso ? (
							<div className="flex flex-col items-center justify-center py-8">
								<Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
								<p className="text-lg font-medium">Aguardando Recurso</p>
								<p className="text-sm text-muted-foreground mt-2 mb-4">
									Estamos processando sua solicitação. Isso pode levar alguns minutos.
								</p>

								{onCancelarRecurso && (
									<Button variant="destructive" onClick={handleCancelarRecurso} disabled={isCancelando}>
										{isCancelando ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Cancelando...
											</>
										) : (
											<>
												<AlertOctagon className="h-4 w-4 mr-2" />
												Cancelar Recurso
											</>
										)}
									</Button>
								)}
							</div>
						) : recursoUrl ? (
							<div className="space-y-4">
								{/* Botão do Recurso */}
								<div
									className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/30 transition-colors"
									onClick={abrirPdfRecurso}
								>
									<FileText className="h-16 w-16 text-red-500 mb-4" />
									<p className="text-lg font-medium">
										{recursoValidado ? "Recurso Validado Disponível" : "Recurso Disponível"}
									</p>
									<p className="text-sm text-primary mt-2 flex items-center">
										Clique para abrir o PDF
										<ExternalLink className="ml-1 h-3 w-3" />
									</p>
								</div>

								{/* Botão da Argumentação (só mostra se tiver recursoArgumentacaoUrl) */}
								{recursoArgumentacaoUrl && (
									<div
										className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/30 transition-colors"
										onClick={abrirPdfArgumentacao}
									>
										<FileText className="h-16 w-16 text-blue-500 mb-4" />
										<p className="text-lg font-medium">Argumentação do Recurso Disponível</p>
										<p className="text-sm text-primary mt-2 flex items-center">
											Clique para abrir o PDF
											<ExternalLink className="ml-1 h-3 w-3" />
										</p>
									</div>
								)}
							</div>
						) : recursoPreliminar ? (
							<div className="flex flex-col items-center justify-center py-8">
								<FileText className="h-16 w-16 text-orange-500 mb-4" />
								<p className="text-lg font-medium">Pré-Recurso Gerado</p>
								<p className="text-sm text-muted-foreground mt-2">
									Valide o recurso gerado pelo sistema para continuar.
								</p>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-8">
								<FileText className="h-16 w-16 text-muted-foreground mb-4" />
								<p className="text-lg font-medium">Recurso Não Disponível</p>
								<p className="text-sm text-muted-foreground mt-2">Ainda não recebemos o recurso. Faça um recurso.</p>
							</div>
						)}
					</div>

					{/* Validação do Pré-Recurso */}
					{recursoPreliminar && !recursoValidado && (
						<div className="space-y-4 border p-4 rounded-md bg-orange-50">
							<h3 className="text-lg font-medium text-orange-800">Validar Pré-Recurso</h3>
							<p className="text-sm text-orange-700">
								Revise o texto do recurso gerado pelo sistema e valide para continuar o processamento.
							</p>
							<Textarea
								value={textoRecurso}
								onChange={(e) => setTextoRecurso(e.target.value)}
								className="min-h-[200px] font-mono bg-white"
								placeholder="Texto do recurso gerado pelo sistema..."
							/>
							<div className="flex gap-2">
								<Button variant="default" onClick={handleValidarRecurso} disabled={isValidando || !textoRecurso.trim()}>
									{isValidando ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Validando...
										</>
									) : (
										<>
											<Send className="mr-2 h-4 w-4" />
											Validar e Processar
										</>
									)}
								</Button>
							</div>
						</div>
					)}

					{/* Mensagem para envio - mostrar sempre que tiver recursoUrl */}
					{recursoUrl && (
						<div className="space-y-2">
							<h3 className="text-lg font-medium">Escreva uma Mensagem</h3>
							<Textarea
								value={textoAnotacoes}
								onChange={(e) => setTextoAnotacoes(e.target.value)}
								className="min-h-[100px] font-mono"
								placeholder="Escreva uma mensagem para enviar junto com o PDF do recurso..."
							/>
							<p className="text-sm text-muted-foreground">Esta mensagem será enviada junto com o PDF para o chat.</p>
						</div>
					)}

					{/* Token de acesso personalizado */}
					{recursoUrl && (
						<div className="space-y-2 border p-4 rounded-md">
							<h3 className="text-md font-medium flex items-center">
								<Key className="h-4 w-4 mr-2" />
								Token de Acesso Personalizado (Opcional)
							</h3>
							<div className="flex gap-2">
								<div className="flex-1">
									<Input
										value={accessToken}
										onChange={(e) => setAccessToken(e.target.value)}
										placeholder="Token de acesso personalizado para o Chatwoot"
									/>
								</div>
								<Button
									variant="outline"
									onClick={handleSaveAccessToken}
									disabled={isSavingToken}
									className="whitespace-nowrap"
								>
									{isSavingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Token"}
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								Se não for especificado, será usado o token padrão do sistema.
							</p>
						</div>
					)}

					{/* Anotações - só mostrar se não for recurso validado e não tiver recursoUrl */}
					{!recursoValidado && !recursoUrl && !recursoPreliminar && (
						<div className="space-y-2">
							<h3 className="text-lg font-medium">Anotações</h3>
							<Textarea
								value={textoAnotacoes}
								onChange={(e) => setTextoAnotacoes(e.target.value)}
								className="min-h-[150px] font-mono"
								placeholder="Adicione suas anotações sobre o recurso..."
							/>
						</div>
					)}
				</div>

				<DialogFooter className="flex flex-wrap gap-2 justify-between sm:justify-end">
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={handleClose}
							disabled={isSaving || isEnviando || isCancelando || isValidando}
						>
							Fechar
						</Button>

						{/* Botão de salvar anotações - só mostrar se não for recurso validado e não tiver recursoUrl e não tiver recursoPreliminar */}
						{!recursoValidado && !recursoUrl && !recursoPreliminar && (
							<Button variant="default" onClick={handleSaveAnotacoes} disabled={isSaving}>
								{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Salvar Anotações
							</Button>
						)}
					</div>

					{recursoUrl && (
						<Button variant="default" onClick={handleEnviarPdf} disabled={isEnviando || !recursoUrl}>
							{isEnviando ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Enviando...
								</>
							) : (
								<>
									<Send className="mr-2 h-4 w-4" />
									Enviar para o Chat
								</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
