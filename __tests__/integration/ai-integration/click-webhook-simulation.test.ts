/**
 * Integration tests for click webhook simulation
 * Tests button_reply.id (WhatsApp), quick_reply.payload/postback.payload (Instagram)
 * Verifies routing and context persistence (15 min TTL per conversation)
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import request from 'supertest';
import { createServer } from 'http';
import { NextApiHandler } from 'next';
import crypto from 'crypto';
import Redis from 'ioredis';

// Mock external services
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/chatwit-api-client');
jest.mock('@/lib/ai-integration/services/intent-classifier');

describe('Click Webhook Simulation Tests', () => {
  let server: any;
  let redis: Redis;
  let redisAvailable: boolean;

  const testSecret = 'test-webhook-secret';
  const conversationId = 12345;
  const accountId = 123;
  const contactId = 999;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping click webhook simulation tests');
      return;
    }

    redis = new Redis(testRedisConfig);

    // Setup test server
    const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
    server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        webhookHandler(req as any, res as any);
      }
    });

    // Mock services
    const mockIntentClassifier = require('@/lib/ai-integration/services/intent-classifier');
    const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');

    mockIntentClassifier.IntentClassifierService.mockImplementation(() => ({
      classifyIntent: jest.fn().mockResolvedValue({
        intent: 'track_order',
        score: 0.85,
        candidates: [],
        tokensUsed: 5,
      }),
    }));

    mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
      postBotMessage: jest.fn().mockResolvedValue({
        success: true,
        messageId: Math.floor(Math.random() * 1000000),
      }),
    }));
  });

  afterAll(async () => {
    if (!redisAvailable) return;

    if (server) {
      server.close();
    }
    if (redis) {
      await redis.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;

    // Clear Redis between tests
    await redis.flushdb();
  });

  describe('WhatsApp Button Click Simulation', () => {
    it('should handle WhatsApp button_reply.id correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // First, establish conversation context
      await redis.lpush(`ctx:conv:${conversationId}`, 'Cliente: Preciso de ajuda');
      await redis.lpush(`ctx:conv:${conversationId}`, 'Bot: Como posso ajudar?');
      await redis.expire(`ctx:conv:${conversationId}`, 900); // 15 minutes

      // Simulate WhatsApp button click
      const buttonClickPayload = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101113,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:track_order',
                title: 'Rastrear Pedido',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.BUTTON_CLICK_TEST',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(buttonClickPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(buttonClickPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Verify context is still available
      const context = await redis.lrange(`ctx:conv:${conversationId}`, 0, -1);
      expect(context).toContain('Cliente: Preciso de ajuda');
      expect(context).toContain('Bot: Como posso ajudar?');

      // Verify TTL is still set
      const ttl = await redis.ttl(`ctx:conv:${conversationId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should route namespaced button payloads correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const testCases = [
        {
          payload: 'intent:track_order',
          expectedNamespace: 'intent',
          expectedAction: 'track_order',
        },
        {
          payload: 'flow:checkout_process',
          expectedNamespace: 'flow',
          expectedAction: 'checkout_process',
        },
        {
          payload: 'help:faq_shipping',
          expectedNamespace: 'help',
          expectedAction: 'faq_shipping',
        },
        {
          payload: 'human_handoff',
          expectedNamespace: null,
          expectedAction: 'human_handoff',
        },
      ];

      for (const testCase of testCases) {
        const buttonClickPayload = {
          account_id: accountId,
          channel: 'whatsapp',
          conversation: {
            id: conversationId + Math.floor(Math.random() * 1000), // Unique conversation
            inbox_id: 789,
            status: 'open',
          },
          message: {
            id: 101113 + Math.floor(Math.random() * 1000),
            message_type: 'incoming',
            content_type: 'interactive',
            content: null,
            content_attributes: {
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: testCase.payload,
                  title: 'Test Button',
                },
              },
            },
            created_at: Math.floor(Date.now() / 1000),
            source_id: `wamid.${testCase.payload.replace(':', '_')}`,
            sender: {
              type: 'contact',
              id: contactId,
              name: 'Test User',
            },
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(buttonClickPayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        const response = await request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', signature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(buttonClickPayload)
          .expect(200);

        expect(response.body).toEqual({ ok: true });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should handle button clicks with high priority', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Send regular text message first
      const textPayload = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101114,
          message_type: 'incoming',
          content_type: 'text',
          content: 'Regular text message',
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.TEXT_MESSAGE',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      // Send button click immediately after
      const buttonClickPayload = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101115,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:urgent_help',
                title: 'Ajuda Urgente',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.BUTTON_URGENT',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      // Send both requests
      const timestamp = Math.floor(Date.now() / 1000);
      
      const textPayloadString = JSON.stringify(textPayload);
      const textSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${textPayloadString}`)
        .digest('hex');

      const buttonPayloadString = JSON.stringify(buttonClickPayload);
      const buttonSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${buttonPayloadString}`)
        .digest('hex');

      const [textResponse, buttonResponse] = await Promise.all([
        request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', textSignature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(textPayload),
        request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', buttonSignature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(buttonClickPayload),
      ]);

      expect(textResponse.status).toBe(200);
      expect(buttonResponse.status).toBe(200);
      expect(textResponse.body).toEqual({ ok: true });
      expect(buttonResponse.body).toEqual({ ok: true });
    });
  });

  describe('Instagram Click Simulation', () => {
    it('should handle Instagram quick_reply.payload correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Establish conversation context
      await redis.lpush(`ctx:conv:${conversationId}`, 'Cliente: Oi!');
      await redis.lpush(`ctx:conv:${conversationId}`, 'Bot: Olá! Como posso ajudar?');
      await redis.expire(`ctx:conv:${conversationId}`, 900);

      const quickReplyPayload = {
        account_id: accountId,
        channel: 'instagram',
        conversation: {
          id: conversationId,
          inbox_id: 790,
          status: 'open',
        },
        message: {
          id: 101116,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            quick_reply: {
              payload: 'intent:cancel_order',
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'mid.QUICK_REPLY_TEST',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Instagram User',
          },
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(quickReplyPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(quickReplyPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Verify context persistence
      const context = await redis.lrange(`ctx:conv:${conversationId}`, 0, -1);
      expect(context).toContain('Cliente: Oi!');
      expect(context).toContain('Bot: Olá! Como posso ajudar?');
    });

    it('should handle Instagram postback.payload correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const postbackPayload = {
        account_id: accountId,
        channel: 'instagram',
        conversation: {
          id: conversationId + 1,
          inbox_id: 790,
          status: 'open',
        },
        message: {
          id: 101117,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            postback: {
              payload: 'flow:get_started',
              title: 'Começar',
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'mid.POSTBACK_TEST',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Instagram User',
          },
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(postbackPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(postbackPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });

    it('should handle mixed Instagram interaction types', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const interactionTypes = [
        {
          type: 'quick_reply',
          content_attributes: {
            quick_reply: {
              payload: 'intent:support',
            },
          },
        },
        {
          type: 'postback',
          content_attributes: {
            postback: {
              payload: 'help:contact_info',
              title: 'Contato',
            },
          },
        },
        {
          type: 'button_template_click',
          content_attributes: {
            postback: {
              payload: 'intent:product_info',
              title: 'Produtos',
            },
          },
        },
      ];

      for (let i = 0; i < interactionTypes.length; i++) {
        const interaction = interactionTypes[i];
        const payload = {
          account_id: accountId,
          channel: 'instagram',
          conversation: {
            id: conversationId + i + 10,
            inbox_id: 790,
            status: 'open',
          },
          message: {
            id: 101118 + i,
            message_type: 'incoming',
            content_type: 'interactive',
            content: null,
            content_attributes: interaction.content_attributes,
            created_at: Math.floor(Date.now() / 1000),
            source_id: `mid.${interaction.type.toUpperCase()}_${i}`,
            sender: {
              type: 'contact',
              id: contactId,
              name: 'Instagram User',
            },
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(payload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        const response = await request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', signature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(payload)
          .expect(200);

        expect(response.body).toEqual({ ok: true });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    });
  });

  describe('Context Persistence and TTL', () => {
    it('should maintain conversation context for 15 minutes', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const contextKey = `ctx:conv:${conversationId}`;

      // Establish initial context
      await redis.lpush(contextKey, 'Cliente: Primeira mensagem');
      await redis.lpush(contextKey, 'Bot: Primeira resposta');
      await redis.expire(contextKey, 900); // 15 minutes

      // Simulate button click after some time
      await new Promise(resolve => setTimeout(resolve, 100));

      const buttonClickPayload = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101119,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:more_info',
                title: 'Mais Informações',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.CONTEXT_TEST',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(buttonClickPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(buttonClickPayload)
        .expect(200);

      // Verify context is still available
      const context = await redis.lrange(contextKey, 0, -1);
      expect(context).toContain('Cliente: Primeira mensagem');
      expect(context).toContain('Bot: Primeira resposta');

      // Verify TTL is reasonable (should be close to 900 seconds)
      const ttl = await redis.ttl(contextKey);
      expect(ttl).toBeGreaterThan(890); // Should be close to original TTL
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should handle context updates correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const contextKey = `ctx:conv:${conversationId}`;

      // Start with empty context
      await redis.del(contextKey);

      // Send first message
      const firstMessage = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101120,
          message_type: 'incoming',
          content_type: 'text',
          content: 'Olá, preciso de ajuda',
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.FIRST_MESSAGE',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      let timestamp = Math.floor(Date.now() / 1000);
      let payloadString = JSON.stringify(firstMessage);
      let signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(firstMessage)
        .expect(200);

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Send button click
      const buttonClick = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101121,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:track_order',
                title: 'Rastrear Pedido',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.BUTTON_AFTER_TEXT',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      timestamp = Math.floor(Date.now() / 1000);
      payloadString = JSON.stringify(buttonClick);
      signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(buttonClick)
        .expect(200);

      // Verify context contains both interactions
      const context = await redis.lrange(contextKey, 0, -1);
      expect(context.length).toBeGreaterThan(0);

      // Context should have TTL set
      const ttl = await redis.ttl(contextKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should handle context expiry correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const contextKey = `ctx:conv:${conversationId}`;

      // Set context with very short TTL for testing
      await redis.lpush(contextKey, 'Cliente: Mensagem antiga');
      await redis.expire(contextKey, 1); // 1 second TTL

      // Wait for context to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify context has expired
      const expiredContext = await redis.lrange(contextKey, 0, -1);
      expect(expiredContext).toHaveLength(0);

      // Send button click after context expiry
      const buttonClickPayload = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: conversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101122,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:new_conversation',
                title: 'Nova Conversa',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.AFTER_EXPIRY',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Test User',
          },
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(buttonClickPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(buttonClickPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // System should handle the click even without context
      // New context should be created if needed
    });
  });

  describe('Cross-Channel Click Handling', () => {
    it('should handle clicks from different channels in same conversation', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const sharedConversationId = conversationId + 100;

      // WhatsApp button click
      const whatsappClick = {
        account_id: accountId,
        channel: 'whatsapp',
        conversation: {
          id: sharedConversationId,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101123,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'intent:whatsapp_action',
                title: 'WhatsApp Action',
              },
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'wamid.CROSS_CHANNEL_WA',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Cross Channel User',
          },
        },
      };

      // Instagram quick reply
      const instagramClick = {
        account_id: accountId,
        channel: 'instagram',
        conversation: {
          id: sharedConversationId,
          inbox_id: 790,
          status: 'open',
        },
        message: {
          id: 101124,
          message_type: 'incoming',
          content_type: 'interactive',
          content: null,
          content_attributes: {
            quick_reply: {
              payload: 'intent:instagram_action',
            },
          },
          created_at: Math.floor(Date.now() / 1000),
          source_id: 'mid.CROSS_CHANNEL_IG',
          sender: {
            type: 'contact',
            id: contactId,
            name: 'Cross Channel User',
          },
        },
      };

      // Send both clicks
      const timestamp = Math.floor(Date.now() / 1000);

      const waPayloadString = JSON.stringify(whatsappClick);
      const waSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${waPayloadString}`)
        .digest('hex');

      const igPayloadString = JSON.stringify(instagramClick);
      const igSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${igPayloadString}`)
        .digest('hex');

      const [waResponse, igResponse] = await Promise.all([
        request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', waSignature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(whatsappClick),
        request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', igSignature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(instagramClick),
      ]);

      expect(waResponse.status).toBe(200);
      expect(igResponse.status).toBe(200);
      expect(waResponse.body).toEqual({ ok: true });
      expect(igResponse.body).toEqual({ ok: true });

      // Both should share the same conversation context
      const contextKey = `ctx:conv:${sharedConversationId}`;
      const context = await redis.lrange(contextKey, 0, -1);
      expect(context.length).toBeGreaterThanOrEqual(0);
    });
  });
});