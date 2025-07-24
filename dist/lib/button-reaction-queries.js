"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReactionsByMessageId = getReactionsByMessageId;
exports.getReactionByButtonId = getReactionByButtonId;
exports.getReactionById = getReactionById;
exports.getUserReactions = getUserReactions;
exports.getReactionsByButtonIds = getReactionsByButtonIds;
exports.hasButtonReaction = hasButtonReaction;
exports.getReactionStats = getReactionStats;
exports.deleteReactionsByButtonIds = deleteReactionsByButtonIds;
const prisma_1 = require("@/lib/prisma");
/**
 * Get all button reactions for a specific message
 */
async function getReactionsByMessageId(messageId, userId, options = {}) {
    const { includeInactive = false, includeMessage = false } = options;
    const reactions = await prisma_1.prisma.buttonReactionMapping.findMany({
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
    });
    return reactions.map(formatReactionData);
}
/**
 * Get a specific button reaction by button ID
 */
async function getReactionByButtonId(buttonId, userId, options = {}) {
    const { includeInactive = false, includeMessage = false } = options;
    const reaction = await prisma_1.prisma.buttonReactionMapping.findFirst({
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
    });
    return reaction ? formatReactionData(reaction) : null;
}
/**
 * Get a specific button reaction by reaction ID
 */
async function getReactionById(reactionId, userId, options = {}) {
    const { includeMessage = false } = options;
    const reaction = await prisma_1.prisma.buttonReactionMapping.findFirst({
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
    });
    return reaction ? formatReactionData(reaction) : null;
}
/**
 * Get all button reactions for a user with pagination
 */
async function getUserReactions(userId, options = {}) {
    const { includeInactive = false, includeMessage = true, page = 1, limit = 50, } = options;
    const offset = (page - 1) * limit;
    const [reactions, total] = await Promise.all([
        prisma_1.prisma.buttonReactionMapping.findMany({
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
        prisma_1.prisma.buttonReactionMapping.count({
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
    ]);
    return {
        reactions: reactions.map(formatReactionData),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
/**
 * Get reactions by multiple button IDs (bulk query)
 */
async function getReactionsByButtonIds(buttonIds, userId, options = {}) {
    const { includeInactive = false, includeMessage = false } = options;
    if (buttonIds.length === 0) {
        return [];
    }
    const reactions = await prisma_1.prisma.buttonReactionMapping.findMany({
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
    });
    return reactions.map(formatReactionData);
}
/**
 * Check if a button has an existing reaction
 */
async function hasButtonReaction(buttonId, userId, includeInactive = false) {
    const count = await prisma_1.prisma.buttonReactionMapping.count({
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
    });
    return count > 0;
}
/**
 * Get reaction statistics for a user
 */
async function getReactionStats(userId) {
    const [total, active, emojiReactions, textReactions] = await Promise.all([
        prisma_1.prisma.buttonReactionMapping.count({
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
        prisma_1.prisma.buttonReactionMapping.count({
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
        prisma_1.prisma.buttonReactionMapping.count({
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
        prisma_1.prisma.buttonReactionMapping.count({
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
    ]);
    return {
        total,
        active,
        inactive: total - active,
        byType: {
            emoji: emojiReactions,
            text: textReactions,
        },
    };
}
/**
 * Bulk delete reactions for multiple button IDs (cascade delete logic)
 */
async function deleteReactionsByButtonIds(buttonIds, userId, softDelete = false) {
    if (buttonIds.length === 0) {
        return { count: 0, deletedIds: [] };
    }
    // First, verify user has access to all reactions
    const reactions = await prisma_1.prisma.buttonReactionMapping.findMany({
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
    });
    const accessibleButtonIds = reactions.map((r) => r.buttonId);
    const reactionIds = reactions.map((r) => r.id);
    if (accessibleButtonIds.length === 0) {
        return { count: 0, deletedIds: [] };
    }
    if (softDelete) {
        await prisma_1.prisma.buttonReactionMapping.updateMany({
            where: {
                buttonId: {
                    in: accessibleButtonIds,
                },
            },
            data: {
                isActive: false,
            },
        });
    }
    else {
        await prisma_1.prisma.buttonReactionMapping.deleteMany({
            where: {
                buttonId: {
                    in: accessibleButtonIds,
                },
            },
        });
    }
    return {
        count: accessibleButtonIds.length,
        deletedIds: reactionIds,
    };
}
/**
 * Helper function to format reaction data consistently
 */
function formatReactionData(reaction) {
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
    };
}
