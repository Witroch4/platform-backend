import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit3 } from "lucide-react";
import type { ProvaCellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";


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
					<div
						className="w-full rounded-md border border-input bg-background overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300"
						key={`prova-anim-${refreshKey}`}
					>
						<img
							src="/animations/provaCellAnimation.svg"
							alt="Escrevendo a prova..."
							className="w-full h-auto"
							style={{ minHeight: "56px" }}
						/>
					</div>
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
