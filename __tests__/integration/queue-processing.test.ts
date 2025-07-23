/**
 * Integration Tests for Queue Processing
 * Tests queue system reliability and task processing
 * Requirements: 2.1, 2.2, 2.3
 */

import { Queue, Worker, Job } from 'bullmq';
import {
  addSendMessageTask,
  addSendReactionTask,
  SendMessageTask,
  SendReactionTask,
  generateCorrelationId
} from '../../lib/queue/mtf-diamante-webhook.queue';

// Mock Redis connection
const mockRedisConnection = {
  host: 'localhost',
  port: 6379
};

// Mock external dependencies
jest.mock('@/lib/whatsapp-messages', () => ({
  sendTemplateMessage: jest.fn(),
  sendInteractiveMessage: jest.fn()
}));

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
  logReactionAttempt: jest.fn()
}));

jest.mock('@/lib/redis', () => ({
  connection: mockRedisConnection
}));

// Import mocked modules
import { sendTemplateMessage, sendInteractiveMessage } from '@/lib/whatsapp-messages';
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions';

// Mock queue implementation for testing
class TestQueue {
  private jobs: Map<string, any> = new Map();
  private processingCallbacks: Array<(job: Job) => Promise<any>> = [];
  private failedJobs: any[] = [];
  private completedJobs: any[] = [];

  async add(name: string, data: any, options?: any): Promise<Job> {
    const jobId = options?.jobId || `job-${Date.now()}-${Math.random()}`;
    const job = {
      id: jobId,
      name,
      data,
      options,
      attemptsMade: 0,
      maxAttempts: options?.attempts || 3,
      timestamp: Date.now()
    };

    this.jobs.set(jobId, job);
    
    // Simulate immediate processing if callbacks are registered
    if (this.processingCallbacks.length > 0) {
      setImmediate(() => this.processJob(job));
    }

    return job as Job;
  }

  process(callback: (job: Job) => Promise<any>) {
    this.processingCallbacks.push(callback);
  }

  private async processJob(job: any) {
    try {
      job.attemptsMade++;
      
      for (const callback of this.processingCallbacks) {
        const result = await callback(job);
        this.completedJobs.push({ job, result });
        this.jobs.delete(job.id);
        return result;
      }
    } catch (error) {
      if (job.attemptsMade < job.maxAttempts) {
        // Retry logic
        setTimeout(() => this.processJob(job), 1000 * job.attemptsMade);
      } else {
        // Move to failed jobs
        this.failedJobs.push({ job, error });
        this.jobs.delete(job.id);
      }
      throw error;
    }
  }

  getWaitingJobs() {
    return Array.from(this.jobs.values());
  }

  getCompletedJobs() {
    return this.completedJobs;
  }

  getFailedJobs() {
    return this.failedJobs;
  }

  clear() {
    this.jobs.clear();
    this.completedJobs = [];
    this.failedJobs = [];
  }

  async close() {
    this.clear();
  }
}

describe('Queue Processing Integration Tests', () => {
  let testQueue: TestQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    testQueue = new TestQueue();
  });

  afterEach(async () => {
    await testQueue.close();
  });

  describe('Message Task Processing', () => {
    it('should process template message tasks successfully', async () => {
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        correlationId: generateCorrelationId(),
        messageData: {
          type: 'template',
          templateId: 'welcome_template',
          templateName: 'welcome',
          variables: { name: 'João' }
        },
        metadata: {
          intentName: 'welcome',
          caixaId: 'test-caixa'
        }
      };

      // Mock successful WhatsApp API response
      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.template123'
      });

      // Set up queue processor
      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        if (data.type === 'sendMessage' && data.messageData.type === 'template') {
          const result = await sendTemplateMessage(
            {
              recipientPhone: data.recipientPhone,
              templateId: data.messageData.templateId!,
              templateName: data.messageData.templateName!,
              variables: data.messageData.variables || {},
              whatsappApiKey: data.whatsappApiKey,
              language: 'pt_BR'
            },
            []
          );

          if (!result.success) {
            throw new Error(`Template message failed: ${result.error}`);
          }

          return { success: true, messageId: result.messageId };
        }

        throw new Error('Unsupported task type');
      });

      // Add task to queue
      await testQueue.add('sendMessage', templateTask);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was processed successfully
      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.success).toBe(true);

      // Verify WhatsApp API was called correctly
      expect(sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientPhone: '5511999999999',
          templateId: 'welcome_template',
          templateName: 'welcome',
          variables: { name: 'João' },
          whatsappApiKey: 'test-api-key'
        }),
        []
      );
    });

    it('should process interactive message tasks successfully', async () => {
      const interactiveTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        correlationId: generateCorrelationId(),
        messageData: {
          type: 'interactive',
          interactiveContent: {
            body: 'Escolha uma opção:',
            buttons: [
              { id: 'option1', title: 'Opção 1' },
              { id: 'option2', title: 'Opção 2' }
            ]
          }
        }
      };

      (sendInteractiveMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.interactive123'
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        if (data.type === 'sendMessage' && data.messageData.type === 'interactive') {
          const result = await sendInteractiveMessage({
            recipientPhone: data.recipientPhone,
            whatsappApiKey: data.whatsappApiKey,
            body: data.messageData.interactiveContent!.body,
            action: {
              type: 'buttons',
              data: { buttons: data.messageData.interactiveContent!.buttons || [] }
            }
          });

          if (!result.success) {
            throw new Error(`Interactive message failed: ${result.error}`);
          }

          return { success: true, messageId: result.messageId };
        }

        throw new Error('Unsupported task type');
      });

      await testQueue.add('sendMessage', interactiveTask);
      await new Promise(resolve => setTimeout(resolve, 100));

      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.success).toBe(true);

      expect(sendInteractiveMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        body: 'Escolha uma opção:',
        action: {
          type: 'buttons',
          data: {
            buttons: [
              { id: 'option1', title: 'Opção 1' },
              { id: 'option2', title: 'Opção 2' }
            ]
          }
        }
      });
    });
  });

  describe('Reaction Task Processing', () => {
    it('should process reaction tasks successfully', async () => {
      const reactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key',
        correlationId: generateCorrelationId(),
        metadata: {
          buttonId: 'like_button'
        }
      };

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });
      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      testQueue.process(async (job: Job<SendReactionTask>) => {
        const { data } = job;
        
        if (data.type === 'sendReaction') {
          const result = await sendReactionMessage({
            recipientPhone: data.recipientPhone,
            messageId: data.messageId,
            emoji: data.emoji,
            whatsappApiKey: data.whatsappApiKey
          });

          // Log the attempt
          await logReactionAttempt({
            recipientPhone: data.recipientPhone,
            messageId: data.messageId,
            emoji: data.emoji,
            buttonId: data.metadata?.buttonId || 'unknown',
            success: result.success,
            error: result.error
          });

          if (!result.success) {
            throw new Error(`Reaction failed: ${result.error}`);
          }

          return { success: true, messageId: result.messageId };
        }

        throw new Error('Unsupported task type');
      });

      await testQueue.add('sendReaction', reactionTask);
      await new Promise(resolve => setTimeout(resolve, 100));

      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.success).toBe(true);

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      });

      expect(logReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        buttonId: 'like_button',
        success: true,
        error: undefined
      });
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry failed tasks according to configuration', async () => {
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'retry_template',
          templateName: 'retry'
        }
      };

      let attemptCount = 0;
      (sendTemplateMessage as jest.Mock).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          return { success: false, error: 'Network timeout' };
        }
        return { success: true, messageId: 'wamid.success123' };
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        const result = await sendTemplateMessage(
          {
            recipientPhone: data.recipientPhone,
            templateId: data.messageData.templateId!,
            templateName: data.messageData.templateName!,
            whatsappApiKey: data.whatsappApiKey,
            language: 'pt_BR'
          },
          []
        );

        if (!result.success) {
          throw new Error(`Template message failed: ${result.error}`);
        }

        return { success: true, messageId: result.messageId };
      });

      await testQueue.add('sendMessage', templateTask, { attempts: 3 });

      // Wait for retries to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Should eventually succeed after retries
      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.success).toBe(true);

      // Should have been called 3 times (2 failures + 1 success)
      expect(sendTemplateMessage).toHaveBeenCalledTimes(3);
    });

    it('should move tasks to failed queue after max retries', async () => {
      const reactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.nonexistent',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      };

      // Always fail
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Message not found'
      });
      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      testQueue.process(async (job: Job<SendReactionTask>) => {
        const { data } = job;
        
        const result = await sendReactionMessage({
          recipientPhone: data.recipientPhone,
          messageId: data.messageId,
          emoji: data.emoji,
          whatsappApiKey: data.whatsappApiKey
        });

        await logReactionAttempt({
          recipientPhone: data.recipientPhone,
          messageId: data.messageId,
          emoji: data.emoji,
          buttonId: 'test_button',
          success: result.success,
          error: result.error
        });

        throw new Error(`Reaction failed: ${result.error}`);
      });

      await testQueue.add('sendReaction', reactionTask, { attempts: 2 });

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should be in failed jobs
      const failedJobs = testQueue.getFailedJobs();
      expect(failedJobs).toHaveLength(1);
      expect(failedJobs[0].job.data.type).toBe('sendReaction');

      // Should have been attempted 2 times
      expect(sendReactionMessage).toHaveBeenCalledTimes(2);
      expect(logReactionAttempt).toHaveBeenCalledTimes(2);
    });
  });

  describe('Queue Performance and Scalability', () => {
    it('should handle multiple concurrent tasks efficiently', async () => {
      const tasks: SendMessageTask[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'sendMessage',
        recipientPhone: `551199999999${i}`,
        whatsappApiKey: 'test-api-key',
        correlationId: generateCorrelationId(),
        messageData: {
          type: 'template',
          templateId: `template_${i}`,
          templateName: `template${i}`
        }
      }));

      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.concurrent123'
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const result = await sendTemplateMessage(
          {
            recipientPhone: data.recipientPhone,
            templateId: data.messageData.templateId!,
            templateName: data.messageData.templateName!,
            whatsappApiKey: data.whatsappApiKey,
            language: 'pt_BR'
          },
          []
        );

        return { success: true, messageId: result.messageId };
      });

      const startTime = Date.now();

      // Add all tasks concurrently
      await Promise.all(tasks.map(task => testQueue.add('sendMessage', task)));

      // Wait for all tasks to complete
      await new Promise(resolve => {
        const checkCompletion = () => {
          if (testQueue.getCompletedJobs().length === tasks.length) {
            resolve(undefined);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All tasks should be completed
      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(10);

      // Should complete in reasonable time (less than 2 seconds for 10 tasks)
      expect(totalTime).toBeLessThan(2000);

      // All API calls should have been made
      expect(sendTemplateMessage).toHaveBeenCalledTimes(10);
    });

    it('should maintain task order for priority tasks', async () => {
      const highPriorityTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'urgent_template',
          templateName: 'urgent'
        }
      };

      const lowPriorityTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999998',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'normal_template',
          templateName: 'normal'
        }
      };

      const processedOrder: string[] = [];

      (sendTemplateMessage as jest.Mock).mockImplementation(async (data) => {
        processedOrder.push(data.templateName);
        return { success: true, messageId: 'wamid.priority123' };
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        const result = await sendTemplateMessage({
          recipientPhone: data.recipientPhone,
          templateId: data.messageData.templateId!,
          templateName: data.messageData.templateName!,
          whatsappApiKey: data.whatsappApiKey,
          language: 'pt_BR'
        }, []);

        return { success: true, messageId: result.messageId };
      });

      // Add low priority task first, then high priority
      await testQueue.add('sendMessage', lowPriorityTask, { priority: 1 });
      await testQueue.add('sendMessage', highPriorityTask, { priority: 10 });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // High priority task should be processed first
      expect(processedOrder[0]).toBe('urgent');
      expect(processedOrder[1]).toBe('normal');
    });
  });

  describe('Task Data Integrity', () => {
    it('should preserve correlation IDs throughout processing', async () => {
      const correlationId = generateCorrelationId();
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        correlationId,
        messageData: {
          type: 'template',
          templateId: 'correlation_test',
          templateName: 'correlation'
        },
        metadata: {
          intentName: 'test_intent',
          caixaId: 'test_caixa'
        }
      };

      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.correlation123'
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        // Verify correlation ID is preserved
        expect(data.correlationId).toBe(correlationId);
        expect(data.metadata?.intentName).toBe('test_intent');
        expect(data.metadata?.caixaId).toBe('test_caixa');
        
        const result = await sendTemplateMessage({
          recipientPhone: data.recipientPhone,
          templateId: data.messageData.templateId!,
          templateName: data.messageData.templateName!,
          whatsappApiKey: data.whatsappApiKey,
          language: 'pt_BR'
        }, []);

        return { 
          success: true, 
          messageId: result.messageId,
          correlationId: data.correlationId
        };
      });

      await testQueue.add('sendMessage', templateTask);
      await new Promise(resolve => setTimeout(resolve, 100));

      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.correlationId).toBe(correlationId);
    });

    it('should handle large task payloads correctly', async () => {
      const largeVariables = Array.from({ length: 100 }, (_, i) => [`var${i}`, `value${i}`])
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      const largeTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'large_template',
          templateName: 'large',
          variables: largeVariables
        }
      };

      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.large123'
      });

      testQueue.process(async (job: Job<SendMessageTask>) => {
        const { data } = job;
        
        // Verify all variables are preserved
        expect(Object.keys(data.messageData.variables || {})).toHaveLength(100);
        expect(data.messageData.variables?.var50).toBe('value50');
        
        const result = await sendTemplateMessage({
          recipientPhone: data.recipientPhone,
          templateId: data.messageData.templateId!,
          templateName: data.messageData.templateName!,
          variables: data.messageData.variables,
          whatsappApiKey: data.whatsappApiKey,
          language: 'pt_BR'
        }, []);

        return { success: true, messageId: result.messageId };
      });

      await testQueue.add('sendMessage', largeTask);
      await new Promise(resolve => setTimeout(resolve, 100));

      const completedJobs = testQueue.getCompletedJobs();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].result.success).toBe(true);

      // Verify large variables were passed to API
      expect(sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            var50: 'value50',
            var99: 'value99'
          })
        }),
        []
      );
    });
  });
});