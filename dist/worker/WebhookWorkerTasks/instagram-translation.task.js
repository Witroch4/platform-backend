"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInstagramTranslationTask = processInstagramTranslationTask;
const client_1 = require("@prisma/client");
const instagram_translation_queue_1 = require("@/lib/queue/instagram-translation.queue");
const instagram_translation_monitor_1 = require("@/lib/monitoring/instagram-translation-monitor");
const instagram_translation_logger_1 = require("@/lib/logging/instagram-translation-logger");
const instagram_error_tracker_1 = require("@/lib/monitoring/instagram-error-tracker");
const optimized_database_queries_1 = require("@/lib/instagram/optimized-database-queries");
const instagram_template_cache_1 = require("@/lib/cache/instagram-template-cache");
const payload_builder_1 = require("@/lib/instagram/payload-builder");
const instagram_translation_validation_1 = require("@/lib/validation/instagram-translation-validation");
const instagram_translation_errors_1 = require("@/lib/error-handling/instagram-translation-errors");
const prisma = new client_1.PrismaClient();
/**
 * Instagram Translation Worker Task
 * Processes Instagram translation jobs by converting WhatsApp templates to Instagram format
 */
async function processInstagramTranslationTask(job) {
    const startTime = Date.now();
    const correlationId = job.data.correlationId;
    const initialCpuUsage = process.cpuUsage();
    const initialMemoryUsage = process.memoryUsage();
    // Create logging context
    const logContext = (0, instagram_translation_logger_1.createLogContext)(correlationId, {
        jobId: job.id?.toString(),
        intentName: job.data.intentName,
        inboxId: job.data.inboxId,
        retryCount: job.attemptsMade,
    });
    // Log job start
    instagram_translation_logger_1.instagramTranslationLogger.workerJobStarted(logContext);
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Starting Instagram translation processing', correlationId, {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts,
    });
    try {
        // Validate job data
        const validation = (0, instagram_translation_validation_1.validateJobData)(job.data);
        if (!validation.valid) {
            const error = (0, instagram_translation_errors_1.createValidationError)('job_data', validation.errors.join(', '), correlationId);
            (0, instagram_translation_errors_1.logError)(error);
            throw error;
        }
        const { intentName, inboxId, contactPhone } = validation.sanitizedData;
        // Query database for complete message mapping with optimized caching
        let messageMapping;
        let databaseQueryTime = 0;
        try {
            const dbQueryStart = Date.now();
            messageMapping = await (0, optimized_database_queries_1.findOptimizedCompleteMessageMapping)(intentName, inboxId);
            databaseQueryTime = Date.now() - dbQueryStart;
            // Record database query performance
            (0, optimized_database_queries_1.recordDatabaseQuery)('findOptimizedCompleteMessageMapping', databaseQueryTime, true);
            // Log database query performance
            instagram_translation_logger_1.instagramTranslationLogger.workerDatabaseQuery(logContext, 'findOptimizedCompleteMessageMapping', databaseQueryTime);
        }
        catch (dbError) {
            const error = (0, instagram_translation_errors_1.createDatabaseError)('findOptimizedCompleteMessageMapping', dbError, correlationId);
            (0, instagram_translation_errors_1.logError)(error);
            // Record failed database query
            (0, optimized_database_queries_1.recordDatabaseQuery)('findOptimizedCompleteMessageMapping', databaseQueryTime, false, dbError);
            // Track error
            (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.DATABASE_ERROR, error, {
                intentName,
                inboxId,
                retryCount: job.attemptsMade,
                jobId: job.id?.toString(),
            }, { queryType: 'findOptimizedCompleteMessageMapping' });
            throw error;
        }
        if (!messageMapping) {
            const error = (0, instagram_translation_errors_1.createTemplateNotFoundError)(intentName, inboxId, correlationId);
            (0, instagram_translation_errors_1.logError)(error);
            // Track error
            (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND, error, {
                intentName,
                inboxId,
                retryCount: job.attemptsMade,
                jobId: job.id?.toString(),
            }, { queryType: 'findCompleteMessageMappingByIntent' });
            throw error;
        }
        // Extract usuarioChatwitId for cache operations
        const usuarioChatwitId = messageMapping.usuarioChatwitId;
        if (!usuarioChatwitId) {
            const error = (0, instagram_translation_errors_1.createDatabaseError)('usuarioChatwitId missing from message mapping', new Error('usuarioChatwitId is required for cache operations'), correlationId);
            (0, instagram_translation_errors_1.logError)(error);
            throw error;
        }
        // Log cache key information for debugging
        (0, instagram_translation_queue_1.logWithCorrelationId)('debug', 'Cache key components extracted for Instagram translation', correlationId, {
            userContext: { usuarioChatwitId, inboxId },
            intentName,
            cacheKeyFormat: `${intentName}:${usuarioChatwitId}:${inboxId}`,
            operation: 'instagram_translation_cache_lookup',
            step: 'cache_key_generation'
        });
        // Update log context with message type
        const updatedLogContext = (0, instagram_translation_logger_1.updateLogContext)(logContext, {
            messageType: messageMapping.messageType,
        });
        (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Found message mapping', correlationId, {
            messageType: messageMapping.messageType,
            intentName,
        });
        // Process based on message type with comprehensive error handling and caching
        let fulfillmentMessages = [];
        let conversionTime = 0;
        let validationTime = 0;
        // Log conversion start
        const bodyLength = getBodyLengthFromMapping(messageMapping);
        const hasImage = getHasImageFromMapping(messageMapping);
        instagram_translation_logger_1.instagramTranslationLogger.workerConversionStarted(updatedLogContext, messageMapping.messageType, bodyLength);
        // Try to get cached conversion result first
        const cachedResult = await (0, instagram_template_cache_1.getCachedConversionResult)(intentName, usuarioChatwitId, inboxId, bodyLength, hasImage);
        if (cachedResult && cachedResult.templateType !== 'incompatible') {
            fulfillmentMessages = cachedResult.fulfillmentMessages;
            conversionTime = cachedResult.processingTime;
            (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Using cached conversion result for Instagram translation', correlationId, {
                userContext: { usuarioChatwitId, inboxId },
                intentName,
                cacheKey: `${intentName}:${usuarioChatwitId}:${inboxId}:${bodyLength}:${hasImage}`,
                templateType: cachedResult.templateType,
                bodyLength: cachedResult.originalBodyLength,
                buttonsCount: cachedResult.buttonsCount,
                hasImage: cachedResult.hasImage,
                cachedAt: cachedResult.cachedAt,
                processingTime: cachedResult.processingTime,
                operation: 'instagram_translation_cache_hit'
            });
        }
        else {
            // Cache miss - perform conversion
            try {
                const conversionStart = Date.now();
                switch (messageMapping.messageType) {
                    case 'unified_template':
                        if (messageMapping.unifiedTemplate) {
                            fulfillmentMessages = await convertUnifiedTemplateToInstagram(messageMapping.unifiedTemplate, correlationId, updatedLogContext);
                        }
                        else {
                            throw (0, instagram_translation_errors_1.createConversionFailedError)('Unified template data is missing', correlationId);
                        }
                        break;
                    case 'interactive':
                        if (messageMapping.interactiveMessage) {
                            fulfillmentMessages = await convertInteractiveMessageToInstagram(messageMapping.interactiveMessage, correlationId, updatedLogContext);
                        }
                        else {
                            throw (0, instagram_translation_errors_1.createConversionFailedError)('Interactive message data is missing', correlationId);
                        }
                        break;
                    case 'enhanced_interactive':
                        if (messageMapping.enhancedInteractiveMessage) {
                            fulfillmentMessages = await convertEnhancedInteractiveMessageToInstagram(messageMapping.enhancedInteractiveMessage, correlationId, updatedLogContext);
                        }
                        else {
                            throw (0, instagram_translation_errors_1.createConversionFailedError)('Enhanced interactive message data is missing', correlationId);
                        }
                        break;
                    case 'template':
                        // Templates are not supported for Instagram conversion yet
                        const templateError = (0, instagram_translation_errors_1.createConversionFailedError)('Template messages are not supported for Instagram conversion', correlationId, { templateName: messageMapping.template?.name });
                        (0, instagram_translation_errors_1.logError)(templateError);
                        // Track error
                        (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.CONVERSION_FAILED, templateError, {
                            intentName,
                            inboxId,
                            messageType: messageMapping.messageType,
                            retryCount: job.attemptsMade,
                            jobId: job.id?.toString(),
                        }, { templateName: messageMapping.template?.name });
                        throw templateError;
                    default:
                        const unsupportedError = (0, instagram_translation_errors_1.createConversionFailedError)(`Unsupported message type for Instagram: ${messageMapping.messageType}`, correlationId, { messageType: messageMapping.messageType });
                        (0, instagram_translation_errors_1.logError)(unsupportedError);
                        // Track error
                        (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.CONVERSION_FAILED, unsupportedError, {
                            intentName,
                            inboxId,
                            messageType: messageMapping.messageType,
                            retryCount: job.attemptsMade,
                            jobId: job.id?.toString(),
                        }, { messageType: messageMapping.messageType });
                        throw unsupportedError;
                }
                conversionTime = Date.now() - conversionStart;
                // Cache the conversion result for future use
                if (fulfillmentMessages.length > 0) {
                    const templateType = determineTemplateTypeFromMessages(fulfillmentMessages);
                    const buttonsCount = countButtonsInMessages(fulfillmentMessages);
                    await (0, instagram_template_cache_1.setCachedConversionResult)(intentName, usuarioChatwitId, inboxId, bodyLength, hasImage, {
                        fulfillmentMessages,
                        templateType: templateType,
                        processingTime: conversionTime,
                        buttonsCount,
                    });
                    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Instagram conversion result cached successfully', correlationId, {
                        userContext: { usuarioChatwitId, inboxId },
                        intentName,
                        cacheKey: `${intentName}:${usuarioChatwitId}:${inboxId}:${bodyLength}:${hasImage}`,
                        templateType,
                        bodyLength,
                        buttonsCount,
                        hasImage,
                        processingTime: conversionTime,
                        messagesGenerated: fulfillmentMessages.length,
                        operation: 'instagram_translation_cache_set'
                    });
                }
            }
            catch (conversionError) {
                if (conversionError instanceof instagram_translation_errors_1.InstagramTranslationError) {
                    // Track conversion error
                    (0, instagram_error_tracker_1.trackInstagramError)(correlationId, conversionError.code, conversionError, {
                        intentName,
                        inboxId,
                        messageType: messageMapping.messageType,
                        retryCount: job.attemptsMade,
                        jobId: job.id?.toString(),
                    });
                    throw conversionError;
                }
                const error = (0, instagram_translation_errors_1.createConversionFailedError)((0, instagram_translation_validation_1.sanitizeErrorMessage)(conversionError), correlationId, { originalError: conversionError instanceof Error ? conversionError.message : String(conversionError) });
                (0, instagram_translation_errors_1.logError)(error);
                // Track error
                (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.CONVERSION_FAILED, error, {
                    intentName,
                    inboxId,
                    messageType: messageMapping.messageType,
                    retryCount: job.attemptsMade,
                    jobId: job.id?.toString(),
                }, { originalError: conversionError instanceof Error ? conversionError.message : String(conversionError) });
                throw error;
            }
        }
        if (fulfillmentMessages.length === 0) {
            const error = (0, instagram_translation_errors_1.createConversionFailedError)('No Instagram messages generated from conversion', correlationId);
            (0, instagram_translation_errors_1.logError)(error);
            // Track error
            (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.CONVERSION_FAILED, error, {
                intentName,
                inboxId,
                messageType: messageMapping.messageType,
                retryCount: job.attemptsMade,
                jobId: job.id?.toString(),
            });
            throw error;
        }
        const processingTime = Date.now() - startTime;
        const finalCpuUsage = process.cpuUsage(initialCpuUsage);
        const finalMemoryUsage = process.memoryUsage();
        const queueWaitTime = job.processedOn ? job.processedOn - (job.timestamp || 0) : 0;
        // Log successful completion
        instagram_translation_logger_1.instagramTranslationLogger.workerJobCompleted(updatedLogContext, true, processingTime, fulfillmentMessages.length);
        (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Instagram translation completed successfully', correlationId, {
            processingTime,
            messagesGenerated: fulfillmentMessages.length,
            jobId: job.id,
        });
        // Record translation metrics
        const templateType = determineTemplateTypeFromMessages(fulfillmentMessages);
        (0, instagram_translation_monitor_1.recordInstagramTranslationMetrics)({
            correlationId,
            conversionTime,
            templateType: templateType,
            bodyLength,
            buttonsCount: countButtonsInMessages(fulfillmentMessages),
            hasImage: hasImageInMessages(fulfillmentMessages),
            success: true,
            timestamp: new Date(),
            retryCount: job.attemptsMade,
            messageType: messageMapping.messageType,
        });
        // Record worker performance metrics
        (0, instagram_translation_monitor_1.recordInstagramWorkerPerformanceMetrics)({
            correlationId,
            jobId: job.id?.toString() || 'unknown',
            processingTime,
            queueWaitTime,
            databaseQueryTime,
            conversionTime,
            validationTime,
            success: true,
            timestamp: new Date(),
            retryCount: job.attemptsMade,
            memoryUsage: finalMemoryUsage,
            cpuUsage: finalCpuUsage,
        });
        // Log the exact fulfillment messages being returned
        console.log(`[Instagram Worker] [${correlationId}] FULFILLMENT MESSAGES GENERATED:`, JSON.stringify(fulfillmentMessages, null, 2));
        console.log(`[Instagram Worker] [${correlationId}] FULFILLMENT MESSAGES STRUCTURE:`, fulfillmentMessages.map((msg, index) => ({
            index,
            hasCustomPayload: !!msg.custom_payload,
            hasInstagramPayload: !!(msg.custom_payload && msg.custom_payload.instagram),
            messageKeys: Object.keys(msg),
            customPayloadKeys: msg.custom_payload ? Object.keys(msg.custom_payload) : [],
            instagramPayloadKeys: msg.custom_payload && msg.custom_payload.instagram ? Object.keys(msg.custom_payload.instagram) : [],
            instagramPayloadType: msg.custom_payload && msg.custom_payload.instagram ? msg.custom_payload.instagram.attachment?.type : 'unknown',
        })));
        const result = {
            success: true,
            fulfillmentMessages,
            processingTime,
            metadata: {
                messagesGenerated: fulfillmentMessages.length,
                messageType: messageMapping.messageType,
                attemptsMade: job.attemptsMade,
                templateType,
                conversionTime,
                databaseQueryTime,
            },
        };
        console.log(`[Instagram Worker] [${correlationId}] FINAL RESULT BEING RETURNED:`, JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        const finalCpuUsage = process.cpuUsage(initialCpuUsage);
        const finalMemoryUsage = process.memoryUsage();
        const queueWaitTime = job.processedOn ? job.processedOn - (job.timestamp || 0) : 0;
        // Log job failure
        instagram_translation_logger_1.instagramTranslationLogger.workerJobFailed(logContext, error, error instanceof instagram_translation_errors_1.InstagramTranslationError ? error.retryable : false);
        // Handle Instagram translation errors
        if (error instanceof instagram_translation_errors_1.InstagramTranslationError) {
            (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Instagram translation error occurred', correlationId, {
                errorCode: error.code,
                retryable: error.retryable,
                processingTime,
                attemptsMade: job.attemptsMade,
            });
            // Attempt recovery if possible
            try {
                const recovery = await (0, instagram_translation_errors_1.attemptRecovery)(error);
                if (recovery.fallbackAction === 'simple_text' && recovery.fallbackMessage) {
                    // Log successful recovery
                    instagram_translation_logger_1.instagramTranslationLogger.errorRecoverySucceeded(logContext, error.code, 'simple_text');
                    // Return a simple fallback message
                    return {
                        success: true,
                        fulfillmentMessages: (0, payload_builder_1.createInstagramFallbackMessage)(recovery.fallbackMessage),
                        processingTime,
                        metadata: {
                            fallbackUsed: true,
                            originalError: error.code,
                        },
                    };
                }
            }
            catch (recoveryError) {
                instagram_translation_logger_1.instagramTranslationLogger.errorRecoveryFailed(logContext, error.code, recoveryError);
                (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Error recovery failed', correlationId, {
                    recoveryError: (0, instagram_translation_validation_1.sanitizeErrorMessage)(recoveryError),
                });
            }
            // Record failed translation metrics
            (0, instagram_translation_monitor_1.recordInstagramTranslationMetrics)({
                correlationId,
                conversionTime: 0,
                templateType: 'incompatible',
                bodyLength: 0,
                buttonsCount: 0,
                hasImage: false,
                success: false,
                error: error.message,
                errorCode: error.code,
                timestamp: new Date(),
                retryCount: job.attemptsMade,
                messageType: 'interactive',
            });
            // Record failed worker performance metrics
            (0, instagram_translation_monitor_1.recordInstagramWorkerPerformanceMetrics)({
                correlationId,
                jobId: job.id?.toString() || 'unknown',
                processingTime,
                queueWaitTime,
                databaseQueryTime: 0,
                conversionTime: 0,
                validationTime: 0,
                success: false,
                error: error.message,
                errorCode: error.code,
                timestamp: new Date(),
                retryCount: job.attemptsMade,
                memoryUsage: finalMemoryUsage,
                cpuUsage: finalCpuUsage,
            });
            // If retryable and we haven't exceeded attempts, let BullMQ retry
            if (error.retryable && job.attemptsMade < (job.opts?.attempts || 3)) {
                (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Rethrowing retryable error for BullMQ retry', correlationId, {
                    attemptsMade: job.attemptsMade,
                    maxAttempts: job.opts?.attempts,
                });
                throw error; // Let BullMQ handle the retry
            }
            return {
                success: false,
                error: error.message,
                processingTime,
                metadata: {
                    errorCode: error.code,
                    retryable: error.retryable,
                    attemptsMade: job.attemptsMade,
                    correlationId: error.correlationId,
                },
            };
        }
        // Handle unexpected errors
        const errorMessage = (0, instagram_translation_validation_1.sanitizeErrorMessage)(error);
        (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Unexpected error processing Instagram translation', correlationId, {
            error: errorMessage,
            processingTime,
            jobId: job.id,
            attemptsMade: job.attemptsMade,
        });
        // Track unexpected error
        (0, instagram_error_tracker_1.trackInstagramError)(correlationId, instagram_translation_queue_1.InstagramTranslationErrorCodes.SYSTEM_ERROR, error, {
            intentName: job.data.intentName,
            inboxId: job.data.inboxId,
            retryCount: job.attemptsMade,
            jobId: job.id?.toString(),
        }, { unexpectedError: true });
        // Record failed translation metrics
        (0, instagram_translation_monitor_1.recordInstagramTranslationMetrics)({
            correlationId,
            conversionTime: 0,
            templateType: 'incompatible',
            bodyLength: 0,
            buttonsCount: 0,
            hasImage: false,
            success: false,
            error: errorMessage,
            errorCode: instagram_translation_queue_1.InstagramTranslationErrorCodes.SYSTEM_ERROR,
            timestamp: new Date(),
            retryCount: job.attemptsMade,
            messageType: 'interactive',
        });
        // Record failed worker performance metrics
        (0, instagram_translation_monitor_1.recordInstagramWorkerPerformanceMetrics)({
            correlationId,
            jobId: job.id?.toString() || 'unknown',
            processingTime,
            queueWaitTime,
            databaseQueryTime: 0,
            conversionTime: 0,
            validationTime: 0,
            success: false,
            error: errorMessage,
            errorCode: instagram_translation_queue_1.InstagramTranslationErrorCodes.SYSTEM_ERROR,
            timestamp: new Date(),
            retryCount: job.attemptsMade,
            memoryUsage: finalMemoryUsage,
            cpuUsage: finalCpuUsage,
        });
        // Check if error might be retryable
        const retryable = (0, instagram_translation_errors_1.isRetryableError)(error);
        if (retryable && job.attemptsMade < (job.opts?.attempts || 3)) {
            (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Rethrowing potentially retryable error', correlationId, {
                attemptsMade: job.attemptsMade,
                maxAttempts: job.opts?.attempts,
            });
            throw error; // Let BullMQ handle the retry
        }
        return {
            success: false,
            error: errorMessage,
            processingTime,
            metadata: {
                unexpectedError: true,
                attemptsMade: job.attemptsMade,
            },
        };
    }
}
/**
 * Convert unified template to Instagram format with comprehensive validation
 */
async function convertUnifiedTemplateToInstagram(unifiedTemplate, correlationId, logContext) {
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Converting unified template to Instagram', correlationId, {
        templateType: unifiedTemplate.type,
        templateName: unifiedTemplate.name,
    });
    // Handle different template types
    switch (unifiedTemplate.type) {
        case 'INTERACTIVE_MESSAGE':
            if (unifiedTemplate.interactiveContent) {
                return await convertInteractiveContentToInstagram(unifiedTemplate.interactiveContent, correlationId, logContext);
            }
            else {
                throw (0, instagram_translation_errors_1.createConversionFailedError)('Interactive content is missing from unified template', correlationId);
            }
        case 'AUTOMATION_REPLY':
            if (unifiedTemplate.simpleReplyText) {
                return await convertSimpleReplyToInstagram(unifiedTemplate.simpleReplyText, correlationId, logContext);
            }
            else {
                throw (0, instagram_translation_errors_1.createConversionFailedError)('Simple reply text is missing from unified template', correlationId);
            }
        case 'WHATSAPP_OFFICIAL':
            // WhatsApp Official templates are not supported for Instagram yet
            const whatsappError = (0, instagram_translation_errors_1.createConversionFailedError)('WhatsApp Official templates are not supported for Instagram conversion', correlationId, { templateName: unifiedTemplate.name, templateType: unifiedTemplate.type });
            (0, instagram_translation_errors_1.logError)(whatsappError);
            throw whatsappError;
        default:
            const unsupportedError = (0, instagram_translation_errors_1.createConversionFailedError)(`Unsupported unified template type for Instagram: ${unifiedTemplate.type}`, correlationId, { templateType: unifiedTemplate.type, templateName: unifiedTemplate.name });
            (0, instagram_translation_errors_1.logError)(unsupportedError);
            throw unsupportedError;
    }
}
/**
 * Convert InteractiveContent to Instagram format
 */
async function convertInteractiveContentToInstagram(interactiveContent, correlationId, logContext) {
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Converting interactive content to Instagram', correlationId);
    // Extract body text
    const bodyText = interactiveContent.body?.text || '';
    if (!bodyText) {
        throw (0, instagram_translation_errors_1.createValidationError)('interactive_content.body.text', 'Body text is required for interactive content', correlationId);
    }
    // Extract header information
    const hasImage = interactiveContent.header?.type === 'image' && interactiveContent.header?.content;
    const imageUrl = hasImage ? interactiveContent.header.content : undefined;
    // Extract footer text
    const footerText = interactiveContent.footer?.text;
    // Determine template type based on body length
    const templateType = (0, payload_builder_1.determineInstagramTemplateType)(bodyText, hasImage);
    // Log template type detection
    instagram_translation_logger_1.instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, `Body length: ${bodyText.length}, Has image: ${hasImage}`);
    // Note: No longer throwing error for long messages - Quick Replies will handle them
    // Convert buttons to Instagram format
    let instagramButtons = [];
    try {
        const originalButtonCount = interactiveContent.actionReplyButton?.buttons?.length || 0;
        if (interactiveContent.actionReplyButton?.buttons) {
            instagramButtons = convertUnifiedButtonsToInstagram(interactiveContent.actionReplyButton.buttons);
        }
        // Log button conversion
        instagram_translation_logger_1.instagramTranslationLogger.workerButtonsConverted(logContext, originalButtonCount, instagramButtons.length);
    }
    catch (buttonError) {
        (0, instagram_translation_queue_1.logWithCorrelationId)('warn', 'Error converting unified buttons, using empty array', correlationId, {
            error: (0, instagram_translation_validation_1.sanitizeErrorMessage)(buttonError),
        });
        instagramButtons = [];
    }
    let fulfillmentMessages;
    try {
        if (templateType === 'generic') {
            // Use Generic Template for messages ≤80 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramGenericTemplate)(bodyText, footerText, // subtitle
            imageUrl, // image URL
            instagramButtons);
        }
        else if (templateType === 'button') {
            // Use Button Template for messages 81-640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramButtonTemplate)(bodyText, instagramButtons);
        }
        else {
            // Use Quick Replies for messages >640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramQuickReplies)(bodyText, instagramButtons);
        }
    }
    catch (templateError) {
        throw (0, instagram_translation_errors_1.createConversionFailedError)(`Failed to create Instagram template from interactive content: ${(0, instagram_translation_validation_1.sanitizeErrorMessage)(templateError)}`, correlationId, { templateType, bodyLength: bodyText.length });
    }
    // Validate the generated template
    if (fulfillmentMessages.length > 0) {
        const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
        const template = socialwiseResponse?.payload;
        if (template) {
            const templateValidation = (0, payload_builder_1.validateInstagramTemplate)(template);
            // Log validation result
            instagram_translation_logger_1.instagramTranslationLogger.workerValidationPerformed(logContext, 'unified_instagram_template', templateValidation.isValid, templateValidation.errors);
            if (!templateValidation.isValid) {
                (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Generated Instagram template validation failed', correlationId, {
                    errors: templateValidation.errors,
                    template,
                    messageFormat: socialwiseResponse.message_format,
                });
                throw (0, instagram_translation_errors_1.createConversionFailedError)(`Generated unified template validation failed: ${templateValidation.errors.join(', ')}`, correlationId, { validationErrors: templateValidation.errors });
            }
        }
    }
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Interactive content converted successfully', correlationId, {
        templateType,
        bodyLength: bodyText.length,
        buttonsCount: instagramButtons.length,
        hasImage,
    });
    return fulfillmentMessages;
}
/**
 * Convert simple reply text to Instagram format
 */
async function convertSimpleReplyToInstagram(simpleReplyText, correlationId, logContext) {
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Converting simple reply to Instagram', correlationId);
    if (!simpleReplyText || simpleReplyText.trim().length === 0) {
        throw (0, instagram_translation_errors_1.createValidationError)('simple_reply_text', 'Simple reply text cannot be empty', correlationId);
    }
    const bodyText = simpleReplyText.trim();
    // Determine template type based on body length
    const templateType = (0, payload_builder_1.determineInstagramTemplateType)(bodyText, false);
    // Log template type detection
    instagram_translation_logger_1.instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, `Body length: ${bodyText.length}, Simple reply`);
    // Note: No longer throwing error for long messages - Quick Replies will handle them
    let fulfillmentMessages;
    try {
        if (templateType === 'generic') {
            // Use Generic Template for messages ≤80 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramGenericTemplate)(bodyText, undefined, // no subtitle
            undefined, // no image
            [] // no buttons
            );
        }
        else if (templateType === 'button') {
            // Use Button Template for messages 81-640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramButtonTemplate)(bodyText, [] // no buttons
            );
        }
        else {
            // Use Quick Replies for messages >640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramQuickReplies)(bodyText, [] // no buttons
            );
        }
    }
    catch (templateError) {
        throw (0, instagram_translation_errors_1.createConversionFailedError)(`Failed to create Instagram template from simple reply: ${(0, instagram_translation_validation_1.sanitizeErrorMessage)(templateError)}`, correlationId, { templateType, bodyLength: bodyText.length });
    }
    // Validate the generated template
    if (fulfillmentMessages.length > 0) {
        const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
        const template = socialwiseResponse?.payload;
        if (template) {
            const templateValidation = (0, payload_builder_1.validateInstagramTemplate)(template);
            // Log validation result
            instagram_translation_logger_1.instagramTranslationLogger.workerValidationPerformed(logContext, 'simple_reply_instagram_template', templateValidation.isValid, templateValidation.errors);
            if (!templateValidation.isValid) {
                (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Generated Instagram template validation failed', correlationId, {
                    errors: templateValidation.errors,
                    template,
                    messageFormat: socialwiseResponse.message_format,
                });
                throw (0, instagram_translation_errors_1.createConversionFailedError)(`Generated simple reply template validation failed: ${templateValidation.errors.join(', ')}`, correlationId, { validationErrors: templateValidation.errors });
            }
        }
    }
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Simple reply converted successfully', correlationId, {
        templateType,
        bodyLength: bodyText.length,
    });
    return fulfillmentMessages;
}
/**
 * Convert unified buttons to Instagram format
 */
function convertUnifiedButtonsToInstagram(buttons) {
    if (!Array.isArray(buttons)) {
        return [];
    }
    return buttons.map((button) => {
        const instagramButton = {
            title: button.title ? button.title.substring(0, 20) : 'Button', // Instagram button title limit
            type: 'postback',
            payload: button.id || 'default_payload',
        };
        // Map button types based on unified button structure
        if (button.type === 'web_url' && button.url) {
            instagramButton.type = 'web_url';
            instagramButton.url = button.url;
            delete instagramButton.payload;
        }
        return instagramButton;
    }).slice(0, 3); // Limit to 3 buttons for Instagram
}
/**
 * Convert interactive message to Instagram format with comprehensive validation
 */
async function convertInteractiveMessageToInstagram(interactiveMessage, correlationId, logContext) {
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Converting interactive message to Instagram', correlationId);
    // Validate the interactive message structure
    const validation = (0, instagram_translation_validation_1.validateForInstagramConversion)(interactiveMessage);
    if (!validation.valid) {
        throw (0, instagram_translation_errors_1.createValidationError)('interactive_message', validation.errors.join(', '), correlationId);
    }
    // Log warnings if any
    if (validation.warnings.length > 0) {
        (0, instagram_translation_queue_1.logWithCorrelationId)('warn', 'Conversion warnings detected', correlationId, {
            warnings: validation.warnings,
        });
    }
    const bodyText = interactiveMessage.texto || '';
    const hasImage = interactiveMessage.headerTipo === 'image' && interactiveMessage.headerConteudo;
    // Log detailed message info for debugging
    console.log(`[Instagram Worker] [${correlationId}] INTERACTIVE MESSAGE DETAILS:`, {
        bodyText: bodyText.substring(0, 100) + (bodyText.length > 100 ? '...' : ''),
        bodyLength: bodyText.length,
        hasImage,
        headerTipo: interactiveMessage.headerTipo,
        headerConteudo: interactiveMessage.headerConteudo ? 'present' : 'missing',
        rodape: interactiveMessage.rodape,
        botoesCount: interactiveMessage.botoes?.length || 0,
    });
    // Determine template type based on body length
    const templateType = (0, payload_builder_1.determineInstagramTemplateType)(bodyText, hasImage);
    // Log template type detection with detailed reasoning
    console.log(`[Instagram Worker] [${correlationId}] TEMPLATE TYPE SELECTION:`, {
        bodyLength: bodyText.length,
        hasImage,
        templateType,
        reasoning: bodyText.length <= 80 ? 'Generic (≤80 chars)' : bodyText.length <= 640 ? 'Button (81-640 chars)' : 'Quick Replies (>640 chars)'
    });
    instagram_translation_logger_1.instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, `Body length: ${bodyText.length}, Has image: ${hasImage}`);
    // Note: No longer throwing error for long messages - Quick Replies will handle them
    // Convert buttons to Instagram format with error handling
    let instagramButtons = [];
    try {
        const originalButtonCount = interactiveMessage.botoes?.length || 0;
        instagramButtons = interactiveMessage.botoes
            ? (0, payload_builder_1.convertWhatsAppButtonsToInstagram)(interactiveMessage.botoes)
            : [];
        // Log button conversion
        instagram_translation_logger_1.instagramTranslationLogger.workerButtonsConverted(logContext, originalButtonCount, instagramButtons.length);
    }
    catch (buttonError) {
        (0, instagram_translation_queue_1.logWithCorrelationId)('warn', 'Error converting buttons, using empty array', correlationId, {
            error: (0, instagram_translation_validation_1.sanitizeErrorMessage)(buttonError),
        });
        instagramButtons = [];
    }
    let fulfillmentMessages;
    try {
        console.log(`[Instagram Worker] [${correlationId}] CREATING TEMPLATE:`, {
            templateType,
            bodyLength: bodyText.length,
            buttonsCount: instagramButtons.length,
            hasImage,
        });
        if (templateType === 'generic') {
            // Use Generic Template for messages ≤80 characters
            console.log(`[Instagram Worker] [${correlationId}] Creating Generic Template with:`, {
                title: bodyText,
                subtitle: interactiveMessage.rodape,
                imageUrl: hasImage ? interactiveMessage.headerConteudo : undefined,
                buttonsCount: instagramButtons.length,
            });
            fulfillmentMessages = (0, payload_builder_1.createInstagramGenericTemplate)(bodyText, interactiveMessage.rodape, // subtitle
            hasImage ? interactiveMessage.headerConteudo : undefined, // image URL
            instagramButtons);
        }
        else if (templateType === 'button') {
            // Use Button Template for messages 81-640 characters
            console.log(`[Instagram Worker] [${correlationId}] Creating Button Template with:`, {
                text: bodyText,
                buttonsCount: instagramButtons.length,
                note: 'Header and footer discarded for Button Template',
            });
            fulfillmentMessages = (0, payload_builder_1.createInstagramButtonTemplate)(bodyText, instagramButtons);
        }
        else {
            // Use Quick Replies for messages >640 characters
            console.log(`[Instagram Worker] [${correlationId}] Creating Quick Replies with:`, {
                text: bodyText.substring(0, 100) + (bodyText.length > 100 ? '...' : ''),
                textLength: bodyText.length,
                buttonsCount: instagramButtons.length,
                note: 'Header and footer discarded for Quick Replies',
            });
            fulfillmentMessages = (0, payload_builder_1.createInstagramQuickReplies)(bodyText, instagramButtons);
        }
        console.log(`[Instagram Worker] [${correlationId}] TEMPLATE CREATED SUCCESSFULLY:`, {
            templateType,
            messagesCount: fulfillmentMessages.length,
            firstMessageStructure: fulfillmentMessages[0] ? Object.keys(fulfillmentMessages[0]) : [],
            socialwiseResponseFormat: fulfillmentMessages[0]?.payload?.socialwiseResponse?.message_format,
        });
    }
    catch (templateError) {
        console.log(`[Instagram Worker] [${correlationId}] TEMPLATE CREATION FAILED:`, {
            templateType,
            bodyLength: bodyText.length,
            error: (0, instagram_translation_validation_1.sanitizeErrorMessage)(templateError),
        });
        throw (0, instagram_translation_errors_1.createConversionFailedError)(`Failed to create Instagram template: ${(0, instagram_translation_validation_1.sanitizeErrorMessage)(templateError)}`, correlationId, { templateType, bodyLength: bodyText.length });
    }
    // Validate the generated template
    if (fulfillmentMessages.length > 0) {
        const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
        const template = socialwiseResponse?.payload;
        if (template) {
            const templateValidation = (0, payload_builder_1.validateInstagramTemplate)(template);
            // Log validation result
            instagram_translation_logger_1.instagramTranslationLogger.workerValidationPerformed(logContext, 'instagram_template', templateValidation.isValid, templateValidation.errors);
            if (!templateValidation.isValid) {
                (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Generated Instagram template validation failed', correlationId, {
                    errors: templateValidation.errors,
                    template,
                    messageFormat: socialwiseResponse.message_format,
                });
                throw (0, instagram_translation_errors_1.createConversionFailedError)(`Generated template validation failed: ${templateValidation.errors.join(', ')}`, correlationId, { validationErrors: templateValidation.errors });
            }
        }
    }
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Interactive message converted successfully', correlationId, {
        templateType,
        bodyLength: bodyText.length,
        buttonsCount: instagramButtons.length,
        hasImage,
    });
    return fulfillmentMessages;
}
/**
 * Convert enhanced interactive message to Instagram format with comprehensive validation
 */
async function convertEnhancedInteractiveMessageToInstagram(enhancedMessage, correlationId, logContext) {
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Converting enhanced interactive message to Instagram', correlationId);
    // Basic validation of enhanced message structure
    if (!enhancedMessage.bodyText) {
        throw (0, instagram_translation_errors_1.createValidationError)('enhanced_message.bodyText', 'Body text is required for enhanced interactive messages', correlationId);
    }
    const bodyText = enhancedMessage.bodyText;
    const hasImage = enhancedMessage.headerType === 'image' && enhancedMessage.headerContent;
    // Determine template type based on body length
    const templateType = (0, payload_builder_1.determineInstagramTemplateType)(bodyText, hasImage);
    // Log template type detection
    instagram_translation_logger_1.instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, `Body length: ${bodyText.length}, Has image: ${hasImage}, Message type: ${enhancedMessage.type}`);
    // Note: No longer throwing error for long messages - Quick Replies will handle them
    // Convert buttons from actionData with error handling
    let instagramButtons = [];
    try {
        const originalButtonCount = enhancedMessage.actionData?.buttons?.length || 0;
        if (enhancedMessage.type === 'button' && enhancedMessage.actionData?.buttons) {
            instagramButtons = (0, payload_builder_1.convertEnhancedButtonsToInstagram)(enhancedMessage.actionData.buttons);
        }
        // Log button conversion
        instagram_translation_logger_1.instagramTranslationLogger.workerButtonsConverted(logContext, originalButtonCount, instagramButtons.length);
    }
    catch (buttonError) {
        (0, instagram_translation_queue_1.logWithCorrelationId)('warn', 'Error converting enhanced buttons, using empty array', correlationId, {
            error: (0, instagram_translation_validation_1.sanitizeErrorMessage)(buttonError),
            messageType: enhancedMessage.type,
        });
        instagramButtons = [];
    }
    let fulfillmentMessages;
    try {
        if (templateType === 'generic') {
            // Use Generic Template for messages ≤80 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramGenericTemplate)(bodyText, enhancedMessage.footerText, // subtitle
            hasImage ? enhancedMessage.headerContent : undefined, // image URL
            instagramButtons);
        }
        else if (templateType === 'button') {
            // Use Button Template for messages 81-640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramButtonTemplate)(bodyText, instagramButtons);
        }
        else {
            // Use Quick Replies for messages >640 characters
            fulfillmentMessages = (0, payload_builder_1.createInstagramQuickReplies)(bodyText, instagramButtons);
        }
    }
    catch (templateError) {
        throw (0, instagram_translation_errors_1.createConversionFailedError)(`Failed to create Instagram template from enhanced message: ${(0, instagram_translation_validation_1.sanitizeErrorMessage)(templateError)}`, correlationId, {
            templateType,
            bodyLength: bodyText.length,
            messageType: enhancedMessage.type,
            hasActionData: !!enhancedMessage.actionData,
        });
    }
    // Validate the generated template
    if (fulfillmentMessages.length > 0) {
        const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
        const template = socialwiseResponse?.payload;
        if (template) {
            const templateValidation = (0, payload_builder_1.validateInstagramTemplate)(template);
            // Log validation result
            instagram_translation_logger_1.instagramTranslationLogger.workerValidationPerformed(logContext, 'enhanced_instagram_template', templateValidation.isValid, templateValidation.errors);
            if (!templateValidation.isValid) {
                (0, instagram_translation_queue_1.logWithCorrelationId)('error', 'Generated Instagram template validation failed', correlationId, {
                    errors: templateValidation.errors,
                    template,
                    messageType: enhancedMessage.type,
                    messageFormat: socialwiseResponse.message_format,
                });
                throw (0, instagram_translation_errors_1.createConversionFailedError)(`Generated enhanced template validation failed: ${templateValidation.errors.join(', ')}`, correlationId, {
                    validationErrors: templateValidation.errors,
                    messageType: enhancedMessage.type,
                });
            }
        }
    }
    (0, instagram_translation_queue_1.logWithCorrelationId)('info', 'Enhanced interactive message converted successfully', correlationId, {
        templateType,
        bodyLength: bodyText.length,
        buttonsCount: instagramButtons.length,
        hasImage,
        messageType: enhancedMessage.type,
    });
    return fulfillmentMessages;
}
// Helper functions for extracting data from different message mapping types
function getBodyLengthFromMapping(messageMapping) {
    // Unified template
    if (messageMapping.unifiedTemplate) {
        if (messageMapping.unifiedTemplate.interactiveContent?.body?.text) {
            return messageMapping.unifiedTemplate.interactiveContent.body.text.length;
        }
        if (messageMapping.unifiedTemplate.simpleReplyText) {
            return messageMapping.unifiedTemplate.simpleReplyText.length;
        }
        return 0;
    }
    // Legacy interactive message
    if (messageMapping.interactiveMessage?.texto) {
        return messageMapping.interactiveMessage.texto.length;
    }
    // Legacy enhanced interactive message
    if (messageMapping.enhancedInteractiveMessage?.bodyText) {
        return messageMapping.enhancedInteractiveMessage.bodyText.length;
    }
    return 0;
}
function getHasImageFromMapping(messageMapping) {
    // Unified template
    if (messageMapping.unifiedTemplate?.interactiveContent?.header) {
        const header = messageMapping.unifiedTemplate.interactiveContent.header;
        return header.type === 'image' && !!header.content;
    }
    // Legacy interactive message
    if (messageMapping.interactiveMessage) {
        return messageMapping.interactiveMessage.headerTipo === 'image' &&
            !!messageMapping.interactiveMessage.headerConteudo;
    }
    // Legacy enhanced interactive message
    if (messageMapping.enhancedInteractiveMessage) {
        return messageMapping.enhancedInteractiveMessage.headerType === 'image' &&
            !!messageMapping.enhancedInteractiveMessage.headerContent;
    }
    return false;
}
// Helper functions for metrics extraction
function determineTemplateTypeFromMessages(messages) {
    if (messages.length === 0)
        return 'incompatible';
    const firstMessage = messages[0];
    const socialwiseResponse = firstMessage?.payload?.socialwiseResponse;
    if (socialwiseResponse?.message_format) {
        // Convert Socialwise format to template type
        switch (socialwiseResponse.message_format) {
            case 'GENERIC_TEMPLATE':
                return 'generic';
            case 'BUTTON_TEMPLATE':
                return 'button';
            case 'QUICK_REPLIES':
                return 'quick_replies';
            default:
                return 'generic';
        }
    }
    return 'generic';
}
function countButtonsInMessages(messages) {
    if (messages.length === 0)
        return 0;
    const firstMessage = messages[0];
    const socialwiseResponse = firstMessage?.payload?.socialwiseResponse;
    const payload = socialwiseResponse?.payload;
    if (socialwiseResponse?.message_format === 'GENERIC_TEMPLATE' && payload?.elements?.[0]?.buttons) {
        return payload.elements[0].buttons.length;
    }
    if (socialwiseResponse?.message_format === 'BUTTON_TEMPLATE' && payload?.buttons) {
        return payload.buttons.length;
    }
    if (socialwiseResponse?.message_format === 'QUICK_REPLIES' && payload?.quick_replies) {
        return payload.quick_replies.length;
    }
    return 0;
}
function hasImageInMessages(messages) {
    if (messages.length === 0)
        return false;
    const firstMessage = messages[0];
    const socialwiseResponse = firstMessage?.payload?.socialwiseResponse;
    const payload = socialwiseResponse?.payload;
    if (socialwiseResponse?.message_format === 'GENERIC_TEMPLATE' && payload?.elements?.[0]?.image_url) {
        return true;
    }
    return false;
}
