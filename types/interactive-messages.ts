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
  caixaId?: string | null;
}

export interface PrismaInteractiveContent {
  id: string;
  templateId: string;
  bodyId: string;
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

// Base message types supported by WhatsApp Business API
export type InteractiveMessageType =
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
export type ReactionType = "emoji" | "text";

// Core interfaces for message components
export interface MessageHeader {
  type: HeaderType;
  content: string;
  mediaUrl?: string;
  mediaId?: string;
  filename?: string;
}

export interface MessageBody {
  text: string;
}

export interface MessageFooter {
  text: string;
}

// Button-specific interfaces
export interface QuickReplyButton {
  id: string;
  title: string;
  payload?: string;
}

export interface ButtonReaction {
  id: string;
  buttonId: string;
  messageId: string;
  type: ReactionType;
  emoji?: string;
  textResponse?: string;
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

// CTA URL interface
export interface CtaUrlAction {
  displayText: string;
  url: string;
}

// Flow-specific interfaces
export interface FlowAction {
  flowId: string;
  flowCta: string;
  flowMode: "draft" | "published";
  flowData?: Record<string, any>;
}

// Location request interface
export interface LocationRequestAction {
  requestText: string;
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

// Action union type for different message types
export type MessageAction =
  | { type: "button"; buttons: QuickReplyButton[] }
  | { type: "list"; buttonText: string; sections: ListSection[] }
  | { type: "cta_url"; action: CtaUrlAction }
  | { type: "flow"; action: FlowAction }
  | { type: "location_request"; action: LocationRequestAction }
  | { type: "location"; action: LocationAction }
  | { type: "reaction"; action: ReactionAction }
  | { type: "sticker"; action: StickerAction }
  | { type: "product"; product: Product }
  | { type: "product_list"; productList: ProductList };

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
  caixaId: string;
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
  caixaId: string;
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
} as const;

// Export our Prisma-compatible types for easy importing
export type {
  PrismaTemplate as Template,
  PrismaInteractiveContent as InteractiveContent,
  PrismaHeader as Header,
  PrismaBody as Body,
  PrismaFooter as Footer,
};
