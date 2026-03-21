"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Save, X, Variable, AlertCircle } from "lucide-react";
import { VariableContextMenu } from "./VariableContextMenu";

interface MtfDiamanteVariavel {
	id?: string;
	chave: string;
	valor: string;
}

interface WhatsAppTextEditorProps {
	onSave: (text: string) => void;
	onClose?: () => void;
	initialText?: string;
	placeholder?: string;
	variables?: MtfDiamanteVariavel[];
	maxLength?: number;
	showPreview?: boolean;
	inline?: boolean;
	className?: string;
	onChange?: (text: string) => void;
	accountId?: string;
}

export function WhatsAppTextEditor({
	onSave,
	onClose,
	initialText = "",
	placeholder = "Digite sua mensagem...",
	variables = [],
	maxLength = 1000,
	showPreview = true,
	inline = false,
	className = "",
	onChange,
	accountId = "mtf-diamante",
}: WhatsAppTextEditorProps) {
	const [text, setText] = useState(initialText);
	const [errors, setErrors] = useState<string[]>([]);
	const [showVariableMenu, setShowVariableMenu] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Character count and validation
	const characterCount = text.length;
	const isOverLimit = maxLength && characterCount > maxLength;
	const isNearLimit = maxLength && characterCount > maxLength * 0.8;

	// Update text and trigger onChange
	const updateText = useCallback(
		(newText: string) => {
			// Truncate text if it exceeds maxLength
			const truncatedText = maxLength ? newText.slice(0, maxLength) : newText;

			setText(truncatedText);
			onChange?.(truncatedText);

			// Validate text
			const newErrors: string[] = [];
			if (maxLength && newText.length > maxLength) {
				newErrors.push(`Texto excede o limite de ${maxLength} caracteres`);
			}
			setErrors(newErrors);
		},
		[onChange, maxLength],
	);

	// Initialize/sync text only when initialText changes.
	// Importante: não chamar onChange aqui para evitar loops com o pai.
	useEffect(() => {
		// Log inicialização apenas em desenvolvimento
		if (process.env.NODE_ENV === "development") {
			console.log("🔍 [WhatsAppTextEditor] Inicializando com:", {
				initialText,
				currentText: text,
				maxLength,
				willSet: maxLength ? initialText.slice(0, maxLength) : initialText,
			});
		}

		const truncated = maxLength ? initialText.slice(0, maxLength) : initialText;
		setText(truncated);
		const newErrors: string[] = [];
		if (maxLength && initialText.length > maxLength) {
			newErrors.push(`Texto excede o limite de ${maxLength} caracteres`);
		}
		setErrors(newErrors);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialText, maxLength]);

	// Auto-close placeholder when typing "{{" → inserts "}}" and places cursor in the middle
	const handleCurlyBraces = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key !== "{") return;
			const textarea = textareaRef.current;
			if (!textarea) return;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const prevChar = text.substring(0, start).slice(-1);
			if (prevChar === "{") {
				e.preventDefault();
				const insert = "{}}";
				const newText = text.substring(0, start) + insert + text.substring(end);
				updateText(newText);
				setTimeout(() => {
					textarea.focus();
					const caret = Math.min(start + 1, (maxLength || Infinity) as number);
					textarea.setSelectionRange(caret, caret);
				}, 0);
			}
		},
		[text, updateText, maxLength],
	);

	// Variable insertion handler
	const handleVariableInsert = useCallback(
		(variable: string, position?: number) => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const insertPosition = position !== undefined ? position : textarea.selectionStart;
			const newText = text.substring(0, insertPosition) + variable + text.substring(insertPosition);

			updateText(newText);

			// Position cursor after inserted variable (respecting maxLength)
			setTimeout(() => {
				textarea.focus();
				const finalLength = Math.min(insertPosition + variable.length, maxLength || Infinity);
				textarea.setSelectionRange(finalLength, finalLength);
			}, 0);
		},
		[text, updateText, maxLength],
	);

	// Handle right-click context menu
	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setMenuPosition({ x: e.clientX, y: e.clientY });
		setShowVariableMenu(true);
	}, []);

	// WhatsApp formatting functions
	const applyFormatting = useCallback(
		(format: string) => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const selectedText = text.substring(start, end);

			if (selectedText) {
				let formattedText = "";

				switch (format) {
					case "bold":
						formattedText = `*${selectedText}*`;
						break;
					case "italic":
						formattedText = `_${selectedText}_`;
						break;
					case "strikethrough":
						formattedText = `~${selectedText}~`;
						break;
					case "code":
						formattedText = `\`${selectedText}\``;
						break;
					default:
						formattedText = selectedText;
				}

				const newText = text.substring(0, start) + formattedText + text.substring(end);
				updateText(newText);

				// Reposition cursor (respecting maxLength)
				setTimeout(() => {
					textarea.focus();
					const finalLength = Math.min(start + formattedText.length, maxLength || Infinity);
					textarea.setSelectionRange(finalLength, finalLength);
				}, 0);
			} else {
				// Insert empty markers if no text selected
				let markers = "";

				switch (format) {
					case "bold":
						markers = "**";
						break;
					case "italic":
						markers = "__";
						break;
					case "strikethrough":
						markers = "~~";
						break;
					case "code":
						markers = "``";
						break;
				}

				const newText = text.substring(0, start) + markers + text.substring(end);
				updateText(newText);

				// Position cursor between markers (respecting maxLength)
				setTimeout(() => {
					textarea.focus();
					const finalLength = Math.min(start + markers.length / 2, maxLength || Infinity);
					textarea.setSelectionRange(finalLength, finalLength);
				}, 0);
			}
		},
		[text, updateText],
	);

	// Insert list function
	const insertList = useCallback(
		(type: "bullet" | "numbered") => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const currentLineStart = text.lastIndexOf("\n", start - 1) + 1;
			const currentLineEnd = text.indexOf("\n", start);
			const endPos = currentLineEnd === -1 ? text.length : currentLineEnd;

			const prefix = type === "bullet" ? "• " : "1. ";
			const newText =
				text.substring(0, currentLineStart) +
				prefix +
				text.substring(currentLineStart, endPos) +
				text.substring(endPos);

			updateText(newText);

			setTimeout(() => {
				textarea.focus();
				const finalLength = Math.min(start + prefix.length, maxLength || Infinity);
				textarea.setSelectionRange(finalLength, finalLength);
			}, 0);
		},
		[text, updateText, maxLength],
	);

	// Insert quote function
	const insertQuote = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		const start = textarea.selectionStart;
		const currentLineStart = text.lastIndexOf("\n", start - 1) + 1;
		const currentLineEnd = text.indexOf("\n", start);
		const endPos = currentLineEnd === -1 ? text.length : currentLineEnd;

		const newText =
			text.substring(0, currentLineStart) + "> " + text.substring(currentLineStart, endPos) + text.substring(endPos);

		updateText(newText);

		setTimeout(() => {
			textarea.focus();
			const finalLength = Math.min(start + 2, maxLength || Infinity);
			textarea.setSelectionRange(finalLength, finalLength);
		}, 0);
	}, [text, updateText, maxLength]);

	// Generate preview text with WhatsApp formatting
	const getPreviewText = useCallback(() => {
		let previewText = text
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

		// Replace variables with their values for preview
		variables.forEach((variable) => {
			const variableRegex = new RegExp(`\\{\\{${variable.chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`, "g");
			previewText = previewText.replace(
				variableRegex,
				`<span class="bg-blue-100 dark:bg-blue-900 px-1 rounded font-medium">${variable.valor}</span>`,
			);
		});

		return previewText;
	}, [text, variables]);

	const handleSave = useCallback(() => {
		if (text.trim() && errors.length === 0) {
			onSave(text.trim());
			if (onClose) {
				onClose();
			}
		}
	}, [text, errors, onSave, onClose]);

	// Inline version for use in forms
	if (inline) {
		return (
			<div className={`space-y-2 ${className}`}>
				<div className="relative">
					<Textarea
						ref={textareaRef}
						value={text}
						onChange={(e) => updateText(e.target.value)}
						onKeyDown={handleCurlyBraces}
						onContextMenu={handleContextMenu}
						placeholder={placeholder}
						maxLength={maxLength}
						className={`min-h-[100px] ${isOverLimit ? "border-red-500" : ""}`}
						rows={4}
					/>

					<VariableContextMenu
						accountId={accountId}
						isOpen={showVariableMenu}
						onClose={() => setShowVariableMenu(false)}
						onInsert={handleVariableInsert}
						position={menuPosition}
					/>

					{/* Character counter */}
					<div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
						<Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"} className="text-xs">
							{characterCount}
							{maxLength ? `/${maxLength}` : ""}
						</Badge>
					</div>
				</div>

				{/* Formatting toolbar */}
				<div className="flex flex-wrap gap-1">
					<Button variant="outline" onClick={() => applyFormatting("bold")} title="Negrito (*texto*)">
						<Bold className="h-3 w-3" />
					</Button>
					<Button variant="outline" onClick={() => applyFormatting("italic")} title="Itálico (_texto_)">
						<Italic className="h-3 w-3" />
					</Button>
					<Button variant="outline" onClick={() => applyFormatting("strikethrough")} title="Tachado (~texto~)">
						<Strikethrough className="h-3 w-3" />
					</Button>
					<Button variant="outline" onClick={() => setShowVariableMenu(true)} title="Inserir variáveis">
						<Variable className="h-3 w-3" />
					</Button>
				</div>

				{/* Errors */}
				{errors.length > 0 && (
					<div className="flex items-center gap-2 text-sm text-red-600">
						<AlertCircle className="h-4 w-4" />
						<span>{errors[0]}</span>
					</div>
				)}

				{/* Preview for inline mode */}
				{showPreview && text && (
					<div className="p-2 bg-muted rounded-md text-sm">
						<div className="text-xs text-muted-foreground mb-1">Preview:</div>
						<div
							className="break-words overflow-wrap-anywhere"
							dangerouslySetInnerHTML={{ __html: getPreviewText() }}
						/>
					</div>
				)}
			</div>
		);
	}

	// Modal version (original behavior)
	return (
		<div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
			<Card className="w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
					<CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
						Editor de Texto - Formatação WhatsApp
					</CardTitle>
					{onClose && (
						<Button variant="ghost" onClick={onClose}>
							<X className="h-4 w-4" />
						</Button>
					)}
				</CardHeader>

				<CardContent className="space-y-4 bg-white dark:bg-gray-900">
					{/* Toolbar */}
					<div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<Button variant="outline" onClick={() => applyFormatting("bold")} title="Negrito (*texto*)">
							<Bold className="h-4 w-4" />
						</Button>
						<Button variant="outline" onClick={() => applyFormatting("italic")} title="Itálico (_texto_)">
							<Italic className="h-4 w-4" />
						</Button>
						<Button variant="outline" onClick={() => applyFormatting("strikethrough")} title="Tachado (~texto~)">
							<Strikethrough className="h-4 w-4" />
						</Button>

						<div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

						<Button variant="outline" onClick={() => insertList("bullet")} title="Lista com marcadores">
							<List className="h-4 w-4" />
						</Button>
						<Button variant="outline" onClick={() => insertList("numbered")} title="Lista numerada">
							<ListOrdered className="h-4 w-4" />
						</Button>
						<Button variant="outline" onClick={insertQuote} title="Citação (> texto)">
							<Quote className="h-4 w-4" />
						</Button>

						<>
							<div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
							<Button variant="outline" onClick={() => setShowVariableMenu(true)} title="Inserir variáveis">
								<Variable className="h-4 w-4" />
							</Button>
						</>
					</div>

					{/* Character counter and validation */}
					<div className="flex justify-between items-center">
						<div className="text-xs text-muted-foreground">
							Dica: Clique com o botão direito no texto para inserir variáveis
						</div>
						<Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}>
							{characterCount}
							{maxLength ? `/${maxLength}` : ""} caracteres
						</Badge>
					</div>

					{/* Formatting tips */}
					<div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
						<p className="font-medium mb-1">Dicas de formatação do WhatsApp:</p>
						<div className="grid grid-cols-2 gap-2">
							<span>
								*negrito* → <strong>negrito</strong>
							</span>
							<span>
								_itálico_ → <em>itálico</em>
							</span>
							<span>
								~tachado~ → <del>tachado</del>
							</span>
							<span>
								`código` → <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">código</code>
							</span>
							<span>• lista → • lista</span>
							<span>&gt; citação → citação</span>
						</div>
					</div>

					{/* Editor and Preview */}
					<div className={`grid gap-4 ${showPreview ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
						<div>
							<label className="text-sm font-medium mb-2 block">Texto (Editor)</label>
							<Textarea
								ref={textareaRef}
								value={text}
								onChange={(e) => updateText(e.target.value)}
								onKeyDown={handleCurlyBraces}
								onContextMenu={handleContextMenu}
								placeholder={placeholder}
								maxLength={maxLength}
								className={`min-h-[300px] font-mono text-sm ${isOverLimit ? "border-red-500" : ""}`}
								rows={15}
							/>

							<VariableContextMenu
								accountId={accountId}
								isOpen={showVariableMenu}
								onClose={() => setShowVariableMenu(false)}
								onInsert={handleVariableInsert}
								position={menuPosition}
							/>
						</div>

						{showPreview && (
							<div>
								<label className="text-sm font-medium mb-2 block">Preview</label>
								<div
									className="min-h-[300px] p-3 border rounded-md bg-white dark:bg-gray-950 text-sm overflow-y-auto break-words overflow-wrap-anywhere"
									dangerouslySetInnerHTML={{ __html: getPreviewText() }}
								/>
							</div>
						)}
					</div>

					{/* Errors */}
					{errors.length > 0 && (
						<div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
							<AlertCircle className="h-4 w-4" />
							<div>
								{errors.map((error, index) => (
									<div key={index}>{error}</div>
								))}
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
						{onClose && (
							<Button variant="outline" onClick={onClose}>
								Cancelar
							</Button>
						)}
						<Button onClick={handleSave} disabled={!text.trim() || errors.length > 0}>
							<Save className="h-4 w-4 mr-2" />
							Salvar
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
