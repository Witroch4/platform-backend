import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { CellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

interface RecursoCellProps extends CellProps {
	localAnaliseState: {
		analiseUrl?: string;
		aguardandoAnalise: boolean;
		analisePreliminar?: any;
		analiseValidada: boolean;
	};
	localRecursoState: {
		recursoUrl?: string;
		aguardandoRecurso: boolean;
		recursoPreliminar?: any;
		recursoValidado: boolean;
	};
	isEnviandoRecurso: boolean;
	refreshKey: number;
	onContextMenuAction: (action: ContextAction, data?: any) => void;
	onRecursoClick: () => void;
	onGerarRecurso: () => void;
}

export function RecursoCell({
	lead,
	localAnaliseState,
	localRecursoState,
	isEnviandoRecurso,
	refreshKey,
	onContextMenuAction,
	onRecursoClick,
	onGerarRecurso,
}: RecursoCellProps) {
	// Verificar se tem análise preliminar
	const temAnalisePreliminar = Boolean(localAnaliseState.analisePreliminar);

	// Verificar se análise foi validada
	const analiseValidada = localAnaliseState.analiseValidada;

	// Verificar se já fez recurso
	const jaFezRecurso = Boolean(lead.fezRecurso);

	// Estados do recurso
	const temRecursoPreliminar = Boolean(localRecursoState.recursoPreliminar);
	const aguardandoRecurso = localRecursoState.aguardandoRecurso;
	const recursoUrl = localRecursoState.recursoUrl;

	return (
		<TableCell className="min-w-[100px] max-w-[140px] p-1 align-middle">
			<LeadContextMenu
				contextType="recurso"
				onAction={onContextMenuAction}
				data={{
					id: lead.id,
					fezRecurso: jaFezRecurso,
					analiseValidada: analiseValidada,
					temAnalisePreliminar: temAnalisePreliminar,
					recursoUrl: recursoUrl,
					aguardandoRecurso: aguardandoRecurso,
					recursoPreliminar: localRecursoState.recursoPreliminar,
				}}
			>
				{recursoUrl ? (
					<Button
						variant="outline"
						onClick={onRecursoClick}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						<FileText className="h-4 w-4 mr-1" />
						Ver Recurso
					</Button>
				) : aguardandoRecurso ? (
					<Button
						variant="outline"
						onClick={onRecursoClick}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						<Loader2 className="h-4 w-4 mr-1 animate-spin" />
						Aguardando Recurso
					</Button>
				) : temRecursoPreliminar ? (
					<Button
						variant="outline"
						onClick={onRecursoClick}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						<FileText className="h-4 w-4 mr-1" />
						Validar Recurso
					</Button>
				) : jaFezRecurso ? (
					<Button
						variant="outline"
						onClick={onRecursoClick}
						className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/50 text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						<CheckCircle className="h-4 w-4 mr-1" />
						Recurso Feito
					</Button>
				) : !temAnalisePreliminar ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									disabled={true}
									className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8"
									key={`recurso-btn-${refreshKey}`}
								>
									<AlertCircle className="h-4 w-4 mr-1 text-gray-500" />
									Precisa de Análise
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs max-w-60">
								<p>É necessário ter uma análise preliminar para fazer o recurso.</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : !analiseValidada ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									disabled={true}
									className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8"
									key={`recurso-btn-${refreshKey}`}
								>
									<Shield className="h-4 w-4 mr-1 text-orange-500" />
									Validar Análise
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs max-w-60">
								<p>A análise precisa ser validada antes de fazer o recurso.</p>
								<p className="text-muted-foreground mt-1">Valide a análise preliminar primeiro.</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					<Button
						variant="outline"
						onClick={onGerarRecurso}
						disabled={isEnviandoRecurso}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						<FileText className="h-4 w-4 mr-1" />
						Fazer Recurso
					</Button>
				)}
			</LeadContextMenu>
		</TableCell>
	);
}
