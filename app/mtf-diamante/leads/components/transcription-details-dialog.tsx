"use client";

/**
 * Dialog de detalhes da transcrição
 * Mostra logs em tempo real e informações detalhadas do processo
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, Clock, FileText, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TranscriptionStatus } from "../hooks/useTranscriptionProgress";
import type { TranscriptionEvent } from "@/lib/oab-eval/transcription-queue";

interface TranscriptionDetailsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	transcription: TranscriptionStatus | null;
	history: TranscriptionEvent[];
	onCancel?: (leadID: string) => void;
}

export function TranscriptionDetailsDialog({
	open,
	onOpenChange,
	transcription,
	history,
	onCancel,
}: TranscriptionDetailsDialogProps) {
	if (!transcription) {
		return null;
	}

	const { leadID, status, currentPage, totalPages, percentage, estimatedTimeRemaining, startedAt, error } =
		transcription;

	const getStatusIcon = () => {
		switch (status) {
			case "queued":
				return <Clock className="h-5 w-5 animate-pulse text-yellow-600" />;
			case "processing":
				return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
			case "completed":
				return <CheckCircle2 className="h-5 w-5 text-green-600" />;
			case "failed":
				return <XCircle className="h-5 w-5 text-destructive" />;
			default:
				return <FileText className="h-5 w-5" />;
		}
	};

	const getStatusText = () => {
		switch (status) {
			case "queued":
				return "Na fila";
			case "processing":
				return "Processando";
			case "completed":
				return "Concluído";
			case "failed":
				return "Falhou";
			default:
				return "Aguardando";
		}
	};

	const formatEventTime = (event: TranscriptionEvent) => {
		if ("startedAt" in event) {
			return formatDistanceToNow(new Date(event.startedAt), {
				addSuffix: true,
				locale: ptBR,
			});
		}
		return "agora";
	};

	const getEventDescription = (event: TranscriptionEvent) => {
		switch (event.type) {
			case "queued":
				return `Adicionado à fila na posição ${event.position}`;
			case "started":
				return `Iniciou processamento de ${event.totalPages} páginas`;
			case "page-complete":
				return `Página ${event.page}/${event.totalPages} concluída (${event.percentage}%)`;
			case "completed":
				return `Digitação concluída (${event.result.totalPages} páginas em ${(event.result.processingTimeMs / 1000).toFixed(1)}s)`;
			case "failed":
				return `Erro: ${event.error}`;
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[85vh]">
				<DialogHeader>
					<div className="flex items-center gap-3">
						{getStatusIcon()}
						<div className="flex-1">
							<DialogTitle>Detalhes da Digitação</DialogTitle>
							<DialogDescription>Lead: {leadID}</DialogDescription>
						</div>
						<Badge variant={status === "completed" ? "outline" : status === "failed" ? "destructive" : "default"}>
							{getStatusText()}
						</Badge>
					</div>
				</DialogHeader>

				<ScrollArea className="h-[60vh] pr-4">
					<div className="space-y-4">
						{/* Informações gerais */}
						<div className="space-y-2">
							<h3 className="font-semibold text-sm">Informações</h3>
							<div className="grid grid-cols-2 gap-2 text-sm">
								{startedAt && (
									<div>
										<span className="text-muted-foreground">Iniciado:</span>{" "}
										<span className="font-medium">
											{formatDistanceToNow(new Date(startedAt), {
												addSuffix: true,
												locale: ptBR,
											})}
										</span>
									</div>
								)}
								{totalPages && (
									<div>
										<span className="text-muted-foreground">Total de páginas:</span>{" "}
										<span className="font-medium">{totalPages}</span>
									</div>
								)}
								{currentPage && (
									<div>
										<span className="text-muted-foreground">Página atual:</span>{" "}
										<span className="font-medium">{currentPage}</span>
									</div>
								)}
								{percentage !== undefined && (
									<div>
										<span className="text-muted-foreground">Progresso:</span>{" "}
										<span className="font-medium">{percentage}%</span>
									</div>
								)}
								{estimatedTimeRemaining && (
									<div>
										<span className="text-muted-foreground">Tempo restante:</span>{" "}
										<span className="font-medium">
											~
											{estimatedTimeRemaining < 60
												? `${estimatedTimeRemaining}s`
												: `${Math.floor(estimatedTimeRemaining / 60)}m ${estimatedTimeRemaining % 60}s`}
										</span>
									</div>
								)}
							</div>
						</div>

						<Separator />

						{/* Timeline de eventos */}
						<div className="space-y-2">
							<h3 className="font-semibold text-sm">Timeline</h3>
							<div className="space-y-2">
								{history.length === 0 && (
									<p className="text-sm text-muted-foreground">Nenhum evento registrado ainda</p>
								)}
								{history.map((event, index) => (
									<div key={index} className="flex gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors">
										<div className="mt-0.5">
											{event.type === "completed" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
											{event.type === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
											{event.type === "page-complete" && <FileText className="h-4 w-4 text-blue-600" />}
											{event.type === "started" && <Loader2 className="h-4 w-4 text-blue-600" />}
											{event.type === "queued" && <Clock className="h-4 w-4 text-yellow-600" />}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm">{getEventDescription(event)}</p>
											<p className="text-xs text-muted-foreground">{formatEventTime(event)}</p>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* Erro (se houver) */}
						{error && (
							<>
								<Separator />
								<div className="space-y-2">
									<h3 className="font-semibold text-sm text-destructive">Erro</h3>
									<div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
										<p className="text-sm text-destructive">{error}</p>
									</div>
								</div>
							</>
						)}
					</div>
				</ScrollArea>

				{/* Ações */}
				<div className="flex items-center justify-end gap-2 pt-4 border-t">
					{status === "processing" && onCancel && (
						<Button variant="destructive" onClick={() => onCancel(leadID)}>
							<XCircle className="h-4 w-4 mr-2" />
							Cancelar Digitação
						</Button>
					)}
					{status === "completed" && (
						<Button variant="outline" onClick={() => window.location.reload()}>
							<Download className="h-4 w-4 mr-2" />
							Recarregar Página
						</Button>
					)}
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Fechar
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
