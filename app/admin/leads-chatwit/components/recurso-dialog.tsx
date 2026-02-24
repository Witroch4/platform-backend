import { useState, useEffect, useMemo } from "react";
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
import {
	Loader2,
	FileText,
	ExternalLink,
	Send,
	AlertOctagon,
	Key,
	Copy,
	Download,
	FileDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { marked } from "marked";
import { RecursoEditor, htmlToPlainText } from "./recurso-editor";
import { downloadDocx, downloadPdf, downloadTxt, copyToClipboard } from "./recurso-export-utils";

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
	analiseValidada?: boolean;
	temAnalisePreliminar?: boolean;
	onSaveAnotacoes: (anotacoes: string) => Promise<void>;
	onEnviarPdf: (sourceId: string) => Promise<void>;
	onCancelarRecurso?: () => Promise<void>;
	onValidarRecurso?: (data: { html: string; textoRecurso: string; message?: string; accessToken?: string }) => Promise<void>;
	onGerarRecurso?: () => Promise<void>;
}

/**
 * Extracts raw text from recursoPreliminar (which may be string, object w/ texto_recurso, or JSON)
 */
function extractRecursoText(recursoPreliminar: any): string {
	if (!recursoPreliminar) return "";
	if (typeof recursoPreliminar === "string") return recursoPreliminar;
	if (typeof recursoPreliminar === "object") {
		const text = recursoPreliminar.textoRecurso || recursoPreliminar.texto_recurso;
		if (text) return text;
	}
	return JSON.stringify(recursoPreliminar, null, 2);
}

/**
 * Converts Markdown text to HTML for the TipTap editor.
 * Falls back to plain text with <br> if parsing fails.
 */
function markdownToHtml(mdText: string): string {
	try {
		const html = marked.parse(mdText, { async: false }) as string;
		return html;
	} catch {
		return mdText.replace(/\n/g, "<br>");
	}
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
	analiseValidada,
	temAnalisePreliminar,
	onSaveAnotacoes,
	onEnviarPdf,
	onCancelarRecurso,
	onValidarRecurso,
	onGerarRecurso,
}: RecursoDialogProps) {
	const [textoAnotacoes, setTextoAnotacoes] = useState(anotacoes || "");
	// editorHtml holds the current TipTap HTML state (used for exports)
	const [editorHtml, setEditorHtml] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isEnviando, setIsEnviando] = useState(false);
	const [isCancelando, setIsCancelando] = useState(false);
	const [isValidando, setIsValidando] = useState(false);
	const [isSavingToken, setIsSavingToken] = useState(false);
	const [isGerando, setIsGerando] = useState(false);

	const MENSAGEM_PADRAO = "Segue o nosso Recurso, qualquer dúvida estamos à disposição";

	// Convert recursoPreliminar markdown text → HTML once when dialog opens
	const initialEditorHtml = useMemo(() => {
		const rawText = extractRecursoText(recursoPreliminar);
		if (!rawText) return "";
		return markdownToHtml(rawText);
	}, [recursoPreliminar]);

	useEffect(() => {
		if (isOpen) {
			setTextoAnotacoes(anotacoes || MENSAGEM_PADRAO);
			setEditorHtml(initialEditorHtml);
			fetchAccessToken();
		}
	}, [isOpen, anotacoes, initialEditorHtml, leadId]);

	const hasRecursoContent = Boolean(initialEditorHtml) || Boolean(editorHtml);
	const isEditable = !recursoValidado && !recursoUrl;

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
			toast.success("Mensagem salva", { description: "Anotações atualizadas", duration: 2000 });
		} catch (error: any) {
			toast.error("Erro", { description: error.message || "Não foi possível salvar a mensagem." });
		} finally {
			setIsSaving(false);
		}
	};

	const handleSaveAccessToken = async () => {
		try {
			setIsSavingToken(true);
			const response = await fetch("/api/admin/leads-chatwit/custom-token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ leadId, chatwitAccessToken: accessToken }),
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
			let url = `/api/admin/leads-chatwit/enviar-pdf-recurso-lead?sourceId=${sourceId}`;
			if (textoAnotacoes) url += `&message=${encodeURIComponent(textoAnotacoes)}`;
			if (accessToken) url += `&accessToken=${encodeURIComponent(accessToken)}`;
			const response = await fetch(url, { method: "POST" });
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
			onClose();
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
			const plainText = htmlToPlainText(editorHtml);
			await onValidarRecurso({
				html: editorHtml,
				textoRecurso: plainText,
				message: textoAnotacoes || undefined,
				accessToken: accessToken || undefined,
			});
			toast.success("Recurso validado e enviado para o chat!");
			onClose();
		} catch (error: any) {
			toast.error("Erro", { description: error.message || "Não foi possível validar o recurso." });
		} finally {
			setIsValidando(false);
		}
	};

	const handleGerarRecurso = async () => {
		if (!onGerarRecurso) return;
		try {
			setIsGerando(true);
			await onGerarRecurso();
		} catch (error: any) {
			toast.error("Erro", { description: error.message || "Não foi possível gerar o recurso." });
		} finally {
			setIsGerando(false);
		}
	};

	const handleClose = () => {
		if (!isSaving && !isEnviando && !isCancelando && !isValidando && !isGerando) {
			onClose();
		}
	};

	const abrirPdfRecurso = () => {
		if (recursoUrl) window.open(recursoUrl, "_blank");
	};

	const abrirPdfArgumentacao = () => {
		if (recursoArgumentacaoUrl) window.open(recursoArgumentacaoUrl, "_blank");
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
									? "Visualize o recurso validado, edite se necessário e exporte."
									: "Visualize o PDF de recurso e adicione anotações."
								: recursoPreliminar
									? "Revise e edite o recurso gerado, depois exporte ou valide."
									: "Ainda não recebemos o recurso."}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-6">
					{/* Status indicators */}
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
						) : recursoUrl && !hasRecursoContent ? (
							<div className="space-y-4">
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
						) : !recursoPreliminar && !recursoUrl ? (
							<div className="flex flex-col items-center justify-center py-8">
								<FileText className="h-16 w-16 text-muted-foreground mb-4" />
								<p className="text-lg font-medium">Recurso Não Disponível</p>
								<p className="text-sm text-muted-foreground mt-2 mb-4">
									{analiseValidada && temAnalisePreliminar
										? "Clique abaixo para gerar o recurso automaticamente via IA."
										: "É necessário ter uma análise validada para gerar o recurso."}
								</p>
								{onGerarRecurso && analiseValidada && temAnalisePreliminar && (
									<Button
										onClick={handleGerarRecurso}
										disabled={isGerando}
									>
										{isGerando ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Gerando Recurso...
											</>
										) : (
											<>
												<FileText className="h-4 w-4 mr-2" />
												Gerar Recurso via IA
											</>
										)}
									</Button>
								)}
							</div>
						) : null}
					</div>

					{/* Rich Text Editor + Export Buttons */}
					{hasRecursoContent && (
						<div className="space-y-4 border p-4 rounded-md bg-muted/30">
							<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
								<div>
									<h3 className="text-lg font-medium text-foreground">Conteúdo do Recurso</h3>
									{isEditable && (
										<p className="text-sm text-orange-600">
											Edite o recurso no editor abaixo. As exportações refletem o conteúdo atual.
										</p>
									)}
								</div>

								{/* Export action buttons */}
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => copyToClipboard(editorHtml)}
										title="Copiar texto"
									>
										<Copy className="h-4 w-4 mr-1" />
										Copiar
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => downloadDocx(editorHtml, leadId)}
										title="Baixar como DOCX"
									>
										<Download className="h-4 w-4 mr-1" />
										DOCX
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => downloadPdf(editorHtml, leadId)}
										title="Salvar como PDF"
									>
										<FileText className="h-4 w-4 mr-1" />
										PDF
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => downloadTxt(editorHtml, leadId)}
										title="Baixar como TXT"
									>
										<FileDown className="h-4 w-4 mr-1" />
										TXT
									</Button>
								</div>
							</div>

							{/* TipTap WYSIWYG Editor */}
							<RecursoEditor
								content={initialEditorHtml}
								onChange={setEditorHtml}
								readOnly={!isEditable}
							/>

							{/* Validate button (only for preliminary recurso, not yet validated) */}
							{isEditable && recursoPreliminar && (
								<div className="flex gap-2">
									<Button
										variant="default"
										onClick={handleValidarRecurso}
										disabled={isValidando || !editorHtml.trim()}
									>
										{isValidando ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Validando...
											</>
										) : (
											<>
												<Send className="mr-2 h-4 w-4" />
												Validar e Enviar para o Chat
											</>
										)}
									</Button>
								</div>
							)}

							{/* PDF links when recursoUrl exists alongside editor */}
							{recursoUrl && (
								<div className="flex flex-wrap gap-3 pt-2 border-t">
									<Button variant="ghost" size="sm" onClick={abrirPdfRecurso}>
										<ExternalLink className="h-4 w-4 mr-1" />
										Abrir PDF do Recurso
									</Button>
									{recursoArgumentacaoUrl && (
										<Button variant="ghost" size="sm" onClick={abrirPdfArgumentacao}>
											<ExternalLink className="h-4 w-4 mr-1" />
											Abrir Argumentação
										</Button>
									)}
								</div>
							)}
						</div>
					)}

					{/* Message for sending with DOCX */}
					{(recursoUrl || hasRecursoContent) && (
						<div className="space-y-2">
							<h3 className="text-lg font-medium">Mensagem para Envio</h3>
							<Textarea
								value={textoAnotacoes}
								onChange={(e) => setTextoAnotacoes(e.target.value)}
								className="min-h-[100px] font-mono"
								placeholder="Escreva uma mensagem para enviar junto com o DOCX do recurso..."
							/>
							<p className="text-sm text-muted-foreground">
								Esta mensagem será enviada junto com o DOCX para o chat do lead.
							</p>
						</div>
					)}

					{/* Custom access token */}
					{(recursoUrl || hasRecursoContent) && (
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

					{/* Annotations — only when no recurso content and no recursoUrl */}
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
