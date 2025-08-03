"use strict";
/**
 * Template Adapter
 *
 * Converts Prisma template models to WhatsApp template format
 * for use with the Instagram message converter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertPrismaTemplateToWhatsApp = convertPrismaTemplateToWhatsApp;
exports.convertCompleteMessageMappingToWhatsApp = convertCompleteMessageMappingToWhatsApp;
exports.canConvertToInstagram = canConvertToInstagram;
/**
 * Convert Prisma template to WhatsApp template format
 */
function convertPrismaTemplateToWhatsApp(prismaTemplate) {
    if (!prismaTemplate.interactiveContent) {
        return null;
    }
    const { interactiveContent } = prismaTemplate;
    // Build WhatsApp template structure
    const whatsappTemplate = {
        body: {
            text: interactiveContent.body.text,
        },
    };
    // Add header if present
    if (interactiveContent.header) {
        whatsappTemplate.header = {
            type: interactiveContent.header.type,
            content: interactiveContent.header.content,
        };
    }
    // Add footer if present
    if (interactiveContent.footer) {
        whatsappTemplate.footer = {
            text: interactiveContent.footer.text,
        };
    }
    // Add buttons if present
    if (interactiveContent.actionReplyButton?.buttons) {
        try {
            const buttonsData = typeof interactiveContent.actionReplyButton.buttons === 'string'
                ? JSON.parse(interactiveContent.actionReplyButton.buttons)
                : interactiveContent.actionReplyButton.buttons;
            if (Array.isArray(buttonsData)) {
                whatsappTemplate.buttons = buttonsData.map((button) => ({
                    id: button.id || button.reply?.id || '',
                    title: button.title || button.reply?.title || '',
                    type: button.type || 'postback',
                    url: button.url,
                    payload: button.payload || button.reply?.id,
                }));
            }
        }
        catch (error) {
            console.warn('Failed to parse button data:', error);
        }
    }
    return whatsappTemplate;
}
/**
 * Convert CompleteMessageMapping to WhatsApp template format
 */
function convertCompleteMessageMappingToWhatsApp(mapping) {
    if (!mapping.unifiedTemplate?.interactiveContent) {
        return null;
    }
    const interactiveContent = mapping.unifiedTemplate.interactiveContent;
    // Build WhatsApp template structure
    const whatsappTemplate = {
        body: {
            text: interactiveContent.body?.text || '',
        },
    };
    // Add header if present
    if (interactiveContent.header) {
        whatsappTemplate.header = {
            type: interactiveContent.header.type,
            content: interactiveContent.header.content,
        };
    }
    // Add footer if present
    if (interactiveContent.footer) {
        whatsappTemplate.footer = {
            text: interactiveContent.footer.text,
        };
    }
    // Add buttons if present
    if (interactiveContent.actionReplyButton?.buttons) {
        try {
            const buttonsData = typeof interactiveContent.actionReplyButton.buttons === 'string'
                ? JSON.parse(interactiveContent.actionReplyButton.buttons)
                : interactiveContent.actionReplyButton.buttons;
            if (Array.isArray(buttonsData)) {
                whatsappTemplate.buttons = buttonsData.map((button) => ({
                    id: button.id || button.reply?.id || '',
                    title: button.title || button.reply?.title || '',
                    type: button.type || 'postback',
                    url: button.url,
                    payload: button.payload || button.reply?.id,
                }));
            }
        }
        catch (error) {
            console.warn('Failed to parse button data:', error);
        }
    }
    return whatsappTemplate;
}
/**
 * Validate that a template can be converted to Instagram format
 */
function canConvertToInstagram(template) {
    // Must have body text
    if (!template.body?.text || template.body.text.trim().length === 0) {
        return false;
    }
    // Must not exceed Instagram's maximum character limit
    if (template.body.text.length > 640) {
        return false;
    }
    return true;
}
