import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  InstagramTranslationJobData,
  InstagramTranslationResult,
  logWithCorrelationId,
} from '@/lib/queue/instagram-translation.queue';
import { findCompleteMessageMappingByIntent } from '@/lib/dialogflow-database-queries';

const prisma = new PrismaClient();

/**
 * Instagram Translation Worker Task
 * Processes Instagram translation jobs by converting WhatsApp templates to Instagram format
 */
export async function processInstagramTranslationTask(
  job: Job<InstagramTranslationJobData>
): Promise<InstagramTranslationResult> {
  const startTime = Date.now();
  const { intentName, inboxId, contactPhone, correlationId } = job.data;

  logWithCorrelationId('info', 'Starting Instagram translation processing', correlationId, {
    intentName,
    inboxId,
    contactPhone,
  });

  try {
    // Query database for complete message mapping
    const messageMapping = await findCompleteMessageMappingByIntent(intentName, inboxId);

    if (!messageMapping) {
      logWithCorrelationId('warn', 'No message mapping found for intent', correlationId, {
        intentName,
        inboxId,
      });

      return {
        success: false,
        error: `No message mapping found for intent: ${intentName}`,
        processingTime: Date.now() - startTime,
      };
    }

    logWithCorrelationId('info', 'Found message mapping', correlationId, {
      messageType: messageMapping.messageType,
      intentName,
    });

    // Process based on message type
    let fulfillmentMessages: any[] = [];

    switch (messageMapping.messageType) {
      case 'interactive':
        if (messageMapping.interactiveMessage) {
          fulfillmentMessages = await convertInteractiveMessageToInstagram(
            messageMapping.interactiveMessage,
            correlationId
          );
        }
        break;

      case 'enhanced_interactive':
        if (messageMapping.enhancedInteractiveMessage) {
          fulfillmentMessages = await convertEnhancedInteractiveMessageToInstagram(
            messageMapping.enhancedInteractiveMessage,
            correlationId
          );
        }
        break;

      case 'template':
        if (messageMapping.template) {
          // Templates are not supported for Instagram conversion yet
          logWithCorrelationId('warn', 'Template messages not supported for Instagram', correlationId, {
            templateName: messageMapping.template.name,
          });
          
          return {
            success: false,
            error: 'Template messages are not supported for Instagram conversion',
            processingTime: Date.now() - startTime,
          };
        }
        break;

      default:
        logWithCorrelationId('warn', 'Unsupported message type for Instagram', correlationId, {
          messageType: messageMapping.messageType,
        });
        
        return {
          success: false,
          error: `Unsupported message type for Instagram: ${messageMapping.messageType}`,
          processingTime: Date.now() - startTime,
        };
    }

    if (fulfillmentMessages.length === 0) {
      return {
        success: false,
        error: 'No Instagram messages generated from conversion',
        processingTime: Date.now() - startTime,
      };
    }

    const processingTime = Date.now() - startTime;
    logWithCorrelationId('info', 'Instagram translation completed successfully', correlationId, {
      processingTime,
      messagesGenerated: fulfillmentMessages.length,
    });

    return {
      success: true,
      fulfillmentMessages,
      processingTime,
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logWithCorrelationId('error', 'Error processing Instagram translation', correlationId, {
      error: errorMessage,
      processingTime,
      intentName,
      inboxId,
    });

    return {
      success: false,
      error: errorMessage,
      processingTime,
    };
  }
}

/**
 * Convert interactive message to Instagram format
 */
async function convertInteractiveMessageToInstagram(
  interactiveMessage: any,
  correlationId: string
): Promise<any[]> {
  logWithCorrelationId('info', 'Converting interactive message to Instagram', correlationId);

  const bodyText = interactiveMessage.texto || '';
  const bodyLength = bodyText.length;

  // Determine template type based on body length
  if (bodyLength <= 80) {
    // Use Generic Template for messages ≤80 characters
    return createGenericTemplate(interactiveMessage, correlationId);
  } else if (bodyLength <= 640) {
    // Use Button Template for messages 81-640 characters
    return createButtonTemplate(interactiveMessage, correlationId);
  } else {
    // Message too long for Instagram
    throw new Error(`Message body too long for Instagram (${bodyLength} chars, max 640)`);
  }
}

/**
 * Convert enhanced interactive message to Instagram format
 */
async function convertEnhancedInteractiveMessageToInstagram(
  enhancedMessage: any,
  correlationId: string
): Promise<any[]> {
  logWithCorrelationId('info', 'Converting enhanced interactive message to Instagram', correlationId);

  const bodyText = enhancedMessage.bodyText || '';
  const bodyLength = bodyText.length;

  // Determine template type based on body length
  if (bodyLength <= 80) {
    // Use Generic Template for messages ≤80 characters
    return createGenericTemplateFromEnhanced(enhancedMessage, correlationId);
  } else if (bodyLength <= 640) {
    // Use Button Template for messages 81-640 characters
    return createButtonTemplateFromEnhanced(enhancedMessage, correlationId);
  } else {
    // Message too long for Instagram
    throw new Error(`Message body too long for Instagram (${bodyLength} chars, max 640)`);
  }
}

/**
 * Create Generic Template for Instagram (≤80 characters)
 */
function createGenericTemplate(interactiveMessage: any, correlationId: string): any[] {
  logWithCorrelationId('info', 'Creating Generic Template for Instagram', correlationId);

  const element: any = {
    title: interactiveMessage.texto.substring(0, 80), // Limit title to 80 chars
  };

  // Add subtitle from footer if available
  if (interactiveMessage.rodape) {
    element.subtitle = interactiveMessage.rodape.substring(0, 80); // Limit subtitle to 80 chars
  }

  // Add image from header if available
  if (interactiveMessage.headerTipo === 'image' && interactiveMessage.headerConteudo) {
    element.image_url = interactiveMessage.headerConteudo;
  }

  // Convert buttons (limit to 3 for Instagram)
  if (interactiveMessage.botoes && interactiveMessage.botoes.length > 0) {
    element.buttons = convertButtonsToInstagram(interactiveMessage.botoes.slice(0, 3), correlationId);
  }

  const payload = {
    template_type: 'generic',
    elements: [element],
  };

  return [
    {
      custom_payload: {
        instagram: payload,
      },
    },
  ];
}

/**
 * Create Button Template for Instagram (81-640 characters)
 */
function createButtonTemplate(interactiveMessage: any, correlationId: string): any[] {
  logWithCorrelationId('info', 'Creating Button Template for Instagram', correlationId);

  const payload: any = {
    template_type: 'button',
    text: interactiveMessage.texto.substring(0, 640), // Limit text to 640 chars
  };

  // Convert buttons (limit to 3 for Instagram)
  if (interactiveMessage.botoes && interactiveMessage.botoes.length > 0) {
    payload.buttons = convertButtonsToInstagram(interactiveMessage.botoes.slice(0, 3), correlationId);
  }

  return [
    {
      custom_payload: {
        instagram: payload,
      },
    },
  ];
}

/**
 * Create Generic Template from enhanced interactive message
 */
function createGenericTemplateFromEnhanced(enhancedMessage: any, correlationId: string): any[] {
  logWithCorrelationId('info', 'Creating Generic Template from enhanced message', correlationId);

  const element: any = {
    title: enhancedMessage.bodyText.substring(0, 80), // Limit title to 80 chars
  };

  // Add subtitle from footer if available
  if (enhancedMessage.footerText) {
    element.subtitle = enhancedMessage.footerText.substring(0, 80); // Limit subtitle to 80 chars
  }

  // Add image from header if available
  if (enhancedMessage.headerType === 'image' && enhancedMessage.headerContent) {
    element.image_url = enhancedMessage.headerContent;
  }

  // Convert buttons from actionData
  if (enhancedMessage.type === 'button' && enhancedMessage.actionData?.buttons) {
    element.buttons = convertEnhancedButtonsToInstagram(
      enhancedMessage.actionData.buttons.slice(0, 3),
      correlationId
    );
  }

  const payload = {
    template_type: 'generic',
    elements: [element],
  };

  return [
    {
      custom_payload: {
        instagram: payload,
      },
    },
  ];
}

/**
 * Create Button Template from enhanced interactive message
 */
function createButtonTemplateFromEnhanced(enhancedMessage: any, correlationId: string): any[] {
  logWithCorrelationId('info', 'Creating Button Template from enhanced message', correlationId);

  const payload: any = {
    template_type: 'button',
    text: enhancedMessage.bodyText.substring(0, 640), // Limit text to 640 chars
  };

  // Convert buttons from actionData
  if (enhancedMessage.type === 'button' && enhancedMessage.actionData?.buttons) {
    payload.buttons = convertEnhancedButtonsToInstagram(
      enhancedMessage.actionData.buttons.slice(0, 3),
      correlationId
    );
  }

  return [
    {
      custom_payload: {
        instagram: payload,
      },
    },
  ];
}

/**
 * Convert WhatsApp buttons to Instagram format
 */
function convertButtonsToInstagram(buttons: any[], correlationId: string): any[] {
  logWithCorrelationId('info', 'Converting buttons to Instagram format', correlationId, {
    buttonCount: buttons.length,
  });

  return buttons.map((botao) => {
    const instagramButton: any = {
      title: botao.titulo.substring(0, 20), // Instagram button title limit
    };

    // Map button types
    if (botao.tipo === 'web_url' && botao.url) {
      instagramButton.type = 'web_url';
      instagramButton.url = botao.url;
    } else {
      // Default to postback for other types
      instagramButton.type = 'postback';
      instagramButton.payload = botao.id;
    }

    return instagramButton;
  });
}

/**
 * Convert enhanced buttons to Instagram format
 */
function convertEnhancedButtonsToInstagram(buttons: any[], correlationId: string): any[] {
  logWithCorrelationId('info', 'Converting enhanced buttons to Instagram format', correlationId, {
    buttonCount: buttons.length,
  });

  return buttons.map((button) => {
    const instagramButton: any = {
      title: button.title.substring(0, 20), // Instagram button title limit
    };

    // Map button types based on enhanced button structure
    if (button.type === 'url' && button.url) {
      instagramButton.type = 'web_url';
      instagramButton.url = button.url;
    } else {
      // Default to postback for other types
      instagramButton.type = 'postback';
      instagramButton.payload = button.id;
    }

    return instagramButton;
  });
}