"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { debounce } from "lodash";
import { SortableItem } from "./dnd/SortableItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, MessageSquare, ExternalLink, Phone, Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Types based on the design specification
export interface InteractiveButton {
	id: string;
	text: string;
	type: "reply" | "url" | "phone_number";
	url?: string;
	phone_number?: string;
}

export interface ButtonReaction {
	buttonId: string;
	// Local reaction config used by EmojiPicker
	reaction?: {
		type: "emoji" | "text" | "action";
		value: string;
	};
	// Optional direct action field for preview/other UIs
	action?: string;
}

interface ButtonManagerProps {
	buttons: InteractiveButton[];
	reactions?: ButtonReaction[];
	onChange: (buttons: InteractiveButton[]) => void;
	onReactionChange?: (reactions: ButtonReaction[]) => void;
	onRequestReactionConfig?: (buttonId: string) => void;
	maxButtons?: number;
	disabled?: boolean;
	className?: string;
	showReactionConfig?: boolean;
	idPrefix?: string; // optional prefix for generated ids (e.g., ig_)
	isInstagramQuickReplies?: boolean; // para limitar aos tipos permitidos
	channelType?: string; // channel type for Meta channels detection
}

// Button type configurations
const BUTTON_TYPES = {
	reply: {
		label: "Quick Reply",
		icon: MessageSquare,
		description: "Simple response button",
		maxLength: 20,
		supportsReactions: true,
	},
	url: {
		label: "URL Button",
		icon: ExternalLink,
		description: "Button that opens a link",
		maxLength: 20,
		supportsReactions: false,
	},
	phone_number: {
		label: "Phone Button",
		icon: Phone,
		description: "Button that makes a call",
		maxLength: 20,
		supportsReactions: false,
	},
} as const;

// Validation functions
const validateButtonText = (text: string, type: InteractiveButton["type"]): string[] => {
	const errors: string[] = [];

	if (!text.trim()) {
		errors.push("Button text is required");
	}

	if (text.length > BUTTON_TYPES[type].maxLength) {
		errors.push(`Text exceeds maximum length of ${BUTTON_TYPES[type].maxLength} characters`);
	}

	return errors;
};

const validateUrl = (url: string): string[] => {
	const errors: string[] = [];

	if (!url.trim()) {
		errors.push("URL is required for URL buttons");
		return errors;
	}

	try {
		new URL(url);
	} catch {
		errors.push("Please enter a valid URL (e.g., https://example.com)");
	}

	return errors;
};

const validatePhoneNumber = (phone: string): string[] => {
	const errors: string[] = [];

	if (!phone.trim()) {
		errors.push("Phone number is required for phone buttons");
		return errors;
	}

	// Basic phone number validation - should start with + and contain only digits
	const phoneRegex = /^\+[1-9]\d{1,14}$/;
	if (!phoneRegex.test(phone)) {
		errors.push("Please enter a valid phone number (e.g., +5511999999999)");
	}

	return errors;
};

const ButtonManagerComponent: React.FC<ButtonManagerProps> = ({
	buttons,
	reactions = [],
	onChange,
	onReactionChange,
	onRequestReactionConfig,
	maxButtons = 3,
	disabled = false,
	className,
	showReactionConfig = true,
	idPrefix,
	isInstagramQuickReplies = false,
	channelType,
}) => {
	// Debug logs para verificar os dados das reações (somente em desenvolvimento)
	if (process.env.NODE_ENV === "development") {
		console.log("[ButtonManager] Reactions data:", reactions);
		console.log("[ButtonManager] Buttons data:", buttons);
		console.log(
			"[ButtonManager] Button types received:",
			buttons.map((b) => ({ id: b.id, type: b.type, text: b.text, hasUrl: !!b.url })),
		);
	}

	const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	// Ref to store input values to prevent losing focus during validation
	const buttonInputValues = useRef<Record<string, string>>({});

	// Detect Meta channels (Instagram/Facebook) to filter available button types - memoized to prevent re-renders
	const isMetaChannel = useMemo(
		() => channelType === "Channel::Instagram" || channelType === "Channel::FacebookPage",
		[channelType],
	);

	// Get available button types based on channel - memoized to prevent re-renders
	const availableButtonTypes = useMemo(() => {
		if (isInstagramQuickReplies) {
			// Instagram Quick Replies only supports reply buttons
			return ["reply"] as const;
		}

		if (isMetaChannel) {
			// Meta channels (Instagram/Facebook) only support reply and url buttons
			return ["reply", "url"] as const;
		}

		// All channels support all button types
		return ["reply", "url", "phone_number"] as const;
	}, [isInstagramQuickReplies, isMetaChannel]);

	// ✅ FIX: Função ultra-robusta para gerar IDs únicos com verificação contra IDs existentes
	const idCounterRef = useRef(0);

	// Generate unique ID for new buttons
	const generateButtonId = (): string => {
		const existingIds = buttons.map((b) => b.id);
		let attempts = 0;
		let newId: string;

		do {
			const timestamp = Date.now();
			const counter = ++idCounterRef.current % 10000; // Aumentar limite
			const performance_id = Math.floor(performance.now() * 1000) % 100000; // Usar performance.now() para maior precisão
			const random = Math.random().toString(36).slice(2, 10); // 8 caracteres aleatórios
			const base = `${timestamp}_${counter}_${performance_id}_${random}`;
			newId = `${idPrefix ?? ""}btn_${base}`;
			attempts++;

			// Failsafe: se por algum motivo ainda há colisão após 10 tentativas,
			// força um ID único com timestamp mais preciso
			if (attempts > 10) {
				const microtime = performance.now().toString().replace(".", "");
				const uuid_like = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
				newId = `${idPrefix ?? ""}btn_${microtime}_${attempts}_${uuid_like}_failsafe`;
				break;
			}
		} while (existingIds.includes(newId));

		if (process.env.NODE_ENV === "development") {
			if (attempts > 1) {
				console.warn(`⚠️ [ButtonManager] ID collision avoided after ${attempts} attempts. Final ID: ${newId}`);
			} else {
				console.log(`✅ [ButtonManager] Generated unique ID on first attempt: ${newId}`);
			}
		}

		return newId;
	};

	// Add new button
	const addButton = (type: InteractiveButton["type"] = "reply") => {
		if (buttons.length >= maxButtons) return;

		const newId = generateButtonId();
		const newButton: InteractiveButton = {
			id: newId,
			text: "",
			type,
		};

		// ✅ FIX: Debug temporário para verificar colisões de ID
		if (process.env.NODE_ENV === "development") {
			const existingIds = buttons.map((b) => b.id);
			const hasCollision = existingIds.includes(newId);
			console.log("🆕 [ButtonManager] Adding new button:", {
				newId,
				type,
				existingIds,
				hasCollision,
				buttonCount: buttons.length,
			});

			if (hasCollision) {
				console.error("🚨 [ButtonManager] ID COLLISION DETECTED!", {
					newId,
					existingIds,
					willCauseError: true,
				});
			}
		}

		onChange([...buttons, newButton]);
	};

	// Remove button
	const removeButton = (buttonId: string) => {
		if (process.env.NODE_ENV === "development") {
			console.log("🗑️ [ButtonManager] Removing button:", {
				buttonId,
				currentButtons: buttons.length,
				buttonIds: buttons.map((b) => b.id),
			});
		}

		const newButtons = buttons.filter((button) => button.id !== buttonId);

		if (process.env.NODE_ENV === "development") {
			console.log("🗑️ [ButtonManager] After removal:", {
				newButtonCount: newButtons.length,
				newButtonIds: newButtons.map((b) => b.id),
				wasRemoved: buttons.length !== newButtons.length,
			});
		}

		onChange(newButtons);

		// Remove associated reaction
		if (onReactionChange) {
			const newReactions = reactions.filter((reaction) => reaction.buttonId !== buttonId);
			onReactionChange(newReactions);
		}

		// Clear validation errors for removed button
		const newErrors = { ...validationErrors };
		delete newErrors[buttonId];
		setValidationErrors(newErrors);
	};

	// Drag end -> reorder
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = buttons.findIndex((b) => b.id === active.id);
		const newIndex = buttons.findIndex((b) => b.id === over.id);
		if (oldIndex === -1 || newIndex === -1) return;

		const newOrder = arrayMove(buttons, oldIndex, newIndex);
		onChange(newOrder);
	};

	// Debounced validation function to prevent excessive re-renders - more aggressive debouncing
	const debouncedValidateButton = useMemo(
		() =>
			debounce((buttonId: string, button: InteractiveButton) => {
				validateButton(buttonId, button);
			}, 500), // Increased debounce time to reduce re-renders
		[],
	);

	// Update button with optimizations to prevent input focus loss
	const updateButton = useCallback(
		(buttonId: string, updates: Partial<InteractiveButton>) => {
			// Store text value in ref to prevent focus loss
			if (updates.text !== undefined) {
				buttonInputValues.current[buttonId] = updates.text;
			}

			// Check if the update would actually change the button to avoid unnecessary re-renders
			const existingButton = buttons.find((b) => b.id === buttonId);
			if (!existingButton) return;

			// Check if there are actual changes to avoid triggering onChange unnecessarily
			const hasChanges = Object.keys(updates).some((key) => {
				const updateKey = key as keyof InteractiveButton;
				return existingButton[updateKey] !== updates[updateKey];
			});

			if (!hasChanges) return; // No actual changes, skip update

			const newButtons = buttons.map((button) => {
				if (button.id === buttonId) {
					const updatedButton = { ...button, ...updates };

					// Clear type-specific fields when changing type
					if (updates.type && updates.type !== button.type) {
						if (updates.type !== "url") updatedButton.url = undefined;
						if (updates.type !== "phone_number") updatedButton.phone_number = undefined;

						// Remove reaction if new type doesn't support reactions
						if (!BUTTON_TYPES[updates.type].supportsReactions && onReactionChange) {
							const newReactions = reactions.filter((reaction) => reaction.buttonId !== buttonId);
							onReactionChange(newReactions);
						}
					}

					return updatedButton;
				}
				return button;
			});

			onChange(newButtons);

			// Use debounced validation for text changes to prevent focus loss
			if (updates.text !== undefined) {
				const updatedButton = newButtons.find((b) => b.id === buttonId);
				if (updatedButton) {
					debouncedValidateButton(buttonId, updatedButton);
				}
			} else {
				// Immediate validation for non-text updates
				const updatedButton = newButtons.find((b) => b.id === buttonId);
				if (updatedButton) {
					validateButton(buttonId, updatedButton);
				}
			}
		},
		[buttons, onChange, onReactionChange, reactions, debouncedValidateButton],
	);

	// Validate individual button
	const validateButton = (buttonId: string, button: InteractiveButton) => {
		const errors: string[] = [];

		// Validate text
		errors.push(...validateButtonText(button.text, button.type));

		// Validate type-specific fields
		if (button.type === "url" && button.url !== undefined) {
			errors.push(...validateUrl(button.url));
		}

		if (button.type === "phone_number" && button.phone_number !== undefined) {
			errors.push(...validatePhoneNumber(button.phone_number));
		}

		setValidationErrors((prev) => ({
			...prev,
			[buttonId]: errors,
		}));

		return errors.length === 0;
	};

	// Get button icon
	const getButtonIcon = (type: InteractiveButton["type"]) => {
		const IconComponent = BUTTON_TYPES[type].icon;
		return <IconComponent className="h-4 w-4" />;
	};

	// Check if button has reaction configured
	const hasReaction = (buttonId: string): boolean => {
		return reactions.some(
			(reaction) =>
				reaction.buttonId === buttonId &&
				(reaction.reaction ||
					(reaction as any).textResponse ||
					(reaction as any).textReaction ||
					(reaction as any).emoji),
		);
	};

	// Get all reactions for button
	const getReactions = (buttonId: string): any[] => {
		const allReactions = reactions.filter((reaction) => reaction.buttonId === buttonId);

		if (!allReactions.length) return [];

		return allReactions.map((reaction) => {
			const anyReaction = reaction as any;

			// Se já está no formato correto (com campos diretos type, emoji, textResponse)
			if (anyReaction.type && (anyReaction.emoji || anyReaction.textResponse || anyReaction.action)) {
				return anyReaction;
			}

			// Se tem o formato .reaction nested
			if (anyReaction.reaction) {
				const nestedReaction = anyReaction.reaction;
				return {
					...anyReaction,
					type: nestedReaction.type,
					emoji: nestedReaction.type === "emoji" ? nestedReaction.value : undefined,
					textResponse: nestedReaction.type === "text" ? nestedReaction.value : undefined,
					action: nestedReaction.type === "action" ? nestedReaction.value : undefined,
				};
			}

			// Converter do formato do backend (textResponse, emoji diretos)
			if (anyReaction.textResponse || anyReaction.textReaction) {
				return {
					...anyReaction,
					type: "text",
					textResponse: anyReaction.textResponse || anyReaction.textReaction,
					emoji: undefined,
					action: undefined,
				};
			}

			if (anyReaction.emoji) {
				return {
					...anyReaction,
					type: "emoji",
					emoji: anyReaction.emoji,
					textResponse: undefined,
					action: undefined,
				};
			}

			if (anyReaction.action) {
				return {
					...anyReaction,
					type: "action",
					action: anyReaction.action,
					emoji: undefined,
					textResponse: undefined,
				};
			}

			return anyReaction;
		});
	};

	// Handle reaction configuration (placeholder for integration with EmojiPicker)
	const handleReactionConfig = (buttonId: string) => {
		if (onRequestReactionConfig) return onRequestReactionConfig(buttonId);
		if (process.env.NODE_ENV === "development") console.log("Configure reaction for button:", buttonId);
	};

	// Cleanup debounced function on unmount
	useEffect(() => {
		return () => {
			debouncedValidateButton.cancel();
		};
	}, [debouncedValidateButton]);

	return (
		<div className={cn("space-y-4", className)}>
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<Label className="text-sm font-medium">
						Buttons ({buttons.length}/{maxButtons})
					</Label>
					<p className="text-xs text-muted-foreground">Add interactive buttons to your message</p>
				</div>

				{buttons.length < maxButtons && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button type="button" variant="outline" disabled={disabled} className="h-8">
								<Plus className="h-3 w-3 mr-1" />
								Add Button
								<ChevronDown className="h-3 w-3 ml-2" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							{availableButtonTypes.map((buttonType) => {
								const ButtonIcon = BUTTON_TYPES[buttonType].icon;
								return (
									<DropdownMenuItem key={buttonType} onClick={() => addButton(buttonType)}>
										<ButtonIcon className="h-3 w-3 mr-2" /> {BUTTON_TYPES[buttonType].label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
				<SortableContext items={buttons.map((b) => b.id)} strategy={verticalListSortingStrategy}>
					<div className="space-y-3">
						{buttons.map((button, index) => {
							// ✅ DEBUG: Verificar se o tipo do botão está nos tipos disponíveis
							const isTypeAvailable = (availableButtonTypes as readonly string[]).includes(button.type);
							if (process.env.NODE_ENV === "development" && !isTypeAvailable) {
								console.error(`🚨 [ButtonManager] Button type "${button.type}" not in availableButtonTypes:`, {
									buttonId: button.id,
									buttonType: button.type,
									availableTypes: availableButtonTypes,
									channelType,
									isMetaChannel,
									isInstagramQuickReplies,
								});
							}

							return (
								<SortableItem key={button.id} id={button.id}>
									<Card className="relative">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<Badge variant="outline" className="text-xs">
														Button {index + 1}
													</Badge>
													{getButtonIcon(button.type)}
													<span className="text-sm font-medium">{BUTTON_TYPES[button.type].label}</span>
													{hasReaction(button.id) && (
														<Badge variant="secondary" className="text-xs">
															<Zap className="h-3 w-3 mr-1" />
															Reaction
														</Badge>
													)}
												</div>

												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => removeButton(button.id)}
													disabled={disabled}
													className="h-8 w-8"
												>
													<Trash2 className="h-3 w-3" />
												</Button>
											</div>
										</CardHeader>

										<CardContent className="space-y-4">
											{/* Button Type Selection */}
											<div className="space-y-2">
												<Label className="text-xs font-medium text-muted-foreground">Button Type</Label>
												<Select
													value={button.type}
													onValueChange={(value: InteractiveButton["type"]) => {
														if (process.env.NODE_ENV === "development") {
															console.log(`🔄 [ButtonManager] Changing button type:`, {
																buttonId: button.id,
																oldType: button.type,
																newType: value,
																hasUrl: !!button.url,
																url: button.url,
															});
														}
														updateButton(button.id, { type: value });
													}}
													disabled={disabled}
												>
													<SelectTrigger className="h-8">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{availableButtonTypes.map((type) => {
															const config = BUTTON_TYPES[type];
															return (
																<SelectItem key={type} value={type}>
																	<div className="flex items-center gap-2">
																		{getButtonIcon(type)}
																		<span>{config.label}</span>
																	</div>
																</SelectItem>
															);
														})}
													</SelectContent>
												</Select>
												<p className="text-xs text-muted-foreground">{BUTTON_TYPES[button.type].description}</p>
											</div>

											{/* Button Text */}
											<div className="space-y-2">
												<Label className="text-xs font-medium text-muted-foreground">
													Button Text (max {BUTTON_TYPES[button.type].maxLength} chars)
												</Label>
												<Input
													key={`button-text-${button.id}`}
													value={button.text}
													onChange={(e) => updateButton(button.id, { text: e.target.value })}
													placeholder="Enter button text..."
													disabled={disabled}
													maxLength={BUTTON_TYPES[button.type].maxLength}
													className={cn(
														validationErrors[button.id]?.some((error) => error.includes("text")) &&
															"border-destructive focus-visible:ring-destructive",
													)}
												/>
												<div className="flex justify-between text-xs text-muted-foreground">
													<span>
														{button.text.length}/{BUTTON_TYPES[button.type].maxLength}
													</span>
												</div>
											</div>

											{/* URL Field for URL buttons */}
											{button.type === "url" && (
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">URL</Label>
													<Input
														value={button.url || ""}
														onChange={(e) => updateButton(button.id, { url: e.target.value })}
														placeholder="https://example.com"
														disabled={disabled}
														className={cn(
															validationErrors[button.id]?.some((error) => error.includes("URL")) &&
																"border-destructive focus-visible:ring-destructive",
														)}
													/>
												</div>
											)}

											{/* Phone Number Field for phone buttons */}
											{button.type === "phone_number" && (
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">Phone Number</Label>
													<Input
														value={button.phone_number || ""}
														onChange={(e) => updateButton(button.id, { phone_number: e.target.value })}
														placeholder="+5511999999999"
														disabled={disabled}
														className={cn(
															validationErrors[button.id]?.some((error) => error.includes("phone")) &&
																"border-destructive focus-visible:ring-destructive",
														)}
													/>
													<p className="text-xs text-muted-foreground">Include country code (e.g., +55 for Brazil)</p>
												</div>
											)}

											{/* Button Reactions Section */}
											{BUTTON_TYPES[button.type].supportsReactions && showReactionConfig && (
												<div className="space-y-2 pt-2 border-t">
													<div className="flex items-center justify-between">
														<Label className="text-xs font-medium text-muted-foreground">Reação Configurada</Label>
														<Button
															type="button"
															variant="ghost"
															onClick={() => handleReactionConfig(button.id)}
															disabled={disabled}
															className="h-6 text-xs"
														>
															{hasReaction(button.id) ? "Editar" : "Configurar"}
														</Button>
													</div>

													{hasReaction(button.id) && (
														<div className="space-y-2">
															{getReactions(button.id).map((reactionData, index) => (
																<div key={index} className="p-2 bg-muted/50 rounded-md">
																	<div className="flex items-center justify-between">
																		<div className="flex items-center gap-2">
																			{reactionData?.type === "emoji" ? (
																				<div className="flex items-center gap-1">
																					<Zap className="h-3 w-3 text-muted-foreground" />
																					<span className="text-sm">{reactionData?.emoji}</span>
																				</div>
																			) : reactionData?.type === "text" ? (
																				<div className="flex items-center gap-1">
																					<MessageSquare className="h-3 w-3 text-muted-foreground" />
																					<span
																						className="text-xs text-muted-foreground max-w-[150px] truncate"
																						title={reactionData?.textResponse}
																					>
																						{reactionData?.textResponse}
																					</span>
																				</div>
																			) : (
																				<div className="flex items-center gap-1">
																					<Zap className="h-3 w-3 text-muted-foreground" />
																					<span className="text-xs text-muted-foreground">
																						{reactionData?.action === "handoff"
																							? "Atendente"
																							: String(reactionData?.action || "").startsWith("send_template:")
																								? "Template"
																								: String(reactionData?.action || "").startsWith("send_interactive:")
																									? "Interativa"
																									: "Ação"}
																					</span>
																				</div>
																			)}
																		</div>
																		<Badge variant="secondary" className="text-xs">
																			{reactionData?.type === "emoji"
																				? "Emoji"
																				: reactionData?.type === "text"
																					? "Texto"
																					: reactionData?.action === "handoff"
																						? "Atendente"
																						: String(reactionData?.action || "").startsWith("send_template:")
																							? "Template"
																							: String(reactionData?.action || "").startsWith("send_interactive:")
																								? "Interativa"
																								: "Ação"}
																		</Badge>
																	</div>
																</div>
															))}
														</div>
													)}
												</div>
											)}

											{/* Validation Errors */}
											{validationErrors[button.id] && validationErrors[button.id].length > 0 && (
												<div className="space-y-1">
													{validationErrors[button.id].map((error, errorIndex) => (
														<p key={errorIndex} className="text-xs text-destructive">
															{error}
														</p>
													))}
												</div>
											)}
										</CardContent>
									</Card>
								</SortableItem>
							);
						})}

						{buttons.length === 0 && (
							<Card className="border-dashed">
								<CardContent className="flex flex-col items-center justify-center py-8 text-center">
									<Plus className="h-8 w-8 mb-2 text-muted-foreground" />
									<p className="text-sm text-muted-foreground mb-1">No buttons added yet</p>
									<p className="text-xs text-muted-foreground">
										Click "Add Button" to create your first interactive button
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</SortableContext>
			</DndContext>
		</div>
	);
};

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export const ButtonManager = React.memo(ButtonManagerComponent, (prevProps, nextProps) => {
	// ✅ FIX: Use deep comparison for arrays instead of reference comparison
	// Reference comparison (===) fails when arrays are recreated with same content

	// Compare buttons array by length and content
	const buttonsEqual =
		prevProps.buttons.length === nextProps.buttons.length &&
		prevProps.buttons.every((btn, idx) => {
			const nextBtn = nextProps.buttons[idx];
			return (
				btn.id === nextBtn.id &&
				btn.text === nextBtn.text &&
				btn.type === nextBtn.type &&
				btn.url === nextBtn.url &&
				btn.phone_number === nextBtn.phone_number
			);
		});

	// Compare reactions array by length and content (handle undefined)
	const prevReactions = prevProps.reactions || [];
	const nextReactions = nextProps.reactions || [];
	const reactionsEqual =
		prevReactions.length === nextReactions.length &&
		prevReactions.every((reaction, idx) => {
			const nextReaction = nextReactions[idx];
			return (
				reaction.buttonId === nextReaction.buttonId &&
				JSON.stringify(reaction.reaction) === JSON.stringify(nextReaction.reaction)
			);
		});

	return (
		buttonsEqual &&
		reactionsEqual &&
		prevProps.maxButtons === nextProps.maxButtons &&
		prevProps.disabled === nextProps.disabled &&
		prevProps.className === nextProps.className &&
		prevProps.showReactionConfig === nextProps.showReactionConfig &&
		prevProps.idPrefix === nextProps.idPrefix &&
		prevProps.isInstagramQuickReplies === nextProps.isInstagramQuickReplies &&
		prevProps.channelType === nextProps.channelType
	);
});

ButtonManager.displayName = "ButtonManager";

export default ButtonManager;
