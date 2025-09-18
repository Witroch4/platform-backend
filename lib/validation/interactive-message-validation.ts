// Comprehensive validation system for Interactive Messages
// Provides client-side and server-side validation with detailed error reporting

import { z } from 'zod';
import type { 
  InteractiveMessage, 
  InteractiveMessageType,
  MessageAction,
  QuickReplyButton,
  ListSection,
  ButtonReaction
} from '@/types/interactive-messages';
import { MESSAGE_LIMITS, VALIDATION_PATTERNS, VALIDATION_MESSAGES } from '@/types/validation';

// Enhanced validation error interface
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
  limit?: number;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface FieldValidationResult extends ValidationResult {
  field: string;
}

// Validation context for different scenarios
export interface ValidationContext {
  messageType: InteractiveMessageType;
  isEditing: boolean;
  inboxId?: string;
  existingMessages?: InteractiveMessage[];
}

// Custom validation error class
export class InteractiveMessageValidationError extends Error {
  public errors: ValidationError[];
  
  constructor(errors: ValidationError[]) {
    const message = `Validation failed: ${errors.map(e => e.message).join(', ')}`;
    super(message);
    this.name = 'InteractiveMessageValidationError';
    this.errors = errors;
  }
}

// Zod schemas for server-side validation
export const HeaderSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'document']),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  media_url: z.string().url().optional(), // Support both formats
  mediaId: z.string().optional(),
  filename: z.string().optional(),
}).refine((data) => {
  if (data.type === 'text') {
    // For text headers, allow empty content
    return !data.content || data.content.length <= MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH;
  }
  // For media headers, content can be optional as well
  return true;
}, {
  message: "Header validation failed"
}).optional();

export const BodySchema = z.object({
  text: z.string()
    .max(MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH, VALIDATION_MESSAGES.BODY_TOO_LONG)
});

export const FooterSchema = z.object({
  text: z.string()
    .max(MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH, VALIDATION_MESSAGES.FOOTER_TOO_LONG)
});

export const QuickReplyButtonSchema = z.object({
  id: z.string().min(1, VALIDATION_MESSAGES.BUTTON_ID_REQUIRED),
  title: z.string()
    .min(1, VALIDATION_MESSAGES.BUTTON_TITLE_REQUIRED)
    .max(MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH, VALIDATION_MESSAGES.BUTTON_TITLE_TOO_LONG),
  payload: z.string().optional()
});

export const ButtonActionSchema = z.object({
  type: z.literal('button'),
  buttons: z.array(QuickReplyButtonSchema)
    .min(1, 'At least one button is required')
    .max(13, 'Maximum 13 buttons allowed') // Use Instagram limit as maximum
    .refine((buttons) => {
      const ids = buttons.map(b => b.id);
      return new Set(ids).size === ids.length;
    }, { message: VALIDATION_MESSAGES.DUPLICATE_BUTTON_ID })
    .refine((buttons) => {
      const titles = buttons.map(b => b.title).filter(title => title && title.trim());
      return new Set(titles).size === titles.length;
    }, { message: VALIDATION_MESSAGES.DUPLICATE_BUTTON_TITLE })
});

export const ListRowSchema = z.object({
  id: z.string().min(1, 'Row ID is required'),
  title: z.string()
    .min(1, VALIDATION_MESSAGES.LIST_ROW_TITLE_REQUIRED)
    .max(MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH, VALIDATION_MESSAGES.LIST_TITLE_TOO_LONG),
  description: z.string()
    .max(MESSAGE_LIMITS.LIST_DESCRIPTION_MAX_LENGTH, VALIDATION_MESSAGES.LIST_DESCRIPTION_TOO_LONG)
    .optional()
});

export const ListSectionSchema = z.object({
  title: z.string()
    .min(1, VALIDATION_MESSAGES.LIST_SECTION_TITLE_REQUIRED)
    .max(MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH, VALIDATION_MESSAGES.LIST_TITLE_TOO_LONG),
  rows: z.array(ListRowSchema)
    .min(1, 'At least one row is required per section')
    .max(MESSAGE_LIMITS.LIST_ROW_MAX_COUNT, VALIDATION_MESSAGES.TOO_MANY_ROWS)
});

export const ListActionSchema = z.object({
  type: z.literal('list'),
  buttonText: z.string().min(1, 'Button text is required'),
  sections: z.array(ListSectionSchema)
    .min(1, 'At least one section is required')
    .max(MESSAGE_LIMITS.LIST_SECTION_MAX_COUNT, VALIDATION_MESSAGES.TOO_MANY_SECTIONS)
});

export const CtaUrlActionSchema = z.object({
  type: z.literal('cta_url'),
  action: z.object({
    displayText: z.string().min(1, VALIDATION_MESSAGES.CTA_DISPLAY_TEXT_REQUIRED),
    url: z.string().url(VALIDATION_MESSAGES.INVALID_URL)
  })
});

export const FlowActionSchema = z.object({
  type: z.literal('flow'),
  action: z.object({
    flowId: z.string().min(1, VALIDATION_MESSAGES.FLOW_ID_REQUIRED),
    flowCta: z.string().min(1, VALIDATION_MESSAGES.FLOW_CTA_REQUIRED),
    flowMode: z.enum(['draft', 'published']),
    flowData: z.record(z.any()).optional()
  })
});

export const LocationRequestActionSchema = z.object({
  type: z.literal('location_request'),
  action: z.object({
    requestText: z.string().min(1, 'Request text is required')
  })
});

// Instagram specific schemas
export const InstagramGenericActionSchema = z.object({
  type: z.literal('generic'),
  buttons: z.array(QuickReplyButtonSchema)
    .min(0, 'No minimum buttons required for generic template')
    .max(MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS, 'Too many buttons for Instagram generic template')
    .optional()
});

export const InstagramQuickRepliesActionSchema = z.object({
  type: z.literal('quick_replies'), 
  buttons: z.array(QuickReplyButtonSchema)
    .min(1, 'At least one quick reply is required')
    .max(MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT, 'Too many quick replies for Instagram')
    .refine((buttons) => {
      const ids = buttons.map(b => b.id);
      return new Set(ids).size === ids.length;
    }, { message: 'Button IDs must be unique' })
    .refine((buttons) => {
      const titles = buttons.map(b => b.title).filter(title => title && title.trim());
      return new Set(titles).size === titles.length;
    }, { message: 'Button titles must be unique' })
});

export const InstagramButtonTemplateActionSchema = z.object({
  type: z.literal('button_template'),
  buttons: z.array(QuickReplyButtonSchema)
    .min(1, 'At least one button is required')
    .max(MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS, 'Too many buttons for Instagram button template')
});

export const MessageActionSchema = z.discriminatedUnion('type', [
  ButtonActionSchema,
  ListActionSchema,
  CtaUrlActionSchema,
  FlowActionSchema,
  LocationRequestActionSchema,
  // Instagram actions
  InstagramGenericActionSchema,
  InstagramQuickRepliesActionSchema,
  InstagramButtonTemplateActionSchema
]);

const BaseInteractiveMessageSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(255, VALIDATION_MESSAGES.NAME_TOO_LONG),
  type: z.enum([
    'button', 'list', 'cta_url', 'flow', 'location_request',
    'location', 'reaction', 'sticker', 'product', 'product_list',
    // Instagram specific types
    'quick_replies', 'generic', 'button_template'
  ]),
  header: HeaderSchema.optional(),
  body: BodySchema.optional(),
  footer: FooterSchema.optional(),
  action: MessageActionSchema.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.union([z.date(), z.string().datetime()]).optional(),
  updatedAt: z.union([z.date(), z.string().datetime()]).optional()
});

export const InteractiveMessageSchema = BaseInteractiveMessageSchema.refine((data) => {
  // For generic type (carousel), body is optional since content is in action.elements
  if (data.type === 'generic') {
    return true;
  }
  // For all other types, body is required
  return data.body && data.body.text && data.body.text.trim().length > 0;
}, {
  message: "Body text is required for non-generic message types"
});

// Export a partial schema for updates
export const PartialInteractiveMessageSchema = BaseInteractiveMessageSchema.partial();

export const ButtonReactionSchema = z.object({
  id: z.string().optional(),
  buttonId: z.string().min(1, 'Button ID is required'),
  messageId: z.string().optional(),
  type: z.enum(['emoji', 'text', 'action']),
  emoji: z.string().nullable().optional(),
  textResponse: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  isActive: z.boolean().default(true)
}).refine((data) => {
  if (data.type === 'emoji') {
    // Permitir qualquer sequência não vazia de emoji, incluindo variation selectors/ZWJ
    // Regex de emoji é notoriamente difícil e pode falhar para combinações (ex.: ❤️, 👨‍👩‍👧‍👦).
    // Para não bloquear o usuário na edição, aceitamos string não vazia.
    return data.emoji && typeof data.emoji === 'string' && data.emoji.trim().length > 0;
  }
  if (data.type === 'text') {
    return data.textResponse && typeof data.textResponse === 'string' && data.textResponse.trim().length > 0;
  }
  if (data.type === 'action') {
    return data.action && typeof data.action === 'string' && data.action.trim().length > 0;
  }
  return false;
}, {
  message: "Reaction must have appropriate content for its type"
});

// Client-side validation functions
export class InteractiveMessageValidator {
  
  static validateMessage(message: InteractiveMessage, context?: ValidationContext): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Use Zod schema for basic validation
      InteractiveMessageSchema.parse(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...this.convertZodErrors(error));
      }
    }

    // Additional business logic validation
    this.validateBusinessRules(message, context, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateField(fieldName: string, value: any, message: InteractiveMessage, context?: ValidationContext): FieldValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    switch (fieldName) {
      case 'name':
        this.validateName(value, errors, warnings);
        break;
      case 'body.text':
        this.validateBodyText(value, errors, warnings, message.type);
        break;
      case 'header.content':
        this.validateHeaderContent(value, errors, warnings, message.header?.type);
        break;
      case 'footer.text':
        this.validateFooterText(value, errors, warnings);
        break;
      case 'action.buttons':
        this.validateButtons(value, errors, warnings, message.type);
        break;
      default:
        // Generic validation for unknown fields
        break;
    }

    return {
      field: fieldName,
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateButtonReactions(reactions: ButtonReaction[], buttons: QuickReplyButton[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Set de IDs válidos de botões atualmente configurados
    const validButtonIds = new Set(buttons.map(b => b.id));

    // Filter out reactions with null/empty values before validation
    const validReactions = reactions.filter(reaction => {
      // Skip reactions for non-existent buttons
      if (!validButtonIds.has(reaction.buttonId)) {
        return false;
      }
      
      // Skip reactions with no meaningful content
      if (reaction.type === 'emoji' && (!reaction.emoji || (typeof reaction.emoji === 'string' && reaction.emoji.trim().length === 0))) {
        return false;
      }
      if (reaction.type === 'text' && (!reaction.textResponse || (typeof reaction.textResponse === 'string' && reaction.textResponse.trim().length === 0))) {
        return false;
      }
      if (reaction.type === 'action' && (!reaction.action || (typeof reaction.action === 'string' && reaction.action.trim().length === 0))) {
        return false;
      }
      
      return true;
    });

    // Validate each remaining reaction
    validReactions.forEach((reaction, index) => {
      try {
        ButtonReactionSchema.parse(reaction);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Find original index for error reporting
          const originalIndex = reactions.findIndex(r => r.buttonId === reaction.buttonId);
          errors.push(...this.convertZodErrors(error, `reactions[${originalIndex}]`));
        }
      }
    });

    // Check for duplicate button reactions apenas entre reações que apontam para botões válidos
    const filtered = reactions.filter(r => validButtonIds.has(r.buttonId));
    const buttonIds = filtered.map(r => r.buttonId);
    const duplicates = buttonIds.filter((id, index) => buttonIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push({
        field: 'reactions',
        code: 'DUPLICATE_BUTTON_REACTIONS',
        message: `Multiple reactions configured for buttons: ${duplicates.join(', ')}`,
        value: duplicates,
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Private validation methods
  private static validateName(name: string, errors: ValidationError[], warnings: ValidationError[]) {
    if (!name || !name.trim()) {
      errors.push({
        field: 'name',
        code: 'REQUIRED_FIELD',
        message: VALIDATION_MESSAGES.NAME_REQUIRED,
        severity: 'error'
      });
    } else if (name.length > 255) {
      errors.push({
        field: 'name',
        code: 'INVALID_LENGTH',
        message: VALIDATION_MESSAGES.NAME_TOO_LONG,
        value: name.length,
        limit: 255,
        severity: 'error'
      });
    } else if (name.length > 200) {
      warnings.push({
        field: 'name',
        code: 'LENGTH_WARNING',
        message: 'Consider using a shorter name for better readability',
        value: name.length,
        limit: 200,
        severity: 'warning'
      });
    }
  }

  private static validateBodyText(text: string, errors: ValidationError[], warnings: ValidationError[], messageType?: InteractiveMessageType) {
    // For generic type (carousel), body text is not required since content is in action.elements
    if (messageType === 'generic') {
      return; // Skip body text validation for carousels
    }

    if (!text || !text.trim()) {
      errors.push({
        field: 'body.text',
        code: 'REQUIRED_FIELD',
        message: VALIDATION_MESSAGES.BODY_TEXT_REQUIRED,
        severity: 'error'
      });
      return;
    }

    // Instagram specific validation based on message type
    if (messageType === 'button_template') {
      // For Instagram Button Template
      if (text.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH) {
        errors.push({
          field: 'body.text',
          code: 'INVALID_LENGTH',
          message: `Texto do template de botões deve ter no máximo ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH} caracteres`,
          value: text.length,
          limit: MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH,
          severity: 'error'
        });
      }
    } else if (messageType === 'quick_replies') {
      // For Instagram Quick Replies
      if (text.length > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH) {
        errors.push({
          field: 'body.text',
          code: 'INVALID_LENGTH',
          message: `Texto de respostas rápidas deve ter no máximo ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH} caracteres`,
          value: text.length,
          limit: MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH,
          severity: 'error'
        });
      }
    } else {
      // Standard WhatsApp validation
      if (text.length > MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH) {
        errors.push({
          field: 'body.text',
          code: 'INVALID_LENGTH',
          message: VALIDATION_MESSAGES.BODY_TOO_LONG,
          value: text.length,
          limit: MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH,
          severity: 'error'
        });
      } else if (text.length > MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH * 0.9) {
        warnings.push({
          field: 'body.text',
          code: 'LENGTH_WARNING',
          message: 'Body text is approaching the character limit',
          value: text.length,
          limit: MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH,
          severity: 'warning'
        });
      }
    }
  }

  private static validateHeaderContent(content: string, errors: ValidationError[], warnings: ValidationError[], type?: string) {
    if (type === 'text' && content) {
      if (content.length > MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH) {
        errors.push({
          field: 'header.content',
          code: 'INVALID_LENGTH',
          message: VALIDATION_MESSAGES.HEADER_TOO_LONG,
          value: content.length,
          limit: MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH,
          severity: 'error'
        });
      }
    } else if (type && type !== 'text' && content) {
      // Validate URL format for media headers
      if (!VALIDATION_PATTERNS.URL.test(content)) {
        errors.push({
          field: 'header.content',
          code: 'INVALID_FORMAT',
          message: VALIDATION_MESSAGES.INVALID_URL,
          value: content,
          severity: 'error'
        });
      }
    }
  }

  private static validateFooterText(text: string, errors: ValidationError[], warnings: ValidationError[]) {
    if (text && text.length > MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH) {
      errors.push({
        field: 'footer.text',
        code: 'INVALID_LENGTH',
        message: VALIDATION_MESSAGES.FOOTER_TOO_LONG,
        value: text.length,
        limit: MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH,
        severity: 'error'
      });
    }
  }

  private static validateButtons(buttons: QuickReplyButton[], errors: ValidationError[], warnings: ValidationError[], messageType?: InteractiveMessageType) {
    // Instagram Generic Template can have 0 buttons
    if (messageType === 'generic') {
      if (buttons.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: `Máximo de ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS} botões permitidos para carrossel Instagram`,
          value: buttons.length,
          limit: MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS,
          severity: 'error'
        });
      }
    } else if (messageType === 'button_template') {
      // Instagram Button Template requires 1-3 buttons
      if (buttons.length === 0) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: 'Template de botões Instagram requer pelo menos 1 botão',
          value: buttons.length,
          severity: 'error'
        });
      } else if (buttons.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: `Máximo de ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS} botões permitidos para template de botões Instagram`,
          value: buttons.length,
          limit: MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS,
          severity: 'error'
        });
      }
    } else if (messageType === 'quick_replies') {
      // Instagram Quick Replies requires 1-13 buttons
      if (buttons.length === 0) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: 'Respostas rápidas Instagram requer pelo menos 1 opção',
          value: buttons.length,
          severity: 'error'
        });
      } else if (buttons.length > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: `Máximo de ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT} respostas rápidas permitidas para Instagram`,
          value: buttons.length,
          limit: MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT,
          severity: 'error'
        });
      }
    } else {
      // Standard WhatsApp validation
      if (buttons.length > MESSAGE_LIMITS.BUTTON_MAX_COUNT) {
        errors.push({
          field: 'action.buttons',
          code: 'INVALID_COUNT',
          message: VALIDATION_MESSAGES.TOO_MANY_BUTTONS,
          value: buttons.length,
          limit: MESSAGE_LIMITS.BUTTON_MAX_COUNT,
          severity: 'error'
        });
      }
    }

    // Check for duplicate IDs and titles
    const ids = buttons.map(b => b.id);
    const titles = buttons.map(b => b.title).filter(title => title && title.trim());
    
    if (new Set(ids).size !== ids.length) {
      errors.push({
        field: 'action.buttons',
        code: 'DUPLICATE_VALUE',
        message: VALIDATION_MESSAGES.DUPLICATE_BUTTON_ID,
        severity: 'error'
      });
    }

    if (titles.length > 0 && new Set(titles).size !== titles.length) {
      errors.push({
        field: 'action.buttons',
        code: 'DUPLICATE_VALUE',
        message: VALIDATION_MESSAGES.DUPLICATE_BUTTON_TITLE,
        severity: 'error'
      });
    }

    // Validate individual button properties
    buttons.forEach((button, index) => {
      if (!button.title || !button.title.trim()) {
        errors.push({
          field: `action.buttons[${index}].title`,
          code: 'REQUIRED_FIELD',
          message: VALIDATION_MESSAGES.BUTTON_TITLE_REQUIRED,
          severity: 'error'
        });
      } else if (button.title.length > MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH) {
        errors.push({
          field: `action.buttons[${index}].title`,
          code: 'INVALID_LENGTH',
          message: VALIDATION_MESSAGES.BUTTON_TITLE_TOO_LONG,
          value: button.title.length,
          limit: MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH,
          severity: 'error'
        });
      }

      if (!button.id || !button.id.trim()) {
        errors.push({
          field: `action.buttons[${index}].id`,
          code: 'REQUIRED_FIELD',
          message: VALIDATION_MESSAGES.BUTTON_ID_REQUIRED,
          severity: 'error'
        });
      }
    });
  }

  private static validateBusinessRules(message: InteractiveMessage, context: ValidationContext | undefined, errors: ValidationError[], warnings: ValidationError[]) {
    // Instagram Quick Replies specific validation
    if (message.type === 'quick_replies') {
      // Instagram Quick Replies não precisam de header nem footer
      // Não adicionar erros se header/footer estiverem ausentes
      
      // Validar se tem ação de botões (para quick_replies, a ação deve ter buttons)
      if (!message.action || !('buttons' in message.action) || !message.action.buttons) {
        errors.push({
          field: 'action',
          code: 'MISSING_REQUIRED_ACTION',
          message: 'Quick Replies requer configuração de botões',
          severity: 'error'
        });
      }
      
      return; // Sair cedo para Instagram Quick Replies
    }
    
    // Message type specific validation
    if (message.type === 'button') {
      // Para mensagens button, verificar se tem botões configurados (mais importante que action.type)
      const buttonAction = message.action as any;
      const hasButtons = buttonAction?.buttons && Array.isArray(buttonAction.buttons) && buttonAction.buttons.length > 0;
      const hasActionType = message.action?.type === 'button';

      // Se não tem nem botões nem action.type correto, é erro
      if (!hasButtons && !hasActionType) {
        errors.push({
          field: 'action',
          code: 'MISSING_REQUIRED_ACTION',
          message: 'Button message type requires button action configuration',
          severity: 'error'
        });
      }
    }

    // Context-specific validation
    if (context?.existingMessages) {
      const duplicateName = context.existingMessages.find(
        m => m.name === message.name && m.id !== message.id
      );
      if (duplicateName) {
        warnings.push({
          field: 'name',
          code: 'DUPLICATE_NAME',
          message: 'A message with this name already exists',
          severity: 'warning'
        });
      }
    }
  }

  private static convertZodErrors(zodError: z.ZodError, prefix = ''): ValidationError[] {
    return zodError.errors.map(error => ({
      field: prefix ? `${prefix}.${error.path.join('.')}` : error.path.join('.'),
      code: error.code.toUpperCase(),
      message: error.message,
      value: (error as any).received,
      severity: 'error' as const
    }));
  }
}

// Utility functions for error handling
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(error => `${error.field}: ${error.message}`).join('\n');
}

export function groupErrorsByField(errors: ValidationError[]): Record<string, ValidationError[]> {
  return errors.reduce((acc, error) => {
    if (!acc[error.field]) {
      acc[error.field] = [];
    }
    acc[error.field].push(error);
    return acc;
  }, {} as Record<string, ValidationError[]>);
}

export function hasFieldError(errors: ValidationError[], fieldName: string): boolean {
  return errors.some(error => error.field === fieldName || error.field.startsWith(`${fieldName}.`));
}

export function getFieldErrors(errors: ValidationError[], fieldName: string): ValidationError[] {
  return errors.filter(error => error.field === fieldName || error.field.startsWith(`${fieldName}.`));
}