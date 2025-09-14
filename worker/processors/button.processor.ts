import { getPrismaInstance } from "../../lib/connections";
import { sanitizePhoneNumber, sanitizeApiKey } from "../../lib/webhook-utils";
import {
  WorkerResponse,
  WhatsAppCredentials,
  ButtonActionMapping,
} from "../types/types";
import { WhatsAppApiManager } from "../services/whatsapp.service";
import { METAPayloadBuilder } from "../../lib/socialwise-flow/meta-payload-builder";
import { IntentProcessor } from "./intent.processor";

const whatsappApiManager = new WhatsAppApiManager();

// ============================================================================
// BUTTON CLICK PROCESSING LOGIC (Subtask 3.2)
// ============================================================================

export class ButtonProcessor {
  /**
   * Process button click interaction with action mapping
   * Requirements: 4.3, 4.4, 5.1
   */
  async processButtonClick(
    buttonId: string,
    inboxId: string,
    credentials: WhatsAppCredentials,
    contactPhone: string,
    wamid: string,
    correlationId: string,
    intentName?: string
  ): Promise<WorkerResponse> {
    const startTime = Date.now();

    try {
      // Validar e re-sanitizar dados críticos no worker como medida de segurança
      const sanitizedData = {
        buttonId: String(buttonId)
          .trim()
          .replace(/[^a-zA-Z0-9_.-]/g, ""),
        inboxId: String(inboxId).trim(),
        contactPhone: sanitizePhoneNumber(contactPhone),
        wamid: String(wamid).trim(),
        correlationId: String(correlationId).trim(),
        credentials: {
          token: sanitizeApiKey(credentials.token),
          phoneNumberId: String(credentials.phoneNumberId).trim(),
          businessId: String(credentials.businessId).trim(),
        },
      };

      // Validar dados sanitizados
      if (
        !sanitizedData.buttonId ||
        !sanitizedData.contactPhone ||
        !sanitizedData.credentials.token
      ) {
        throw new Error("Dados críticos inválidos após sanitização no worker");
      }

      console.log(
        `[Button Processor] Processing button click: ${sanitizedData.buttonId}`,
        {
          correlationId: sanitizedData.correlationId,
          inboxId: sanitizedData.inboxId,
          contactPhone: `${sanitizedData.contactPhone.substring(0, 4)}****${sanitizedData.contactPhone.substring(sanitizedData.contactPhone.length - 4)}`,
          hasValidCredentials: !!sanitizedData.credentials.token,
        }
      );

      // 1. Query MapeamentoBotao for action mapping
      const actionMapping = await this.findActionByButtonId(buttonId, inboxId);

      if (!actionMapping) {
        console.log(
          `[Button Processor] No mapping found for button: ${buttonId}`,
          {
            correlationId,
            inboxId,
          }
        );

        // Fallback to emoji reaction if no specific mapping exists
        return await this.handleEmojiReactionFallback(
          buttonId,
          contactPhone,
          wamid,
          credentials,
          correlationId,
          startTime,
          sanitizedData.inboxId
        );
      }

      // 2. Execute reaction combo (emoji + texto) quando existir mapping com payload
      //    e em seguida qualquer ação extra mapeada (SEND_TEMPLATE etc.)
      let comboMessageId: string | undefined;
      try {
        const payload: any = actionMapping.actionPayload || {};
        const hasEmoji = typeof payload.emoji === 'string' && payload.emoji.trim() !== '';
        const hasText = typeof payload.textReaction === 'string' && payload.textReaction.trim() !== '';

        if (hasEmoji) {
          const builder = new METAPayloadBuilder();
          const reactionPayload = builder.buildReactionPayload(wamid, payload.emoji);
          comboMessageId = await whatsappApiManager.sendMessage(
            contactPhone,
            reactionPayload,
            credentials,
            'button-reaction-emoji',
            correlationId
          );
        }

        if (hasText) {
          const builder = new METAPayloadBuilder();
          const textPayload = await builder.buildTextReplyPayload(wamid, payload.textReaction);
          comboMessageId = await whatsappApiManager.sendMessage(
            contactPhone,
            textPayload,
            credentials,
            'button-reaction-text',
            correlationId
          );
        }
      } catch (comboError) {
        console.warn('[Button Processor] Reaction combo failed, continuing to mapped action if any', {
          correlationId,
          error: comboError instanceof Error ? comboError.message : comboError,
        });
      }

      // 3. Execute mapped action somente se houver dados mínimos para aquela ação
      let result: { messageId?: string } = {};
      const payload: any = actionMapping.actionPayload || {};
      let shouldExecute = false;
      switch (actionMapping.actionType) {
        case 'SEND_TEMPLATE':
          // Se não houver templateId/templateName no mapeamento do botão,
          // mas houver uma intentName, podemos delegar para IntentProcessor (quando mapeada)
          shouldExecute = Boolean(payload.templateId || payload.templateName);
          break;
        case 'START_FLOW':
          shouldExecute = Boolean(payload.flowId);
          break;
        case 'ADD_TAG':
          shouldExecute = Array.isArray(payload.tags) && payload.tags.length > 0;
          break;
        case 'ASSIGN_TO_AGENT':
          shouldExecute = true;
          break;
        default:
          shouldExecute = false;
      }

      if (shouldExecute) {
        result = await this.executeAction(
          actionMapping,
          contactPhone,
          wamid,
          credentials,
          correlationId,
          sanitizedData.inboxId
        );
      } else {
        console.log('[Button Processor] Skipping mapped action due to insufficient payload; delivered reactions only', {
          correlationId,
          actionType: actionMapping.actionType,
        });
      }

      // 4. Se existe uma intentName vinda do webhook e o sistema possui mapeamento dessa intent,
      //    dispare o envio do template pela IntentProcessor após reações (sem bloquear o fluxo de reações)
      if (intentName && intentName.trim()) {
        try {
          const intentProc = new IntentProcessor();
          const followup = await intentProc.processIntent(
            intentName,
            sanitizedData.inboxId,
            credentials,
            contactPhone,
            wamid,
            correlationId,
            undefined,
            { disableFallback: true }
          );
          if (!followup.success) {
            console.log('[Button Processor] Intent mapping not executed or failed (non-blocking).', {
              correlationId,
              intentName,
              error: followup.error,
            });
          }
        } catch (e) {
          console.log('[Button Processor] Intent mapping skipped or failed (non-blocking).', {
            correlationId,
            intentName,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const processingTime = Date.now() - startTime;

      console.log(
        `[Button Processor] Successfully processed button: ${buttonId}`,
        {
          correlationId,
          actionType: actionMapping.actionType,
          processingTime,
        }
      );

      return {
        success: true,
        messageId: result.messageId || comboMessageId,
        processingTime,
        correlationId,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(
        `[Button Processor] Failed to process button: ${buttonId}`,
        {
          correlationId,
          error: errorMessage,
          processingTime,
        }
      );

      return {
        success: false,
        error: errorMessage,
        processingTime,
        correlationId,
      };
    }
  }

  /**
   * Query MapeamentoBotao for action mapping
   * Requirement: 4.3
   */
  private async findActionByButtonId(
    buttonId: string,
    inboxId: string
  ): Promise<ButtonActionMapping | null> {
    try {
      // Find the mapping using the unified model
      const mapping = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: {
          buttonId,
          inbox: {
            inboxId: inboxId,
          },
        },
        include: {
          inbox: true,
        },
      });

      if (!mapping) {
        return null;
      }

      return {
        id: mapping.id,
        buttonId: mapping.buttonId,
        actionType: mapping.actionType as
          | "SEND_TEMPLATE"
          | "ADD_TAG"
          | "START_FLOW"
          | "ASSIGN_TO_AGENT",
        actionPayload: mapping.actionPayload,
      };
    } catch (error) {
      console.error("[Button Processor] Error finding action mapping:", error);
      throw error;
    }
  }

  /**
   * Execute action based on action type
   * Support for different action types (SEND_TEMPLATE, ADD_TAG, etc.)
   * Requirement: 4.4
   */
  private async executeAction(
    actionMapping: ButtonActionMapping,
    contactPhone: string,
    wamid: string,
    credentials: WhatsAppCredentials,
    correlationId: string,
    inboxId?: string
  ): Promise<{ messageId?: string }> {
    const { actionType, actionPayload } = actionMapping;

    console.log(`[Button Processor] Executing action: ${actionType}`, {
      correlationId,
      buttonId: actionMapping.buttonId,
      payload: actionPayload,
    });

    switch (actionType) {
      case "SEND_TEMPLATE":
        return await this.executeSendTemplateAction(
          actionPayload,
          contactPhone,
          credentials,
          correlationId,
          inboxId
        );

      case "ADD_TAG":
        return await this.executeAddTagAction(
          actionPayload,
          contactPhone,
          correlationId
        );

      case "START_FLOW":
        return await this.executeStartFlowAction(
          actionPayload,
          contactPhone,
          credentials,
          correlationId
        );

      case "ASSIGN_TO_AGENT":
        return await this.executeAssignToAgentAction(
          actionPayload,
          contactPhone,
          correlationId
        );

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  /**
   * Execute SEND_TEMPLATE action
   */
  private async executeSendTemplateAction(
    payload: any,
    contactPhone: string,
    credentials: WhatsAppCredentials,
    correlationId: string,
    inboxId?: string
  ): Promise<{ messageId?: string }> {
    try {
      const { templateId, templateName, parameters } = payload;

      let messageContent: any;

      if (templateId) {
        // Find template by ID and process it
        const template = await getPrismaInstance().template.findUnique({
          where: { id: templateId },
          include: {
            interactiveContent: {
              include: {
                header: true,
                body: true,
                footer: true,
                actionCtaUrl: true,
                actionReplyButton: true,
                actionList: true,
                actionFlow: true,
                actionLocationRequest: true,
              },
            },
            whatsappOfficialInfo: true,
          },
        });

        if (!template) {
          throw new Error(`Template not found: ${templateId}`);
        }

        messageContent = await this.processTemplateForAction(
          template,
          parameters,
          inboxId
        );
      } else if (templateName) {
        // Use WhatsApp official template by name
        messageContent = {
          type: "template",
          template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: parameters || [],
          },
        };
      } else {
        throw new Error("Either templateId or templateName must be provided");
      }

      const messageId = await whatsappApiManager.sendMessage(
        contactPhone,
        messageContent,
        credentials,
        "template-action",
        correlationId
      );

      console.log(`[Button Processor] Template sent successfully`, {
        correlationId,
        templateId,
        templateName,
        messageId,
      });

      return { messageId };
    } catch (error) {
      console.error(
        "[Button Processor] Error executing SEND_TEMPLATE action:",
        error
      );
      throw error;
    }
  }

  /**
   * Execute ADD_TAG action
   */
  private async executeAddTagAction(
    payload: any,
    contactPhone: string,
    correlationId: string
  ): Promise<{ messageId?: string }> {
    try {
      const { tags, leadSource } = payload;

      if (!Array.isArray(tags) || tags.length === 0) {
        throw new Error("Tags array is required for ADD_TAG action");
      }

      // Find lead by contact phone and source
      const lead = await getPrismaInstance().lead.findFirst({
        where: {
          phone: contactPhone,
          source: leadSource || "CHATWIT_OAB",
        },
      });

      if (lead) {
        // Add tags to existing lead
        const updatedTags = [...new Set([...lead.tags, ...tags])];

        await getPrismaInstance().lead.update({
          where: { id: lead.id },
          data: { tags: updatedTags },
        });

        console.log(`[Button Processor] Tags added to lead: ${lead.id}`, {
          correlationId,
          addedTags: tags,
          totalTags: updatedTags.length,
        });
      } else {
        console.log(`[Button Processor] Lead not found for tagging`, {
          correlationId,
          contactPhone,
          leadSource,
        });
      }

      return {};
    } catch (error) {
      console.error(
        "[Button Processor] Error executing ADD_TAG action:",
        error
      );
      throw error;
    }
  }

  /**
   * Execute START_FLOW action
   */
  private async executeStartFlowAction(
    payload: any,
    contactPhone: string,
    credentials: WhatsAppCredentials,
    correlationId: string
  ): Promise<{ messageId?: string }> {
    try {
      const { flowId, flowCta, flowMode, flowData } = payload;

      if (!flowId) {
        throw new Error("Flow ID is required for START_FLOW action");
      }

      const messageContent = {
        type: "interactive",
        interactive: {
          type: "flow",
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: correlationId,
              flow_id: flowId,
              flow_cta: flowCta || "Continuar",
              flow_action: "navigate",
              flow_action_payload: {
                screen: "WELCOME",
                data: flowData || {},
              },
              mode: flowMode || "published",
            },
          },
        },
      };

      const messageId = await whatsappApiManager.sendMessage(
        contactPhone,
        messageContent,
        credentials,
        "flow-action",
        correlationId
      );

      console.log(`[Button Processor] Flow started successfully`, {
        correlationId,
        flowId,
        messageId,
      });

      return { messageId };
    } catch (error) {
      console.error(
        "[Button Processor] Error executing START_FLOW action:",
        error
      );
      throw error;
    }
  }

  /**
   * Execute ASSIGN_TO_AGENT action
   */
  private async executeAssignToAgentAction(
    payload: any,
    contactPhone: string,
    correlationId: string
  ): Promise<{ messageId?: string }> {
    try {
      const { agentId, message } = payload;

      // This would typically integrate with your agent assignment system
      // For now, we'll just log the assignment
      console.log(`[Button Processor] Lead assigned to agent`, {
        correlationId,
        contactPhone,
        agentId,
        message,
      });

      // You could also send a notification message to the user
      // or update the lead status in the database

      return {};
    } catch (error) {
      console.error(
        "[Button Processor] Error executing ASSIGN_TO_AGENT action:",
        error
      );
      throw error;
    }
  }

  /**
   * Process template for action execution
   */
  private async processTemplateForAction(
    template: any,
    parameters: any,
    inboxId?: string
  ): Promise<any> {
    try {
      console.log(
        `[Button Processor] Processing template for action: ${template.type}`
      );

      // Create PayloadBuilder with variables resolver
      const payloadBuilder = new METAPayloadBuilder();
      if (inboxId) {
        await payloadBuilder.setVariablesFromInboxId(inboxId, {});
      }
      switch (template.type) {
        case "WHATSAPP_OFFICIAL":
          if (template.whatsappOfficialInfo) {
            // IMPORTANTE: enviar o NOME do template (template.name) e NÃO o ID/metaTemplateId
            return await payloadBuilder.buildTemplatePayload(
              template.name || "default",
              template.language || "pt_BR",
              parameters || template.whatsappOfficialInfo.components || [],
              template.whatsappOfficialInfo.metaTemplateId // apenas para resolver mídia
            );
          }
          break;

        case "INTERACTIVE_MESSAGE":
          if (template.interactiveContent) {
            return {
              type: "interactive",
              interactive: await payloadBuilder.buildInteractiveMessagePayload(
                template.interactiveContent
              ),
            };
          }
          break;

        case "AUTOMATION_REPLY":
          if (template.simpleReplyText) {
            return await payloadBuilder.buildSimpleTextPayload(
              template.simpleReplyText
            );
          }
          break;
      }

      throw new Error(`Unable to process template type: ${template.type}`);
    } catch (error) {
      console.error(
        "[Button Processor] Error processing template for action:",
        error
      );
      throw error;
    }
  }

  /**
   * Emoji reaction sending with message ID validation
   * Requirement: 5.1
   */
  private async handleEmojiReactionFallback(
    buttonId: string,
    contactPhone: string,
    wamid: string,
    credentials: WhatsAppCredentials,
    correlationId: string,
    startTime: number,
    inboxId?: string
  ): Promise<WorkerResponse> {
    try {
      console.log(
        `[Button Processor] Applying emoji reaction fallback for button: ${buttonId}`,
        {
          correlationId,
          wamid,
        }
      );

      // Try to get emoji mapping from config or database
      const emoji = await this.getEmojiForButton(buttonId);

      if (emoji) {
        // Send emoji reaction usando o Payload Builder
        const payloadBuilder = new METAPayloadBuilder();
        const messageContent = payloadBuilder.buildReactionPayload(
          wamid,
          emoji
        );

        const messageId = await whatsappApiManager.sendMessage(
          contactPhone,
          messageContent,
          credentials,
          "template-action",
          correlationId
        );

        const processingTime = Date.now() - startTime;

        console.log(`[Button Processor] Emoji reaction sent: ${emoji}`, {
          correlationId,
          buttonId,
          messageId,
        });

        return {
          success: true,
          messageId,
          processingTime,
          correlationId,
        };
      } else {
        // Send text reaction as fallback
        return await this.handleTextReactionFallback(
          buttonId,
          contactPhone,
          wamid,
          credentials,
          correlationId,
          startTime,
          inboxId
        );
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: `Emoji reaction fallback failed: ${errorMessage}`,
        processingTime,
        correlationId,
      };
    }
  }

  /**
   * Text reaction processing with reply-to functionality
   * Requirement: 5.1
   */
  private async handleTextReactionFallback(
    buttonId: string,
    contactPhone: string,
    wamid: string,
    credentials: WhatsAppCredentials,
    correlationId: string,
    startTime: number,
    inboxId?: string
  ): Promise<WorkerResponse> {
    try {
      console.log(
        `[Button Processor] Applying text reaction fallback for button: ${buttonId}`,
        {
          correlationId,
          wamid,
        }
      );

      // Generate a contextual text response
      const textResponse = this.generateTextResponseForButton(buttonId);

      // Create PayloadBuilder with variables resolver and build payload
      const payloadBuilder = new METAPayloadBuilder();
      if (inboxId) {
        await payloadBuilder.setVariablesFromInboxId(inboxId, {});
      }

      const messageContent = await payloadBuilder.buildTextReplyPayload(
        wamid,
        textResponse
      );

      const messageId = await whatsappApiManager.sendMessage(
        contactPhone,
        messageContent,
        credentials,
        "text-reaction",
        correlationId
      );

      const processingTime = Date.now() - startTime;

      console.log(`[Button Processor] Text reaction sent`, {
        correlationId,
        buttonId,
        messageId,
        textResponse,
      });

      return {
        success: true,
        messageId,
        processingTime,
        correlationId,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: `Text reaction fallback failed: ${errorMessage}`,
        processingTime,
        correlationId,
      };
    }
  }

  /**
   * Get emoji for button from config or database
   */
  private async getEmojiForButton(buttonId: string): Promise<string | null> {
    try {
      // Try database first
      const reaction = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: {
          buttonId,
          actionType: "SEND_TEMPLATE",
        },
      });

      if (
        reaction &&
        reaction.actionPayload &&
        typeof reaction.actionPayload === "object" &&
        "emoji" in reaction.actionPayload
      ) {
        return (reaction.actionPayload as any).emoji;
      }

      // Fallback to config-based mapping
      const emojiMap: Record<string, string> = {
        like: "👍",
        love: "❤️",
        laugh: "😂",
        wow: "😮",
        sad: "😢",
        angry: "😡",
        thanks: "🙏",
        ok: "👌",
        yes: "✅",
        no: "❌",
      };

      // Try to match button ID with emoji mapping
      const lowerButtonId = buttonId.toLowerCase();
      for (const [key, emoji] of Object.entries(emojiMap)) {
        if (lowerButtonId.includes(key)) {
          return emoji;
        }
      }

      return null;
    } catch (error) {
      console.error(
        "[Button Processor] Error getting emoji for button:",
        error
      );
      return null;
    }
  }

  /**
   * Generate contextual text response for button
   */
  private generateTextResponseForButton(buttonId: string): string {
    const responses: Record<string, string> = {
      like: "Obrigado pelo feedback positivo! 👍",
      love: "Ficamos felizes que tenha gostado! ❤️",
      help: "Como posso ajudá-lo?",
      info: "Aqui estão as informações solicitadas.",
      contact: "Nossa equipe entrará em contato em breve.",
      schedule: "Vamos agendar um horário para você.",
      default: "Recebemos sua resposta. Obrigado!",
    };

    const lowerButtonId = buttonId.toLowerCase();

    for (const [key, response] of Object.entries(responses)) {
      if (lowerButtonId.includes(key)) {
        return response;
      }
    }

    return responses.default;
  }
}
