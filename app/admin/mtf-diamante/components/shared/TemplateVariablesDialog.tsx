"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Variable, AlertCircle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { VariableContextMenu } from "./VariableContextMenu";

interface TemplateVariable {
	index: number;
	placeholder: string;
	exampleValue: string;
	customValue?: string;
}

interface TemplateVariablesDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (variables: Record<string, string>) => void;
	templateId: string;
	templateName: string;
	components: any;
	accountId: string;
}

export const TemplateVariablesDialog: React.FC<TemplateVariablesDialogProps> = ({
	isOpen,
	onClose,
	onSave,
	templateId,
	templateName,
	components,
	accountId,
}) => {
	const [variables, setVariables] = useState<TemplateVariable[]>([]);
	const [showVariableMenu, setShowVariableMenu] = useState(false);
	const [variableMenuPosition, setVariableMenuPosition] = useState({ x: 0, y: 0 });
	const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null); // posição no array

	// Extrair variáveis do template
	useEffect(() => {
		if (!components || !isOpen) return;

		const extractedVariables: TemplateVariable[] = [];

		// Normalizar components (array ou objeto indexado)
		const list: any[] = Array.isArray(components)
			? components
			: components && typeof components === "object"
				? Object.keys(components)
						.filter((k) => /^\d+$/.test(k))
						.sort((a, b) => Number(a) - Number(b))
						.map((k) => components[k])
				: [];

		// Procurar por botão COPY_CODE para permitir configuração do cupom/código
		const buttonsComponent = list.find((comp: any) => comp.type === "BUTTONS");
		if (buttonsComponent && Array.isArray(buttonsComponent.buttons)) {
			const copyBtn = buttonsComponent.buttons.find((b: any) => String(b?.type || "").toUpperCase() === "COPY_CODE");
			if (copyBtn) {
				const exampleCoupon = Array.isArray(copyBtn.example) ? copyBtn.example[0] : "";
				extractedVariables.push({
					index: 0, // índice simbólico (não usado pela Meta), usamos chave dedicada abaixo
					placeholder: "{{coupon_code}}",
					exampleValue: exampleCoupon || "",
					customValue: exampleCoupon || "",
				});
			}
		}

		// Procurar por variáveis no componente BODY
		const bodyComponent = list.find((comp: any) => comp.type === "BODY");
		if (bodyComponent && bodyComponent.text) {
			// Suporta placeholders numéricos e nomeados
			const variableMatches = bodyComponent.text.match(/\{\{([^}]+)\}\}/g);
			if (variableMatches) {
				variableMatches.forEach((match: string, index: number) => {
					const raw = match.replace(/[{}]/g, "").trim();
					const isNumber = /^\d+$/.test(raw);
					const variableIndex = isNumber ? parseInt(raw) : index; // usa índice sequencial para nomeadas

					// Buscar valor de exemplo
					let exampleValue = "";
					if (bodyComponent.example) {
						if (Array.isArray(bodyComponent.example.body_text?.[0])) {
							exampleValue = bodyComponent.example.body_text[0][index] || "";
						}
						// Named params
						if (!exampleValue && Array.isArray(bodyComponent.example.body_text_named_params)) {
							const named = bodyComponent.example.body_text_named_params.find((p: any) => p?.param_name === raw);
							exampleValue = named?.example || "";
						}
					}

					extractedVariables.push({
						index: variableIndex,
						placeholder: match,
						exampleValue,
						customValue: exampleValue, // Inicializar com o valor de exemplo
					});
				});
			}
		}

		// Procurar por variáveis no componente HEADER (se for texto)
		const headerComponent = list.find((comp: any) => comp.type === "HEADER" && comp.format === "TEXT");
		if (headerComponent && headerComponent.text) {
			const variableMatches = headerComponent.text.match(/\{\{([^}]+)\}\}/g);
			if (variableMatches) {
				variableMatches.forEach((match: string, index: number) => {
					const raw = match.replace(/[{}]/g, "").trim();
					const isNumber = /^\d+$/.test(raw);
					const variableIndex = isNumber ? parseInt(raw) : index;

					// Buscar valor de exemplo
					let exampleValue = "";
					if (headerComponent.example) {
						if (Array.isArray(headerComponent.example.header_text?.[0])) {
							exampleValue = headerComponent.example.header_text[0][index] || "";
						}
						if (!exampleValue && Array.isArray(headerComponent.example.header_text_named_params)) {
							const named = headerComponent.example.header_text_named_params.find((p: any) => p?.param_name === raw);
							exampleValue = named?.example || "";
						}
					}

					// Verificar se já não existe uma variável com o mesmo placeholder
					if (!extractedVariables.find((v) => v.placeholder === match)) {
						extractedVariables.push({
							index: variableIndex,
							placeholder: match,
							exampleValue,
							customValue: exampleValue,
						});
					}
				});
			}
		}

		// Ordenar por índice
		extractedVariables.sort((a, b) => a.index - b.index);
		setVariables(extractedVariables);
	}, [components, isOpen]);

	const handleVariableChangeAt = (position: number, value: string) => {
		setVariables((prev) =>
			prev.map((variable, i) => (i === position ? { ...variable, customValue: value } : variable)),
		);
	};

	const handleSave = () => {
		// Criar objeto com as variáveis customizadas
		const customVariables: Record<string, string> = {};

		// Tratar campo especial de cupom quando presente
		const couponVar = variables.find((v) => v.placeholder === "{{coupon_code}}");
		if (couponVar && typeof couponVar.customValue === "string" && couponVar.customValue.trim().length > 0) {
			customVariables["coupon_code"] = couponVar.customValue.trim();
		}

		variables.forEach((variable, position) => {
			// Ignorar a pseudo-variável de cupom aqui (já tratada acima)
			if (variable.placeholder === "{{coupon_code}}") return;
			const raw = variable.placeholder.replace(/[{}]/g, "").trim();
			const isNumeric = /^\d+$/.test(raw);
			const value = (variable.customValue ?? "").trim();
			if (!value) return;

			// Sempre salvar por segurança a chave sequencial anterior
			customVariables[`variavel_${position}`] = value;

			// Se for named param, salvar também pela chave com nome
			if (!isNumeric) {
				customVariables[raw] = value;
			}
		});

		onSave(customVariables);
		onClose();
		toast.success("Variáveis do template configuradas com sucesso!");
	};

	const handleVariableMenuOpen = (event: React.MouseEvent, position: number) => {
		event.preventDefault();
		setVariableMenuPosition({ x: event.clientX, y: event.clientY });
		setActiveInputIndex(position);
		setShowVariableMenu(true);
	};

	const handleVariableInsert = (text: string) => {
		if (activeInputIndex !== null) {
			setVariables((prev) =>
				prev.map((v, i) => (i === activeInputIndex ? { ...v, customValue: (v.customValue || "") + text } : v)),
			);
		}
		setShowVariableMenu(false);
		setActiveInputIndex(null);
	};

	const hasChanges = variables.some((v) => v.customValue !== v.exampleValue);

	return (
		<>
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh] overflow-hidden">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Variable className="h-5 w-5" />
							Configurar Variáveis do Template
						</DialogTitle>
						<DialogDescription>
							Configure os valores das variáveis para o template "{templateName}". Os valores de exemplo da Meta serão
							usados quando não houver valores customizados.
						</DialogDescription>
					</DialogHeader>

					<ScrollArea className="flex-1 pr-4 h-[58vh] sm:h-[62vh]">
						<div className="space-y-4">
							{variables.length === 0 ? (
								<Card>
									<CardContent className="pt-6">
										<div className="text-center text-muted-foreground">
											<CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
											<p>Este template não possui variáveis configuráveis.</p>
										</div>
									</CardContent>
								</Card>
							) : (
								<>
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<AlertCircle className="h-4 w-4" />
										<span>Clique com o botão direito nos campos para inserir variáveis do sistema</span>
									</div>

									{/* Removido: checkbox Resolver Dinamicamente */}

									{variables.map((variable, position) => (
										<Card key={`${variable.placeholder}-${position}`}>
											<CardHeader className="pb-3">
												<CardTitle className="text-sm flex items-center gap-2">
													<Badge variant="outline">Variável {position + 1}</Badge>
													<code className="text-xs bg-muted px-2 py-1 rounded">{variable.placeholder}</code>
												</CardTitle>
											</CardHeader>
											<CardContent className="space-y-3">
												<div>
													<Label className="text-xs text-muted-foreground">Valor de Exemplo (Meta)</Label>
													<div className="mt-1 p-2 bg-muted rounded text-sm font-mono">
														{variable.exampleValue || "Sem exemplo definido"}
													</div>
												</div>

												<div>
													<Label htmlFor={`variable-${variable.index}`} className="text-sm">
														Valor Customizado
													</Label>
													{(() => {
														const isCoupon = variable.placeholder === "{{coupon_code}}";
														const currentValue = variable.customValue || "";
														const maxLen = isCoupon ? 15 : undefined;
														return (
															<div>
																<Textarea
																	id={`variable-${position}`}
																	value={currentValue}
																	onChange={(e) => {
																		const next = isCoupon ? e.target.value.slice(0, 15) : e.target.value;
																		handleVariableChangeAt(position, next);
																	}}
																	onContextMenu={(e) => handleVariableMenuOpen(e, position)}
																	placeholder="Digite o valor customizado ou clique com botão direito para inserir variáveis"
																	className="mt-1 min-h-[60px]"
																	maxLength={maxLen as number | undefined}
																/>
																{isCoupon && (
																	<div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
																		<span>Máx. 15 caracteres</span>
																		<span>{currentValue.length}/15</span>
																	</div>
																)}
															</div>
														);
													})()}
													<p className="text-xs text-muted-foreground mt-1">
														Se vazio, será usado o valor de exemplo da Meta
													</p>
												</div>

												{variable.customValue !== variable.exampleValue && (
													<div className="flex items-center gap-2 text-xs text-green-600">
														<CheckCircle2 className="h-3 w-3" />
														<span>Valor customizado será usado</span>
													</div>
												)}
											</CardContent>
										</Card>
									))}
								</>
							)}
						</div>
					</ScrollArea>

					<DialogFooter className="gap-2">
						<Button variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<Button onClick={handleSave} disabled={variables.length === 0}>
							{hasChanges ? "Salvar Configurações" : "Usar Valores Padrão"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Menu de Variáveis */}
			<VariableContextMenu
				accountId={accountId}
				isOpen={showVariableMenu}
				onClose={() => {
					setShowVariableMenu(false);
					setActiveInputIndex(null);
				}}
				onInsert={handleVariableInsert}
				position={variableMenuPosition}
			/>
		</>
	);
};
