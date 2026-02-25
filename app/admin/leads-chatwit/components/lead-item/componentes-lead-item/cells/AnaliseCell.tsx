import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, FileText, FileCheck, Loader2, AlertCircle } from "lucide-react";
import type { CellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

interface AnaliseCellProps extends CellProps {
	localAnaliseState: {
		analiseUrl?: string;
		aguardandoAnalise: boolean;
		analisePreliminar?: any;
		analiseValidada: boolean;
	};
	consultoriaAtiva: boolean;
	isEnviandoAnalise: boolean;
	refreshKey: number;
	onContextMenuAction: (action: ContextAction, data?: any) => void;
	onAnaliseClick: () => void;
}

export function AnaliseCell({
	lead,
	localAnaliseState,
	consultoriaAtiva,
	isEnviandoAnalise,
	refreshKey,
	onContextMenuAction,
	onAnaliseClick,
}: AnaliseCellProps) {
	// Verificar se tem manuscrito
	const temManuscrito =
		lead.provaManuscrita &&
		(typeof lead.provaManuscrita === "string"
			? lead.provaManuscrita.length > 0
			: Array.isArray(lead.provaManuscrita)
				? lead.provaManuscrita.length > 0
				: typeof lead.provaManuscrita === "object" && lead.provaManuscrita !== null);

	// Verificar se tem espelho processado
	const temEspelho =
		lead.textoDOEspelho &&
		(typeof lead.textoDOEspelho === "string"
			? lead.textoDOEspelho.length > 0
			: Array.isArray(lead.textoDOEspelho)
				? lead.textoDOEspelho.length > 0
				: typeof lead.textoDOEspelho === "object" && lead.textoDOEspelho !== null);

	// Verificar se há espelho da biblioteca selecionado (para consultoria)
	const temEspelhoBiblioteca = Boolean(lead.espelhoBibliotecaId);

	// Verificar se há uma especialidade selecionada
	const temEspecialidade = lead.especialidade && lead.especialidade !== null;

	// Se já tem análise processada, pode visualizar independente das outras condições
	const podeVisualizar =
		localAnaliseState.analiseUrl || localAnaliseState.analiseValidada || localAnaliseState.analisePreliminar;

	// Determinar se pode enviar análise
	const podeEnviarAnalise = consultoriaAtiva
		? temManuscrito && (temEspelhoBiblioteca || temEspelho) && !isEnviandoAnalise
		: temManuscrito && temEspelho && temEspecialidade && !isEnviandoAnalise;

	// Determinar mensagem de aviso e se deve estar desabilitado
	let mensagemAviso = "";
	let isDisabled = false;

	if (!podeVisualizar && !podeEnviarAnalise) {
		isDisabled = true;

		if (!temManuscrito) {
			mensagemAviso = "Precisa\nProva/Manuscrito";
		} else if (consultoriaAtiva) {
			if (!temEspelhoBiblioteca && !temEspelho) {
				mensagemAviso = "Precisa de Espelho (Biblioteca ou Processado)";
			}
		} else {
			if (!temEspelho) {
				mensagemAviso = "Precisa de Espelho Processado";
			} else if (!temEspecialidade) {
				mensagemAviso = "Precisa Selecionar Especialidade";
			}
		}
	}

	return (
		<TableCell className="min-w-[100px] max-w-[140px] p-1 align-middle">
			<LeadContextMenu
				contextType="analise"
				onAction={onContextMenuAction}
				data={{
					id: lead.id,
					analiseUrl: localAnaliseState.analiseUrl,
					aguardandoAnalise: localAnaliseState.aguardandoAnalise,
					analisePreliminar: localAnaliseState.analisePreliminar,
					analiseValidada: localAnaliseState.analiseValidada,
				}}
			>
				{isEnviandoAnalise || localAnaliseState.aguardandoAnalise ? (
					<div
						className="w-full rounded-md border border-input bg-background overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300"
						key={`analise-anim-${refreshKey}`}
					>
						<img
							src="/animations/analiseCellAnimation.svg"
							alt="Analisando..."
							className="w-full h-auto"
							style={{ minHeight: "56px" }}
						/>
					</div>
				) : mensagemAviso ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									disabled={true}
									className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8 whitespace-pre-line"
									key={`analise-btn-${refreshKey}`}
								>
									<AlertCircle className="h-4 w-4 mr-1 text-orange-500" />
									{mensagemAviso}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs max-w-60">
								<p>{mensagemAviso}</p>
								{!temManuscrito && (
									<p className="text-muted-foreground mt-1">Faça upload da prova manuscrita primeiro.</p>
								)}
								{temManuscrito && consultoriaAtiva && !temEspelhoBiblioteca && !temEspelho && (
									<p className="text-muted-foreground mt-1">
										Selecione um espelho da biblioteca ou processe um espelho.
									</p>
								)}
								{temManuscrito && !consultoriaAtiva && !temEspelho && (
									<p className="text-muted-foreground mt-1">Processe um espelho de correção primeiro.</p>
								)}
								{temManuscrito && temEspelho && !consultoriaAtiva && !temEspecialidade && (
									<p className="text-muted-foreground mt-1">Selecione uma especialidade (gabarito padrão).</p>
								)}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					<Button
						variant="outline"
						onClick={onAnaliseClick}
						disabled={isDisabled}
						className="w-full text-xs px-2 py-1 h-auto min-h-8 whitespace-pre-line"
						key={`analise-btn-${refreshKey}`}
					>
						{localAnaliseState.analiseUrl ? (
							<>
								<Eye className="h-4 w-4 mr-1" />
								Ver Análise
							</>
						) : localAnaliseState.analiseValidada ? (
							<>
								<FileCheck className="h-4 w-4 mr-1" />
								Análise Validada Espere
							</>
						) : localAnaliseState.analisePreliminar ? (
							<>
								<FileText className="h-4 w-4 mr-1" />
								Pré-Análise
							</>
						) : (
							<>
								<FileText className="h-4 w-4 mr-1" />
								{consultoriaAtiva ? "Analisar Simulado" : "Analisar Prova"}
							</>
						)}
					</Button>
				)}
			</LeadContextMenu>
		</TableCell>
	);
}
