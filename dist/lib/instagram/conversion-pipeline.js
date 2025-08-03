"use strict";
/**
 * Instagram Conversion Pipeline
 *
 * Provides a complete pipeline for converting Prisma templates
 * to Instagram format in a single function call.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertTemplateToInstagram = convertTemplateToInstagram;
exports.convertMultipleTemplatesToInstagram = convertMultipleTemplatesToInstagram;
exports.getConversionStatistics = getConversionStatistics;
const message_converter_1 = require("./message-converter");
const template_adapter_1 = require("./template-adapter");
/**
 * Convert a Prisma template directly to Instagram format
 */
function convertTemplateToInstagram(template) {
    try {
        // Step 1: Convert to WhatsApp format
        let whatsappTemplate;
        if ('unifiedTemplate' in template) {
            // CompleteMessageMapping
            whatsappTemplate = (0, template_adapter_1.convertCompleteMessageMappingToWhatsApp)(template);
        }
        else {
            // PrismaTemplate
            whatsappTemplate = (0, template_adapter_1.convertPrismaTemplateToWhatsApp)(template);
        }
        if (!whatsappTemplate) {
            return {
                success: false,
                skipped: true,
                skipReason: 'Template does not contain interactive content suitable for conversion',
            };
        }
        // Step 2: Check if conversion is possible
        if (!(0, template_adapter_1.canConvertToInstagram)(whatsappTemplate)) {
            return {
                success: false,
                skipped: true,
                skipReason: 'Template cannot be converted to Instagram format (empty text or exceeds 640 characters)',
            };
        }
        // Step 3: Convert to Instagram format
        const conversionResult = message_converter_1.messageConverter.convert(whatsappTemplate);
        if (!conversionResult.success) {
            return {
                success: false,
                error: conversionResult.error,
            };
        }
        return {
            success: true,
            instagramTemplate: conversionResult.instagramTemplate,
            warnings: conversionResult.warnings,
        };
    }
    catch (error) {
        return {
            success: false,
            error: `Conversion pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
/**
 * Batch convert multiple templates to Instagram format
 */
function convertMultipleTemplatesToInstagram(templates) {
    return templates.map(template => convertTemplateToInstagram(template));
}
/**
 * Get conversion statistics for a batch of templates
 */
function getConversionStatistics(results) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    return {
        total,
        successful,
        failed,
        skipped,
        successRate: total > 0 ? (successful / total) * 100 : 0,
        skipRate: total > 0 ? (skipped / total) * 100 : 0,
        failureRate: total > 0 ? (failed / total) * 100 : 0,
    };
}
