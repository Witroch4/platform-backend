// Type guards and utility functions for Interactive Messages
// Provides runtime type checking and validation helpers

import type {
  InteractiveMessage,
  InteractiveMessageType,
  MessageAction,
  MessageHeader,
  QuickReplyButton,
  ListSection,
  ButtonReaction,
  HeaderType,
} from './interactive-messages';

// Message type guards
export function isInteractiveMessage(obj: any): obj is InteractiveMessage {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.type === 'string' &&
    obj.body &&
    typeof obj.body.text === 'string'
  );
}

export function isValidMessageType(type: string): type is InteractiveMessageType {
  const validTypes: InteractiveMessageType[] = [
    'button',
    'list',
    'cta_url',
    'flow',
    'location_request',
    'product',
    'product_list'
  ];
  return validTypes.includes(type as InteractiveMessageType);
}

// Header type guards
export function hasHeader(message: InteractiveMessage): message is InteractiveMessage & { header: MessageHeader } {
  return message.header !== undefined;
}

export function isValidHeaderType(type: string): type is HeaderType {
  const validTypes: HeaderType[] = ['text', 'image', 'video', 'document'];
  return validTypes.includes(type as HeaderType);
}

export function hasMediaHeader(message: InteractiveMessage): boolean {
  return hasHeader(message) && 
         message.header.type !== 'text' && 
         (!!message.header.mediaUrl || !!message.header.mediaId);
}

// Action type guards
export function hasAction(message: InteractiveMessage): message is InteractiveMessage & { action: MessageAction } {
  return message.action !== undefined;
}

export function isButtonAction(action: MessageAction): action is Extract<MessageAction, { type: "button" }> {
  return action.type === "button";
}

export function isListAction(action: MessageAction): action is Extract<MessageAction, { type: "list" }> {
  return action.type === "list";
}

export function isCtaUrlAction(action: MessageAction): action is Extract<MessageAction, { type: "cta_url" }> {
  return action.type === "cta_url";
}

export function isFlowAction(action: MessageAction): action is Extract<MessageAction, { type: "flow" }> {
  return action.type === "flow";
}

export function isLocationRequestAction(action: MessageAction): action is Extract<MessageAction, { type: "location_request" }> {
  return action.type === "location_request";
}

export function isProductAction(action: MessageAction): action is Extract<MessageAction, { type: "product" }> {
  return action.type === "product";
}

export function isProductListAction(action: MessageAction): action is Extract<MessageAction, { type: "product_list" }> {
  return action.type === "product_list";
}

// Button validation guards
export function isValidButton(button: any): button is QuickReplyButton {
  return (
    button &&
    typeof button === 'object' &&
    typeof button.id === 'string' &&
    button.id.length > 0 &&
    typeof button.title === 'string' &&
    button.title.length > 0
  );
}

export function hasValidButtons(action: MessageAction): boolean {
  if (!isButtonAction(action)) return false;
  return Array.isArray(action.buttons) && 
         action.buttons.length > 0 && 
         action.buttons.every(isValidButton);
}

// List validation guards
export function isValidListRow(row: any): row is ListSection['rows'][0] {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.title === 'string' &&
    row.title.length > 0
  );
}

export function isValidListSection(section: any): section is ListSection {
  return (
    section &&
    typeof section === 'object' &&
    typeof section.title === 'string' &&
    section.title.length > 0 &&
    Array.isArray(section.rows) &&
    section.rows.length > 0 &&
    section.rows.every(isValidListRow)
  );
}

export function hasValidListSections(action: MessageAction): boolean {
  if (!isListAction(action)) return false;
  return Array.isArray(action.sections) && 
         action.sections.length > 0 && 
         action.sections.every(isValidListSection);
}

// URL validation guards
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export function hasValidCtaUrl(action: MessageAction): boolean {
  if (!isCtaUrlAction(action)) return false;
  return typeof action.action.displayText === 'string' &&
         action.action.displayText.length > 0 &&
         typeof action.action.url === 'string' &&
         isValidUrl(action.action.url);
}

// Flow validation guards
export function hasValidFlow(action: MessageAction): boolean {
  if (!isFlowAction(action)) return false;
  return (typeof action.action.parameters.flow_id === 'string' || typeof action.action.parameters.flow_name === 'string') &&
         typeof action.action.parameters.flow_cta === 'string' &&
         action.action.parameters.flow_cta.length > 0 &&
         (!action.action.parameters.mode || action.action.parameters.mode === 'draft' || action.action.parameters.mode === 'published');
}

// Button reaction guards
export function isValidButtonReaction(reaction: any): reaction is ButtonReaction {
  return (
    reaction &&
    typeof reaction === 'object' &&
    typeof reaction.id === 'string' &&
    typeof reaction.buttonId === 'string' &&
    typeof reaction.messageId === 'string' &&
    typeof reaction.type === 'string' &&
    (reaction.type === 'emoji' || reaction.type === 'text') &&
    typeof reaction.isActive === 'boolean'
  );
}

// Message completeness guards
export function isCompleteMessage(message: InteractiveMessage): boolean {
  // Basic required fields
  if (!message.name || !message.body?.text) {
    return false;
  }

  // Type-specific validation
  if (hasAction(message)) {
    switch (message.action.type) {
      case 'button':
        return hasValidButtons(message.action);
      case 'list':
        return hasValidListSections(message.action);
      case 'cta_url':
        return hasValidCtaUrl(message.action);
      case 'flow':
        return hasValidFlow(message.action);
      case 'location_request':
        return isLocationRequestAction(message.action);
      default:
        return false;
    }
  }

  return true;
}

// Message type compatibility guards
export function isCompatibleWithButtonReactions(message: InteractiveMessage): boolean {
  return hasAction(message) && isButtonAction(message.action);
}

export function requiresMediaUpload(message: InteractiveMessage): boolean {
  return hasHeader(message) && message.header.type !== 'text';
}

// Utility functions for type narrowing
export function getActionType(message: InteractiveMessage): MessageAction['type'] | null {
  return hasAction(message) ? message.action.type : null;
}

export function getButtonCount(message: InteractiveMessage): number {
  if (hasAction(message) && isButtonAction(message.action)) {
    return message.action.buttons.length;
  }
  return 0;
}

export function getSectionCount(message: InteractiveMessage): number {
  if (hasAction(message) && isListAction(message.action)) {
    return message.action.sections.length;
  }
  return 0;
}

export function getTotalRowCount(message: InteractiveMessage): number {
  if (hasAction(message) && isListAction(message.action)) {
    return message.action.sections.reduce((total, section) => total + section.rows.length, 0);
  }
  return 0;
}

// Error type guards for better error handling
export function isValidationError(error: any): error is { field: string; message: string } {
  return (
    error &&
    typeof error === 'object' &&
    typeof error.field === 'string' &&
    typeof error.message === 'string'
  );
}

// Media type guards
export function isSupportedImageType(mimeType: string): boolean {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  return supportedTypes.includes(mimeType);
}

export function isSupportedVideoType(mimeType: string): boolean {
  const supportedTypes = ['video/mp4', 'video/3gpp'];
  return supportedTypes.includes(mimeType);
}

export function isSupportedDocumentType(mimeType: string): boolean {
  const supportedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  return supportedTypes.includes(mimeType);
}

export function isSupportedMediaType(mimeType: string, headerType: HeaderType): boolean {
  switch (headerType) {
    case 'image':
      return isSupportedImageType(mimeType);
    case 'video':
      return isSupportedVideoType(mimeType);
    case 'document':
      return isSupportedDocumentType(mimeType);
    default:
      return false;
  }
}