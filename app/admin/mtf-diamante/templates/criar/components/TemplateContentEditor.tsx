import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WhatsAppTextEditor } from "@/app/admin/mtf-diamante/components/shared/WhatsAppTextEditor";
import { ButtonEditor } from "./ButtonEditor";
import { HeaderEditor } from "./HeaderEditor";
import { useMtfData } from "@/app/admin/mtf-diamante/context/SwrProvider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo } from "react";
import { extractVariables } from "@/lib/whatsapp/variable-utils";

interface ContentEditorProps {
	formState: any; // Idealmente, use um tipo mais específico
	onStateChange: (field: string, value: any) => void;
	onButtonChange: (buttons: any[]) => void;
}

export const TemplateContentEditor = ({ formState, onStateChange, onButtonChange }: ContentEditorProps) => {
	const { variaveis, loadingVariaveis } = useMtfData();

	// Mapear variáveis do sistema por chave para autofill do exemplo
	const systemVarsMap = useMemo(() => {
		const map: Record<string, string> = {};
		for (const v of variaveis || []) {
			map[v.chave] = v.valor;
		}
		return map;
	}, [variaveis]);

	// Sincronizar exemplos nomeados a partir do texto do corpo e das variáveis do sistema
	useEffect(() => {
		const names = extractVariables(formState.bodyText).map((v) => v.replace(/\{|\}/g, ""));
		if (names.length === 0) {
			if (formState.bodyNamedExamples && Object.keys(formState.bodyNamedExamples).length > 0) {
				onStateChange("bodyNamedExamples", {});
			}
			return;
		}
		const next: Record<string, string> = { ...(formState.bodyNamedExamples || {}) };
		let changed = false;
		// Remover chaves que não existem mais
		for (const k of Object.keys(next)) {
			if (!names.includes(k)) {
				delete next[k];
				changed = true;
			}
		}
		// Preencher variáveis do sistema automaticamente, manter vazias as demais
		for (const name of names) {
			if (!(name in next)) {
				next[name] = systemVarsMap[name] ?? "";
				changed = true;
			}
		}
		if (changed) onStateChange("bodyNamedExamples", next);
	}, [formState.bodyText, systemVarsMap]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Conteúdo do Template</CardTitle>
				<CardDescription>Defina o conteúdo e a estrutura do template.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<HeaderEditor
					headerType={formState.headerType}
					headerText={formState.headerText}
					headerExample={formState.headerExample}
					headerMetaMedia={formState.headerMetaMedia}
					headerNamedExamples={formState.headerNamedExamples}
					onStateChange={onStateChange}
					variaveis={variaveis}
					loadingVariaveis={loadingVariaveis}
				/>

				<div>
					<label className="text-sm font-medium">
						Corpo <span className="text-red-500">*</span>
					</label>
					<p className="text-xs text-muted-foreground mb-2">
						Texto principal. Use placeholders nomeados: {"{{nome}}"}.
					</p>
					<WhatsAppTextEditor
						inline
						showPreview={false}
						initialText={formState.bodyText}
						onSave={(text) => onStateChange("bodyText", text)}
						onChange={(text) => onStateChange("bodyText", text)}
						placeholder="Texto principal da mensagem"
						maxLength={1024}
						variables={loadingVariaveis ? [] : variaveis}
						accountId="mtf-diamante"
					/>
				</div>

				{/* Exemplos de variáveis nomeadas (obrigatórios pela Meta quando há placeholders) */}
				{extractVariables(formState.bodyText).length > 0 && (
					<div>
						<label className="text-sm font-medium">Exemplo de conteúdo do corpo</label>
						<p className="text-xs text-muted-foreground mb-2">
							Para nos ajudar a analisar seu modelo, inclua um exemplo para cada variável nomeada no corpo do texto.
						</p>
						<div className="space-y-2">
							{extractVariables(formState.bodyText)
								.map((v) => v.replace(/\{|\}/g, ""))
								.map((name) => (
									<div key={name} className="flex items-center gap-2">
										<div className="w-56 text-xs text-muted-foreground">{`{{${name}}}`}</div>
										<Input
											value={formState.bodyNamedExamples?.[name] ?? ""}
											onChange={(e) =>
												onStateChange("bodyNamedExamples", {
													...(formState.bodyNamedExamples || {}),
													[name]: e.target.value,
												})
											}
											placeholder={`Insira conteúdo para {{${name}}}`}
											className="h-8"
										/>
									</div>
								))}
						</div>
					</div>
				)}

				<div>
					<label className="text-sm font-medium">Rodapé (Opcional)</label>
					<p className="text-xs text-muted-foreground mb-2">Texto adicional no final da mensagem.</p>
					<Input
						value={formState.footerText}
						onChange={(e) => onStateChange("footerText", e.target.value)}
						placeholder="Texto do rodapé..."
						maxLength={60}
						disabled={loadingVariaveis}
					/>
					<div className="flex justify-between items-center text-xs mt-1">
						<div className="text-muted-foreground">Normalmente usado para avisos ou informações adicionais</div>
						<Badge variant={formState.footerText.length > 60 * 0.8 ? "destructive" : "outline"}>
							{formState.footerText.length}/60
						</Badge>
					</div>
				</div>

				<ButtonEditor buttons={formState.buttons} setButtons={onButtonChange} />
			</CardContent>
		</Card>
	);
};
