/**
 * templateElements.ts
 *
 * Helper functions for WhatsApp Official Template elements in the Flow Builder.
 * Handles button ID generation, template validation, and payload conversion.
 */

import type {
	TemplateNodeData,
	TemplateButton,
	TemplateHeader,
	TemplateBody,
	TemplateFooter,
	TemplateButtonType,
	TemplateCategory,
} from "@/types/flow-builder";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Prefix for template button IDs (used by FlowOrchestrator to detect template buttons)
 */
export const TEMPLATE_BUTTON_PREFIX = "flow_tpl_btn_";

/**
 * Validation limits for WhatsApp templates
 */
export const TEMPLATE_LIMITS = {
	/** Template name: lowercase letters and underscores only */
	namePattern: /^[a-z][a-z0-9_]*$/,
	/** Body text max length */
	bodyMaxLength: 1024,
	/** Header text max length */
	headerTextMaxLength: 60,
	/** Footer text max length */
	footerMaxLength: 60,
	/** Button text max length */
	buttonTextMaxLength: 25,
	/** Coupon code max length (for COPY_CODE buttons) */
	couponCodeMaxLength: 15,
	/** Max total buttons */
	maxButtons: 10,
	/** Max QUICK_REPLY buttons (templates oficiais permitem até 10) */
	maxQuickReplyButtons: 10,
	/** Max URL buttons */
	maxUrlButtons: 2,
	/** Variable pattern */
	variablePattern: /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
} as const;

// =============================================================================
// ID GENERATION
// =============================================================================

/**
 * Generates a unique ID for a template button
 * Uses `flow_tpl_btn_` prefix to distinguish from interactive message buttons
 */
export function generateTemplateButtonId(): string {
	return `${TEMPLATE_BUTTON_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Checks if a button ID belongs to a template button
 */
export function isTemplateButton(buttonId: string): boolean {
	return buttonId.startsWith(TEMPLATE_BUTTON_PREFIX);
}

// =============================================================================
// VALIDATION
// =============================================================================

export interface TemplateValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Validates a template name according to Meta API rules
 */
export function validateTemplateName(name: string): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!name || name.trim() === "") {
		errors.push("Nome do template é obrigatório");
	} else if (!TEMPLATE_LIMITS.namePattern.test(name)) {
		errors.push("Nome deve conter apenas letras minúsculas, números e underscores, iniciando com letra");
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates template body text
 */
export function validateTemplateBody(body?: TemplateBody): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!body || !body.text || body.text.trim() === "") {
		errors.push("Corpo do template é obrigatório");
	} else {
		if (body.text.length > TEMPLATE_LIMITS.bodyMaxLength) {
			errors.push(`Corpo excede limite de ${TEMPLATE_LIMITS.bodyMaxLength} caracteres`);
		}
		if (body.text.length > TEMPLATE_LIMITS.bodyMaxLength * 0.9) {
			warnings.push("Corpo está próximo do limite de caracteres");
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates template header
 */
export function validateTemplateHeader(header?: TemplateHeader): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!header || header.type === "NONE") {
		return { valid: true, errors, warnings };
	}

	if (header.type === "TEXT") {
		if (header.content && header.content.length > TEMPLATE_LIMITS.headerTextMaxLength) {
			errors.push(`Header texto excede limite de ${TEMPLATE_LIMITS.headerTextMaxLength} caracteres`);
		}
	}

	if (["IMAGE", "VIDEO", "DOCUMENT"].includes(header.type) && !header.mediaUrl) {
		warnings.push("Header de mídia sem URL configurada");
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates template footer
 */
export function validateTemplateFooter(footer?: TemplateFooter): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!footer || !footer.text) {
		return { valid: true, errors, warnings };
	}

	if (footer.text.length > TEMPLATE_LIMITS.footerMaxLength) {
		errors.push(`Rodapé excede limite de ${TEMPLATE_LIMITS.footerMaxLength} caracteres`);
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates template buttons
 */
export function validateTemplateButtons(buttons?: TemplateButton[]): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!buttons || buttons.length === 0) {
		return { valid: true, errors, warnings };
	}

	if (buttons.length > TEMPLATE_LIMITS.maxButtons) {
		errors.push(`Máximo de ${TEMPLATE_LIMITS.maxButtons} botões permitido`);
	}

	// Count by type
	const quickReplyCount = buttons.filter((b) => b.type === "QUICK_REPLY").length;
	const urlCount = buttons.filter((b) => b.type === "URL").length;
	const phoneCount = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
	const voiceCallCount = buttons.filter((b) => b.type === "VOICE_CALL").length;
	const copyCodeCount = buttons.filter((b) => b.type === "COPY_CODE").length;

	if (quickReplyCount > TEMPLATE_LIMITS.maxQuickReplyButtons) {
		errors.push(`Máximo de ${TEMPLATE_LIMITS.maxQuickReplyButtons} botões QUICK_REPLY permitido`);
	}

	if (urlCount > TEMPLATE_LIMITS.maxUrlButtons) {
		errors.push(`Máximo de ${TEMPLATE_LIMITS.maxUrlButtons} botões URL permitido`);
	}

	// CTA limits: max 1 of each
	if (phoneCount > 1) {
		errors.push("Máximo de 1 botão Telefone permitido");
	}

	if (voiceCallCount > 1) {
		errors.push("Máximo de 1 botão Ligar WhatsApp permitido");
	}

	if (copyCodeCount > 1) {
		errors.push("Máximo de 1 botão Copiar Código permitido");
	}

	// Mutual exclusivity: PHONE_NUMBER and VOICE_CALL cannot coexist
	if (phoneCount > 0 && voiceCallCount > 0) {
		errors.push("Não é permitido ter botões Telefone e Ligar WhatsApp juntos");
	}

	for (const btn of buttons) {
		if (!btn.text || btn.text.trim() === "") {
			errors.push("Todos os botões devem ter texto");
			break;
		}
		if (btn.text.length > TEMPLATE_LIMITS.buttonTextMaxLength) {
			errors.push(`Texto do botão "${btn.text}" excede ${TEMPLATE_LIMITS.buttonTextMaxLength} caracteres`);
		}

		// Validate COPY_CODE coupon length
		if (btn.type === "COPY_CODE" && btn.exampleCode) {
			if (btn.exampleCode.length > TEMPLATE_LIMITS.couponCodeMaxLength) {
				errors.push(`Código do cupom excede ${TEMPLATE_LIMITS.couponCodeMaxLength} caracteres`);
			}
		}

		// Validate URL buttons have URL
		if (btn.type === "URL" && !btn.url) {
			errors.push(`Botão URL "${btn.text}" precisa de uma URL`);
		}

		// Validate PHONE_NUMBER buttons have phone
		if (btn.type === "PHONE_NUMBER" && !btn.phoneNumber) {
			errors.push(`Botão Telefone "${btn.text}" precisa de um número`);
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates a complete template node data
 */
export function validateTemplateNodeData(data: TemplateNodeData): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Validate name
	if (data.templateName) {
		const nameResult = validateTemplateName(data.templateName);
		errors.push(...nameResult.errors);
		warnings.push(...nameResult.warnings);
	}

	// Validate body
	const bodyResult = validateTemplateBody(data.body);
	errors.push(...bodyResult.errors);
	warnings.push(...bodyResult.warnings);

	// Validate header
	const headerResult = validateTemplateHeader(data.header);
	errors.push(...headerResult.errors);
	warnings.push(...headerResult.warnings);

	// Validate footer
	const footerResult = validateTemplateFooter(data.footer);
	errors.push(...footerResult.errors);
	warnings.push(...footerResult.warnings);

	// Validate buttons
	const buttonsResult = validateTemplateButtons(data.buttons);
	errors.push(...buttonsResult.errors);
	warnings.push(...buttonsResult.warnings);

	return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// VARIABLE EXTRACTION
// =============================================================================

/**
 * Extracts variable names from template text
 * E.g., "Olá {{nome}}, seu pedido {{pedido_id}}" -> ["nome", "pedido_id"]
 */
export function extractVariables(text: string): string[] {
	const matches = text.matchAll(TEMPLATE_LIMITS.variablePattern);
	const variables = new Set<string>();
	for (const match of matches) {
		variables.add(match[1]);
	}
	return Array.from(variables);
}

/**
 * Extracts all variables from a template node data
 */
export function extractAllVariables(data: TemplateNodeData): string[] {
	const variables = new Set<string>();

	// Header variables
	if (data.header?.type === "TEXT" && data.header.content) {
		extractVariables(data.header.content).forEach((v) => variables.add(v));
	}

	// Body variables
	if (data.body?.text) {
		extractVariables(data.body.text).forEach((v) => variables.add(v));
	}

	return Array.from(variables);
}

// =============================================================================
// META API PAYLOAD CONVERSION
// =============================================================================

export interface MetaTemplateComponent {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	format?: string;
	text?: string;
	example?: {
		header_text?: string[];
		body_text?: string[][];
		header_handle?: string[];
	};
	buttons?: MetaTemplateButton[];
}

export interface MetaTemplateButton {
	type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "VOICE_CALL" | "FLOW" | "SPM" | "MPM";
	text: string;
	url?: string;
	phone_number?: string;
	example?: string[];
	flow_id?: string;
	/** TTL em minutos para VOICE_CALL (padrão: 10080 = 7 dias) */
	ttl_minutes?: number;
}

/**
 * Converts TemplateNodeData to Meta API template creation payload
 */
export function toMetaTemplatePayload(
	data: TemplateNodeData,
	category: TemplateCategory = "MARKETING",
): {
	name: string;
	category: string;
	language: string;
	components: MetaTemplateComponent[];
	parameter_format: "NAMED";
} {
	const components: MetaTemplateComponent[] = [];

	// Header component
	if (data.header && data.header.type !== "NONE") {
		const headerComponent: MetaTemplateComponent = {
			type: "HEADER",
		};

		if (data.header.type === "TEXT" && data.header.content) {
			headerComponent.format = "TEXT";
			headerComponent.text = data.header.content;
			const headerVars = extractVariables(data.header.content);
			if (headerVars.length > 0) {
				headerComponent.example = {
					header_text: headerVars.map((v) => `exemplo_${v}`),
				};
			}
		} else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(data.header.type)) {
			headerComponent.format = data.header.type;
			if (data.header.mediaUrl) {
				headerComponent.example = {
					header_handle: [data.header.mediaUrl],
				};
			}
		}

		components.push(headerComponent);
	}

	// Body component (required)
	if (data.body?.text) {
		const bodyVars = extractVariables(data.body.text);
		const bodyComponent: MetaTemplateComponent = {
			type: "BODY",
			text: data.body.text,
		};
		if (bodyVars.length > 0) {
			bodyComponent.example = {
				body_text: [bodyVars.map((v) => `exemplo_${v}`)],
			};
		}
		components.push(bodyComponent);
	}

	// Footer component
	if (data.footer?.text) {
		components.push({
			type: "FOOTER",
			text: data.footer.text,
		});
	}

	// Buttons component
	if (data.buttons && data.buttons.length > 0) {
		const metaButtons: MetaTemplateButton[] = data.buttons.map((btn) => {
			const metaBtn: MetaTemplateButton = {
				type: btn.type,
				text: btn.text,
			};

			if (btn.type === "URL" && btn.url) {
				metaBtn.url = btn.url;
			}
			if (btn.type === "PHONE_NUMBER" && btn.phoneNumber) {
				metaBtn.phone_number = btn.phoneNumber;
			}
			if (btn.type === "COPY_CODE" && btn.exampleCode) {
				metaBtn.example = [btn.exampleCode];
			}
			if (btn.type === "VOICE_CALL") {
				// TTL padrão: 10080 minutos (7 dias)
				metaBtn.ttl_minutes = btn.ttlMinutes ?? 10080;
			}
			if (btn.type === "FLOW" && btn.flowId) {
				metaBtn.flow_id = btn.flowId;
			}

			return metaBtn;
		});

		components.push({
			type: "BUTTONS",
			buttons: metaButtons,
		});
	}

	return {
		name: data.templateName || "template_sem_nome",
		category: data.category || category,
		language: data.language || "pt_BR",
		components,
		parameter_format: "NAMED",
	};
}

// =============================================================================
// TEMPLATE DISPATCH PAYLOAD
// =============================================================================

export interface TemplateDispatchPayload {
	messaging_product: "whatsapp";
	to: string;
	type: "template";
	template: {
		name: string;
		language: { code: string };
		components: Array<{
			type: "header" | "body" | "button";
			sub_type?: string;
			index?: number;
			parameters: Array<{
				type: "text" | "image" | "video" | "document" | "coupon_code";
				parameter_name?: string;
				text?: string;
				image?: { link: string };
				video?: { link: string };
				document?: { link: string };
				coupon_code?: string;
			}>;
		}>;
	};
}

/**
 * Builds a template dispatch payload for sending to WhatsApp
 */
export function buildTemplateDispatchPayload(
	data: TemplateNodeData,
	recipientPhone: string,
	variableValues: Record<string, string>,
): TemplateDispatchPayload {
	const components: TemplateDispatchPayload["template"]["components"] = [];

	// Body parameters
	if (data.body?.variables && data.body.variables.length > 0) {
		components.push({
			type: "body",
			parameters: data.body.variables.map((varName) => ({
				type: "text",
				parameter_name: varName,
				text: variableValues[varName] || `{{${varName}}}`,
			})),
		});
	}

	// Header parameters (if media or text with variables)
	if (data.header && data.header.type !== "NONE") {
		if (data.header.type === "TEXT" && data.header.variables?.length) {
			components.push({
				type: "header",
				parameters: data.header.variables.map((varName) => ({
					type: "text",
					parameter_name: varName,
					text: variableValues[varName] || `{{${varName}}}`,
				})),
			});
		} else if (data.header.type === "IMAGE" && data.header.mediaUrl) {
			components.push({
				type: "header",
				parameters: [{ type: "image", image: { link: data.header.mediaUrl } }],
			});
		} else if (data.header.type === "VIDEO" && data.header.mediaUrl) {
			components.push({
				type: "header",
				parameters: [{ type: "video", video: { link: data.header.mediaUrl } }],
			});
		} else if (data.header.type === "DOCUMENT" && data.header.mediaUrl) {
			components.push({
				type: "header",
				parameters: [{ type: "document", document: { link: data.header.mediaUrl } }],
			});
		}
	}

	// Button parameters (for COPY_CODE buttons)
	if (data.buttons) {
		data.buttons.forEach((btn, index) => {
			if (btn.type === "COPY_CODE" && btn.exampleCode) {
				// Use dynamic coupon from context if available
				const couponValue = variableValues["coupon_code"] || variableValues["chave_pix"] || btn.exampleCode;
				components.push({
					type: "button",
					sub_type: "COPY_CODE",
					index,
					parameters: [{ type: "coupon_code", coupon_code: couponValue }],
				});
			}
		});
	}

	return {
		messaging_product: "whatsapp",
		to: recipientPhone,
		type: "template",
		template: {
			name: data.templateName || "",
			language: { code: data.language || "pt_BR" },
			components,
		},
	};
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Creates default TemplateNodeData for a new node
 */
export function createDefaultTemplateNodeData(): Partial<TemplateNodeData> {
	return {
		mode: "draft",
		status: "DRAFT",
		category: "MARKETING",
		language: "pt_BR",
		buttons: [],
	};
}

/**
 * Creates a new template button with default values
 */
export function createTemplateButton(
	type: TemplateButtonType = "QUICK_REPLY",
	text: string = "Novo botão",
): TemplateButton {
	const button: TemplateButton = {
		id: generateTemplateButtonId(),
		type,
		text,
	};

	// Add default values for specific types
	if (type === "VOICE_CALL") {
		button.ttlMinutes = 10080; // 7 days default
	}

	return button;
}
