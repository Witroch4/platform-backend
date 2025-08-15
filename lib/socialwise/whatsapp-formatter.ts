/**
 * WhatsApp interactive message formatting for SocialWise Flow
 * Implements strict limits and graceful degradation for button messages
 */

import { 
  clampTitle, 
  clampBody, 
  clampPayload, 
  validatePayloadFormat, 
  type ButtonData 
} from './clamps';

/**
 * WhatsApp Interactive Message Structure
 */
export interface WhatsAppInteractiveMessage {
  type: 'interactive';
  interactive: {
    type: 'button';
    body: {
      text: string; // ≤ 1024 chars
    };
    header?: {
      type: 'text';
      text: string;
    };
    footer?: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: {
          id: string;    // ≤ 256 chars
          title: string; // ≤ 20 chars
        };
      }>;
    };
  };
}

/**
 * WhatsApp Text Message (fallback)
 */
export interface WhatsAppTextMessage {
  type: 'text';
  text: {
    body: string;
  };
}

/**
 * Union type for WhatsApp messages
 */
export type WhatsAppMessage = WhatsAppInteractiveMessage | WhatsAppTextMessage;

/**
 * Button formatting options
 */
export interface WhatsAppButtonOptions {
  title: string;
  payload: string;
}

/**
 * Message formatting options
 */
export interface WhatsAppMessageOptions {
  body: string;
  buttons: WhatsAppButtonOptions[];
  header?: string;
  footer?: string;
}

/**
 * Builds WhatsApp interactive button message with strict limits
 * Implements graceful degradation to numbered text when formatting fails
 */
export function buildButtons(
  body: string,
  buttons: WhatsAppButtonOptions[],
  options: {
    header?: string;
    footer?: string;
    enableFallback?: boolean;
  } = {}
): WhatsAppMessage {
  const { header, footer, enableFallback = true } = options;

  // Validate input
  if (!body || !Array.isArray(buttons) || buttons.length === 0) {
    throw new Error('Body text and buttons array are required');
  }

  // Limit to maximum 3 buttons for WhatsApp
  const limitedButtons = buttons.slice(0, 3);

  try {
    // Clamp body text to WhatsApp limit
    const clampedBody = clampBody(body, 'whatsapp');
    if (!clampedBody) {
      throw new Error('Body text is empty after clamping');
    }

    // Process buttons with clamping and validation
    const processedButtons: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }> = [];

    for (let i = 0; i < limitedButtons.length; i++) {
      const button = limitedButtons[i];
      
      // Clamp title and payload
      const clampedTitle = clampTitle(button.title);
      const clampedPayload = clampPayload(button.payload, 'whatsapp');
      
      // Validate payload format
      if (!validatePayloadFormat(clampedPayload)) {
        if (enableFallback) {
          console.warn(`Invalid payload format for button ${i + 1}: ${button.payload}, falling back to text`);
          return buildNumberedTextFallback(body, buttons, options);
        }
        throw new Error(`Invalid payload format for button ${i + 1}: ${button.payload}`);
      }

      // Ensure title is not empty
      if (!clampedTitle) {
        if (enableFallback) {
          console.warn(`Empty title for button ${i + 1} after clamping, falling back to text`);
          return buildNumberedTextFallback(body, buttons, options);
        }
        throw new Error(`Button ${i + 1} title is empty after clamping`);
      }

      processedButtons.push({
        type: 'reply',
        reply: {
          id: clampedPayload,
          title: clampedTitle
        }
      });
    }

    // Build interactive message
    const interactive: WhatsAppInteractiveMessage['interactive'] = {
      type: 'button',
      body: { text: clampedBody },
      action: { buttons: processedButtons }
    };

    // Add optional header
    if (header) {
      const clampedHeader = clampTitle(header, 60); // More generous limit for headers
      if (clampedHeader) {
        interactive.header = {
          type: 'text',
          text: clampedHeader
        };
      }
    }

    // Add optional footer
    if (footer) {
      const clampedFooter = clampTitle(footer, 60); // More generous limit for footers
      if (clampedFooter) {
        interactive.footer = {
          text: clampedFooter
        };
      }
    }

    return {
      type: 'interactive',
      interactive
    };

  } catch (error) {
    if (enableFallback) {
      console.warn('Failed to build interactive message, falling back to text:', error);
      return buildNumberedTextFallback(body, buttons, options);
    }
    throw error;
  }
}

/**
 * Builds numbered text fallback when interactive message formatting fails
 */
export function buildNumberedTextFallback(
  body: string,
  buttons: WhatsAppButtonOptions[],
  options: {
    header?: string;
    footer?: string;
  } = {}
): WhatsAppTextMessage {
  const { header, footer } = options;

  // Build text with numbered options
  let text = '';
  
  // Add header if provided
  if (header) {
    const clampedHeader = clampTitle(header, 60);
    if (clampedHeader) {
      text += `*${clampedHeader}*\n\n`;
    }
  }

  // Add main body
  const clampedBody = clampBody(body, 'whatsapp');
  text += clampedBody;

  // Add numbered buttons
  if (buttons.length > 0) {
    text += '\n\nEscolha uma opção:\n';
    
    buttons.slice(0, 9).forEach((button, index) => {
      const clampedTitle = clampTitle(button.title, 50); // More generous for text format
      if (clampedTitle) {
        text += `${index + 1}. ${clampedTitle}\n`;
      }
    });
  }

  // Add footer if provided
  if (footer) {
    const clampedFooter = clampTitle(footer, 60);
    if (clampedFooter) {
      text += `\n_${clampedFooter}_`;
    }
  }

  // Final clamp to ensure we don't exceed WhatsApp limits
  const finalText = clampBody(text, 'whatsapp');

  return {
    type: 'text',
    text: {
      body: finalText
    }
  };
}

/**
 * Validates WhatsApp message structure
 */
export function validateWhatsAppMessage(message: WhatsAppMessage): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (message.type === 'interactive') {
    const interactive = message.interactive;

    // Check body text limit
    if (!interactive.body?.text) {
      violations.push('Interactive message body text is required');
    } else if (interactive.body.text.length > 1024) {
      violations.push(`Body text exceeds 1024 characters (${interactive.body.text.length})`);
    }

    // Check button limits
    if (!interactive.action?.buttons || !Array.isArray(interactive.action.buttons)) {
      violations.push('Interactive message buttons are required');
    } else {
      const buttons = interactive.action.buttons;
      
      if (buttons.length > 3) {
        violations.push(`Too many buttons: ${buttons.length} (max: 3)`);
      }

      buttons.forEach((button, index) => {
        if (!button.reply?.title) {
          violations.push(`Button ${index + 1} title is required`);
        } else if (button.reply.title.length > 20) {
          violations.push(`Button ${index + 1} title exceeds 20 characters`);
        }

        if (!button.reply?.id) {
          violations.push(`Button ${index + 1} ID is required`);
        } else if (button.reply.id.length > 256) {
          violations.push(`Button ${index + 1} ID exceeds 256 characters`);
        } else if (!validatePayloadFormat(button.reply.id)) {
          violations.push(`Button ${index + 1} ID format invalid (must match ^@[a-z0-9_]+$)`);
        }
      });
    }

    // Check header if present
    if (interactive.header && interactive.header.text && interactive.header.text.length > 60) {
      violations.push(`Header text exceeds 60 characters (${interactive.header.text.length})`);
    }

    // Check footer if present
    if (interactive.footer && interactive.footer.text && interactive.footer.text.length > 60) {
      violations.push(`Footer text exceeds 60 characters (${interactive.footer.text.length})`);
    }

  } else if (message.type === 'text') {
    // Check text message limits
    if (!message.text?.body) {
      violations.push('Text message body is required');
    } else if (message.text.body.length > 4096) {
      violations.push(`Text message exceeds 4096 characters (${message.text.body.length})`);
    }
  } else {
    violations.push('Unknown message type');
  }

  return {
    isValid: violations.length === 0,
    violations
  };
}

/**
 * Utility to create quick button options from simple data
 */
export function createButtonOptions(
  buttons: Array<{ title: string; intent: string }>
): WhatsAppButtonOptions[] {
  return buttons.map(button => ({
    title: button.title,
    payload: button.intent.startsWith('@') ? button.intent : `@${button.intent}`
  }));
}

/**
 * Utility to build a simple interactive message
 */
export function buildSimpleInteractiveMessage(
  body: string,
  buttonData: Array<{ title: string; intent: string }>,
  header?: string
): WhatsAppMessage {
  const buttons = createButtonOptions(buttonData);
  return buildButtons(body, buttons, { header });
}