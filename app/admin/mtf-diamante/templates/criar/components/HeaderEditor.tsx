import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedTextArea } from "@/app/admin/mtf-diamante/components/EnhancedTextArea";
import MetaMediaUpload, { type MetaMediaFile } from "@/components/custom/MetaMediaUpload";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { extractVariables } from "@/lib/whatsapp/variable-utils";

interface HeaderEditorProps {
	headerType: string;
	headerText: string;
	headerExample: string;
	headerMetaMedia: any[];
	headerNamedExamples?: Record<string, string>;
	onStateChange: (field: string, value: any) => void;
	variaveis: any[];
	isLoadingVariaveis: boolean;
}

export const HeaderEditor = ({
	headerType,
	headerText,
	headerExample,
	headerMetaMedia,
	headerNamedExamples,
	onStateChange,
	variaveis,
	isLoadingVariaveis,
}: HeaderEditorProps) => {
	const handleHeaderTypeChange = (value: any) => {
		if (value !== headerType) {
			onStateChange("headerMetaMedia", []);
		}
		onStateChange("headerType", value);
	};

	const ensureArray = (val: unknown): MetaMediaFile[] => (Array.isArray(val) ? (val as MetaMediaFile[]) : []);

	const arraysEqualShallow = (a: MetaMediaFile[], b: MetaMediaFile[]) => {
		if (a === b) return true;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (
				a[i]?.id !== b[i]?.id ||
				a[i]?.status !== b[i]?.status ||
				a[i]?.mediaHandle !== b[i]?.mediaHandle ||
				a[i]?.url !== b[i]?.url
			) {
				return false;
			}
		}
		return true;
	};

	// Estado local para preservar as atualizações funcionais do MetaMediaUpload
	const [localFiles, setLocalFiles] = useState<MetaMediaFile[]>(() => ensureArray(headerMetaMedia));

	// Quando o pai mudar (ex.: reset), sincronizar local se houver diferença
	useEffect(() => {
		const incoming = ensureArray(headerMetaMedia);
		if (!arraysEqualShallow(localFiles, incoming)) {
			setLocalFiles(incoming);
		}
	}, [headerMetaMedia]);

	// Propagar alterações locais para o pai apenas quando houver diferença
	useEffect(() => {
		const parent = ensureArray(headerMetaMedia);
		if (!arraysEqualShallow(localFiles, parent)) {
			onStateChange("headerMetaMedia", localFiles as any);
		}
	}, [localFiles]);

	// Quantidade de variáveis no header
	const headerVarCount = useMemo(() => extractVariables(headerText).length, [headerText]);

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">Cabeçalho (Opcional)</h3>
			<Select value={headerType} onValueChange={handleHeaderTypeChange}>
				<SelectTrigger>
					<SelectValue placeholder="Tipo de cabeçalho" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="NONE">Sem cabeçalho</SelectItem>
					<SelectItem value="TEXT">Texto</SelectItem>
					<SelectItem value="IMAGE">Imagem</SelectItem>
					<SelectItem value="DOCUMENT">Documento</SelectItem>
					<SelectItem value="VIDEO">Vídeo</SelectItem>
				</SelectContent>
			</Select>

			{headerType === "TEXT" && (
				<div className="mt-2">
					<EnhancedTextArea
						value={headerText}
						onChange={(value) => onStateChange("headerText", value)}
						variables={variaveis}
						placeholder="Texto do cabeçalho"
						maxLength={60}
						label="Texto do cabeçalho"
						disabled={isLoadingVariaveis}
					/>
					<div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
						<span>Variáveis no cabeçalho: {headerVarCount}/1</span>
					</div>
					{headerVarCount > 1 && (
						<Alert variant="destructive" className="mt-2">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>O cabeçalho de texto suporta no máximo 1 variável.</AlertTitle>
						</Alert>
					)}
					{/* Exemplos nomeados para o cabeçalho quando houver placeholders */}
					{extractVariables(headerText).length > 0 && (
						<div className="mt-3 space-y-2">
							<div className="text-xs text-muted-foreground">
								Exemplos para variáveis do cabeçalho (sempre nomeadas)
							</div>
							{extractVariables(headerText)
								.map((v) => v.replace(/\{|\}/g, ""))
								.map((name) => (
									<div key={name} className="flex items-center gap-2">
										<div className="w-56 text-xs text-muted-foreground">{`{{${name}}}`}</div>
										<Input
											value={headerNamedExamples?.[name] ?? ""}
											onChange={(e) =>
												onStateChange("headerNamedExamples", {
													...(headerNamedExamples || {}),
													[name]: e.target.value,
												})
											}
											placeholder={`Exemplo para {{${name}}}`}
											className="h-8"
										/>
									</div>
								))}
						</div>
					)}
				</div>
			)}

			{headerType === "IMAGE" && (
				<div className="mt-4">
					<Label>Imagem do Cabeçalho</Label>
					<MetaMediaUpload
						key={`header-upload-${headerType}`}
						uploadedFiles={localFiles}
						setUploadedFiles={setLocalFiles}
						allowedTypes={["image/jpeg", "image/png"]}
						maxSizeMB={5}
						maxFiles={1}
					/>
					{localFiles.length === 0 && (
						<Alert variant="destructive" className="mt-2">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Imagem obrigatória</AlertTitle>
						</Alert>
					)}
				</div>
			)}

			{headerType === "VIDEO" && (
				<div className="mt-4">
					<Label>Vídeo do Cabeçalho</Label>
					<MetaMediaUpload
						key={`header-upload-${headerType}`}
						uploadedFiles={localFiles}
						setUploadedFiles={setLocalFiles}
						allowedTypes={["video/mp4"]}
						maxSizeMB={16}
						maxFiles={1}
						title="Upload de Vídeo para API Meta"
						description="Faça upload de vídeos (MP4) para usar como cabeçalho do template"
					/>
					{localFiles.length === 0 && (
						<Alert variant="destructive" className="mt-2">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Vídeo obrigatório</AlertTitle>
						</Alert>
					)}
				</div>
			)}

			{headerType === "DOCUMENT" && (
				<div className="mt-4">
					<Label>Documento do Cabeçalho</Label>
					<MetaMediaUpload
						key={`header-upload-${headerType}`}
						uploadedFiles={localFiles}
						setUploadedFiles={setLocalFiles}
						allowedTypes={["application/pdf"]}
						maxSizeMB={16}
						maxFiles={1}
						title="Upload de Documento para API Meta"
						description="Faça upload de documentos (PDF) para usar como cabeçalho do template"
					/>
					{localFiles.length === 0 && (
						<Alert variant="destructive" className="mt-2">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Documento obrigatório</AlertTitle>
						</Alert>
					)}
				</div>
			)}
		</div>
	);
};
