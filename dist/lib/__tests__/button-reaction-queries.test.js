"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const button_reaction_queries_1 = require("../button-reaction-queries");
// Mock Prisma
jest.mock('@/lib/prisma', () => ({
    prisma: {
        buttonReactionMapping: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            count: jest.fn(),
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));
const mockPrisma = prisma_1.prisma;
describe('Button Reaction Queries', () => {
    const userId = 'user-123';
    const messageId = 'message-123';
    const buttonId = 'button-123';
    const reactionId = 'reaction-123';
    const mockReaction = {
        id: reactionId,
        buttonId,
        messageId,
        emoji: '👍',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        message: {
            id: messageId,
            name: 'Test Message',
            type: 'button',
        },
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('getReactionsByMessageId', () => {
        it('should get all reactions for a message', async () => {
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction]);
            const result = await (0, button_reaction_queries_1.getReactionsByMessageId)(messageId, userId);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(reactionId);
            expect(result[0].type).toBe('emoji');
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
                where: {
                    messageId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                    isActive: true,
                },
                include: {
                    message: false,
                },
                orderBy: { createdAt: 'asc' },
            });
        });
        it('should include inactive reactions when requested', async () => {
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction]);
            await (0, button_reaction_queries_1.getReactionsByMessageId)(messageId, userId, { includeInactive: true });
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
                where: {
                    messageId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                },
                include: {
                    message: false,
                },
                orderBy: { createdAt: 'asc' },
            });
        });
        it('should include message data when requested', async () => {
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction]);
            await (0, button_reaction_queries_1.getReactionsByMessageId)(messageId, userId, { includeMessage: true });
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
                where: {
                    messageId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                    isActive: true,
                },
                include: {
                    message: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            });
        });
    });
    describe('getReactionByButtonId', () => {
        it('should get reaction by button ID', async () => {
            mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction);
            const result = await (0, button_reaction_queries_1.getReactionByButtonId)(buttonId, userId);
            expect(result).not.toBeNull();
            expect(result?.buttonId).toBe(buttonId);
            expect(mockPrisma.buttonReactionMapping.findFirst).toHaveBeenCalledWith({
                where: {
                    buttonId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                    isActive: true,
                },
                include: {
                    message: false,
                },
            });
        });
        it('should return null when reaction not found', async () => {
            mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(null);
            const result = await (0, button_reaction_queries_1.getReactionByButtonId)('nonexistent', userId);
            expect(result).toBeNull();
        });
    });
    describe('getReactionById', () => {
        it('should get reaction by ID', async () => {
            mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction);
            const result = await (0, button_reaction_queries_1.getReactionById)(reactionId, userId);
            expect(result).not.toBeNull();
            expect(result?.id).toBe(reactionId);
            expect(mockPrisma.buttonReactionMapping.findFirst).toHaveBeenCalledWith({
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
                    message: false,
                },
            });
        });
    });
    describe('getUserReactions', () => {
        it('should get user reactions with pagination', async () => {
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction]);
            mockPrisma.buttonReactionMapping.count.mockResolvedValue(1);
            const result = await (0, button_reaction_queries_1.getUserReactions)(userId, { page: 1, limit: 10 });
            expect(result.reactions).toHaveLength(1);
            expect(result.pagination).toEqual({
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1,
            });
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
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
                include: {
                    message: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: 0,
                take: 10,
            });
        });
        it('should handle pagination correctly', async () => {
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([]);
            mockPrisma.buttonReactionMapping.count.mockResolvedValue(25);
            const result = await (0, button_reaction_queries_1.getUserReactions)(userId, { page: 3, limit: 10 });
            expect(result.pagination).toEqual({
                page: 3,
                limit: 10,
                total: 25,
                totalPages: 3,
            });
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith(expect.objectContaining({
                skip: 20, // (3-1) * 10
                take: 10,
            }));
        });
    });
    describe('getReactionsByButtonIds', () => {
        it('should get reactions for multiple button IDs', async () => {
            const buttonIds = ['button-1', 'button-2', 'button-3'];
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction]);
            const result = await (0, button_reaction_queries_1.getReactionsByButtonIds)(buttonIds, userId);
            expect(result).toHaveLength(1);
            expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
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
                    isActive: true,
                },
                include: {
                    message: false,
                },
                orderBy: { createdAt: 'asc' },
            });
        });
        it('should return empty array for empty button IDs', async () => {
            const result = await (0, button_reaction_queries_1.getReactionsByButtonIds)([], userId);
            expect(result).toEqual([]);
            expect(mockPrisma.buttonReactionMapping.findMany).not.toHaveBeenCalled();
        });
    });
    describe('hasButtonReaction', () => {
        it('should return true when button has reaction', async () => {
            mockPrisma.buttonReactionMapping.count.mockResolvedValue(1);
            const result = await (0, button_reaction_queries_1.hasButtonReaction)(buttonId, userId);
            expect(result).toBe(true);
            expect(mockPrisma.buttonReactionMapping.count).toHaveBeenCalledWith({
                where: {
                    buttonId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                    isActive: true,
                },
            });
        });
        it('should return false when button has no reaction', async () => {
            mockPrisma.buttonReactionMapping.count.mockResolvedValue(0);
            const result = await (0, button_reaction_queries_1.hasButtonReaction)(buttonId, userId);
            expect(result).toBe(false);
        });
        it('should include inactive reactions when requested', async () => {
            mockPrisma.buttonReactionMapping.count.mockResolvedValue(1);
            await (0, button_reaction_queries_1.hasButtonReaction)(buttonId, userId, true);
            expect(mockPrisma.buttonReactionMapping.count).toHaveBeenCalledWith({
                where: {
                    buttonId,
                    message: {
                        caixa: {
                            usuarioChatwit: {
                                appUserId: userId,
                            },
                        },
                    },
                },
            });
        });
    });
    describe('getReactionStats', () => {
        it('should return reaction statistics', async () => {
            mockPrisma.buttonReactionMapping.count
                .mockResolvedValueOnce(10) // total
                .mockResolvedValueOnce(8) // active
                .mockResolvedValueOnce(5) // emoji
                .mockResolvedValueOnce(3); // text
            const result = await (0, button_reaction_queries_1.getReactionStats)(userId);
            expect(result).toEqual({
                total: 10,
                active: 8,
                inactive: 2,
                byType: {
                    emoji: 5,
                    text: 3,
                },
            });
        });
    });
    describe('deleteReactionsByButtonIds', () => {
        it('should delete reactions for multiple button IDs', async () => {
            const buttonIds = ['button-1', 'button-2'];
            const reactions = [
                { id: 'reaction-1', buttonId: 'button-1' },
                { id: 'reaction-2', buttonId: 'button-2' },
            ];
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue(reactions);
            mockPrisma.buttonReactionMapping.deleteMany.mockResolvedValue({ count: 2 });
            const result = await (0, button_reaction_queries_1.deleteReactionsByButtonIds)(buttonIds, userId);
            expect(result).toEqual({
                count: 2,
                deletedIds: ['reaction-1', 'reaction-2'],
            });
            expect(mockPrisma.buttonReactionMapping.deleteMany).toHaveBeenCalledWith({
                where: {
                    buttonId: {
                        in: buttonIds,
                    },
                },
            });
        });
        it('should soft delete when requested', async () => {
            const buttonIds = ['button-1'];
            const reactions = [{ id: 'reaction-1', buttonId: 'button-1' }];
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue(reactions);
            mockPrisma.buttonReactionMapping.updateMany.mockResolvedValue({ count: 1 });
            const result = await (0, button_reaction_queries_1.deleteReactionsByButtonIds)(buttonIds, userId, true);
            expect(result).toEqual({
                count: 1,
                deletedIds: ['reaction-1'],
            });
            expect(mockPrisma.buttonReactionMapping.updateMany).toHaveBeenCalledWith({
                where: {
                    buttonId: {
                        in: buttonIds,
                    },
                },
                data: {
                    isActive: false,
                },
            });
        });
        it('should return empty result for empty button IDs', async () => {
            const result = await (0, button_reaction_queries_1.deleteReactionsByButtonIds)([], userId);
            expect(result).toEqual({
                count: 0,
                deletedIds: [],
            });
            expect(mockPrisma.buttonReactionMapping.findMany).not.toHaveBeenCalled();
        });
        it('should only delete reactions user has access to', async () => {
            const buttonIds = ['button-1', 'button-2', 'button-3'];
            const accessibleReactions = [
                { id: 'reaction-1', buttonId: 'button-1' },
                { id: 'reaction-2', buttonId: 'button-2' },
                // button-3 not accessible
            ];
            mockPrisma.buttonReactionMapping.findMany.mockResolvedValue(accessibleReactions);
            mockPrisma.buttonReactionMapping.deleteMany.mockResolvedValue({ count: 2 });
            const result = await (0, button_reaction_queries_1.deleteReactionsByButtonIds)(buttonIds, userId);
            expect(result).toEqual({
                count: 2,
                deletedIds: ['reaction-1', 'reaction-2'],
            });
            expect(mockPrisma.buttonReactionMapping.deleteMany).toHaveBeenCalledWith({
                where: {
                    buttonId: {
                        in: ['button-1', 'button-2'], // Only accessible buttons
                    },
                },
            });
        });
    });
    describe('formatReactionData', () => {
        it('should format emoji reaction correctly', async () => {
            const emojiReaction = {
                ...mockReaction,
                emoji: '👍',
                description: null,
            };
            mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(emojiReaction);
            const result = await (0, button_reaction_queries_1.getReactionById)(reactionId, userId);
            expect(result?.type).toBe('emoji');
            expect(result?.emoji).toBe('👍');
            expect(result?.textReaction).toBeNull();
        });
        it('should format text reaction correctly', async () => {
            const textReaction = {
                ...mockReaction,
                emoji: 'Thank you!',
                description: 'Thank you!',
            };
            mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(textReaction);
            const result = await (0, button_reaction_queries_1.getReactionById)(reactionId, userId);
            expect(result?.type).toBe('text');
            expect(result?.emoji).toBe('Thank you!');
            expect(result?.textReaction).toBe('Thank you!');
        });
    });
});
