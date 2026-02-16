// Core worker and processing
export {
	createCostWorker,
	startCostWorker,
	stopCostWorker,
	processCostEvent,
	reprocessPendingEvents,
	resolveUnitPrice,
	calculateCost,
	isEventAlreadyProcessed,
	type CostEventData,
} from "./cost-worker";

// Pricing service
export {
	pricingService,
	resolveUnitPrice as resolvePriceWithService,
	processPendingPricingEvents,
	type ResolvedPrice,
} from "./pricing-service";

// Queue configuration
export {
	createCostQueue,
	createDeadLetterQueue,
	addCostEventsBulk,
	cleanupCostQueues,
	checkCostQueueHealth,
	COST_QUEUE_NAME,
	DEAD_LETTER_QUEUE_NAME,
	costQueueOptions,
	costWorkerOptions,
	eventTypeConfigs,
	bulkOperationConfig,
	queueMonitoringConfig,
} from "./queue-config";

// Error handling
export {
	costErrorHandler,
	handleJobError,
	CostErrorType,
	type ErrorContext,
	type CostErrorLog,
} from "./error-handler";

// Idempotency service
export {
	idempotencyService,
	checkEventIdempotency,
	registerProcessedEvent,
	type IdempotencyKey,
	type IdempotencyResult,
} from "./idempotency-service";

// OpenAI wrappers
export {
	openaiWithCost,
	openaiChatWithCost,
	openaiEmbeddingWithCost,
	type OpenAIHookArgs,
	type OpenAIUsage,
	type OpenAIResponse,
} from "./openai-wrapper";

// WhatsApp wrappers
export {
	whatsappWithCost,
	whatsappMarketingWithCost,
	whatsappUtilityWithCost,
	whatsappAuthWithCost,
	captureWhatsAppDelivery,
	deriveRegionFromPhone,
	getTemplateCategory,
	type WhatsAppHookArgs,
	type WhatsAppSendResult,
} from "./whatsapp-wrapper";

// Budget system (complete budget management)
export {
	// Monitoring
	scheduleBudgetMonitoring,
	checkAllBudgets,
	checkSpecificBudget,
	scheduleImmediateBudgetCheck,
	getBudgetMonitorStats,
	stopBudgetMonitoring,
	budgetQueue,
	budgetWorker,
	BUDGET_MONITOR_QUEUE,
	// Controls
	sendBudgetAlert,
	applyBudgetControls,
	removeBudgetControls,
	isInboxBlocked,
	isUserBlocked,
	getDowngradedModel,
	BUDGET_CONTROLS_CONFIG,
	type BudgetAlertType,
	// Guards
	checkBudgetLimits,
	guardOpenAIOperation,
	guardWhatsAppOperation,
	withBudgetGuard,
	logBlockedOperation,
	logModelDowngrade,
	BudgetExceededException,
	type BudgetCheckResult,
	// Notifications
	budgetNotificationService,
	BudgetNotificationService,
	type BudgetNotificationType,
	type NotificationChannel,
	type NotificationConfig,
	type BudgetNotificationData,
	// System management
	initializeBudgetSystem,
	shutdownBudgetSystem,
	checkBudgetSystemHealth,
} from "./budget-system";

// Quality evaluation system
export {
	LEGAL_EVALUATION_DATASET,
	QUALITY_THRESHOLDS,
	LEGAL_DOMAINS,
	getExamplesByBand,
	getExamplesByDomain,
	getExamplesByComplexity,
	getRandomSample,
	validateDataset,
	type EvaluationExample,
	type QualityMetrics,
} from "./evaluation-dataset";

export {
	EvaluationPipeline,
	runQualityEvaluation,
	getLatestEvaluationReport,
	type EvaluationResult,
	type EvaluationReport,
	type EvaluationConfig,
} from "./evaluation-pipeline";

// Request cost tracking
export {
	RequestCostTracker,
	createRequestCostTracker,
	type RequestCostBreakdown,
	type CostOptimizationRecommendation,
	type RequestCostConfig,
} from "./request-cost-tracker";
