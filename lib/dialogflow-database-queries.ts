/**
 * Database Query Functions for Dialogflow Async Response System
 * Provides helper functions to fetch all necessary data for self-contained tasks
 */

import { PrismaClient } from "@prisma/client";

import { getPrismaInstance } from './connections';
const prisma = getPrismaInstance();

// ============================================================================
// INTERFACES
// ============================================================================

export interface CompleteMessageMapping {
  id: string;
  intentName: string;
  caixaEntradaId: string;
  usuarioChatwitId: string;

  // Message type and data
  messageType:
    | "template"
    | "interactive"
    | "unified_template"
    | "enhanced_interactive";

  // Template data (if applicable)
  template?: {
    id: string;
    templateId: string;
    name: string;
    status: string;
    category: string;
    language: string;
    components: any;
    qualityScore?: string;
  };

  // Interactive message data (if applicable)
  interactiveMessage?: {
    id: string;
    nome?: string;
    tipo: string;
    texto: string;
    headerTipo?: string;
    headerConteudo?: string;
    rodape?: string;
    botoes: Array<{
      id: string;
      titulo: string;
      ordem: number;
    }>;
  };

  // Unified template data (if applicable)
  unifiedTemplate?: {
    id: string;
    name: string;
    type: string;
    scope: string;
    description?: string;
    language: string;
    simpleReplyText?: string;
    interactiveContent?: any;
    whatsappOfficialInfo?: any;
  };

  // Enhanced interactive message data (if applicable)
  enhancedInteractiveMessage?: {
    id: string;
    name: string;
    type: string;
    headerType?: string;
    headerContent?: string;
    bodyText: string;
    footerText?: string;
    actionData?: any;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    locationAddress?: string;
    reactionEmoji?: string;
    targetMessageId?: string;
    stickerMediaId?: string;
    stickerUrl?: string;
  };

  // WhatsApp configuration
  whatsappConfig: {
    phoneNumberId: string;
    whatsappToken: string;
    whatsappBusinessAccountId: string;
    fbGraphApiBase: string;
  };
}

export interface ButtonReactionMapping {
  id: string;
  buttonId: string;
  emoji?: string;
  textReaction?: string;
  description?: string;
  isActive: boolean;
}

export interface ButtonActionMapping {
  id: string;
  buttonId: string;
  actionType: string; // ActionType enum value
  actionPayload: any; // JSON payload with action-specific data
  description?: string;
  inboxId: string;
  whatsappConfig: CompleteMessageMapping["whatsappConfig"];
}

// ============================================================================
// INTENT MAPPING QUERIES
// ============================================================================

/**
 * Find complete message mapping by intent name and inbox ID
 * Uses the new unified MapeamentoIntencao and Template models
 * Returns all data needed for the worker to send messages without additional DB queries
 */
export async function findCompleteMessageMappingByIntent(
  intentName: string,
  inboxId: string
): Promise<CompleteMessageMapping | null> {
  try {
    console.log(
      `[DB Query] Finding unified mapping for intent: ${intentName}, inboxId: ${inboxId}`
    );
    
    // Convert inboxId to string for consistency
    const inboxIdString = String(inboxId);
    
    // STEP 1: Find ChatwitInbox by inboxId
    console.log(`[DB Query] Step 1: Finding ChatwitInbox by inboxId: ${inboxIdString}`);
    const chatwitInbox = await prisma.chatwitInbox.findFirst({
      where: {
        inboxId: inboxIdString,
      },
      include: {
        usuarioChatwit: {
          include: {
            configuracaoGlobalWhatsApp: true,
          },
        },
      },
    });

    if (!chatwitInbox) {
      console.log(`[DB Query] No ChatwitInbox found for inboxId: ${inboxIdString}`);
      return null;
    }

    console.log(`[DB Query] Found ChatwitInbox: ${chatwitInbox.id} (nome: ${chatwitInbox.nome})`);
    
    // STEP 2: Find MapeamentoIntencao using the unified model
    console.log(`[DB Query] Step 2: Finding MapeamentoIntencao for intent: ${intentName}`);
    const mapping = await prisma.mapeamentoIntencao.findUnique({
      where: {
        intentName_inboxId: {
          intentName,
          inboxId: chatwitInbox.id,
        },
      },
      include: {
        inbox: {
          include: {
            usuarioChatwit: {
              include: {
                configuracaoGlobalWhatsApp: true,
              },
            },
          },
        },
        template: {
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
        },
      },
    });

    if (!mapping) {
      console.log(
        `[DB Query] No MapeamentoIntencao found for intent: ${intentName}, inboxId: ${inboxIdString}`
      );
      return null;
    }

    // Se não há template associado (pode ser um flow), retornar null
    if (!mapping.template) {
      console.log(
        `[DB Query] MapeamentoIntencao found but no template associated (may have flowId): ${mapping.id}`
      );
      return null;
    }

    // STEP 3: Get WhatsApp configuration with fallback logic
    const whatsappConfig = await getWhatsAppConfigWithFallback(chatwitInbox);

    // STEP 4: Build response based on unified Template model
    const result: CompleteMessageMapping = {
      id: mapping.id,
      intentName: mapping.intentName,
      caixaEntradaId: mapping.inboxId,
      usuarioChatwitId: chatwitInbox.usuarioChatwitId,
      messageType: getTemplateMessageType(mapping.template),
      whatsappConfig,
    };

    // Add template data based on type with priority resolution
    if (mapping.template.type === 'WHATSAPP_OFFICIAL' && mapping.template.whatsappOfficialInfo) {
      result.messageType = "unified_template";
      result.unifiedTemplate = {
        id: mapping.template.id,
        name: mapping.template.name,
        type: mapping.template.type,
        scope: mapping.template.scope,
        description: mapping.template.description || undefined,
        language: mapping.template.language,
        interactiveContent: mapping.template.interactiveContent,
        whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
      };
    } else if (mapping.template.type === 'INTERACTIVE_MESSAGE' && mapping.template.interactiveContent) {
      result.messageType = "unified_template";
      result.unifiedTemplate = {
        id: mapping.template.id,
        name: mapping.template.name,
        type: mapping.template.type,
        scope: mapping.template.scope,
        description: mapping.template.description || undefined,
        language: mapping.template.language,
        interactiveContent: mapping.template.interactiveContent,
        whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
      };
    } else if (mapping.template.type === 'AUTOMATION_REPLY' && mapping.template.simpleReplyText) {
      result.messageType = "unified_template";
      result.unifiedTemplate = {
        id: mapping.template.id,
        name: mapping.template.name,
        type: mapping.template.type,
        scope: mapping.template.scope,
        description: mapping.template.description || undefined,
        language: mapping.template.language,
        interactiveContent: null,
        whatsappOfficialInfo: null,
      };
    } else {
      console.log(
        `[DB Query] Template found but no valid content for mapping: ${mapping.id}`
      );
      return null;
    }

    console.log(
      `[DB Query] Found unified template mapping: ${result.messageType} for intent: ${intentName}`
    );
    return result;
  } catch (error) {
    console.error("[DB Query] Error finding complete message mapping:", error);
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================================================
// CREDENTIAL RESOLUTION QUERIES
// ============================================================================

/**
 * Get WhatsApp credentials with comprehensive fallback resolution
 * This is the main entry point for credential resolution in the system
 */
export async function getCredentialsWithFallback(
  externalInboxId: string
): Promise<CompleteMessageMapping["whatsappConfig"] | null> {
  try {
    const { CredentialsFallbackResolver } = await import('./credentials-fallback-resolver');
    
    const result = await CredentialsFallbackResolver.resolveCredentialsByExternalInboxId(externalInboxId);
    
    if (result.credentials) {
      console.log(`[DB Query] Resolved credentials for external inboxId: ${externalInboxId}`);
      console.log(`[DB Query] Source: ${result.credentials.source}, Chain: ${result.fallbackChain.join(' -> ')}`);
      console.log(`[DB Query] Resolution time: ${result.resolutionTimeMs}ms, Cache hit: ${result.cacheHit}`);
      
      if (result.loopDetected) {
        console.warn(`[DB Query] Loop detected in fallback chain for inboxId: ${externalInboxId}`);
      }
      
      return {
        phoneNumberId: result.credentials.phoneNumberId,
        whatsappToken: result.credentials.whatsappApiKey,
        whatsappBusinessAccountId: result.credentials.whatsappBusinessAccountId,
        fbGraphApiBase: result.credentials.graphApiBaseUrl,
      };
    }

    console.log(`[DB Query] No credentials found for external inboxId: ${externalInboxId}`);
    return null;
  } catch (error) {
    console.error(`[DB Query] Error resolving credentials for external inboxId: ${externalInboxId}`, error);
    return null;
  }
}

/**
 * Validate fallback chain configuration for an inbox
 * Useful for admin interfaces and debugging
 */
export async function validateInboxFallbackChain(
  externalInboxId: string
): Promise<{
  isValid: boolean;
  issues: string[];
  chain: string[];
  credentials: CompleteMessageMapping["whatsappConfig"] | null;
}> {
  try {
    const { CredentialsFallbackResolver } = await import('./credentials-fallback-resolver');
    
    // Find the internal inbox ID
    const chatwitInbox = await prisma.chatwitInbox.findFirst({
      where: { inboxId: externalInboxId },
    });

    if (!chatwitInbox) {
      return {
        isValid: false,
        issues: [`No ChatwitInbox found for external inboxId: ${externalInboxId}`],
        chain: [],
        credentials: null,
      };
    }

    // Validate the fallback chain
    const validation = await CredentialsFallbackResolver.validateFallbackChain(chatwitInbox.id);
    
    // Also test credential resolution
    const resolution = await CredentialsFallbackResolver.resolveCredentials(chatwitInbox.id);
    
    const credentials = resolution.credentials ? {
      phoneNumberId: resolution.credentials.phoneNumberId,
      whatsappToken: resolution.credentials.whatsappApiKey,
      whatsappBusinessAccountId: resolution.credentials.whatsappBusinessAccountId,
      fbGraphApiBase: resolution.credentials.graphApiBaseUrl,
    } : null;

    return {
      isValid: validation.isValid && !!credentials,
      issues: validation.issues,
      chain: validation.chain,
      credentials,
    };
  } catch (error) {
    return {
      isValid: false,
      issues: [`Error validating fallback chain: ${error instanceof Error ? error.message : 'Unknown error'}`],
      chain: [],
      credentials: null,
    };
  }
}

// ============================================================================
// BUTTON REACTION QUERIES
// ============================================================================

/**
 * Find button action mapping by button ID using the unified MapeamentoBotao model
 * Returns the action type and payload for button interactions
 * Includes caching for frequently accessed button mappings
 */
export async function findActionByButtonId(
  buttonId: string
): Promise<ButtonActionMapping | null> {
  try {
    console.log(`[DB Query] Finding action mapping for button: ${buttonId}`);

    // Query the unified MapeamentoBotao model
    const buttonMapping = await prisma.mapeamentoBotao.findUnique({
      where: {
        buttonId: buttonId,
      },
      include: {
        inbox: {
          include: {
            usuarioChatwit: {
              include: {
                configuracaoGlobalWhatsApp: true,
              },
            },
          },
        },
      },
    });

    if (!buttonMapping) {
      console.log(`[DB Query] No MapeamentoBotao found for button: ${buttonId}`);
      return null;
    }

    // Validate and sanitize action payload
    const sanitizedPayload = validateAndSanitizeActionPayload(
      buttonMapping.actionType,
      buttonMapping.actionPayload
    );

    if (!sanitizedPayload) {
      console.log(`[DB Query] Invalid action payload for button: ${buttonId}`);
      return null;
    }

    console.log(
      `[DB Query] Found button action mapping: ${buttonId} -> ${buttonMapping.actionType}`
    );

    return {
      id: buttonMapping.id,
      buttonId: buttonMapping.buttonId,
      actionType: buttonMapping.actionType,
      actionPayload: sanitizedPayload,
      description: buttonMapping.description || undefined,
      inboxId: buttonMapping.inboxId,
      whatsappConfig: await getWhatsAppConfigWithFallback(buttonMapping.inbox),
    };
  } catch (error) {
    console.error("[DB Query] Error finding button action mapping:", error);
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Legacy function for backward compatibility - finds button reaction mapping
 * This maintains compatibility with existing reaction-based button handling
 */
export async function findReactionByButtonId(
  buttonId: string
): Promise<ButtonReactionMapping | null> {
  try {
    console.log(`[DB Query] Finding reaction mapping for button: ${buttonId} (legacy)`);

    // First try to find a MapeamentoBotao with SEND_TEMPLATE action that includes emoji
    const buttonMapping = await prisma.mapeamentoBotao.findUnique({
      where: {
        buttonId: buttonId,
      },
    });

    if (buttonMapping && buttonMapping.actionType === 'SEND_TEMPLATE') {
      const payload = buttonMapping.actionPayload as any;
      if (payload?.emoji || payload?.textReaction) {
        console.log(
          `[DB Query] Found unified button mapping with reaction: ${buttonId} -> emoji: ${payload.emoji}`
        );
        return {
          id: buttonMapping.id,
          buttonId: buttonMapping.buttonId,
          emoji: payload.emoji || undefined,
          textReaction: payload.textReaction || undefined,
          description: buttonMapping.description || undefined,
          isActive: true,
        };
      }
    }

    // Fallback to config-based mappings for legacy support
    try {
      const { getEmojiForButton } = await import('@/app/config/button-reaction-mapping');
      const emoji = getEmojiForButton(buttonId);
      
      if (emoji) {
        console.log(
          `[DB Query] Found config reaction mapping: ${buttonId} -> ${emoji}`
        );
        return {
          id: `config-${buttonId}`,
          buttonId,
          emoji,
          description: `Config-based reaction for ${buttonId}`,
          isActive: true,
        };
      }
    } catch (importError) {
      console.log(`[DB Query] Config-based mapping not available:`, importError);
    }

    console.log(
      `[DB Query] No reaction mapping found for button: ${buttonId}`
    );
    return null;
  } catch (error) {
    console.error("[DB Query] Error finding button reaction mapping:", error);
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get all active button action mappings using the unified MapeamentoBotao model
 * Useful for caching or validation purposes
 */
export async function getAllActiveButtonActions(): Promise<ButtonActionMapping[]> {
  try {
    console.log("[DB Query] Fetching all active button action mappings");

    const buttonMappings = await prisma.mapeamentoBotao.findMany({
      include: {
        inbox: {
          include: {
            usuarioChatwit: {
              include: {
                configuracaoGlobalWhatsApp: true,
              },
            },
          },
        },
      },
      orderBy: {
        buttonId: "asc",
      },
    });

    console.log(`[DB Query] Found ${buttonMappings.length} button action mappings`);

    const results: ButtonActionMapping[] = [];
    
    for (const mapping of buttonMappings) {
      const sanitizedPayload = validateAndSanitizeActionPayload(
        mapping.actionType,
        mapping.actionPayload
      );

      if (sanitizedPayload) {
        results.push({
          id: mapping.id,
          buttonId: mapping.buttonId,
          actionType: mapping.actionType,
          actionPayload: sanitizedPayload,
          description: mapping.description || undefined,
          inboxId: mapping.inboxId,
          whatsappConfig: await getWhatsAppConfigWithFallback(mapping.inbox),
        });
      }
    }

    return results;
  } catch (error) {
    console.error("[DB Query] Error fetching all button action mappings:", error);
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get all active button reaction mappings (legacy compatibility)
 * Falls back to config-based mappings and unified model
 */
export async function getAllActiveButtonReactions(): Promise<ButtonReactionMapping[]> {
  try {
    console.log("[DB Query] Fetching all active button reaction mappings (legacy)");

    const results: ButtonReactionMapping[] = [];

    // Get reactions from unified MapeamentoBotao model
    const buttonMappings = await prisma.mapeamentoBotao.findMany({
      where: {
        actionType: 'SEND_TEMPLATE',
      },
      orderBy: {
        buttonId: "asc",
      },
    });

    for (const mapping of buttonMappings) {
      const payload = mapping.actionPayload as any;
      if (payload?.emoji || payload?.textReaction) {
        results.push({
          id: mapping.id,
          buttonId: mapping.buttonId,
          emoji: payload.emoji || undefined,
          textReaction: payload.textReaction || undefined,
          description: mapping.description || undefined,
          isActive: true,
        });
      }
    }

    // Fallback to config-based mappings
    try {
      const { getAllButtonReactions } = await import('@/app/config/button-reaction-mapping');
      const configReactions = getAllButtonReactions();
      
      for (const reaction of configReactions) {
        // Only add if not already present from database
        if (!results.find(r => r.buttonId === reaction.buttonId)) {
          results.push({
            id: `config-${reaction.buttonId}`,
            buttonId: reaction.buttonId,
            emoji: reaction.emoji,
            description: reaction.description,
            isActive: true,
          });
        }
      }
    } catch (importError) {
      console.log(`[DB Query] Config-based mappings not available:`, importError);
    }

    console.log(`[DB Query] Found ${results.length} total button reaction mappings`);
    return results;
  } catch (error) {
    console.error("[DB Query] Error fetching all button reaction mappings:", error);
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR UNIFIED MODEL
// ============================================================================

/**
 * Get WhatsApp configuration with intelligent fallback logic using CredentialsFallbackResolver
 * This provides comprehensive fallback chain resolution with loop detection and caching
 */
async function getWhatsAppConfigWithFallback(chatwitInbox: any): Promise<CompleteMessageMapping["whatsappConfig"]> {
  try {
    const { CredentialsFallbackResolver } = await import('./credentials-fallback-resolver');
    
    const result = await CredentialsFallbackResolver.resolveCredentials(chatwitInbox.id);
    
    if (result.credentials) {
      console.log(`[DB Query] Resolved credentials via ${result.credentials.source} for inbox: ${chatwitInbox.id}`);
      if (result.fallbackChain.length > 1) {
        console.log(`[DB Query] Fallback chain: ${result.fallbackChain.join(' -> ')}`);
      }
      
      return {
        phoneNumberId: result.credentials.phoneNumberId,
        whatsappToken: result.credentials.whatsappApiKey,
        whatsappBusinessAccountId: result.credentials.whatsappBusinessAccountId,
        fbGraphApiBase: result.credentials.graphApiBaseUrl,
      };
    }

    // If resolver fails, fall back to legacy logic
    console.log(`[DB Query] CredentialsFallbackResolver failed, using legacy fallback for inbox: ${chatwitInbox.id}`);
    return getLegacyWhatsAppConfig(chatwitInbox);
  } catch (error) {
    console.error(`[DB Query] Error using CredentialsFallbackResolver:`, error);
    return getLegacyWhatsAppConfig(chatwitInbox);
  }
}

/**
 * Legacy WhatsApp configuration fallback (backup method)
 */
function getLegacyWhatsAppConfig(chatwitInbox: any): CompleteMessageMapping["whatsappConfig"] {
  // Priority 1: ChatwitInbox specific credentials
  if (chatwitInbox.whatsappApiKey && chatwitInbox.phoneNumberId && chatwitInbox.whatsappBusinessAccountId) {
    return {
      phoneNumberId: chatwitInbox.phoneNumberId,
      whatsappToken: chatwitInbox.whatsappApiKey,
      whatsappBusinessAccountId: chatwitInbox.whatsappBusinessAccountId,
      fbGraphApiBase: "https://graph.facebook.com/v22.0",
    };
  }

  // Priority 2: WhatsAppGlobalConfig fallback
  if (chatwitInbox.usuarioChatwit?.configuracaoGlobalWhatsApp) {
    const globalConfig = chatwitInbox.usuarioChatwit.configuracaoGlobalWhatsApp;
    return {
      phoneNumberId: globalConfig.phoneNumberId,
      whatsappToken: globalConfig.whatsappApiKey,
      whatsappBusinessAccountId: globalConfig.whatsappBusinessAccountId,
      fbGraphApiBase: globalConfig.graphApiBaseUrl,
    };
  }

  // Priority 3: Environment variables (last resort)
  return {
    phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || "",
    whatsappToken: process.env.WHATSAPP_TOKEN || "",
    whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "",
    fbGraphApiBase: "https://graph.facebook.com/v22.0",
  };
}

/**
 * Determine message type based on unified Template model
 * Implements template priority resolution (unified > enhanced > legacy)
 */
function getTemplateMessageType(template: any): CompleteMessageMapping["messageType"] {
  if (!template) return "template";
  
  // Unified template types have highest priority
  switch (template.type) {
    case 'WHATSAPP_OFFICIAL':
      return "unified_template";
    case 'INTERACTIVE_MESSAGE':
      return "unified_template";
    case 'AUTOMATION_REPLY':
      return "unified_template";
    default:
      return "template";
  }
}

/**
 * Validate and sanitize action payload based on action type
 * Ensures payload structure matches expected format for each action type
 */
function validateAndSanitizeActionPayload(actionType: string, payload: any): any | null {
  try {
    if (!payload || typeof payload !== 'object') {
      console.log(`[DB Query] Invalid payload structure for action type: ${actionType}`);
      return null;
    }

    switch (actionType) {
      case 'SEND_TEMPLATE':
        // Validate SEND_TEMPLATE payload
        if (payload.templateId || payload.emoji || payload.textReaction || payload.simpleText) {
          return {
            templateId: payload.templateId || null,
            emoji: payload.emoji || null,
            textReaction: payload.textReaction || null,
            simpleText: payload.simpleText || null,
            parameters: payload.parameters || {},
          };
        }
        break;

      case 'ADD_TAG':
        // Validate ADD_TAG payload
        if (payload.tags && Array.isArray(payload.tags)) {
          return {
            tags: payload.tags.filter((tag: any) => typeof tag === 'string'),
            removeExisting: Boolean(payload.removeExisting),
          };
        }
        break;

      case 'START_FLOW':
        // Validate START_FLOW payload
        if (payload.flowId) {
          return {
            flowId: payload.flowId,
            flowData: payload.flowData || {},
            flowMode: payload.flowMode || 'published',
          };
        }
        break;

      case 'ASSIGN_TO_AGENT':
        // Validate ASSIGN_TO_AGENT payload
        return {
          agentId: payload.agentId || null,
          department: payload.department || null,
          priority: payload.priority || 'normal',
          message: payload.message || null,
        };

      default:
        console.log(`[DB Query] Unknown action type: ${actionType}`);
        return payload; // Return as-is for unknown types
    }

    console.log(`[DB Query] Payload validation failed for action type: ${actionType}`);
    return null;
  } catch (error) {
    console.error(`[DB Query] Error validating action payload:`, error);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("[DB Query] Database connection test failed:", error);
    return false;
  }
}

/**
 * Close database connection
 */
export async function closeDatabaseConnection(): Promise<void> {
  await prisma.$disconnect();
}


