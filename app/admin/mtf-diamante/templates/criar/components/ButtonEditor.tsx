"use client";

import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableItem } from "@/app/admin/mtf-diamante/components/shared/dnd/SortableItem";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash, ExternalLink, Phone, MessageSquare, CheckSquare, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "FLOW";

interface TemplateButton {
	id: string;
	type: ButtonType;
	text: string;
	url?: string;
	phone_number?: string;
	example?: string[];
	callVariant?: "whatsapp" | "phone"; // apenas quando type === PHONE_NUMBER
}

interface ButtonEditorProps {
	buttons: TemplateButton[];
	setButtons: (buttons: TemplateButton[]) => void;
}

export const ButtonEditor = ({ buttons, setButtons }: ButtonEditorProps) => {
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
	const [isDragging, setIsDragging] = useState(false);

	const limits: Record<ButtonType, number> = useMemo(
		() => ({
			QUICK_REPLY: 10,
			URL: 2,
			PHONE_NUMBER: 1,
			COPY_CODE: 1,
			FLOW: 1,
		}),
		[],
	);

	const typeIcons: Record<ButtonType, any> = {
		QUICK_REPLY: MessageSquare,
		URL: ExternalLink,
		PHONE_NUMBER: Phone,
		COPY_CODE: CheckSquare,
		FLOW: CheckSquare,
	};

	const totalLimit = 10;

	const countByType = (type: ButtonType) => buttons.filter((b) => b.type === type).length;

	const canAdd = (type: ButtonType) => buttons.length < totalLimit && countByType(type) < limits[type];

	const addButton = (type: ButtonType, opts?: Partial<TemplateButton>) => {
		if (buttons.length >= totalLimit) return;
		if (countByType(type) >= limits[type]) return;
		const id = `btn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const defaults: Partial<TemplateButton> = {
			QUICK_REPLY: { text: `Botão ${countByType("QUICK_REPLY") + 1}` },
			URL: { text: "Acessar o site", url: "https://exemplo.com" },
			PHONE_NUMBER: {
				text: opts?.callVariant === "whatsapp" ? "Ligar no WhatsApp" : "Ligar",
				phone_number: "+5500000000000",
				callVariant: opts?.callVariant || "phone",
			},
			COPY_CODE: { text: "Copiar código da oferta", example: ["CUPOM123"] },
			FLOW: { text: "Concluir flow" },
		}[type] as any;
		setButtons([...buttons, { id, type, text: "", ...defaults }]);
	};

	const removeButton = (index: number) => {
		setButtons(buttons.filter((_, i) => i !== index));
	};

	const updateButtonText = (index: number, text: string) => {
		const newButtons = [...buttons];
		newButtons[index].text = text;
		setButtons(newButtons);
	};

	const updateButtonField = (index: number, field: keyof TemplateButton, value: string) => {
		const newButtons = [...buttons];
		(newButtons[index] as any)[field] = value;
		setButtons(newButtons);
	};

	const onDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = buttons.findIndex((b) => b.id === active.id);
		const newIndex = buttons.findIndex((b) => b.id === over.id);
		if (oldIndex !== -1 && newIndex !== -1) setButtons(arrayMove(buttons, oldIndex, newIndex));
		setIsDragging(false);
	};
	const onDragStart = () => setIsDragging(true);
	const onDragCancel = () => setIsDragging(false);

	// Evita iniciar arraste quando interagir com inputs, mas só enquanto o ponteiro está sobre o input
	const stopDrag = (e: React.PointerEvent<HTMLInputElement>) => {
		e.stopPropagation();
	};

	return (
		<div>
			<div className="flex items-start justify-between mb-3">
				<div className="space-y-1 pr-4">
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-medium">Botões</h3>
						<span className="text-xs text-muted-foreground">• Opcional</span>
					</div>
					<p className="text-xs text-muted-foreground">
						Crie botões que permitam que os clientes respondam à sua mensagem ou realizem uma ação. É possível adicionar
						até 10 botões. Se você adicionar mais de 3 botões, eles aparecerão em uma lista.
					</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" disabled={buttons.length >= totalLimit}>
							<Plus className="h-3 w-3 mr-1" />
							Adicionar botão
							<span className="ml-2 text-xs text-muted-foreground">
								({buttons.length}/{totalLimit})
							</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-72">
						<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Botões de resposta rápida</div>
						<DropdownMenuItem onClick={() => addButton("QUICK_REPLY")} disabled={!canAdd("QUICK_REPLY")}>
							<div className="flex flex-col gap-0.5">
								<span>Personalizado</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("QUICK_REPLY")}/{limits["QUICK_REPLY"]}
								</span>
							</div>
						</DropdownMenuItem>
						<div className="my-1 h-px bg-muted" />
						<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Botões de chamada para ação</div>
						<DropdownMenuItem onClick={() => addButton("URL")} disabled={!canAdd("URL")}>
							<div className="flex flex-col gap-0.5">
								<span>Acessar o site</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("URL")}/{limits["URL"]}
								</span>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => addButton("PHONE_NUMBER", { callVariant: "whatsapp" })}
							disabled={!canAdd("PHONE_NUMBER")}
						>
							<div className="flex flex-col gap-0.5">
								<span>Ligar no WhatsApp</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("PHONE_NUMBER")}/{limits["PHONE_NUMBER"]}
								</span>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => addButton("PHONE_NUMBER", { callVariant: "phone" })}
							disabled={!canAdd("PHONE_NUMBER")}
						>
							<div className="flex flex-col gap-0.5">
								<span>Ligar</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("PHONE_NUMBER")}/{limits["PHONE_NUMBER"]}
								</span>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => addButton("FLOW")} disabled={!canAdd("FLOW")}>
							<div className="flex flex-col gap-0.5">
								<span>Concluir flow</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("FLOW")}/{limits["FLOW"]}
								</span>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => addButton("COPY_CODE")} disabled={!canAdd("COPY_CODE")}>
							<div className="flex flex-col gap-0.5">
								<span>Copiar código da oferta</span>
								<span className="text-[10px] text-muted-foreground">
									{countByType("COPY_CODE")}/{limits["COPY_CODE"]}
								</span>
							</div>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{buttons.length === 0 ? (
				<div className="text-center p-4 border border-dashed rounded-md text-muted-foreground text-sm">
					Adicione botões ao template.
				</div>
			) : (
				<DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
					<SortableContext items={buttons.map((b) => b.id)} strategy={verticalListSortingStrategy}>
						<div className="space-y-2">
							{buttons.map((button, index) => {
								const Icon = typeIcons[button.type];
								return (
									<SortableItem key={button.id} id={button.id}>
										<div className="flex items-start gap-2 p-3 border rounded-md bg-background">
											<div className="mt-1">
												<Icon className="h-4 w-4" />
											</div>
											<div className="flex-1 space-y-2">
												<div className="flex items-center gap-2">
													<Badge variant="outline">{button.type}</Badge>
													<span className="text-xs text-muted-foreground">
														{countByType(button.type)}/{limits[button.type]}
													</span>
													<Button
														variant="ghost"
														size="icon"
														className="ml-auto h-6 w-6"
														onClick={() => removeButton(index)}
													>
														<Trash className="h-3 w-3" />
													</Button>
												</div>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
													<div>
														<div className="flex items-center justify-between">
															<Label className="text-xs">Texto</Label>
															<span className="text-[10px] text-muted-foreground">{(button.text || "").length}/20</span>
														</div>
														<Input
															value={button.text}
															onChange={(e) => updateButtonText(index, e.target.value)}
															maxLength={20}
															onPointerDown={stopDrag}
															className={cn(isDragging && "pointer-events-none")}
															disabled={button.type === "COPY_CODE"}
														/>
														{button.type === "COPY_CODE" && (
															<p className="text-[10px] text-muted-foreground mt-1">
																O texto deste botão é fixo para aprovação.
															</p>
														)}
													</div>
													{button.type === "URL" && (
														<div>
															<div className="flex items-center justify-between">
																<Label className="text-xs">URL</Label>
																<span className="text-[10px] text-muted-foreground">
																	{(button.url || "").length}/2000
																</span>
															</div>
															<Input
																value={button.url || ""}
																onChange={(e) => updateButtonField(index, "url", e.target.value)}
																placeholder="https://exemplo.com"
																maxLength={2000}
																onPointerDown={stopDrag}
																className={cn(isDragging && "pointer-events-none")}
															/>
														</div>
													)}
													{button.type === "PHONE_NUMBER" && (
														<div>
															<Label className="text-xs">Telefone</Label>
															<Input
																value={button.phone_number || ""}
																onChange={(e) => updateButtonField(index, "phone_number", e.target.value)}
																placeholder="+5511999999999"
																onPointerDown={stopDrag}
																className={cn(isDragging && "pointer-events-none")}
															/>
															<Alert className="mt-2">
																<Info className="h-3 w-3 mr-2" />
																<AlertDescription className="text-[11px]">
																	Ative as ligações no gerenciador do WhatsApp. Consulte a documentação oficial sobre
																	chamadas WhatsApp em{" "}
																	<a
																		className="underline"
																		href="https://developers.facebook.com/docs/whatsapp/cloud-api/calling/"
																		target="_blank"
																		rel="noreferrer"
																	>
																		Calling API
																	</a>{" "}
																	e o gerenciador em{" "}
																	<a
																		className="underline"
																		href="https://business.facebook.com/latest/whatsapp_manager/phone_numbers"
																		target="_blank"
																		rel="noreferrer"
																	>
																		WhatsApp Manager
																	</a>
																	.
																</AlertDescription>
															</Alert>
														</div>
													)}
													{button.type === "COPY_CODE" && (
														<div>
															<div className="flex items-center justify-between">
																<Label className="text-xs">Código</Label>
																<span className="text-[10px] text-muted-foreground">
																	{(button.example?.[0] || "").length}/15
																</span>
															</div>
															<Input
																value={button.example?.[0] || ""}
																onChange={(e) => updateButtonField(index, "example", [e.target.value] as any)}
																placeholder="CUPOM123"
																maxLength={15}
																onPointerDown={stopDrag}
																className={cn(isDragging && "pointer-events-none")}
															/>
														</div>
													)}
												</div>
											</div>
										</div>
									</SortableItem>
								);
							})}
						</div>
					</SortableContext>
				</DndContext>
			)}
		</div>
	);
};
