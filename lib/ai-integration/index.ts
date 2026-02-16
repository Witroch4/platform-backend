// AI Integration module exports
// Export types explicitly to avoid conflicts
export type {
	ChatwitWebhookPayload,
	WebhookResponse,
	WebhookHeaders,
	WebhookValidationResult,
	IdempotencyKey as WebhookIdempotencyKey,
	RateLimitScope,
	RateLimitConfig,
} from "./types/webhook";

export type {
	Channel,
	ChannelLimits,
	WhatsAppButton,
	InstagramQuickReply,
	InstagramButton,
	ChannelMessage,
	ChannelValidationResult,
	ButtonPayload,
	ClickPayload,
} from "./types/channels";

export type {
	AiMessageJobData as JobData,
	JobMetadata,
	JobResult,
	DeadLetterQueueItem as JobError,
} from "./types/job-data";

export type {
	ChatwitApiResponse as ApiResponse,
	ApiErrorResponse as ErrorResponse,
	ChatwitMessagePayload as SuccessResponse,
} from "./types/api-responses";

export type {
	Intent,
	IntentCandidate,
	IntentHit,
	EmbeddingVector,
	SimilaritySearchParams,
	SimilaritySearchResult,
} from "./types/intent";

export type {
	LlmPromptContext as LLMRequest,
	LlmResponse as LLMResponse,
	CircuitBreakerState as LLMError,
	DynamicGenerationResult as StructuredOutput,
} from "./types/llm";

export * from "./schemas";
export * from "./services";
