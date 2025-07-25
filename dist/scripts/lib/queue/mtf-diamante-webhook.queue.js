"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncWebhookQueue = exports.mtfDiamanteWebhookQueue = exports.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME = void 0;
exports.addWebhookTask = addWebhookTask;
exports.addStoreMessageTask = addStoreMessageTask;
exports.addUpdateApiKeyTask = addUpdateApiKeyTask;
exports.addProcessIntentTask = addProcessIntentTask;
exports.addProcessButtonClickTask = addProcessButtonClickTask;
exports.addLegacySendReactionTask = addLegacySendReactionTask;
exports.addSendMessageTask = addSendMessageTask;
exports.addSendReactionTask = addSendReactionTask;
exports.generateCorrelationId = generateCorrelationId;
exports.createTemplateMessageTask = createTemplateMessageTask;
exports.createInteractiveMessageTask = createInteractiveMessageTask;
exports.createReactionTask = createReactionTask;
exports.createTextReactionTask = createTextReactionTask;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME = 'mtf-diamante-webhook';
// Legacy queue for backward compatibility
exports.mtfDiamanteWebhookQueue = new bullmq_1.Queue(exports.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME, {
    connection: redis_1.connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50
    }
});
// New async queue for self-contained tasks
exports.asyncWebhookQueue = new bullmq_1.Queue(`${exports.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME}-async`, {
    connection: redis_1.connection,
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
});
async function addWebhookTask(taskData) {
    const jobName = `${taskData.type}-${taskData.messageId || Date.now()}`;
    await exports.mtfDiamanteWebhookQueue.add(jobName, taskData, {
    // Use default options from queue configuration
    });
    console.log(`[MTF Diamante Webhook] Job enfileirado: ${jobName}`);
}
async function addStoreMessageTask(data) {
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
async function addUpdateApiKeyTask(data) {
    await addWebhookTask({
        type: 'update_api_key',
        inboxId: data.inboxId,
        whatsappApiKey: data.whatsappApiKey,
        payload: data.payload, // 2. Passe o payload para a tarefa
    });
}
async function addProcessIntentTask(data) {
    await addWebhookTask({
        type: 'process_intent',
        payload: data.payload,
        intentName: data.intentName,
        contactPhone: data.contactPhone
    });
}
async function addProcessButtonClickTask(data) {
    await addWebhookTask({
        type: 'processButtonClick',
        payload: data.payload,
        contactPhone: data.contactPhone,
        whatsappApiKey: data.whatsappApiKey,
        inboxId: data.inboxId
    });
}
// Legacy function for backward compatibility
async function addLegacySendReactionTask(data) {
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
async function addSendMessageTask(data) {
    const jobName = `sendMessage-${data.recipientPhone}-${Date.now()}`;
    try {
        await exports.asyncWebhookQueue.add(jobName, data, {
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
    }
    catch (error) {
        console.error(`[MTF Diamante Async] Failed to enqueue SendMessage job: ${jobName}`, error);
        throw error;
    }
}
async function addSendReactionTask(data) {
    const jobName = `sendReaction-${data.recipientPhone}-${Date.now()}`;
    try {
        await exports.asyncWebhookQueue.add(jobName, data, {
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
    }
    catch (error) {
        console.error(`[MTF Diamante Async] Failed to enqueue SendReaction job: ${jobName}`, error);
        throw error;
    }
}
// Helper function to generate correlation IDs for request tracing
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
// Helper function to create SendMessageTask with template data
function createTemplateMessageTask(data) {
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
function createInteractiveMessageTask(data) {
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
function createReactionTask(data) {
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
function createTextReactionTask(data) {
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
