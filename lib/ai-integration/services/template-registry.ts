/**
 * Template Registry Service
 * Registry of versioned templates (text/interactive) by channel and language
 * Requirements: 8.3, 8.4
 */

import { z } from 'zod';

export type TemplateType = 'text' | 'interactive' | 'quick_reply' | 'button_template';
export type Channel = 'whatsapp' | 'instagram' | 'messenger';
export type Language = 'pt-BR' | 'en-US' | 'es-ES';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

export interface TemplateButton {
  type: 'reply' | 'postback' | 'web_url';
  title: string;
  payload?: string;
  url?: string;
}

export interface TemplateContent {
  text: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    url?: string;
  };
  footer?: string;
  buttons?: TemplateButton[];
  quickReplies?: Array<{
    title: string;
    payload: string;
  }>;
}

export interface Template {
  id: string;
  name: string;
  version: string;
  type: TemplateType;
  channel: Channel;
  language: Language;
  content: TemplateContent;
  variables: TemplateVariable[];
  metadata: {
    description?: string;
    category?: string;
    tags?: string[];
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isDefault: boolean;
  };
  abTest?: {
    enabled: boolean;
    variants: Array<{
      id: string;
      name: string;
      weight: number;
      content: TemplateContent;
    }>;
    metrics: {
      impressions: number;
      clicks: number;
      conversions: number;
    };
  };
}

export interface TemplateRenderContext {
  variables: Record<string, any>;
  channel: Channel;
  language: Language;
  accountId?: number;
  conversationId?: string;
}

export interface RenderedTemplate {
  content: TemplateContent;
  usedVariant?: string;
  renderTime: Date;
  metadata: {
    templateId: string;
    templateVersion: string;
    variables: Record<string, any>;
  };
}

// Zod schemas for validation
const TemplateButtonSchema = z.object({
  type: z.enum(['reply', 'postback', 'web_url']),
  title: z.string().min(1).max(20),
  payload: z.string().optional(),
  url: z.string().url().optional(),
});

const TemplateContentSchema = z.object({
  text: z.string().min(1),
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().optional(),
    url: z.string().url().optional(),
  }).optional(),
  footer: z.string().max(60).optional(),
  buttons: z.array(TemplateButtonSchema).max(3).optional(),
  quickReplies: z.array(z.object({
    title: z.string().min(1).max(20),
    payload: z.string().min(1),
  })).max(13).optional(),
});

export class TemplateRegistryService {
  private templates: Map<string, Template> = new Map();
  private templatesByName: Map<string, Template[]> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Register a new template
   */
  registerTemplate(template: Omit<Template, 'id'> & { metadata?: Partial<Template['metadata']> }): Template {
    const id = this.generateTemplateId(template.name, template.version, template.channel, template.language);
    
    const fullTemplate: Template = {
      ...template,
      id,
      metadata: {
        description: template.metadata?.description,
        category: template.metadata?.category,
        tags: template.metadata?.tags || [],
        createdBy: template.metadata?.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isDefault: false,
      },
    };

    // Validate template content
    this.validateTemplate(fullTemplate);

    // Store template
    this.templates.set(id, fullTemplate);

    // Update name index
    const nameKey = `${template.name}:${template.channel}:${template.language}`;
    const existingTemplates = this.templatesByName.get(nameKey) || [];
    existingTemplates.push(fullTemplate);
    this.templatesByName.set(nameKey, existingTemplates);

    console.log('Template registered:', {
      id,
      name: template.name,
      version: template.version,
      channel: template.channel,
      language: template.language,
    });

    return fullTemplate;
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): Template | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get template by name, channel, and language
   */
  getTemplateByName(
    name: string,
    channel: Channel,
    language: Language,
    version?: string
  ): Template | undefined {
    const nameKey = `${name}:${channel}:${language}`;
    const templates = this.templatesByName.get(nameKey) || [];

    if (version) {
      return templates.find(t => t.version === version && t.metadata.isActive);
    }

    // Return latest active version
    return templates
      .filter(t => t.metadata.isActive)
      .sort((a, b) => this.compareVersions(b.version, a.version))[0];
  }

  /**
   * List templates with filters
   */
  listTemplates(filters?: {
    channel?: Channel;
    language?: Language;
    type?: TemplateType;
    category?: string;
    isActive?: boolean;
  }): Template[] {
    const templates = Array.from(this.templates.values());

    return templates.filter(template => {
      if (filters?.channel && template.channel !== filters.channel) return false;
      if (filters?.language && template.language !== filters.language) return false;
      if (filters?.type && template.type !== filters.type) return false;
      if (filters?.category && template.metadata.category !== filters.category) return false;
      if (filters?.isActive !== undefined && template.metadata.isActive !== filters.isActive) return false;
      return true;
    }).sort((a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime());
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    templateId: string,
    context: TemplateRenderContext
  ): RenderedTemplate | null {
    const template = this.getTemplate(templateId);
    if (!template || !template.metadata.isActive) {
      return null;
    }

    try {
      // Select variant for A/B testing
      const selectedContent = this.selectTemplateVariant(template);
      const usedVariant = template.abTest?.enabled ? 'variant' : undefined;

      // Render content with variables
      const renderedContent = this.renderContent(selectedContent, context.variables);

      // Validate rendered content for channel
      this.validateRenderedContent(renderedContent, context.channel);

      console.log('Template rendered:', {
        templateId,
        templateName: template.name,
        channel: context.channel,
        language: context.language,
        usedVariant,
      });

      return {
        content: renderedContent,
        usedVariant,
        renderTime: new Date(),
        metadata: {
          templateId,
          templateVersion: template.version,
          variables: context.variables,
        },
      };
    } catch (error) {
      console.error('Failed to render template:', error);
      return null;
    }
  }

  /**
   * Update template
   */
  updateTemplate(templateId: string, updates: Partial<Template>): Template | null {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    const updatedTemplate: Template = {
      ...template,
      ...updates,
      id: templateId, // Ensure ID doesn't change
      metadata: {
        ...template.metadata,
        ...updates.metadata,
        updatedAt: new Date(),
      },
    };

    // Validate updated template
    this.validateTemplate(updatedTemplate);

    // Update storage
    this.templates.set(templateId, updatedTemplate);

    // Update name index
    const nameKey = `${updatedTemplate.name}:${updatedTemplate.channel}:${updatedTemplate.language}`;
    const existingTemplates = this.templatesByName.get(nameKey) || [];
    const index = existingTemplates.findIndex(t => t.id === templateId);
    if (index >= 0) {
      existingTemplates[index] = updatedTemplate;
      this.templatesByName.set(nameKey, existingTemplates);
    }

    console.log('Template updated:', {
      templateId,
      name: updatedTemplate.name,
      version: updatedTemplate.version,
    });

    return updatedTemplate;
  }

  /**
   * Activate/deactivate template
   */
  toggleTemplate(templateId: string, isActive: boolean): boolean {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }

    template.metadata.isActive = isActive;
    template.metadata.updatedAt = new Date();

    console.log('Template toggled:', {
      templateId,
      name: template.name,
      isActive,
    });

    return true;
  }

  /**
   * Delete template
   */
  deleteTemplate(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }

    // Remove from main storage
    this.templates.delete(templateId);

    // Remove from name index
    const nameKey = `${template.name}:${template.channel}:${template.language}`;
    const existingTemplates = this.templatesByName.get(nameKey) || [];
    const filteredTemplates = existingTemplates.filter(t => t.id !== templateId);
    
    if (filteredTemplates.length > 0) {
      this.templatesByName.set(nameKey, filteredTemplates);
    } else {
      this.templatesByName.delete(nameKey);
    }

    console.log('Template deleted:', {
      templateId,
      name: template.name,
    });

    return true;
  }

  /**
   * Setup A/B test for template
   */
  setupABTest(
    templateId: string,
    variants: Array<{
      name: string;
      weight: number;
      content: TemplateContent;
    }>
  ): boolean {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }

    // Validate weights sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Variant weights must sum to 100');
    }

    template.abTest = {
      enabled: true,
      variants: variants.map((variant, index) => ({
        id: `variant_${index}`,
        ...variant,
      })),
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
      },
    };

    template.metadata.updatedAt = new Date();

    console.log('A/B test setup:', {
      templateId,
      variantsCount: variants.length,
    });

    return true;
  }

  /**
   * Record A/B test metrics
   */
  recordABTestMetric(
    templateId: string,
    metric: 'impression' | 'click' | 'conversion'
  ): void {
    const template = this.templates.get(templateId);
    if (!template?.abTest?.enabled) {
      return;
    }

    switch (metric) {
      case 'impression':
        template.abTest.metrics.impressions++;
        break;
      case 'click':
        template.abTest.metrics.clicks++;
        break;
      case 'conversion':
        template.abTest.metrics.conversions++;
        break;
    }
  }

  /**
   * Get template preview
   */
  getTemplatePreview(
    templateId: string,
    sampleVariables?: Record<string, any>
  ): {
    template: Template;
    preview: RenderedTemplate;
    validation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  } | null {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    // Use sample variables or defaults
    const variables = sampleVariables || this.generateSampleVariables(template.variables);

    // Render preview
    const preview = this.renderTemplate(templateId, {
      variables,
      channel: template.channel,
      language: template.language,
    });

    if (!preview) {
      return null;
    }

    // Validate preview
    const validation = this.validateTemplatePreview(template, preview);

    return {
      template,
      preview,
      validation,
    };
  }

  /**
   * Validate template
   */
  private validateTemplate(template: Template): void {
    // Validate content schema
    const contentValidation = TemplateContentSchema.safeParse(template.content);
    if (!contentValidation.success) {
      throw new Error(`Invalid template content: ${contentValidation.error.message}`);
    }

    // Channel-specific validation
    this.validateChannelSpecificContent(template.content, template.channel);
  }

  /**
   * Validate channel-specific content
   */
  private validateChannelSpecificContent(content: TemplateContent, channel: Channel): void {
    switch (channel) {
      case 'whatsapp':
        if (content.text.length > 1024) {
          throw new Error('WhatsApp text content cannot exceed 1024 characters');
        }
        if (content.buttons && content.buttons.length > 3) {
          throw new Error('WhatsApp supports maximum 3 buttons');
        }
        if (content.header?.text && content.header.text.length > 60) {
          throw new Error('WhatsApp header text cannot exceed 60 characters');
        }
        if (content.footer && content.footer.length > 60) {
          throw new Error('WhatsApp footer text cannot exceed 60 characters');
        }
        break;

      case 'instagram':
        if (content.quickReplies && content.quickReplies.length > 13) {
          throw new Error('Instagram supports maximum 13 quick replies');
        }
        if (content.buttons && content.buttons.length > 3) {
          throw new Error('Instagram supports maximum 3 buttons');
        }
        // Validate HTTPS for web_url buttons
        if (content.buttons) {
          for (const button of content.buttons) {
            if (button.type === 'web_url' && button.url && !button.url.startsWith('https://')) {
              throw new Error('Instagram web_url buttons must use HTTPS');
            }
          }
        }
        break;
    }
  }

  /**
   * Validate rendered content
   */
  private validateRenderedContent(content: TemplateContent, channel: Channel): void {
    this.validateChannelSpecificContent(content, channel);
  }

  /**
   * Render content with variables
   */
  private renderContent(content: TemplateContent, variables: Record<string, any>): TemplateContent {
    const rendered: TemplateContent = {
      text: this.interpolateVariables(content.text, variables),
    };

    if (content.header) {
      rendered.header = {
        ...content.header,
        text: content.header.text ? this.interpolateVariables(content.header.text, variables) : undefined,
      };
    }

    if (content.footer) {
      rendered.footer = this.interpolateVariables(content.footer, variables);
    }

    if (content.buttons) {
      rendered.buttons = content.buttons.map(button => ({
        ...button,
        title: this.interpolateVariables(button.title, variables),
        payload: button.payload ? this.interpolateVariables(button.payload, variables) : undefined,
      }));
    }

    if (content.quickReplies) {
      rendered.quickReplies = content.quickReplies.map(reply => ({
        ...reply,
        title: this.interpolateVariables(reply.title, variables),
        payload: this.interpolateVariables(reply.payload, variables),
      }));
    }

    return rendered;
  }

  /**
   * Interpolate variables in text
   */
  private interpolateVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName]?.toString() || match;
    });
  }

  /**
   * Select template variant for A/B testing
   */
  private selectTemplateVariant(template: Template): TemplateContent {
    if (!template.abTest?.enabled || !template.abTest.variants.length) {
      return template.content;
    }

    // Simple weighted random selection
    const random = Math.random() * 100;
    let cumulativeWeight = 0;

    for (const variant of template.abTest.variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return variant.content;
      }
    }

    // Fallback to original content
    return template.content;
  }

  /**
   * Generate template ID
   */
  private generateTemplateId(name: string, version: string, channel: Channel, language: Language): string {
    return `${name}_${version}_${channel}_${language}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    
    return 0;
  }

  /**
   * Generate sample variables for preview
   */
  private generateSampleVariables(variables: TemplateVariable[]): Record<string, any> {
    const sample: Record<string, any> = {};

    for (const variable of variables) {
      if (variable.defaultValue !== undefined) {
        sample[variable.name] = variable.defaultValue;
      } else {
        switch (variable.type) {
          case 'string':
            sample[variable.name] = `Sample ${variable.name}`;
            break;
          case 'number':
            sample[variable.name] = 123;
            break;
          case 'boolean':
            sample[variable.name] = true;
            break;
          case 'date':
            sample[variable.name] = new Date().toISOString();
            break;
        }
      }
    }

    return sample;
  }

  /**
   * Validate template preview
   */
  private validateTemplatePreview(
    template: Template,
    preview: RenderedTemplate
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.validateRenderedContent(preview.content, template.channel);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Validation error');
    }

    // Check for missing variables
    const originalText = template.content.text;
    const renderedText = preview.content.text;
    const missingVars = originalText.match(/\{\{(\w+)\}\}/g);
    
    if (missingVars) {
      for (const match of missingVars) {
        if (renderedText.includes(match)) {
          warnings.push(`Variable ${match} was not replaced`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    // WhatsApp greeting template
    this.registerTemplate({
      name: 'greeting',
      version: '1.0.0',
      type: 'interactive',
      channel: 'whatsapp',
      language: 'pt-BR',
      content: {
        text: 'Olá {{name}}! Como posso ajudar você hoje?',
        footer: 'SocialWise',
        buttons: [
          { type: 'reply', title: 'Rastrear Pedido', payload: 'intent:track_order' },
          { type: 'reply', title: 'Suporte', payload: 'help:contact' },
        ],
      },
      variables: [
        { name: 'name', type: 'string', required: true, defaultValue: 'Cliente' },
      ],
      metadata: {
        description: 'Template de saudação padrão',
        category: 'greeting',
        tags: ['greeting', 'welcome'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isDefault: true,
      },
    });

    // Instagram quick reply template
    this.registerTemplate({
      name: 'help_menu',
      version: '1.0.0',
      type: 'quick_reply',
      channel: 'instagram',
      language: 'pt-BR',
      content: {
        text: 'Escolha uma opção para continuar:',
        quickReplies: [
          { title: 'FAQ', payload: 'help:faq' },
          { title: 'Contato', payload: 'help:contact' },
          { title: 'Pedidos', payload: 'intent:track_order' },
        ],
      },
      variables: [],
      metadata: {
        description: 'Menu de ajuda para Instagram',
        category: 'help',
        tags: ['help', 'menu'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isDefault: true,
      },
    });

    console.log('Default templates initialized:', {
      totalTemplates: this.templates.size,
    });
  }
}

// Export singleton instance
export const templateRegistryService = new TemplateRegistryService();