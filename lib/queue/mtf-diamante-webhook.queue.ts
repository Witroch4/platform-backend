import { Queue } from 'bullmq';
import { connection } from '../redis';

export const MTF_DIAMANTE_WEBHOOK_QUEUE_NAME = 'mtf-diamante-webhook';

// Legacy interface for backward compatibility
export interface WebhookTaskData {
  type: 'store_message' | 'update_api_key' | 'process_intent' | 'send_reaction' | 'processButtonClick';
  payload: any;
  whatsappApiKey?: string;
  messageId?: string;
  conversationId?: string;
  contactPhone?: string;
  inboxId?: string;
  intentName?: string;
  // Reaction-specific fields
  reactionData?: {
    recipientPhone: string;
    originalMessageId: string;
    emoji: string;
    buttonId: string;
    caixaId?: string; // Add caixaId to reactionData
  };
}

// New self-contained task interfaces for async architecture
export interface SendMessageTask {
  type: 'sendMessage';
  recipientPhone: string;
  whatsappApiKey: string;
  correlationId?: string; // For request tracing
  messageData: {
    type: 'template' | 'interactive' | 'text';
    // For template messages
    templateId?: string;
    templateName?: string;
    variables?: Record<string, any>;
    // For text messages (reactions)
    textContent?: string;
    replyToMessageId?: string; // For replying to specific messages
    // For interactive messages (complete data from database)
    interactiveContent?: {
      header?: { 
        type: 'text' | 'image' | 'video' | 'document'; 
        content: string;
        filename?: string; // For document headers
      };
      body: string;
      footer?: string;
      buttons?: Array<{ 
        id: string; 
        title: string; 
        type?: 'reply' | 'url' | 'phone_number';
        url?: string; // For URL buttons
        phone_number?: string; // For phone number buttons
      }>;
      listSections?: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
      buttonText?: string; // For list messages
    };
  };
  metadata?: {
    intentName?: string;
    caixaId?: string;
    phoneNumberId?: string; // Add phoneNumberId to metadata
    originalPayload?: any; // For debugging purposes
  };
}

export interface SendReactionTask {
  type: 'sendReaction';
  recipientPhone: string;
  messageId: string;
  emoji: string;
  whatsappApiKey: string;
  correlationId?: string; // For request tracing
  metadata?: {
    buttonId?: string;
    caixaId?: string; // Add caixaId to metadata
    phoneNumberId?: string; // Add phoneNumberId to metadata
    originalPayload?: any; // For debugging purposes
  };
}

// Union type for all new task types
export type AsyncTaskData = SendMessageTask | SendReactionTask;

// Combined type for backward compatibility
export type AllTaskData = WebhookTaskData | AsyncTaskData;

// Legacy queue for backward compatibility
export const mtfDiamanteWebhookQueue = new Queue<WebhookTaskData>(
  MTF_DIAMANTE_WEBHOOK_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  }
);

// New async queue for self-contained tasks
export const asyncWebhookQueue = new Queue<AsyncTaskData>(
  `${MTF_DIAMANTE_WEBHOOK_QUEUE_NAME}-async`,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { 
        type: 'exponential', 
        delay: 2000
      },
      removeOnComplete: 100,
      removeOnFail: 50,
      // Add dead letter queue configuration
      delay: 0, // No initial delay
    }
  }
);

export async function addWebhookTask(taskData: WebhookTaskData) {
  const jobName = `${taskData.type}-${taskData.messageId || Date.now()}`;
  
  await mtfDiamanteWebhookQueue.add(jobName, taskData, {
    // Use default options from queue configuration
  });
  
  console.log(`[MTF Diamante Webhook] Job enfileirado: ${jobName}`);
}

export async function addStoreMessageTask(data: {
  payload: any;
  messageId: string;
  conversationId: string;
  contactPhone: string;
  whatsappApiKey: string;
  inboxId: string;
}) {
  await addWebhookTask({
    type: 'store_message',
    payload: data.payload,
    messageId: data.messageId,
    conversationId: data.conversationId,
    contactPhone: data.contactPhone,
    whatsappApiKey: data.whatsappApiKey,
    inboxId: data.inboxId
  });
}

export async function addUpdateApiKeyTask(data: {
  inboxId: string;
  whatsappApiKey: string;
  payload: any; // 1. Adicione o payload à assinatura da função
}) {
  await addWebhookTask({
    type: 'update_api_key',
    inboxId: data.inboxId,
    whatsappApiKey: data.whatsappApiKey,
    payload: data.payload, // 2. Passe o payload para a tarefa
  });
}

export async function addProcessIntentTask(data: {
  payload: any;
  intentName: string;
  contactPhone: string;
}) {
  await addWebhookTask({
    type: 'process_intent',
    payload: data.payload,
    intentName: data.intentName,
    contactPhone: data.contactPhone
  });
}

export async function addProcessButtonClickTask(data: {
  payload: any;
  contactPhone: string;
  whatsappApiKey: string;
  inboxId: string;
}) {
  await addWebhookTask({
    type: 'processButtonClick',
    payload: data.payload,
    contactPhone: data.contactPhone,
    whatsappApiKey: data.whatsappApiKey,
    inboxId: data.inboxId
  });
}

// Legacy function for backward compatibility
export async function addLegacySendReactionTask(data: {
  payload: any;
  recipientPhone: string;
  originalMessageId: string;
  emoji: string;
  buttonId: string;
  whatsappApiKey: string;
}) {
  await addWebhookTask({
    type: 'send_reaction',
    payload: data.payload,
    whatsappApiKey: data.whatsappApiKey,
    reactionData: {
      recipientPhone: data.recipientPhone,
      originalMessageId: data.originalMessageId,
      emoji: data.emoji,
      buttonId: data.buttonId
    }
  });
}

// New async queue functions with enhanced data structures
export async function addSendMessageTask(data: SendMessageTask) {
  const jobName = `sendMessage-${data.recipientPhone}-${Date.now()}`;
  
  try {
    await asyncWebhookQueue.add(jobName, data, {
      // Enhanced retry configuration with exponential backoff
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      // Dead letter queue configuration
      removeOnComplete: 100,
      removeOnFail: 50,
      // Add priority for urgent messages
      priority: data.messageData.type === 'template' ? 10 : 5,
      // Add correlation ID for tracing
      jobId: data.correlationId ? `${jobName}-${data.correlationId}` : jobName
    });
    
    console.log(`[MTF Diamante Async] SendMessage job enqueued: ${jobName}`, {
      recipientPhone: data.recipientPhone,
      messageType: data.messageData.type,
      correlationId: data.correlationId
    });
  } catch (error) {
    console.error(`[MTF Diamante Async] Failed to enqueue SendMessage job: ${jobName}`, error);
    throw error;
  }
}

export async function addSendReactionTask(data: SendReactionTask) {
  const jobName = `sendReaction-${data.recipientPhone}-${Date.now()}`;
  
  try {
    await asyncWebhookQueue.add(jobName, data, {
      // Enhanced retry configuration with exponential backoff
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      // Dead letter queue configuration
      removeOnComplete: 100,
      removeOnFail: 50,
      // Lower priority for reactions
      priority: 1,
      // Add correlation ID for tracing
      jobId: data.correlationId ? `${jobName}-${data.correlationId}` : jobName
    });
    
    console.log(`[MTF Diamante Async] SendReaction job enqueued: ${jobName}`, {
      recipientPhone: data.recipientPhone,
      messageId: data.messageId,
      emoji: data.emoji,
      correlationId: data.correlationId
    });
  } catch (error) {
    console.error(`[MTF Diamante Async] Failed to enqueue SendReaction job: ${jobName}`, error);
    throw error;
  }
}

// Helper function to generate correlation IDs for request tracing
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to create SendMessageTask with template data
export function createTemplateMessageTask(data: {
  recipientPhone: string;
  whatsappApiKey: string;
  templateId: string;
  templateName: string;
  variables?: Record<string, any>;
  correlationId?: string;
  metadata?: {
    intentName?: string;
    caixaId?: string;
    phoneNumberId?: string;
    originalPayload?: any;
  };
}): SendMessageTask {
  return {
    type: 'sendMessage',
    recipientPhone: data.recipientPhone,
    whatsappApiKey: data.whatsappApiKey,
    correlationId: data.correlationId || generateCorrelationId(),
    messageData: {
      type: 'template',
      templateId: data.templateId,
      templateName: data.templateName,
      variables: data.variables || {}
    },
    metadata: data.metadata
  };
}

// Helper function to create SendMessageTask with interactive message data
export function createInteractiveMessageTask(data: {
  recipientPhone: string;
  whatsappApiKey: string;
  interactiveContent: SendMessageTask['messageData']['interactiveContent'];
  correlationId?: string;
  metadata?: {
    intentName?: string;
    caixaId?: string;
    phoneNumberId?: string;
    originalPayload?: any;
  };
}): SendMessageTask {
  return {
    type: 'sendMessage',
    recipientPhone: data.recipientPhone,
    whatsappApiKey: data.whatsappApiKey,
    correlationId: data.correlationId || generateCorrelationId(),
    messageData: {
      type: 'interactive',
      interactiveContent: data.interactiveContent
    },
    metadata: data.metadata
  };
}

// Helper function to create SendReactionTask
export function createReactionTask(data: {
  recipientPhone: string;
  messageId: string;
  emoji: string;
  whatsappApiKey: string;
  correlationId?: string;
  metadata?: {
    buttonId?: string;
    phoneNumberId?: string;
    originalPayload?: any;
  };
}): SendReactionTask {
  return {
    type: 'sendReaction',
    recipientPhone: data.recipientPhone,
    messageId: data.messageId,
    emoji: data.emoji,
    whatsappApiKey: data.whatsappApiKey,
    correlationId: data.correlationId || generateCorrelationId(),
    metadata: data.metadata
  };
}

// Helper function to create SendMessageTask for text reactions
export function createTextReactionTask(data: {
  recipientPhone: string;
  whatsappApiKey: string;
  textMessage: string;
  correlationId?: string;
  metadata?: {
    buttonId?: string;
    phoneNumberId?: string;
    originalPayload?: any;
    replyToMessageId?: string;
  };
}): SendMessageTask {
  return {
    type: 'sendMessage',
    recipientPhone: data.recipientPhone,
    whatsappApiKey: data.whatsappApiKey,
    correlationId: data.correlationId || generateCorrelationId(),
    messageData: {
      type: 'text',
      textContent: data.textMessage,
      replyToMessageId: data.metadata?.replyToMessageId
    },
    metadata: data.metadata
  };
}