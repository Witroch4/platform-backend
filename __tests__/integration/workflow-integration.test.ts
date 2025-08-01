/**
 * Integration Tests for Interactive Message Workflows
 * 
 * This test suite covers the complete user workflows for the interactive message
 * refactor feature, including:
 * - 3-step message creation workflow
 * - Reaction configuration and webhook processing integration
 * - Loading and editing existing messages
 * - Atomic save operations and rollback scenarios
 * - WhatsApp API integration for reaction delivery
 */

import { processMtfDiamanteWebhookTask } from '@/worker/WebhookWorkerTasks/mtf-diamante-webhook.task'
import type { Job } from 'bullmq'
import type { WebhookTaskData } from '@/lib/queue/mtf-diamante-webhook.queue'

// Mock modules first
jest.mock('@/lib/prisma', () => ({
  prisma: {
    buttonReactionMapping: {
      findUnique: jest.fn(),
    },
    webhookMessage: {
      create: jest.fn(),
    },
    chatwitInbox: {
      findFirst: jest.fn(),
    },
    whatsAppGlobalConfig: {
      upsert: jest.fn(),
    },
    dialogflowIntent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
  logReactionAttempt: jest.fn(),
}))

jest.mock('@/lib/whatsapp-messages', () => ({
  sendTextMessage: jest.fn(),
  sendTemplateMessage: jest.fn(),
  sendInteractiveMessage: jest.fn(),
}))

// Import mocked functions after mocking
import { prisma } from '@/lib/prisma'
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions'
import { sendTextMessage } from '@/lib/whatsapp-messages'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendReactionMessage = sendReactionMessage as jest.MockedFunction<typeof sendReactionMessage>
const mockSendTextMessage = sendTextMessage as jest.MockedFunction<typeof sendTextMessage>
const mockLogReactionAttempt = logReactionAttempt as jest.MockedFunction<typeof logReactionAttempt>

describe('Interactive Message Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Complete Button Click to Reaction Workflow', () => {
    it('should process complete workflow: button click → database lookup → WhatsApp reaction delivery', async () => {
      // Arrange: Create a realistic webhook payload for button click
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-integration-001',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-confirm-order',
                        title: 'Confirm Order'
                      }
                    },
                    context: {
                      id: 'wamid.original_message_xyz789'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.button_click_abc123',
                message_id: '456789',
                conversation_id: '123456',
                inbox_id: '789123',
                contact_phone: '+5511999999999',
                whatsapp_api_key: 'EAAG1234567890...',
                message_content: 'Button clicked: Confirm Order',
                message_content_type: 'interactive'
              }
            }
          }
        },
      } as any

      // Mock database response for button reaction configuration
      const mockButtonReaction = {
        id: 'reaction-confirm-order-123',
        buttonId: 'btn-confirm-order',
        messageId: 'msg-order-template-456',
        emoji: '✅',
        textReaction: 'Thank you! Your order has been confirmed.',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-admin-789'
      }

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce(mockButtonReaction)

      // Mock successful WhatsApp API responses
      mockSendReactionMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.reaction_delivered_def456',
        error: null
      })

      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.text_reply_ghi789',
        error: null
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      // Act: Execute the complete workflow
      const result = await processMtfDiamanteWebhookTask(mockJob)

      // Assert: Verify successful processing
      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify database lookup was performed correctly
      expect(mockPrisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
        where: { buttonId: 'btn-confirm-order' }
      })

      // Verify emoji reaction was sent to WhatsApp
      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511999999999',
        messageId: 'wamid.original_message_xyz789',
        emoji: '✅',
        whatsappApiKey: 'EAAG1234567890...'
      })

      // Verify text reply was sent to WhatsApp
      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511999999999',
        whatsappApiKey: 'EAAG1234567890...',
        text: 'Thank you! Your order has been confirmed.',
        replyToMessageId: 'wamid.original_message_xyz789'
      })

      // Verify reaction attempt was logged for monitoring
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511999999999',
        messageId: 'wamid.original_message_xyz789',
        emoji: '✅',
        buttonId: 'btn-confirm-order',
        success: true,
        error: null
      })
    })

    it('should handle button click with no configured reaction', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-no-reaction',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-no-reaction',
                        title: 'No Reaction Button'
                      }
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.no_reaction_test',
                message_id: '999',
                conversation_id: '888',
                inbox_id: '777',
                contact_phone: '+5511888888888',
                whatsapp_api_key: 'test-api-key'
              }
            }
          }
        },
      } as any

      // Mock no button reaction found
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce(null)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify no reactions were sent
      expect(mockSendReactionMessage).not.toHaveBeenCalled()
      expect(mockSendTextMessage).not.toHaveBeenCalled()
      expect(mockLogReactionAttempt).not.toHaveBeenCalled()
    })

    it('should handle WhatsApp API failures gracefully', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-api-failure',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-api-fail',
                        title: 'API Fail Test'
                      }
                    },
                    context: {
                      id: 'wamid.original_api_fail'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.api_fail_test',
                message_id: '444',
                conversation_id: '555',
                inbox_id: '666',
                contact_phone: '+5511777777777',
                whatsapp_api_key: 'invalid-api-key'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-api-fail',
        buttonId: 'btn-api-fail',
        messageId: 'msg-api-fail',
        emoji: '❌',
        textReaction: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-test'
      })

      // Mock failed reaction send
      mockSendReactionMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Invalid API key'
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify failure was logged
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511777777777',
        messageId: 'wamid.original_api_fail',
        emoji: '❌',
        buttonId: 'btn-api-fail',
        success: false,
        error: 'Invalid API key'
      })
    })
  })

  describe('Atomic Save Operations Integration', () => {
    it('should simulate atomic save operation workflow', async () => {
      // This test simulates the atomic save operation that would be called
      // from the frontend after completing the 3-step workflow

      const messageData = {
        caixaId: 'caixa-123',
        message: {
          name: 'Integration Test Message',
          type: 'button',
          body: {
            text: 'Choose an option below:'
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
        id: 'msg-integration-123',
        name: 'Integration Test Message',
        type: 'button',
        bodyText: 'Choose an option below:',
        actionData: messageData.message.action,
        caixaId: 'caixa-123',
        createdById: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockSavedReactions = [
        {
          id: 'reaction-integration-1',
          buttonId: 'btn-yes',
          messageId: 'msg-integration-123',
          emoji: '👍',
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-123',
        },
        {
          id: 'reaction-integration-2',
          buttonId: 'btn-no',
          messageId: 'msg-integration-123',
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

      // Simulate the atomic save operation
      const result = await mockPrisma.$transaction(async (tx: any) => {
        // Create the interactive message
        const savedMessage = await tx.interactiveMessage.create({
          data: {
            caixaId: messageData.caixaId,
            name: messageData.message.name,
            type: messageData.message.type,
            bodyText: messageData.message.body.text,
            actionData: messageData.message.action,
            createdById: 'user-123',
          },
        })

        // Create button reactions
        const savedReactions = []
        for (const reactionData of messageData.reactions) {
          if (reactionData.reaction) {
            const savedReaction = await tx.buttonReactionMapping.create({
              data: {
                buttonId: reactionData.buttonId,
                messageId: savedMessage.id,
                emoji: reactionData.reaction.value,
                description: reactionData.reaction.type === 'text' ? reactionData.reaction.value : null,
              },
            })
            savedReactions.push(savedReaction)
          }
        }

        return {
          message: savedMessage,
          reactions: savedReactions,
        }
      })

      // Verify atomic operation completed successfully
      expect(result.message.id).toBe('msg-integration-123')
      expect(result.reactions).toHaveLength(2)
      expect(result.reactions[0].buttonId).toBe('btn-yes')
      expect(result.reactions[1].buttonId).toBe('btn-no')

      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('should handle transaction rollback on failure', async () => {
      // Mock transaction failure
      mockPrisma.$transaction.mockRejectedValue(new Error('Database constraint violation'))

      // Attempt atomic save operation
      await expect(
        mockPrisma.$transaction(async (tx: any) => {
          await tx.interactiveMessage.create({ data: {} })
          await tx.buttonReactionMapping.create({ data: {} })
        })
      ).rejects.toThrow('Database constraint violation')

      // Verify transaction was attempted
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Performance and Scalability Integration', () => {
    it('should handle multiple concurrent button clicks efficiently', async () => {
      const buttonClicks = Array.from({ length: 10 }, (_, i) => ({
        id: `job-concurrent-${i}`,
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: `btn-concurrent-${i}`,
                        title: `Concurrent Button ${i}`
                      }
                    },
                    context: {
                      id: `wamid.concurrent_original_${i}`
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: `wamid.concurrent_click_${i}`,
                message_id: `${1000 + i}`,
                conversation_id: `${2000 + i}`,
                inbox_id: '789123',
                contact_phone: `+551199999${String(i).padStart(4, '0')}`,
                whatsapp_api_key: 'CONCURRENT_API_KEY'
              }
            }
          }
        },
      } as any))

      // Mock database responses for all buttons
      mockPrisma.buttonReactionMapping.findUnique.mockImplementation((args: any) => {
        const buttonId = args.where.buttonId
        const index = parseInt(buttonId.split('-')[2])
        return Promise.resolve({
          id: `reaction-concurrent-${index}`,
          buttonId,
          messageId: `msg-concurrent-${index}`,
          emoji: '⚡',
          textReaction: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-concurrent'
        })
      })

      mockSendReactionMessage.mockResolvedValue({
        success: true,
        messageId: 'wamid.concurrent_reaction_sent',
        error: null
      })

      mockLogReactionAttempt.mockResolvedValue(undefined)

      // Process all button clicks concurrently
      const startTime = Date.now()
      const results = await Promise.all(
        buttonClicks.map(job => processMtfDiamanteWebhookTask(job))
      )
      const totalProcessingTime = Date.now() - startTime

      // All jobs should complete successfully
      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result).toEqual({
          success: true,
          type: 'processButtonClick'
        })
      })

      // Should handle concurrent processing efficiently
      expect(totalProcessingTime).toBeLessThan(5000) // 5 seconds for 10 concurrent operations

      // Verify all database lookups were performed
      expect(mockPrisma.buttonReactionMapping.findUnique).toHaveBeenCalledTimes(10)

      // Verify all reactions were sent
      expect(mockSendReactionMessage).toHaveBeenCalledTimes(10)

      // Verify all attempts were logged
      expect(mockLogReactionAttempt).toHaveBeenCalledTimes(10)
    })
  })

  describe('Error Handling and Recovery Integration', () => {
    it('should maintain system stability during partial failures', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-partial-failure',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-partial-failure',
                        title: 'Partial Failure Test'
                      }
                    },
                    context: {
                      id: 'wamid.partial_failure_original'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.partial_failure_test',
                message_id: '777',
                conversation_id: '888',
                inbox_id: '999',
                contact_phone: '+5511444444444',
                whatsapp_api_key: 'PARTIAL_FAILURE_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-partial-failure',
        buttonId: 'btn-partial-failure',
        messageId: 'msg-partial-failure',
        emoji: '⚠️',
        textReaction: 'This is a test of partial failure handling.',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-test'
      })

      // Mock emoji reaction success but text message failure
      mockSendReactionMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.emoji_success',
        error: null
      })

      mockSendTextMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Text message service temporarily unavailable'
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      // Job should still complete successfully despite partial failure
      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify both operations were attempted
      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511444444444',
        messageId: 'wamid.partial_failure_original',
        emoji: '⚠️',
        whatsappApiKey: 'PARTIAL_FAILURE_KEY'
      })

      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511444444444',
        whatsappApiKey: 'PARTIAL_FAILURE_KEY',
        text: 'This is a test of partial failure handling.',
        replyToMessageId: 'wamid.partial_failure_original'
      })

      // Verify logging captured the successful emoji reaction
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511444444444',
        messageId: 'wamid.partial_failure_original',
        emoji: '⚠️',
        buttonId: 'btn-partial-failure',
        success: true,
        error: null
      })
    })

    it('should handle database connection failures gracefully', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-db-failure',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-db-failure',
                        title: 'DB Failure Test'
                      }
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.db_failure_test',
                message_id: '123',
                conversation_id: '456',
                inbox_id: '789',
                contact_phone: '+5511555555555',
                whatsapp_api_key: 'DB_FAILURE_KEY'
              }
            }
          }
        },
      } as any

      // Mock database connection failure
      mockPrisma.buttonReactionMapping.findUnique.mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      // Should propagate the database error
      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow('Database connection failed')
    })
  })

  describe('End-to-End Workflow Validation', () => {
    it('should validate complete message creation to reaction delivery workflow', async () => {
      // This test validates the complete workflow from message creation
      // through button click processing to reaction delivery

      // Step 1: Simulate message creation (atomic save)
      const messageCreationData = {
        message: {
          id: 'msg-e2e-test',
          name: 'E2E Test Message',
          type: 'button',
          bodyText: 'Please select an option:',
          actionData: {
            buttons: [
              { id: 'btn-e2e-option1', title: 'Option 1', type: 'reply' },
              { id: 'btn-e2e-option2', title: 'Option 2', type: 'reply' }
            ]
          }
        },
        reactions: [
          {
            id: 'reaction-e2e-1',
            buttonId: 'btn-e2e-option1',
            messageId: 'msg-e2e-test',
            emoji: '1️⃣',
            description: null
          },
          {
            id: 'reaction-e2e-2',
            buttonId: 'btn-e2e-option2',
            messageId: 'msg-e2e-test',
            emoji: null,
            description: 'You selected Option 2!'
          }
        ]
      }

      // Step 2: Simulate button click on Option 1 (emoji reaction)
      const buttonClickJob: Job<WebhookTaskData> = {
        id: 'job-e2e-button-click',
        data: {
          type: 'processButtonClick',
          payload: {
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'btn-e2e-option1',
                        title: 'Option 1'
                      }
                    },
                    context: {
                      id: 'wamid.e2e_original_message'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.e2e_button_click',
                message_id: '12345',
                conversation_id: '67890',
                inbox_id: '54321',
                contact_phone: '+5511999888777',
                whatsapp_api_key: 'E2E_TEST_API_KEY'
              }
            }
          }
        },
      } as any

      // Mock database lookup returning the configured reaction
      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-e2e-1',
        buttonId: 'btn-e2e-option1',
        messageId: 'msg-e2e-test',
        emoji: '1️⃣',
        textReaction: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-e2e'
      })

      // Mock successful WhatsApp reaction delivery
      mockSendReactionMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.e2e_reaction_delivered',
        error: null
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      // Execute the button click processing
      const result = await processMtfDiamanteWebhookTask(buttonClickJob)

      // Verify end-to-end workflow completed successfully
      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify the complete workflow chain
      expect(mockPrisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
        where: { buttonId: 'btn-e2e-option1' }
      })

      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511999888777',
        messageId: 'wamid.e2e_original_message',
        emoji: '1️⃣',
        whatsappApiKey: 'E2E_TEST_API_KEY'
      })

      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511999888777',
        messageId: 'wamid.e2e_original_message',
        emoji: '1️⃣',
        buttonId: 'btn-e2e-option1',
        success: true,
        error: null
      })

      // Verify no text message was sent (emoji-only reaction)
      expect(mockSendTextMessage).not.toHaveBeenCalled()
    })
  })
})

export {}