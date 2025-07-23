/**
 * Interactive Message Utilities for MTF Diamante
 * Handles conversion of interactive messages to WhatsApp API format
 */

import { variableConverter } from './variable-converter';
import type { MtfDiamanteVariavel } from './variable-utils';

export interface InteractiveMessage {
  id?: string;
  name: string;
  type: string;
  header?: {
    type: "text" | "image" | "video" | "document";
    text?: string;
    media_url?: string;
    media_id?: string;
    filename?: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action?: any;
  location?: any;
  reaction?: any;
  sticker?: any;
}

export interface WhatsAppInteractiveMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: string;
    header?: any;
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    action?: any;
  };
}

/**
 * Converts an interactive message to WhatsApp API format
 * Processes variables and converts them to their actual values
 */
export function convertInteractiveMessageToWhatsApp(
  message: InteractiveMessage,
  recipientPhone: string,
  variables: MtfDiamanteVariavel[]
): WhatsAppInteractiveMessage {
  // Process body text - convert variables to actual values
  const processedBodyText = variableConverter.generatePreviewText(
    message.body.text,
    variables
  );

  // Process footer text - convert variables to actual values
  let processedFooterText = '';
  if (message.footer?.text) {
    processedFooterText = variableConverter.generatePreviewText(
      message.footer.text,
      variables
    );
  }

  // Process header text if it exists
  let processedHeaderText = '';
  if (message.header?.type === 'text' && message.header.text) {
    processedHeaderText = variableConverter.generatePreviewText(
      message.header.text,
      variables
    );
  }

  // Build the WhatsApp interactive message
  const whatsappMessage: WhatsAppInteractiveMessage = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: "interactive",
    interactive: {
      type: message.type,
      body: {
        text: processedBodyText
      }
    }
  };

  // Add header if exists
  if (message.header) {
    if (message.header.type === 'text' && processedHeaderText) {
      whatsappMessage.interactive.header = {
        type: "text",
        text: processedHeaderText
      };
    } else if (message.header.type === 'image' && message.header.media_url) {
      whatsappMessage.interactive.header = {
        type: "image",
        image: {
          link: message.header.media_url
        }
      };
    } else if (message.header.type === 'video' && message.header.media_url) {
      whatsappMessage.interactive.header = {
        type: "video",
        video: {
          link: message.header.media_url
        }
      };
    } else if (message.header.type === 'document' && message.header.media_url) {
      whatsappMessage.interactive.header = {
        type: "document",
        document: {
          link: message.header.media_url,
          filename: message.header.filename || "document"
        }
      };
    }
  }

  // Add footer if exists
  if (processedFooterText) {
    whatsappMessage.interactive.footer = {
      text: processedFooterText
    };
  }

  // Add action based on message type
  if (message.action) {
    whatsappMessage.interactive.action = convertActionToWhatsAppFormat(message.action, message.type);
  }

  return whatsappMessage;
}

/**
 * Converts action object to WhatsApp API format
 */
function convertActionToWhatsAppFormat(action: any, messageType: string): any {
  switch (messageType) {
    case 'button':
      if (action.buttons && Array.isArray(action.buttons)) {
        return {
          buttons: action.buttons.map((button: any) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title
            }
          }))
        };
      }
      break;

    case 'cta_url':
      if (action.parameters) {
        return {
          buttons: [{
            type: "url",
            url: {
              display_text: action.parameters.display_text,
              url: action.parameters.url
            }
          }]
        };
      }
      break;

    case 'list':
      if (action.sections && action.button) {
        return {
          button: action.button,
          sections: action.sections.map((section: any) => ({
            title: section.title,
            rows: section.rows.map((row: any) => ({
              id: row.id,
              title: row.title,
              description: row.description || ""
            }))
          }))
        };
      }
      break;

    case 'flow':
      if (action.flow_parameters) {
        return {
          name: "flow",
          parameters: {
            flow_message_version: action.flow_parameters.flow_message_version || "3",
            flow_token: action.flow_parameters.flow_token,
            flow_id: action.flow_parameters.flow_id,
            flow_cta: action.flow_parameters.flow_cta,
            flow_action: action.flow_parameters.flow_action || "navigate",
            flow_action_payload: action.flow_parameters.flow_action_payload || {}
          }
        };
      }
      break;

    case 'location_request':
      return {
        name: "send_location"
      };

    default:
      return action;
  }

  return action;
}

/**
 * Validates if an interactive message is ready to be sent
 */
export function validateInteractiveMessage(message: InteractiveMessage): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!message.name?.trim()) {
    errors.push('Message name is required');
  }

  if (!message.body?.text?.trim()) {
    errors.push('Message body text is required');
  }

  if (!message.type) {
    errors.push('Message type is required');
  }

  // Type-specific validations
  switch (message.type) {
    case 'button':
      if (!message.action?.buttons || !Array.isArray(message.action.buttons) || message.action.buttons.length === 0) {
        errors.push('Button type messages must have at least one button');
      } else {
        message.action.buttons.forEach((button: any, index: number) => {
          if (!button.id?.trim()) {
            errors.push(`Button ${index + 1} must have an ID`);
          }
          if (!button.title?.trim()) {
            errors.push(`Button ${index + 1} must have a title`);
          }
        });
      }
      break;

    case 'cta_url':
      if (!message.action?.parameters?.display_text?.trim()) {
        errors.push('CTA URL messages must have display text');
      }
      if (!message.action?.parameters?.url?.trim()) {
        errors.push('CTA URL messages must have a URL');
      }
      break;

    case 'list':
      if (!message.action?.button?.trim()) {
        errors.push('List messages must have a button text');
      }
      if (!message.action?.sections || !Array.isArray(message.action.sections) || message.action.sections.length === 0) {
        errors.push('List messages must have at least one section');
      }
      break;

    case 'flow':
      if (!message.action?.flow_parameters?.flow_id?.trim()) {
        errors.push('Flow messages must have a flow ID');
      }
      if (!message.action?.flow_parameters?.flow_cta?.trim()) {
        errors.push('Flow messages must have a CTA text');
      }
      break;

    case 'location':
      if (!message.location?.latitude || !message.location?.longitude) {
        errors.push('Location messages must have latitude and longitude');
      }
      break;

    case 'reaction':
      if (!message.reaction?.message_id?.trim()) {
        errors.push('Reaction messages must have a message ID');
      }
      if (!message.reaction?.emoji?.trim()) {
        errors.push('Reaction messages must have an emoji');
      }
      break;

    case 'sticker':
      if (!message.sticker?.id?.trim() && !message.sticker?.url?.trim()) {
        errors.push('Sticker messages must have either an ID or URL');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Gets a preview of how the interactive message will look when sent
 */
export function getInteractiveMessagePreview(
  message: InteractiveMessage,
  variables: MtfDiamanteVariavel[]
): {
  header?: string;
  body: string;
  footer?: string;
  actionSummary: string;
} {
  const preview = {
    body: variableConverter.generatePreviewText(message.body.text, variables),
    actionSummary: getActionSummary(message.action, message.type)
  } as any;

  if (message.header?.type === 'text' && message.header.text) {
    preview.header = variableConverter.generatePreviewText(message.header.text, variables);
  } else if (message.header?.media_url) {
    preview.header = `[${message.header.type.toUpperCase()}] ${message.header.media_url}`;
  }

  if (message.footer?.text) {
    preview.footer = variableConverter.generatePreviewText(message.footer.text, variables);
  }

  return preview;
}

/**
 * Gets a summary of the action for preview purposes
 */
function getActionSummary(action: any, messageType: string): string {
  switch (messageType) {
    case 'button':
      const buttonCount = action?.buttons?.length || 0;
      return `${buttonCount} button(s)`;

    case 'cta_url':
      return `URL button: ${action?.parameters?.display_text || 'No text'}`;

    case 'list':
      const sectionCount = action?.sections?.length || 0;
      return `List with ${sectionCount} section(s)`;

    case 'flow':
      return `Flow: ${action?.flow_parameters?.flow_cta || 'No CTA'}`;

    case 'location_request':
      return 'Location request';

    default:
      return messageType;
  }
}