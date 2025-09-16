// Core type definitions for Interactive Messages System
// This file provides type-safe interfaces for the unified template system

// Define our own types that match the Prisma schema structure
// These will be used until the Prisma client is regenerated
export interface PrismaTemplate {
  id: string;
  name: string;
  type: string;
  scope: string;
  description?: string | null;
  tags: string[];
  language: string;
  isActive: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  inboxId?: string | null;
}

export interface PrismaInteractiveContent {
  id: string;
  templateId: string;
  bodyId: string;
  interactiveType?: InteractiveMessageType | string;
  // Optional JSON blob to keep Generic Template elements (Instagram/Facebook)
  genericPayload?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaHeader {
  id: string;
  type: string;
  content: string;
  interactiveContentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaBody {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaFooter {
  id: string;
  text: string;
  interactiveContentId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Base message types supported by WhatsApp Business API and Instagram API
export type InteractiveMessageType =
  | "button" // Quick reply buttons (WhatsApp) / Button Template (Instagram)
  | "list" // List picker (WhatsApp)
  | "cta_url" // Call-to-action URL (WhatsApp)
  | "flow" // WhatsApp Flow
  | "location_request" // Request user location
  | "location" // Send location
  | "reaction" // React to message
  | "sticker" // Send sticker
  | "product" // Product message
  | "product_list" // Product list message
  | "quick_replies" // Instagram Quick Replies
  | "generic" // Instagram Generic Template (Carousel)
  | "button_template" // Instagram Button Template
  | "carousel"; // Carousel Template (Multi-element Generic)

// Instagram-specific message types
export type InstagramMessageType =
  | "quick_replies" // Instagram Quick Replies (max 13 options)
  | "generic" // Instagram Generic Template (Carousel, max 10 elements)
  | "button_template" // Instagram Button Template (1-3 buttons)
  | "carousel"; // Instagram Carousel Template (multi-element generic)

// WhatsApp-specific message types
export type WhatsAppMessageType =
  | "button" // Quick reply buttons
  | "list" // List picker
  | "cta_url" // Call-to-action URL
  | "flow" // WhatsApp Flow
  | "location_request" // Request user location
  | "location" // Send location
  | "reaction" // React to message
  | "sticker" // Send sticker
  | "product" // Product message
  | "product_list"; // Product list message

// Header content types
export type HeaderType = "text" | "image" | "video" | "document";

// Button reaction types
export type ReactionType = "emoji" | "text" | "action";

// Core interfaces for message components
export interface MessageHeader {
  type: HeaderType;
  content: string;
  mediaUrl?: string;
  media_url?: string; // Suporte para snake_case também
  mediaId?: string;
  filename?: string;
}

export interface MessageBody {
  text: string;
}

export interface MessageFooter {
  text: string;
}

// Button-specific interfaces - Hybrid structure for compatibility
export interface QuickReplyButton {
  id: string;
  title: string;
  payload?: string;
  // WhatsApp API structure (for future migration)
  type?: "reply";
  reply?: {
    id: string;
    title: string;
  };
}

export interface ButtonReaction {
  id: string;
  buttonId: string;
  messageId: string;
  type: ReactionType;
  emoji?: string;
  textResponse?: string;
  action?: string; // "handoff", "end_conversation", etc.
  isActive: boolean;
}

// List-specific interfaces
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

// CTA URL interface (following WhatsApp API structure)
export interface CtaUrlAction {
  name: "cta_url";
  parameters: {
    display_text: string;
    url: string;
  };
}

// Internal CTA URL action for our system (matches component usage)
export interface InternalCtaUrlAction {
  displayText: string;
  url: string;
}

// Flow-specific interfaces (following WhatsApp API structure)
export interface FlowAction {
  name: "flow";
  parameters: {
    flow_message_version: string;
    flow_id?: string;
    flow_name?: string;
    flow_cta: string;
    mode?: "draft" | "published";
    flow_token?: string;
    flow_action?: "navigate" | "data_exchange";
    flow_action_payload?: {
      screen?: string;
      data?: Record<string, any>;
    };
  };
}

// Location request interface (following WhatsApp API structure)
export interface LocationRequestAction {
  name: "send_location";
}

// Internal location request action for our system
export interface InternalLocationRequestAction {
  // No additional fields needed for location request
}

// Product interfaces
export interface Product {
  productRetailerId: string;
}

export interface ProductList {
  catalogId: string;
  sections: Array<{
    title: string;
    productItems: Product[];
  }>;
}

// Location interface
export interface LocationAction {
  latitude: string;
  longitude: string;
  name?: string;
  address?: string;
}

// Reaction interface
export interface ReactionAction {
  messageId: string;
  emoji: string;
}

// Sticker interface
export interface StickerAction {
  mediaId: string;
}

// Carousel element interface (internal system structure)
export interface CarouselElement {
  id?: string;
  title: string; // Max 80 characters for Instagram
  subtitle?: string; // Max 80 characters for Instagram
  image_url?: string;
  default_action?: {
    type: 'web_url';
    url: string;
    messenger_extensions?: boolean;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
  };
  // For Instagram Generic Template per-element buttons
  buttons?: Array<{
    type: 'web_url' | 'postback';
    title: string;
    url?: string; // when type='web_url'
    payload?: string; // when type='postback'
    messenger_extensions?: boolean;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
  }>; // Max 3 buttons per element
}

// Carousel action interface (internal system structure)
export interface CarouselAction {
  elements: CarouselElement[]; // Max 10 elements for Instagram
}

// Action union type for different message types (internal system structure)
export type MessageAction =
  | { type: "button"; buttons: QuickReplyButton[] }
  | { type: "list"; button: string; sections: ListSection[]; buttonText?: string }
  | { type: "cta_url"; action: InternalCtaUrlAction }
  | { type: "flow"; action: FlowAction }
  | { type: "location_request"; action: InternalLocationRequestAction }
  | { type: "location"; action: LocationAction }
  | { type: "reaction"; action: ReactionAction }
  | { type: "sticker"; action: StickerAction }
  | { type: "product"; product: Product }
  | { type: "product_list"; productList: ProductList }
  | { type: "carousel"; action: CarouselAction };

// Main interactive message interface
export interface InteractiveMessage {
  id?: string;
  name: string;
  type: InteractiveMessageType;
  header?: MessageHeader;
  body: MessageBody;
  footer?: MessageFooter;
  action?: MessageAction;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Extended interface for API responses that include content and genericPayload
export interface InteractiveMessageWithContent extends InteractiveMessage {
  content?: {
    action?: MessageAction;
    genericPayload?: {
      elements?: CarouselElement[];
      [key: string]: any;
    };
    [key: string]: any;
  };
}

// Template-related interfaces
export interface TemplateWithContent extends PrismaTemplate {
  interactiveContent?: PrismaInteractiveContent & {
    header?: PrismaHeader;
    body: PrismaBody;
    footer?: PrismaFooter;
  };
}

// API request/response interfaces
export interface CreateInteractiveMessageRequest {
  inboxId: string;
  message: Omit<InteractiveMessage, "id" | "createdAt" | "updatedAt">;
}

export interface UpdateInteractiveMessageRequest {
  message: Partial<Omit<InteractiveMessage, "id" | "createdAt" | "updatedAt">>;
}

export interface InteractiveMessageResponse {
  success: boolean;
  message?: InteractiveMessage;
  error?: string;
}

// Button reaction API interfaces
export interface CreateButtonReactionRequest {
  messageId: string;
  reactions: Array<{
    buttonId: string;
    type: ReactionType;
    emoji?: string;
    textResponse?: string;
  }>;
}

export interface ButtonReactionResponse {
  success: boolean;
  reactions?: ButtonReaction[];
  error?: string;
}

// Validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface MessageValidationContext {
  type: InteractiveMessageType;
  hasHeader: boolean;
  hasFooter: boolean;
  buttonCount?: number;
  sectionCount?: number;
}

// Component props interfaces
export interface InteractiveMessageCreatorProps {
  inboxId: string;
  editingMessage?: InteractiveMessage;
  onSave?: (message: InteractiveMessage) => void;
  onCancel?: () => void;
}

export interface ButtonReactionConfigProps {
  messageId: string;
  buttons: QuickReplyButton[];
  existingReactions?: ButtonReaction[];
  onSave?: (reactions: ButtonReaction[]) => void;
}

// Utility types for type guards
export type MessageActionType = MessageAction["type"];

// Type guards
export function isButtonAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "button" }> {
  return action.type === "button";
}

export function isListAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "list" }> {
  return action.type === "list";
}

export function isCtaUrlAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "cta_url" }> {
  return action.type === "cta_url";
}

export function isFlowAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "flow" }> {
  return action.type === "flow";
}

export function isLocationRequestAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "location_request" }> {
  return action.type === "location_request";
}

export function isCarouselAction(
  action: MessageAction
): action is Extract<MessageAction, { type: "carousel" }> {
  return action.type === "carousel";
}

// Constants for validation
export const MESSAGE_LIMITS = {
  HEADER_TEXT_MAX_LENGTH: 60,
  BODY_TEXT_MAX_LENGTH: 1024,
  FOOTER_TEXT_MAX_LENGTH: 60,
  BUTTON_TITLE_MAX_LENGTH: 20,
  BUTTON_MAX_COUNT: 3,
  LIST_SECTION_MAX_COUNT: 10,
  LIST_ROW_MAX_COUNT: 10,
  LIST_TITLE_MAX_LENGTH: 24,
  LIST_DESCRIPTION_MAX_LENGTH: 72,
  // Instagram specific limits
  INSTAGRAM_QUICK_REPLIES_MAX_LENGTH: 1000,
  INSTAGRAM_QUICK_REPLIES_MAX_COUNT: 13,
  INSTAGRAM_QUICK_REPLY_TITLE_MAX_LENGTH: 20,
  INSTAGRAM_GENERIC_MAX_ELEMENTS: 10,
  INSTAGRAM_GENERIC_TITLE_MAX_LENGTH: 80,
  INSTAGRAM_GENERIC_SUBTITLE_MAX_LENGTH: 80,
  INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH: 640,
  INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS: 3,
} as const;

// Instagram specific interfaces
export interface InstagramQuickReply {
  content_type: 'text';
  title: string; // Max 20 characters
  payload: string;
}

export interface InstagramQuickRepliesMessage {
  text: string; // Max 1000 bytes UTF-8 (prompt text)
  quick_replies: InstagramQuickReply[]; // Max 13 quick replies
}

export interface InstagramGenericElement {
  title: string; // Max 80 characters
  subtitle?: string; // Max 80 characters
  image_url?: string;
  default_action?: {
    type: 'web_url';
    url: string;
    messenger_extensions?: boolean;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
  };
  buttons?: Array<{
    type: 'web_url' | 'postback';
    title: string;
    url?: string; // For web_url
    payload?: string; // For postback
    messenger_extensions?: boolean; // For web_url
    webview_height_ratio?: 'compact' | 'tall' | 'full'; // For web_url
  }>; // Max 3 buttons per element
}

export interface InstagramGenericTemplate {
  template_type: 'generic';
  elements: InstagramGenericElement[]; // Max 10 elements
}

export interface InstagramButtonTemplate {
  template_type: 'button';
  text: string; // Max 640 characters UTF-8
  buttons: Array<{
    type: 'web_url' | 'postback';
    title: string;
    url?: string; // For web_url
    payload?: string; // For postback
  }>; // 1-3 buttons
}

// Instagram template type determination helper
export interface InstagramTemplateTypeResult {
  type: 'quick_replies' | 'generic' | 'button_template';
  reason: string;
  isOverLimit?: boolean;
}

// Channel type detection
export type ChannelType = 'Channel::WhatsApp' | 'Channel::Instagram' | 'Channel::FacebookPage' | string;

// Helper to determine if channel is Instagram
export const isInstagramChannel = (channelType: string): boolean => {
  // Tratar Facebook Page com a mesma lógica do Instagram
  return channelType === 'Channel::Instagram' || channelType === 'Channel::FacebookPage';
};

// Helper to determine if channel is WhatsApp
export const isWhatsAppChannel = (channelType: string): boolean => {
  return channelType === 'Channel::WhatsApp';
};

// Utility functions for WhatsApp API conversion
export const convertToWhatsAppAPI = {
  button: (button: QuickReplyButton) => ({
    type: "reply" as const,
    reply: {
      id: button.id,
      title: button.title,
    },
  }),
  
  ctaUrl: (action: CtaUrlAction) => ({
    name: "cta_url" as const,
    parameters: {
      display_text: action.parameters.display_text,
      url: action.parameters.url,
    },
  }),
  
  flow: (action: FlowAction) => ({
    name: "flow" as const,
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

// Export our Prisma-compatible types for easy importing
export type {
  PrismaTemplate as Template,
  PrismaInteractiveContent as InteractiveContent,
  PrismaHeader as Header,
  PrismaBody as Body,
  PrismaFooter as Footer,
};
