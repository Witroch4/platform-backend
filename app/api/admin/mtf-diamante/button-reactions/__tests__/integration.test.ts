import { NextRequest } from 'next/server'
import { GET, POST, PUT, DELETE } from '../route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    buttonReactionMapping: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    interactiveMessage: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockPrisma = prisma as any

describe('Button Reactions Integration Tests', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  }

  const mockSession = {
    user: mockUser,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
  })

  describe('Cascade Delete Logic', () => {
    it('should delete all reactions when message is deleted', async () => {
      const messageId = 'message-123'
      const mockMessage = {
        id: messageId,
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.deleteMany.mockResolvedValue({ count: 3 })

      const request = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?messageId=${messageId}`)
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.count).toBe(3)
      expect(data.message).toBe('3 reações removidas')
      expect(mockPrisma.buttonReactionMapping.deleteMany).toHaveBeenCalledWith({
        where: { messageId },
      })
    })

    it('should soft delete all reactions when message is soft deleted', async () => {
      const messageId = 'message-123'
      const mockMessage = {
        id: messageId,
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.updateMany.mockResolvedValue({ count: 2 })

      const request = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?messageId=${messageId}&soft=true`)
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.count).toBe(2)
      expect(data.message).toBe('2 reações desativadas')
      expect(mockPrisma.buttonReactionMapping.updateMany).toHaveBeenCalledWith({
        where: { messageId },
        data: { isActive: false },
      })
    })
  })

  describe('CRUD Workflow Integration', () => {
    it('should handle complete CRUD workflow', async () => {
      const buttonId = 'button-123'
      const messageId = 'message-123'
      const reactionId = 'reaction-123'

      const mockMessage = {
        id: messageId,
        name: 'Test Message',
        type: 'button',
      }

      const mockReaction = {
        id: reactionId,
        buttonId,
        messageId,
        emoji: '👍',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
        message: mockMessage,
      }

      // Step 1: Create reaction
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(null)
      mockPrisma.buttonReactionMapping.create.mockResolvedValue(mockReaction)

      const createRequest = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify({
          buttonId,
          messageId,
          reaction: {
            type: 'emoji',
            value: '👍',
          },
        }),
      })

      const createResponse = await POST(createRequest)
      const createData = await createResponse.json()

      expect(createResponse.status).toBe(200)
      expect(createData.success).toBe(true)
      expect(createData.reaction.buttonId).toBe(buttonId)

      // Step 2: Read reaction
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)

      const readRequest = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?id=${reactionId}`)
      const readResponse = await GET(readRequest)
      const readData = await readResponse.json()

      expect(readResponse.status).toBe(200)
      expect(readData.success).toBe(true)
      expect(readData.reaction.id).toBe(reactionId)

      // Step 3: Update reaction
      const updatedReaction = {
        ...mockReaction,
        emoji: '❤️',
      }

      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(null)
      mockPrisma.buttonReactionMapping.update.mockResolvedValue(updatedReaction)

      const updateRequest = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'PUT',
        body: JSON.stringify({
          id: reactionId,
          reaction: {
            type: 'emoji',
            value: '❤️',
          },
        }),
      })

      const updateResponse = await PUT(updateRequest)
      const updateData = await updateResponse.json()

      expect(updateResponse.status).toBe(200)
      expect(updateData.success).toBe(true)
      expect(updateData.reaction.emoji).toBe('❤️')

      // Step 4: Delete reaction
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(updatedReaction)
      mockPrisma.buttonReactionMapping.delete.mockResolvedValue(updatedReaction)

      const deleteRequest = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?id=${reactionId}`)
      const deleteResponse = await DELETE(deleteRequest)
      const deleteData = await deleteResponse.json()

      expect(deleteResponse.status).toBe(200)
      expect(deleteData.success).toBe(true)
      expect(deleteData.message).toBe('Reação removida permanentemente')
    })
  })

  describe('Authorization and Access Control', () => {
    it('should enforce user access control across all operations', async () => {
      const reactionId = 'reaction-123'
      const buttonId = 'button-123'
      const messageId = 'message-123'

      // Mock reaction that belongs to different user
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(null)
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(null)

      // Test GET with no access
      const getRequest = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?id=${reactionId}`)
      const getResponse = await GET(getRequest)
      expect(getResponse.status).toBe(404)

      // Test PUT with no access
      const putRequest = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'PUT',
        body: JSON.stringify({
          id: reactionId,
          reaction: { type: 'emoji', value: '👍' },
        }),
      })
      const putResponse = await PUT(putRequest)
      expect(putResponse.status).toBe(404)

      // Test DELETE with no access
      const deleteRequest = new NextRequest(`http://localhost/api/admin/mtf-diamante/button-reactions?id=${reactionId}`)
      const deleteResponse = await DELETE(deleteRequest)
      expect(deleteResponse.status).toBe(404)

      // Test POST with no message access
      const postRequest = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify({
          buttonId,
          messageId,
          reaction: { type: 'emoji', value: '👍' },
        }),
      })
      const postResponse = await POST(postRequest)
      expect(postResponse.status).toBe(404)
    })
  })

  describe('Data Consistency', () => {
    it('should maintain data consistency during bulk operations', async () => {
      const messageId = 'message-123'
      const mockMessage = {
        id: messageId,
        name: 'Test Message',
        type: 'button',
      }

      const reactions = [
        {
          buttonId: 'btn-1',
          reaction: { type: 'emoji', value: '👍' },
        },
        {
          buttonId: 'btn-2',
          reaction: { type: 'text', value: 'Thank you!' },
        },
      ]

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          buttonReactionMapping: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockImplementation((data) => ({
              id: `reaction-${data.data.buttonId}`,
              ...data.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
        }
        return await callback(mockTx)
      })

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          reactions,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reactions).toHaveLength(2)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('should handle validation errors properly', async () => {
      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify({
          buttonId: '', // Invalid empty buttonId
          reaction: { type: 'emoji', value: '👍' },
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Dados de reação inválidos')
      expect(data.details).toBeDefined()
    })
  })
})