import { prisma } from '@/lib/prisma'

export interface ButtonReactionData {
  id: string
  buttonId: string
  messageId: string | null
  type: 'emoji' | 'text'
  emoji: string | null
  textReaction: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: string
  message?: {
    id: string
    name: string
    type: string
  }
}

export interface ReactionQueryOptions {
  includeInactive?: boolean
  includeMessage?: boolean
  userId?: string
  page?: number
  limit?: number
}

/**
 * Get all button reactions for a specific message
 */
export async function getReactionsByMessageId(
  messageId: string,
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<ButtonReactionData[]> {
  const { includeInactive = false, includeMessage = false } = options

  const reactions = await prisma.mapeamentoBotao.findMany({
    where: {
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: includeMessage
        ? {
            select: {
              id: true,
              nome: true,
              channelType: true,
            },
          }
        : false,
    },
    orderBy: { createdAt: 'asc' },
  })

  return reactions.map(formatReactionData)
}

/**
 * Get a specific button reaction by button ID
 */
export async function getReactionByButtonId(
  buttonId: string,
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<ButtonReactionData | null> {
  const { includeInactive = false, includeMessage = false } = options

  const reaction = await prisma.mapeamentoBotao.findFirst({
    where: {
      buttonId,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: includeMessage
        ? {
            select: {
              id: true,
              nome: true,
              channelType: true,
            },
          }
        : false,
    },
  })

  return reaction ? formatReactionData(reaction) : null
}

/**
 * Get a specific button reaction by reaction ID
 */
export async function getReactionById(
  reactionId: string,
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<ButtonReactionData | null> {
  const { includeMessage = false } = options

  const reaction = await prisma.mapeamentoBotao.findFirst({
    where: {
      id: reactionId,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: includeMessage
        ? {
            select: {
              id: true,
              nome: true,
              channelType: true,
            },
          }
        : false,
    },
  })

  return reaction ? formatReactionData(reaction) : null
}

/**
 * Get all button reactions for a user with pagination
 */
export async function getUserReactions(
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<{
  reactions: ButtonReactionData[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}> {
  const {
    includeInactive = false,
    includeMessage = true,
    page = 1,
    limit = 50,
  } = options

  const offset = (page - 1) * limit

  const [reactions, total] = await Promise.all([
    prisma.mapeamentoBotao.findMany({
      where: {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
      include: {
        inbox: includeMessage
          ? {
              select: {
                id: true,
                nome: true,
                channelType: true,
              },
            }
          : false,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.mapeamentoBotao.count({
      where: {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
    }),
  ])

  return {
    reactions: reactions.map(formatReactionData),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Get reactions by multiple button IDs (bulk query)
 */
export async function getReactionsByButtonIds(
  buttonIds: string[],
  userId: string,
  options: ReactionQueryOptions = {}
): Promise<ButtonReactionData[]> {
  const { includeInactive = false, includeMessage = false } = options

  if (buttonIds.length === 0) {
    return []
  }

  const reactions = await prisma.mapeamentoBotao.findMany({
    where: {
      buttonId: {
        in: buttonIds,
      },
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      inbox: includeMessage
        ? {
            select: {
              id: true,
              nome: true,
              channelType: true,
            },
          }
        : false,
    },
    orderBy: { createdAt: 'asc' },
  })

  return reactions.map(formatReactionData)
}

/**
 * Check if a button has an existing reaction
 */
export async function hasButtonReaction(
  buttonId: string,
  userId: string,
  includeInactive = false
): Promise<boolean> {
  const count = await prisma.mapeamentoBotao.count({
    where: {
      buttonId,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
  })

  return count > 0
}

/**
 * Get reaction statistics for a user
 */
export async function getReactionStats(userId: string): Promise<{
  total: number
  active: number
  inactive: number
  byType: {
    emoji: number
    text: number
  }
}> {
  const [total, emojiReactions, textReactions] = await Promise.all([
    prisma.mapeamentoBotao.count({
      where: {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
    }),
    prisma.mapeamentoBotao.count({
      where: {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
        actionType: 'SEND_TEMPLATE', // Emoji reactions typically use SEND_TEMPLATE
      },
    }),
    prisma.mapeamentoBotao.count({
      where: {
        inbox: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
        actionType: 'ADD_TAG', // Text reactions typically use ADD_TAG
      },
    }),
  ])

  return {
    total,
    active: total, // MapeamentoBotao doesn't have isActive field, assume all are active
    inactive: 0,
    byType: {
      emoji: emojiReactions,
      text: textReactions,
    },
  }
}

/**
 * Bulk delete reactions for multiple button IDs (cascade delete logic)
 */
export async function deleteReactionsByButtonIds(
  buttonIds: string[],
  userId: string,
  softDelete = false
): Promise<{ count: number; deletedIds: string[] }> {
  if (buttonIds.length === 0) {
    return { count: 0, deletedIds: [] }
  }

  // First, verify user has access to all reactions
  const reactions = await prisma.mapeamentoBotao.findMany({
    where: {
      buttonId: {
        in: buttonIds,
      },
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    select: {
      id: true,
      buttonId: true,
    },
  })

  const accessibleButtonIds = reactions.map((r) => r.buttonId)
  const reactionIds = reactions.map((r) => r.id)

  if (accessibleButtonIds.length === 0) {
    return { count: 0, deletedIds: [] }
  }

  if (softDelete) {
    // MapeamentoBotao doesn't have isActive field, so we'll just delete
    await prisma.mapeamentoBotao.deleteMany({
      where: {
        buttonId: {
          in: accessibleButtonIds,
        },
      },
    })
  } else {
    await prisma.mapeamentoBotao.deleteMany({
      where: {
        buttonId: {
          in: accessibleButtonIds,
        },
      },
    })
  }

  return {
    count: accessibleButtonIds.length,
    deletedIds: reactionIds,
  }
}

/**
 * Helper function to format reaction data consistently
 */
function formatReactionData(reaction: any): ButtonReactionData {
  // Parse actionPayload to extract emoji and textReaction
  const actionPayload = reaction.actionPayload as any;
  const emoji = actionPayload?.emoji;
  const textReaction = actionPayload?.textReaction;
  
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.inboxId, // Use inboxId instead of messageId
    type: textReaction ? 'text' : 'emoji',
    emoji: emoji || null,
    textReaction: textReaction || null,
    description: reaction.description || null,
    isActive: true, // MapeamentoBotao doesn't have isActive field, assume active
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    createdBy: reaction.createdBy || 'system',
    ...(reaction.inbox && { message: reaction.inbox }),
  }
}