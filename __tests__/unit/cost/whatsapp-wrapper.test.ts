// Using global jest from jest.config.js
import { Queue } from 'bullmq';
import { 
  whatsappWithCost, 
  whatsappMarketingWithCost,
  whatsappUtilityWithCost,
  whatsappAuthWithCost,
  deriveRegionFromPhone,
  getTemplateCategory,
  captureWhatsAppDelivery
} from '@/lib/cost/whatsapp-wrapper';
import { guardWhatsAppOperation, BudgetExceededException } from '@/lib/cost/budget-guard';

// Mock dependencies
jest.mock('bullmq');
jest.mock('@/lib/connections');
jest.mock('@/lib/cost/budget-guard');

const mockQueue = {
  add: jest.fn(),
} as any;

const mockGuardWhatsAppOperation = guardWhatsAppOperation as jest.MockedFunction<typeof guardWhatsAppOperation>;

// Mock Queue constructor
(Queue as jest.MockedClass<typeof Queue>).mockImplementation(() => mockQueue);

describe('WhatsApp Wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default budget guard response
    mockGuardWhatsAppOperation.mockResolvedValue({
      allowed: true,
      reason: null,
    });
  });

  describe('deriveRegionFromPhone', () => {
    it('should correctly identify Brazilian numbers', () => {
      expect(deriveRegionFromPhone('+5511999999999')).toBe('BRAZIL');
      expect(deriveRegionFromPhone('5511999999999')).toBe('BRAZIL');
      expect(deriveRegionFromPhone('(55) 11 99999-9999')).toBe('BRAZIL');
    });

    it('should correctly identify North American numbers', () => {
      expect(deriveRegionFromPhone('+15551234567')).toBe('NORTH_AMERICA');
      expect(deriveRegionFromPhone('15551234567')).toBe('NORTH_AMERICA');
    });

    it('should correctly identify European numbers', () => {
      expect(deriveRegionFromPhone('+33123456789')).toBe('WESTERN_EUROPE'); // France
      expect(deriveRegionFromPhone('+49123456789')).toBe('WESTERN_EUROPE'); // Germany
      expect(deriveRegionFromPhone('+44123456789')).toBe('WESTERN_EUROPE'); // UK
    });

    it('should return OTHER for unknown regions', () => {
      expect(deriveRegionFromPhone('+999123456789')).toBe('OTHER');
      expect(deriveRegionFromPhone('123456789')).toBe('OTHER');
    });
  });

  describe('getTemplateCategory', () => {
    it('should identify auth templates', () => {
      expect(getTemplateCategory('auth_code')).toBe('AUTH_TEMPLATE');
      expect(getTemplateCategory('otp_verification')).toBe('AUTH_TEMPLATE');
      expect(getTemplateCategory('verification_code')).toBe('AUTH_TEMPLATE');
    });

    it('should identify utility templates', () => {
      expect(getTemplateCategory('utility_receipt')).toBe('UTILITY_TEMPLATE');
      expect(getTemplateCategory('confirmation_message')).toBe('UTILITY_TEMPLATE');
      expect(getTemplateCategory('receipt_notification')).toBe('UTILITY_TEMPLATE');
    });

    it('should default to marketing templates', () => {
      expect(getTemplateCategory('promotional_offer')).toBe('MARKETING_TEMPLATE');
      expect(getTemplateCategory('newsletter')).toBe('MARKETING_TEMPLATE');
      expect(getTemplateCategory('unknown_template')).toBe('MARKETING_TEMPLATE');
    });
  });

  describe('whatsappWithCost', () => {
    const mockSendFunction = jest.fn();

    beforeEach(() => {
      mockSendFunction.mockClear();
    });

    it('should capture cost events for successful WhatsApp sends', async () => {
      // Arrange
      const mockResult = {
        messageId: 'wamid.123',
        status: 'sent',
      };

      mockSendFunction.mockResolvedValue(mockResult);

      const args = {
        templateName: 'welcome_message',
        to: '+5511999999999',
        meta: {
          sessionId: 'session-123',
          inboxId: 'inbox-456',
          userId: 'user-789',
          intent: 'greeting',
          traceId: 'trace-abc',
        },
      };

      // Act
      const result = await whatsappWithCost(mockSendFunction, args);

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockSendFunction).toHaveBeenCalledWith('welcome_message', '+5511999999999');

      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', {
        ts: expect.any(String),
        provider: 'META_WHATSAPP',
        product: 'WABA',
        unit: 'WHATSAPP_TEMPLATE',
        units: 1,
        region: 'BRAZIL',
        externalId: 'wamid.123',
        sessionId: 'session-123',
        inboxId: 'inbox-456',
        userId: 'user-789',
        intent: 'greeting',
        traceId: 'trace-abc',
        raw: expect.objectContaining({
          templateName: 'welcome_message',
          templateCategory: 'MARKETING_TEMPLATE',
          to: '+5511999999999',
          region: 'BRAZIL',
          status: 'sent',
        }),
      });
    });

    it('should handle budget guard blocking operation', async () => {
      // Arrange
      mockGuardWhatsAppOperation.mockResolvedValue({
        allowed: false,
        reason: 'Orçamento excedido',
      });

      const args = {
        templateName: 'welcome_message',
        to: '+5511999999999',
        meta: { inboxId: 'inbox-456' },
      };

      // Act & Assert
      await expect(whatsappWithCost(mockSendFunction, args)).rejects.toThrow(BudgetExceededException);
      expect(mockSendFunction).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should not capture cost for failed sends', async () => {
      // Arrange
      const mockResult = {
        messageId: 'wamid.123',
        status: 'failed',
      };

      mockSendFunction.mockResolvedValue(mockResult);

      const args = {
        templateName: 'welcome_message',
        to: '+5511999999999',
      };

      // Act
      const result = await whatsappWithCost(mockSendFunction, args);

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle send function errors', async () => {
      // Arrange
      const error = new Error('Send failed');
      mockSendFunction.mockRejectedValue(error);

      const args = {
        templateName: 'welcome_message',
        to: '+5511999999999',
      };

      // Act & Assert
      await expect(whatsappWithCost(mockSendFunction, args)).rejects.toThrow('Send failed');

      // Should still try to capture error event
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', {
        ts: expect.any(String),
        provider: 'META_WHATSAPP',
        product: 'WABA',
        unit: 'WHATSAPP_TEMPLATE',
        units: 0, // No charge for failures
        region: 'BRAZIL',
        externalId: expect.stringContaining('error-'),
        raw: expect.objectContaining({
          status: 'failed',
          error: 'Error: Send failed',
        }),
      });
    });
  });

  describe('whatsappMarketingWithCost', () => {
    it('should call whatsappWithCost with correct parameters', async () => {
      // Arrange
      const mockSendFunction = jest.fn().mockResolvedValue({
        messageId: 'wamid.123',
        status: 'sent',
      });

      const variables = { name: 'John', offer: '50% off' };
      const meta = { sessionId: 'session-123' };

      // Act
      const result = await whatsappMarketingWithCost(
        mockSendFunction,
        'promotional_offer',
        '+5511999999999',
        variables,
        meta
      );

      // Assert
      expect(mockSendFunction).toHaveBeenCalledWith('promotional_offer', '+5511999999999', variables);
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', expect.objectContaining({
        provider: 'META_WHATSAPP',
        raw: expect.objectContaining({
          templateName: 'promotional_offer',
          templateCategory: 'MARKETING_TEMPLATE',
        }),
      }));
    });
  });

  describe('whatsappUtilityWithCost', () => {
    it('should call whatsappWithCost with correct parameters', async () => {
      // Arrange
      const mockSendFunction = jest.fn().mockResolvedValue({
        messageId: 'wamid.123',
        status: 'sent',
      });

      const data = { orderId: '12345', amount: '$100' };
      const meta = { sessionId: 'session-123' };

      // Act
      await whatsappUtilityWithCost(
        mockSendFunction,
        'utility_receipt',
        '+5511999999999',
        data,
        meta
      );

      // Assert
      expect(mockSendFunction).toHaveBeenCalledWith('utility_receipt', '+5511999999999', data);
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', expect.objectContaining({
        raw: expect.objectContaining({
          templateName: 'utility_receipt',
          templateCategory: 'UTILITY_TEMPLATE',
        }),
      }));
    });
  });

  describe('whatsappAuthWithCost', () => {
    it('should call whatsappWithCost with correct parameters', async () => {
      // Arrange
      const mockSendFunction = jest.fn().mockResolvedValue({
        messageId: 'wamid.123',
        status: 'sent',
      });

      const otp = '123456';
      const meta = { sessionId: 'session-123' };

      // Act
      await whatsappAuthWithCost(
        mockSendFunction,
        'auth_code',
        '+5511999999999',
        otp,
        meta
      );

      // Assert
      expect(mockSendFunction).toHaveBeenCalledWith('auth_code', '+5511999999999', otp);
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', expect.objectContaining({
        raw: expect.objectContaining({
          templateName: 'auth_code',
          templateCategory: 'AUTH_TEMPLATE',
        }),
      }));
    });
  });

  describe('captureWhatsAppDelivery', () => {
    it('should capture delivery confirmation events', async () => {
      // Arrange
      const messageId = 'wamid.123';
      const templateName = 'welcome_message';
      const to = '+5511999999999';
      const meta = {
        sessionId: 'session-123',
        inboxId: 'inbox-456',
      };

      // Act
      await captureWhatsAppDelivery(messageId, templateName, to, meta);

      // Assert
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', {
        ts: expect.any(String),
        provider: 'META_WHATSAPP',
        product: 'WABA',
        unit: 'WHATSAPP_TEMPLATE',
        units: 1,
        region: 'BRAZIL',
        externalId: messageId,
        sessionId: 'session-123',
        inboxId: 'inbox-456',
        raw: expect.objectContaining({
          templateName,
          templateCategory: 'MARKETING_TEMPLATE',
          to,
          region: 'BRAZIL',
          status: 'delivered',
          captureType: 'webhook_confirmation',
        }),
      });
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      // Act & Assert - should not throw
      await expect(captureWhatsAppDelivery('wamid.123', 'test', '+5511999999999')).resolves.toBeUndefined();
    });
  });
});