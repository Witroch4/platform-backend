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

  const reactions = await prisma.buttonReactionMapping.findMany({
    where: {
      messageId,
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      message: includeMessage
        ? {
            select: {
              id: true,
              name: true,
              type: true,
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

  const reaction = await prisma.buttonReactionMapping.findFirst({
    where: {
      buttonId,
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      message: includeMessage
        ? {
            select: {
              id: true,
              name: true,
              type: true,
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

  const reaction = await prisma.buttonReactionMapping.findFirst({
    where: {
      id: reactionId,
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
    },
    include: {
      message: includeMessage
        ? {
            select: {
              id: true,
              name: true,
              type: true,
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
    prisma.buttonReactionMapping.findMany({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        message: includeMessage
          ? {
              select: {
                id: true,
                name: true,
                type: true,
              },
            }
          : false,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.buttonReactionMapping.count({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
        ...(includeInactive ? {} : { isActive: true }),
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

  const reactions = await prisma.buttonReactionMapping.findMany({
    where: {
      buttonId: {
        in: buttonIds,
      },
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      message: includeMessage
        ? {
            select: {
              id: true,
              name: true,
              type: true,
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
  const count = await prisma.buttonReactionMapping.count({
    where: {
      buttonId,
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
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
  const [total, active, emojiReactions, textReactions] = await Promise.all([
    prisma.buttonReactionMapping.count({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
      },
    }),
    prisma.buttonReactionMapping.count({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
        isActive: true,
      },
    }),
    prisma.buttonReactionMapping.count({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
        isActive: true,
        description: null, // Emoji reactions don't have description
      },
    }),
    prisma.buttonReactionMapping.count({
      where: {
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: userId,
            },
          },
        },
        isActive: true,
        description: {
          not: null, // Text reactions have description
        },
      },
    }),
  ])

  return {
    total,
    active,
    inactive: total - active,
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
  const reactions = await prisma.buttonReactionMapping.findMany({
    where: {
      buttonId: {
        in: buttonIds,
      },
      message: {
        caixa: {
          usuarioChatwit: {
            appUserId: userId,
          },
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
    await prisma.buttonReactionMapping.updateMany({
      where: {
        buttonId: {
          in: accessibleButtonIds,
        },
      },
      data: {
        isActive: false,
      },
    })
  } else {
    await prisma.buttonReactionMapping.deleteMany({
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
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.messageId,
    type: reaction.description ? 'text' : 'emoji',
    emoji: reaction.emoji,
    textReaction: reaction.description,
    description: reaction.description,
    isActive: reaction.isActive,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    createdBy: reaction.createdBy,
    ...(reaction.message && { message: reaction.message }),
  }
}