import { toast } from "sonner";
import dagre from "@dagrejs/dagre";
import type { Node, Edge, Viewport, ReactFlowInstance } from "@xyflow/react";
import {
	FlowNodeType,
	validateFlowCanvas,
	BUTTON_TEMPLATE_LIMITS,
	COUPON_TEMPLATE_LIMITS,
	WHATSAPP_TEMPLATE_LIMITS,
	type FlowCanvas as FlowCanvasType,
	type FlowNodeData,
	type InteractiveMessageElementType,
	type InteractiveMessageNodeData,
	type TemplateElementType,
	type ButtonTemplateNodeData,
	type CouponTemplateNodeData,
	type CallTemplateNodeData,
	type UrlTemplateNodeData,
	type WhatsAppTemplateNodeData,
} from "@/types/flow-builder";
import { generateTemplateButtonId } from "@/lib/flow-builder/templateElements";
import {
	createInteractiveMessageElement,
	elementsToLegacyFields,
	getInteractiveMessageButtonElements,
	getInteractiveMessageElements,
	hasConfiguredBody,
} from "@/lib/flow-builder/interactiveMessageElements";

// =============================================================================
// Types
// =============================================================================

export interface ImportStatus {
	success: boolean;
	data: {
		hasExistingCanvas: boolean;
		canImport: boolean;
		stats: { messages: number; reactions: number };
	};
}

export interface FormattedMessage {
	id: string;
	name: string;
	body?: { text?: string };
	header?: { type?: string; text?: string; content?: string; media_url?: string };
	footer?: { text?: string };
	action?: Record<string, unknown>;
}

export interface ExtendedReaction {
	id?: string;
	messageId: string;
	buttonId: string;
	emoji: string;
	label: string;
	action: string;
	textReaction?: string;
	textResponse?: string;
	linkedMessageId?: string | null;
	linkedTemplateMetaId?: string | null;
	actionPayload?: { messageId?: string; emoji?: string; textReaction?: string; action?: string } | null;
}

// =============================================================================
// Validation Service
// =============================================================================

export function validateCanvasForSave(
	nodes: Node[],
	edges: Edge[],
	viewport: Viewport,
): { valid: boolean; errors: string[]; warnings?: string[] } {
	const canvas: FlowCanvasType = {
		nodes: nodes as unknown as FlowCanvasType["nodes"],
		edges: edges as unknown as FlowCanvasType["edges"],
		viewport,
	};
	return validateFlowCanvas(canvas);
}

// =============================================================================
// Auto Layout Service
// =============================================================================

export function calculateAutoLayout(
	nodes: Node[],
	edges: Edge[],
): Map<string, { x: number; y: number }> {
	const graph = new dagre.graphlib.Graph();
	graph.setDefaultEdgeLabel(() => ({}));
	graph.setGraph({
		rankdir: "TB",
		nodesep: 80,
		ranksep: 120,
		edgesep: 40,
	});

	for (const node of nodes) {
		graph.setNode(node.id, { width: 300, height: 180 });
	}
	for (const edge of edges) {
		graph.setEdge(edge.source, edge.target);
	}

	dagre.layout(graph);

	const positions = new Map<string, { x: number; y: number }>();
	for (const node of nodes) {
		const pos = graph.node(node.id);
		positions.set(node.id, { x: pos.x - 150, y: pos.y - 90 });
	}

	return positions;
}

// =============================================================================
// Element Drop Validation Service
// =============================================================================

export interface DropElementResult {
	success: boolean;
	error?: { title: string; description: string };
	newData?: Partial<FlowNodeData>;
}

export function validateInteractiveMessageElementDrop(
	targetData: InteractiveMessageNodeData,
	elementType: InteractiveMessageElementType,
	options?: { isPaymentAnchor?: boolean },
): DropElementResult {
	if (targetData.messageId) {
		return {
			success: false,
			error: {
				title: "Mensagem vinculada",
				description: 'Troque para "Criar mensagem" no editor para usar blocos.',
			},
		};
	}

	const currentElements = getInteractiveMessageElements(targetData);

	// Regras WhatsApp: 1 header, 1 body, 1 footer, max 3 botões
	if (elementType !== "button") {
		if (elementType === "header_text" || elementType === "header_image") {
			const hasAnyHeader = currentElements.some(
				(e) => e.type === "header_text" || e.type === "header_image",
			);
			if (hasAnyHeader) {
				return {
					success: false,
					error: {
						title: "Header já existe",
						description: "Apenas UM header por mensagem. Delete o existente primeiro.",
					},
				};
			}
		} else if (currentElements.some((e) => e.type === elementType)) {
			return {
				success: false,
				error: {
					title: "Elemento já existe",
					description: "Este tipo de elemento já está na mensagem.",
				},
			};
		}
	} else {
		const existingButtons = getInteractiveMessageButtonElements(currentElements);
		if (existingButtons.length >= 3) {
			return {
				success: false,
				error: {
					title: "Limite de botões",
					description: "Máximo de 3 botões por mensagem interativa.",
				},
			};
		}
	}

	const newElement = createInteractiveMessageElement(elementType, options);
	const nextElements = [...currentElements, newElement];
	const legacy = elementsToLegacyFields(nextElements);

	return {
		success: true,
		newData: {
			elements: nextElements,
			...legacy,
			isConfigured: hasConfiguredBody(nextElements),
		} as unknown as Partial<FlowNodeData>,
	};
}

export function validateTemplateElementDrop(
	targetNode: Node,
	elementType: InteractiveMessageElementType,
): DropElementResult {
	const targetData = targetNode.data as unknown as InteractiveMessageNodeData;
	const currentElements = targetData.elements || [];
	const nodeType = targetNode.type as FlowNodeType;

	// Templates não aceitam footer
	if (elementType === "footer") {
		return {
			success: false,
			error: {
				title: "Elemento não suportado",
				description: "Templates oficiais do WhatsApp não suportam rodapé.",
			},
		};
	}

	// Validar headers (templates aceitam apenas 1 header)
	if (elementType === "header_text" || elementType === "header_image") {
		const hasAnyHeader = currentElements.some(
			(e: { type: string }) => e.type === "header_text" || e.type === "header_image",
		);
		if (hasAnyHeader) {
			return {
				success: false,
				error: {
					title: "Header já existe",
					description: "Apenas UM header por template. Delete o existente primeiro.",
				},
			};
		}
	}

	// Validar body (apenas 1)
	if (elementType === "body") {
		const hasBody = currentElements.some((e: { type: string }) => e.type === "body");
		if (hasBody) {
			return {
				success: false,
				error: {
					title: "Body já existe",
					description: "O template já tem um corpo de texto.",
				},
			};
		}
	}

	// Validar limite de botões por tipo de template
	if (elementType === "button") {
		const existingButtons = currentElements.filter((e: { type: string }) => e.type === "button");
		let maxButtons = 10;
		let templateName = "Template";

		if (nodeType === FlowNodeType.WHATSAPP_TEMPLATE) {
			maxButtons = WHATSAPP_TEMPLATE_LIMITS.maxButtons;
			templateName = "Template WhatsApp";
		} else if (nodeType === FlowNodeType.BUTTON_TEMPLATE) {
			maxButtons = BUTTON_TEMPLATE_LIMITS.maxButtons;
			templateName = "Button Template";
		} else if (nodeType === FlowNodeType.URL_TEMPLATE) {
			maxButtons = 2;
			templateName = "URL Template";
		} else if (nodeType === FlowNodeType.CALL_TEMPLATE) {
			maxButtons = 1;
			templateName = "Call Template";
		} else if (nodeType === FlowNodeType.COUPON_TEMPLATE) {
			maxButtons = COUPON_TEMPLATE_LIMITS.maxButtons;
			templateName = "Coupon Template";
		}

		if (existingButtons.length >= maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite de botões",
					description: `${templateName} suporta no máximo ${maxButtons} botão(ões).`,
				},
			};
		}
	}

	const newElement = createInteractiveMessageElement(elementType);
	const nextElements = [...currentElements, newElement];
	const legacy = elementsToLegacyFields(nextElements);

	return {
		success: true,
		newData: {
			elements: nextElements,
			...legacy,
			isConfigured: nextElements.some((e: { type: string }) => e.type === "body"),
		} as unknown as Partial<FlowNodeData>,
	};
}

// =============================================================================
// Template Element Drop Service
// =============================================================================

export function handleWhatsAppTemplateElementDrop(
	targetNode: Node,
	elementType: TemplateElementType,
): DropElementResult {
	const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData;
	const currentElements =
		currentData.elements ||
		getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

	// body
	if (elementType === "body") {
		const hasBody = currentElements.some((e: { type: string }) => e.type === "body");
		if (hasBody) {
			return {
				success: false,
				error: { title: "Body já existe", description: "Edite o texto diretamente no canvas." },
			};
		}
		const newElement = createInteractiveMessageElement("body");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: {
				elements: nextElements,
				...legacy,
				isConfigured: true,
			} as unknown as Partial<FlowNodeData>,
		};
	}

	// header_text
	if (elementType === "header_text") {
		const hasHeader = currentElements.some(
			(e: { type: string }) => e.type === "header_text" || e.type === "header_image",
		);
		if (hasHeader) {
			return {
				success: false,
				error: { title: "Header já existe", description: "Delete o header existente primeiro." },
			};
		}
		const newElement = createInteractiveMessageElement("header_text");
		const nextElements = [newElement, ...currentElements];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// header_image
	if (elementType === "header_image") {
		const hasHeader = currentElements.some(
			(e: { type: string }) => e.type === "header_text" || e.type === "header_image",
		);
		if (hasHeader) {
			return {
				success: false,
				error: { title: "Header já existe", description: "Delete o header existente primeiro." },
			};
		}
		const newElement = createInteractiveMessageElement("header_image");
		const nextElements = [newElement, ...currentElements];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// footer
	if (elementType === "footer") {
		const hasFooter = currentElements.some((e: { type: string }) => e.type === "footer");
		if (hasFooter) {
			return {
				success: false,
				error: { title: "Footer já existe", description: "Edite o texto diretamente no canvas." },
			};
		}
		const newElement = createInteractiveMessageElement("footer");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// button (QUICK_REPLY)
	if (elementType === "button" || elementType === "button_quick_reply") {
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões permitidos.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// button_url
	if (elementType === "button_url") {
		const urlButtons = currentElements.filter((e: { type: string }) => e.type === "button_url");
		if (urlButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons} botões URL permitidos.`,
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_url");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// button_phone
	if (elementType === "button_phone") {
		const phoneButtons = currentElements.filter((e: { type: string }) => e.type === "button_phone");
		const voiceCallButtons = currentElements.filter((e: { type: string }) => e.type === "button_voice_call");
		if (phoneButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons} botão de ligação.`,
				},
			};
		}
		if (voiceCallButtons.length > 0) {
			return {
				success: false,
				error: {
					title: "Não permitido",
					description: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template.",
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_phone");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// button_voice_call
	if (elementType === "button_voice_call") {
		const voiceCallButtons = currentElements.filter((e: { type: string }) => e.type === "button_voice_call");
		const phoneButtons = currentElements.filter((e: { type: string }) => e.type === "button_phone");
		if (voiceCallButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons} botão Ligar WhatsApp.`,
				},
			};
		}
		if (phoneButtons.length > 0) {
			return {
				success: false,
				error: {
					title: "Não permitido",
					description: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template.",
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_voice_call");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	// button_copy_code
	if (elementType === "button_copy_code") {
		const copyCodeButtons = currentElements.filter((e: { type: string }) => e.type === "button_copy_code");
		if (copyCodeButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons} botão Copiar Código.`,
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_copy_code");
		const nextElements = [...currentElements, newElement];
		const legacy = elementsToLegacyFields(nextElements);
		return {
			success: true,
			newData: { elements: nextElements, ...legacy } as unknown as Partial<FlowNodeData>,
		};
	}

	return { success: false, error: { title: "Elemento não suportado", description: "" } };
}

export function handleButtonTemplateQuickReplyDrop(targetNode: Node): DropElementResult {
	const currentData = targetNode.data as unknown as ButtonTemplateNodeData;
	const currentButtons = currentData.buttons || [];
	if (currentButtons.length >= BUTTON_TEMPLATE_LIMITS.maxButtons) {
		return {
			success: false,
			error: {
				title: "Limite atingido",
				description: `Button Template suporta no máximo ${BUTTON_TEMPLATE_LIMITS.maxButtons} botões.`,
			},
		};
	}
	const newButton = {
		id: generateTemplateButtonId(),
		type: "QUICK_REPLY" as const,
		text: `Botão ${currentButtons.length + 1}`,
	};
	return {
		success: true,
		newData: { buttons: [...currentButtons, newButton] } as Partial<FlowNodeData>,
	};
}

export function handleCouponOrWhatsAppQuickReplyDrop(
	targetNode: Node,
	nodeType: FlowNodeType,
): DropElementResult {
	const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData | CouponTemplateNodeData;
	const currentElements =
		currentData.elements ||
		getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
	const totalButtons = currentElements.filter(
		(e: { type: string }) =>
			e.type === "button" ||
			e.type === "button_copy_code" ||
			e.type === "button_phone" ||
			e.type === "button_voice_call" ||
			e.type === "button_url",
	).length;
	const maxButtons =
		nodeType === FlowNodeType.WHATSAPP_TEMPLATE
			? WHATSAPP_TEMPLATE_LIMITS.maxButtons
			: COUPON_TEMPLATE_LIMITS.maxButtons;
	if (totalButtons >= maxButtons) {
		return {
			success: false,
			error: { title: "Limite atingido", description: `Máximo de ${maxButtons} botões permitidos.` },
		};
	}
	const newElement = createInteractiveMessageElement("button");
	const nextElements = [...currentElements, newElement];
	return {
		success: true,
		newData: { elements: nextElements } as unknown as Partial<FlowNodeData>,
	};
}

export function handleUrlButtonDrop(
	targetNode: Node,
	nodeType: FlowNodeType,
): DropElementResult {
	// WHATSAPP_TEMPLATE: usa elements
	if (nodeType === FlowNodeType.WHATSAPP_TEMPLATE) {
		const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData;
		const currentElements =
			currentData.elements ||
			getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
		const urlButtons = currentElements.filter((e: { type: string }) => e.type === "button_url");
		if (urlButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons} botões URL permitidos.`,
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_url");
		const nextElements = [...currentElements, newElement];
		return {
			success: true,
			newData: { elements: nextElements } as unknown as Partial<FlowNodeData>,
		};
	}

	// URL_TEMPLATE ou COUPON_TEMPLATE legacy
	const currentData = targetNode.data as unknown as UrlTemplateNodeData;
	const currentButtons = (currentData.buttons || []).filter((b: { type?: string }) => b.type === "URL");
	const maxUrlButtons = 2;
	if (currentButtons.length >= maxUrlButtons) {
		return {
			success: false,
			error: { title: "Limite atingido", description: `Máximo de ${maxUrlButtons} botões URL permitidos.` },
		};
	}
	const newButton = {
		id: generateTemplateButtonId(),
		type: "URL" as const,
		text: `Link ${currentButtons.length + 1}`,
		url: "https://",
	};
	return {
		success: true,
		newData: { buttons: [...(currentData.buttons || []), newButton] } as Partial<FlowNodeData>,
	};
}

export function handlePhoneButtonDrop(
	targetNode: Node,
	nodeType: FlowNodeType,
): DropElementResult {
	// WHATSAPP_TEMPLATE: usa elements
	if (nodeType === FlowNodeType.WHATSAPP_TEMPLATE) {
		const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData;
		const currentElements =
			currentData.elements ||
			getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
		const phoneButtons = currentElements.filter((e: { type: string }) => e.type === "button_phone");
		const voiceCallButtons = currentElements.filter((e: { type: string }) => e.type === "button_voice_call");
		if (phoneButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons} botão de ligação.`,
				},
			};
		}
		if (voiceCallButtons.length > 0) {
			return {
				success: false,
				error: {
					title: "Não permitido",
					description: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template.",
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_phone");
		const nextElements = [...currentElements, newElement];
		return {
			success: true,
			newData: { elements: nextElements } as unknown as Partial<FlowNodeData>,
		};
	}

	// COUPON_TEMPLATE
	if (nodeType === FlowNodeType.COUPON_TEMPLATE) {
		const currentData = targetNode.data as unknown as CouponTemplateNodeData;
		const currentElements = currentData.elements || [];
		const phoneButtons = currentElements.filter((e: { type: string }) => e.type === "button_phone");
		if (phoneButtons.length >= 1) {
			return {
				success: false,
				error: { title: "Limite atingido", description: "Máximo de 1 botão de ligação no Coupon Template." },
			};
		}
		return {
			success: true,
			newData: { phoneNumber: "", buttonText: "Ligar" } as Partial<FlowNodeData>,
		};
	}

	// CALL_TEMPLATE
	const currentData = targetNode.data as unknown as CallTemplateNodeData;
	if (currentData.phoneNumber) {
		return {
			success: false,
			error: { title: "Telefone já configurado", description: "Clique duas vezes no nó para editar." },
		};
	}
	return {
		success: true,
		newData: { phoneNumber: "", buttonText: "Ligar" } as Partial<FlowNodeData>,
	};
}

export function handleVoiceCallButtonDrop(targetNode: Node): DropElementResult {
	const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData;
	const currentElements =
		currentData.elements ||
		getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
	const voiceCallButtons = currentElements.filter((e: { type: string }) => e.type === "button_voice_call");
	const phoneButtons = currentElements.filter((e: { type: string }) => e.type === "button_phone");
	if (voiceCallButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons) {
		return {
			success: false,
			error: {
				title: "Limite atingido",
				description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons} botão Ligar WhatsApp.`,
			},
		};
	}
	if (phoneButtons.length > 0) {
		return {
			success: false,
			error: {
				title: "Não permitido",
				description: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template.",
			},
		};
	}
	const totalButtons = currentElements.filter(
		(e: { type: string }) =>
			e.type === "button" ||
			e.type === "button_copy_code" ||
			e.type === "button_phone" ||
			e.type === "button_voice_call" ||
			e.type === "button_url",
	).length;
	if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
		return {
			success: false,
			error: {
				title: "Limite atingido",
				description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
			},
		};
	}
	const newElement = createInteractiveMessageElement("button_voice_call");
	const nextElements = [...currentElements, newElement];
	return {
		success: true,
		newData: { elements: nextElements } as unknown as Partial<FlowNodeData>,
	};
}

export function handleCopyCodeButtonDrop(
	targetNode: Node,
	nodeType: FlowNodeType,
): DropElementResult {
	// WHATSAPP_TEMPLATE: usa elements
	if (nodeType === FlowNodeType.WHATSAPP_TEMPLATE) {
		const currentData = targetNode.data as unknown as WhatsAppTemplateNodeData;
		const currentElements =
			currentData.elements ||
			getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
		const copyCodeButtons = currentElements.filter((e: { type: string }) => e.type === "button_copy_code");
		if (copyCodeButtons.length >= WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons} botão Copiar Código.`,
				},
			};
		}
		const totalButtons = currentElements.filter(
			(e: { type: string }) =>
				e.type === "button" ||
				e.type === "button_copy_code" ||
				e.type === "button_phone" ||
				e.type === "button_voice_call" ||
				e.type === "button_url",
		).length;
		if (totalButtons >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
			return {
				success: false,
				error: {
					title: "Limite atingido",
					description: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões totais.`,
				},
			};
		}
		const newElement = createInteractiveMessageElement("button_copy_code");
		const nextElements = [...currentElements, newElement];
		return {
			success: true,
			newData: { elements: nextElements } as unknown as Partial<FlowNodeData>,
		};
	}

	// COUPON_TEMPLATE
	const currentData = targetNode.data as unknown as CouponTemplateNodeData;
	if (currentData.couponCode) {
		return {
			success: false,
			error: { title: "Código já configurado", description: "Clique duas vezes no nó para editar." },
		};
	}
	return {
		success: true,
		newData: { couponCode: "", buttonText: "Copiar código" } as Partial<FlowNodeData>,
	};
}

// =============================================================================
// API Service
// =============================================================================

export async function fetchImportStatus(caixaId: string): Promise<ImportStatus> {
	const res = await fetch(`/api/admin/mtf-diamante/flow-canvas/import?inboxId=${caixaId}`);
	return res.json();
}

export async function importReactions(caixaId: string): Promise<{ success: boolean; error?: string }> {
	const res = await fetch("/api/admin/mtf-diamante/flow-canvas/import", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ inboxId: caixaId }),
	});
	return res.json();
}

// =============================================================================
// Message Formatting Service
// =============================================================================

export function formatMessagesForDialog(
	interactiveMessages: Array<{
		id?: string;
		name?: string;
		body?: unknown;
		header?: unknown;
		footer?: unknown;
		action?: unknown;
	}> | null | undefined,
): FormattedMessage[] {
	return (interactiveMessages ?? []).map((m) => {
		const content = (m as unknown as Record<string, unknown>).content as Record<string, unknown> | undefined;
		return {
			id: m.id ?? "",
			name: m.name ?? "Sem nome",
			body: (content?.body ?? m.body) as { text?: string } | undefined,
			header: (content?.header ?? m.header) as
				| { type?: string; text?: string; content?: string; media_url?: string }
				| undefined,
			footer: (content?.footer ?? m.footer) as { text?: string } | undefined,
			action: (content?.action ?? m.action) as Record<string, unknown> | undefined,
		};
	});
}
