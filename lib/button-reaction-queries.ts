import { getPrismaInstance } from '@/lib/connections'

function slugifyIntentValue(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

// Normalizes button identifiers into multiple variants so we can locate
// intent mappings regardless of hyphen/underscore differences or casing.
function buildIntentSearchInfo(raw: string): {
  original: string
  plain: string
  slug: string
  candidates: string[]
} {
  const original = String(raw || '').trim()
  let withoutCommand = original
  if (withoutCommand.toLowerCase().startsWith('intent:')) {
    withoutCommand = withoutCommand.slice('intent:'.length).trim()
  }

  let plain = withoutCommand
  if (plain.startsWith('@')) {
    plain = plain.slice(1).trim()
  }

  plain = plain.replace(/\s+/g, ' ')

  const slug = slugifyIntentValue(plain)
  const hyphenated = plain.replace(/[\s_]+/g, '-').replace(/-+/g, '-').trim()
  const underscored = plain.replace(/[\s-]+/g, '_').replace(/_+/g, '_').trim()
  const condensed = plain.replace(/[\s_-]+/g, '').trim()

  const candidates = new Set<string>([
    original,
    withoutCommand,
    plain,
    plain.toLowerCase(),
    `@${plain}`,
    slug,
    slug.replace(/-/g, '_'),
    hyphenated,
    hyphenated.toLowerCase(),
    underscored,
    underscored.toLowerCase(),
    condensed,
  ])

  if (slug) {
    candidates.add(slug.replace(/-/g, ''))
    candidates.add(`@${slug}`)
    candidates.add(`@${slug.replace(/-/g, '_')}`)
  }

  return {
    original,
    plain,
    slug,
    candidates: Array.from(candidates)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  }
}

export interface ButtonReactionData {
  id: string
  buttonId: string
  actionType: string
  actionPayload: {
    emoji?: string
    textReaction?: string
    action?: string // "handoff", "end_conversation", etc.
    [key: string]: any
  }
  description: string | null
  inboxId: string
  createdAt: Date
  updatedAt: Date
  inbox?: {
    id: string
    nome: string
    inboxId: string
  }
}

export interface ReactionQueryOptions {
  includeInbox?: boolean
  userId?: string
  page?: number
  limit?: number
}

/**
 * Get button reaction by buttonId
 */
export async function getReactionByButtonId(
  buttonId: string,
  userId: string
): Promise<ButtonReactionData | null> {
  const prisma = getPrismaInstance()

  const reaction = await prisma.mapeamentoBotao.findFirst({
    where: {
      buttonId: buttonId,
      actionType: 'BUTTON_REACTION' as any,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: {
        select: {
          id: true,
          nome: true,
          inboxId: true,
        },
      },
    },
  })

  if (!reaction) {
    return null
  }

  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    actionType: reaction.actionType,
    actionPayload: reaction.actionPayload as any,
    description: reaction.description,
    inboxId: reaction.inboxId,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    inbox: reaction.inbox,
  }
}

/**
 * Get all button reactions for a user
 */
export async function getUserReactions(
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<ButtonReactionData[]> {
  const { includeInbox = false, page = 1, limit = 50 } = options
  const prisma = getPrismaInstance()

  const reactions = await prisma.mapeamentoBotao.findMany({
    where: {
      actionType: 'BUTTON_REACTION' as any,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: includeInbox
        ? {
          select: {
            id: true,
            nome: true,
            inboxId: true,
          },
        }
        : false,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    skip: (page - 1) * limit,
    take: limit,
  })

  return reactions.map((reaction: any) => ({
    id: reaction.id,
    buttonId: reaction.buttonId,
    actionType: reaction.actionType,
    actionPayload: reaction.actionPayload as any,
    description: reaction.description,
    inboxId: reaction.inboxId,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    inbox: reaction.inbox || undefined,
  }))
}

/**
 * Create or update button reaction
 */
export async function upsertButtonReaction(
  data: {
    buttonId: string
    emoji?: string
    textReaction?: string
    action?: string
    description?: string
    inboxId: string
  }
): Promise<ButtonReactionData> {
  const prisma = getPrismaInstance()

  const actionPayload = {
    ...(data.emoji && { emoji: data.emoji }),
    ...(data.textReaction && { textReaction: data.textReaction }),
    ...(data.action && { action: data.action }),
  }

  const reaction = await prisma.mapeamentoBotao.upsert({
    where: {
      buttonId: data.buttonId,
    },
    create: {
      buttonId: data.buttonId,
      actionType: 'BUTTON_REACTION' as any,
      actionPayload: actionPayload,
      description: data.description,
      inboxId: data.inboxId,
    },
    update: {
      actionPayload: actionPayload,
      description: data.description,
      updatedAt: new Date(),
    },
    include: {
      inbox: {
        select: {
          id: true,
          nome: true,
          inboxId: true,
        },
      },
    },
  })

  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    actionType: reaction.actionType,
    actionPayload: reaction.actionPayload as any,
    description: reaction.description,
    inboxId: reaction.inboxId,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    inbox: reaction.inbox,
  }
}

/**
 * Delete button reaction
 */
export async function deleteButtonReaction(
  buttonId: string,
  userId: string
): Promise<boolean> {
  const prisma = getPrismaInstance()

  try {
    await prisma.mapeamentoBotao.delete({
      where: {
        buttonId: buttonId,
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
    })
    return true
  } catch (error) {
    return false
  }
}

/**
 * Format reaction data for webhook response
 */
export function formatReactionData(
  reaction: ButtonReactionData,
  channelType: string,
  wamid: string
): any {
  const actionPayload = reaction.actionPayload

  const response: any = {
    action_type: 'button_reaction',
    buttonId: reaction.buttonId,
    processed: true,
    mappingFound: true,
  }

  // Adicionar emoji se disponível
  if (actionPayload.emoji) {
    response.emoji = actionPayload.emoji
  }

  // Adicionar texto de reação se disponível
  if (actionPayload.textReaction) {
    response.text = actionPayload.textReaction
  }

  // 🔧 CRÍTICO: Adicionar ação se disponível (handoff, etc.)
  if (actionPayload.action) {
    response.action = actionPayload.action
  }

  // Adicionar tag se disponível (agregado de nó add_tag no flow)
  if (actionPayload.tagName) {
    response.tag = {
      name: actionPayload.tagName,
      color: actionPayload.tagColor ?? null,
    }
  }

  // Metadados específicos por canal
  if (channelType.toLowerCase().includes('whatsapp')) {
    response.whatsapp = {
      message_id: wamid,
      reaction_emoji: actionPayload.emoji || undefined,
      response_text: actionPayload.textReaction || undefined,
      tag: actionPayload.tagName ? { name: actionPayload.tagName, color: actionPayload.tagColor } : undefined,
    }
  }

  if (channelType.toLowerCase().includes('instagram')) {
    response.instagram = {
      message_id: wamid,
      reaction_emoji: actionPayload.emoji || undefined,
      response_text: actionPayload.textReaction || undefined,
      tag: actionPayload.tagName ? { name: actionPayload.tagName, color: actionPayload.tagColor } : undefined,
    }
  }

  if (channelType.toLowerCase().includes('facebook')) {
    response.facebook = {
      message_id: wamid,
      reaction_emoji: actionPayload.emoji || undefined,
      response_text: actionPayload.textReaction || undefined,
      tag: actionPayload.tagName ? { name: actionPayload.tagName, color: actionPayload.tagColor } : undefined,
    }
  }

  return response
}

// Legacy compatibility functions
export async function getReactionsByMessageId(messageId: string, userId: string, options: any = {}): Promise<ButtonReactionData[]> {
  return getUserReactions(userId, options)
}

export async function createReaction(data: any): Promise<ButtonReactionData> {
  return upsertButtonReaction(data)
}

export async function updateReaction(id: string, data: any): Promise<ButtonReactionData> {
  return upsertButtonReaction(data)
}

export async function deleteReaction(id: string, userId: string): Promise<boolean> {
  const prisma = getPrismaInstance()

  try {
    await prisma.mapeamentoBotao.delete({
      where: {
        id: id,
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
    })
    return true
  } catch (error) {
    return false
  }
}

export async function updateReactionConfig(
  buttonId: string,
  config: { emoji?: string; textResponse?: string },
  userId: string
): Promise<ButtonReactionData | null> {
  const prisma = getPrismaInstance()

  const buttonReaction = await prisma.mapeamentoBotao.findFirst({
    where: {
      buttonId: buttonId,
      actionType: 'BUTTON_REACTION',
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
  })

  if (!buttonReaction) {
    return null
  }

  const currentPayload = buttonReaction.actionPayload as any
  const updatedPayload = {
    ...currentPayload,
    ...(config.emoji !== undefined && { emoji: config.emoji }),
    ...(config.textResponse !== undefined && { textReaction: config.textResponse }),
  }

  const updatedReaction = await prisma.mapeamentoBotao.update({
    where: {
      id: buttonReaction.id,
    },
    data: {
      actionPayload: updatedPayload,
      updatedAt: new Date(),
    },
    include: {
      inbox: {
        select: {
          id: true,
          nome: true,
          inboxId: true,
        },
      },
    },
  })

  return {
    id: updatedReaction.id,
    buttonId: updatedReaction.buttonId,
    actionType: updatedReaction.actionType,
    actionPayload: updatedReaction.actionPayload as any,
    description: updatedReaction.description,
    inboxId: updatedReaction.inboxId,
    createdAt: updatedReaction.createdAt,
    updatedAt: updatedReaction.updatedAt,
    inbox: updatedReaction.inbox,
  }
}

export async function getReactionForReactionsModal(buttonId: string, userId: string) {
  const reaction = await getReactionByButtonId(buttonId, userId)

  if (!reaction) {
    return null
  }

  const payload = reaction.actionPayload

  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    type: 'emoji' as const,
    emoji: payload.emoji || null,
    textReaction: payload.textReaction || null,
    description: reaction.description,
    isActive: true,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    createdBy: userId,
    message: reaction.inbox ? {
      id: reaction.inbox.id,
      name: reaction.inbox.nome,
      type: 'interactive',
    } : undefined,
  }
}

/**
 * Get intent mapping by buttonId (includes SEND_TEMPLATE, SEND_INTENT, etc.)
 * This handles the "Mapeamento IA - Intenções" functionality
 * 
 * 🚨 CRÍTICO: SEMPRE deve filtrar por inboxId para isolar templates por caixa
 */
export async function getIntentMappingByButtonId(
  buttonId: string,
  userId: string,
  inboxId?: string
): Promise<ButtonReactionData | null> {
  const prisma = getPrismaInstance()

  console.log('[INTENT MAPPING DEBUG] Searching for intent mapping', {
    buttonId,
    userId,
    inboxId,
    timestamp: new Date().toISOString()
  });

  // 🔒 ISOLAMENTO POR CAIXA: Construir where clause com inboxId obrigatório
  const whereClause: any = {
    buttonId: buttonId,
    // Look for any action type that's not BUTTON_REACTION (template mappings, etc.)
    actionType: {
      not: 'BUTTON_REACTION'
    },
    inbox: {
      usuarioChatwit: {
        appUserId: userId,
      },
    },
  };

  // 🚨 CRÍTICO: Se inboxId for fornecido, DEVE filtrar por ele
  if (inboxId) {
    whereClause.inbox.inboxId = inboxId;
    console.log('[INTENT MAPPING DEBUG] 🔒 Filtering by inboxId', { inboxId });
  }

  const mapping = await prisma.mapeamentoBotao.findFirst({
    where: whereClause,
    include: {
      inbox: {
        select: {
          id: true,
          nome: true,
          inboxId: true,
        },
      },
    },
  })

  console.log('[INTENT MAPPING DEBUG] Query result', {
    buttonId,
    userId,
    found: !!mapping,
    mappingId: mapping?.id,
    actionType: mapping?.actionType,
    actionPayload: mapping?.actionPayload,
    inboxId: mapping?.inboxId,
    timestamp: new Date().toISOString()
  });

  if (mapping) {
    console.log('[INTENT MAPPING DEBUG] Found in MapeamentoBotao', {
      buttonId,
      mappingId: mapping.id,
      actionType: mapping.actionType
    });

    return {
      id: mapping.id,
      buttonId: mapping.buttonId,
      actionType: mapping.actionType,
      actionPayload: mapping.actionPayload as any,
      description: mapping.description,
      inboxId: mapping.inboxId,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
      inbox: mapping.inbox,
    }
  }

  // 🔧 CORREÇÃO: Buscar na tabela MapeamentoIntencao (novo sistema IA Intent Mapping)
  // Extract intent name from buttonId (remove @ prefix)
  const normalizedIntent = buildIntentSearchInfo(buttonId)
  const intentName = normalizedIntent.plain
  const searchCandidates = normalizedIntent.candidates

  console.log('[INTENT MAPPING DEBUG] Searching in MapeamentoIntencao', {
    buttonId,
    intentName,
    userId,
    inboxId,
    searchCandidates
  });

  try {
    // 🔒 ISOLAMENTO POR CAIXA: Construir where clause com inboxId obrigatório
    const intentWhereClause: any = {
      intentName: searchCandidates.length
        ? { in: searchCandidates }
        : intentName,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    };

    // 🚨 CRÍTICO: Se inboxId for fornecido, DEVE filtrar por ele
    if (inboxId) {
      intentWhereClause.inbox.inboxId = inboxId;
      console.log('[INTENT MAPPING DEBUG] 🔒 Filtering MapeamentoIntencao by inboxId', { inboxId });
    }

    const intentMapping = await prisma.mapeamentoIntencao.findFirst({
      where: intentWhereClause,
      include: {
        inbox: {
          select: {
            id: true,
            nome: true,
            inboxId: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!intentMapping && normalizedIntent.slug) {
      console.log('[INTENT MAPPING DEBUG] Direct match not found, trying slug fallback', {
        buttonId,
        slug: normalizedIntent.slug,
        userId,
        inboxId,
      })

      // 🔒 ISOLAMENTO POR CAIXA: Fallback também deve filtrar por inboxId
      const fallbackWhereClause: any = {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      };

      if (inboxId) {
        fallbackWhereClause.inbox.inboxId = inboxId;
        console.log('[INTENT MAPPING DEBUG] 🔒 Filtering fallback by inboxId', { inboxId });
      }

      const fallbackCandidates = await prisma.mapeamentoIntencao.findMany({
        where: fallbackWhereClause,
        include: {
          inbox: {
            select: {
              id: true,
              nome: true,
              inboxId: true,
            },
          },
          template: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      const slugMatch = fallbackCandidates.find(
        (candidate) => slugifyIntentValue(candidate.intentName) === normalizedIntent.slug
      )

      if (slugMatch) {
        const templateName = slugMatch.template?.name || 'unknown template'
        console.log('[INTENT MAPPING DEBUG] Found slug fallback match in MapeamentoIntencao', {
          buttonId,
          intentName: slugMatch.intentName,
          mappingId: slugMatch.id,
          templateId: slugMatch.templateId,
          templateName,
        })
        return {
          id: slugMatch.id,
          buttonId: buttonId,
          actionType: 'SEND_TEMPLATE',
          actionPayload: {
            templateId: slugMatch.templateId,
            customVariables: slugMatch.customVariables,
          } as any,
          description: `Intent mapping: ${slugMatch.intentName} -> ${templateName}`,
          inboxId: slugMatch.inboxId,
          createdAt: slugMatch.createdAt,
          updatedAt: slugMatch.updatedAt,
          inbox: slugMatch.inbox,
        }
      }
    }

    if (intentMapping) {
      console.log('[INTENT MAPPING DEBUG] Found in MapeamentoIntencao', {
        buttonId,
        intentName: intentMapping.intentName,
        mappingId: intentMapping.id,
        templateId: intentMapping.templateId,
        templateName: intentMapping.template?.name ?? 'N/A'
      });

      // Convert MapeamentoIntencao to ButtonReactionData format
      return {
        id: intentMapping.id,
        buttonId: buttonId, // Use original buttonId
        actionType: 'SEND_TEMPLATE', // Intent mappings send templates
        actionPayload: {
          templateId: intentMapping.templateId,
          customVariables: intentMapping.customVariables
        } as any,
        description: `Intent mapping: ${intentName} -> ${intentMapping.template?.name ?? 'N/A'}`,
        inboxId: intentMapping.inboxId,
        createdAt: intentMapping.createdAt,
        updatedAt: intentMapping.updatedAt,
        inbox: intentMapping.inbox,
      }
    }

    console.log('[INTENT MAPPING DEBUG] No mapping found in either table', {
      buttonId,
      intentName,
      userId,
      timestamp: new Date().toISOString()
    });

    return null

  } catch (error) {
    console.error('[INTENT MAPPING DEBUG] Error searching MapeamentoIntencao', {
      buttonId,
      intentName,
      userId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    return null
  }
}
