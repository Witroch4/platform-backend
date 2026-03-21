"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Bold,
	Italic,
	Underline as UnderlineIcon,
	Heading1,
	Heading2,
	Heading3,
	Undo,
	Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecursoEditorProps {
	content: string;
	onChange: (html: string) => void;
	readOnly?: boolean;
}

function ToolbarButton({
	onClick,
	active,
	disabled,
	children,
	title,
}: {
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
	children: React.ReactNode;
	title: string;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				"h-8 w-8 p-0",
				active && "bg-accent text-accent-foreground",
			)}
		>
			{children}
		</Button>
	);
}

export function RecursoEditor({ content, onChange, readOnly = false }: RecursoEditorProps) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
			}),
			Underline,
		],
		content,
		editable: !readOnly,
		onUpdate: ({ editor }) => {
			onChange(editor.getHTML());
		},
		editorProps: {
			attributes: {
				class:
					"prose prose-sm dark:prose-invert max-w-none min-h-[250px] p-4 focus:outline-none",
			},
		},
	});

	useEffect(() => {
		if (editor && content && !editor.isFocused) {
			const currentHTML = editor.getHTML();
			if (currentHTML !== content) {
				editor.commands.setContent(content);
			}
		}
	}, [content, editor]);

	if (!editor) return null;

	return (
		<div className="border rounded-md bg-background overflow-hidden">
			{!readOnly && (
				<div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1 bg-muted/30">
					<ToolbarButton
						onClick={() => editor.chain().focus().toggleBold().run()}
						active={editor.isActive("bold")}
						title="Negrito"
					>
						<Bold className="h-4 w-4" />
					</ToolbarButton>
					<ToolbarButton
						onClick={() => editor.chain().focus().toggleItalic().run()}
						active={editor.isActive("italic")}
						title="Itálico"
					>
						<Italic className="h-4 w-4" />
					</ToolbarButton>
					<ToolbarButton
						onClick={() => editor.chain().focus().toggleUnderline().run()}
						active={editor.isActive("underline")}
						title="Sublinhado"
					>
						<UnderlineIcon className="h-4 w-4" />
					</ToolbarButton>

					<div className="w-px h-6 bg-border mx-1" />

					<ToolbarButton
						onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
						active={editor.isActive("heading", { level: 1 })}
						title="Título 1"
					>
						<Heading1 className="h-4 w-4" />
					</ToolbarButton>
					<ToolbarButton
						onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
						active={editor.isActive("heading", { level: 2 })}
						title="Título 2"
					>
						<Heading2 className="h-4 w-4" />
					</ToolbarButton>
					<ToolbarButton
						onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
						active={editor.isActive("heading", { level: 3 })}
						title="Título 3"
					>
						<Heading3 className="h-4 w-4" />
					</ToolbarButton>

					<div className="w-px h-6 bg-border mx-1" />

					<ToolbarButton
						onClick={() => editor.chain().focus().undo().run()}
						disabled={!editor.can().undo()}
						title="Desfazer"
					>
						<Undo className="h-4 w-4" />
					</ToolbarButton>
					<ToolbarButton
						onClick={() => editor.chain().focus().redo().run()}
						disabled={!editor.can().redo()}
						title="Refazer"
					>
						<Redo className="h-4 w-4" />
					</ToolbarButton>
				</div>
			)}
			<EditorContent editor={editor} />
		</div>
	);
}

/**
 * Extracts plain text from TipTap HTML output
 */
export function htmlToPlainText(html: string): string {
	if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
	const div = document.createElement("div");
	div.innerHTML = html;
	return div.textContent || div.innerText || "";
}
