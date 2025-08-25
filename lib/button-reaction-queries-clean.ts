import { getPrismaInstance } from '@/lib/connections'

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
      actionType: 'BUTTON_REACTION',
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
      actionType: 'BUTTON_REACTION',
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

  return reactions.map((reaction) => ({
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
      actionType: 'BUTTON_REACTION',
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

  // Metadados específicos por canal
  if (channelType.toLowerCase().includes('whatsapp')) {
    response.whatsapp = {
      message_id: wamid,
      reaction_emoji: actionPayload.emoji || undefined,
      response_text: actionPayload.textReaction || undefined,
    }
  }

  if (channelType.toLowerCase().includes('instagram')) {
    response.instagram = {
      message_id: wamid,
      reaction_emoji: actionPayload.emoji || undefined,
      response_text: actionPayload.textReaction || undefined,
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
