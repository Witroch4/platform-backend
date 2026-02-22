import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { CellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { useState } from "react";
import { toast } from "sonner";
import { getColumnProvider } from "@/app/admin/leads-chatwit/components/provider-switch";

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
}

export function RecursoCell({
	lead,
	localAnaliseState,
	localRecursoState,
	isEnviandoRecurso,
	refreshKey,
	onContextMenuAction,
	onRecursoClick,
}: RecursoCellProps) {
	const [isProcessing, setIsProcessing] = useState(false);

	// Verificar se tem análise preliminar
	const temAnalisePreliminar = Boolean(localAnaliseState.analisePreliminar);

	// Verificar se análise foi validada
	const analiseValidada = localAnaliseState.analiseValidada;

	// Verificar se já fez recurso
	const jaFezRecurso = Boolean(lead.fezRecurso);

	// Estados do recurso
	const temRecursoPreliminar = Boolean(localRecursoState.recursoPreliminar);
	const recursoValidado = localRecursoState.recursoValidado;
	const aguardandoRecurso = localRecursoState.aguardandoRecurso;
	const recursoUrl = localRecursoState.recursoUrl;

	// Determinar o estado do botão
	const podeEnviarRecurso =
		analiseValidada &&
		temAnalisePreliminar &&
		!isEnviandoRecurso &&
		!isProcessing &&
		!jaFezRecurso &&
		!temRecursoPreliminar &&
		!aguardandoRecurso;

	const handleRecursoClick = async () => {
		if (!podeEnviarRecurso) return;

		setIsProcessing(true);

		try {
			const selectedProvider = getColumnProvider("RECURSO_CELL", "OPENAI");

			// Preparar dados para gerar via Vercel AI SDK Interno
			const recursoData = {
				leadID: lead.id,
				leadId: lead.id, // Adicionando ambos por segurança e alinhamento
				analiseValidada: localAnaliseState.analisePreliminar,
				selectedProvider,
				dadosAdicionais: {
					nome: lead.nomeReal || lead.name || "Lead sem nome",
					email: lead.email,
					telefone: lead.phoneNumber,
					especialidade: lead.especialidade
				}
			};

			console.log("[Fazer Recurso] Solicitando geração via AI SDK Interno:", {
				leadId: lead.id,
				temAnalise: Boolean(localAnaliseState.analisePreliminar),
				analiseValidada: analiseValidada,
			});

			// Enviar para Rota Interna dedicada
			const response = await fetch("/api/admin/leads-chatwit/gerar-recurso-interno", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(recursoData),
			});

			const result = await response.json();

			if (response.ok) {
				// Atualiza a listagem através do callback recebido
				toast.success("Recurso gerado!", {
					description: "O recurso estruturado via AI SDK foi salvo.",
					duration: 4000,
				});

				onRecursoClick();
			} else {
				throw new Error(result.error || "Erro interno ao gerar recurso via AI SDK");
			}
		} catch (error: any) {
			console.error("Erro ao fazer recurso:", error);
			toast.error("Erro", {
				description: error.message || "Não foi possível enviar o recurso. Tente novamente.",
			});
		} finally {
			setIsProcessing(false);
		}
	};

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
						disabled={true}
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
						onClick={handleRecursoClick}
						disabled={isProcessing || isEnviandoRecurso}
						className="w-full text-xs px-2 py-1 h-auto min-h-8"
						key={`recurso-btn-${refreshKey}`}
					>
						{isProcessing || isEnviandoRecurso ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								Enviando...
							</>
						) : (
							<>
								<FileText className="h-4 w-4 mr-1" />
								Fazer Recurso
							</>
						)}
					</Button>
				)}
			</LeadContextMenu>
		</TableCell>
	);
}
