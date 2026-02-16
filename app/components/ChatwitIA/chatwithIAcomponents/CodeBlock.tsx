"use client";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

interface CodeBlockProps {
	language: string;
	value: string;
}

export const detectLanguage = (language: string, value: string) => {
	if (language) return language;
	if (value.includes("import ") && value.includes("from ") && value.includes("def ")) return "python";
	if (value.includes("function") && (value.includes("=>") || value.includes("{"))) return "javascript";
	if (value.includes("class ") && value.includes("extends ")) return "typescript";
	if (value.includes("#include") && value.includes("int main")) return "cpp";
	if (value.includes("<?php")) return "php";
	if (value.includes("<html>") || value.includes("<!DOCTYPE html>")) return "html";
	if (value.includes("@media") || value.includes(".class {")) return "css";
	if (value.trim().startsWith("SELECT")) return "sql";
	return "";
};

export const CodeBlock = ({ language, value }: CodeBlockProps) => {
	const [hasCopied, setHasCopied] = useState(false);
	const { theme } = useTheme();
	const detectedLanguage = detectLanguage(language, value);
	const displayLanguage = detectedLanguage || "text";

	const copyToClipboard = () => {
		navigator.clipboard.writeText(value).then(() => {
			setHasCopied(true);
			setTimeout(() => {
				setHasCopied(false);
			}, 2000);
		});
	};

	const isDark = theme === "dark";

	return (
		<div className="relative group my-4">
			<div className="bg-muted/30 border border-border rounded-lg overflow-hidden">
				{/* Header do bloco de código */}
				<div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
					<span className="text-xs font-medium text-muted-foreground">{displayLanguage}</span>
					<Button
						onClick={copyToClipboard}
						variant="ghost"
						className="h-7 px-2 text-xs hover:bg-muted-foreground/10 transition-all duration-200"
					>
						{hasCopied ? (
							<>
								<Check className="h-3 w-3 text-green-500 mr-1" />
								<span className="text-green-500">Copiado</span>
							</>
						) : (
							<>
								<ClipboardCopy className="h-3 w-3 mr-1" />
								<span>Copiar código</span>
							</>
						)}
					</Button>
				</div>

				{/* Conteúdo do código */}
				<SyntaxHighlighter
					style={isDark ? oneDark : oneLight}
					language={detectedLanguage || "text"}
					PreTag="div"
					customStyle={{
						margin: 0,
						borderRadius: 0,
						padding: "1rem",
						fontSize: "0.875rem",
						lineHeight: "1.5",
						background: "transparent",
						fontFamily:
							'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
					}}
					codeTagProps={{
						style: {
							fontFamily:
								'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
						},
					}}
				>
					{value}
				</SyntaxHighlighter>
			</div>
		</div>
	);
};

export default CodeBlock;
