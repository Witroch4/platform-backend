"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Variable, Package, X, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnifiedVariables, type UnifiedVariable } from "../../hooks/useUnifiedVariables";

interface VariableContextMenuProps {
	accountId: string;
	isOpen: boolean;
	onClose: () => void;
	onInsert: (text: string, position?: number) => void;
	position?: { x: number; y: number };
	className?: string;
}

export const VariableContextMenu: React.FC<VariableContextMenuProps> = ({
	accountId,
	isOpen,
	onClose,
	onInsert,
	position = { x: 0, y: 0 },
	className,
}) => {
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedType, setSelectedType] = useState<"all" | "normal" | "lote">("all");
	const menuRef = useRef<HTMLDivElement>(null);

	const { variables, loading, error, insertVariable, refreshVariables } = useUnifiedVariables(accountId, onInsert);

	// Filtrar variáveis baseado na busca e tipo selecionado
	const filteredVariables = variables.filter((variable) => {
		const matchesSearch =
			variable.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			variable.chave.toLowerCase().includes(searchTerm.toLowerCase()) ||
			variable.descricao.toLowerCase().includes(searchTerm.toLowerCase());

		const matchesType = selectedType === "all" || variable.tipo === selectedType;

		return matchesSearch && matchesType;
	});

	// SEÇÃO 2: VARIÁVEIS DO MÉTODO - Variável especial para nome do lead
	const specialVariables: UnifiedVariable[] = [
		{
			id: "nome_lead_special",
			chave: "nome_lead",
			valor: "{{nome_lead}}",
			displayName: "Nome do Lead",
			descricao: "Nome da pessoa que receberá a mensagem (substituído dinamicamente)",
			tipo: "normal",
			isActive: true,
		},
	];

	// Agrupar variáveis por tipo
	const groupedVariables = {
		special: specialVariables.filter(
			(v) =>
				v.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
				v.chave.toLowerCase().includes(searchTerm.toLowerCase()) ||
				v.descricao.toLowerCase().includes(searchTerm.toLowerCase()),
		),
		normal: filteredVariables.filter((v) => v.tipo === "normal") as UnifiedVariable[],
		lote: filteredVariables.filter((v) => v.tipo === "lote") as UnifiedVariable[],
	};

	// Fechar menu ao clicar fora
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [isOpen, onClose]);

	// Fechar menu com ESC
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [isOpen, onClose]);

	const handleVariableClick = (variable: UnifiedVariable) => {
		// Insere diretamente o placeholder nomeado
		insertVariable(variable.chave);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 bg-black/20" style={{ pointerEvents: isOpen ? "auto" : "none" }}>
			<Card
				ref={menuRef}
				className={cn("absolute w-96 max-h-96 shadow-lg border bg-background", className)}
				style={{
					left: Math.min(position.x, window.innerWidth - 400),
					top: Math.min(position.y, window.innerHeight - 400),
				}}
			>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Variable className="h-4 w-4" />
							Inserir Variável
						</CardTitle>
						<Button variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
							<X className="h-3 w-3" />
						</Button>
					</div>

					{/* Barra de busca */}
					<div className="relative">
						<Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
						<Input
							placeholder="Buscar variáveis..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-7 h-8 text-xs"
						/>
					</div>

					{/* Filtros por tipo */}
					<div className="flex gap-1">
						<Button
							variant={selectedType === "all" ? "default" : "outline"}
							onClick={() => setSelectedType("all")}
							className="h-6 px-2 text-xs"
						>
							Todas
						</Button>
						<Button
							variant={selectedType === "normal" ? "default" : "outline"}
							onClick={() => setSelectedType("normal")}
							className="h-6 px-2 text-xs"
						>
							<Variable className="h-3 w-3 mr-1" />
							Normais
						</Button>
						<Button
							variant={selectedType === "lote" ? "default" : "outline"}
							onClick={() => setSelectedType("lote")}
							className="h-6 px-2 text-xs"
						>
							<Package className="h-3 w-3 mr-1" />
							Lote
						</Button>
					</div>
				</CardHeader>

				<CardContent className="p-0">
					<ScrollArea className="h-64">
						{loading ? (
							<div className="p-4 text-center text-sm text-muted-foreground">Carregando variáveis...</div>
						) : error ? (
							<div className="p-4 text-center text-sm text-destructive">{error}</div>
						) : filteredVariables.length === 0 ? (
							<div className="p-4 text-center text-sm text-muted-foreground">Nenhuma variável encontrada</div>
						) : (
							<div className="space-y-1 p-2">
								{/* Variáveis Especiais */}
								{(selectedType === "all" || selectedType === "normal") && groupedVariables.special.length > 0 && (
									<>
										<div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
											<Variable className="h-3 w-3" />
											Variáveis Especiais
										</div>
										{groupedVariables.special.map((variable) => (
											<Button
												key={variable.id}
												variant="ghost"
												className="w-full justify-start h-auto p-2 text-left border-l-2 border-l-orange-400"
												onClick={() => handleVariableClick(variable)}
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-xs font-medium truncate">{variable.displayName}</span>
														<Badge variant="default" className="text-xs px-1 py-0 bg-orange-500">
															{variable.chave}
														</Badge>
													</div>
													<div className="text-xs text-muted-foreground truncate">{variable.descricao}</div>
													<div className="text-xs text-muted-foreground mt-1 font-mono bg-orange-50 px-1 rounded">
														{variable.valor}
													</div>
												</div>
											</Button>
										))}
									</>
								)}

								{/* Separador */}
								{selectedType === "all" &&
									groupedVariables.special.length > 0 &&
									groupedVariables.normal.length > 0 && <Separator className="my-2" />}

								{/* Variáveis Normais */}
								{(selectedType === "all" || selectedType === "normal") && groupedVariables.normal.length > 0 && (
									<>
										<div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
											<Variable className="h-3 w-3" />
											Variáveis do Sistema
										</div>
										{groupedVariables.normal.map((variable) => (
											<Button
												key={variable.id}
												variant="ghost"
												className="w-full justify-start h-auto p-2 text-left"
												onClick={() => handleVariableClick(variable)}
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-xs font-medium truncate">{variable.displayName}</span>
														<Badge variant="outline" className="text-xs px-1 py-0">
															{variable.chave}
														</Badge>
													</div>
													<div className="text-xs text-muted-foreground truncate">{variable.descricao}</div>
													<div className="text-xs text-muted-foreground mt-1 font-mono bg-muted px-1 rounded">
														{variable.valor}
													</div>
												</div>
											</Button>
										))}
									</>
								)}

								{/* Separador */}
								{selectedType === "all" && groupedVariables.normal.length > 0 && groupedVariables.lote.length > 0 && (
									<Separator className="my-2" />
								)}

								{/* Lote Ativo */}
								{(selectedType === "all" || selectedType === "lote") && groupedVariables.lote.length > 0 && (
									<>
										<div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
											<Package className="h-3 w-3" />
											Lote MTF Diamante
										</div>
										{groupedVariables.lote.map((variable) => (
											<Button
												key={variable.id}
												variant="ghost"
												className="w-full justify-start h-auto p-2 text-left"
												onClick={() => handleVariableClick(variable)}
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-xs font-medium truncate">{variable.displayName}</span>
														<Badge variant={variable.isActive ? "default" : "secondary"} className="text-xs px-1 py-0">
															{variable.isActive ? "Ativo" : "Inativo"}
														</Badge>
													</div>
													<div className="text-xs text-muted-foreground truncate">{variable.descricao}</div>
													{variable.loteData ? (
														<div className="text-xs text-muted-foreground mt-1 space-y-0.5">
															<div>
																Valor: <span className="font-mono">{variable.loteData.valor}</span>
															</div>
															<div className="text-xs opacity-75">
																{new Date(variable.loteData.dataInicio).toLocaleDateString("pt-BR")} -{" "}
																{new Date(variable.loteData.dataFim).toLocaleDateString("pt-BR")}
															</div>
														</div>
													) : (
														<div className="text-xs text-muted-foreground mt-1 italic">
															Configure um lote ativo para usar esta variável
														</div>
													)}
												</div>
											</Button>
										))}
									</>
								)}

								{/* Mensagem quando não há variáveis */}
								{groupedVariables.special.length === 0 &&
									groupedVariables.normal.length === 0 &&
									groupedVariables.lote.length === 0 && (
										<div className="p-4 text-center text-sm text-muted-foreground">Nenhuma variável encontrada</div>
									)}
							</div>
						)}
					</ScrollArea>

					{/* Footer com informações */}
					<div className="border-t p-2">
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							<Info className="h-3 w-3" />
							<span>Clique para inserir a variável no texto</span>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
