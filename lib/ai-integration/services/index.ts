// AI Integration services
// These will be implemented in subsequent tasks

export * from "./hmac-auth";
export * from "./idempotency";
export * from "./rate-limiter";
export * from "./payload-normalizer";
export * from "./ai-message-queue";
export * from "./conversation-lock";
export * from "./message-ordering";

// Intent classification system services
export * from "./embedding-generator";
// export * from './similarity-search'; // Removido - classification.ts é o padrão
export * from "./intent-classifier";
export * from "./threshold-tuner";
export * from "./payload-router";
export * from "./button-router";
export * from "./conversation-context";
export * from "./template-registry";

export * from "./sanitization";
export * from "./domain-allowlist";

// Chatwit API integration services
export * from "./chatwit-api-client";
export * from "./message-formatter";
export * from "./chatwit-error-handler";
export * from "./outbound-idempotency";
export * from "./human-handoff";
export * from "./typing-indicators";
export * from "./retry-classifier";
export * from "./chatwit-integration";

// Cost control and economic mode services
export * from "./cost-tracker";
export * from "./economic-mode";
export * from "./budget-guard";
export * from "./intent-cost-policy";

// Feature flag services
export * from "./feature-flag-service";
export * from "./feature-flag-manager";

// export * from './webhook-handler';
// export * from './llm-generator';
