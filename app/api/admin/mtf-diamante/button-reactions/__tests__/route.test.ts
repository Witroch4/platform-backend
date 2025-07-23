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

describe('/api/admin/mtf-diamante/button-reactions', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  }

  const mockSession = {
    user: mockUser,
  }

  const mockReaction = {
    id: 'reaction-123',
    buttonId: 'button-123',
    messageId: 'message-123',
    emoji: '👍',
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
    message: {
      id: 'message-123',
      name: 'Test Message',
      type: 'button',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
  })

  describe('GET', () => {
    it('should return unauthorized when no session', async () => {
      mockAuth.mockResolvedValue(null)
      
      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Não autorizado')
    })

    it('should get reaction by ID', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=reaction-123')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reaction.id).toBe('reaction-123')
      expect(mockPrisma.buttonReactionMapping.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'reaction-123',
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: 'user-123',
              },
            },
          },
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
      })
    })

    it('should get reaction by button ID', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?buttonId=button-123')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reaction.buttonId).toBe('button-123')
    })

    it('should get reactions by message ID', async () => {
      mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction])

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?messageId=message-123')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reactions).toHaveLength(1)
      expect(data.reactions[0].messageId).toBe('message-123')
    })

    it('should get all user reactions with pagination', async () => {
      mockPrisma.buttonReactionMapping.findMany.mockResolvedValue([mockReaction])
      mockPrisma.buttonReactionMapping.count.mockResolvedValue(1)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?page=1&limit=10')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reactions).toHaveLength(1)
      expect(data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      })
    })

    it('should return 404 when reaction not found', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(null)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=nonexistent')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Reação não encontrada ou acesso negado')
    })
  })

  describe('POST', () => {
    it('should create a new reaction', async () => {
      const mockMessage = {
        id: 'message-123',
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(null)
      mockPrisma.buttonReactionMapping.create.mockResolvedValue(mockReaction)

      const requestBody = {
        buttonId: 'button-123',
        messageId: 'message-123',
        reaction: {
          type: 'emoji',
          value: '👍',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reaction.buttonId).toBe('button-123')
      expect(data.message).toBe('Reação criada com sucesso')
    })

    it('should handle bulk creation (legacy support)', async () => {
      const mockMessage = {
        id: 'message-123',
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          buttonReactionMapping: {
            deleteMany: jest.fn(),
            create: jest.fn().mockResolvedValue(mockReaction),
          },
        })
      })

      const requestBody = {
        messageId: 'message-123',
        reactions: [
          {
            buttonId: 'button-123',
            reaction: {
              type: 'emoji',
              value: '👍',
            },
          },
        ],
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Reações configuradas com sucesso')
    })

    it('should return 409 when reaction already exists', async () => {
      const mockMessage = {
        id: 'message-123',
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(mockReaction)

      const requestBody = {
        buttonId: 'button-123',
        messageId: 'message-123',
        reaction: {
          type: 'emoji',
          value: '👍',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('Já existe uma reação configurada para este botão')
    })

    it('should return 400 for invalid data', async () => {
      const requestBody = {
        buttonId: '', // Invalid empty buttonId
        reaction: {
          type: 'emoji',
          value: '👍',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Dados de reação inválidos')
    })
  })

  describe('PUT', () => {
    it('should update an existing reaction', async () => {
      const updatedReaction = {
        ...mockReaction,
        emoji: '❤️',
      }

      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.update.mockResolvedValue(updatedReaction)

      const requestBody = {
        id: 'reaction-123',
        reaction: {
          type: 'emoji',
          value: '❤️',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reaction.emoji).toBe('❤️')
      expect(data.message).toBe('Reação atualizada com sucesso')
    })

    it('should return 404 when reaction not found', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(null)

      const requestBody = {
        id: 'nonexistent',
        reaction: {
          type: 'emoji',
          value: '❤️',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Reação não encontrada ou acesso negado')
    })

    it('should return 409 when updating to conflicting buttonId', async () => {
      const conflictingReaction = {
        ...mockReaction,
        id: 'other-reaction',
        buttonId: 'button-456',
      }

      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(conflictingReaction)

      const requestBody = {
        id: 'reaction-123',
        buttonId: 'button-456', // This buttonId already exists
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('Já existe uma reação configurada para este botão')
    })
  })

  describe('DELETE', () => {
    it('should delete reaction by ID (hard delete)', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.delete.mockResolvedValue(mockReaction)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=reaction-123')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Reação removida permanentemente')
      expect(mockPrisma.buttonReactionMapping.delete).toHaveBeenCalledWith({
        where: { id: 'reaction-123' },
      })
    })

    it('should soft delete reaction by ID', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.update.mockResolvedValue({
        ...mockReaction,
        isActive: false,
      })

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=reaction-123&soft=true')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Reação desativada com sucesso')
      expect(mockPrisma.buttonReactionMapping.update).toHaveBeenCalledWith({
        where: { id: 'reaction-123' },
        data: { isActive: false },
      })
    })

    it('should delete reaction by button ID', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(mockReaction)
      mockPrisma.buttonReactionMapping.delete.mockResolvedValue(mockReaction)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?buttonId=button-123')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Reação do botão removida')
    })

    it('should delete all reactions for a message', async () => {
      const mockMessage = {
        id: 'message-123',
        name: 'Test Message',
        type: 'button',
      }

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage)
      mockPrisma.buttonReactionMapping.deleteMany.mockResolvedValue({ count: 2 })

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?messageId=message-123')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('2 reações removidas')
      expect(data.count).toBe(2)
    })

    it('should return 404 when reaction not found', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockResolvedValue(null)

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=nonexistent')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Reação não encontrada ou acesso negado')
    })

    it('should return 400 when no identifier provided', async () => {
      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions')
      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('id, buttonId ou messageId é obrigatório')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.buttonReactionMapping.findFirst.mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions?id=reaction-123')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Erro interno do servidor')
    })

    it('should handle unique constraint violations', async () => {
      const error = new Error('Unique constraint failed')
      mockPrisma.buttonReactionMapping.create.mockRejectedValue(error)
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue({ id: 'message-123' })
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValue(null)

      const requestBody = {
        buttonId: 'button-123',
        messageId: 'message-123',
        reaction: {
          type: 'emoji',
          value: '👍',
        },
      }

      const request = new NextRequest('http://localhost/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('Já existe uma reação para este botão')
    })
  })
})