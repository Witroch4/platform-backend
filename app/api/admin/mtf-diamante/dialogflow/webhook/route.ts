import { NextResponse } from "next/server";
import {
  addStoreMessageTask,
  addUpdateApiKeyTask,
  addProcessIntentTask,
  addSendMessageTask,
  addSendReactionTask,
  addProcessButtonClickTask,
  generateCorrelationId,
  createTemplateMessageTask,
  createInteractiveMessageTask,
  createReactionTask,
  createTextReactionTask,
  logWithCorrelationId,
} from "@/lib/queue/mtf-diamante-webhook.queue";
import { recordWebhookMetrics } from "@/lib/monitoring/application-performance-monitor";
import { performance } from 'perf_hooks';
import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";
import { ABTestingManager } from "@/lib/feature-flags/ab-testing-manager";
import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from '@/lib/connections';
import {
  extractWebhookData,
  validateWebhookData,
  hasValidApiKey,
  logWebhookData,
  extractUnifiedWebhookData,
  validateUnifiedWebhookData,
  sanitizeWebhookPayload,
  logUnifiedWebhookData,
  logWebhookError,
  detectChannelType,
  UnifiedWebhookPayload,
  ExtractedWebhookData,
} from "@/lib/webhook-utils";
import {
  findCompleteMessageMappingByIntent,
  findReactionByButtonId,
} from "@/lib/dialogflow-database-queries";
import {
  addInstagramTranslationJob,
  createInstagramTranslationJob,
  waitForInstagramTranslationResult,
  generateCorrelationId as generateInstagramCorrelationId,
  logWithCorrelationId as logInstagramWithCorrelationId,
} from "@/lib/queue/instagram-translation.queue";
import { createInstagramFallbackMessage } from "@/lib/instagram/payload-builder";

// Feature flag constants
const FEATURE_FLAGS = {
  NEW_WEBHOOK_PROCESSING: 'NEW_WEBHOOK_PROCESSING',
  UNIFIED_PAYLOAD_EXTRACTION: 'UNIFIED_PAYLOAD_EXTRACTION',
  HIGH_PRIORITY_QUEUE: 'HIGH_PRIORITY_QUEUE',
  LOW_PRIORITY_QUEUE: 'LOW_PRIORITY_QUEUE',
} as const;

// Initialize Prisma and Redis instances
const prisma = getPrismaInstance();
const redis = getRedisInstance();

// Feature flag manager instance
const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);

// Helper function to check if feature flag is enabled
async function isFeatureEnabled(
  flagName: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  try {
    return await featureFlagManager.isEnabled(flagName, undefined, undefined, metadata);
  } catch (error) {
    console.error(`[FeatureFlag] Error checking flag ${flagName}:`, error);
    return false; // Default to disabled on error
  }
}

/**
 * Parse Dialogflow request to identify request type
 * Enhanced to better detect button clicks from WhatsApp interactive messages
 */
function parseDialogflowRequest(req: any): {
  type: "intent" | "button_click";
  intentName?: string;
  buttonId?: string;
  buttonText?: string;
  messageId?: string;
  originalMessageId?: string;
  recipientPhone: string;
  whatsappApiKey: string;
  inboxId?: string;
} {
  const webhookData = extractWebhookData(req);

  // Check if this is a button click from Dialogflow payload
  const chatwootPayload = req.originalDetectIntentRequest?.payload;
  const interactive = chatwootPayload?.interactive;

  // Enhanced button click detection
  if (interactive?.type === "button_reply") {
    return {
      type: "button_click",
      buttonId: interactive.button_reply?.id,
      buttonText: interactive.button_reply?.title,
      messageId: chatwootPayload?.id || chatwootPayload?.wamid,
      originalMessageId: chatwootPayload?.context?.id,
      recipientPhone: webhookData.contactPhone,
      whatsappApiKey: webhookData.whatsappApiKey,
      inboxId: webhookData.inboxId,
    };
  }

  // Check for list reply (also a type of button interaction)
  if (interactive?.type === "list_reply") {
    return {
      type: "button_click",
      buttonId: interactive.list_reply?.id,
      buttonText: interactive.list_reply?.title,
      messageId: chatwootPayload?.id || chatwootPayload?.wamid,
      originalMessageId: chatwootPayload?.context?.id,
      recipientPhone: webhookData.contactPhone,
      whatsappApiKey: webhookData.whatsappApiKey,
      inboxId: webhookData.inboxId,
    };
  }

  // Check for direct WhatsApp webhook format (fallback)
  const whatsappMessage = req.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (whatsappMessage?.type === 'interactive') {
    const whatsappInteractive = whatsappMessage.interactive;
    
    if (whatsappInteractive?.type === 'button_reply') {
      return {
        type: "button_click",
        buttonId: whatsappInteractive.button_reply?.id,
        buttonText: whatsappInteractive.button_reply?.title,
        messageId: whatsappMessage.id,
        originalMessageId: whatsappMessage.context?.id,
        recipientPhone: whatsappMessage.from,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId,
      };
    }
    
    if (whatsappInteractive?.type === 'list_reply') {
      return {
        type: "button_click",
        buttonId: whatsappInteractive.list_reply?.id,
        buttonText: whatsappInteractive.list_reply?.title,
        messageId: whatsappMessage.id,
        originalMessageId: whatsappMessage.context?.id,
        recipientPhone: whatsappMessage.from,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId,
      };
    }
  }

  // Otherwise it's an intent
  return {
    type: "intent",
    intentName: webhookData.intentName,
    recipientPhone: webhookData.contactPhone,
    whatsappApiKey: webhookData.whatsappApiKey,
    inboxId: String(webhookData.inboxId), // Garantir que seja string
  };
}

/**
 * Extract template variables from Dialogflow payload
 */
function extractTemplateVariables(payload: any): Record<string, any> {
  const variables: Record<string, any> = {};

  // Extract parameters from queryResult
  const parameters = payload.queryResult?.parameters || {};

  // Common variable mappings
  if (parameters.person?.name) {
    variables.name = parameters.person.name;
    variables.nome = parameters.person.name;
  }

  if (parameters.phone) {
    variables.phone = parameters.phone;
    variables.telefone = parameters.phone;
  }

  if (parameters.email) {
    variables.email = parameters.email;
  }

  // Add all parameters as potential variables
  Object.keys(parameters).forEach((key) => {
    if (parameters[key] && typeof parameters[key] === "string") {
      variables[key] = parameters[key];
    }
  });

  return variables;
}

/**
 * Process intent request by queuing appropriate message task
 */
async function processIntentRequest(
  intentName: string,
  recipientPhone: string,
  whatsappApiKey: string,
  inboxId: string,
  correlationId: string,
  originalPayload: any
): Promise<void> {
  try {
    console.log(
      `[MTF Diamante Dispatcher] Processing intent: ${intentName} for ${recipientPhone}`
    );

    // Validate required data
    if (!recipientPhone || !whatsappApiKey) {
      console.error(
        `[MTF Diamante Dispatcher] Missing required data - phone: ${recipientPhone}, apiKey: ${whatsappApiKey ? "present" : "missing"}`
      );
      return;
    }

    // O inboxId aqui é o inbox_id do Chatwit (4), mas precisamos do ID interno da CaixaEntrada
    // Vamos buscar primeiro a CaixaEntrada pelo inboxId para obter o ID interno
    console.log(
      `[MTF Diamante Dispatcher] Received inboxId (inbox_id): ${inboxId} (${typeof inboxId})`
    );

    // Query database for complete message mapping
    const messageMapping = await findCompleteMessageMappingByIntent(
      intentName,
      String(inboxId || "")
    );

    if (!messageMapping) {
      console.log(
        `[MTF Diamante Dispatcher] No mapping found for intent: ${intentName}, inbox: ${inboxId}`
      );
      return;
    }

    console.log(
      `[MTF Diamante Dispatcher] Found mapping: ${messageMapping.messageType} for intent: ${intentName}`
    );

    // Create appropriate task based on message type
    switch (messageMapping.messageType) {
      case "template":
        if (messageMapping.template) {
          // Extract variables from Dialogflow payload
          const variables = extractTemplateVariables(originalPayload);

          const templateTask = createTemplateMessageTask({
            recipientPhone,
            whatsappApiKey:
              messageMapping.whatsappConfig.whatsappToken || whatsappApiKey,
            templateId: messageMapping.template.templateId,
            templateName: messageMapping.template.name,
            variables,
            correlationId,
            metadata: {
              intentName,
              inboxId,
              originalPayload,
              phoneNumberId: messageMapping.whatsappConfig.phoneNumberId, // Add phoneNumberId to metadata
            },
          });

          await addSendMessageTask(templateTask);
          console.log(
            `[MTF Diamante Dispatcher] Template message task queued for intent: ${intentName}, template: ${messageMapping.template.name}`
          );
        }
        break;

      case "interactive":
        if (messageMapping.interactiveMessage) {
          const interactiveTask = createInteractiveMessageTask({
            recipientPhone,
            whatsappApiKey:
              messageMapping.whatsappConfig.whatsappToken || whatsappApiKey,
            interactiveContent: {
              header: messageMapping.interactiveMessage.headerTipo
                ? {
                    type: messageMapping.interactiveMessage.headerTipo as any,
                    content:
                      messageMapping.interactiveMessage.headerConteudo || "",
                  }
                : undefined,
              body: messageMapping.interactiveMessage.texto,
              footer: messageMapping.interactiveMessage.rodape,
              buttons: messageMapping.interactiveMessage.botoes.map(
                (botao) => ({
                  id: botao.id,
                  title: botao.titulo,
                  type: "reply" as const,
                })
              ),
            },
            correlationId,
            metadata: {
              intentName,
              inboxId,
              originalPayload,
              phoneNumberId: messageMapping.whatsappConfig.phoneNumberId, // Add phoneNumberId to metadata
            },
          });

          await addSendMessageTask(interactiveTask);
          console.log(
            `[MTF Diamante Dispatcher] Interactive message task queued for intent: ${intentName}`
          );
        }
        break;

      case "unified_template":
        if (messageMapping.unifiedTemplate) {
          // Handle unified template - this is a more complex message type
          console.log(
            `[MTF Diamante Dispatcher] Unified template processing for intent: ${intentName} - implementation needed`
          );
          // TODO: Implement unified template processing
        }
        break;

      case "enhanced_interactive":
        if (messageMapping.enhancedInteractiveMessage) {
          console.log(
            `[MTF Diamante Dispatcher] Processing enhanced interactive message for intent: ${intentName}`
          );

          const enhancedMessage = messageMapping.enhancedInteractiveMessage;

          // Construir conteúdo interativo baseado no tipo
          const interactiveContent: any = {
            body: enhancedMessage.bodyText,
          };

          // Adicionar header se existir
          if (enhancedMessage.headerType && enhancedMessage.headerContent) {
            interactiveContent.header = {
              type: enhancedMessage.headerType,
              content: enhancedMessage.headerContent,
            };
          }

          // Adicionar footer se existir
          if (enhancedMessage.footerText) {
            interactiveContent.footer = enhancedMessage.footerText;
          }

          // Processar actionData baseado no tipo de mensagem
          if (enhancedMessage.type === "button" && enhancedMessage.actionData) {
            // Mensagem com botões
            const actionData = enhancedMessage.actionData as any;
            if (actionData.buttons && Array.isArray(actionData.buttons)) {
              interactiveContent.buttons = actionData.buttons.map(
                (button: any) => ({
                  id: button.id,
                  title: button.title,
                  type: "reply" as const,
                })
              );
            }
          } else if (
            enhancedMessage.type === "list" &&
            enhancedMessage.actionData
          ) {
            // Mensagem com lista
            const actionData = enhancedMessage.actionData as any;
            if (actionData.sections && Array.isArray(actionData.sections)) {
              interactiveContent.listSections = actionData.sections;
              interactiveContent.buttonText =
                actionData.buttonText || "Selecionar";
            }
          }

          console.log(`[MTF Diamante Dispatcher] Creating enhanced interactive task with data:`, {
            recipientPhone,
            hasWhatsappApiKey: !!(messageMapping.whatsappConfig.whatsappToken || whatsappApiKey),
            interactiveContent,
            correlationId,
            enhancedMessageId: enhancedMessage.id,
            enhancedMessageType: enhancedMessage.type,
          });

          const enhancedInteractiveTask = createInteractiveMessageTask({
            recipientPhone,
            whatsappApiKey:
              messageMapping.whatsappConfig.whatsappToken || whatsappApiKey,
            interactiveContent,
            correlationId,
            metadata: {
              intentName,
              inboxId,
              originalPayload,
              phoneNumberId: messageMapping.whatsappConfig.phoneNumberId, // Add phoneNumberId to metadata
            },
          });

          console.log(`[MTF Diamante Dispatcher] Enhanced interactive task created:`, {
            taskType: enhancedInteractiveTask.type,
            hasRecipientPhone: !!enhancedInteractiveTask.recipientPhone,
            hasWhatsappApiKey: !!enhancedInteractiveTask.whatsappApiKey,
            hasMessageData: !!enhancedInteractiveTask.messageData,
            correlationId: enhancedInteractiveTask.correlationId,
          });

          await addSendMessageTask(enhancedInteractiveTask);
          console.log(
            `[MTF Diamante Dispatcher] Enhanced interactive message task queued for intent: ${intentName}, type: ${enhancedMessage.type}`
          );
        }
        break;

      default:
        console.log(
          `[MTF Diamante Dispatcher] Unknown message type: ${messageMapping.messageType} for intent: ${intentName}`
        );
    }
  } catch (error) {
    console.error(
      `[MTF Diamante Dispatcher] Error processing intent ${intentName}:`,
      error
    );
    // Don't throw - we want to return 200 OK to Dialogflow even if queuing fails
  }
}

/**
 * Process button click request by queuing reaction task if configured
 */
async function processButtonClickRequest(
  buttonId: string,
  messageId: string,
  recipientPhone: string,
  whatsappApiKey: string,
  correlationId: string,
  originalPayload: any,
  phoneNumberId?: string
): Promise<void> {
  try {
    console.log(
      `[MTF Diamante Dispatcher] Processing button click: ${buttonId} for ${recipientPhone}`
    );

    // Query database for button reaction mapping
    const reactionMapping = await findReactionByButtonId(buttonId);

    if (!reactionMapping) {
      console.log(
        `[MTF Diamante Dispatcher] No reaction mapping found for button: ${buttonId}`
      );
      return;
    }

    console.log(
      `[MTF Diamante Dispatcher] Found reaction mapping: ${buttonId} -> emoji: ${reactionMapping.emoji}, text: ${reactionMapping.textReaction}`
    );

    // Process emoji reaction if configured
    if (reactionMapping.emoji) {
      const reactionTask = createReactionTask({
        recipientPhone,
        messageId,
        emoji: reactionMapping.emoji,
        whatsappApiKey,
        correlationId,
        metadata: {
          buttonId,
          phoneNumberId,
          originalPayload,
        },
      });

      await addSendReactionTask(reactionTask);
      console.log(
        `[MTF Diamante Dispatcher] Emoji reaction task queued for button: ${buttonId} -> ${reactionMapping.emoji}`
      );
    }

    // Process text reaction if configured
    if (reactionMapping.textReaction) {
      const textMessageTask = createTextReactionTask({
        recipientPhone,
        whatsappApiKey,
        textMessage: reactionMapping.textReaction,
        correlationId,
        metadata: {
          buttonId,
          phoneNumberId,
          originalPayload,
          replyToMessageId: messageId,
        },
      });

      await addSendMessageTask(textMessageTask);
      console.log(
        `[MTF Diamante Dispatcher] Text reaction task queued for button: ${buttonId} -> "${reactionMapping.textReaction}"`
      );
    }
  } catch (error) {
    console.error(
      `[MTF Diamante Dispatcher] Error processing button click ${buttonId}:`,
      error
    );
    // Don't throw - we want to return 200 OK to Dialogflow even if queuing fails
  }
}

/**
 * Handle Instagram translation with deferred response logic
 */
async function handleInstagramTranslation(
  req: any,
  correlationId: string,
  startTime: number,
  payloadSize: number
): Promise<Response> {
  try {
    logInstagramWithCorrelationId('info', 'Processing Instagram translation request', correlationId);

    // Extract webhook data for Instagram processing
    const webhookData = extractWebhookData(req);
    
    // Log extracted data for debugging
    logInstagramWithCorrelationId('debug', 'Extracted webhook data for Instagram translation', correlationId, {
      intentName: webhookData.intentName,
      inboxId: webhookData.inboxId,
      contactPhone: webhookData.contactPhone,
      conversationId: webhookData.conversationId,
      hasConversationId: !!webhookData.conversationId,
      conversationIdLength: webhookData.conversationId?.length || 0,
      cacheKeyWillInclude: 'usuarioChatwitId will be extracted from database query',
    });
    
    // Validate required data for Instagram translation
    if (!webhookData.intentName || !webhookData.inboxId || !webhookData.contactPhone) {
      logInstagramWithCorrelationId('error', 'Missing required data for Instagram translation', correlationId, {
        hasIntentName: !!webhookData.intentName,
        hasInboxId: !!webhookData.inboxId,
        hasContactPhone: !!webhookData.contactPhone,
      });
      
      // Return fallback response for Dialogflow
      return createDialogflowFallbackResponse(correlationId, 'Missing required data for Instagram translation');
    }

    // Create Instagram translation job
    const instagramJobData = createInstagramTranslationJob({
      intentName: webhookData.intentName,
      inboxId: webhookData.inboxId,
      contactPhone: webhookData.contactPhone,
      conversationId: webhookData.conversationId || webhookData.contactPhone || `conv_${Date.now()}`,
      originalPayload: req,
      correlationId: generateInstagramCorrelationId(),
    });

    // Queue the Instagram translation job
    const jobId = await addInstagramTranslationJob(instagramJobData);
    logInstagramWithCorrelationId('info', 'Instagram translation job queued', correlationId, { jobId });

    // Wait for worker completion with 4.5 second timeout
    const result = await waitForInstagramTranslationResult(instagramJobData.correlationId, 4500);
    
    const responseTime = performance.now() - startTime;
    
    // Handle null result case (job not found or in unknown state)
    if (!result) {
      logInstagramWithCorrelationId('error', 'Instagram translation job returned null result', correlationId, {
        responseTime,
        jobId,
      });
      
      // Record error metrics
      recordWebhookMetrics({
        responseTime,
        timestamp: new Date(),
        correlationId,
        success: false,
        error: 'Job returned null result',
        payloadSize,
        interactionType: 'intent',
      });
      
      return createDialogflowFallbackResponse(correlationId, 'Erro interno no processamento da mensagem.');
    }
    
    // Record webhook metrics
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: result.success,
      payloadSize,
      interactionType: 'intent',
    });

    if (result.success && result.fulfillmentMessages) {
      logInstagramWithCorrelationId('info', 'Instagram translation completed successfully', correlationId, {
        processingTime: result.processingTime,
        responseTime,
        messagesCount: result.fulfillmentMessages.length,
      });

      // Validate that we have proper Instagram fulfillment messages
      if (!Array.isArray(result.fulfillmentMessages) || result.fulfillmentMessages.length === 0) {
        logInstagramWithCorrelationId('warn', 'Empty fulfillment messages received from worker', correlationId);
        return createDialogflowFallbackResponse(correlationId, 'Empty response from Instagram translation');
      }

      // Validate Socialwise payload structure
      const hasValidSocialwisePayload = result.fulfillmentMessages.some(msg => 
        msg.payload && msg.payload.socialwiseResponse
      );

      if (!hasValidSocialwisePayload) {
        logInstagramWithCorrelationId('warn', 'Invalid Socialwise payload structure', correlationId, {
          fulfillmentMessages: result.fulfillmentMessages,
        });
        return createDialogflowFallbackResponse(correlationId, 'Invalid Socialwise payload structure');
      }

      // Log the exact response being sent to Dialogflow
      const dialogflowResponse = {
        fulfillmentMessages: result.fulfillmentMessages,
      };
      
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] EXACT RESPONSE SENT TO DIALOGFLOW:`, JSON.stringify(dialogflowResponse, null, 2));
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] FULFILLMENT MESSAGES DETAILS:`, result.fulfillmentMessages.map((msg, index) => ({
        index,
        hasPayload: !!msg.payload,
        hasSocialwiseResponse: !!(msg.payload && msg.payload.socialwiseResponse),
        originalStructure: Object.keys(msg),
        payloadKeys: msg.payload ? Object.keys(msg.payload) : [],
        socialwiseResponseKeys: msg.payload && msg.payload.socialwiseResponse ? Object.keys(msg.payload.socialwiseResponse) : [],
        messageFormat: msg.payload?.socialwiseResponse?.message_format,
        finalStructure: 'payload.socialwiseResponse'
      })));

      // Return successful Instagram response to Dialogflow
      return new Response(JSON.stringify(dialogflowResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Correlation-ID': correlationId,
          'X-Processing-Time': result.processingTime.toString(),
          'X-Response-Time': responseTime.toString(),
        },
      });
    } else {
      logInstagramWithCorrelationId('error', 'Instagram translation failed', correlationId, {
        error: result.error,
        processingTime: result.processingTime,
        responseTime,
      });

      // Categorize error types for better fallback handling
      let fallbackMessage = 'Desculpe, não foi possível processar sua mensagem no momento.';
      
      if (result.error?.includes('timeout')) {
        fallbackMessage = 'Processamento demorou muito. Tente novamente.';
      } else if (result.error?.includes('too long')) {
        fallbackMessage = 'Sua mensagem é muito longa para o Instagram. Tente uma mensagem mais curta.';
      } else if (result.error?.includes('No message mapping')) {
        fallbackMessage = 'Mensagem não configurada para Instagram.';
      }

      // Return categorized fallback response for Dialogflow
      return createDialogflowFallbackResponse(correlationId, fallbackMessage);
    }

  } catch (error) {
    const responseTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logInstagramWithCorrelationId('error', 'Critical error in Instagram translation', correlationId, {
      error: errorMessage,
      responseTime,
    });

    // Record error metrics
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: false,
      error: errorMessage,
      payloadSize,
      interactionType: 'intent',
    });

    // Return fallback response for Dialogflow
    return createDialogflowFallbackResponse(correlationId, errorMessage);
  }
}

/**
 * Create fallback response for Dialogflow when Instagram translation fails
 */
function createDialogflowFallbackResponse(correlationId: string, fallbackMessage: string): Response {
  console.log(`[MTF Diamante Dispatcher] [${correlationId}] CREATING FALLBACK RESPONSE - Message: ${fallbackMessage}`);
  
  // Create Instagram-specific fallback message using the provided fallbackMessage
  const instagramFallback = createInstagramFallbackMessage(fallbackMessage);
  
  const fallbackResponse = {
    fulfillmentMessages: instagramFallback,
  };

  console.log(`[MTF Diamante Dispatcher] [${correlationId}] FALLBACK RESPONSE SENT TO DIALOGFLOW:`, JSON.stringify(fallbackResponse, null, 2));

  return new Response(JSON.stringify(fallbackResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Correlation-ID': correlationId,
      'X-Fallback-Message': fallbackMessage,
    },
  });
}

/**
 * Main webhook handler - Optimized for millisecond response
 * Extracts payload data in under 50ms and returns 202 Accepted immediately
 */
export async function POST(request: Request) {
  const startTime = performance.now();
  let correlationId = '';
  let payloadSize = 0;
  let interactionType: 'intent' | 'button_reply' = 'intent';

  try {
    // Parse request payload
    const req = await request.json();
    payloadSize = JSON.stringify(req).length;
    
    // Generate correlation ID immediately for request tracing
    correlationId = generateCorrelationId();
    
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Received Dialogflow request`);
    
    // Log complete payload for debugging (only for Instagram channels)
    const channelTypeCheck = req.originalDetectIntentRequest?.payload?.channel_type;
    if (channelTypeCheck === 'Channel::Instagram') {
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] COMPLETE DIALOGFLOW PAYLOAD:`, JSON.stringify(req, null, 2));
      
      // Log specific sections for easier analysis
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] PAYLOAD SECTIONS:`);
      console.log('- queryResult:', JSON.stringify(req.queryResult, null, 2));
      console.log('- originalDetectIntentRequest:', JSON.stringify(req.originalDetectIntentRequest, null, 2));
      console.log('- session:', req.session);
      console.log('- responseId:', req.responseId);
    }

    // Detect channel type for Instagram translation
    const channelDetection = detectChannelType(req);
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Channel detection:`, {
      isInstagram: channelDetection.isInstagram,
      channelType: channelDetection.channelType,
    });

    // Handle Instagram translation with deferred response
    if (channelDetection.isInstagram) {
      return await handleInstagramTranslation(req, correlationId, startTime, payloadSize);
    }

    // Check if new webhook processing is enabled
    const useNewWebhookProcessing = await isFeatureEnabled(FEATURE_FLAGS.NEW_WEBHOOK_PROCESSING, {
      inboxId: req.originalDetectIntentRequest?.payload?.inbox_id,
      contactPhone: req.originalDetectIntentRequest?.payload?.contact_phone,
      timestamp: new Date(),
    });

    // Extract unified webhook data with validation (optimized for speed)
    let unifiedData: UnifiedWebhookPayload;
    try {
      const useUnifiedExtraction = await isFeatureEnabled(FEATURE_FLAGS.UNIFIED_PAYLOAD_EXTRACTION);
      
      if (useUnifiedExtraction) {
        unifiedData = extractUnifiedWebhookData(req);
        unifiedData = sanitizeWebhookPayload(unifiedData);
        
        const validation = validateUnifiedWebhookData(unifiedData);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
        
        // Set interaction type for monitoring
        interactionType = unifiedData.interactionType;
      } else {
        // Fallback to legacy extraction
        throw new Error('Unified extraction disabled, using legacy fallback');
      }
    } catch (extractionError) {
      // Log extraction error but continue with legacy extraction for backward compatibility
      console.warn(`[MTF Diamante Dispatcher] [${correlationId}] Unified extraction failed, falling back to legacy:`, extractionError);
      
      // Fallback to legacy extraction
      const webhookData = extractWebhookData(req);
      logWebhookData(webhookData, req);
      
      // Queue legacy tasks for backward compatibility
      await queueLegacyTasks(req, webhookData, correlationId);
      
      // Return 202 Accepted with correlation ID
      const responseTime = performance.now() - startTime;
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] Legacy fallback response in ${responseTime}ms`);
      
      // Record webhook metrics for monitoring (fallback case)
      recordWebhookMetrics({
        responseTime,
        timestamp: new Date(),
        correlationId,
        success: true,
        payloadSize,
        interactionType: 'intent', // Default for legacy fallback
      });
      
      return new Response(JSON.stringify({ correlationId }), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Correlation-ID': correlationId,
        },
      });
    }

    // Log extracted data with correlation ID
    const extractionTime = Date.now() - startTime;
    logUnifiedWebhookData(unifiedData, correlationId, extractionTime);

    // Queue jobs based on feature flags
    if (useNewWebhookProcessing) {
      // Use new queue system
      const useHighPriorityQueue = await isFeatureEnabled(FEATURE_FLAGS.HIGH_PRIORITY_QUEUE, {
        inboxId: unifiedData.inboxId,
        contactPhone: unifiedData.contactPhone,
      });
      
      const useLowPriorityQueue = await isFeatureEnabled(FEATURE_FLAGS.LOW_PRIORITY_QUEUE, {
        inboxId: unifiedData.inboxId,
        contactPhone: unifiedData.contactPhone,
      });

      // Queue high priority job for user response (non-blocking)
      if (useHighPriorityQueue) {
        setImmediate(async () => {
          try {
            await queueHighPriorityJob(unifiedData, correlationId);
          } catch (error) {
            console.error(`[MTF Diamante Dispatcher] [${correlationId}] Error queuing high priority job:`, error);
          }
        });
      }

      // Queue low priority job for data persistence (non-blocking)
      if (useLowPriorityQueue) {
        setImmediate(async () => {
          try {
            await queueLowPriorityJob(unifiedData, correlationId);
          } catch (error) {
            console.error(`[MTF Diamante Dispatcher] [${correlationId}] Error queuing low priority job:`, error);
          }
        });
      }
    }

    // Queue legacy tasks for backward compatibility (non-blocking)
    setImmediate(async () => {
      try {
        const legacyData = convertToLegacyFormat(unifiedData);
        await queueLegacyTasks(req, legacyData, correlationId);
      } catch (error) {
        console.error(`[MTF Diamante Dispatcher] [${correlationId}] Error queuing legacy tasks:`, error);
      }
    });

    // Return 202 Accepted immediately with correlation ID
    const responseTime = performance.now() - startTime;
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Response sent in ${responseTime}ms`);

    // Record webhook metrics for monitoring
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: true,
      payloadSize,
      interactionType,
    });

    return new Response(JSON.stringify({ correlationId }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId,
      },
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MTF Diamante Dispatcher] [${correlationId}] Critical error in webhook (${responseTime}ms):`, error);

    // Record webhook metrics for monitoring (error case)
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId: correlationId || 'error-fallback',
      success: false,
      error: errorMessage,
      payloadSize,
      interactionType,
    });

    // Always return 202 Accepted to prevent Dialogflow retries
    // Include correlation ID for error tracking
    return new Response(JSON.stringify({ 
      correlationId: correlationId || generateCorrelationId(),
      error: 'Internal processing error'
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId || 'error-fallback',
      },
    });
  }
}

/**
 * Queue high priority job for immediate user response
 */
async function queueHighPriorityJob(data: UnifiedWebhookPayload, correlationId: string): Promise<void> {
  logWithCorrelationId('info', 'Queuing high priority job for user response', correlationId, {
    interactionType: data.interactionType,
    intentName: data.intentName,
    buttonId: data.buttonId,
  });

  // Import the queue functions
  const { addRespostaRapidaJob, createIntentJob, createButtonJob } = await import('@/lib/queue/resposta-rapida.queue');

  try {
    if (data.interactionType === 'intent' && data.intentName) {
      // Create intent processing job
      const intentJob = createIntentJob({
        inboxId: data.inboxId,
        contactPhone: data.contactPhone,
        intentName: data.intentName,
        wamid: data.messageId,
        credentials: {
          token: data.credentials.whatsappApiKey,
          phoneNumberId: data.credentials.phoneNumberId,
          businessId: data.credentials.businessId,
        },
        correlationId,
        messageId: parseInt(data.messageId) || 0,
        accountId: 0, // TODO: Extract from payload when available
        accountName: 'webhook', // TODO: Extract from payload when available
        contactSource: data.contactSource,
      });

      await addRespostaRapidaJob(intentJob, { correlationId });
      
      logWithCorrelationId('info', 'Intent job queued successfully', correlationId, {
        intentName: data.intentName,
        inboxId: data.inboxId,
      });

    } else if (data.interactionType === 'button_reply' && data.buttonId) {
      // Create button processing job
      const buttonJob = createButtonJob({
        inboxId: data.inboxId,
        contactPhone: data.contactPhone,
        buttonId: data.buttonId,
        wamid: data.messageId,
        credentials: {
          token: data.credentials.whatsappApiKey,
          phoneNumberId: data.credentials.phoneNumberId,
          businessId: data.credentials.businessId,
        },
        correlationId,
        messageId: parseInt(data.messageId) || 0,
        accountId: 0, // TODO: Extract from payload when available
        accountName: 'webhook', // TODO: Extract from payload when available
        contactSource: data.contactSource,
      });

      await addRespostaRapidaJob(buttonJob, { correlationId });
      
      logWithCorrelationId('info', 'Button job queued successfully', correlationId, {
        buttonId: data.buttonId,
        inboxId: data.inboxId,
      });
    }

    // Also process using legacy system for backward compatibility
    if (data.interactionType === 'intent' && data.intentName) {
      await processIntentRequest(
        data.intentName,
        data.contactPhone,
        data.credentials.whatsappApiKey,
        data.inboxId,
        correlationId,
        data.originalPayload
      );
    } else if (data.interactionType === 'button_reply' && data.buttonId) {
      await processButtonClickRequest(
        data.buttonId,
        data.messageId,
        data.contactPhone,
        data.credentials.whatsappApiKey,
        correlationId,
        data.originalPayload,
        data.credentials.phoneNumberId
      );
    }
  } catch (error) {
    logWithCorrelationId('error', 'Failed to queue high priority job', correlationId, {
      error: error instanceof Error ? error.message : error,
      interactionType: data.interactionType,
    });
    throw error;
  }
}

/**
 * Queue low priority job for data persistence
 */
async function queueLowPriorityJob(data: UnifiedWebhookPayload, correlationId: string): Promise<void> {
  logWithCorrelationId('info', 'Queuing low priority job for data persistence', correlationId, {
    inboxId: data.inboxId,
    contactSource: data.contactSource,
  });

  // Import the queue functions
  const { addPersistenciaCredenciaisJob, createCredentialsUpdateJob } = await import('@/lib/queue/persistencia-credenciais.queue');

  try {
    // Create credentials and lead update job
    const persistenciaJob = createCredentialsUpdateJob({
      inboxId: data.inboxId,
      whatsappApiKey: data.credentials.whatsappApiKey,
      phoneNumberId: data.credentials.phoneNumberId,
      businessId: data.credentials.businessId,
      contactSource: data.contactSource,
      leadData: {
        messageId: parseInt(data.messageId) || 0,
        accountId: 0, // TODO: Extract from payload when available
        accountName: 'webhook', // TODO: Extract from payload when available
        contactPhone: data.contactPhone,
        wamid: data.messageId,
      },
      correlationId,
    });

    await addPersistenciaCredenciaisJob(persistenciaJob);
    
    logWithCorrelationId('info', 'Persistence job queued successfully', correlationId, {
      inboxId: data.inboxId,
      contactSource: data.contactSource,
    });
  } catch (error) {
    logWithCorrelationId('error', 'Failed to queue low priority job', correlationId, {
      error: error instanceof Error ? error.message : error,
      inboxId: data.inboxId,
    });
    throw error;
  }
}

/**
 * Convert unified data to legacy format for backward compatibility
 */
function convertToLegacyFormat(data: UnifiedWebhookPayload): ExtractedWebhookData {
  return {
    whatsappApiKey: data.credentials.whatsappApiKey,
    messageId: data.messageId,
    conversationId: data.conversationId,
    contactPhone: data.contactPhone,
    inboxId: data.inboxId,
    intentName: data.intentName || 'Unknown',
  };
}

/**
 * Queue legacy tasks for backward compatibility
 */
async function queueLegacyTasks(req: any, webhookData: ExtractedWebhookData, correlationId: string): Promise<void> {
  logWithCorrelationId('info', 'Queuing legacy tasks for backward compatibility', correlationId);

  try {
    // 1. Store message task
    if (validateWebhookData(webhookData)) {
      await addStoreMessageTask({
        payload: req,
        messageId: webhookData.messageId,
        conversationId: webhookData.conversationId,
        contactPhone: webhookData.contactPhone,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId,
      });
    }

    // 2. Update API key task
    if (hasValidApiKey(req) && webhookData.inboxId) {
      await addUpdateApiKeyTask({
        inboxId: webhookData.inboxId,
        whatsappApiKey: webhookData.whatsappApiKey,
        payload: req,
      });
    }

    // 3. Process intent task (legacy)
    await addProcessIntentTask({
      payload: req,
      intentName: webhookData.intentName,
      contactPhone: webhookData.contactPhone,
    });

    logWithCorrelationId('info', 'Legacy tasks queued successfully', correlationId);
  } catch (error) {
    logWithCorrelationId('error', 'Error queuing legacy tasks', correlationId, { error });
    // Don't throw - legacy task failures shouldn't block the new system
  }
}
