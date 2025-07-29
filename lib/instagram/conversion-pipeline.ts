/**
 * Instagram Conversion Pipeline
 * 
 * Provides a complete pipeline for converting Prisma templates
 * to Instagram format in a single function call.
 */

import { messageConverter, type ConversionResult, type InstagramTemplate } from './message-converter';
import { 
  convertPrismaTemplateToWhatsApp, 
  convertCompleteMessageMappingToWhatsApp,
  canConvertToInstagram,
  type PrismaTemplate,
  type CompleteMessageMapping 
} from './template-adapter';

export interface ConversionPipelineResult {
  success: boolean;
  instagramTemplate?: InstagramTemplate;
  error?: string;
  warnings?: string[];
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Convert a Prisma template directly to Instagram format
 */
export function convertTemplateToInstagram(
  template: PrismaTemplate | CompleteMessageMapping
): ConversionPipelineResult {
  try {
    // Step 1: Convert to WhatsApp format
    let whatsappTemplate;
    
    if ('unifiedTemplate' in template) {
      // CompleteMessageMapping
      whatsappTemplate = convertCompleteMessageMappingToWhatsApp(template);
    } else {
      // PrismaTemplate
      whatsappTemplate = convertPrismaTemplateToWhatsApp(template);
    }

    if (!whatsappTemplate) {
      return {
        success: false,
        skipped: true,
        skipReason: 'Template does not contain interactive content suitable for conversion',
      };
    }

    // Step 2: Check if conversion is possible
    if (!canConvertToInstagram(whatsappTemplate)) {
      return {
        success: false,
        skipped: true,
        skipReason: 'Template cannot be converted to Instagram format (empty text or exceeds 640 characters)',
      };
    }

    // Step 3: Convert to Instagram format
    const conversionResult = messageConverter.convert(whatsappTemplate);

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
  } catch (error) {
    return {
      success: false,
      error: `Conversion pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Batch convert multiple templates to Instagram format
 */
export function convertMultipleTemplatesToInstagram(
  templates: (PrismaTemplate | CompleteMessageMapping)[]
): ConversionPipelineResult[] {
  return templates.map(template => convertTemplateToInstagram(template));
}

/**
 * Get conversion statistics for a batch of templates
 */
export function getConversionStatistics(
  results: ConversionPipelineResult[]
): {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  successRate: number;
  skipRate: number;
  failureRate: number;
} {
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