"use strict";
// Core type definitions for Interactive Messages System
// This file provides type-safe interfaces for the unified template system
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToWhatsAppAPI = exports.MESSAGE_LIMITS = void 0;
exports.isButtonAction = isButtonAction;
exports.isListAction = isListAction;
exports.isCtaUrlAction = isCtaUrlAction;
exports.isFlowAction = isFlowAction;
exports.isLocationRequestAction = isLocationRequestAction;
// Type guards
function isButtonAction(action) {
    return action.type === "button";
}
function isListAction(action) {
    return action.type === "list";
}
function isCtaUrlAction(action) {
    return action.type === "cta_url";
}
function isFlowAction(action) {
    return action.type === "flow";
}
function isLocationRequestAction(action) {
    return action.type === "location_request";
}
// Constants for validation
exports.MESSAGE_LIMITS = {
    HEADER_TEXT_MAX_LENGTH: 60,
    BODY_TEXT_MAX_LENGTH: 1024,
    FOOTER_TEXT_MAX_LENGTH: 60,
    BUTTON_TITLE_MAX_LENGTH: 20,
    BUTTON_MAX_COUNT: 3,
    LIST_SECTION_MAX_COUNT: 10,
    LIST_ROW_MAX_COUNT: 10,
    LIST_TITLE_MAX_LENGTH: 24,
    LIST_DESCRIPTION_MAX_LENGTH: 72,
};
// Utility functions for WhatsApp API conversion
exports.convertToWhatsAppAPI = {
    button: (button) => ({
        type: "reply",
        reply: {
            id: button.id,
            title: button.title,
        },
    }),
    ctaUrl: (action) => ({
        name: "cta_url",
        parameters: {
            display_text: action.parameters.display_text,
            url: action.parameters.url,
        },
    }),
    flow: (action) => ({
        name: "flow",
        parameters: {
            flow_message_version: action.parameters.flow_message_version,
            flow_id: action.parameters.flow_id,
            flow_cta: action.parameters.flow_cta,
            mode: action.parameters.mode || "published",
            flow_token: action.parameters.flow_token || "unused",
            flow_action: action.parameters.flow_action || "navigate",
            flow_action_payload: action.parameters.flow_action_payload,
        },
    }),
};
