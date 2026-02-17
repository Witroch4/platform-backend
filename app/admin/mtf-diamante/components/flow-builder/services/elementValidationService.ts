import {
	FlowNodeType,
	BUTTON_TEMPLATE_LIMITS,
	COUPON_TEMPLATE_LIMITS,
	WHATSAPP_TEMPLATE_LIMITS,
	type InteractiveMessageElement,
	type TemplateElementType,
} from "@/types/flow-builder";

interface ValidationResult {
	valid: boolean;
	message?: string;
}

type InteractiveElement = InteractiveMessageElement | { type: string };

/**
 * Serviço de validação de elementos para o Flow Builder.
 * Compartilhado entre diferentes handlers para garantir consistência.
 */
export const elementValidationService = {
	/**
	 * Valida se pode adicionar um header (apenas 1 permitido)
	 */
	validateHeader(elements: InteractiveElement[]): ValidationResult {
		const hasHeader = elements.some((e) => e.type === "header_text" || e.type === "header_image");
		return hasHeader ? { valid: false, message: "Apenas UM header por mensagem. Delete o existente primeiro." } : { valid: true };
	},

	/**
	 * Valida se pode adicionar um body (apenas 1 permitido)
	 */
	validateBody(elements: InteractiveElement[]): ValidationResult {
		const hasBody = elements.some((e) => e.type === "body");
		return hasBody ? { valid: false, message: "O template já tem um corpo de texto." } : { valid: true };
	},

	/**
	 * Valida se pode adicionar um footer (apenas 1 permitido)
	 */
	validateFooter(elements: InteractiveElement[]): ValidationResult {
		const hasFooter = elements.some((e) => e.type === "footer");
		return hasFooter ? { valid: false, message: "Footer já existe." } : { valid: true };
	},

	/**
	 * Valida limite de botões para Mensagem Interativa (max 3)
	 */
	validateInteractiveButtons(elements: InteractiveElement[]): ValidationResult {
		const buttonCount = elements.filter((e) => e.type === "button").length;
		return buttonCount >= 3
			? { valid: false, message: "Máximo de 3 botões por mensagem interativa." }
			: { valid: true };
	},

	/**
	 * Valida limite de botões para um tipo de template específico
	 */
	validateTemplateButtons(nodeType: FlowNodeType, elements: InteractiveElement[]): ValidationResult {
		const buttonTypes = ["button", "button_copy_code", "button_phone", "button_voice_call", "button_url"];
		const totalButtons = elements.filter((e) => buttonTypes.includes(e.type)).length;

		let maxButtons = 10;
		let templateName = "Template";

		switch (nodeType) {
			case FlowNodeType.WHATSAPP_TEMPLATE:
				maxButtons = WHATSAPP_TEMPLATE_LIMITS.maxButtons;
				templateName = "Template WhatsApp";
				break;
			case FlowNodeType.BUTTON_TEMPLATE:
				maxButtons = BUTTON_TEMPLATE_LIMITS.maxButtons;
				templateName = "Button Template";
				break;
			case FlowNodeType.URL_TEMPLATE:
				maxButtons = 2;
				templateName = "URL Template";
				break;
			case FlowNodeType.CALL_TEMPLATE:
				maxButtons = 1;
				templateName = "Call Template";
				break;
			case FlowNodeType.COUPON_TEMPLATE:
				maxButtons = COUPON_TEMPLATE_LIMITS.maxButtons;
				templateName = "Coupon Template";
				break;
		}

		return totalButtons >= maxButtons
			? { valid: false, message: `${templateName} suporta no máximo ${maxButtons} botão(ões).` }
			: { valid: true };
	},

	/**
	 * Valida limite de botões URL (WhatsApp Template)
	 */
	validateUrlButtons(elements: InteractiveElement[]): ValidationResult {
		const urlButtons = elements.filter((e) => e.type === "button_url").length;
		return urlButtons >= WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons
			? { valid: false, message: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons} botões URL permitidos.` }
			: { valid: true };
	},

	/**
	 * Valida limite de botões de telefone (WhatsApp Template)
	 */
	validatePhoneButtons(elements: InteractiveElement[]): ValidationResult {
		const phoneButtons = elements.filter((e) => e.type === "button_phone").length;
		return phoneButtons >= WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons
			? { valid: false, message: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons} botão de ligação.` }
			: { valid: true };
	},

	/**
	 * Valida limite de botões de voice call (WhatsApp Template)
	 */
	validateVoiceCallButtons(elements: InteractiveElement[]): ValidationResult {
		const voiceCallButtons = elements.filter((e) => e.type === "button_voice_call").length;
		return voiceCallButtons >= WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons
			? { valid: false, message: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons} botão Ligar WhatsApp.` }
			: { valid: true };
	},

	/**
	 * Valida conflito entre botão phone e voice_call (mutuamente exclusivos)
	 */
	validatePhoneVoiceCallConflict(elements: InteractiveElement[], newType: "button_phone" | "button_voice_call"): ValidationResult {
		const hasPhone = elements.some((e) => e.type === "button_phone");
		const hasVoiceCall = elements.some((e) => e.type === "button_voice_call");

		if (newType === "button_phone" && hasVoiceCall) {
			return { valid: false, message: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template." };
		}
		if (newType === "button_voice_call" && hasPhone) {
			return { valid: false, message: "Não é possível ter Ligar e Ligar WhatsApp no mesmo template." };
		}

		return { valid: true };
	},

	/**
	 * Valida limite de botões copy code (WhatsApp Template)
	 */
	validateCopyCodeButtons(elements: InteractiveElement[]): ValidationResult {
		const copyCodeButtons = elements.filter((e) => e.type === "button_copy_code").length;
		return copyCodeButtons >= WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons
			? { valid: false, message: `Máximo de ${WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons} botão Copiar Código.` }
			: { valid: true };
	},

	/**
	 * Valida se o elemento já existe (para tipos únicos)
	 */
	validateUniqueElement(elements: InteractiveElement[], elementType: string): ValidationResult {
		const exists = elements.some((e) => e.type === elementType);
		return exists
			? { valid: false, message: "Este tipo de elemento já está na mensagem." }
			: { valid: true };
	},

	/**
	 * Verifica se o tipo de template suporta footer
	 */
	templateSupportsFooter(nodeType: FlowNodeType): boolean {
		// Apenas WHATSAPP_TEMPLATE suporta footer atualmente
		return nodeType === FlowNodeType.WHATSAPP_TEMPLATE;
	},

	/**
	 * Verifica se o nó é um tipo de template válido
	 */
	isTemplateNode(nodeType: FlowNodeType): boolean {
		const templateTypes = [
			FlowNodeType.WHATSAPP_TEMPLATE,
			FlowNodeType.BUTTON_TEMPLATE,
			FlowNodeType.COUPON_TEMPLATE,
			FlowNodeType.CALL_TEMPLATE,
			FlowNodeType.URL_TEMPLATE,
		];
		return templateTypes.includes(nodeType);
	},

	/**
	 * Verifica quais tipos de botões são válidos para um tipo de template
	 */
	getValidButtonTypesForTemplate(nodeType: FlowNodeType): TemplateElementType[] {
		switch (nodeType) {
			case FlowNodeType.WHATSAPP_TEMPLATE:
				return ["button_quick_reply", "button_url", "button_phone", "button_voice_call", "button_copy_code"];
			case FlowNodeType.BUTTON_TEMPLATE:
				return ["button_quick_reply"];
			case FlowNodeType.URL_TEMPLATE:
				return ["button_url"];
			case FlowNodeType.CALL_TEMPLATE:
				return ["button_phone"];
			case FlowNodeType.COUPON_TEMPLATE:
				return ["button_quick_reply", "button_url", "button_phone", "button_copy_code"];
			default:
				return [];
		}
	},
};

export default elementValidationService;
