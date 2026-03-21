"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, X, Variable, Eye, EyeOff, Package } from "lucide-react";
import {
	type FlowBuilderVariable,
	STATIC_FLOW_VARIABLES,
	CATEGORY_LABELS,
	CATEGORY_COLORS,
} from "../constants/flow-variables";

interface FlowTextEditorDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (text: string) => void;
	initialText?: string;
	placeholder?: string;
	maxLength?: number;
	title?: string;
	/** Variables available for insertion (from FlowBuilderContext) */
	variables?: FlowBuilderVariable[];
}

export function FlowTextEditorDialog({
	isOpen,
	onClose,
	onSave,
	initialText = "",
	placeholder = "Digite sua mensagem...",
	maxLength = 1024,
	title = "Editor de Texto",
	variables,
}: FlowTextEditorDialogProps) {
	const allVariables = variables ?? STATIC_FLOW_VARIABLES;

	const [text, setText] = useState(initialText);
	const [showPreview, setShowPreview] = useState(true);
	const [showVariableMenu, setShowVariableMenu] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const variableMenuRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);

	// Track mousedown on backdrop to prevent closing when dragging selection outside
	const mouseDownOnBackdropRef = useRef(false);

	// Character count
	const characterCount = text.length;
	const isOverLimit = maxLength > 0 && characterCount > maxLength;
	const isNearLimit = maxLength > 0 && characterCount > maxLength * 0.8;

	// Group variables by category for the menu
	const groupedVariables = useMemo(() => {
		const groups: Record<string, FlowBuilderVariable[]> = {};
		for (const v of allVariables) {
			const key = v.category;
			if (!groups[key]) groups[key] = [];
			groups[key].push(v);
		}
		return groups;
	}, [allVariables]);

	// Ordered categories for rendering
	const categoryOrder = useMemo(() => {
		const order = ["contact", "conversation", "system"];
		// Add session if present (WaitForReply/GeneratePaymentLink vars)
		if (groupedVariables.session?.length) order.push("session");
		// Add mtf if present
		if (groupedVariables.mtf?.length) order.push("mtf");
		// Add custom if present
		if (groupedVariables.custom?.length) order.push("custom");
		return order.filter((c) => groupedVariables[c]?.length);
	}, [groupedVariables]);

	// Sub-group MTF variables
	const mtfSubGroups = useMemo(() => {
		const mtfVars = groupedVariables.mtf || [];
		return {
			special: mtfVars.filter((v) => v.subCategory === "special"),
			normal: mtfVars.filter((v) => v.subCategory === "normal" || !v.subCategory),
			lote: mtfVars.filter((v) => v.subCategory === "lote"),
		};
	}, [groupedVariables]);

	// Sync with initialText when dialog opens
	useEffect(() => {
		if (isOpen) {
			setText(initialText);
		}
	}, [isOpen, initialText]);

	// Focus textarea when dialog opens
	useEffect(() => {
		if (isOpen && textareaRef.current) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [isOpen]);

	// Close variable menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (variableMenuRef.current && !variableMenuRef.current.contains(e.target as Node)) {
				setShowVariableMenu(false);
			}
		};
		if (showVariableMenu) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [showVariableMenu]);

	// Handle escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (showVariableMenu) {
					setShowVariableMenu(false);
				} else {
					onClose();
				}
			}
		};
		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [isOpen, showVariableMenu, onClose]);

	// Update text and auto-save
	const updateText = useCallback(
		(newText: string) => {
			const truncatedText = maxLength > 0 ? newText.slice(0, maxLength) : newText;
			setText(truncatedText);
			// Auto-save: call onSave immediately when text changes
			onSave(truncatedText);
		},
		[maxLength, onSave],
	);

	// Auto-complete curly braces
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key !== "{") return;
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const prevChar = text.substring(0, start).slice(-1);

			if (prevChar === "{") {
				e.preventDefault();
				const insert = "{}}";
				const newText = text.substring(0, start) + insert + text.substring(textarea.selectionEnd);
				updateText(newText);

				setTimeout(() => {
					textarea.focus();
					const caret = start + 1;
					textarea.setSelectionRange(caret, caret);
				}, 0);
			}
		},
		[text, updateText],
	);

	// Apply formatting
	const applyFormatting = useCallback(
		(format: "bold" | "italic" | "strikethrough") => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const selectedText = text.substring(start, end);

			const markers: Record<string, { wrap: string; empty: string }> = {
				bold: { wrap: "*", empty: "**" },
				italic: { wrap: "_", empty: "__" },
				strikethrough: { wrap: "~", empty: "~~" },
			};

			const marker = markers[format];

			if (selectedText) {
				const formattedText = `${marker.wrap}${selectedText}${marker.wrap}`;
				const newText = text.substring(0, start) + formattedText + text.substring(end);
				updateText(newText);

				setTimeout(() => {
					textarea.focus();
					textarea.setSelectionRange(start + formattedText.length, start + formattedText.length);
				}, 0);
			} else {
				const newText = text.substring(0, start) + marker.empty + text.substring(end);
				updateText(newText);

				setTimeout(() => {
					textarea.focus();
					const caret = start + marker.empty.length / 2;
					textarea.setSelectionRange(caret, caret);
				}, 0);
			}
		},
		[text, updateText],
	);

	// Insert list
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
				textarea.setSelectionRange(start + prefix.length, start + prefix.length);
			}, 0);
		},
		[text, updateText],
	);

	// Insert quote
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
			textarea.setSelectionRange(start + 2, start + 2);
		}, 0);
	}, [text, updateText]);

	// Insert variable
	const insertVariable = useCallback(
		(variableName: string) => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const variable = `{{${variableName}}}`;
			const newText = text.substring(0, start) + variable + text.substring(start);

			updateText(newText);
			setShowVariableMenu(false);

			setTimeout(() => {
				textarea.focus();
				textarea.setSelectionRange(start + variable.length, start + variable.length);
			}, 0);
		},
		[text, updateText],
	);

	// Generate preview HTML with MTF variable resolution
	const getPreviewHtml = useCallback(() => {
		// Step 1: Protect {{variables}} from markdown processing (underscores break italic)
		const varSlots: string[] = [];
		let protected_ = text.replace(/\{\{([^}]+)\}\}/g, (full) => {
			const idx = varSlots.length;
			varSlots.push(full);
			return `\x00VAR${idx}\x00`;
		});

		// Step 2: Apply markdown formatting (safe — no {{var}} left to break)
		let preview = protected_
			.replace(/\*(.*?)\*/g, "<strong>$1</strong>")
			.replace(/_(.*?)_/g, "<em>$1</em>")
			.replace(/~(.*?)~/g, "<del>$1</del>")
			.replace(/`(.*?)`/g, '<code class="bg-zinc-200 dark:bg-zinc-700 px-1 rounded text-xs">$1</code>')
			.replace(
				/^> (.+)$/gm,
				'<blockquote class="border-l-4 border-zinc-400 pl-3 italic text-zinc-500 dark:text-zinc-400">$1</blockquote>',
			)
			.replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
			.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
			.replace(/\n/g, "<br>");

		// Step 3: Restore variables — resolve MTF values, highlight others
		preview = preview.replace(/\x00VAR(\d+)\x00/g, (_m, idxStr: string) => {
			const original = varSlots[Number(idxStr)];
			const varName = original.replace(/^\{\{\s*|\s*\}\}$/g, "");
			const variable = allVariables.find((v) => v.name === varName);

			if (variable?.category === "mtf" && variable.value) {
				const escaped = variable.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
				return `<span class="border border-amber-300 bg-amber-200/90 px-1 rounded font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-900/50 dark:text-amber-300">${escaped}</span>`;
			}

			const colorClass = variable
				? CATEGORY_COLORS[variable.category]
				: "border border-blue-300 bg-blue-200/90 text-blue-900 dark:border-blue-800/70 dark:bg-blue-900/50 dark:text-blue-300";
			return `<span class="${colorClass} px-1 rounded font-medium">{{${varName}}}</span>`;
		});

		return preview;
	}, [text, allVariables]);

	// Handle backdrop mousedown - only close if both mousedown and mouseup happen on backdrop
	const handleBackdropMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.target === backdropRef.current) {
			mouseDownOnBackdropRef.current = true;
		} else {
			mouseDownOnBackdropRef.current = false;
		}
	}, []);

	const handleBackdropMouseUp = useCallback(
		(e: React.MouseEvent) => {
			// Only close if both mousedown AND mouseup were on the backdrop
			if (e.target === backdropRef.current && mouseDownOnBackdropRef.current) {
				onClose();
			}
			mouseDownOnBackdropRef.current = false;
		},
		[onClose],
	);

	// Render MTF sub-group section
	const renderMtfSubGroup = (label: string, vars: FlowBuilderVariable[], icon?: React.ReactNode) => {
		if (!vars.length) return null;
		return (
			<React.Fragment key={label}>
				<div className="px-3 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
					{icon}
					{label}
				</div>
				{vars.map((variable) => (
					<button
						key={variable.name}
						className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex flex-col gap-0.5"
						onClick={() => insertVariable(variable.name)}
					>
						<div className="flex items-center justify-between">
							<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
							<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
						</div>
						{variable.value && (
							<span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-full">
								{variable.value.length > 50 ? `${variable.value.slice(0, 50)}…` : variable.value}
							</span>
						)}
					</button>
				))}
			</React.Fragment>
		);
	};

	if (!isOpen) return null;

	const dialogContent = (
		<div
			ref={backdropRef}
			className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onMouseDown={handleBackdropMouseDown}
			onMouseUp={handleBackdropMouseUp}
		>
			<div className="w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
					<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowPreview(!showPreview)}
							className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
						>
							{showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
							{showPreview ? "Ocultar" : "Mostrar"} Preview
						</Button>
						<Button variant="ghost" size="icon" onClick={onClose}>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>

				{/* Toolbar */}
				<div className="flex flex-wrap items-center gap-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => applyFormatting("bold")}
						title="Negrito (*texto*)"
						className="h-8 w-8 p-0"
					>
						<Bold className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => applyFormatting("italic")}
						title="Itálico (_texto_)"
						className="h-8 w-8 p-0"
					>
						<Italic className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => applyFormatting("strikethrough")}
						title="Tachado (~texto~)"
						className="h-8 w-8 p-0"
					>
						<Strikethrough className="h-4 w-4" />
					</Button>

					<div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-1" />

					<Button
						variant="ghost"
						size="sm"
						onClick={() => insertList("bullet")}
						title="Lista com marcadores"
						className="h-8 w-8 p-0"
					>
						<List className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => insertList("numbered")}
						title="Lista numerada"
						className="h-8 w-8 p-0"
					>
						<ListOrdered className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="sm" onClick={insertQuote} title="Citação (> texto)" className="h-8 w-8 p-0">
						<Quote className="h-4 w-4" />
					</Button>

					<div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-1" />

					<div className="relative" ref={variableMenuRef}>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowVariableMenu(!showVariableMenu)}
							title="Inserir variável"
							className="h-8 px-2 gap-1"
						>
							<Variable className="h-4 w-4" />
							<span className="text-xs">Variável</span>
						</Button>

						{showVariableMenu && (
							<div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 z-50 overflow-hidden">
								<div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
									<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Selecione uma variável</span>
								</div>
								<div className="max-h-80 overflow-y-auto">
									{categoryOrder.map((category) => (
										<div key={category}>
											<div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50">
												{CATEGORY_LABELS[category] || category}
											</div>
											{category === "mtf" ? (
												<>
													{renderMtfSubGroup("Especiais", mtfSubGroups.special, <Variable className="h-2.5 w-2.5" />)}
													{renderMtfSubGroup("Normais", mtfSubGroups.normal, <Variable className="h-2.5 w-2.5" />)}
													{renderMtfSubGroup("Lote Ativo", mtfSubGroups.lote, <Package className="h-2.5 w-2.5" />)}
												</>
											) : (
												groupedVariables[category]?.map((variable) => (
													<button
														key={variable.name}
														className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-between"
														onClick={() => insertVariable(variable.name)}
													>
														<span className="text-zinc-700 dark:text-zinc-300">{variable.label}</span>
														<code className="text-xs text-zinc-400 dark:text-zinc-500">{`{{${variable.name}}}`}</code>
													</button>
												))
											)}
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="flex-1" />

					<Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"} className="text-xs">
						{characterCount}
						{maxLength > 0 ? `/${maxLength}` : ""}
					</Badge>
				</div>

				{/* Content */}
				<div className={`flex-1 overflow-hidden grid ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
					{/* Editor */}
					<div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800">
						<div className="px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/50">
							Editor
						</div>
						<Textarea
							ref={textareaRef}
							value={text}
							onChange={(e) => updateText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={placeholder}
							className={`flex-1 min-h-[300px] resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm ${
								isOverLimit ? "text-red-500" : ""
							}`}
						/>
					</div>

					{/* Preview */}
					{showPreview && (
						<div className="flex flex-col bg-zinc-50 dark:bg-zinc-900/30">
							<div className="px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/50">
								Preview
							</div>
							<div
								className="flex-1 p-4 text-sm overflow-y-auto break-words"
								dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);

	// Use portal to render outside React Flow context
	return createPortal(dialogContent, document.body);
}
