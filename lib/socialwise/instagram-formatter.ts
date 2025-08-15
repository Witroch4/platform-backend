/**
 * Instagram/Messenger button template formatting for SocialWise Flow
 * Implements strict limits and Facebook Messenger plain text fallback
 */

import { 
  clampTitle, 
  clampBody, 
  clampPayload, 
  validatePayloadFormat, 
  type ButtonData 
} from './clamps';

/**
 * Instagram Button Template Structure
 */
export interface InstagramButtonTemplate {
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'button';
        text: string; // ≤ 640 chars
        buttons: Array<{
          type: 'postback';
          title: string; // ≤ 20 chars
          payload: string; // ≤ 1000 chars
        }>;
      };
    };
  };
}

/**
 * Facebook Messenger Text Message (fallback)
 */
export interface FacebookTextMessage {
  message: {
    text: string; // ≤ 2000 chars
  };
}

/**
 * Union type for Instagram/Facebook messages
 */
export type InstagramMessage = InstagramButtonTemplate | FacebookTextMessage;

/**
 * Button formatting options for Instagram
 */
export interface InstagramButtonOptions {
  title: string;
  payload: string;
}

/**
 * Message formatting options for Instagram
 */
export interface InstagramMessageOptions {
  text: string;
  buttons: InstagramButtonOptions[];
}

/**
 * Builds Instagram button template with strict limits
 * Implements graceful degradation to Facebook Messenger plain text when formatting fails
 */
export function buildInstagramButtons(
  text: string,
  buttons: InstagramButtonOptions[],
  options: {
    enableFallback?: boolean;
  } = {}
): InstagramMessage {
  const { enableFallback = true } = options;

  // Validate input
  if (!text || !Array.isArray(buttons) || buttons.length === 0) {
    throw new Error('Text and buttons array are required');
  }

  // Limit to maximum 3 buttons for Instagram
  const limitedButtons = buttons.slice(0, 3);

  try {
    // Clamp text to Instagram limit (640 chars)
    const clampedText = clampBody(text, 'instagram');
    if (!clampedText) {
      throw new Error('Text is empty after clamping');
    }

    // Process buttons with clamping and validation
    const processedButtons: Array<{
      type: 'postback';
      title: string;
      payload: string;
    }> = [];

    for (let i = 0; i < limitedButtons.length; i++) {
      const button = limitedButtons[i];
      
      // Clamp title and payload
      const clampedTitle = clampTitle(button.title);
      const clampedPayload = clampPayload(button.payload, 'instagram');
      
      // Validate payload format
      if (!validatePayloadFormat(clampedPayload)) {
        if (enableFallback) {
          console.warn(`Invalid payload format for Instagram button ${i + 1}: ${button.payload}, falling back to text`);
          return buildFacebookTextFallback(text, buttons);
        }
        throw new Error(`Invalid payload format for button ${i + 1}: ${button.payload}`);
      }

      // Ensure title is not empty
      if (!clampedTitle) {
        if (enableFallback) {
          console.warn(`Empty title for Instagram button ${i + 1} after clamping, falling back to text`);
          return buildFacebookTextFallback(text, buttons);
        }
        throw new Error(`Button ${i + 1} title is empty after clamping`);
      }

      processedButtons.push({
        type: 'postback',
        title: clampedTitle,
        payload: clampedPayload
      });
    }

    // Build Instagram button template
    return {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: clampedText,
            buttons: processedButtons
          }
        }
      }
    };

  } catch (error) {
    if (enableFallback) {
      console.warn('Failed to build Instagram button template, falling back to Facebook text:', error);
      return buildFacebookTextFallback(text, buttons);
    }
    throw error;
  }
}

/**
 * Builds Facebook Messenger plain text fallback when button template formatting fails
 */
export function buildFacebookTextFallback(
  text: string,
  buttons: InstagramButtonOptions[]
): FacebookTextMessage {
  // Build text with numbered options
  let messageText = '';
  
  // Add main text
  const clampedText = clampBody(text, 'facebook');
  messageText += clampedText;

  // Add numbered buttons
  if (buttons.length > 0) {
    messageText += '\n\nEscolha uma opção:\n';
    
    buttons.slice(0, 9).forEach((button, index) => {
      const clampedTitle = clampTitle(button.title, 50); // More generous for text format
      if (clampedTitle) {
        messageText += `${index + 1}. ${clampedTitle}\n`;
      }
    });
  }

  // Final clamp to ensure we don't exceed Facebook Messenger limits (2000 chars)
  const finalText = messageText.length > 2000 
    ? messageText.slice(0, 1997) + '...' 
    : messageText;

  return {
    message: {
      text: finalText
    }
  };
}

/**
 * Validates Instagram button template structure
 */
export function validateInstagramMessage(message: InstagramMessage): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if ('attachment' in message.message) {
    // Instagram button template
    const template = message.message.attachment.payload;

    // Check text limit
    if (!template.text) {
      violations.push('Instagram template text is required');
    } else if (template.text.length > 640) {
      violations.push(`Template text exceeds 640 characters (${template.text.length})`);
    }

    // Check button limits
    if (!template.buttons || !Array.isArray(template.buttons)) {
      violations.push('Instagram template buttons are required');
    } else {
      const buttons = template.buttons;
      
      if (buttons.length > 3) {
        violations.push(`Too many buttons: ${buttons.length} (max: 3)`);
      }

      buttons.forEach((button, index) => {
        if (!button.title) {
          violations.push(`Button ${index + 1} title is required`);
        } else if (button.title.length > 20) {
          violations.push(`Button ${index + 1} title exceeds 20 characters`);
        }

        if (!button.payload) {
          violations.push(`Button ${index + 1} payload is required`);
        } else if (button.payload.length > 1000) {
          violations.push(`Button ${index + 1} payload exceeds 1000 characters`);
        } else if (!validatePayloadFormat(button.payload)) {
          violations.push(`Button ${index + 1} payload format invalid (must match ^@[a-z0-9_]+$)`);
        }

        if (button.type !== 'postback') {
          violations.push(`Button ${index + 1} type must be 'postback'`);
        }
      });
    }

    if (template.template_type !== 'button') {
      violations.push('Template type must be "button"');
    }

  } else if ('text' in message.message) {
    // Facebook text message
    if (!message.message.text) {
      violations.push('Facebook text message body is required');
    } else if (message.message.text.length > 2000) {
      violations.push(`Facebook text message exceeds 2000 characters (${message.message.text.length})`);
    }
  } else {
    violations.push('Unknown message format');
  }

  return {
    isValid: violations.length === 0,
    violations
  };
}

/**
 * Utility to create Instagram button options from simple data
 */
export function createInstagramButtonOptions(
  buttons: Array<{ title: string; intent: string }>
): InstagramButtonOptions[] {
  return buttons.map(button => ({
    title: button.title,
    payload: button.intent.startsWith('@') ? button.intent : `@${button.intent}`
  }));
}

/**
 * Utility to build a simple Instagram button template
 */
export function buildSimpleInstagramMessage(
  text: string,
  buttonData: Array<{ title: string; intent: string }>
): InstagramMessage {
  const buttons = createInstagramButtonOptions(buttonData);
  return buildInstagramButtons(text, buttons);
}

/**
 * Builds Instagram Generic Template (for multiple cards)
 */
export interface InstagramGenericElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons: Array<{
    type: 'postback';
    title: string;
    payload: string;
  }>;
}

export interface InstagramGenericTemplate {
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'generic';
        elements: InstagramGenericElement[];
      };
    };
  };
}

/**
 * Builds Instagram Generic Template with multiple elements
 */
export function buildInstagramGenericTemplate(
  elements: Array<{
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons: InstagramButtonOptions[];
  }>,
  options: {
    enableFallback?: boolean;
  } = {}
): InstagramGenericTemplate | FacebookTextMessage {
  const { enableFallback = true } = options;

  if (!elements || elements.length === 0) {
    throw new Error('At least one element is required for generic template');
  }

  try {
    const processedElements: InstagramGenericElement[] = [];

    for (let i = 0; i < Math.min(elements.length, 10); i++) { // Instagram limit: 10 elements
      const element = elements[i];
      
      const clampedTitle = clampTitle(element.title, 80); // More generous for card titles
      if (!clampedTitle) {
        if (enableFallback) {
          console.warn(`Empty title for element ${i + 1}, falling back to text`);
          return buildGenericFallback(elements);
        }
        throw new Error(`Element ${i + 1} title is empty after clamping`);
      }

      const processedButtons: Array<{
        type: 'postback';
        title: string;
        payload: string;
      }> = [];

      // Process buttons for this element
      for (let j = 0; j < Math.min(element.buttons.length, 3); j++) {
        const button = element.buttons[j];
        const clampedButtonTitle = clampTitle(button.title);
        const clampedPayload = clampPayload(button.payload, 'instagram');

        if (!validatePayloadFormat(clampedPayload) || !clampedButtonTitle) {
          if (enableFallback) {
            console.warn(`Invalid button in element ${i + 1}, falling back to text`);
            return buildGenericFallback(elements);
          }
          throw new Error(`Invalid button in element ${i + 1}`);
        }

        processedButtons.push({
          type: 'postback',
          title: clampedButtonTitle,
          payload: clampedPayload
        });
      }

      processedElements.push({
        title: clampedTitle,
        subtitle: element.subtitle ? clampBody(element.subtitle, 'instagram') : undefined,
        image_url: element.image_url,
        buttons: processedButtons
      });
    }

    return {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: processedElements
          }
        }
      }
    };

  } catch (error) {
    if (enableFallback) {
      console.warn('Failed to build Instagram generic template, falling back to text:', error);
      return buildGenericFallback(elements);
    }
    throw error;
  }
}

/**
 * Builds text fallback for generic template
 */
function buildGenericFallback(
  elements: Array<{
    title: string;
    subtitle?: string;
    buttons: InstagramButtonOptions[];
  }>
): FacebookTextMessage {
  let text = '';

  elements.slice(0, 5).forEach((element, index) => {
    if (index > 0) text += '\n\n';
    
    text += `*${clampTitle(element.title, 50)}*`;
    
    if (element.subtitle) {
      text += `\n${clampBody(element.subtitle, 'facebook')}`;
    }

    if (element.buttons.length > 0) {
      text += '\nOpções:';
      element.buttons.slice(0, 3).forEach((button, btnIndex) => {
        const clampedTitle = clampTitle(button.title, 30);
        if (clampedTitle) {
          text += `\n${btnIndex + 1}. ${clampedTitle}`;
        }
      });
    }
  });

  // Final clamp
  const finalText = text.length > 2000 ? text.slice(0, 1997) + '...' : text;

  return {
    message: {
      text: finalText
    }
  };
}