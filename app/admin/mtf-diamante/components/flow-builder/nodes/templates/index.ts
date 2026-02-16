/**
 * Template Node Components
 *
 * Container nodes for WhatsApp Official Templates.
 * The unified WhatsAppTemplateNode accepts all button types via drag & drop.
 */

// Template WhatsApp Unificado (aceita todos os tipos de botão)
export { WhatsAppTemplateNode } from './WhatsAppTemplateNode';

// Re-exports for backward compatibility (all point to unified template)
export { WhatsAppTemplateNode as ButtonTemplateNode } from './WhatsAppTemplateNode';
export { WhatsAppTemplateNode as CouponTemplateNode } from './WhatsAppTemplateNode';
export { WhatsAppTemplateNode as CallTemplateNode } from './WhatsAppTemplateNode';
export { WhatsAppTemplateNode as UrlTemplateNode } from './WhatsAppTemplateNode';
