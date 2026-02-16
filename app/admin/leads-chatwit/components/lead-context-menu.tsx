"use client";

import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ReactNode } from "react";

export type ContextType = "geral" | "pdf" | "imagem" | "arquivo" | "prova" | "espelho" | "analise" | "recurso";
export type ContextAction =
	| "atualizarLista"
	| "abrirLead"
	| "reunificarArquivos"
	| "reconverterImagem"
	| "excluirArquivo"
	| "excluirTodosArquivos"
	| "reenviarProva"
	| "excluirProva"
	| "editarProva"
	| "cancelarProva"
	| "selecionarEspelho"
	| "verEspelho"
	| "excluirEspelho"
	| "cancelarEspelho"
	| "excluirAnalise"
	| "verAnalise"
	| "verAnaliseValidada"
	| "enviarEspelhoUpload"
	| "enviarRecurso"
	| "verRecurso";

interface LeadContextMenuProps {
	contextType: ContextType;
	onAction: (action: ContextAction, data?: any) => void;
	children: ReactNode;
	data?: any;
}

export function LeadContextMenu({ contextType, onAction, children, data }: LeadContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-64">
				{/* Opções que aparecem em toda a tabela */}
				{(contextType === "geral" || contextType === "arquivo") && (
					<>
						<ContextMenuItem onClick={() => onAction("atualizarLista", data)}>
							Atualizar Lista
							<ContextMenuShortcut>⌘R</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem onClick={() => onAction("abrirLead", data)}>Abrir Lead</ContextMenuItem>
						{contextType === "arquivo" && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={() => onAction("excluirTodosArquivos", data)}
									className="text-red-500 focus:text-red-500 focus:bg-red-50"
								>
									Excluir Todos Arquivos
								</ContextMenuItem>
							</>
						)}
					</>
				)}

				{/* Opção para PDF unificado */}
				{contextType === "pdf" && (
					<>
						<ContextMenuItem onClick={() => onAction("reunificarArquivos", data)}>Reunificar Arquivos</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}

				{/* Opção para imagem convertida */}
				{contextType === "imagem" && (
					<>
						<ContextMenuItem onClick={() => onAction("reconverterImagem", data)}>
							Reconverter para Imagem
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}

				{/* Opções para prova */}
				{contextType === "prova" && (
					<>
						{data.aguardandoProva ? (
							<>
								<ContextMenuItem
									onClick={() => onAction("cancelarProva", data)}
									className="text-orange-500 focus:text-orange-500 focus:bg-orange-50"
								>
									Cancelar Processamento
								</ContextMenuItem>
							</>
						) : (
							<>
								{data.provaProcessada && (
									<ContextMenuItem onClick={() => onAction("editarProva", data)}>Editar Prova</ContextMenuItem>
								)}
								<ContextMenuItem onClick={() => onAction("reenviarProva", data)}>Reenviar Prova</ContextMenuItem>
								{data.provaProcessada && (
									<>
										<ContextMenuSeparator />
										<ContextMenuItem
											onClick={() => onAction("excluirProva", data)}
											className="text-red-500 focus:text-red-500 focus:bg-red-50"
										>
											Excluir Prova
										</ContextMenuItem>
									</>
								)}
							</>
						)}
					</>
				)}

				{/* Opções para espelho de correção */}
				{contextType === "espelho" && (
					<>
						{data.aguardandoEspelho ? (
							<>
								<ContextMenuItem onClick={() => onAction("verEspelho", data)}>Ver Espelho (Aguardando)</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={() => onAction("cancelarEspelho", data)}
									className="text-orange-500 focus:text-orange-500 focus:bg-orange-50"
								>
									Cancelar Processamento
								</ContextMenuItem>
								<ContextMenuItem
									onClick={() => onAction("excluirEspelho", data)}
									className="text-red-500 focus:text-red-500 focus:bg-red-50"
								>
									Excluir Espelho
								</ContextMenuItem>
							</>
						) : data.hasEspelho ? (
							<>
								<ContextMenuItem onClick={() => onAction("verEspelho", data)}>Editar Espelho</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={() => onAction("excluirEspelho", data)}
									className="text-red-500 focus:text-red-500 focus:bg-red-50"
								>
									Excluir Espelho
								</ContextMenuItem>
							</>
						) : (
							<>
								<ContextMenuItem onClick={() => onAction("selecionarEspelho", data)}>
									Selecionar Espelho
								</ContextMenuItem>
								<ContextMenuItem onClick={() => onAction("enviarEspelhoUpload", data)}>Upload Espelho</ContextMenuItem>
							</>
						)}
					</>
				)}

				{/* Opções para análise de prova */}
				{contextType === "analise" && (
					<>
						{data.analiseUrl && (
							<ContextMenuItem onClick={() => onAction("verAnalise", data)}>Ver Análise</ContextMenuItem>
						)}
						{data.analisePreliminar && data.analiseValidada && (
							<ContextMenuItem onClick={() => onAction("verAnaliseValidada", data)}>
								Ver Análise Validada
							</ContextMenuItem>
						)}
						{(data.analiseUrl || data.aguardandoAnalise || data.analisePreliminar) && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={() => onAction("excluirAnalise", data)}
									className="text-red-500 focus:text-red-500 focus:bg-red-50"
								>
									Excluir Análise
								</ContextMenuItem>
							</>
						)}
					</>
				)}

				{/* Opções para recurso */}
				{contextType === "recurso" && (
					<>
						{data.analiseValidada && data.temAnalisePreliminar && !data.fezRecurso && (
							<ContextMenuItem onClick={() => onAction("enviarRecurso", data)}>Enviar Recurso</ContextMenuItem>
						)}
						{data.fezRecurso && (
							<ContextMenuItem onClick={() => onAction("verRecurso", data)}>Ver Recurso</ContextMenuItem>
						)}
					</>
				)}

				{/* Opção de excluir arquivo - aparece para todos os contextos de arquivo */}
				{(contextType === "arquivo" || contextType === "pdf" || contextType === "imagem") && (
					<ContextMenuItem
						onClick={() => onAction("excluirArquivo", data)}
						className="text-red-500 focus:text-red-500 focus:bg-red-50"
					>
						Excluir Arquivo
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
