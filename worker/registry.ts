/**
 * Worker Registry — Single Source of Truth for all BullMQ workers.
 *
 * Every worker in the system is declared here as a config entry.
 * init.ts reads this registry and instantiates workers in a single loop.
 *
 * To add a new worker:
 *   1. Create your processor function (e.g. WebhookWorkerTasks/my-task.ts)
 *   2. Add an entry to `workerRegistry` below
 *   3. Done — init.ts handles creation, event handlers, shutdown.
 */

import type { Job, Processor, JobsOptions } from "bullmq";

// --- Types ---

export interface ScheduleDefinition {
	/** Cron pattern (e.g. "0 9 * * *") */
	pattern: string;
	/** BullMQ job name */
	jobName: string;
	/** Job data payload */
	jobData?: Record<string, any>;
	/** Human-readable description for startup banner */
	description?: string;
}

export interface WorkerDefinition {
	/** Display name for logs and startup banner */
	name: string;
	/** BullMQ queue name */
	queue: string;
	/** Job processor function */
	processor: Processor;
	/** Max concurrent jobs (default: 1) */
	concurrency?: number;
	/** Max time a job can run before considered stalled (default: 30000ms) */
	lockDuration?: number;
	/** How often to check for stalled jobs (default: 30000ms) */
	stalledInterval?: number;
	/** Max stalled occurrences before marking failed (default: 1) */
	maxStalledCount?: number;
	/** BullMQ limiter config (optional) */
	limiter?: { max: number; duration: number };
	/** If false, init failure won't crash the container (default: true) */
	critical?: boolean;
	/** Emoji for startup banner */
	icon?: string;
	/** Short description for startup banner */
	description?: string;
	/** Default job options for this queue (attempts, backoff, retention).
	 *  Queue files import via getRegistryJobDefaults() to stay in sync. */
	defaultJobOptions?: Partial<JobsOptions>;
	/** Recurring BullMQ schedules (repeat jobs). Registered by init.ts on startup. */
	schedule?: ScheduleDefinition[];
}

// --- Global Defaults (used when a worker has no explicit defaultJobOptions) ---

export const GLOBAL_JOB_DEFAULTS: Partial<JobsOptions> = {
	attempts: 3,
	backoff: { type: "exponential", delay: 2000 },
	removeOnComplete: 50,
	removeOnFail: 20,
};

/**
 * Returns defaultJobOptions for a queue from the registry.
 * Queue files should use this instead of defining their own inline defaults.
 */
export function getRegistryJobDefaults(queueName: string): Partial<JobsOptions> {
	const def = workerRegistry.find((w) => w.queue === queueName);
	return def?.defaultJobOptions ?? GLOBAL_JOB_DEFAULTS;
}

// --- Processor Imports ---

import { processAgendamentoTask } from "./WebhookWorkerTasks/agendamento.task";
import { processLeadCellTask } from "./WebhookWorkerTasks/leadcells.task";
import { processMirrorGenerationTask } from "./WebhookWorkerTasks/mirror-generation.task";
import { processAnalysisGenerationTask } from "./WebhookWorkerTasks/analysis-generation.task";
import { processLeadChatwitTask } from "./WebhookWorkerTasks/leads-chatwit.task";
import { processFlowBuilderTask } from "./WebhookWorkerTasks/flow-builder-queues.task";
import { processFlowCampaignTask } from "./WebhookWorkerTasks/flow-campaign.task";
import { processInstagramWebhook } from "./processors/instagram-webhook.processor";
import { processFxRateJob } from "@/lib/cost/fx-rate-worker";
import { processBudgetJob } from "@/lib/cost/budget-monitor";
import { processWebhookDelivery } from "@/lib/webhook/webhook-queue";
import { processTranscriptionJob } from "@/lib/oab-eval/transcription-queue";
import { processCostJob } from "@/lib/cost/cost-worker";

// --- Config Imports ---

import { INSTAGRAM_WEBHOOK_QUEUE_NAME } from "@/lib/queue/instagram-webhook.queue";
import { LEADS_QUEUE_NAME } from "@/lib/queue/leads-chatwit.queue";
import { FLOW_BUILDER_QUEUE_NAME } from "@/lib/queue/flow-builder-queues";
import { FLOW_CAMPAIGN_QUEUE_NAME } from "@/lib/queue/flow-campaign-queue";
import { COST_QUEUE_NAME } from "@/lib/cost/queue-config";
import { getWorkersConfig } from "@/lib/config";
import { getConfigValue } from "@/lib/config";

// --- Build Registry ---

const workersConfig = getWorkersConfig();

export const workerRegistry: WorkerDefinition[] = [
	// ---- Core Workers ----
	{
		name: "Agendamento",
		queue: "agendamento",
		processor: processAgendamentoTask,
		icon: "⏰",
		description: "Mensagens agendadas",
	},
	{
		name: "LeadCells",
		queue: "leadCells",
		processor: processLeadCellTask,
		concurrency: 5,
		lockDuration: 30000,
		icon: "📝",
		description: "Manuscrito, espelho, análise",
	},
	{
		name: "MirrorGeneration",
		queue: "oab-mirror-generation",
		processor: processMirrorGenerationTask,
		concurrency: 5,
		lockDuration: 300000,
		icon: "🪞",
		description: "Geração de espelhos OAB",
	},
	{
		name: "AnalysisGeneration",
		queue: "oab-analysis",
		processor: processAnalysisGenerationTask,
		concurrency: 3,
		lockDuration: 300000,
		icon: "🔍",
		description: "Análise comparativa Prova × Espelho",
	},
	{
		name: "LeadsChatwit",
		queue: LEADS_QUEUE_NAME,
		processor: processLeadChatwitTask,
		concurrency: workersConfig.leads_chatwit.concurrency,
		lockDuration: workersConfig.leads_chatwit.lock_duration,
		stalledInterval: 60000,
		maxStalledCount: 2,
		defaultJobOptions: {
			attempts: 5,
			backoff: { type: "exponential", delay: 1_000 },
			removeOnComplete: 10_000,
			removeOnFail: 5_000,
		},
		icon: "🔥",
		description: "Processamento de leads",
	},
	{
		name: "FlowBuilder",
		queue: FLOW_BUILDER_QUEUE_NAME,
		processor: processFlowBuilderTask,
		concurrency: 10,
		lockDuration: 30000,
		stalledInterval: 60000,
		maxStalledCount: 2,
		defaultJobOptions: {
			attempts: 3,
			backoff: { type: "exponential", delay: 2000 },
			removeOnComplete: 100,
			removeOnFail: 50,
		},
		icon: "🔧",
		description: "Ações assíncronas do Flow Engine",
	},
	{
		name: "InstagramWebhook",
		queue: INSTAGRAM_WEBHOOK_QUEUE_NAME,
		processor: processInstagramWebhook,
		icon: "📱",
		description: "Automação Instagram",
	},
	{
		name: "Transcription",
		queue: "oab-transcription",
		processor: processTranscriptionJob as Processor,
		concurrency: getConfigValue("oab_eval.queue.max_concurrent_jobs", 3),
		limiter: {
			max: getConfigValue("oab_eval.queue.max_concurrent_jobs", 3),
			duration: 1000,
		},
		icon: "📄",
		description: "Digitação de manuscritos",
	},

	// ---- Non-critical Workers (failure doesn't crash container) ----
	{
		name: "FxRate",
		queue: "fx-rate-updates",
		processor: processFxRateJob,
		concurrency: 1,
		critical: false,
		defaultJobOptions: {
			removeOnComplete: 10,
			removeOnFail: 5,
			attempts: 3,
			backoff: { type: "exponential", delay: 2000 },
		},
		schedule: [
			{ pattern: "0 9 * * *", jobName: "update-daily-rate", jobData: {}, description: "Câmbio diário 9h UTC" },
			{ pattern: "0 2 * * 0", jobName: "cleanup-old-rates", jobData: {}, description: "Limpeza semanal dom 2h UTC" },
		],
		icon: "💱",
		description: "Atualização diária câmbio USD/BRL",
	},
	{
		name: "BudgetMonitor",
		queue: "budget-monitor",
		processor: processBudgetJob,
		concurrency: 1,
		critical: false,
		defaultJobOptions: {
			removeOnComplete: 10,
			removeOnFail: 5,
			attempts: 3,
			backoff: { type: "exponential", delay: 2000 },
		},
		schedule: [
			{ pattern: "0 * * * *", jobName: "check-all-budgets", jobData: { type: "check-all-budgets" }, description: "Verificação horária" },
		],
		icon: "💰",
		description: "Monitoramento de orçamentos",
	},
	{
		name: "WebhookDelivery",
		queue: "webhook-delivery",
		processor: processWebhookDelivery,
		concurrency: 10,
		critical: false,
		icon: "📤",
		description: "Entrega de webhooks com retry",
	},
	{
		name: "FlowCampaign",
		queue: FLOW_CAMPAIGN_QUEUE_NAME,
		processor: processFlowCampaignTask,
		concurrency: 5,
		lockDuration: 60000,
		stalledInterval: 120000,
		maxStalledCount: 2,
		critical: false,
		defaultJobOptions: {
			attempts: 3,
			backoff: { type: "exponential", delay: 5000 },
			removeOnComplete: 200,
			removeOnFail: 100,
			priority: 8,
		},
		icon: "📢",
		description: "Disparos de campanhas de flows",
	},
	{
		name: "CostEvents",
		queue: COST_QUEUE_NAME,
		processor: processCostJob,
		concurrency: 2,
		stalledInterval: 30000,
		maxStalledCount: 1,
		critical: false,
		defaultJobOptions: {
			priority: 10,
			removeOnComplete: 100,
			removeOnFail: 50,
			attempts: 3,
			backoff: { type: "exponential", delay: 2000 },
		},
		icon: "📊",
		description: "Processamento de eventos de custo",
	},
];
