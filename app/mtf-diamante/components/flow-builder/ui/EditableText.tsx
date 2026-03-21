"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Maximize2, Variable } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FlowTextEditorDialog } from "./FlowTextEditorDialog";
import { useFlowBuilderContext } from "../context/FlowBuilderContext";
import {
	STATIC_FLOW_VARIABLES,
	CATEGORY_COLORS,
	VARIABLE_REGEX,
} from "../constants/flow-variables";

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

interface EditableTextProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	label: string;
	className?: string;
	minRows?: number;
	maxRows?: number;
	readOnly?: boolean;
	maxLength?: number;
	showCounter?: boolean;
	/** Habilitar highlight e autocomplete de variáveis */
	enableVariables?: boolean;
}

export const EditableText = ({
	value,
	onChange,
	placeholder,
	label,
	className,
	minRows = 1,
	readOnly = false,
	maxLength,
	showCounter = false,
	enableVariables = true,
}: EditableTextProps) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const highlightRef = useRef<HTMLDivElement>(null);
	const [internalValue, setInternalValue] = useState(value);

	// Read variables from FlowBuilderContext (fallback to static if context unavailable)
	const ctx = useFlowBuilderContext();
	const availableVariables = ctx?.allVariables ?? STATIC_FLOW_VARIABLES;
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	// Autocomplete state
	const [showAutocomplete, setShowAutocomplete] = useState(false);
	const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [cursorPosition, setCursorPosition] = useState(0);

	// Sync internal state if prop changes
	useEffect(() => {
		setInternalValue(value);
	}, [value]);

	// Auto-resize + sync scroll
	useEffect(() => {
		const textarea = textareaRef.current;
		const highlight = highlightRef.current;
		if (textarea) {
			textarea.style.height = "auto";
			textarea.style.height = `${textarea.scrollHeight + 2}px`;
		}
		// Sync highlight scroll with textarea
		if (highlight && textarea) {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		}
	}, [internalValue]);

	// Filtered variables for autocomplete
	const filteredVariables = useMemo(() => {
		if (!searchQuery) return availableVariables;
		const q = searchQuery.toLowerCase();
		return availableVariables.filter(
			(v) =>
				v.name.toLowerCase().includes(q) ||
				v.label.toLowerCase().includes(q) ||
				v.description.toLowerCase().includes(q),
		);
	}, [searchQuery, availableVariables]);

	// Reset selected index when filtered list changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [filteredVariables.length]);

	// Get caret position in pixels
	const getCaretCoordinates = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return { top: 0, left: 0 };

		// Create a mirror div to calculate position
		const mirror = document.createElement("div");
		const computed = getComputedStyle(textarea);

		// Copy styles
		mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-family: ${computed.fontFamily};
      font-size: ${computed.fontSize};
      line-height: ${computed.lineHeight};
      padding: ${computed.padding};
      border: ${computed.border};
      width: ${textarea.offsetWidth}px;
    `;

		// Text before cursor
		const textBeforeCursor = internalValue.substring(0, textarea.selectionStart);
		mirror.textContent = textBeforeCursor;

		// Add span at cursor position
		const span = document.createElement("span");
		span.textContent = "|";
		mirror.appendChild(span);

		document.body.appendChild(mirror);

		const spanRect = span.getBoundingClientRect();
		const textareaRect = textarea.getBoundingClientRect();

		document.body.removeChild(mirror);

		return {
			top: spanRect.top - textareaRect.top + textarea.scrollTop + 20,
			left: Math.min(spanRect.left - textareaRect.left + textarea.scrollLeft, textarea.offsetWidth - 200),
		};
	}, [internalValue]);

	// Check if we should show autocomplete (after typing "{{")
	const checkAutocomplete = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea || !enableVariables) return;

		const cursorPos = textarea.selectionStart;
		const textBeforeCursor = internalValue.substring(0, cursorPos);

		// Find last "{{" before cursor
		const lastOpenBrace = textBeforeCursor.lastIndexOf("{{");
		const lastCloseBrace = textBeforeCursor.lastIndexOf("}}");

		// Show autocomplete if we're inside {{ }} and haven't closed yet
		if (lastOpenBrace !== -1 && lastOpenBrace > lastCloseBrace) {
			const query = textBeforeCursor.substring(lastOpenBrace + 2).trim();
			setSearchQuery(query);
			setShowAutocomplete(true);
			setCursorPosition(cursorPos);

			// Position the popover
			const coords = getCaretCoordinates();
			setAutocompletePosition(coords);
		} else {
			setShowAutocomplete(false);
			setSearchQuery("");
		}
	}, [internalValue, enableVariables, getCaretCoordinates]);

	// Insert variable at cursor position
	const insertVariable = useCallback(
		(varName: string) => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const textBeforeCursor = internalValue.substring(0, cursorPosition);
			const textAfterCursor = internalValue.substring(cursorPosition);

			// Find where {{ started
			const lastOpenBrace = textBeforeCursor.lastIndexOf("{{");

			// Build new text: everything before {{ + {{varName}} + everything after cursor
			const newText = internalValue.substring(0, lastOpenBrace) + `{{${varName}}}` + textAfterCursor;

			setInternalValue(newText);
			onChange(newText);
			setShowAutocomplete(false);

			// Focus back and set cursor after the inserted variable
			setTimeout(() => {
				if (textarea) {
					textarea.focus();
					const newCursorPos = lastOpenBrace + varName.length + 4; // {{ + name + }}
					textarea.setSelectionRange(newCursorPos, newCursorPos);
				}
			}, 0);
		},
		[internalValue, cursorPosition, onChange],
	);

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const newVal = e.target.value;
		setInternalValue(newVal);
		onChange(newVal);
	};

	const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		checkAutocomplete();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Handle autocomplete navigation
		if (showAutocomplete && filteredVariables.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.min(prev + 1, filteredVariables.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				insertVariable(filteredVariables[selectedIndex].name);
			} else if (e.key === "Escape") {
				setShowAutocomplete(false);
			}
		}

		// Prevent node deletion when pressing backspace/delete
		e.stopPropagation();
	};

	const handleClick = () => {
		checkAutocomplete();
	};

	// Generate highlighted HTML
	const highlightedHtml = useMemo(() => {
		if (!enableVariables || !internalValue) return internalValue || "";

		// Escape HTML and replace variables with styled spans
		const escaped = internalValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

		return escaped.replace(VARIABLE_REGEX, (match, varName) => {
			// Find the category of this variable
			const variable = availableVariables.find((v) => v.name === varName);
			const category = variable?.category || "custom";
			const colorClass = CATEGORY_COLORS[category];

			// Extract only bg classes — text color must stay transparent
			// because this layer sits BEHIND the textarea. If we set a visible
			// text color here, the variable text renders twice (ghost effect).
			const bgOnly = colorClass
				.split(" ")
				.filter(
					(c) =>
						c === "border" ||
						c.startsWith("bg-") ||
						c.startsWith("dark:bg-") ||
						c.startsWith("border-") ||
						c.startsWith("dark:border-"),
				)
				.join(" ");

			return `<span class="px-1 py-0.5 rounded ${bgOnly} font-medium shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.35)]" style="color:transparent">${match}</span>`;
		});
	}, [internalValue, enableVariables, availableVariables]);

	// Prevent drag propagation
	const stopPropagation = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
		e.stopPropagation();
	};

	// Character counter calculations
	const currentLength = internalValue?.length || 0;
	const hasLimit = typeof maxLength === "number" && maxLength > 0;
	const isOverLimit = hasLimit && currentLength > maxLength;
	const isNearLimit = hasLimit && currentLength >= maxLength * 0.9;
	const shouldShowCounter = hasLimit || showCounter;
	const limitPercentage = hasLimit ? Math.min((currentLength / maxLength) * 100, 100) : 0;

	return (
		<div
			className={cn("relative group w-full", className)}
			onDoubleClick={stopPropagation}
			onPointerDown={stopPropagation}
		>
			{/* Highlight layer (behind textarea) */}
			{enableVariables && (
				<div
					ref={highlightRef}
					className="absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words text-sm"
					style={{
						minHeight: `${minRows * 20}px`,
						color: "transparent",
						// Match textarea styles
						padding: 0,
						margin: 0,
						border: "none",
					}}
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
				/>
			)}

			<textarea
				ref={textareaRef}
				value={internalValue}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onKeyUp={handleKeyUp}
				onClick={handleClick}
				placeholder={placeholder}
				readOnly={readOnly}
				rows={minRows}
				className={cn(
					"nodrag w-full resize-none overflow-hidden border-none p-0 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50",
					enableVariables ? "bg-transparent" : "bg-transparent",
					readOnly && "cursor-default select-none",
					isOverLimit && "text-red-600 dark:text-red-400",
				)}
				style={{
					minHeight: `${minRows * 20}px`,
					caretColor: "currentColor",
				}}
			/>

			{/* Autocomplete Popover */}
			{showAutocomplete && filteredVariables.length > 0 && (
				<div
					className="absolute z-50 bg-popover border rounded-lg shadow-xl overflow-hidden"
					style={{
						top: autocompletePosition.top,
						left: Math.max(0, autocompletePosition.left),
						minWidth: "220px",
						maxWidth: "280px",
					}}
				>
					<div className="px-2 py-1.5 border-b bg-muted/50">
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Variable className="h-3 w-3" />
							<span>Variáveis</span>
							{searchQuery && <span className="text-foreground font-medium">"{searchQuery}"</span>}
						</div>
					</div>
					<ScrollArea className="max-h-[200px]">
						<div className="p-1">
							{filteredVariables.map((variable, index) => (
								<button
									key={variable.name}
									type="button"
									className={cn(
										"w-full text-left px-2 py-1.5 rounded text-sm transition-colors",
										index === selectedIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted",
									)}
									onClick={() => insertVariable(variable.name)}
									onMouseEnter={() => setSelectedIndex(index)}
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className={cn(
												"font-mono text-xs px-1 py-0.5 rounded",
												index === selectedIndex ? "bg-primary-foreground/20" : CATEGORY_COLORS[variable.category],
											)}
										>
											{`{{${variable.name}}}`}
										</span>
									</div>
									<p
										className={cn(
											"text-xs mt-0.5",
											index === selectedIndex ? "text-primary-foreground/80" : "text-muted-foreground",
										)}
									>
										{variable.description}
									</p>
								</button>
							))}
						</div>
					</ScrollArea>
					<div className="px-2 py-1 border-t bg-muted/30 text-[10px] text-muted-foreground">
						<kbd className="px-1 py-0.5 bg-muted rounded">↑↓</kbd> navegar
						<kbd className="px-1 py-0.5 bg-muted rounded ml-2">Enter</kbd> selecionar
						<kbd className="px-1 py-0.5 bg-muted rounded ml-2">Esc</kbd> fechar
					</div>
				</div>
			)}

			{/* Character counter */}
			{shouldShowCounter && !readOnly && (
				<div className="flex items-center justify-between mt-1 gap-2">
					{hasLimit && (
						<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
							<div
								className={cn(
									"h-full transition-all duration-200 rounded-full",
									isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-blue-500",
								)}
								style={{ width: `${limitPercentage}%` }}
							/>
						</div>
					)}
					<span
						className={cn(
							"text-[10px] font-medium tabular-nums whitespace-nowrap",
							isOverLimit ? "text-red-500 font-bold" : isNearLimit ? "text-amber-500" : "text-muted-foreground/60",
						)}
					>
						{hasLimit ? (
							<>
								{currentLength}/{maxLength}
								{isOverLimit && <span className="ml-1">(+{currentLength - maxLength})</span>}
							</>
						) : (
							currentLength
						)}
					</span>
				</div>
			)}

			{/* Expand button */}
			{!readOnly && (
				<>
					<Button
						variant="ghost"
						size="icon"
						className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background border shadow-sm rounded-full nodrag"
						onClick={(e) => {
							e.stopPropagation();
							setIsDialogOpen(true);
						}}
						title="Expandir editor"
					>
						<Maximize2 className="h-3 w-3 text-muted-foreground" />
					</Button>

					{/* Flow Text Editor Dialog (renderizado via portal) */}
					<FlowTextEditorDialog
						isOpen={isDialogOpen}
						onClose={() => setIsDialogOpen(false)}
						onSave={(text) => {
							setInternalValue(text);
							onChange(text);
						}}
						initialText={internalValue}
						placeholder={placeholder}
						maxLength={maxLength}
						title="Editar Texto"
						variables={availableVariables}
					/>
				</>
			)}
		</div>
	);
};
