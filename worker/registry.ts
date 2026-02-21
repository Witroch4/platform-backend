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

import type { Job, Processor } from "bullmq";

// --- Types ---

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
}

// --- Processor Imports ---

import { processAgendamentoTask } from "./WebhookWorkerTasks/agendamento.task";
import { processLeadCellTask } from "./WebhookWorkerTasks/leadcells.task";
import { processMirrorGenerationTask } from "./WebhookWorkerTasks/mirror-generation.task";
import { processAnalysisGenerationTask } from "./WebhookWorkerTasks/analysis-generation.task";
import { processLeadChatwitTask } from "./WebhookWorkerTasks/leads-chatwit.task";
import { processFlowBuilderTask } from "./WebhookWorkerTasks/flow-builder-queues.task";
import { processInstagramTranslationTask } from "./WebhookWorkerTasks/instagram-translation.task";
import { processInstagramWebhook } from "./processors/instagram-webhook.processor";
import { processFxRateJob } from "@/lib/cost/fx-rate-worker";
import { processBudgetJob } from "@/lib/cost/budget-monitor";
import { processWebhookDelivery } from "@/lib/webhook/webhook-queue";
import { processTranscriptionJob } from "@/lib/oab-eval/transcription-queue";
import { processCostJob } from "@/lib/cost/cost-worker";

// --- Config Imports ---

import { INSTAGRAM_WEBHOOK_QUEUE_NAME } from "@/lib/queue/instagram-webhook.queue";
import { LEADS_QUEUE_NAME } from "@/lib/queue/leads-chatwit.queue";
import { INSTAGRAM_TRANSLATION_QUEUE_NAME } from "@/lib/queue/instagram-translation.queue";
import { FLOW_BUILDER_QUEUE_NAME } from "@/lib/queue/flow-builder-queues";
import { COST_QUEUE_NAME } from "@/lib/cost/queue-config";
import { getWorkersConfig } from "@/lib/config";
import { getCurrentWorkerConfig } from "./config/instagram-translation-worker.config";
import { getConfigValue } from "@/lib/config";

// --- Build Registry ---

const workersConfig = getWorkersConfig();
const instagramConfig = getCurrentWorkerConfig();

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
		name: "InstagramTranslation",
		queue: INSTAGRAM_TRANSLATION_QUEUE_NAME,
		processor: processInstagramTranslationTask,
		concurrency: instagramConfig.concurrency,
		lockDuration: instagramConfig.lockDuration,
		stalledInterval: 30000,
		maxStalledCount: 1,
		icon: "🌐",
		description: "Tradução Instagram",
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
		icon: "💱",
		description: "Atualização diária câmbio USD/BRL",
	},
	{
		name: "BudgetMonitor",
		queue: "budget-monitor",
		processor: processBudgetJob,
		concurrency: 1,
		critical: false,
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
		name: "CostEvents",
		queue: COST_QUEUE_NAME,
		processor: processCostJob,
		concurrency: 2,
		stalledInterval: 30000,
		maxStalledCount: 1,
		critical: false,
		icon: "📊",
		description: "Processamento de eventos de custo",
	},
];
