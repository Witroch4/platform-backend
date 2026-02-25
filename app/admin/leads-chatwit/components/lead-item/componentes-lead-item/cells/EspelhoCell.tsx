import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Image as ImageIcon, FileUp, Loader2, Library, AlertCircle } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { CellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

interface EspelhoCellProps extends CellProps {
	manuscritoProcessadoLocal: boolean;
	hasEspelho: boolean;
	consultoriaAtiva: boolean;
	isEnviandoEspelho: boolean;
	isUploadingEspelho: boolean;
	refreshKey: number;
	localEspelhoState: {
		hasEspelho: boolean;
		aguardandoEspelho: boolean;
		espelhoCorrecao: any;
		textoDOEspelho: any;
	};
	onContextMenuAction: (action: ContextAction, data?: any) => void;
	onEspelhoClick: () => void;
	onOpenFileUpload: () => void;
	onOpenBiblioteca?: () => void;
	onOpenEspelhoSeletor?: () => void;
}

export function EspelhoCell({
	lead,
	manuscritoProcessadoLocal,
	hasEspelho,
	consultoriaAtiva,
	isEnviandoEspelho,
	isUploadingEspelho,
	refreshKey,
	localEspelhoState,
	onContextMenuAction,
	onEspelhoClick,
	onOpenFileUpload,
	onOpenBiblioteca,
	onOpenEspelhoSeletor,
}: EspelhoCellProps) {
	if (!manuscritoProcessadoLocal) {
		return <TableCell className="w-[120px] p-2 align-middle"></TableCell>;
	}

	// Verificar se há espelho processado (database) ou estado local
	const temEspelhoProcessado = lead.espelhoProcessado || localEspelhoState.hasEspelho;
	const estaAguardandoEspelho = lead.aguardandoEspelho || localEspelhoState.aguardandoEspelho;

	// Verificar se há espelho da biblioteca selecionado e processado
	const temEspelhoBibliotecaSelecionado = Boolean(lead.espelhoBibliotecaId);
	const espelhoBibliotecaProcessado = temEspelhoBibliotecaSelecionado && !estaAguardandoEspelho;

	// Verificar se há especialidade selecionada (para modo normal)
	const temEspecialidade = lead.especialidade && lead.especialidade !== null;

	// Handler para bloquear apenas a propagação, sem interferir no funcionamento interno
	const handleStopPropagation = (e: React.MouseEvent | React.SyntheticEvent) => {
		e.stopPropagation();
	};

	const handleButtonClick = () => {
		// Sempre permitir abrir o diálogo, mesmo quando aguardando
		if (estaAguardandoEspelho) {
			onEspelhoClick();
			return;
		}

		if (consultoriaAtiva) {
			if (temEspelhoProcessado) {
				onEspelhoClick();
			} else {
				if (onOpenBiblioteca) {
					onOpenBiblioteca();
				}
			}
		} else {
			// Modo normal: só permite selecionar espelho se tiver especialidade
			if (temEspelhoProcessado) {
				onEspelhoClick();
			} else if (temEspecialidade) {
				onOpenEspelhoSeletor?.();
			}
			// Se não tem especialidade, não faz nada (botão fica desabilitado)
		}
	};

	return (
		<TableCell className="min-w-[110px] max-w-[150px] p-2 align-middle">
			<LeadContextMenu
				contextType="espelho"
				onAction={onContextMenuAction}
				data={{
					id: lead.id,
					hasEspelho: temEspelhoProcessado,
					aguardandoEspelho: estaAguardandoEspelho,
				}}
			>
				<div className="flex flex-col gap-2">
					{/* Animação SVG enquanto aguarda espelho */}
					{estaAguardandoEspelho ? (
						<div
							className="w-full rounded-md border border-input bg-background overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300"
							key={`espelho-anim-${refreshKey}`}
						>
							<img
								src="/animations/espelhoCellAnimation.svg"
								alt="Processando espelho..."
								className="w-full h-auto"
								style={{ minHeight: "56px" }}
							/>
						</div>
					) : !consultoriaAtiva && !temEspecialidade && !temEspelhoProcessado ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										disabled={true}
										className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8"
										key={`espelho-btn-${refreshKey}-disabled`}
									>
										<AlertCircle className="h-4 w-4 mr-1 text-orange-500" />
										Selecionar Especialidade
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs max-w-60">
									<p>Selecione uma especialidade (gabarito padrão) na coluna anterior para poder escolher o espelho.</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						<Button
							variant="outline"
							onClick={handleButtonClick}
							disabled={isEnviandoEspelho || isUploadingEspelho}
							className="w-full text-xs px-2 py-1 h-auto min-h-8"
							key={`espelho-btn-${refreshKey}-${temEspelhoProcessado ? "edit" : "select"}-${consultoriaAtiva ? "consultoria" : "normal"}`}
						>
							{(() => {
								if (isUploadingEspelho) {
									return (
										<>
											<Loader2 className="h-4 w-4 mr-1 animate-spin" />
											Fazendo Upload...
										</>
									);
								}

								if (temEspelhoProcessado) {
									if (consultoriaAtiva) {
										return (
											<>
												<Eye className="h-4 w-4 mr-1" />
												Ver Espelho
											</>
										);
									} else {
										return (
											<>
												<Eye className="h-4 w-4 mr-1" />
												Editar Espelho
											</>
										);
									}
								} else {
									if (consultoriaAtiva) {
										return (
											<>
												<Library className={`h-4 w-4 mr-1 ${isEnviandoEspelho ? "animate-spin" : ""}`} />
												{isEnviandoEspelho ? "Carregando..." : "Biblioteca de Espelho"}
											</>
										);
									} else {
										return (
											<>
												<ImageIcon className={`h-4 w-4 mr-1 ${isEnviandoEspelho ? "animate-spin" : ""}`} />
												{isEnviandoEspelho ? "Enviando..." : "Selecionar Espelho"}
											</>
										);
									}
								}
							})()}
						</Button>
					)}

					{/* Badge de status da biblioteca */}
					{consultoriaAtiva && espelhoBibliotecaProcessado && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className="flex items-center gap-1 justify-center hover:scale-105 transition-transform duration-200 cursor-help"
										onClick={handleStopPropagation}
									>
										<DotLottieReact
											src="/animations/book.lottie"
											autoplay
											loop={true}
											className="w-10 h-10 transition-all duration-200 hover:scale-110 flex-shrink-0"
											aria-label="Espelho da biblioteca pronto"
										/>
										<Badge variant="default" className="text-xs hover:shadow-sm transition-all duration-200">
											Pronto
										</Badge>
									</div>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									<p>Espelho da biblioteca selecionado e disponível para análise</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</div>
			</LeadContextMenu>
		</TableCell>
	);
}
