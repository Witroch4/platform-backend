import { Job } from 'bullmq';
import { getPrismaInstance } from "@/lib/connections";
import {
  InstagramTranslationJobData,
  InstagramTranslationResult,
  logWithCorrelationId,
} from '@/lib/queue/instagram-translation.queue';
import { InstagramTranslationErrorCodes } from '@/lib/error-handling/instagram-translation-errors';
import {
  instagramTranslationMonitor,
  recordInstagramTranslationMetrics,
  recordInstagramWorkerPerformanceMetrics,
} from '@/lib/monitoring/instagram-translation-monitor';
import {
  instagramTranslationLogger,
  createLogContext,
  updateLogContext,
} from '@/lib/logging/instagram-translation-logger';
import {
  trackInstagramError,
} from '@/lib/monitoring/instagram-error-tracker';
import { findCompleteMessageMappingByIntent } from '@/lib/dialogflow-database-queries';
import {
  findOptimizedCompleteMessageMapping,
  recordDatabaseQuery,
} from '@/lib/instagram/optimized-database-queries';
import {
  getCachedConversionResult,
  setCachedConversionResult,
} from '@/lib/cache/instagram-template-cache';
import {
  createInstagramGenericTemplate,
  createInstagramButtonTemplate,
  createInstagramQuickReplies,
  createInstagramFallbackMessage,
  convertWhatsAppButtonsToInstagram,
  convertEnhancedButtonsToInstagram,
  determineInstagramTemplateType,
  validateInstagramTemplate,
  DialogflowFulfillmentMessage,
} from '@/lib/instagram/payload-builder';
import { buildInstagramFromInteractiveContent } from '@/lib/instagram/instagra-translate-payload-builder';
import {
  validateJobData,
  validateForInstagramConversion,
  sanitizeErrorMessage,
} from '@/lib/validation/instagram-translation-validation';
import {
  InstagramTranslationError,
  createTemplateNotFoundError,
  createDatabaseError,
  createConversionFailedError,
  createValidationError,
  logError,
  attemptRecovery,
  isRetryableError,
} from '@/lib/error-handling/instagram-translation-errors';
import {
  getCachedVariablesForUser,
  replaceVariablesInText
} from '../../lib/mtf-diamante/variables-resolver';
import { METAVariablesResolver } from '@/lib/socialwise-flow/variables-resolverMETA';

const prisma = getPrismaInstance();

/**
 * Busca o userId baseado no inboxId para aplicar variáveis 
 */
async function getUserIdFromMessageMapping(messageMapping: any): Promise<string | null> {
  try {
    // O messageMapping já contém o usuarioChatwitId
    if (messageMapping.usuarioChatwitId) {
      const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
        where: { id: messageMapping.usuarioChatwitId }
      });
      
      if (usuarioChatwit?.appUserId) {
        console.log(`[Instagram Variables] UserId encontrado: ${usuarioChatwit.appUserId}`);
        return usuarioChatwit.appUserId;
      }
    }
    
    console.warn(`[Instagram Variables] UserId não encontrado no messageMapping`);
    return null;
  } catch (error) {
    console.error(`[Instagram Variables] Erro ao buscar userId:`, error);
    return null;
  }
}

/**
 * Extrai o nome do lead do payload original (Dialogflow/Chatwoot)
 */
function extractPersonNameFromPayload(originalPayload: any): string | undefined {
  try {
    const nameFromParams = originalPayload?.queryResult?.parameters?.person?.name;
    if (nameFromParams && typeof nameFromParams === 'string' && nameFromParams.trim()) {
      return nameFromParams.trim();
    }
    const nameFromPayload = originalPayload?.originalDetectIntentRequest?.payload?.contact_name;
    if (nameFromPayload && typeof nameFromPayload === 'string' && nameFromPayload.trim()) {
      return nameFromPayload.trim();
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Instagram Translation Worker Task
 * Processes Instagram translation jobs by converting WhatsApp templates to Instagram format
 */
export async function processInstagramTranslationTask(
  job: Job<InstagramTranslationJobData>
): Promise<InstagramTranslationResult> {
  const startTime = Date.now();
  const correlationId = job.data.correlationId;
  const initialCpuUsage = process.cpuUsage();
  const initialMemoryUsage = process.memoryUsage();

  // Create logging context
  const logContext = createLogContext(correlationId, {
    jobId: job.id?.toString(),
    intentName: job.data.intentName,
    inboxId: job.data.inboxId,
    retryCount: job.attemptsMade,
  });

  // Log job start
  instagramTranslationLogger.workerJobStarted(logContext);

  logWithCorrelationId('info', 'Starting Instagram translation processing', correlationId, {
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts,
  });

  try {
    // Validate job data
    const validation = validateJobData(job.data);
    if (!validation.valid) {
      const error = createValidationError('job_data', validation.errors.join(', '), correlationId);
      logError(error);
      throw error;
    }

    const { intentName, inboxId, contactPhone } = validation.sanitizedData!;

    // Se for clique de botão (instagram via Chatwoot), apenas sinalizar reação e reply em contexto no payload final
    const buttonContextMeta = await getInstagramReactionAndReplyMeta(job).catch(() => undefined);

    // Query database for complete message mapping with optimized caching
    let messageMapping;
    let databaseQueryTime = 0;
    try {
      const dbQueryStart = Date.now();
      messageMapping = await findOptimizedCompleteMessageMapping(intentName, inboxId);
      databaseQueryTime = Date.now() - dbQueryStart;
      
      // Record database query performance
      recordDatabaseQuery('findOptimizedCompleteMessageMapping', databaseQueryTime, true);
      
      // Log database query performance
      instagramTranslationLogger.workerDatabaseQuery(logContext, 'findOptimizedCompleteMessageMapping', databaseQueryTime);
    } catch (dbError) {
      const error = createDatabaseError('findOptimizedCompleteMessageMapping', dbError as Error, correlationId);
      logError(error);
      
      // Record failed database query
      recordDatabaseQuery('findOptimizedCompleteMessageMapping', databaseQueryTime, false, dbError as Error);
      
      // Track error
      trackInstagramError(correlationId, InstagramTranslationErrorCodes.DATABASE_ERROR, error, {
        intentName,
        inboxId,
        retryCount: job.attemptsMade,
        jobId: job.id?.toString(),
      }, { queryType: 'findOptimizedCompleteMessageMapping' });
      
      throw error;
    }

    if (!messageMapping) {
      const error = createTemplateNotFoundError(intentName, inboxId, correlationId);
      logError(error);
      
      // Track error
      trackInstagramError(correlationId, InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND, error, {
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
      const error = createDatabaseError('usuarioChatwitId missing from message mapping', new Error('usuarioChatwitId is required for cache operations'), correlationId);
      logError(error);
      throw error;
    }

    // Log cache key information for debugging
    logWithCorrelationId('debug', 'Cache key components extracted for Instagram translation', correlationId, {
      userContext: { usuarioChatwitId, inboxId },
      intentName,
      cacheKeyFormat: `${intentName}:${usuarioChatwitId}:${inboxId}`,
      operation: 'instagram_translation_cache_lookup',
      step: 'cache_key_generation'
    });

    // Update log context with message type
    const updatedLogContext = updateLogContext(logContext, {
      messageType: messageMapping.messageType,
    });

    logWithCorrelationId('info', 'Found message mapping', correlationId, {
      messageType: messageMapping.messageType,
      intentName,
    });

    // Process based on message type with comprehensive error handling and caching
    let fulfillmentMessages: any[] = [];
    let conversionTime = 0;
    let validationTime = 0;

    // Log conversion start
    const bodyLength = getBodyLengthFromMapping(messageMapping);
    const hasImage = getHasImageFromMapping(messageMapping);
    
    instagramTranslationLogger.workerConversionStarted(updatedLogContext, messageMapping.messageType, bodyLength);

    // Try to get cached conversion result first
    // Detectar se o template usa variável de lead (ex.: {{nome_lead}}) para isolar cache por lead
    const usesLeadVariable = (() => {
      try {
        const needle = /\{\{\s*nome_lead\s*\}\}/;
        // unified
        const ic = messageMapping?.unifiedTemplate?.interactiveContent;
        const uHeader = ic?.header?.content || '';
        const uBody = ic?.body?.text || '';
        const uFooter = ic?.footer?.text || '';
        if (needle.test(`${uHeader} ${uBody} ${uFooter}`)) return true;

        // legacy interactive
        const lHeader = messageMapping?.interactiveMessage?.headerConteudo || '';
        const lBody = messageMapping?.interactiveMessage?.texto || '';
        const lFooter = messageMapping?.interactiveMessage?.rodape || '';
        if (needle.test(`${lHeader} ${lBody} ${lFooter}`)) return true;

        // enhanced interactive
        const eHeader = messageMapping?.enhancedInteractiveMessage?.headerContent || '';
        const eBody = messageMapping?.enhancedInteractiveMessage?.bodyText || '';
        const eFooter = messageMapping?.enhancedInteractiveMessage?.footerText || '';
        if (needle.test(`${eHeader} ${eBody} ${eFooter}`)) return true;

        return false;
      } catch {
        return false;
      }
    })();

    const uniqueUserKey = usesLeadVariable ? (job.data.originalPayload?.originalDetectIntentRequest?.payload?.psid || job.data.contactPhone || undefined) : undefined;

    const cachedResult = await getCachedConversionResult(intentName, usuarioChatwitId, inboxId, bodyLength, hasImage, uniqueUserKey);
    if (cachedResult && cachedResult.templateType !== 'incompatible') {
      fulfillmentMessages = cachedResult.fulfillmentMessages;
      conversionTime = cachedResult.processingTime;
      
      logWithCorrelationId('info', 'Using cached conversion result for Instagram translation', correlationId, {
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
    } else {
      // Cache miss - perform conversion
      try {
        const conversionStart = Date.now();
      
      switch (messageMapping.messageType) {
        case 'unified_template':
          if (messageMapping.unifiedTemplate) {
            fulfillmentMessages = await convertUnifiedTemplateToInstagram(
              messageMapping.unifiedTemplate,
              correlationId,
              updatedLogContext,
              messageMapping,
              {
                inboxId,
                contactPhone,
                originalPayload: job.data.originalPayload,
              }
            );
          } else {
            throw createConversionFailedError('Unified template data is missing', correlationId);
          }
          break;

        case 'interactive':
          if (messageMapping.interactiveMessage) {
            fulfillmentMessages = await convertInteractiveMessageToInstagram(
              messageMapping.interactiveMessage,
              correlationId,
              updatedLogContext,
              messageMapping
            );
          } else {
            throw createConversionFailedError('Interactive message data is missing', correlationId);
          }
          break;

        case 'enhanced_interactive':
          if (messageMapping.enhancedInteractiveMessage) {
            fulfillmentMessages = await convertEnhancedInteractiveMessageToInstagram(
              messageMapping.enhancedInteractiveMessage,
              correlationId,
              updatedLogContext,
              messageMapping
            );
          } else {
            throw createConversionFailedError('Enhanced interactive message data is missing', correlationId);
          }
          break;

        case 'template':
          // Templates are not supported for Instagram conversion yet
          const templateError = createConversionFailedError(
            'Template messages are not supported for Instagram conversion',
            correlationId,
            { templateName: messageMapping.template?.name }
          );
          logError(templateError);
          
          // Track error
          trackInstagramError(correlationId, InstagramTranslationErrorCodes.CONVERSION_FAILED, templateError, {
            intentName,
            inboxId,
            messageType: messageMapping.messageType,
            retryCount: job.attemptsMade,
            jobId: job.id?.toString(),
          }, { templateName: messageMapping.template?.name });
          
          throw templateError;

        default:
          const unsupportedError = createConversionFailedError(
            `Unsupported message type for Instagram: ${messageMapping.messageType}`,
            correlationId,
            { messageType: messageMapping.messageType }
          );
          logError(unsupportedError);
          
          // Track error
          trackInstagramError(correlationId, InstagramTranslationErrorCodes.CONVERSION_FAILED, unsupportedError, {
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
          
           await setCachedConversionResult(intentName, usuarioChatwitId, inboxId, bodyLength, hasImage, {
            fulfillmentMessages,
            templateType: templateType as 'generic' | 'button' | 'incompatible',
            processingTime: conversionTime,
            buttonsCount,
           }, undefined, uniqueUserKey);
          
          logWithCorrelationId('info', 'Instagram conversion result cached successfully', correlationId, {
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
        
      } catch (conversionError) {
      if (conversionError instanceof InstagramTranslationError) {
        // Track conversion error
        trackInstagramError(correlationId, conversionError.code as string, conversionError, {
          intentName,
          inboxId,
          messageType: messageMapping.messageType,
          retryCount: job.attemptsMade,
          jobId: job.id?.toString(),
        });
        
        throw conversionError;
      }
      
      const error = createConversionFailedError(
        sanitizeErrorMessage(conversionError),
        correlationId,
        { originalError: conversionError instanceof Error ? conversionError.message : String(conversionError) }
      );
      logError(error);
      
        // Track error
        trackInstagramError(correlationId, InstagramTranslationErrorCodes.CONVERSION_FAILED, error, {
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
      const error = createConversionFailedError('No Instagram messages generated from conversion', correlationId);
      logError(error);
      
      // Track error
      trackInstagramError(correlationId, InstagramTranslationErrorCodes.CONVERSION_FAILED, error, {
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
    instagramTranslationLogger.workerJobCompleted(updatedLogContext, true, processingTime, fulfillmentMessages.length);

    logWithCorrelationId('info', 'Instagram translation completed successfully', correlationId, {
      processingTime,
      messagesGenerated: fulfillmentMessages.length,
      jobId: job.id,
    });

    // Record translation metrics
    const templateType = determineTemplateTypeFromMessages(fulfillmentMessages);
    recordInstagramTranslationMetrics({
      correlationId,
      conversionTime,
      templateType: templateType as 'generic' | 'button' | 'incompatible',
      bodyLength,
      buttonsCount: countButtonsInMessages(fulfillmentMessages),
      hasImage: hasImageInMessages(fulfillmentMessages),
      success: true,
      timestamp: new Date(),
      retryCount: job.attemptsMade,
      messageType: messageMapping.messageType as 'interactive' | 'enhanced_interactive' | 'template' | 'unified_template',
    });

    // Record worker performance metrics
    recordInstagramWorkerPerformanceMetrics({
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

    // Se houver meta de reação/contexto, anexe aos fulfillmentMessages[0]
    if (buttonContextMeta && fulfillmentMessages.length > 0) {
      const first = fulfillmentMessages[0] as any;
      first.payload = first.payload || {};
      first.payload.meta = first.payload.meta || {};
      first.payload.meta.instagram = {
        ...first.payload.meta.instagram,
        reply_to_message_id: buttonContextMeta.replyToMessageId,
        sender_action: buttonContextMeta.reaction ? { type: 'react', reaction: buttonContextMeta.reaction, emoji: buttonContextMeta.reactionEmoji } : undefined,
      };
    }

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

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const finalCpuUsage = process.cpuUsage(initialCpuUsage);
    const finalMemoryUsage = process.memoryUsage();
    const queueWaitTime = job.processedOn ? job.processedOn - (job.timestamp || 0) : 0;
    
    // Log job failure
    instagramTranslationLogger.workerJobFailed(logContext, error as Error, error instanceof InstagramTranslationError ? error.retryable : false);
    
    // Handle Instagram translation errors
    if (error instanceof InstagramTranslationError) {
      logWithCorrelationId('error', 'Instagram translation error occurred', correlationId, {
        errorCode: error.code,
        retryable: error.retryable,
        processingTime,
        attemptsMade: job.attemptsMade,
      });

      // Attempt recovery if possible
      try {
        const recovery = await attemptRecovery(error);
        if (recovery.fallbackAction === 'simple_text' && recovery.fallbackMessage) {
          // Log successful recovery
          instagramTranslationLogger.errorRecoverySucceeded(logContext, error.code, 'simple_text');
          
          // Return a simple fallback message
          return {
            success: true,
            fulfillmentMessages: createInstagramFallbackMessage(recovery.fallbackMessage),
            processingTime,
            metadata: {
              fallbackUsed: true,
              originalError: error.code,
            },
          };
        }
      } catch (recoveryError) {
        instagramTranslationLogger.errorRecoveryFailed(logContext, error.code, recoveryError as Error);
        
        logWithCorrelationId('error', 'Error recovery failed', correlationId, {
          recoveryError: sanitizeErrorMessage(recoveryError),
        });
      }

      // Record failed translation metrics
      recordInstagramTranslationMetrics({
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
      recordInstagramWorkerPerformanceMetrics({
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
        logWithCorrelationId('info', 'Rethrowing retryable error for BullMQ retry', correlationId, {
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
    const errorMessage = sanitizeErrorMessage(error);
    logWithCorrelationId('error', 'Unexpected error processing Instagram translation', correlationId, {
      error: errorMessage,
      processingTime,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    });

    // Track unexpected error
    trackInstagramError(correlationId, InstagramTranslationErrorCodes.SYSTEM_ERROR, error as Error, {
      intentName: job.data.intentName,
      inboxId: job.data.inboxId,
      retryCount: job.attemptsMade,
      jobId: job.id?.toString(),
    }, { unexpectedError: true });

    // Record failed translation metrics
    recordInstagramTranslationMetrics({
      correlationId,
      conversionTime: 0,
      templateType: 'incompatible',
      bodyLength: 0,
      buttonsCount: 0,
      hasImage: false,
      success: false,
      error: errorMessage,
      errorCode: InstagramTranslationErrorCodes.SYSTEM_ERROR,
      timestamp: new Date(),
      retryCount: job.attemptsMade,
      messageType: 'interactive',
    });

    // Record failed worker performance metrics
    recordInstagramWorkerPerformanceMetrics({
      correlationId,
      jobId: job.id?.toString() || 'unknown',
      processingTime,
      queueWaitTime,
      databaseQueryTime: 0,
      conversionTime: 0,
      validationTime: 0,
      success: false,
      error: errorMessage,
      errorCode: InstagramTranslationErrorCodes.SYSTEM_ERROR,
      timestamp: new Date(),
      retryCount: job.attemptsMade,
      memoryUsage: finalMemoryUsage,
      cpuUsage: finalCpuUsage,
    });

    // Check if error might be retryable
    const retryable = isRetryableError(error as Error);
    if (retryable && job.attemptsMade < (job.opts?.attempts || 3)) {
      logWithCorrelationId('info', 'Rethrowing potentially retryable error', correlationId, {
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
 * Apenas calcula os metadados de reação e de resposta em contexto para Instagram.
 * Esses metadados serão incorporados ao payload retornado ao Dialogflow,
 * para que o sender do canal aplique as ações ao enviar a mensagem.
 */
async function getInstagramReactionAndReplyMeta(job: Job<InstagramTranslationJobData>): Promise<{
  replyToMessageId?: string;
  reaction?: 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry';
  reactionEmoji?: string;
} | undefined> {
  const payload = job.data.originalPayload?.originalDetectIntentRequest?.payload;
  if (!payload) return undefined;
  const isButton = payload.interaction_type === 'button_reply' || payload.interactive?.type === 'button_reply' || payload.interactive?.type === 'list_reply';
  if (!isButton) return undefined;

  const buttonId: string | undefined = payload.button_id || payload.interactive?.button_reply?.id || payload.interactive?.list_reply?.id;
  const inboxId: string | undefined = job.data.inboxId;
  const replyToMessageId: string | undefined = payload.context?.id || payload.id || payload.message_id;
  if (!buttonId || !inboxId) return undefined;

  const mapping = await prisma.mapeamentoBotao.findFirst({
    where: { buttonId, inbox: { inboxId } },
  });
  if (!mapping || !mapping.actionPayload) return { replyToMessageId };

  const actionPayload: any = mapping.actionPayload || {};
  const emoji = typeof actionPayload.emoji === 'string' ? actionPayload.emoji.trim() : '';
  const textReaction = typeof actionPayload.textReaction === 'string' ? actionPayload.textReaction.trim() : '';

  const reaction = mapEmojiToReactionName(emoji);
  return {
    replyToMessageId,
    reaction: reaction || undefined,
    reactionEmoji: emoji || undefined,
  };
}

function mapEmojiToReactionName(emoji: string): 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry' | null {
  const e = (emoji || '').trim();
  switch (e) {
    case '❤️':
    case '❤':
    case '♥️':
      return 'love';
    case '👍':
    case '👌':
    case '✅':
      return 'like';
    case '😂':
    case '😹':
      return 'haha';
    case '😮':
    case '😯':
      return 'wow';
    case '😢':
    case '😭':
      return 'sad';
    case '😡':
    case '😠':
      return 'angry';
    default:
      return null;
  }
}

/**
 * Convert unified template to Instagram format with comprehensive validation
 */
async function convertUnifiedTemplateToInstagram(
  unifiedTemplate: any,
  correlationId: string,
  logContext: any,
  messageMapping?: any,
  context?: { inboxId?: string; contactPhone?: string; originalPayload?: any }
): Promise<DialogflowFulfillmentMessage[]> {
  logWithCorrelationId('info', 'Converting unified template to Instagram', correlationId, {
    templateType: unifiedTemplate.type,
    templateName: unifiedTemplate.name,
  });

  // Handle different template types
  switch (unifiedTemplate.type) {
    case 'INTERACTIVE_MESSAGE':
      if (unifiedTemplate.interactiveContent) {
        return await convertInteractiveContentToInstagram(
          unifiedTemplate.interactiveContent,
          correlationId,
          logContext,
          messageMapping,
          context
        );
      } else {
        throw createConversionFailedError('Interactive content is missing from unified template', correlationId);
      }

    case 'AUTOMATION_REPLY':
      if (unifiedTemplate.simpleReplyText) {
        return await convertSimpleReplyToInstagram(
          unifiedTemplate.simpleReplyText,
          correlationId,
          logContext
        );
      } else {
        throw createConversionFailedError('Simple reply text is missing from unified template', correlationId);
      }

    case 'WHATSAPP_OFFICIAL':
      // WhatsApp Official templates are not supported for Instagram yet
      const whatsappError = createConversionFailedError(
        'WhatsApp Official templates are not supported for Instagram conversion',
        correlationId,
        { templateName: unifiedTemplate.name, templateType: unifiedTemplate.type }
      );
      logError(whatsappError);
      throw whatsappError;

    default:
      const unsupportedError = createConversionFailedError(
        `Unsupported unified template type for Instagram: ${unifiedTemplate.type}`,
        correlationId,
        { templateType: unifiedTemplate.type, templateName: unifiedTemplate.name }
      );
      logError(unsupportedError);
      throw unsupportedError;
  }
}

/**
 * Convert InteractiveContent to Instagram format
 */
async function convertInteractiveContentToInstagram(
  interactiveContent: any,
  correlationId: string,
  logContext: any,
  messageMapping?: any,
  context?: { inboxId?: string; contactPhone?: string; originalPayload?: any }
): Promise<DialogflowFulfillmentMessage[]> {
  logWithCorrelationId('info', 'Converting interactive content to Instagram', correlationId);

  // Extract body text
  const bodyText = interactiveContent.body?.text || '';
  if (!bodyText) {
    throw createValidationError(
      'interactive_content.body.text',
      'Body text is required for interactive content',
      correlationId
    );
  }

  // Extract header information
  const hasImage = interactiveContent.header?.type === 'image' && interactiveContent.header?.content;
  const imageUrl = hasImage ? interactiveContent.header.content : undefined;

  // Extract footer text
  const footerText = interactiveContent.footer?.text;

  // Resolve variables (globais) antes de montar o payload
  let resolvedInteractiveContent = JSON.parse(JSON.stringify(interactiveContent));

  try {
    // Tentar obter appUserId a partir do mapping
    let appUserId: string | null = null;
    if (messageMapping) {
      appUserId = await getUserIdFromMessageMapping(messageMapping);
    }

    // Extrair personName do payload original (Dialogflow) se disponível
    const personName = extractPersonNameFromPayload(context?.originalPayload);

    // Instanciar resolvedor de variáveis
    let resolver: METAVariablesResolver | null = null;
    if (appUserId) {
      resolver = METAVariablesResolver.fromUserId(appUserId, {
        userId: appUserId,
        inboxId: context?.inboxId,
        contactPhone: context?.contactPhone,
        correlationId,
        personName,
      });
    } else if (context?.inboxId) {
      resolver = await METAVariablesResolver.fromInboxId(context.inboxId, {
        inboxId: context.inboxId,
        contactPhone: context.contactPhone,
        correlationId,
        personName,
      });
    }

    if (resolver) {
      // Header (texto ou media URL)
      if (resolvedInteractiveContent.header?.content) {
        const resolvedHeader = await resolver.resolveText(
          String(resolvedInteractiveContent.header.content)
        );
        resolvedInteractiveContent.header.content = resolvedHeader;
      }

      // Body
      if (resolvedInteractiveContent.body?.text) {
        resolvedInteractiveContent.body.text = await resolver.resolveText(
          String(resolvedInteractiveContent.body.text)
        );
      }

      // Footer
      if (resolvedInteractiveContent.footer?.text) {
        resolvedInteractiveContent.footer.text = await resolver.resolveText(
          String(resolvedInteractiveContent.footer.text)
        );
      }

      // Buttons (Reply Buttons)
      const replyButtons = resolvedInteractiveContent?.actionReplyButton?.buttons;
      if (Array.isArray(replyButtons)) {
        resolvedInteractiveContent.actionReplyButton.buttons = await Promise.all(
          replyButtons.map(async (btn: any) => {
            const newBtn = { ...btn };
            if (newBtn.title) {
              newBtn.title = await resolver!.resolveText(String(newBtn.title));
            } else if (newBtn.reply?.title) {
              newBtn.reply = {
                ...newBtn.reply,
                title: await resolver!.resolveText(String(newBtn.reply.title)),
              };
            }
            // Resolve URLs when variables are present
            if (newBtn.url) {
              newBtn.url = await resolver!.resolveText(String(newBtn.url));
            }
            return newBtn;
          })
        );
      }

      // CTA URL
      if (resolvedInteractiveContent?.actionCtaUrl) {
        const cta = resolvedInteractiveContent.actionCtaUrl;
        if (cta.displayText) {
          cta.displayText = await resolver.resolveText(String(cta.displayText));
        }
        if (cta.url) {
          cta.url = await resolver.resolveText(String(cta.url));
        }
      }
    }
  } catch (varError) {
    console.warn('[Instagram Variables] Falha ao resolver variáveis para Instagram:', varError);
    // Segue com conteúdo original se algo falhar
    resolvedInteractiveContent = JSON.parse(JSON.stringify(interactiveContent));
  }

  // Delegate to builder com conteúdo já resolvido
  return await buildInstagramFromInteractiveContent(resolvedInteractiveContent, correlationId, logContext);
}

/**
 * Convert simple reply text to Instagram format
 */
async function convertSimpleReplyToInstagram(
  simpleReplyText: string,
  correlationId: string,
  logContext: any
): Promise<DialogflowFulfillmentMessage[]> {
  logWithCorrelationId('info', 'Converting simple reply to Instagram', correlationId);

  if (!simpleReplyText || simpleReplyText.trim().length === 0) {
    throw createValidationError(
      'simple_reply_text',
      'Simple reply text cannot be empty',
      correlationId
    );
  }

  const bodyText = simpleReplyText.trim();
  
  // Determine template type based on body length
  const templateType = determineInstagramTemplateType(bodyText, false);
  
  // Log template type detection
  instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, 
    `Body length: ${bodyText.length}, Simple reply`);
  
  // Note: No longer throwing error for long messages - Quick Replies will handle them

  let fulfillmentMessages: DialogflowFulfillmentMessage[];

  try {
    if (templateType === 'generic') {
      // Use Generic Template for messages ≤80 characters
      fulfillmentMessages = createInstagramGenericTemplate(
        bodyText,
        undefined, // no subtitle
        undefined, // no image
        [] // no buttons
      );
    } else if (templateType === 'button') {
      // Use Button Template for messages 81-640 characters
      fulfillmentMessages = createInstagramButtonTemplate(
        bodyText,
        [] // no buttons
      );
    } else {
      // Use Quick Replies for messages >640 characters
      fulfillmentMessages = createInstagramQuickReplies(
        bodyText,
        [] // no buttons
      );
    }
  } catch (templateError) {
    throw createConversionFailedError(
      `Failed to create Instagram template from simple reply: ${sanitizeErrorMessage(templateError)}`,
      correlationId,
      { templateType, bodyLength: bodyText.length }
    );
  }

  // Validate the generated template
  if (fulfillmentMessages.length > 0) {
    const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
    const template = socialwiseResponse?.payload;
    
    if (template) {
      const templateValidation = validateInstagramTemplate(template);
      
      // Log validation result
      instagramTranslationLogger.workerValidationPerformed(logContext, 'simple_reply_instagram_template', 
        templateValidation.isValid, templateValidation.errors);
      
      if (!templateValidation.isValid) {
        logWithCorrelationId('error', 'Generated Instagram template validation failed', correlationId, {
          errors: templateValidation.errors,
          template,
          messageFormat: socialwiseResponse.message_format,
        });
        
        throw createConversionFailedError(
          `Generated simple reply template validation failed: ${templateValidation.errors.join(', ')}`,
          correlationId,
          { validationErrors: templateValidation.errors }
        );
      }
    }
  }

  logWithCorrelationId('info', 'Simple reply converted successfully', correlationId, {
    templateType,
    bodyLength: bodyText.length,
  });

  return fulfillmentMessages;
}

/**
 * Convert unified buttons to Instagram format
 */
function convertUnifiedButtonsToInstagram(buttons: any): any[] {
  if (!Array.isArray(buttons)) {
    return [];
  }

  return buttons.map((button) => {
    const instagramButton: any = {
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
async function convertInteractiveMessageToInstagram(
  interactiveMessage: any,
  correlationId: string,
  logContext: any,
  messageMapping?: any
): Promise<DialogflowFulfillmentMessage[]> {
  logWithCorrelationId('info', 'Converting interactive message to Instagram', correlationId);

  // Validate the interactive message structure
  const validation = validateForInstagramConversion(interactiveMessage);
  if (!validation.valid) {
    throw createValidationError(
      'interactive_message',
      validation.errors.join(', '),
      correlationId
    );
  }

  // Log warnings if any
  if (validation.warnings.length > 0) {
    logWithCorrelationId('warn', 'Conversion warnings detected', correlationId, {
      warnings: validation.warnings,
    });
  }

  let bodyText = interactiveMessage.texto || '';
  const hasImage = interactiveMessage.headerTipo === 'image' && interactiveMessage.headerConteudo;
  
  // Aplicar variáveis no texto do corpo se tivermos messageMapping
  if (messageMapping) {
    try {
      const userId = await getUserIdFromMessageMapping(messageMapping);
      if (userId && bodyText) {
        console.log(`[Instagram Variables] Aplicando variáveis para usuário ${userId} no Instagram`);
        bodyText = await replaceVariablesInText(userId, bodyText);
        console.log(`[Instagram Variables] Variáveis aplicadas com sucesso no Instagram`);
      }
    } catch (variableError) {
      console.warn(`[Instagram Variables] Erro ao aplicar variáveis no Instagram:`, variableError);
      // Continuar com texto original se falhar
    }
  }
  
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
  const templateType = determineInstagramTemplateType(bodyText, hasImage);
  
  // Log template type detection with detailed reasoning
  console.log(`[Instagram Worker] [${correlationId}] TEMPLATE TYPE SELECTION:`, {
    bodyLength: bodyText.length,
    hasImage,
    templateType,
    reasoning: bodyText.length <= 80 ? 'Generic (≤80 chars)' : bodyText.length <= 640 ? 'Button (81-640 chars)' : 'Quick Replies (>640 chars)'
  });
  
  instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, 
    `Body length: ${bodyText.length}, Has image: ${hasImage}`);
  
  // Note: No longer throwing error for long messages - Quick Replies will handle them

  // Convert buttons to Instagram format with error handling
  let instagramButtons: any[] = [];
  try {
    const originalButtonCount = interactiveMessage.botoes?.length || 0;
    instagramButtons = interactiveMessage.botoes 
      ? convertWhatsAppButtonsToInstagram(interactiveMessage.botoes)
      : [];
    
    // Log button conversion
    instagramTranslationLogger.workerButtonsConverted(logContext, originalButtonCount, instagramButtons.length);
  } catch (buttonError) {
    logWithCorrelationId('warn', 'Error converting buttons, using empty array', correlationId, {
      error: sanitizeErrorMessage(buttonError),
    });
    instagramButtons = [];
  }

  let fulfillmentMessages: DialogflowFulfillmentMessage[];

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
      
      fulfillmentMessages = createInstagramGenericTemplate(
        bodyText,
        interactiveMessage.rodape, // subtitle
        hasImage ? interactiveMessage.headerConteudo : undefined, // image URL
        instagramButtons
      );
    } else if (templateType === 'button') {
      // Use Button Template for messages 81-640 characters
      console.log(`[Instagram Worker] [${correlationId}] Creating Button Template with:`, {
        text: bodyText,
        buttonsCount: instagramButtons.length,
        note: 'Header and footer discarded for Button Template',
      });
      
      fulfillmentMessages = createInstagramButtonTemplate(
        bodyText,
        instagramButtons
      );
    } else {
      // Use Quick Replies for messages >640 characters
      console.log(`[Instagram Worker] [${correlationId}] Creating Quick Replies with:`, {
        text: bodyText.substring(0, 100) + (bodyText.length > 100 ? '...' : ''),
        textLength: bodyText.length,
        buttonsCount: instagramButtons.length,
        note: 'Header and footer discarded for Quick Replies',
      });
      
      fulfillmentMessages = createInstagramQuickReplies(
        bodyText,
        instagramButtons
      );
    }
    
    console.log(`[Instagram Worker] [${correlationId}] TEMPLATE CREATED SUCCESSFULLY:`, {
      templateType,
      messagesCount: fulfillmentMessages.length,
      firstMessageStructure: fulfillmentMessages[0] ? Object.keys(fulfillmentMessages[0]) : [],
      socialwiseResponseFormat: fulfillmentMessages[0]?.payload?.socialwiseResponse?.message_format,
    });
    
  } catch (templateError) {
    console.log(`[Instagram Worker] [${correlationId}] TEMPLATE CREATION FAILED:`, {
      templateType,
      bodyLength: bodyText.length,
      error: sanitizeErrorMessage(templateError),
    });
    
    throw createConversionFailedError(
      `Failed to create Instagram template: ${sanitizeErrorMessage(templateError)}`,
      correlationId,
      { templateType, bodyLength: bodyText.length }
    );
  }

  // Validate the generated template
  if (fulfillmentMessages.length > 0) {
    const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
    const template = socialwiseResponse?.payload;
    
    if (template) {
      const templateValidation = validateInstagramTemplate(template);
      
      // Log validation result
      instagramTranslationLogger.workerValidationPerformed(logContext, 'instagram_template', 
        templateValidation.isValid, templateValidation.errors);
      
      if (!templateValidation.isValid) {
        logWithCorrelationId('error', 'Generated Instagram template validation failed', correlationId, {
          errors: templateValidation.errors,
          template,
          messageFormat: socialwiseResponse.message_format,
        });
        
        throw createConversionFailedError(
          `Generated template validation failed: ${templateValidation.errors.join(', ')}`,
          correlationId,
          { validationErrors: templateValidation.errors }
        );
      }
    }
  }

  logWithCorrelationId('info', 'Interactive message converted successfully', correlationId, {
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
async function convertEnhancedInteractiveMessageToInstagram(
  enhancedMessage: any,
  correlationId: string,
  logContext: any,
  messageMapping?: any
): Promise<DialogflowFulfillmentMessage[]> {
  logWithCorrelationId('info', 'Converting enhanced interactive message to Instagram', correlationId);

  // Basic validation of enhanced message structure
  if (!enhancedMessage.bodyText) {
    throw createValidationError(
      'enhanced_message.bodyText',
      'Body text is required for enhanced interactive messages',
      correlationId
    );
  }

  let bodyText = enhancedMessage.bodyText;
  const hasImage = enhancedMessage.headerType === 'image' && enhancedMessage.headerContent;
  
  // Aplicar variáveis no texto do corpo se tivermos messageMapping
  if (messageMapping) {
    try {
      const userId = await getUserIdFromMessageMapping(messageMapping);
      if (userId && bodyText) {
        console.log(`[Instagram Variables] Aplicando variáveis para usuário ${userId} no Instagram (enhanced)`);
        bodyText = await replaceVariablesInText(userId, bodyText);
        console.log(`[Instagram Variables] Variáveis aplicadas com sucesso no Instagram (enhanced)`);
      }
    } catch (variableError) {
      console.warn(`[Instagram Variables] Erro ao aplicar variáveis no Instagram (enhanced):`, variableError);
      // Continuar com texto original se falhar
    }
  }
  
  // Determine template type based on body length
  const templateType = determineInstagramTemplateType(bodyText, hasImage);
  
  // Log template type detection
  instagramTranslationLogger.workerTemplateTypeDetected(logContext, templateType, 
    `Body length: ${bodyText.length}, Has image: ${hasImage}, Message type: ${enhancedMessage.type}`);
  
  // Note: No longer throwing error for long messages - Quick Replies will handle them

  // Convert buttons from actionData with error handling
  let instagramButtons: any[] = [];
  try {
    const originalButtonCount = enhancedMessage.actionData?.buttons?.length || 0;
    if (enhancedMessage.type === 'button' && enhancedMessage.actionData?.buttons) {
      instagramButtons = convertEnhancedButtonsToInstagram(enhancedMessage.actionData.buttons);
    }
    
    // Log button conversion
    instagramTranslationLogger.workerButtonsConverted(logContext, originalButtonCount, instagramButtons.length);
  } catch (buttonError) {
    logWithCorrelationId('warn', 'Error converting enhanced buttons, using empty array', correlationId, {
      error: sanitizeErrorMessage(buttonError),
      messageType: enhancedMessage.type,
    });
    instagramButtons = [];
  }

  let fulfillmentMessages: DialogflowFulfillmentMessage[];

  try {
    if (templateType === 'generic') {
      // Use Generic Template for messages ≤80 characters
      fulfillmentMessages = createInstagramGenericTemplate(
        bodyText,
        enhancedMessage.footerText, // subtitle
        hasImage ? enhancedMessage.headerContent : undefined, // image URL
        instagramButtons
      );
    } else if (templateType === 'button') {
      // Use Button Template for messages 81-640 characters
      fulfillmentMessages = createInstagramButtonTemplate(
        bodyText,
        instagramButtons
      );
    } else {
      // Use Quick Replies for messages >640 characters
      fulfillmentMessages = createInstagramQuickReplies(
        bodyText,
        instagramButtons
      );
    }
  } catch (templateError) {
    throw createConversionFailedError(
      `Failed to create Instagram template from enhanced message: ${sanitizeErrorMessage(templateError)}`,
      correlationId,
      { 
        templateType, 
        bodyLength: bodyText.length,
        messageType: enhancedMessage.type,
        hasActionData: !!enhancedMessage.actionData,
      }
    );
  }

  // Validate the generated template
  if (fulfillmentMessages.length > 0) {
    const socialwiseResponse = fulfillmentMessages[0].payload?.socialwiseResponse;
    const template = socialwiseResponse?.payload;
    
    if (template) {
      const templateValidation = validateInstagramTemplate(template);
      
      // Log validation result
      instagramTranslationLogger.workerValidationPerformed(logContext, 'enhanced_instagram_template', 
        templateValidation.isValid, templateValidation.errors);
      
      if (!templateValidation.isValid) {
        logWithCorrelationId('error', 'Generated Instagram template validation failed', correlationId, {
          errors: templateValidation.errors,
          template,
          messageType: enhancedMessage.type,
          messageFormat: socialwiseResponse.message_format,
        });
        
        throw createConversionFailedError(
          `Generated enhanced template validation failed: ${templateValidation.errors.join(', ')}`,
          correlationId,
          { 
            validationErrors: templateValidation.errors,
            messageType: enhancedMessage.type,
          }
        );
      }
    }
  }

  logWithCorrelationId('info', 'Enhanced interactive message converted successfully', correlationId, {
    templateType,
    bodyLength: bodyText.length,
    buttonsCount: instagramButtons.length,
    hasImage,
    messageType: enhancedMessage.type,
  });

  return fulfillmentMessages;
}

// Helper functions for extracting data from different message mapping types
function getBodyLengthFromMapping(messageMapping: any): number {
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

function getHasImageFromMapping(messageMapping: any): boolean {
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
function determineTemplateTypeFromMessages(messages: any[]): string {
  if (messages.length === 0) return 'incompatible';
  
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

function countButtonsInMessages(messages: any[]): number {
  if (messages.length === 0) return 0;
  
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

function hasImageInMessages(messages: any[]): boolean {
  if (messages.length === 0) return false;
  
  const firstMessage = messages[0];
  const socialwiseResponse = firstMessage?.payload?.socialwiseResponse;
  const payload = socialwiseResponse?.payload;
  
  if (socialwiseResponse?.message_format === 'GENERIC_TEMPLATE' && payload?.elements?.[0]?.image_url) {
    return true;
  }
  
  return false;
}

