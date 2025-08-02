import { POST, PUT, GET } from '../route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatwitInbox: {
      findFirst: jest.fn(),
    },
    interactiveMessage: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    buttonReactionMapping: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe('Messages with Reactions API - Integration Tests', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  }

  const mockInbox = {
    id: 'caixa-internal-123',
    inboxId: 'caixa-123',
    usuarioChatwitId: 'user-chatwit-123',
    usuarioChatwit: {
      appUserId: 'user-123',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
    mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox)
  })

  describe('Atomic Save Operations (POST)', () => {
    it('should create message with reactions atomically', async () => {
      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Interactive Message',
          type: 'button',
          body: {
            text: 'Choose an option below:'
          },
          footer: {
            text: 'Test Company'
          },
          action: {
            buttons: [
              { id: 'btn-yes', title: 'Yes', type: 'reply' },
              { id: 'btn-no', title: 'No', type: 'reply' }
            ]
          }
        },
        reactions: [
          {
            buttonId: 'btn-yes',
            reaction: { type: 'emoji', value: '👍' }
          },
          {
            buttonId: 'btn-no',
            reaction: { type: 'text', value: 'Thanks for letting us know!' }
          }
        ]
      }

      const mockSavedMessage = {
        id: 'msg-123',
        name: 'Test Interactive Message',
        type: 'button',
        bodyText: 'Choose an option below:',
        footerText: 'Test Company',
        actionData: requestBody.message.action,
        headerType: null,
        headerContent: null,
        latitude: null,
        longitude: null,
        locationName: null,
        locationAddress: null,
        reactionEmoji: null,
        targetMessageId: null,
        stickerMediaId: null,
        stickerUrl: null,
        inboxId: 'caixa-123',
        createdById: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockSavedReactions = [
        {
          id: 'reaction-1',
          buttonId: 'btn-yes',
          messageId: 'msg-123',
          emoji: '👍',
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-123',
        },
        {
          id: 'reaction-2',
          buttonId: 'btn-no',
          messageId: 'msg-123',
          emoji: 'Thanks for letting us know!',
          description: 'Thanks for letting us know!',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-123',
        }
      ]

      // Mock successful transaction
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          interactiveMessage: {
            create: jest.fn().mockResolvedValue(mockSavedMessage),
          },
          buttonReactionMapping: {
            create: jest.fn()
              .mockResolvedValueOnce(mockSavedReactions[0])
              .mockResolvedValueOnce(mockSavedReactions[1]),
          },
        }
        return await callback(mockTx)
      })

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData).toMatchObject({
        success: true,
        messageId: 'msg-123',
        reactionIds: ['reaction-1', 'reaction-2'],
        message: expect.objectContaining({
          id: 'msg-123',
          name: 'Test Interactive Message',
          type: 'button',
        }),
        reactions: expect.arrayContaining([
          expect.objectContaining({
            id: 'reaction-1',
            buttonId: 'btn-yes',
            type: 'emoji',
            emoji: '👍',
          }),
          expect.objectContaining({
            id: 'reaction-2',
            buttonId: 'btn-no',
            type: 'text',
            textReaction: 'Thanks for letting us know!',
          }),
        ]),
        requestId: expect.any(String),
      })

      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('should handle transaction rollback on failure', async () => {
      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: [
          {
            buttonId: 'btn-1',
            reaction: { type: 'emoji', value: '👍' }
          }
        ]
      }

      // Mock transaction failure
      mockPrisma.$transaction.mockRejectedValue(new Error('Database constraint violation'))

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData).toMatchObject({
        error: 'Database transaction failed',
        code: 'DATABASE_TRANSACTION_FAILED',
        requestId: expect.any(String),
      })
    })

    it('should handle unique constraint violations', async () => {
      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: [
          {
            buttonId: 'duplicate-btn',
            reaction: { type: 'emoji', value: '👍' }
          }
        ]
      }

      // Mock unique constraint violation
      mockPrisma.$transaction.mockRejectedValue(new Error('Unique constraint failed on the fields: (`buttonId`)'))

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(409)
      expect(responseData).toMatchObject({
        error: 'Duplicate button ID detected',
        code: 'DATABASE_CONSTRAINT_VIOLATION',
        details: 'Button IDs must be unique within a message',
        requestId: expect.any(String),
      })
    })

    it('should validate request data comprehensively', async () => {
      const invalidRequestBody = {
        inboxId: '', // Invalid empty inboxId
        message: {
          name: '', // Invalid empty name
          type: 'invalid_type', // Invalid type
          body: {
            text: '' // Invalid empty body text
          }
        },
        reactions: [
          {
            buttonId: '', // Invalid empty buttonId
            reaction: { type: 'emoji', value: '' } // Invalid empty emoji
          }
        ]
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(invalidRequestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData).toMatchObject({
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.stringContaining('inboxId'),
            message: expect.any(String),
          }),
          expect.objectContaining({
            field: expect.stringContaining('name'),
            message: expect.any(String),
          }),
          expect.objectContaining({
            field: expect.stringContaining('type'),
            message: expect.any(String),
          }),
        ]),
        requestId: expect.any(String),
      })
    })

    it('should handle authentication failures', async () => {
      mockAuth.mockResolvedValue(null)

      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: []
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
        requestId: expect.any(String),
      })
    })

    it('should handle inbox access validation', async () => {
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(null)

      const requestBody = {
        inboxId: 'unauthorized-caixa',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: []
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(404)
      expect(responseData).toMatchObject({
        error: 'Caixa not found or access denied',
        code: 'CAIXA_NOT_FOUND',
        requestId: expect.any(String),
      })
    })

    it('should handle malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: 'invalid json {',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData).toMatchObject({
        error: 'Invalid request format',
        code: 'INVALID_JSON',
        requestId: expect.any(String),
      })
    })
  })

  describe('Update Operations (PUT)', () => {
    it('should update message with reactions atomically', async () => {
      const requestBody = {
        messageId: 'msg-existing',
        message: {
          name: 'Updated Message Name',
          body: { text: 'Updated body text' }
        },
        reactions: [
          {
            buttonId: 'btn-updated',
            reaction: { type: 'emoji', value: '✨' }
          }
        ]
      }

      const mockExistingMessage = {
        id: 'msg-existing',
        name: 'Original Message',
        type: 'button',
        bodyText: 'Original body',
        createdById: 'user-123',
      }

      const mockUpdatedMessage = {
        ...mockExistingMessage,
        name: 'Updated Message Name',
        bodyText: 'Updated body text',
        updatedAt: new Date(),
      }

      const mockUpdatedReaction = {
        id: 'reaction-updated',
        buttonId: 'btn-updated',
        messageId: 'msg-existing',
        emoji: '✨',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockExistingMessage)

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          interactiveMessage: {
            update: jest.fn().mockResolvedValue(mockUpdatedMessage),
          },
          buttonReactionMapping: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockResolvedValue(mockUpdatedReaction),
          },
        }
        return await callback(mockTx)
      })

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await PUT(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData).toMatchObject({
        success: true,
        messageId: 'msg-existing',
        reactionIds: ['reaction-updated'],
        message: expect.objectContaining({
          id: 'msg-existing',
          name: 'Updated Message Name',
        }),
        reactions: expect.arrayContaining([
          expect.objectContaining({
            id: 'reaction-updated',
            buttonId: 'btn-updated',
            type: 'emoji',
            emoji: '✨',
          }),
        ]),
      })
    })

    it('should handle update of non-existent message', async () => {
      const requestBody = {
        messageId: 'non-existent-msg',
        message: {
          name: 'Updated Message'
        },
        reactions: []
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await PUT(request)
      const responseData = await response.json()

      expect(response.status).toBe(404)
      expect(responseData).toMatchObject({
        error: 'Message not found or access denied',
      })
    })

    it('should require messageId for updates', async () => {
      const requestBody = {
        // Missing messageId
        message: {
          name: 'Updated Message'
        },
        reactions: []
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await PUT(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData).toMatchObject({
        error: 'messageId is required for updates',
      })
    })
  })

  describe('Retrieval Operations (GET)', () => {
    it('should retrieve specific message with reactions', async () => {
      const mockMessage = {
        id: 'msg-123',
        name: 'Test Message',
        type: 'button',
        bodyText: 'Test body',
        headerType: null,
        headerContent: null,
        footerText: 'Test footer',
        actionData: { buttons: [{ id: 'btn-1', title: 'Button 1' }] },
        latitude: null,
        longitude: null,
        locationName: null,
        locationAddress: null,
        reactionEmoji: null,
        targetMessageId: null,
        stickerMediaId: null,
        stickerUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        buttonReactions: [
          {
            id: 'reaction-1',
            buttonId: 'btn-1',
            messageId: 'msg-123',
            emoji: '👍',
            description: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'user-123',
          }
        ]
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?messageId=msg-123')

      const response = await GET(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData).toMatchObject({
        success: true,
        message: expect.objectContaining({
          id: 'msg-123',
          name: 'Test Message',
          type: 'button',
        }),
        reactions: expect.arrayContaining([
          expect.objectContaining({
            id: 'reaction-1',
            buttonId: 'btn-1',
            type: 'emoji',
            emoji: '👍',
          }),
        ]),
      })
    })

    it('should retrieve all messages for an inbox', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          name: 'Message 1',
          type: 'button',
          bodyText: 'Body 1',
          headerType: null,
          headerContent: null,
          footerText: null,
          actionData: null,
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          buttonReactions: []
        },
        {
          id: 'msg-2',
          name: 'Message 2',
          type: 'list',
          bodyText: 'Body 2',
          headerType: null,
          headerContent: null,
          footerText: null,
          actionData: null,
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          buttonReactions: [
            {
              id: 'reaction-2',
              buttonId: 'btn-2',
              messageId: 'msg-2',
              emoji: null,
              description: 'Text reaction',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'user-123',
            }
          ]
        }
      ]

      mockPrisma.interactiveMessage.findMany.mockResolvedValue(mockMessages)

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?inboxId=caixa-123')

      const response = await GET(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData).toMatchObject({
        success: true,
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'msg-1',
            name: 'Message 1',
            reactions: [],
          }),
          expect.objectContaining({
            id: 'msg-2',
            name: 'Message 2',
            reactions: expect.arrayContaining([
              expect.objectContaining({
                id: 'reaction-2',
                buttonId: 'btn-2',
                type: 'text',
                textReaction: 'Text reaction',
              }),
            ]),
          }),
        ]),
      })
    })

    it('should handle missing query parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions')

      const response = await GET(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData).toMatchObject({
        error: 'Either messageId or inboxId is required',
      })
    })

    it('should handle non-existent message', async () => {
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?messageId=non-existent')

      const response = await GET(request)
      const responseData = await response.json()

      expect(response.status).toBe(404)
      expect(responseData).toMatchObject({
        error: 'Message not found or access denied',
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors', async () => {
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Connection timeout'))

      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: []
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData).toMatchObject({
        error: 'Database error',
        code: 'DATABASE_ERROR',
        requestId: expect.any(String),
      })
    })

    it('should handle foreign key constraint violations', async () => {
      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: [
          {
            buttonId: 'invalid-btn-ref',
            reaction: { type: 'emoji', value: '👍' }
          }
        ]
      }

      mockPrisma.$transaction.mockRejectedValue(new Error('Foreign key constraint failed'))

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData).toMatchObject({
        error: 'Invalid reference data',
        code: 'DATABASE_FOREIGN_KEY_VIOLATION',
        details: 'Referenced data does not exist',
        requestId: expect.any(String),
      })
    })

    it('should handle unexpected server errors', async () => {
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Unexpected error'))

      const requestBody = {
        inboxId: 'caixa-123',
        message: {
          name: 'Test Message',
          type: 'button',
          body: { text: 'Test body' }
        },
        reactions: []
      }

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData).toMatchObject({
        error: 'Database error',
        code: 'DATABASE_ERROR',
        requestId: expect.any(String),
      })
    })

    it('should handle large payloads efficiently', async () => {
      const largeMessage = {
        inboxId: 'caixa-123',
        message: {
          name: 'Large Message Test',
          type: 'button',
          body: {
            text: 'A'.repeat(1000) // Large body text
          },
          action: {
            buttons: Array.from({ length: 20 }, (_, i) => ({
              id: `btn-${i}`,
              title: `Button ${i}`,
              type: 'reply'
            }))
          }
        },
        reactions: Array.from({ length: 20 }, (_, i) => ({
          buttonId: `btn-${i}`,
          reaction: { type: 'emoji', value: '🔥' }
        }))
      }

      const mockSavedMessage = {
        id: 'msg-large',
        name: 'Large Message Test',
        type: 'button',
        bodyText: largeMessage.message.body.text,
        actionData: largeMessage.message.action,
        headerType: null,
        headerContent: null,
        footerText: null,
        latitude: null,
        longitude: null,
        locationName: null,
        locationAddress: null,
        reactionEmoji: null,
        targetMessageId: null,
        stickerMediaId: null,
        stickerUrl: null,
        inboxId: 'caixa-123',
        createdById: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockSavedReactions = Array.from({ length: 20 }, (_, i) => ({
        id: `reaction-${i}`,
        buttonId: `btn-${i}`,
        messageId: 'msg-large',
        emoji: '🔥',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      }))

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          interactiveMessage: {
            create: jest.fn().mockResolvedValue(mockSavedMessage),
          },
          buttonReactionMapping: {
            create: jest.fn().mockImplementation((data) => {
              const index = mockSavedReactions.findIndex(r => r.buttonId === data.data.buttonId)
              return Promise.resolve(mockSavedReactions[index])
            }),
          },
        }
        return await callback(mockTx)
      })

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
        method: 'POST',
        body: JSON.stringify(largeMessage),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const startTime = Date.now()
      const response = await POST(request)
      const processingTime = Date.now() - startTime
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.reactionIds).toHaveLength(20)
      
      // Should process within reasonable time (adjust threshold as needed)
      expect(processingTime).toBeLessThan(5000) // 5 seconds
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent requests safely', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        inboxId: 'caixa-123',
        message: {
          name: `Concurrent Message ${i}`,
          type: 'button',
          body: { text: `Concurrent body ${i}` }
        },
        reactions: [
          {
            buttonId: `concurrent-btn-${i}`,
            reaction: { type: 'emoji', value: '⚡' }
          }
        ]
      }))

      // Mock successful responses for all requests
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          interactiveMessage: {
            create: jest.fn().mockImplementation((data) => Promise.resolve({
              id: `msg-concurrent-${Date.now()}-${Math.random()}`,
              ...data.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
          buttonReactionMapping: {
            create: jest.fn().mockImplementation((data) => Promise.resolve({
              id: `reaction-concurrent-${Date.now()}-${Math.random()}`,
              ...data.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
        }
        return await callback(mockTx)
      })

      const promises = requests.map(requestBody => {
        const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json',
          },
        })
        return POST(request)
      })

      const responses = await Promise.all(promises)
      const responsesData = await Promise.all(responses.map(r => r.json()))

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      responsesData.forEach((data, index) => {
        expect(data.success).toBe(true)
        expect(data.message.name).toBe(`Concurrent Message ${index}`)
      })

      // Verify all transactions were called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(5)
    })
  })
})