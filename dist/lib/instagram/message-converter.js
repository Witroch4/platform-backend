"use strict";
/**
 * Instagram Message Converter
 *
 * Converts WhatsApp interactive message templates to Instagram-compatible formats.
 * Supports Generic Template (≤80 chars) and Button Template (81-640 chars).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageConverter = exports.MessageConverter = exports.CONVERSION_RULES = void 0;
exports.CONVERSION_RULES = {
    maxBodyLengthForGeneric: 80,
    maxBodyLengthForButton: 640,
    maxSubtitleLength: 80,
    maxTitleLength: 80,
    maxButtonsCount: 3,
};
class MessageConverter {
    rules;
    constructor(rules = exports.CONVERSION_RULES) {
        this.rules = rules;
    }
    /**
     * Main conversion method
     */
    convert(whatsappTemplate) {
        try {
            // Validate input
            const validationResult = this.validateInput(whatsappTemplate);
            if (!validationResult.isValid) {
                return {
                    success: false,
                    error: validationResult.error,
                };
            }
            const bodyLength = whatsappTemplate.body.text.length;
            const templateType = this.determineTemplateType(bodyLength);
            let instagramTemplate;
            const warnings = [];
            if (templateType === 'generic') {
                const result = this.convertToGenericTemplate(whatsappTemplate);
                instagramTemplate = {
                    type: 'generic',
                    payload: result.payload,
                };
                warnings.push(...result.warnings);
            }
            else if (templateType === 'button') {
                const result = this.convertToButtonTemplate(whatsappTemplate);
                instagramTemplate = {
                    type: 'button',
                    payload: result.payload,
                };
                warnings.push(...result.warnings);
            }
            else {
                // quick_replies
                const result = this.convertToQuickReplies(whatsappTemplate);
                instagramTemplate = {
                    type: 'quick_replies',
                    payload: result.payload,
                };
                warnings.push(...result.warnings);
            }
            return {
                success: true,
                instagramTemplate,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    /**
     * Determine template type based on body length
     */
    determineTemplateType(bodyLength) {
        if (bodyLength <= this.rules.maxBodyLengthForGeneric) {
            return 'generic';
        }
        else if (bodyLength <= this.rules.maxBodyLengthForButton) {
            return 'button';
        }
        else {
            return 'quick_replies';
        }
    }
    /**
     * Convert to Generic Template (≤80 chars)
     */
    convertToGenericTemplate(template) {
        const warnings = [];
        // Title: body text (should already be ≤80 chars when this function is called)
        const title = template.body.text;
        if (title.length > this.rules.maxTitleLength) {
            throw new Error(`Generic Template should only be used for messages ≤${this.rules.maxTitleLength} characters. Got ${title.length} characters.`);
        }
        // Subtitle: footer text (truncated if needed)
        let subtitle;
        if (template.footer?.text) {
            subtitle = template.footer.text;
            if (subtitle.length > this.rules.maxSubtitleLength) {
                subtitle = subtitle.substring(0, this.rules.maxSubtitleLength - 3) + '...';
                warnings.push(`Subtitle truncated to ${this.rules.maxSubtitleLength} characters`);
            }
        }
        // Image URL: header content if type is image
        let imageUrl;
        if (template.header?.type === 'image' && template.header.content) {
            imageUrl = template.header.content;
        }
        // Convert buttons
        const buttonResult = this.convertButtons(template.buttons || []);
        warnings.push(...buttonResult.warnings);
        const element = {
            title,
            buttons: buttonResult.buttons,
        };
        if (imageUrl) {
            element.image_url = imageUrl;
        }
        if (subtitle) {
            element.subtitle = subtitle;
        }
        return {
            payload: {
                template_type: 'generic',
                elements: [element],
            },
            warnings,
        };
    }
    /**
     * Convert to Button Template (81-640 chars)
     */
    convertToButtonTemplate(template) {
        const warnings = [];
        // Text: body text (already validated to be ≤640 chars)
        const text = template.body.text;
        // Discard header and footer for button template
        if (template.header) {
            warnings.push('Header discarded in Button Template format');
        }
        if (template.footer) {
            warnings.push('Footer discarded in Button Template format');
        }
        // Convert buttons
        const buttonResult = this.convertButtons(template.buttons || []);
        warnings.push(...buttonResult.warnings);
        return {
            payload: {
                template_type: 'button',
                text,
                buttons: buttonResult.buttons,
            },
            warnings,
        };
    }
    /**
     * Convert to Quick Replies (>640 chars)
     */
    convertToQuickReplies(template) {
        const warnings = [];
        // Text: body text (no length limit for quick replies)
        const text = template.body.text;
        // Discard header and footer for quick replies
        if (template.header) {
            warnings.push('Header discarded in Quick Replies format');
        }
        if (template.footer) {
            warnings.push('Footer discarded in Quick Replies format');
        }
        // Convert buttons to quick replies (limit to 13)
        const buttonResult = this.convertButtonsToQuickReplies(template.buttons || []);
        warnings.push(...buttonResult.warnings);
        return {
            payload: {
                text,
                quick_replies: buttonResult.quickReplies,
            },
            warnings,
        };
    }
    /**
     * Convert WhatsApp buttons to Instagram buttons
     */
    convertButtons(buttons) {
        if (!buttons || buttons.length === 0) {
            return { buttons: [], warnings: [] };
        }
        const warnings = [];
        const convertedButtons = [];
        // Limit to max buttons count
        const buttonsToProcess = buttons.slice(0, this.rules.maxButtonsCount);
        if (buttons.length > this.rules.maxButtonsCount) {
            warnings.push(`Only first ${this.rules.maxButtonsCount} buttons will be used (${buttons.length} provided)`);
        }
        for (const button of buttonsToProcess) {
            const instagramButton = this.convertSingleButton(button);
            if (instagramButton) {
                convertedButtons.push(instagramButton);
            }
            else {
                warnings.push(`Button "${button.title}" could not be converted (unsupported type: ${button.type})`);
            }
        }
        return {
            buttons: convertedButtons,
            warnings,
        };
    }
    /**
     * Convert a single WhatsApp button to Instagram button
     */
    convertSingleButton(button) {
        if (!button)
            return null;
        // Map button types
        switch (button.type) {
            case 'web_url':
                if (!button.url) {
                    return null;
                }
                return {
                    type: 'web_url',
                    title: button.title,
                    url: button.url,
                };
            case 'postback':
                return {
                    type: 'postback',
                    title: button.title,
                    payload: button.payload || button.id,
                };
            default:
                // Unsupported button type
                return null;
        }
    }
    /**
     * Convert WhatsApp buttons to Instagram quick replies
     */
    convertButtonsToQuickReplies(buttons) {
        if (!buttons || buttons.length === 0) {
            return { quickReplies: [], warnings: [] };
        }
        const warnings = [];
        const quickReplies = [];
        // Limit to max 13 quick replies (Instagram limit)
        const maxQuickReplies = 13;
        const buttonsToProcess = buttons.slice(0, maxQuickReplies);
        if (buttons.length > maxQuickReplies) {
            warnings.push(`Only first ${maxQuickReplies} buttons will be used as quick replies (${buttons.length} provided)`);
        }
        for (const button of buttonsToProcess) {
            const quickReply = this.convertSingleButtonToQuickReply(button);
            if (quickReply) {
                quickReplies.push(quickReply);
            }
            else {
                warnings.push(`Button "${button.title}" could not be converted to quick reply (unsupported type: ${button.type})`);
            }
        }
        return {
            quickReplies,
            warnings,
        };
    }
    /**
     * Convert a single WhatsApp button to Instagram quick reply
     */
    convertSingleButtonToQuickReply(button) {
        if (!button)
            return null;
        // For quick replies, we convert all button types to text quick replies
        // The payload will contain the original button data
        return {
            content_type: 'text',
            title: button.title.substring(0, 20), // Instagram limit for quick reply title
            payload: button.payload || button.id || button.url || 'default_payload',
        };
    }
    /**
     * Validate input template
     */
    validateInput(template) {
        if (!template) {
            return { isValid: false, error: 'Template is required' };
        }
        if (!template.body || template.body.text === undefined || template.body.text === null) {
            return { isValid: false, error: 'Template body text is required' };
        }
        if (typeof template.body.text !== 'string') {
            return { isValid: false, error: 'Template body text must be a string' };
        }
        if (template.body.text === '' || template.body.text.trim().length === 0) {
            return { isValid: false, error: 'Template body text cannot be empty' };
        }
        // Validate header if present
        if (template.header) {
            if (!template.header.type || !template.header.content) {
                return { isValid: false, error: 'Header must have both type and content' };
            }
        }
        // Validate buttons if present
        if (template.buttons) {
            if (!Array.isArray(template.buttons)) {
                return { isValid: false, error: 'Buttons must be an array' };
            }
            for (const button of template.buttons) {
                if (!button.id || !button.title || !button.type) {
                    return { isValid: false, error: 'Each button must have id, title, and type' };
                }
                // Note: We don't validate web_url buttons here as they will be handled during conversion
                // Invalid buttons will be skipped with warnings
            }
        }
        return { isValid: true };
    }
}
exports.MessageConverter = MessageConverter;
// Export default instance
exports.messageConverter = new MessageConverter();
