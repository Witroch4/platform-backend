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
} from "@/lib/queue/mtf-diamante-webhook.queue";
import {
  extractWebhookData,
  validateWebhookData,
  hasValidApiKey,
  logWebhookData,
} from "@/lib/webhook-utils";
import {
  findCompleteMessageMappingByIntent,
  findReactionByButtonId,
} from "@/lib/dialogflow-database-queries";

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
  caixaId?: string;
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
      caixaId: webhookData.inboxId,
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
      caixaId: webhookData.inboxId,
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
        caixaId: webhookData.inboxId,
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
        caixaId: webhookData.inboxId,
      };
    }
  }

  // Otherwise it's an intent
  return {
    type: "intent",
    intentName: webhookData.intentName,
    recipientPhone: webhookData.contactPhone,
    whatsappApiKey: webhookData.whatsappApiKey,
    caixaId: String(webhookData.inboxId), // Garantir que seja string
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
  caixaId: string,
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

    // O caixaId aqui é o inbox_id do Chatwit (4), mas precisamos do ID interno da CaixaEntrada
    // Vamos buscar primeiro a CaixaEntrada pelo inboxId para obter o ID interno
    console.log(
      `[MTF Diamante Dispatcher] Received caixaId (inbox_id): ${caixaId} (${typeof caixaId})`
    );

    // Query database for complete message mapping
    const messageMapping = await findCompleteMessageMappingByIntent(
      intentName,
      String(caixaId || "")
    );

    if (!messageMapping) {
      console.log(
        `[MTF Diamante Dispatcher] No mapping found for intent: ${intentName}, caixa: ${caixaId}`
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
              caixaId,
              originalPayload,
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
              caixaId,
              originalPayload,
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
              caixaId,
              originalPayload,
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
  originalPayload: any
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
 * Main webhook handler - Pure Dispatcher
 * Only parses requests, queues tasks, and responds immediately to Dialogflow
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const req = await request.json();
    console.log("[MTF Diamante Dispatcher] Received Dialogflow request");

    // LOG COMPLETO DO PAYLOAD DO DIALOGFLOW
    console.log("[MTF Diamante Dispatcher] PAYLOAD COMPLETO DO DIALOGFLOW:");
    console.log(JSON.stringify(req, null, 2));

    // Generate correlation ID for request tracing
    const correlationId = generateCorrelationId();
    console.log(`[MTF Diamante Dispatcher] Correlation ID: ${correlationId}`);

    // Extract and validate webhook data
    const webhookData = extractWebhookData(req);
    logWebhookData(webhookData, req);

    // Parse request to determine type and extract relevant data
    const parsedRequest = parseDialogflowRequest(req);
    console.log(
      `[MTF Diamante Dispatcher] Request type: ${parsedRequest.type}`
    );

    // Queue legacy tasks for backward compatibility (non-blocking)
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

      // 4. Process button click task (new)
      if (parsedRequest.type === "button_click") {
        await addProcessButtonClickTask({
          payload: req,
          contactPhone: parsedRequest.recipientPhone,
          whatsappApiKey: parsedRequest.whatsappApiKey,
          inboxId: parsedRequest.caixaId || "",
        });
        console.log(`[MTF Diamante Dispatcher] Button click task queued for button: ${parsedRequest.buttonId}`);
      }

      console.log(`[MTF Diamante Dispatcher] Legacy tasks queued successfully`);
    } catch (legacyQueueError) {
      console.error(
        "[MTF Diamante Dispatcher] Error queuing legacy tasks:",
        legacyQueueError
      );
      // Continue processing - don't let legacy task failures block the new system
    }

    // Calculate response time for legacy tasks only
    const legacyResponseTime = Date.now() - startTime;
    console.log(
      `[MTF Diamante Dispatcher] Legacy tasks processed in ${legacyResponseTime}ms`
    );

    // ✅ RESPOSTA IMEDIATA E SILENCIOSA AO DIALOGFLOW
    // Usando o objeto JSON vazio, que é mais limpo.
    const immediateResponse = NextResponse.json({});

    // Process request based on type (new async system) - NÃO BLOQUEAR A RESPOSTA
    setImmediate(async () => {
      try {
        if (parsedRequest.type === "intent" && parsedRequest.intentName) {
          // Process intent even if caixaId is missing - use empty string as fallback
          await processIntentRequest(
            parsedRequest.intentName,
            parsedRequest.recipientPhone,
            parsedRequest.whatsappApiKey,
            parsedRequest.caixaId || "",
            correlationId,
            req
          );
        } else if (
          parsedRequest.type === "button_click" &&
          parsedRequest.buttonId &&
          parsedRequest.messageId
        ) {
          await processButtonClickRequest(
            parsedRequest.buttonId,
            parsedRequest.messageId,
            parsedRequest.recipientPhone,
            parsedRequest.whatsappApiKey,
            correlationId,
            req
          );
        } else {
          console.log(
            `[MTF Diamante Dispatcher] Unhandled request type or missing data:`,
            {
              type: parsedRequest.type,
              intentName: parsedRequest.intentName,
              buttonId: parsedRequest.buttonId,
              messageId: parsedRequest.messageId,
              hasRecipientPhone: !!parsedRequest.recipientPhone,
              hasWhatsappApiKey: !!parsedRequest.whatsappApiKey,
              caixaId: parsedRequest.caixaId,
            }
          );
        }

        // Calculate total processing time
        const totalResponseTime = Date.now() - startTime;
        console.log(
          `[MTF Diamante Dispatcher] Total async processing completed in ${totalResponseTime}ms`
        );
      } catch (asyncQueueError) {
        console.error(
          "[MTF Diamante Dispatcher] Error in async processing:",
          asyncQueueError
        );
        // Error in async processing doesn't affect the response to Dialogflow
      }
    });

    // Return immediate response to Dialogflow (prevent timeout)
    return immediateResponse;
  } catch (error) {
    console.error(
      "[MTF Diamante Dispatcher] Critical error in webhook:",
      error
    );

    // Even on critical errors, return 200 OK to prevent Dialogflow retries
    // Log the error for monitoring but don't expose internal details
    return NextResponse.json({
      fulfillmentMessages: [
        {
          text: {
            text: [
              "Desculpe, ocorreu um erro temporário. Tente novamente em alguns instantes.",
            ],
          },
        },
      ],
    });
  }
}
