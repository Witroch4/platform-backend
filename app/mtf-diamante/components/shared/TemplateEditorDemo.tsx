"use client";

import type React from "react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Eye, Code } from "lucide-react";
import { TemplateFields } from "./TemplateFieldComponents";
import { useTemplateValidation } from "../../hooks/useTemplateValidation";

interface MtfDiamanteVariavel {
	id?: string;
	chave: string;
	valor: string;
}

// Process WhatsApp formatting (bold, italic, strikethrough, etc.)
const processWhatsAppFormatting = (text: string): string => {
	if (!text) return text;

	return text
		.replace(/\*(.*?)\*/g, "<strong>$1</strong>")
		.replace(/_(.*?)_/g, "<em>$1</em>")
		.replace(/~(.*?)~/g, "<del>$1</del>")
		.replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">$1</code>')
		.replace(
			/^> (.+)$/gm,
			'<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400">$1</blockquote>',
		)
		.replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
		.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
		.replace(/\n/g, "<br>");
};

// Mock variables for demonstration
const mockVariables: MtfDiamanteVariavel[] = [
	{ id: "1", chave: "nome", valor: "João Silva" },
	{ id: "2", chave: "protocolo_oab", valor: "ABC123456" },
	{ id: "3", chave: "chave_pix", valor: "12345678901" },
	{ id: "4", chave: "nome_do_escritorio_rodape", valor: "Escritório Silva & Associados" },
	{ id: "5", chave: "valor_honorarios", valor: "R$ 2.500,00" },
	{ id: "6", chave: "data_vencimento", valor: "15/02/2024" },
];

export const TemplateEditorDemo: React.FC = () => {
	const [headerType, setHeaderType] = useState<"TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "NONE">("TEXT");
	const [headerText, setHeaderText] = useState("Olá {{nome}}, temos uma atualização importante!");
	const [bodyText, setBodyText] = useState(`Prezado(a) {{nome}},

Seu protocolo {{protocolo_oab}} foi processado com sucesso.

Valor dos honorários: {{valor_honorarios}}
Data de vencimento: {{data_vencimento}}

Para pagamento via PIX, utilize a chave: {{chave_pix}}

Atenciosamente,`);
	const [footerText, setFooterText] = useState("{{nome_do_escritorio_rodape}}");
	const [previewMode, setPreviewMode] = useState<"numbered" | "actual">("numbered");

	const { validation, getPreviewText, getMetaConversion, getVariableStats, isValid, errors } = useTemplateValidation({
		headerText,
		bodyText,
		footerText,
		variables: mockVariables,
		headerType,
	});

	const handleValidationChange = (field: "header" | "body" | "footer", isValid: boolean, errors: string[]) => {
		console.log(`${field} validation:`, { isValid, errors });
	};

	const handlePreviewModeToggle = () => {
		setPreviewMode((prev) => (prev === "numbered" ? "actual" : "numbered"));
	};

	const getCompletePreview = () => {
		const parts = [];

		if (headerType === "TEXT" && headerText) {
			parts.push(getPreviewText(headerText, previewMode));
		}

		if (bodyText) {
			parts.push(getPreviewText(bodyText, previewMode));
		}

		if (footerText) {
			parts.push(getPreviewText(footerText, previewMode));
		}

		return parts.join("\n\n");
	};

	const getMetaApiPayload = () => {
		const components = [];

		if (headerType === "TEXT" && headerText) {
			const headerConversion = getMetaConversion(headerText);
			components.push({
				type: "HEADER",
				format: "TEXT",
				text: headerConversion.convertedText,
				...(headerConversion.parameterArray.length > 0 && {
					example: { header_text: [headerConversion.parameterArray] },
				}),
			});
		}

		if (bodyText) {
			const bodyConversion = getMetaConversion(bodyText);
			components.push({
				type: "BODY",
				text: bodyConversion.convertedText,
				...(bodyConversion.parameterArray.length > 0 && {
					example: { body_text: [bodyConversion.parameterArray] },
				}),
			});
		}

		if (footerText) {
			components.push({
				type: "FOOTER",
				text: getMetaConversion(footerText).convertedText,
			});
		}

		return {
			name: "exemplo_template",
			category: "MARKETING",
			language: "pt_BR",
			components,
		};
	};

	return (
		<div className="container mx-auto py-6 max-w-7xl">
			<div className="mb-6">
				<h1 className="text-2xl font-bold mb-2">Editor de Template Avançado</h1>
				<p className="text-muted-foreground">
					Demonstração dos componentes de texto aprimorados com suporte a variáveis, validação e pré-visualização em
					tempo real.
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Editor Section */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								Editor de Template
								{isValid ? (
									<Badge variant="default" className="bg-green-500">
										<CheckCircle className="h-3 w-3 mr-1" />
										Válido
									</Badge>
								) : (
									<Badge variant="destructive">
										<AlertCircle className="h-3 w-3 mr-1" />
										Inválido
									</Badge>
								)}
							</CardTitle>
							<CardDescription>
								Use o menu de contexto (clique direito) nos campos de texto para inserir variáveis.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{/* Header Type Selector */}
							<div className="mb-4">
								<label className="text-sm font-medium mb-2 block">Tipo de Cabeçalho</label>
								<div className="flex gap-2">
									{(["NONE", "TEXT", "IMAGE", "VIDEO"] as const).map((type) => (
										<Button
											key={type}
											variant={headerType === type ? "default" : "outline"}
											onClick={() => setHeaderType(type)}
										>
											{type === "NONE" ? "Nenhum" : type}
										</Button>
									))}
								</div>
							</div>

							{/* Template Fields */}
							<TemplateFields
								headerType={headerType}
								headerValue={headerText}
								onHeaderChange={setHeaderText}
								bodyValue={bodyText}
								onBodyChange={setBodyText}
								footerValue={footerText}
								onFooterChange={setFooterText}
								variables={mockVariables}
								showPreview={false}
								previewMode={previewMode}
								autoPopulateFooter={true}
								onValidationChange={handleValidationChange}
							/>

							{/* Validation Errors */}
							{!isValid && (
								<Alert variant="destructive" className="mt-4">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>
										<div className="space-y-1">
											<div className="font-medium">Erros de validação:</div>
											{errors.map((error, index) => (
												<div key={index} className="text-sm">
													• {error}
												</div>
											))}
										</div>
									</AlertDescription>
								</Alert>
							)}
						</CardContent>
					</Card>

					{/* Variable Statistics */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Estatísticas de Variáveis</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-3 gap-4">
								{[
									{ label: "Cabeçalho", text: headerText },
									{ label: "Corpo", text: bodyText },
									{ label: "Rodapé", text: footerText },
								].map(({ label, text }) => {
									const stats = getVariableStats(text);
									return (
										<div key={label} className="text-center">
											<div className="text-2xl font-bold text-primary">{stats.totalVariables}</div>
											<div className="text-sm text-muted-foreground">{label}</div>
											{stats.uniqueVariables !== stats.totalVariables && (
												<div className="text-xs text-muted-foreground">({stats.uniqueVariables} únicas)</div>
											)}
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Preview Section */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center justify-between">
								<span className="flex items-center gap-2">
									<Eye className="h-4 w-4" />
									Pré-visualização
								</span>
								<Button variant="outline" onClick={handlePreviewModeToggle}>
									{previewMode === "numbered" ? "Mostrar Valores Reais" : "Mostrar Formato Numerado"}
								</Button>
							</CardTitle>
							<CardDescription>
								{previewMode === "numbered"
									? "Visualização com variáveis numeradas (formato Meta API)"
									: "Visualização com valores reais das variáveis"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="bg-gradient-to-b from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border">
								<div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
									<div
										className="text-sm"
										dangerouslySetInnerHTML={{
											__html: processWhatsAppFormatting(
												getCompletePreview() || "Digite o conteúdo do template para ver a pré-visualização...",
											),
										}}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Meta API Payload */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Code className="h-4 w-4" />
								Payload Meta API
							</CardTitle>
							<CardDescription>Estrutura JSON que será enviada para a API do WhatsApp Business</CardDescription>
						</CardHeader>
						<CardContent>
							<Tabs defaultValue="formatted" className="w-full">
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="formatted">Formatado</TabsTrigger>
									<TabsTrigger value="raw">JSON Bruto</TabsTrigger>
								</TabsList>
								<TabsContent value="formatted" className="space-y-2">
									<div className="bg-muted rounded-lg p-4 text-sm font-mono">
										<pre className="whitespace-pre-wrap">{JSON.stringify(getMetaApiPayload(), null, 2)}</pre>
									</div>
								</TabsContent>
								<TabsContent value="raw" className="space-y-2">
									<div className="bg-muted rounded-lg p-4 text-sm font-mono break-all">
										{JSON.stringify(getMetaApiPayload())}
									</div>
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};

export default TemplateEditorDemo;
