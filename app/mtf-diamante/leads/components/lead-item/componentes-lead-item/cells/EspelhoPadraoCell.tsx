import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, BookOpen, Check, Loader2 } from "lucide-react";
import type { CellProps } from "../types";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { leadsQueryKeys } from "../../../../lib/query-keys";
import { hasConvertedImages } from "../utils";

interface EspelhoPadrao {
	id: string;
	especialidade: string;
	nome: string;
	descricao?: string;
	textoMarkdown?: string;
	isAtivo: boolean;
	totalUsos: number;
	processado: boolean;
	aguardandoProcessamento: boolean;
}

interface OabRubric {
	id: string;
	nome: string;
	meta: {
		area: string;
		exam?: string;
		[key: string]: any;
	};
	version: number;
}

interface EspelhoPadraoCellProps extends CellProps {
	usuarioId: string;
	onEspelhoPadraoChange: (leadId: string, especialidade: string | null, espelhoPadraoId?: string) => void;
	espelhosPadrao?: EspelhoPadrao[];
	loadingEspelhosPadrao?: boolean;
}

const especialidadeLabels: { [key: string]: string } = {
	ADMINISTRATIVO: "Administrativo",
	CIVIL: "Civil",
	CONSTITUCIONAL: "Constitucional",
	TRABALHO: "Trabalho",
	EMPRESARIAL: "Empresarial",
	PENAL: "Penal",
	TRIBUTARIO: "Tributário",
};

export function EspelhoPadraoCell({
	lead,
	usuarioId,
	onEspelhoPadraoChange,
	espelhosPadrao = [],
	loadingEspelhosPadrao = false,
}: EspelhoPadraoCellProps) {
	const [atualizandoLead, setAtualizandoLead] = useState(false);
	const [especialidadeLocal, setEspecialidadeLocal] = useState<string | null>(lead.especialidade || null);
	const [espelhoPadraoSelecionadoId, setEspelhoPadraoSelecionadoId] = useState<string | null>(
		(lead as any).espelhoPadraoId || null,
	);

	// Buscar rubricas OAB (agente local)
	const { data: rubricData, isLoading: loadingRubrics } = useQuery<{
		success: boolean;
		rubrics: Record<string, any[]>;
	}>({
		queryKey: leadsQueryKeys.oabRubrics(),
		queryFn: async () => {
			const res = await fetch("/api/admin/leads-chatwit/oab-rubrics");
			if (!res.ok) throw new Error("Erro ao carregar rubricas");
			return res.json();
		},
		staleTime: 10 * 60 * 1000, // 10min — reference data
		refetchOnWindowFocus: false,
	});

	// Verificar qual fonte de dados usar (flag do config.yml)
	const usarAgenteLocal = true; // TODO: pegar do config via API
	const espelhosDisponiveis = usarAgenteLocal ? rubricData?.rubrics || {} : espelhosPadrao;
	const isLoadingEspelhos = usarAgenteLocal ? loadingRubrics : loadingEspelhosPadrao;

	// Sincronizar especialidade e espelho padrão quando o lead mudar
	// ✅ FIXO: useEffect ANTES do early return para manter ordem dos hooks
	useEffect(() => {
		setEspecialidadeLocal(lead.especialidade || null);
		setEspelhoPadraoSelecionadoId((lead as any).espelhoPadraoId || null);
	}, [lead.id, lead.especialidade, (lead as any).espelhoPadraoId]);

	// ✅ FIXO: Early return DEPOIS de todos os hooks
	// Só mostra se há imagens convertidas (mesma lógica do ImagesCell)
	if (!hasConvertedImages(lead)) {
		return (
			<TableCell className="min-w-[120px] max-w-[160px] p-2 align-middle">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								disabled={true}
								className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8 whitespace-pre-line"
							>
								<AlertCircle className="h-4 w-4 mr-1 text-orange-500" />
								Precisa de Imagens
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-60">
							<p>Converta o PDF em imagens antes de selecionar o espelho padrão.</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</TableCell>
		);
	}

	const handleEspelhoChange = async (espelhoId: string) => {
		try {
			setAtualizandoLead(true);

			if (espelhoId === "none") {
				setEspelhoPadraoSelecionadoId(null);
				setEspecialidadeLocal(null);
				onEspelhoPadraoChange(lead.id, null, undefined);
				toast.success("Espelho padrão removido");
				return;
			}

			// Encontrar o espelho selecionado
			let espelhoSelecionado: any = null;
			let areaEspecialidade: string | null = null;

			if (usarAgenteLocal) {
				// Buscar na estrutura de rubricas OAB
				for (const [area, espelhos] of Object.entries(rubricData?.rubrics || {})) {
					const espelho = (espelhos as any[]).find((e) => e.id === espelhoId);
					if (espelho) {
						espelhoSelecionado = espelho;
						// Usar área exatamente como está no OabRubric (ex: "DIREITO DO TRABALHO")
						areaEspecialidade = espelho.area;
						break;
					}
				}
			} else {
				// Buscar em espelhos padrão legado
				espelhoSelecionado = espelhosPadrao.find((e) => e.id === espelhoId);
				areaEspecialidade = espelhoSelecionado?.especialidade || null;
			}

			if (!espelhoSelecionado) {
				throw new Error("Espelho padrão não encontrado");
			}

			// Atualizar estados locais
			setEspelhoPadraoSelecionadoId(espelhoId);
			setEspecialidadeLocal(areaEspecialidade);

			// Atualizar no banco (salvar ID do espelho e especialidade)
			const response = await fetch(`/api/admin/leads-chatwit/atualizar-especialidade`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					leadId: lead.id,
					especialidade: areaEspecialidade,
					espelhoPadraoId: espelhoId,
				}),
			});

			if (!response.ok) {
				// Reverter estado local em caso de erro
				setEspelhoPadraoSelecionadoId((lead as any).espelhoPadraoId || null);
				setEspecialidadeLocal(lead.especialidade || null);
				throw new Error("Erro ao atualizar espelho padrão");
			}

			// Notificar componente pai
			onEspelhoPadraoChange(lead.id, areaEspecialidade, espelhoId);

			toast.success("Espelho padrão atualizado", {
				description: espelhoSelecionado.nome,
				duration: 2000,
			});
		} catch (error: any) {
			console.error("Erro ao atualizar espelho padrão:", error);
			toast.error("Erro", { description: error.message || "Não foi possível atualizar o espelho padrão." });
		} finally {
			setAtualizandoLead(false);
		}
	};

	// Handler para bloquear apenas a propagação, sem interferir no funcionamento interno
	const handleStopPropagation = (e: React.MouseEvent | React.SyntheticEvent) => {
		e.stopPropagation();
	};

	// Handler mais específico para container - só previne propagação para a linha da tabela
	const handleContainerClick = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	// Verificar espelho selecionado
	let espelhoAtual: any = null;
	if (usarAgenteLocal && espelhoPadraoSelecionadoId) {
		// Buscar na estrutura de rubricas
		for (const [area, espelhos] of Object.entries(rubricData?.rubrics || {})) {
			const found = (espelhos as any[]).find((e) => e.id === espelhoPadraoSelecionadoId);
			if (found) {
				espelhoAtual = found;
				break;
			}
		}
	} else if (!usarAgenteLocal && especialidadeLocal) {
		// Buscar em espelhos padrão legado
		espelhoAtual = espelhosPadrao.find((ep) => ep.especialidade === especialidadeLocal);
	}

	const temEspelhoSelecionado = Boolean(espelhoAtual);

	return (
		<TableCell className="min-w-[120px] max-w-[160px] p-2 align-middle" onClick={handleContainerClick}>
			<div className="flex flex-col gap-2" onClick={handleContainerClick}>
				<Select
					value={espelhoPadraoSelecionadoId || "none"}
					onValueChange={handleEspelhoChange}
					disabled={isLoadingEspelhos || atualizandoLead}
				>
					<SelectTrigger
						className={`
            w-full h-8 transition-all duration-200 hover:shadow-sm
            ${
							isLoadingEspelhos || atualizandoLead
								? "opacity-60 cursor-not-allowed bg-muted animate-pulse"
								: "hover:bg-accent/50 hover:border-accent-foreground/20 focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
						}
          `}
					>
						<div className="flex items-center gap-2">
							{(isLoadingEspelhos || atualizandoLead) && <Loader2 className="h-3 w-3 animate-spin" />}
							{/* Só mostra SelectValue se não tiver espelho selecionado */}
							{!temEspelhoSelecionado ? (
								<SelectValue
									placeholder={
										isLoadingEspelhos ? "Carregando..." : atualizandoLead ? "Atualizando..." : "Selecionar espelho"
									}
								/>
							) : (
								<span className="text-[10px] text-muted-foreground truncate max-w-[90%]">
									{espelhoAtual?.area || "Espelho Selecionado"}
								</span>
							)}
						</div>
					</SelectTrigger>
					<SelectContent className="max-h-60 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-200 shadow-lg border-border/50">
						<SelectItem
							value="none"
							className="hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer focus:bg-accent focus:text-accent-foreground"
						>
							<div className="flex items-center justify-between w-full">
								<span className="font-medium">Nenhum</span>
								{!espelhoPadraoSelecionadoId && <Check className="h-3 w-3 text-green-500" />}
							</div>
						</SelectItem>

						{/* Renderizar espelhos por exame (OAB) */}
						{usarAgenteLocal
							? (() => {
									// Organizar rubricas por exame (sem sub-agrupamento por área)
									const espelhosPorExame: Record<string, any[]> = {};

									// Agrupar por exame
									Object.entries(rubricData?.rubrics || {}).forEach(([area, espelhos]) => {
										(espelhos as any[]).forEach((espelho) => {
											const examNumber = espelho.exam || "Exame Desconhecido";

											if (!espelhosPorExame[examNumber]) {
												espelhosPorExame[examNumber] = [];
											}

											espelhosPorExame[examNumber].push(espelho);
										});
									});

									// Extrair número do exame para ordenação (ex: "43º Exame" -> 43)
									const extractExamNumber = (exam: string): number => {
										const match = exam.match(/(\d+)/);
										return match ? parseInt(match[1], 10) : 0;
									};

									// Ordenar exames por número (decrescente - mais recente primeiro)
									const examesOrdenados = Object.keys(espelhosPorExame).sort((a, b) => {
										return extractExamNumber(b) - extractExamNumber(a);
									});

									return examesOrdenados.map((exame, examIndex) => {
										const espelhos = espelhosPorExame[exame];

										return (
											<div key={exame}>
												{/* Título do Exame (OAB) - Tom cinza suave */}
												<div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border/20">
													{exame}
												</div>

												{/* Lista de espelhos do exame (sem sub-agrupamento) */}
												{espelhos.map((espelho) => {
													const isSelected = espelhoPadraoSelecionadoId === espelho.id;
													return (
														<SelectItem
															key={espelho.id}
															value={espelho.id}
															className={`
                                transition-all duration-200 cursor-pointer pl-3
                                hover:bg-accent hover:text-accent-foreground hover:scale-[1.01]
                                focus:bg-accent focus:text-accent-foreground
                                ${isSelected ? "bg-primary/10 text-primary" : ""}
                              `}
														>
															<div className="flex items-center justify-between w-full">
																<span
																	className={`font-medium text-sm ${isSelected ? "text-primary font-semibold" : ""}`}
																>
																	{espelho.nome}
																</span>
																{isSelected && <Check className="h-3 w-3 text-primary animate-pulse" />}
															</div>
														</SelectItem>
													);
												})}
											</div>
										);
									});
								})()
							: Object.entries(especialidadeLabels).map(([key, label]) => {
									const espelhoPadrao = espelhosPadrao.find((ep) => ep.especialidade === key);
									const disponivel = espelhoPadrao?.isAtivo && espelhoPadrao.processado;
									const isSelected = especialidadeLocal === key;

									return (
										<SelectItem
											key={key}
											value={espelhoPadrao?.id || key}
											disabled={!disponivel}
											className={`
                        transition-all duration-200 cursor-pointer
                        ${
													disponivel
														? "hover:bg-accent hover:text-accent-foreground hover:scale-[1.02] focus:bg-accent focus:text-accent-foreground"
														: "opacity-50 cursor-not-allowed hover:bg-muted/30"
												}
                        ${isSelected ? "bg-primary/10 text-primary" : ""}
                      `}
										>
											<div className="flex items-center justify-between w-full">
												<span
													className={`
                          font-medium transition-colors
                          ${disponivel ? "text-foreground" : "text-muted-foreground"}
                          ${isSelected ? "text-primary font-semibold" : ""}
                        `}
												>
													{label}
												</span>
												<div className="flex items-center gap-2">
													{disponivel && isSelected && <Check className="h-3 w-3 text-primary animate-pulse" />}
													{disponivel && !isSelected && (
														<div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/40">
															<div className="h-1.5 w-1.5 rounded-full bg-green-500 m-auto mt-0.5" />
														</div>
													)}
													{!disponivel && (
														<div className="flex items-center gap-1">
															<div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/40">
																<div className="h-1.5 w-1.5 rounded-full bg-red-500 m-auto mt-0.5" />
															</div>
															<span className="text-xs text-muted-foreground">(Indisponível)</span>
														</div>
													)}
												</div>
											</div>
										</SelectItem>
									);
								})}
					</SelectContent>
				</Select>

				{/* Badge de status */}
				{temEspelhoSelecionado && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div
									className="flex items-center gap-1 hover:scale-105 transition-transform duration-200 cursor-help"
									onClick={handleStopPropagation}
								>
									<BookOpen className="h-3 w-3 transition-all duration-200 hover:text-primary hover:scale-110" />
									<Badge
										variant="default"
										className="text-[10px] leading-tight py-0.5 px-1.5 hover:shadow-sm transition-all duration-200"
									>
										{espelhoAtual?.area || "Selecionado"}
									</Badge>
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">
								<p>
									{espelhoAtual?.exam && `${espelhoAtual.exam} - `}
									{espelhoAtual?.area || espelhoAtual?.nome}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>
		</TableCell>
	);
}
