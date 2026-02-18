"use client";

import { type DragEvent, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
	FLOWBUILDER_ELEMENT_MIME,
	INTERACTIVE_MESSAGE_ELEMENT_ITEMS,
	PALETTE_ITEMS,
	INSTAGRAM_PALETTE_ITEMS,
	TEMPLATE_PALETTE_ITEMS,
	TEMPLATE_ELEMENT_ITEMS,
	TEMPLATE_ELEMENT_MIME,
	SHARED_ELEMENT_ITEMS,
	TEMPLATE_SPECIAL_BUTTON_ITEMS,
	FlowNodeType,
	type ElementPaletteItem,
	type PaletteItem,
	type TemplatePaletteItem,
	type TemplateElementItem,
} from "@/types/flow-builder";
import { isInstagramChannel } from "@/types/interactive-messages";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Category labels for grouping palette items
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
	trigger: "Início",
	message: "Mensagens",
	reaction: "Reações",
	action: "Ações",
	logic: "Lógica",
};

const CATEGORY_ORDER = ["trigger", "message", "reaction", "action", "logic"];

// ---------------------------------------------------------------------------
// Single palette item (draggable)
// ---------------------------------------------------------------------------

interface PaletteCardProps {
	item: PaletteItem;
}

function PaletteCard({ item }: PaletteCardProps) {
	const onDragStart = useCallback(
		(event: DragEvent) => {
			// Impede que o drag propague para containers pais
			event.stopPropagation();
			event.dataTransfer.setData("application/reactflow", item.type);
			event.dataTransfer.effectAllowed = "move";
		},
		[item.type],
	);

	return (
		<div
			draggable
			onDragStart={onDragStart}
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-card p-3 cursor-grab",
				"transition-all hover:shadow-md hover:border-primary/40 active:cursor-grabbing",
				"select-none",
			)}
		>
			<span className="text-xl shrink-0">{item.icon}</span>
			<div className="min-w-0">
				<p className="text-sm font-medium truncate">{item.label}</p>
				<p className="text-[11px] text-muted-foreground leading-tight truncate">{item.description}</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Element palette item (draggable into Interactive Message container)
// ---------------------------------------------------------------------------

interface ElementPaletteCardProps {
	item: ElementPaletteItem;
}

function ElementPaletteCard({ item }: ElementPaletteCardProps) {
	const onDragStart = useCallback(
		(event: DragEvent) => {
			// Impede que o drag propague para containers pais
			event.stopPropagation();
			// Elementos compartilhados: enviam AMBOS os MIME types
			// Isso permite drop tanto em Mensagem Interativa quanto em Template
			event.dataTransfer.setData(FLOWBUILDER_ELEMENT_MIME, item.type);
			event.dataTransfer.setData(TEMPLATE_ELEMENT_MIME, item.type === "button" ? "button_quick_reply" : item.type);
			event.dataTransfer.effectAllowed = "copy";
		},
		[item.type],
	);

	return (
		<div
			draggable
			onDragStart={onDragStart}
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-card p-3 cursor-grab",
				"transition-all hover:shadow-md hover:border-primary/40 active:cursor-grabbing",
				"select-none",
			)}
		>
			<span className="text-xl shrink-0">{item.icon}</span>
			<div className="min-w-0">
				<p className="text-sm font-medium truncate">{item.label}</p>
				<p className="text-[11px] text-muted-foreground leading-tight truncate">{item.description}</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Template palette item (draggable container)
// ---------------------------------------------------------------------------

interface TemplatePaletteCardProps {
	item: TemplatePaletteItem;
}

function TemplatePaletteCard({ item }: TemplatePaletteCardProps) {
	const onDragStart = useCallback(
		(event: DragEvent) => {
			// Impede que o drag propague para containers pais
			event.stopPropagation();
			event.dataTransfer.setData("application/reactflow", item.type);
			event.dataTransfer.effectAllowed = "move";
		},
		[item.type],
	);

	return (
		<div
			draggable
			onDragStart={onDragStart}
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-card p-3 cursor-grab",
				"transition-all hover:shadow-md hover:border-emerald-400 active:cursor-grabbing",
				"select-none border-emerald-200 dark:border-emerald-800",
			)}
		>
			<span className="text-xl shrink-0">{item.icon}</span>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium truncate">{item.label}</p>
				<p className="text-[11px] text-muted-foreground leading-tight truncate">{item.description}</p>
			</div>
			<span className="text-[9px] text-muted-foreground/60 shrink-0">max {item.maxButtons}</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Template element palette item (draggable into template containers)
// ---------------------------------------------------------------------------

interface TemplateElementPaletteCardProps {
	item: TemplateElementItem;
}

function TemplateElementPaletteCard({ item }: TemplateElementPaletteCardProps) {
	const onDragStart = useCallback(
		(event: DragEvent) => {
			// Impede que o drag propague para containers pais
			event.stopPropagation();
			event.dataTransfer.setData(TEMPLATE_ELEMENT_MIME, item.type);
			event.dataTransfer.effectAllowed = "copy";
		},
		[item.type],
	);

	return (
		<div
			draggable
			onDragStart={onDragStart}
			className={cn(
				"flex items-center gap-2 rounded-md border bg-card p-2 cursor-grab",
				"transition-all hover:shadow-sm hover:border-emerald-400 active:cursor-grabbing",
				"select-none text-sm",
			)}
		>
			<span className="text-base shrink-0">{item.icon}</span>
			<div className="min-w-0">
				<p className="text-xs font-medium truncate">{item.label}</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// NodePalette
// ---------------------------------------------------------------------------

interface NodePaletteProps {
	onAddNode?: (type: FlowNodeType) => void;
	/** Tipo do canal (Channel::WhatsApp, Channel::Instagram, Channel::FacebookPage) */
	channelType?: string;
}

export function NodePalette({ onAddNode, channelType }: NodePaletteProps) {
	// Determina se é Instagram/Facebook
	const isInstagram = channelType ? isInstagramChannel(channelType) : false;

	// Seleciona a paleta correta baseado no canal
	const paletteItems = isInstagram ? INSTAGRAM_PALETTE_ITEMS : PALETTE_ITEMS;

	// Elementos para Instagram: apenas body e button (sem header/footer)
	const elementItems = isInstagram
		? INTERACTIVE_MESSAGE_ELEMENT_ITEMS.filter((e) => e.type === "body" || e.type === "button")
		: INTERACTIVE_MESSAGE_ELEMENT_ITEMS;

	// Group items by category
	const grouped = CATEGORY_ORDER.reduce<Record<string, PaletteItem[]>>((acc, cat) => {
		acc[cat] = paletteItems.filter((i) => i.category === cat);
		return acc;
	}, {});

	// Para Instagram: destaque Quick Replies. Para WhatsApp: Interactive Message
	const mainNode = isInstagram
		? paletteItems.find((i) => i.type === "quick_replies")
		: paletteItems.find((i) => i.type === "interactive_message");

	// Button Template para Instagram (interactive_message renomeado)
	const buttonTemplateNode = isInstagram ? paletteItems.find((i) => i.type === "interactive_message") : null;

	return (
		<div className="w-[220px] shrink-0 rounded-lg border bg-background flex flex-col">
			<div className="px-3 py-2.5 border-b">
				<p className="text-sm font-semibold">Blocos</p>
				<p className="text-[11px] text-muted-foreground">Arraste para o canvas</p>
			</div>

			<ScrollArea className="flex-1 px-2 py-2">
				<div className="space-y-4">
					{/* 1. PRINCIPAL - Mensagem Interativa (WhatsApp) / Quick Replies (Instagram) */}
					{mainNode && (
						<div className="mb-4">
							<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
								Principal
							</p>
							<PaletteCard item={mainNode} />
						</div>
					)}

					{/* 2. ELEMENTOS - Compartilhados (funcionam em Mensagem Interativa E Templates) */}
					{!isInstagram && (
						<div className="bg-muted/10 rounded-lg p-2 border border-border/50">
							<p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 px-1 flex items-center gap-1">
								<span className="h-1.5 w-1.5 rounded-full bg-primary" />
								Elementos
							</p>
							<div className="space-y-1.5">
								{SHARED_ELEMENT_ITEMS.map((item) => (
									<ElementPaletteCard key={item.type} item={item} />
								))}
							</div>
							<p className="text-[10px] text-muted-foreground leading-tight mt-2 px-1 italic">
								Arraste para Mensagem Interativa ou Template
							</p>
						</div>
					)}

					{/* 3. TEMPLATES WHATSAPP - Container + Botões Especiais */}
					{!isInstagram && (
						<div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-2 border border-emerald-200/50 dark:border-emerald-800/50">
							<p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2 px-1 flex items-center gap-1">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								Templates WhatsApp
							</p>
							<div className="space-y-1.5">
								{TEMPLATE_PALETTE_ITEMS.map((item) => (
									<TemplatePaletteCard key={item.type} item={item} />
								))}
							</div>

							{/* Botões Especiais - exclusivos para templates */}
							<div className="ml-3 mt-2 pl-2 border-l-2 border-emerald-300 dark:border-emerald-700 space-y-1">
								<p className="text-[10px] text-muted-foreground italic mb-1">Botões especiais</p>
								{TEMPLATE_SPECIAL_BUTTON_ITEMS.map((item) => (
									<TemplateElementPaletteCard key={item.type} item={item} />
								))}
							</div>
							<p className="text-[10px] text-muted-foreground leading-tight mt-2 px-1 italic">
								Arraste botões especiais para o template
							</p>
						</div>
					)}

					{/* 3. Instagram: Button Template com elementos subordinados */}
					{isInstagram && buttonTemplateNode && (
						<div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-2 border border-blue-200/50 dark:border-blue-800/50">
							<p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2 px-1 flex items-center gap-1">
								<span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
								Button Template
							</p>
							<PaletteCard item={buttonTemplateNode} />

							{/* Elementos subordinados (indentados) */}
							<div className="ml-3 mt-2 pl-2 border-l-2 border-blue-300 dark:border-blue-700 space-y-1.5">
								<p className="text-[10px] text-muted-foreground italic mb-1">Elementos</p>
								{elementItems.map((item) => (
									<ElementPaletteCard key={item.type} item={item} />
								))}
							</div>
							<p className="text-[10px] text-muted-foreground leading-tight mt-2 px-1 italic">
								Arraste elementos para o Button Template
							</p>
						</div>
					)}

					<div className="border-t border-border/30 my-2" />

					{CATEGORY_ORDER.map((category) => {
						// Filtra nós principais que já foram exibidos acima
						const excludedTypes = [mainNode?.type, buttonTemplateNode?.type].filter(Boolean);
						const items = grouped[category].filter((i) => !excludedTypes.includes(i.type));
						if (!items?.length) return null;
						return (
							<div key={category}>
								<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
									{CATEGORY_LABELS[category]}
								</p>
								<div className="space-y-1.5">
									{items.map((item) => (
										<PaletteCard key={item.type} item={item} />
									))}
								</div>
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

export default NodePalette;
