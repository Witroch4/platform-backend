"use strict";
// Validation types and interfaces for Interactive Messages
// Provides comprehensive validation support for message creation and editing
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATION_MESSAGES = exports.FILE_SIZE_LIMITS = exports.SUPPORTED_MEDIA_TYPES = exports.VALIDATION_PATTERNS = exports.MESSAGE_LIMITS = void 0;
const interactive_messages_1 = require("./interactive-messages");
Object.defineProperty(exports, "MESSAGE_LIMITS", { enumerable: true, get: function () { return interactive_messages_1.MESSAGE_LIMITS; } });
// Validation constants
exports.VALIDATION_PATTERNS = {
    URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    PHONE: /^\+[1-9]\d{1,14}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    EMOJI: /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]$/u,
};
// Supported media types
exports.SUPPORTED_MEDIA_TYPES = {
    IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
    VIDEO: ['video/mp4', 'video/3gpp'],
    DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    AUDIO: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
};
// File size limits (in bytes)
exports.FILE_SIZE_LIMITS = {
    IMAGE: 5 * 1024 * 1024, // 5MB
    VIDEO: 16 * 1024 * 1024, // 16MB
    DOCUMENT: 100 * 1024 * 1024, // 100MB
    AUDIO: 16 * 1024 * 1024, // 16MB
};
// Validation error messages
exports.VALIDATION_MESSAGES = {
    REQUIRED_FIELD: 'Este campo é obrigatório',
    INVALID_LENGTH: 'Comprimento inválido',
    INVALID_FORMAT: 'Formato inválido',
    INVALID_COUNT: 'Quantidade inválida',
    INVALID_TYPE: 'Tipo inválido',
    DUPLICATE_VALUE: 'Valor duplicado',
    INVALID_URL: 'URL inválida',
    INVALID_MEDIA: 'Mídia inválida',
    // Specific field messages
    NAME_REQUIRED: 'Nome da mensagem é obrigatório',
    BODY_TEXT_REQUIRED: 'Texto do corpo é obrigatório',
    BUTTON_TITLE_REQUIRED: 'Título do botão é obrigatório',
    BUTTON_ID_REQUIRED: 'ID do botão é obrigatório',
    LIST_SECTION_TITLE_REQUIRED: 'Título da seção é obrigatório',
    LIST_ROW_TITLE_REQUIRED: 'Título da linha é obrigatório',
    CTA_URL_REQUIRED: 'URL é obrigatória',
    CTA_DISPLAY_TEXT_REQUIRED: 'Texto de exibição é obrigatório',
    FLOW_ID_REQUIRED: 'ID do fluxo é obrigatório',
    FLOW_CTA_REQUIRED: 'CTA do fluxo é obrigatório',
    // Length messages
    NAME_TOO_LONG: `Nome deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH} caracteres`,
    HEADER_TOO_LONG: `Cabeçalho deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH} caracteres`,
    BODY_TOO_LONG: `Corpo deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH} caracteres`,
    FOOTER_TOO_LONG: `Rodapé deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH} caracteres`,
    BUTTON_TITLE_TOO_LONG: `Título do botão deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH} caracteres`,
    LIST_TITLE_TOO_LONG: `Título da lista deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH} caracteres`,
    LIST_DESCRIPTION_TOO_LONG: `Descrição da lista deve ter no máximo ${interactive_messages_1.MESSAGE_LIMITS.LIST_DESCRIPTION_MAX_LENGTH} caracteres`,
    // Count messages
    TOO_MANY_BUTTONS: `Máximo de ${interactive_messages_1.MESSAGE_LIMITS.BUTTON_MAX_COUNT} botões permitidos`,
    TOO_MANY_SECTIONS: `Máximo de ${interactive_messages_1.MESSAGE_LIMITS.LIST_SECTION_MAX_COUNT} seções permitidas`,
    TOO_MANY_ROWS: `Máximo de ${interactive_messages_1.MESSAGE_LIMITS.LIST_ROW_MAX_COUNT} linhas por seção permitidas`,
    // Duplicate messages
    DUPLICATE_BUTTON_ID: 'IDs de botão devem ser únicos',
    DUPLICATE_BUTTON_TITLE: 'Títulos de botão devem ser únicos',
    DUPLICATE_ROW_ID: 'IDs de linha devem ser únicos',
    // Media messages
    UNSUPPORTED_MEDIA_TYPE: 'Tipo de mídia não suportado',
    FILE_TOO_LARGE: 'Arquivo muito grande',
    MEDIA_UPLOAD_FAILED: 'Falha no upload da mídia',
};
