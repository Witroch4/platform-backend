/**
 * Integration test for Instagram translation webhook functionality
 */

import { detectChannelType } from '@/lib/webhook-utils';
import { 
  createInstagramTranslationJob,
  generateCorrelationId,
} from '@/lib/queue/instagram-translation.queue';

describe('Instagram Translation Webhook Integration', () => {
  describe('Channel Detection', () => {
    it('should detect Instagram channel correctly', () => {
      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: 'test_key_123',
          }
        },
        queryResult: {
          intent: {
            displayName: 'test.intent'
          }
        }
      };
      
      const result = detectChannelType(instagramPayload);
      
      expect(result.isInstagram).toBe(true);
      expect(result.channelType).toBe('Channel::Instagram');
      expect(result.originalPayload).toBe(instagramPayload);
    });

    it('should not detect WhatsApp as Instagram', () => {
      const whatsappPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp',
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: 'test_key_123',
          }
        },
        queryResult: {
          intent: {
            displayName: 'test.intent'
          }
        }
      };
      
      const result = detectChannelType(whatsappPayload);
      
      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('Channel::WhatsApp');
    });

    it('should handle missing channel_type', () => {
      const payloadWithoutChannelType = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: 'test_key_123',
          }
        },
        queryResult: {
          intent: {
            displayName: 'test.intent'
          }
        }
      };
      
      const result = detectChannelType(payloadWithoutChannelType);
      
      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('');
    });

    it('should handle invalid payload', () => {
      const result = detectChannelType(null);
      
      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('unknown');
      expect(result.originalPayload).toBe(null);
    });
  });

  describe('Job Creation', () => {
    it('should create Instagram translation job with correct data', () => {
      const correlationId = generateCorrelationId();
      
      const jobData = createInstagramTranslationJob({
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '5511999999999',
        conversationId: 'conv_123',
        originalPayload: { test: 'payload' },
        correlationId,
      });
      
      expect(jobData.intentName).toBe('test.intent');
      expect(jobData.inboxId).toBe('4');
      expect(jobData.contactPhone).toBe('5511999999999');
      expect(jobData.conversationId).toBe('conv_123');
      expect(jobData.correlationId).toBe(correlationId);
      expect(jobData.originalPayload).toEqual({ test: 'payload' });
      expect(jobData.metadata).toBeDefined();
      expect(jobData.metadata?.timestamp).toBeInstanceOf(Date);
      expect(jobData.metadata?.retryCount).toBe(0);
    });

    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^ig-\d+-[a-z0-9]+-[a-z0-9]+$/);
      expect(id2).toMatch(/^ig-\d+-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('Webhook Flow Simulation', () => {
    it('should identify Instagram requests correctly in webhook flow', () => {
      // Simulate a complete Instagram webhook request
      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: 'test_key_instagram_123',
            message_id: 'msg_instagram_456',
            conversation_id: 'conv_instagram_789',
          }
        },
        queryResult: {
          intent: {
            displayName: 'welcome.intent'
          },
          queryText: 'Hello'
        },
        session: 'projects/test-project/agent/sessions/5511999999999'
      };

      // Test channel detection
      const channelDetection = detectChannelType(instagramWebhookRequest);
      expect(channelDetection.isInstagram).toBe(true);

      // Test job creation for Instagram
      if (channelDetection.isInstagram) {
        const correlationId = generateCorrelationId();
        const jobData = createInstagramTranslationJob({
          intentName: 'welcome.intent',
          inboxId: '4',
          contactPhone: '5511999999999',
          conversationId: 'conv_instagram_789',
          originalPayload: instagramWebhookRequest,
          correlationId,
        });

        expect(jobData).toBeDefined();
        expect(jobData.intentName).toBe('welcome.intent');
        expect(jobData.inboxId).toBe('4');
        expect(jobData.contactPhone).toBe('5511999999999');
      }
    });

    it('should bypass Instagram logic for WhatsApp requests', () => {
      // Simulate a WhatsApp webhook request
      const whatsappWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp',
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: 'test_key_whatsapp_123',
            message_id: 'msg_whatsapp_456',
            conversation_id: 'conv_whatsapp_789',
          }
        },
        queryResult: {
          intent: {
            displayName: 'welcome.intent'
          },
          queryText: 'Hello'
        },
        session: 'projects/test-project/agent/sessions/5511999999999'
      };

      // Test channel detection
      const channelDetection = detectChannelType(whatsappWebhookRequest);
      expect(channelDetection.isInstagram).toBe(false);
      expect(channelDetection.channelType).toBe('Channel::WhatsApp');

      // WhatsApp requests should not create Instagram translation jobs
      // This would be handled by the existing WhatsApp logic
    });
  });
});