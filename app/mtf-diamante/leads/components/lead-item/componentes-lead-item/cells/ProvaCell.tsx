import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Edit3 } from "lucide-react";
import type { ProvaCellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/mtf-diamante/leads/components/lead-context-menu";
import { hasConvertedImages } from "../utils";


interface ProvaCellExtendedProps extends ProvaCellProps {
	provaProcessadaLocal: boolean;
	isDigitando: boolean;
	refreshKey: number;
	localProvaState: {
		provaProcessada: boolean;
		aguardandoProva: boolean;
		provaManuscrita: any;
	};
	onContextMenuAction: (action: ContextAction, data?: any) => void;
	onDigitarClick: () => void;
}

export function ProvaCell({
	lead,
	provaProcessadaLocal,
	isDigitando,
	refreshKey,
	localProvaState,
	onContextMenuAction,
	onDigitarClick,
}: ProvaCellExtendedProps) {
	const hasImages = hasConvertedImages(lead);
	const precisaImagens = !hasImages && !localProvaState.provaProcessada && !localProvaState.aguardandoProva;

	return (
		<TableCell className="min-w-[90px] max-w-[130px] p-2 align-middle">
			<LeadContextMenu
				contextType="prova"
				onAction={onContextMenuAction}
				data={{
					id: lead.id,
					provaProcessada: localProvaState.provaProcessada,
					aguardandoProva: localProvaState.aguardandoProva,
				}}
			>
				{localProvaState.aguardandoProva ? (
					<button
						type="button"
						onClick={onDigitarClick}
						className="w-full rounded-md border border-input bg-background overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
						key={`prova-anim-${refreshKey}`}
						title="Ver progresso da digitação"
					>
						<img
							src="/animations/provaCellAnimation.svg"
							alt="Escrevendo a prova..."
							className="w-full h-auto"
							style={{ minHeight: "56px" }}
						/>
					</button>
				) : precisaImagens ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									disabled={true}
									className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8 whitespace-pre-line"
									key={`prova-btn-${refreshKey}-disabled`}
								>
									<AlertCircle className="h-4 w-4 mr-1 text-orange-500" />
									Precisa de Imagens
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs max-w-60">
								<p>Converta o PDF em imagens antes de digitar a prova.</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					<Button
						variant="outline"
						onClick={onDigitarClick}
						disabled={isDigitando}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`prova-btn-${refreshKey}`}
					>
						{localProvaState.provaProcessada ? (
							<>
								<Edit3 className="h-4 w-4 mr-1" />
								Editar Prova
							</>
						) : (
							<>
								<Edit3 className={`h-4 w-4 mr-1 ${isDigitando ? "animate-spin" : ""}`} />
								{isDigitando ? "Processando..." : "Digitar Prova"}
							</>
						)}
					</Button>
				)}
			</LeadContextMenu>
		</TableCell>
	);
}
