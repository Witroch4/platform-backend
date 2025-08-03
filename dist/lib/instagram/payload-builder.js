"use strict";
/**
 * Instagram Payload Builder for Dialogflow fulfillmentMessages
 * Handles Generic Template and Button Template formatting for Instagram
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInstagramGenericTemplate = createInstagramGenericTemplate;
exports.createInstagramButtonTemplate = createInstagramButtonTemplate;
exports.convertWhatsAppButtonsToInstagram = convertWhatsAppButtonsToInstagram;
exports.convertEnhancedButtonsToInstagram = convertEnhancedButtonsToInstagram;
exports.createInstagramQuickReplies = createInstagramQuickReplies;
exports.createInstagramFallbackMessage = createInstagramFallbackMessage;
exports.validateInstagramTemplate = validateInstagramTemplate;
exports.determineInstagramTemplateType = determineInstagramTemplateType;
/**
 * Create Generic Template payload for Instagram (≤80 character messages)
 */
function createInstagramGenericTemplate(title, subtitle, imageUrl, buttons = []) {
    // Validate title length - should only be used for ≤80 character messages
    if (title.length > 80) {
        throw new Error(`Generic Template title exceeds 80 characters (${title.length} chars). Use Button Template instead.`);
    }
    // Validate and truncate subtitle to 80 characters if provided
    const truncatedSubtitle = subtitle ? subtitle.substring(0, 80) : undefined;
    // Limit buttons to 3 for Instagram
    const limitedButtons = buttons.slice(0, 3);
    const element = {
        title: title, // Use original title since we validated it's ≤80 chars
        buttons: limitedButtons,
    };
    // Add subtitle if provided
    if (truncatedSubtitle) {
        element.subtitle = truncatedSubtitle;
    }
    // Add image URL if provided
    if (imageUrl) {
        element.image_url = imageUrl;
    }
    const template = {
        template_type: 'generic',
        elements: [element],
    };
    const socialwiseResponse = {
        message_format: 'GENERIC_TEMPLATE',
        payload: template,
    };
    return [
        {
            payload: {
                socialwiseResponse,
            },
        },
    ];
}
/**
 * Create Button Template payload for Instagram (81-640 character messages)
 */
function createInstagramButtonTemplate(text, buttons = []) {
    // Validate text length - should be between 81-640 characters for Button Template
    if (text.length > 640) {
        throw new Error(`Button Template text exceeds 640 characters (${text.length} chars). Use Quick Replies instead.`);
    }
    if (text.length <= 80) {
        throw new Error(`Button Template should not be used for messages ≤80 characters (${text.length} chars). Use Generic Template instead.`);
    }
    // Limit buttons to 3 for Instagram
    const limitedButtons = buttons.slice(0, 3);
    const template = {
        template_type: 'button',
        text: text, // Use original text since we validated it's within limits
        buttons: limitedButtons,
    };
    const socialwiseResponse = {
        message_format: 'BUTTON_TEMPLATE',
        payload: template,
    };
    return [
        {
            payload: {
                socialwiseResponse,
            },
        },
    ];
}
/**
 * Convert WhatsApp buttons to Instagram format
 */
function convertWhatsAppButtonsToInstagram(whatsappButtons) {
    return whatsappButtons.map((button) => {
        const instagramButton = {
            title: button.titulo ? button.titulo.substring(0, 20) : 'Button', // Instagram button title limit
            type: 'postback',
            payload: button.id || 'default_payload',
        };
        // Map button types
        if (button.tipo === 'web_url' && button.url) {
            instagramButton.type = 'web_url';
            instagramButton.url = button.url;
            delete instagramButton.payload;
        }
        return instagramButton;
    });
}
/**
 * Convert enhanced WhatsApp buttons to Instagram format
 */
function convertEnhancedButtonsToInstagram(enhancedButtons) {
    return enhancedButtons.map((button) => {
        const instagramButton = {
            title: button.title ? button.title.substring(0, 20) : 'Button', // Instagram button title limit
            type: 'postback',
            payload: button.id || 'default_payload',
        };
        // Map button types based on enhanced button structure
        if (button.type === 'url' && button.url) {
            instagramButton.type = 'web_url';
            instagramButton.url = button.url;
            delete instagramButton.payload;
        }
        return instagramButton;
    });
}
/**
 * Create Quick Replies payload for Instagram (>640 character messages)
 */
function createInstagramQuickReplies(text, buttons = []) {
    // Quick Replies can be used for any message length, especially as fallback for >640 character messages
    // No length validation needed - Quick Replies are flexible
    // Convert buttons to quick replies format
    const quickReplies = buttons.slice(0, 13).map((button) => ({
        content_type: 'text',
        title: button.title.substring(0, 20), // Instagram limit for quick reply title
        payload: button.payload || button.url || 'default_payload',
    }));
    const quickRepliesPayload = {
        text: text, // No truncation for quick replies - Instagram supports longer text
        quick_replies: quickReplies,
    };
    const socialwiseResponse = {
        message_format: 'QUICK_REPLIES',
        payload: quickRepliesPayload,
    };
    return [
        {
            payload: {
                socialwiseResponse,
            },
        },
    ];
}
/**
 * Create fallback text message for Instagram when conversion fails
 */
function createInstagramFallbackMessage(errorMessage = 'Desculpe, não foi possível processar sua mensagem no momento.') {
    // Determine appropriate template based on message length
    const templateType = determineInstagramTemplateType(errorMessage);
    if (templateType === 'quick_replies') {
        return createInstagramQuickReplies(errorMessage, []);
    }
    else if (templateType === 'generic') {
        return createInstagramGenericTemplate(errorMessage, undefined, undefined, []);
    }
    else {
        // Button template
        const template = {
            template_type: 'button',
            text: errorMessage,
            buttons: [],
        };
        const socialwiseResponse = {
            message_format: 'BUTTON_TEMPLATE',
            payload: template,
        };
        return [
            {
                payload: {
                    socialwiseResponse,
                },
            },
        ];
    }
}
/**
 * Validate Instagram template constraints
 */
function validateInstagramTemplate(template) {
    const errors = [];
    // Check if it's a Quick Replies payload
    if ('quick_replies' in template) {
        const quickRepliesTemplate = template;
        if (!quickRepliesTemplate.text || quickRepliesTemplate.text.length === 0) {
            errors.push('Quick Replies must have text');
        }
        if (quickRepliesTemplate.quick_replies && quickRepliesTemplate.quick_replies.length > 13) {
            errors.push('Quick Replies has more than 13 options (Instagram limit)');
        }
        quickRepliesTemplate.quick_replies?.forEach((reply, index) => {
            if (!reply.title || reply.title.length === 0) {
                errors.push(`Quick Reply ${index} must have a title`);
            }
            if (reply.title && reply.title.length > 20) {
                errors.push(`Quick Reply ${index} title exceeds 20 characters`);
            }
            if (!reply.payload || reply.payload.length === 0) {
                errors.push(`Quick Reply ${index} must have a payload`);
            }
        });
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    // Handle template types (generic/button)
    const templateWithType = template;
    if (templateWithType.template_type === 'generic') {
        const genericTemplate = templateWithType;
        // Check elements
        if (!genericTemplate.elements || genericTemplate.elements.length === 0) {
            errors.push('Generic template must have at least one element');
        }
        genericTemplate.elements.forEach((element, index) => {
            if (!element.title || element.title.length === 0) {
                errors.push(`Element ${index} must have a title`);
            }
            if (element.title && element.title.length > 80) {
                errors.push(`Element ${index} title exceeds 80 characters`);
            }
            if (element.subtitle && element.subtitle.length > 80) {
                errors.push(`Element ${index} subtitle exceeds 80 characters`);
            }
            if (element.buttons && element.buttons.length > 3) {
                errors.push(`Element ${index} has more than 3 buttons`);
            }
        });
    }
    else if (templateWithType.template_type === 'button') {
        const buttonTemplate = templateWithType;
        if (!buttonTemplate.text || buttonTemplate.text.length === 0) {
            errors.push('Button template must have text');
        }
        if (buttonTemplate.text && buttonTemplate.text.length > 640) {
            errors.push('Button template text exceeds 640 characters');
        }
        if (buttonTemplate.buttons && buttonTemplate.buttons.length > 3) {
            errors.push('Button template has more than 3 buttons');
        }
    }
    return {
        isValid: errors.length === 0,
        errors,
    };
}
/**
 * Determine appropriate Instagram template type based on message content
 */
function determineInstagramTemplateType(bodyText, hasImage = false) {
    const bodyLength = bodyText.length;
    if (bodyLength > 640) {
        // Use Quick Replies for messages longer than 640 characters
        return 'quick_replies';
    }
    if (bodyLength <= 80) {
        return 'generic';
    }
    // Messages between 81-640 characters should use Button Template
    return 'button';
}
