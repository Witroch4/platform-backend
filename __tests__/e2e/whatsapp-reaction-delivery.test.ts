import { processMtfDiamanteWebhookTask } from '@/worker/WebhookWorkerTasks/mtf-diamante-webhook.task'
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions'
import { sendTextMessage } from '@/lib/whatsapp-messages'
import { prisma } from '@/lib/prisma'
import type { Job } from 'bullmq'
import type { WebhookTaskData } from '@/lib/queue/mtf-diamante-webhook.queue'

// Mock external dependencies but keep business logic intact
jest.mock('@/lib/whatsapp-reactions')
jest.mock('@/lib/whatsapp-messages')
jest.mock('@/lib/prisma')

const mockSendReactionMessage = sendReactionMessage as jest.MockedFunction<typeof sendReactionMessage>
const mockSendTextMessage = sendTextMessage as jest.MockedFunction<typeof sendTextMessage>
const mockLogReactionAttempt = logReactionAttempt as jest.MockedFunction<typeof logReactionAttempt>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('WhatsApp Reaction Delivery - End-to-End Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Complete Reaction Flow Integration', () => {
    it('should process complete workflow: button click → reaction lookup → WhatsApp delivery', async () => {
      // Simulate a real WhatsApp webhook payload for button click
      const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15551234567',
                    phone_number_id: '987654321'
                  },
                  contacts: [
                    {
                      profile: {
                        name: 'John Doe'
                      },
                      wa_id: '5511999999999'
                    }
                  ],
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamid.button_click_abc123',
                      timestamp: '1703123456',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'btn-confirm-order',
                          title: 'Confirm Order'
                        }
                      },
                      context: {
                        from: '15551234567',
                        id: 'wamid.original_message_xyz789'
                      }
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      }

      // Simulate Chatwoot/Dialogflow processed payload
      const processedPayload = {
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
        },
        queryResult: {
          intent: {
            displayName: 'button.click.confirm_order'
          }
        },
        // Include the original WhatsApp webhook data
        ...webhookPayload
      }

      const mockJob: Job<WebhookTaskData> = {
        id: 'job-e2e-001',
        data: {
          type: 'processButtonClick',
          payload: processedPayload
        },
      } as any

      // Mock database lookup for button reaction configuration
      const mockButtonReaction = {
        id: 'reaction-confirm-order-123',
        buttonId: 'btn-confirm-order',
        messageId: 'msg-order-template-456',
        emoji: '✅',
        textReaction: 'Thank you! Your order has been confirmed. We will process it shortly.',
        isActive: true,
        createdAt: new Date('2023-12-01T10:00:00Z'),
        updatedAt: new Date('2023-12-01T10:00:00Z'),
        createdBy: 'user-admin-789'
      }

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce(mockButtonReaction)

      // Mock successful WhatsApp API calls
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

      // Execute the complete workflow
      const startTime = Date.now()
      const result = await processMtfDiamanteWebhookTask(mockJob)
      const processingTime = Date.now() - startTime

      // Verify successful processing
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
        text: 'Thank you! Your order has been confirmed. We will process it shortly.',
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

      // Verify performance (should process quickly)
      expect(processingTime).toBeLessThan(1000) // 1 second
    })

    it('should handle WhatsApp API rate limiting gracefully', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-rate-limit-001',
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
                        id: 'btn-rate-limit-test',
                        title: 'Rate Limit Test'
                      }
                    },
                    context: {
                      id: 'wamid.original_rate_limit'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.rate_limit_test',
                message_id: '999',
                conversation_id: '888',
                inbox_id: '777',
                contact_phone: '+5511888888888',
                whatsapp_api_key: 'RATE_LIMITED_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-rate-limit',
        buttonId: 'btn-rate-limit-test',
        messageId: 'msg-rate-limit',
        emoji: '⏰',
        textReaction: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-test'
      })

      // Mock WhatsApp API rate limiting response
      mockSendReactionMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Rate limit exceeded. Please try again later.'
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify rate limit error was logged
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511888888888',
        messageId: 'wamid.original_rate_limit',
        emoji: '⏰',
        buttonId: 'btn-rate-limit-test',
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      })
    })

    it('should handle invalid WhatsApp phone numbers', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-invalid-phone-001',
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
                        id: 'btn-invalid-phone',
                        title: 'Invalid Phone Test'
                      }
                    },
                    context: {
                      id: 'wamid.original_invalid_phone'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.invalid_phone_test',
                message_id: '111',
                conversation_id: '222',
                inbox_id: '333',
                contact_phone: 'invalid-phone-number',
                whatsapp_api_key: 'VALID_API_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-invalid-phone',
        buttonId: 'btn-invalid-phone',
        messageId: 'msg-invalid-phone',
        emoji: '📞',
        textReaction: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-test'
      })

      // Mock WhatsApp API invalid phone number response
      mockSendReactionMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Invalid phone number format'
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify invalid phone error was logged
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: 'invalid-phone-number',
        messageId: 'wamid.original_invalid_phone',
        emoji: '📞',
        buttonId: 'btn-invalid-phone',
        success: false,
        error: 'Invalid phone number format'
      })
    })

    it('should handle expired WhatsApp message IDs', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-expired-msg-001',
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
                        id: 'btn-expired-msg',
                        title: 'Expired Message Test'
                      }
                    },
                    context: {
                      id: 'wamid.expired_message_very_old'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.expired_test',
                message_id: '444',
                conversation_id: '555',
                inbox_id: '666',
                contact_phone: '+5511777777777',
                whatsapp_api_key: 'VALID_API_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-expired-msg',
        buttonId: 'btn-expired-msg',
        messageId: 'msg-expired',
        emoji: '⏰',
        textReaction: 'This message has expired, but thank you for your response!',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-test'
      })

      // Mock WhatsApp API expired message response
      mockSendReactionMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Message not found or expired'
      })

      // Text message should still work
      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.fallback_text_message',
        error: null
      })

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify emoji reaction failed but text message succeeded
      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511777777777',
        messageId: 'wamid.expired_message_very_old',
        emoji: '⏰',
        whatsappApiKey: 'VALID_API_KEY'
      })

      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511777777777',
        whatsappApiKey: 'VALID_API_KEY',
        text: 'This message has expired, but thank you for your response!',
        replyToMessageId: 'wamid.expired_message_very_old'
      })

      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511777777777',
        messageId: 'wamid.expired_message_very_old',
        emoji: '⏰',
        buttonId: 'btn-expired-msg',
        success: false,
        error: 'Message not found or expired'
      })
    })
  })

  describe('Real-world Scenario Simulations', () => {
    it('should handle high-volume button clicks during peak hours', async () => {
      const buttonClicks = Array.from({ length: 50 }, (_, i) => ({
        id: `job-peak-${i}`,
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
                        id: `btn-peak-${i}`,
                        title: `Peak Button ${i}`
                      }
                    },
                    context: {
                      id: `wamid.peak_original_${i}`
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: `wamid.peak_click_${i}`,
                message_id: `${1000 + i}`,
                conversation_id: `${2000 + i}`,
                inbox_id: '789123',
                contact_phone: `+551199999${String(i).padStart(4, '0')}`,
                whatsapp_api_key: 'PEAK_HOURS_API_KEY'
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
          id: `reaction-peak-${index}`,
          buttonId,
          messageId: `msg-peak-${index}`,
          emoji: index % 2 === 0 ? '🚀' : null,
          textReaction: index % 2 === 1 ? `Peak response ${index}` : null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-peak'
        })
      })

      // Mock WhatsApp API responses with some failures to simulate real conditions
      mockSendReactionMessage.mockImplementation(async ({ recipientPhone }) => {
        const phoneIndex = parseInt(recipientPhone.slice(-4))
        // Simulate 10% failure rate
        if (phoneIndex % 10 === 0) {
          return {
            success: false,
            messageId: null,
            error: 'Temporary service unavailable'
          }
        }
        return {
          success: true,
          messageId: `wamid.peak_reaction_${phoneIndex}`,
          error: null
        }
      })

      mockSendTextMessage.mockImplementation(async ({ recipientPhone }) => {
        const phoneIndex = parseInt(recipientPhone.slice(-4))
        // Simulate 5% failure rate for text messages
        if (phoneIndex % 20 === 0) {
          return {
            success: false,
            messageId: null,
            error: 'Message delivery failed'
          }
        }
        return {
          success: true,
          messageId: `wamid.peak_text_${phoneIndex}`,
          error: null
        }
      })

      mockLogReactionAttempt.mockResolvedValue(undefined)

      // Process all button clicks concurrently
      const startTime = Date.now()
      const results = await Promise.all(
        buttonClicks.map(job => processMtfDiamanteWebhookTask(job))
      )
      const totalProcessingTime = Date.now() - startTime

      // All jobs should complete successfully (even if individual API calls fail)
      expect(results).toHaveLength(50)
      results.forEach(result => {
        expect(result).toEqual({
          success: true,
          type: 'processButtonClick'
        })
      })

      // Should handle high volume efficiently
      expect(totalProcessingTime).toBeLessThan(10000) // 10 seconds for 50 concurrent operations

      // Verify all database lookups were performed
      expect(mockPrisma.buttonReactionMapping.findUnique).toHaveBeenCalledTimes(50)

      // Verify logging was attempted for all operations
      expect(mockLogReactionAttempt).toHaveBeenCalledTimes(50)
    })

    it('should handle mixed message types in rapid succession', async () => {
      const mixedMessages = [
        // Button click with emoji reaction
        {
          id: 'job-mixed-1',
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
                          id: 'btn-mixed-emoji',
                          title: 'Emoji Button'
                        }
                      },
                      context: { id: 'wamid.mixed_original_1' }
                    }]
                  }
                }]
              }],
              originalDetectIntentRequest: {
                payload: {
                  wamid: 'wamid.mixed_1',
                  message_id: '1001',
                  conversation_id: '2001',
                  inbox_id: '3001',
                  contact_phone: '+5511111111111',
                  whatsapp_api_key: 'MIXED_API_KEY'
                }
              }
            }
          }
        },
        // List selection with text reaction
        {
          id: 'job-mixed-2',
          data: {
            type: 'processButtonClick',
            payload: {
              entry: [{
                changes: [{
                  value: {
                    messages: [{
                      type: 'interactive',
                      interactive: {
                        type: 'list_reply',
                        list_reply: {
                          id: 'list-mixed-text',
                          title: 'Text List Item'
                        }
                      },
                      context: { id: 'wamid.mixed_original_2' }
                    }]
                  }
                }]
              }],
              originalDetectIntentRequest: {
                payload: {
                  wamid: 'wamid.mixed_2',
                  message_id: '1002',
                  conversation_id: '2002',
                  inbox_id: '3002',
                  contact_phone: '+5511222222222',
                  whatsapp_api_key: 'MIXED_API_KEY'
                }
              }
            }
          }
        },
        // Button click with both emoji and text reactions
        {
          id: 'job-mixed-3',
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
                          id: 'btn-mixed-both',
                          title: 'Both Reactions'
                        }
                      },
                      context: { id: 'wamid.mixed_original_3' }
                    }]
                  }
                }]
              }],
              originalDetectIntentRequest: {
                payload: {
                  wamid: 'wamid.mixed_3',
                  message_id: '1003',
                  conversation_id: '2003',
                  inbox_id: '3003',
                  contact_phone: '+5511333333333',
                  whatsapp_api_key: 'MIXED_API_KEY'
                }
              }
            }
          }
        }
      ] as any[]

      // Mock different reaction configurations
      mockPrisma.buttonReactionMapping.findUnique
        .mockResolvedValueOnce({
          id: 'reaction-mixed-1',
          buttonId: 'btn-mixed-emoji',
          messageId: 'msg-mixed-1',
          emoji: '🎯',
          textReaction: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-mixed'
        })
        .mockResolvedValueOnce({
          id: 'reaction-mixed-2',
          buttonId: 'list-mixed-text',
          messageId: 'msg-mixed-2',
          emoji: null,
          textReaction: 'Thank you for your selection from the list!',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-mixed'
        })
        .mockResolvedValueOnce({
          id: 'reaction-mixed-3',
          buttonId: 'btn-mixed-both',
          messageId: 'msg-mixed-3',
          emoji: '🎉',
          textReaction: 'Congratulations! You have unlocked both reactions!',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-mixed'
        })

      // Mock successful WhatsApp API responses
      mockSendReactionMessage.mockResolvedValue({
        success: true,
        messageId: 'wamid.mixed_reaction_success',
        error: null
      })

      mockSendTextMessage.mockResolvedValue({
        success: true,
        messageId: 'wamid.mixed_text_success',
        error: null
      })

      mockLogReactionAttempt.mockResolvedValue(undefined)

      // Process all mixed messages
      const results = await Promise.all(
        mixedMessages.map(job => processMtfDiamanteWebhookTask(job))
      )

      // All should succeed
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toEqual({
          success: true,
          type: 'processButtonClick'
        })
      })

      // Verify correct API calls were made
      expect(mockSendReactionMessage).toHaveBeenCalledTimes(2) // First and third messages
      expect(mockSendTextMessage).toHaveBeenCalledTimes(2) // Second and third messages

      // Verify specific calls
      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511111111111',
        messageId: 'wamid.mixed_original_1',
        emoji: '🎯',
        whatsappApiKey: 'MIXED_API_KEY'
      })

      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511222222222',
        whatsappApiKey: 'MIXED_API_KEY',
        text: 'Thank you for your selection from the list!',
        replyToMessageId: 'wamid.mixed_original_2'
      })

      expect(mockSendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511333333333',
        messageId: 'wamid.mixed_original_3',
        emoji: '🎉',
        whatsappApiKey: 'MIXED_API_KEY'
      })

      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511333333333',
        whatsappApiKey: 'MIXED_API_KEY',
        text: 'Congratulations! You have unlocked both reactions!',
        replyToMessageId: 'wamid.mixed_original_3'
      })
    })

    it('should maintain data consistency during partial failures', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-partial-failure-001',
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

      // Job should still complete successfully
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
  })

  describe('Performance and Monitoring', () => {
    it('should provide comprehensive logging for monitoring and debugging', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-monitoring-001',
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
                        id: 'btn-monitoring',
                        title: 'Monitoring Test'
                      }
                    },
                    context: {
                      id: 'wamid.monitoring_original'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.monitoring_test',
                message_id: '12345',
                conversation_id: '67890',
                inbox_id: '54321',
                contact_phone: '+5511555555555',
                whatsapp_api_key: 'MONITORING_API_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-monitoring',
        buttonId: 'btn-monitoring',
        messageId: 'msg-monitoring',
        emoji: '📊',
        textReaction: 'Monitoring and logging test message.',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-monitoring'
      })

      mockSendReactionMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.monitoring_emoji_sent',
        error: null
      })

      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.monitoring_text_sent',
        error: null
      })

      // Capture logging calls
      const logCalls: any[] = []
      mockLogReactionAttempt.mockImplementation(async (logData) => {
        logCalls.push(logData)
      })

      // Spy on console.log to verify structured logging
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = await processMtfDiamanteWebhookTask(mockJob)

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      })

      // Verify comprehensive logging was performed
      expect(logCalls).toHaveLength(1)
      expect(logCalls[0]).toEqual({
        recipientPhone: '+5511555555555',
        messageId: 'wamid.monitoring_original',
        emoji: '📊',
        buttonId: 'btn-monitoring',
        success: true,
        error: null
      })

      // Verify structured console logging occurred
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MTF Diamante Webhook Worker]'),
        expect.any(Object)
      )

      consoleSpy.mockRestore()
    })

    it('should handle timeout scenarios gracefully', async () => {
      const mockJob: Job<WebhookTaskData> = {
        id: 'job-timeout-001',
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
                        id: 'btn-timeout',
                        title: 'Timeout Test'
                      }
                    },
                    context: {
                      id: 'wamid.timeout_original'
                    }
                  }]
                }
              }]
            }],
            originalDetectIntentRequest: {
              payload: {
                wamid: 'wamid.timeout_test',
                message_id: '99999',
                conversation_id: '88888',
                inbox_id: '77777',
                contact_phone: '+5511666666666',
                whatsapp_api_key: 'TIMEOUT_API_KEY'
              }
            }
          }
        },
      } as any

      mockPrisma.buttonReactionMapping.findUnique.mockResolvedValueOnce({
        id: 'reaction-timeout',
        buttonId: 'btn-timeout',
        messageId: 'msg-timeout',
        emoji: '⏱️',
        textReaction: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-timeout'
      })

      // Mock timeout scenario
      mockSendReactionMessage.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      )

      mockLogReactionAttempt.mockResolvedValueOnce(undefined)

      // Should handle timeout gracefully
      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow('Request timeout')

      // Verify timeout was logged
      expect(mockLogReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '+5511666666666',
        messageId: 'wamid.timeout_original',
        emoji: '⏱️',
        buttonId: 'btn-timeout',
        success: false,
        error: 'Request timeout'
      })
    })
  })
})