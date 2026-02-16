import { OpenAPIV3 } from "openapi-types";

/**
 * Generate OpenAPI 3.0 specification for the Queue Management API
 */
export function generateOpenAPISpec(): OpenAPIV3.Document {
	return {
		openapi: "3.0.3",
		info: {
			title: "ChatWit Queue Management API",
			description: `
# ChatWit Queue Management API

A comprehensive API for managing BullMQ queues with advanced monitoring, alerting, and webhook capabilities.

## Features

- **Queue Management**: Create, configure, and control queues
- **Job Management**: Monitor, retry, and manage individual jobs
- **Metrics & Analytics**: Export detailed performance metrics
- **Webhooks**: Configure reliable webhook deliveries for queue events
- **Real-time Monitoring**: Get live updates on queue health and performance

## Authentication

All API endpoints require authentication. Include your API key in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Rate Limiting

API requests are rate limited to prevent abuse:
- 1000 requests per hour for authenticated users
- 100 requests per hour for unauthenticated requests

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Request limit per window
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`X-RateLimit-Reset\`: Time when the rate limit resets

## Error Handling

All errors follow a consistent format:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {},
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
\`\`\`

Common error codes:
- \`VALIDATION_ERROR\`: Invalid input data
- \`QUEUE_NOT_FOUND\`: Specified queue does not exist
- \`JOB_NOT_FOUND\`: Specified job does not exist
- \`RATE_LIMIT_EXCEEDED\`: Too many requests
- \`UNAUTHORIZED\`: Invalid or missing authentication
- \`FORBIDDEN\`: Insufficient permissions
      `,
			version: "1.0.0",
			contact: {
				name: "ChatWit Support",
				email: "support@chatwit.com",
				url: "https://chatwit.com/support",
			},
			license: {
				name: "MIT",
				url: "https://opensource.org/licenses/MIT",
			},
		},
		servers: [
			{
				url: "https://api.chatwit.com",
				description: "Production server",
			},
			{
				url: "https://staging-api.chatwit.com",
				description: "Staging server",
			},
			{
				url: "http://localhost:3000",
				description: "Development server",
			},
		],
		security: [
			{
				bearerAuth: [],
			},
		],
		paths: {
			"/api/admin/queues": {
				get: {
					tags: ["Queues"],
					summary: "List all queues",
					description: "Retrieve all queues with health metrics and performance stats",
					parameters: [
						{
							name: "page",
							in: "query",
							description: "Page number for pagination",
							schema: { type: "integer", minimum: 1, default: 1 },
						},
						{
							name: "limit",
							in: "query",
							description: "Number of items per page",
							schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
						},
						{
							name: "search",
							in: "query",
							description: "Search term for queue names",
							schema: { type: "string" },
						},
						{
							name: "status",
							in: "query",
							description: "Filter by queue status",
							schema: { type: "string", enum: ["all", "healthy", "warning", "critical"], default: "all" },
						},
						{
							name: "sortBy",
							in: "query",
							description: "Field to sort by",
							schema: { type: "string", enum: ["name", "waiting", "active", "failed", "throughput"], default: "name" },
						},
						{
							name: "sortOrder",
							in: "query",
							description: "Sort order",
							schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
						},
						{
							name: "timeWindow",
							in: "query",
							description: "Time window for performance metrics (minutes)",
							schema: { type: "integer", minimum: 1, maximum: 1440, default: 60 },
						},
					],
					responses: {
						"200": {
							description: "List of queues retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/QueuesListResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				post: {
					tags: ["Queues"],
					summary: "Create a new queue",
					description: "Create or register a new queue with specified configuration",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/QueueConfig" },
							},
						},
					},
					responses: {
						"201": {
							description: "Queue created successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/QueueCreateResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"409": { $ref: "#/components/responses/Conflict" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				patch: {
					tags: ["Queues"],
					summary: "Perform batch operations on queues",
					description: "Execute actions on multiple queues simultaneously",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/QueueBatchAction" },
							},
						},
					},
					responses: {
						"200": {
							description: "Batch operation completed",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/BatchActionResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
			"/api/admin/queues/{queueName}": {
				get: {
					tags: ["Queues"],
					summary: "Get queue details",
					description: "Retrieve detailed information about a specific queue",
					parameters: [
						{
							name: "queueName",
							in: "path",
							required: true,
							description: "Name of the queue",
							schema: { type: "string" },
						},
						{
							name: "timeWindow",
							in: "query",
							description: "Time window for metrics (minutes)",
							schema: { type: "integer", default: 60 },
						},
						{
							name: "includeJobs",
							in: "query",
							description: "Include recent job details",
							schema: { type: "boolean", default: false },
						},
						{
							name: "jobLimit",
							in: "query",
							description: "Limit for job details",
							schema: { type: "integer", default: 100 },
						},
					],
					responses: {
						"200": {
							description: "Queue details retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/QueueDetailsResponse" },
								},
							},
						},
						"404": { $ref: "#/components/responses/NotFound" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				put: {
					tags: ["Queues"],
					summary: "Update queue configuration",
					description: "Update the configuration of an existing queue",
					parameters: [
						{
							name: "queueName",
							in: "path",
							required: true,
							description: "Name of the queue",
							schema: { type: "string" },
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/QueueUpdateConfig" },
							},
						},
					},
					responses: {
						"200": {
							description: "Queue updated successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/QueueUpdateResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"404": { $ref: "#/components/responses/NotFound" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				delete: {
					tags: ["Queues"],
					summary: "Delete queue",
					description: "Delete/unregister a queue and all its jobs",
					parameters: [
						{
							name: "queueName",
							in: "path",
							required: true,
							description: "Name of the queue",
							schema: { type: "string" },
						},
					],
					responses: {
						"200": {
							description: "Queue deleted successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/QueueDeleteResponse" },
								},
							},
						},
						"401": { $ref: "#/components/responses/Unauthorized" },
						"404": { $ref: "#/components/responses/NotFound" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
			"/api/admin/jobs": {
				get: {
					tags: ["Jobs"],
					summary: "List jobs",
					description: "Retrieve jobs with filtering, pagination, and search capabilities",
					parameters: [
						{
							name: "queueName",
							in: "query",
							description: "Filter by queue name",
							schema: { type: "string" },
						},
						{
							name: "status",
							in: "query",
							description: "Filter by job status",
							schema: {
								type: "string",
								enum: ["all", "waiting", "active", "completed", "failed", "delayed"],
								default: "all",
							},
						},
						{
							name: "page",
							in: "query",
							description: "Page number",
							schema: { type: "integer", minimum: 1, default: 1 },
						},
						{
							name: "limit",
							in: "query",
							description: "Items per page",
							schema: { type: "integer", minimum: 1, maximum: 1000, default: 50 },
						},
						{
							name: "search",
							in: "query",
							description: "Search term",
							schema: { type: "string" },
						},
						{
							name: "timeRange",
							in: "query",
							description: "Time range for jobs",
							schema: { type: "string", enum: ["1h", "6h", "24h", "7d", "30d"], default: "24h" },
						},
						{
							name: "correlationId",
							in: "query",
							description: "Filter by correlation ID",
							schema: { type: "string" },
						},
					],
					responses: {
						"200": {
							description: "Jobs retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/JobsListResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				post: {
					tags: ["Jobs"],
					summary: "Create a new job",
					description: "Add a new job to a queue",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/JobCreateRequest" },
							},
						},
					},
					responses: {
						"201": {
							description: "Job created successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/JobCreateResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				patch: {
					tags: ["Jobs"],
					summary: "Batch job operations",
					description: "Perform actions on multiple jobs",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/JobBatchAction" },
							},
						},
					},
					responses: {
						"200": {
							description: "Batch operation completed",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/BatchActionResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
			"/api/admin/jobs/{jobId}": {
				get: {
					tags: ["Jobs"],
					summary: "Get job details",
					description: "Retrieve detailed information about a specific job",
					parameters: [
						{
							name: "jobId",
							in: "path",
							required: true,
							description: "Job ID",
							schema: { type: "string" },
						},
						{
							name: "queueName",
							in: "query",
							required: true,
							description: "Queue name",
							schema: { type: "string" },
						},
						{
							name: "includePayload",
							in: "query",
							description: "Include job payload",
							schema: { type: "boolean", default: false },
						},
						{
							name: "includeHistory",
							in: "query",
							description: "Include job history",
							schema: { type: "boolean", default: false },
						},
					],
					responses: {
						"200": {
							description: "Job details retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/JobDetailsResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"404": { $ref: "#/components/responses/NotFound" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				put: {
					tags: ["Jobs"],
					summary: "Update job",
					description: "Update job properties (limited fields)",
					parameters: [
						{
							name: "jobId",
							in: "path",
							required: true,
							description: "Job ID",
							schema: { type: "string" },
						},
						{
							name: "queueName",
							in: "query",
							required: true,
							description: "Queue name",
							schema: { type: "string" },
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/JobUpdateRequest" },
							},
						},
					},
					responses: {
						"200": {
							description: "Job updated successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/JobUpdateResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"404": { $ref: "#/components/responses/NotFound" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				delete: {
					tags: ["Jobs"],
					summary: "Delete job",
					description: "Remove a job from the queue",
					parameters: [
						{
							name: "jobId",
							in: "path",
							required: true,
							description: "Job ID",
							schema: { type: "string" },
						},
						{
							name: "queueName",
							in: "query",
							required: true,
							description: "Queue name",
							schema: { type: "string" },
						},
						{
							name: "force",
							in: "query",
							description: "Force delete even if job is active",
							schema: { type: "boolean", default: false },
						},
					],
					responses: {
						"200": {
							description: "Job deleted successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/JobDeleteResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"404": { $ref: "#/components/responses/NotFound" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
			"/api/admin/metrics": {
				get: {
					tags: ["Metrics"],
					summary: "Get metrics data",
					description: "Retrieve metrics with various aggregations and formats",
					parameters: [
						{
							name: "queueName",
							in: "query",
							description: "Filter by queue name",
							schema: { type: "string" },
						},
						{
							name: "timeRange",
							in: "query",
							description: "Time range for metrics",
							schema: { type: "string", enum: ["1h", "6h", "24h", "7d", "30d"], default: "24h" },
						},
						{
							name: "format",
							in: "query",
							description: "Response format",
							schema: { type: "string", enum: ["json", "csv", "prometheus"], default: "json" },
						},
						{
							name: "metrics",
							in: "query",
							description: "Specific metrics to include",
							schema: {
								type: "array",
								items: {
									type: "string",
									enum: ["throughput", "latency", "success_rate", "error_rate", "queue_depth"],
								},
							},
						},
					],
					responses: {
						"200": {
							description: "Metrics retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/MetricsResponse" },
								},
								"text/csv": {
									schema: { type: "string" },
								},
								"text/plain": {
									schema: { type: "string" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
			"/api/admin/webhooks": {
				get: {
					tags: ["Webhooks"],
					summary: "List webhooks",
					description: "Retrieve all webhook configurations",
					parameters: [
						{
							name: "page",
							in: "query",
							description: "Page number",
							schema: { type: "integer", minimum: 1, default: 1 },
						},
						{
							name: "limit",
							in: "query",
							description: "Items per page",
							schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
						},
						{
							name: "search",
							in: "query",
							description: "Search term",
							schema: { type: "string" },
						},
						{
							name: "enabled",
							in: "query",
							description: "Filter by enabled status",
							schema: { type: "boolean" },
						},
					],
					responses: {
						"200": {
							description: "Webhooks retrieved successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/WebhooksListResponse" },
								},
							},
						},
						"401": { $ref: "#/components/responses/Unauthorized" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
				post: {
					tags: ["Webhooks"],
					summary: "Create webhook",
					description: "Create a new webhook configuration",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/WebhookConfig" },
							},
						},
					},
					responses: {
						"201": {
							description: "Webhook created successfully",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/WebhookCreateResponse" },
								},
							},
						},
						"400": { $ref: "#/components/responses/BadRequest" },
						"401": { $ref: "#/components/responses/Unauthorized" },
						"409": { $ref: "#/components/responses/Conflict" },
						"429": { $ref: "#/components/responses/RateLimitExceeded" },
						"500": { $ref: "#/components/responses/InternalServerError" },
					},
				},
			},
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
			schemas: {
				// Success Response Wrapper
				SuccessResponse: {
					type: "object",
					properties: {
						success: { type: "boolean", example: true },
						data: { type: "object" },
						timestamp: { type: "string", format: "date-time" },
					},
					required: ["success", "data", "timestamp"],
				},

				// Error Response
				ErrorResponse: {
					type: "object",
					properties: {
						success: { type: "boolean", example: false },
						error: {
							type: "object",
							properties: {
								code: { type: "string", example: "VALIDATION_ERROR" },
								message: { type: "string", example: "Invalid input data" },
								details: { type: "object" },
								timestamp: { type: "string", format: "date-time" },
							},
							required: ["code", "message", "timestamp"],
						},
					},
					required: ["success", "error"],
				},

				// Pagination
				Pagination: {
					type: "object",
					properties: {
						page: { type: "integer", example: 1 },
						limit: { type: "integer", example: 20 },
						total: { type: "integer", example: 100 },
						totalPages: { type: "integer", example: 5 },
						hasNext: { type: "boolean", example: true },
						hasPrev: { type: "boolean", example: false },
					},
				},

				// Queue Configuration
				QueueConfig: {
					type: "object",
					properties: {
						name: {
							type: "string",
							pattern: "^[a-zA-Z0-9_-]+$",
							minLength: 1,
							maxLength: 255,
							example: "email-processing",
						},
						displayName: { type: "string", maxLength: 255, example: "Email Processing Queue" },
						description: { type: "string", maxLength: 1000, example: "Processes outbound email notifications" },
						priority: { type: "integer", minimum: 0, maximum: 100, default: 0 },
						concurrency: { type: "integer", minimum: 1, maximum: 1000, default: 1 },
						retryPolicy: {
							type: "object",
							properties: {
								attempts: { type: "integer", minimum: 1, maximum: 10 },
								backoff: { type: "string", enum: ["fixed", "exponential"] },
								delay: { type: "integer", minimum: 0 },
							},
							required: ["attempts", "backoff", "delay"],
						},
						cleanupPolicy: {
							type: "object",
							properties: {
								removeOnComplete: { type: "integer", minimum: 0, maximum: 10000 },
								removeOnFail: { type: "integer", minimum: 0, maximum: 10000 },
							},
							required: ["removeOnComplete", "removeOnFail"],
						},
						alertThresholds: {
							type: "object",
							properties: {
								maxWaitingJobs: { type: "integer", minimum: 1, default: 100 },
								maxFailedJobs: { type: "integer", minimum: 1, default: 50 },
								maxProcessingTime: { type: "integer", minimum: 1000, default: 30000 },
								minSuccessRate: { type: "number", minimum: 0, maximum: 100, default: 95 },
							},
						},
					},
					required: ["name", "retryPolicy", "cleanupPolicy"],
				},

				// Queue Health
				QueueHealth: {
					type: "object",
					properties: {
						queueName: { type: "string" },
						waiting: { type: "integer" },
						active: { type: "integer" },
						completed: { type: "integer" },
						failed: { type: "integer" },
						delayed: { type: "integer" },
						paused: { type: "boolean" },
						timestamp: { type: "string", format: "date-time" },
					},
				},

				// Queue Performance
				QueuePerformance: {
					type: "object",
					properties: {
						queueName: { type: "string" },
						throughput: {
							type: "object",
							properties: {
								jobsPerMinute: { type: "number" },
								jobsPerHour: { type: "number" },
							},
						},
						averageProcessingTime: { type: "number" },
						averageWaitTime: { type: "number" },
						successRate: { type: "number" },
						errorRate: { type: "number" },
						retryRate: { type: "number" },
						timestamp: { type: "string", format: "date-time" },
					},
				},

				// Job Metrics
				JobMetrics: {
					type: "object",
					properties: {
						jobId: { type: "string" },
						jobName: { type: "string" },
						queueName: { type: "string" },
						status: { type: "string", enum: ["waiting", "active", "completed", "failed", "delayed"] },
						createdAt: { type: "string", format: "date-time" },
						processedAt: { type: "string", format: "date-time", nullable: true },
						finishedAt: { type: "string", format: "date-time", nullable: true },
						processingTime: { type: "number", nullable: true },
						waitTime: { type: "number", nullable: true },
						attempts: { type: "integer" },
						maxAttempts: { type: "integer" },
						error: { type: "string", nullable: true },
						correlationId: { type: "string", nullable: true },
					},
				},

				// Webhook Configuration
				WebhookConfig: {
					type: "object",
					properties: {
						name: { type: "string", minLength: 1, maxLength: 255 },
						url: { type: "string", format: "uri", maxLength: 1000 },
						events: {
							type: "array",
							items: {
								type: "string",
								enum: [
									"job.created",
									"job.active",
									"job.completed",
									"job.failed",
									"job.delayed",
									"job.retry",
									"job.removed",
									"queue.paused",
									"queue.resumed",
									"queue.cleaned",
									"queue.drained",
									"alert.created",
									"alert.resolved",
									"metrics.threshold_exceeded",
								],
							},
							minItems: 1,
						},
						headers: {
							type: "object",
							additionalProperties: { type: "string" },
						},
						secret: { type: "string", minLength: 8, maxLength: 255 },
						enabled: { type: "boolean", default: true },
						retryPolicy: {
							type: "object",
							properties: {
								maxAttempts: { type: "integer", minimum: 1, maximum: 10, default: 3 },
								backoffType: { type: "string", enum: ["fixed", "exponential"], default: "exponential" },
								initialDelay: { type: "integer", minimum: 100, maximum: 60000, default: 1000 },
								maxDelay: { type: "integer", minimum: 1000, maximum: 300000, default: 30000 },
							},
						},
						timeout: { type: "integer", minimum: 1000, maximum: 30000, default: 10000 },
					},
					required: ["name", "url", "events"],
				},

				// Response Schemas
				QueuesListResponse: {
					allOf: [
						{ $ref: "#/components/schemas/SuccessResponse" },
						{
							type: "object",
							properties: {
								data: {
									type: "object",
									properties: {
										overview: {
											type: "object",
											properties: {
												totalQueues: { type: "integer" },
												totalJobs: { type: "integer" },
												activeJobs: { type: "integer" },
												failedJobs: { type: "integer" },
											},
										},
										queues: {
											type: "array",
											items: {
												type: "object",
												properties: {
													name: { type: "string" },
													health: { $ref: "#/components/schemas/QueueHealth" },
													performance: { $ref: "#/components/schemas/QueuePerformance" },
													status: { type: "string", enum: ["healthy", "warning", "critical"] },
												},
											},
										},
										pagination: { $ref: "#/components/schemas/Pagination" },
									},
								},
							},
						},
					],
				},

				QueueDetailsResponse: {
					allOf: [
						{ $ref: "#/components/schemas/SuccessResponse" },
						{
							type: "object",
							properties: {
								data: {
									type: "object",
									properties: {
										queueName: { type: "string" },
										health: { $ref: "#/components/schemas/QueueHealth" },
										performance: { $ref: "#/components/schemas/QueuePerformance" },
										status: { type: "string", enum: ["healthy", "warning", "critical"] },
										jobs: {
											type: "object",
											properties: {
												recent: {
													type: "array",
													items: { $ref: "#/components/schemas/JobMetrics" },
												},
												failed: {
													type: "array",
													items: { $ref: "#/components/schemas/JobMetrics" },
												},
												slow: {
													type: "array",
													items: { $ref: "#/components/schemas/JobMetrics" },
												},
											},
										},
									},
								},
							},
						},
					],
				},

				JobsListResponse: {
					allOf: [
						{ $ref: "#/components/schemas/SuccessResponse" },
						{
							type: "object",
							properties: {
								data: {
									type: "object",
									properties: {
										jobs: {
											type: "array",
											items: { $ref: "#/components/schemas/JobMetrics" },
										},
										summary: {
											type: "object",
											properties: {
												total: { type: "integer" },
												byStatus: {
													type: "object",
													properties: {
														waiting: { type: "integer" },
														active: { type: "integer" },
														completed: { type: "integer" },
														failed: { type: "integer" },
														delayed: { type: "integer" },
													},
												},
												averageProcessingTime: { type: "number" },
												averageWaitTime: { type: "number" },
												successRate: { type: "number" },
											},
										},
										pagination: { $ref: "#/components/schemas/Pagination" },
									},
								},
							},
						},
					],
				},

				WebhooksListResponse: {
					allOf: [
						{ $ref: "#/components/schemas/SuccessResponse" },
						{
							type: "object",
							properties: {
								data: {
									type: "object",
									properties: {
										webhooks: {
											type: "array",
											items: { $ref: "#/components/schemas/WebhookConfig" },
										},
										pagination: { $ref: "#/components/schemas/Pagination" },
									},
								},
							},
						},
					],
				},

				// Request Schemas
				QueueBatchAction: {
					type: "object",
					properties: {
						action: { type: "string", enum: ["pause", "resume", "clean", "retry_failed", "clear_completed"] },
						queueNames: {
							type: "array",
							items: { type: "string" },
							minItems: 1,
							maxItems: 50,
						},
						options: {
							type: "object",
							properties: {
								olderThan: { type: "integer", minimum: 0 },
								limit: { type: "integer", minimum: 1, maximum: 10000 },
							},
						},
					},
					required: ["action", "queueNames"],
				},

				JobBatchAction: {
					type: "object",
					properties: {
						action: { type: "string", enum: ["retry", "remove", "promote", "delay", "cancel"] },
						jobIds: {
							type: "array",
							items: { type: "string" },
							minItems: 1,
							maxItems: 1000,
						},
						queueName: { type: "string" },
						options: {
							type: "object",
							properties: {
								delay: { type: "integer", minimum: 0 },
								priority: { type: "integer", minimum: 0 },
								force: { type: "boolean", default: false },
							},
						},
					},
					required: ["action", "jobIds", "queueName"],
				},

				JobCreateRequest: {
					type: "object",
					properties: {
						queueName: { type: "string", minLength: 1 },
						jobName: { type: "string", minLength: 1 },
						data: { type: "object" },
						options: {
							type: "object",
							properties: {
								priority: { type: "integer", minimum: 0 },
								delay: { type: "integer", minimum: 0 },
								attempts: { type: "integer", minimum: 1, maximum: 10 },
							},
						},
					},
					required: ["queueName", "jobName", "data"],
				},

				// Generic Response Schemas
				BatchActionResponse: {
					allOf: [
						{ $ref: "#/components/schemas/SuccessResponse" },
						{
							type: "object",
							properties: {
								data: {
									type: "object",
									properties: {
										action: { type: "string" },
										summary: {
											type: "object",
											properties: {
												total: { type: "integer" },
												successful: { type: "integer" },
												failed: { type: "integer" },
											},
										},
										results: {
											type: "array",
											items: {
												type: "object",
												properties: {
													id: { type: "string" },
													success: { type: "boolean" },
													message: { type: "string" },
													details: { type: "object" },
												},
											},
										},
									},
								},
							},
						},
					],
				},
			},
			responses: {
				BadRequest: {
					description: "Bad Request - Invalid input data",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "VALIDATION_ERROR",
									message: "Invalid input data",
									details: {
										validationErrors: [
											{
												path: "name",
												message: "Name is required",
												code: "invalid_type",
											},
										],
									},
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				Unauthorized: {
					description: "Unauthorized - Invalid or missing authentication",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "UNAUTHORIZED",
									message: "Invalid or missing authentication token",
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				Forbidden: {
					description: "Forbidden - Insufficient permissions",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "FORBIDDEN",
									message: "Insufficient permissions to access this resource",
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				NotFound: {
					description: "Not Found - Resource does not exist",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "QUEUE_NOT_FOUND",
									message: "Queue not found: example-queue",
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				Conflict: {
					description: "Conflict - Resource already exists",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "WEBHOOK_NAME_EXISTS",
									message: "Webhook with name 'example-webhook' already exists",
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				RateLimitExceeded: {
					description: "Too Many Requests - Rate limit exceeded",
					headers: {
						"X-RateLimit-Limit": {
							description: "Request limit per window",
							schema: { type: "integer" },
						},
						"X-RateLimit-Remaining": {
							description: "Remaining requests in current window",
							schema: { type: "integer" },
						},
						"X-RateLimit-Reset": {
							description: "Time when the rate limit resets",
							schema: { type: "string", format: "date-time" },
						},
					},
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "RATE_LIMIT_EXCEEDED",
									message: "Rate limit exceeded: 1000 requests per 3600s",
									details: {
										limit: 1000,
										window: 3600,
									},
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
				InternalServerError: {
					description: "Internal Server Error",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/ErrorResponse" },
							example: {
								success: false,
								error: {
									code: "INTERNAL_SERVER_ERROR",
									message: "An unexpected error occurred",
									timestamp: "2024-01-01T00:00:00.000Z",
								},
							},
						},
					},
				},
			},
		},
		tags: [
			{
				name: "Queues",
				description: "Queue management operations",
			},
			{
				name: "Jobs",
				description: "Job management and monitoring",
			},
			{
				name: "Metrics",
				description: "Performance metrics and analytics",
			},
			{
				name: "Webhooks",
				description: "Webhook configuration and delivery",
			},
		],
	};
}
