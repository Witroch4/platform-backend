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
    const reactions = await prisma_1.prisma.mapeamentoBotao.findMany({
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
    });
    return reactions.map(formatReactionData);
}
/**
 * Get a specific button reaction by button ID
 */
async function getReactionByButtonId(buttonId, userId, options = {}) {
    const { includeInactive = false, includeMessage = false } = options;
    const reaction = await prisma_1.prisma.mapeamentoBotao.findFirst({
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
    });
    return reaction ? formatReactionData(reaction) : null;
}
/**
 * Get a specific button reaction by reaction ID
 */
async function getReactionById(reactionId, userId, options = {}) {
    const { includeMessage = false } = options;
    const reaction = await prisma_1.prisma.mapeamentoBotao.findFirst({
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
        prisma_1.prisma.mapeamentoBotao.findMany({
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
        prisma_1.prisma.mapeamentoBotao.count({
            where: {
                inbox: {
                    usuarioChatwit: {
                        appUserId: userId,
                    },
                },
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
    const reactions = await prisma_1.prisma.mapeamentoBotao.findMany({
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
    });
    return reactions.map(formatReactionData);
}
/**
 * Check if a button has an existing reaction
 */
async function hasButtonReaction(buttonId, userId, includeInactive = false) {
    const count = await prisma_1.prisma.mapeamentoBotao.count({
        where: {
            buttonId,
            inbox: {
                usuarioChatwit: {
                    appUserId: userId,
                },
            },
        },
    });
    return count > 0;
}
/**
 * Get reaction statistics for a user
 */
async function getReactionStats(userId) {
    const [total, emojiReactions, textReactions] = await Promise.all([
        prisma_1.prisma.mapeamentoBotao.count({
            where: {
                inbox: {
                    usuarioChatwit: {
                        appUserId: userId,
                    },
                },
            },
        }),
        prisma_1.prisma.mapeamentoBotao.count({
            where: {
                inbox: {
                    usuarioChatwit: {
                        appUserId: userId,
                    },
                },
                actionType: 'SEND_TEMPLATE', // Emoji reactions typically use SEND_TEMPLATE
            },
        }),
        prisma_1.prisma.mapeamentoBotao.count({
            where: {
                inbox: {
                    usuarioChatwit: {
                        appUserId: userId,
                    },
                },
                actionType: 'ADD_TAG', // Text reactions typically use ADD_TAG
            },
        }),
    ]);
    return {
        total,
        active: total, // MapeamentoBotao doesn't have isActive field, assume all are active
        inactive: 0,
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
    const reactions = await prisma_1.prisma.mapeamentoBotao.findMany({
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
    });
    const accessibleButtonIds = reactions.map((r) => r.buttonId);
    const reactionIds = reactions.map((r) => r.id);
    if (accessibleButtonIds.length === 0) {
        return { count: 0, deletedIds: [] };
    }
    if (softDelete) {
        // MapeamentoBotao doesn't have isActive field, so we'll just delete
        await prisma_1.prisma.mapeamentoBotao.deleteMany({
            where: {
                buttonId: {
                    in: accessibleButtonIds,
                },
            },
        });
    }
    else {
        await prisma_1.prisma.mapeamentoBotao.deleteMany({
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
    // Parse actionPayload to extract emoji and textReaction
    const actionPayload = reaction.actionPayload;
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
    };
}
