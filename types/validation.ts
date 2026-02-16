// Validation types and interfaces for Interactive Messages
// Provides comprehensive validation support for message creation and editing

import type {
	InteractiveMessage,
	InteractiveMessageType,
	MessageAction,
	QuickReplyButton,
	ListSection,
} from "./interactive-messages";
import { MESSAGE_LIMITS } from "./interactive-messages";

// Re-export MESSAGE_LIMITS for use in validation modules
export { MESSAGE_LIMITS };

// Validation error types
export type ValidationErrorType =
	| "REQUIRED_FIELD"
	| "INVALID_LENGTH"
	| "INVALID_FORMAT"
	| "INVALID_COUNT"
	| "INVALID_TYPE"
	| "DUPLICATE_VALUE"
	| "INVALID_URL"
	| "INVALID_MEDIA";

// Individual validation error
export interface ValidationError {
	type: ValidationErrorType;
	field: string;
	message: string;
	value?: any;
	limit?: number;
}

// Validation result for a single field
export interface FieldValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	warnings?: ValidationError[];
}

// Complete message validation result
export interface MessageValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
	fieldResults: Record<string, FieldValidationResult>;
}

// Validation context for different scenarios
export interface ValidationContext {
	messageType: InteractiveMessageType;
	isEditing: boolean;
	inboxId: string;
	existingMessages?: InteractiveMessage[];
}

// Validation rules configuration
export interface ValidationRules {
	required: boolean;
	minLength?: number;
	maxLength?: number;
	pattern?: RegExp;
	customValidator?: (value: any, context: ValidationContext) => ValidationError[];
}

// Field validation configuration
export interface FieldValidationConfig {
	name: FieldValidationResult;
	"header.content": FieldValidationResult;
	"body.text": FieldValidationResult;
	"footer.text": FieldValidationResult;
	"action.buttons": FieldValidationResult;
	"action.sections": FieldValidationResult;
	"action.action.url": FieldValidationResult;
	"action.action.displayText": FieldValidationResult;
}

// Validation schema for different message types
export interface MessageTypeValidationSchema {
	button: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "button" }>) => ValidationError[];
	};
	list: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "list" }>) => ValidationError[];
	};
	cta_url: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "cta_url" }>) => ValidationError[];
	};
	flow: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "flow" }>) => ValidationError[];
	};
	location_request: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "location_request" }>) => ValidationError[];
	};
	product: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "product" }>) => ValidationError[];
	};
	product_list: {
		requiredFields: (keyof InteractiveMessage)[];
		actionValidation: (action: Extract<MessageAction, { type: "product_list" }>) => ValidationError[];
	};
}

// Button validation specific types
export interface ButtonValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	duplicateIds: string[];
	duplicateTitles: string[];
}

// List validation specific types
export interface ListValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	sectionErrors: Record<number, ValidationError[]>;
	rowErrors: Record<string, ValidationError[]>; // key: "sectionIndex-rowIndex"
}

// Media validation types
export interface MediaValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	supportedFormats: string[];
	maxFileSize: number;
}

// URL validation types
export interface UrlValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	isReachable?: boolean;
	responseCode?: number;
}

// Real-time validation state
export interface ValidationState {
	isValidating: boolean;
	lastValidated: Date | null;
	result: MessageValidationResult | null;
	isDirty: boolean;
}

// Validation hook return type
export interface UseValidationReturn {
	validationState: ValidationState;
	validateMessage: (message: InteractiveMessage, context: ValidationContext) => Promise<MessageValidationResult>;
	validateField: (fieldName: string, value: any, context: ValidationContext) => FieldValidationResult;
	clearValidation: () => void;
	isFieldValid: (fieldName: string) => boolean;
	getFieldErrors: (fieldName: string) => ValidationError[];
}

// Validation constants
export const VALIDATION_PATTERNS = {
	URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
	PHONE: /^\+[1-9]\d{1,14}$/,
	EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	EMOJI:
		/^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]$/u,
} as const;

// Supported media types
export const SUPPORTED_MEDIA_TYPES = {
	IMAGE: ["image/jpeg", "image/png", "image/webp"],
	VIDEO: ["video/mp4", "video/3gpp"],
	DOCUMENT: [
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	AUDIO: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"],
} as const;

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
	IMAGE: 5 * 1024 * 1024, // 5MB
	VIDEO: 16 * 1024 * 1024, // 16MB
	DOCUMENT: 100 * 1024 * 1024, // 100MB
	AUDIO: 16 * 1024 * 1024, // 16MB
} as const;

// Validation error messages
export const VALIDATION_MESSAGES = {
	REQUIRED_FIELD: "Este campo é obrigatório",
	INVALID_LENGTH: "Comprimento inválido",
	INVALID_FORMAT: "Formato inválido",
	INVALID_COUNT: "Quantidade inválida",
	INVALID_TYPE: "Tipo inválido",
	DUPLICATE_VALUE: "Valor duplicado",
	INVALID_URL: "URL inválida",
	INVALID_MEDIA: "Mídia inválida",

	// Specific field messages
	NAME_REQUIRED: "Nome da mensagem é obrigatório",
	BODY_TEXT_REQUIRED: "Texto do corpo é obrigatório",
	BUTTON_TITLE_REQUIRED: "Título do botão é obrigatório",
	BUTTON_ID_REQUIRED: "ID do botão é obrigatório",
	LIST_SECTION_TITLE_REQUIRED: "Título da seção é obrigatório",
	LIST_ROW_TITLE_REQUIRED: "Título da linha é obrigatório",
	CTA_URL_REQUIRED: "URL é obrigatória",
	CTA_DISPLAY_TEXT_REQUIRED: "Texto de exibição é obrigatório",
	FLOW_ID_REQUIRED: "ID do fluxo é obrigatório",
	FLOW_CTA_REQUIRED: "CTA do fluxo é obrigatório",

	// Length messages
	NAME_TOO_LONG: `Nome deve ter no máximo ${MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH} caracteres`,
	HEADER_TOO_LONG: `Cabeçalho deve ter no máximo ${MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH} caracteres`,
	BODY_TOO_LONG: `Corpo deve ter no máximo ${MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH} caracteres`,
	FOOTER_TOO_LONG: `Rodapé deve ter no máximo ${MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH} caracteres`,
	BUTTON_TITLE_TOO_LONG: `Título do botão deve ter no máximo ${MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH} caracteres`,
	LIST_TITLE_TOO_LONG: `Título da lista deve ter no máximo ${MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH} caracteres`,
	LIST_DESCRIPTION_TOO_LONG: `Descrição da lista deve ter no máximo ${MESSAGE_LIMITS.LIST_DESCRIPTION_MAX_LENGTH} caracteres`,

	// Instagram specific messages
	INSTAGRAM_QUICK_REPLIES_TOO_LONG: `Texto excede o limite de ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH} caracteres para Quick Replies do Instagram. Esta mensagem não será vinculada ao Instagram.`,
	INSTAGRAM_QUICK_REPLIES_WARNING: `Texto longo com respostas rápidas (imagem e rodapé serão descartados)`,

	// Count messages
	TOO_MANY_BUTTONS: `Máximo de ${MESSAGE_LIMITS.BUTTON_MAX_COUNT} botões permitidos`,
	TOO_MANY_SECTIONS: `Máximo de ${MESSAGE_LIMITS.LIST_SECTION_MAX_COUNT} seções permitidas`,
	TOO_MANY_ROWS: `Máximo de ${MESSAGE_LIMITS.LIST_ROW_MAX_COUNT} linhas por seção permitidas`,

	// Duplicate messages
	DUPLICATE_BUTTON_ID: "IDs de botão devem ser únicos",
	DUPLICATE_BUTTON_TITLE: "Títulos de botão devem ser únicos",
	DUPLICATE_ROW_ID: "IDs de linha devem ser únicos",

	// Media messages
	UNSUPPORTED_MEDIA_TYPE: "Tipo de mídia não suportado",
	FILE_TOO_LARGE: "Arquivo muito grande",
	MEDIA_UPLOAD_FAILED: "Falha no upload da mídia",
} as const;

export type ValidationMessage = (typeof VALIDATION_MESSAGES)[keyof typeof VALIDATION_MESSAGES];
