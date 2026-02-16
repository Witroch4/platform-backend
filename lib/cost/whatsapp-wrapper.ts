import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { guardWhatsAppOperation, logBlockedOperation, BudgetExceededException } from "./budget-guard";

// Configuração da fila de custos
const getCostQueue = () => {
	const redis = getRedisInstance();
	return new Queue("cost-events", {
		connection: redis,
		defaultJobOptions: {
			priority: 10, // baixa prioridade
			removeOnComplete: 100,
			removeOnFail: 50,
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 2000,
			},
		},
	});
};

export type WhatsAppHookArgs = {
	templateName: string;
	to: string;
	meta?: {
		inboxId?: string;
		userId?: string;
		sessionId?: string;
		traceId?: string;
		intent?: string;
	};
};

export type WhatsAppSendResult = {
	messageId: string;
	status: string;
	[key: string]: any;
};

/**
 * Deriva a região baseada no número de telefone
 * Usa códigos de país para determinar a região de cobrança do WhatsApp
 */
export function deriveRegionFromPhone(phoneNumber: string): string {
	// Remove caracteres não numéricos
	const cleanPhone = phoneNumber.replace(/\D/g, "");

	// Mapeia códigos de país para regiões de cobrança WhatsApp
	const regionMap: Record<string, string> = {
		// América do Norte
		"1": "NORTH_AMERICA",

		// Brasil
		"55": "BRAZIL",

		// Argentina
		"54": "ARGENTINA",

		// Europa Ocidental
		"33": "WESTERN_EUROPE", // França
		"49": "WESTERN_EUROPE", // Alemanha
		"44": "WESTERN_EUROPE", // Reino Unido
		"39": "WESTERN_EUROPE", // Itália
		"34": "WESTERN_EUROPE", // Espanha
		"31": "WESTERN_EUROPE", // Holanda

		// Ásia-Pacífico
		"81": "ASIA_PACIFIC", // Japão
		"82": "ASIA_PACIFIC", // Coreia do Sul
		"86": "ASIA_PACIFIC", // China
		"91": "ASIA_PACIFIC", // Índia
		"61": "ASIA_PACIFIC", // Austrália

		// Oriente Médio
		"971": "MIDDLE_EAST", // UAE
		"966": "MIDDLE_EAST", // Arábia Saudita
		"972": "MIDDLE_EAST", // Israel

		// África
		"27": "AFRICA", // África do Sul
		"234": "AFRICA", // Nigéria
		"20": "AFRICA", // Egito
	};

	// Tenta encontrar correspondência por código de país
	for (const [code, region] of Object.entries(regionMap)) {
		if (cleanPhone.startsWith(code)) {
			return region;
		}
	}

	// Fallback para região padrão
	return "OTHER";
}

/**
 * Determina o tipo de template baseado no nome
 */
export function getTemplateCategory(templateName: string): string {
	const name = templateName.toLowerCase();

	if (name.includes("auth") || name.includes("otp") || name.includes("verification")) {
		return "AUTH_TEMPLATE";
	}

	if (name.includes("utility") || name.includes("receipt") || name.includes("confirmation")) {
		return "UTILITY_TEMPLATE";
	}

	// Por padrão, considera marketing
	return "MARKETING_TEMPLATE";
}

/**
 * Wrapper para envio de templates WhatsApp com captura de custos
 * Intercepta envios e publica eventos de custo para processamento assíncrono
 * Inclui verificação de orçamento e controles automáticos
 */
export async function whatsappWithCost(
	sendFunction: (templateName: string, to: string) => Promise<WhatsAppSendResult>,
	args: WhatsAppHookArgs,
): Promise<WhatsAppSendResult> {
	const started = Date.now();
	const costQueue = getCostQueue();

	try {
		// Verificar orçamento antes da operação
		const budgetGuard = await guardWhatsAppOperation(args.meta?.inboxId, args.meta?.userId);

		if (!budgetGuard.allowed) {
			logBlockedOperation("WhatsApp Template Send", budgetGuard.reason || "Orçamento excedido", {
				inboxId: args.meta?.inboxId,
				userId: args.meta?.userId,
			});

			throw new BudgetExceededException(
				budgetGuard.reason || "Envio bloqueado por orçamento excedido",
				args.meta?.inboxId ? "inbox" : "user",
				args.meta?.inboxId || args.meta?.userId || "unknown",
			);
		}

		// Executa o envio original
		const result = await sendFunction(args.templateName, args.to);
		const latencyMs = Date.now() - started;

		// Deriva informações para cobrança
		const region = deriveRegionFromPhone(args.to);
		const templateCategory = getTemplateCategory(args.templateName);

		// Publica evento de custo apenas se o envio foi bem-sucedido
		if (result.messageId && result.status !== "failed") {
			await costQueue.add("cost-event", {
				ts: new Date().toISOString(),
				provider: "META_WHATSAPP",
				product: "WABA",
				unit: "WHATSAPP_TEMPLATE",
				units: 1,
				region,
				externalId: result.messageId,
				raw: {
					templateName: args.templateName,
					templateCategory,
					to: args.to,
					region,
					latencyMs,
					deliveredAt: new Date().toISOString(),
					status: result.status,
				},
				traceId: args.meta?.traceId,
				sessionId: args.meta?.sessionId,
				inboxId: args.meta?.inboxId,
				userId: args.meta?.userId,
				intent: args.meta?.intent,
			});
		}

		return result;
	} catch (error) {
		const latencyMs = Date.now() - started;

		// Log do erro
		console.error("Erro no envio WhatsApp:", error);

		// Ainda tenta capturar o evento de erro para análise
		try {
			const region = deriveRegionFromPhone(args.to);
			const templateCategory = getTemplateCategory(args.templateName);

			await costQueue.add("cost-event", {
				ts: new Date().toISOString(),
				provider: "META_WHATSAPP",
				product: "WABA",
				unit: "WHATSAPP_TEMPLATE",
				units: 0, // Não cobra por falhas
				region,
				externalId: `error-${Date.now()}`,
				raw: {
					templateName: args.templateName,
					templateCategory,
					to: args.to,
					region,
					latencyMs,
					error: error?.toString(),
					status: "failed",
				},
				traceId: args.meta?.traceId,
				sessionId: args.meta?.sessionId,
				inboxId: args.meta?.inboxId,
				userId: args.meta?.userId,
				intent: args.meta?.intent,
			});
		} catch (queueError) {
			console.error("Erro ao publicar evento de custo WhatsApp:", queueError);
		}

		// Re-throw o erro original
		throw error;
	}
}

/**
 * Wrapper específico para templates de marketing
 */
export async function whatsappMarketingWithCost(
	sendFunction: (templateName: string, to: string, variables?: Record<string, string>) => Promise<WhatsAppSendResult>,
	templateName: string,
	to: string,
	variables?: Record<string, string>,
	meta?: WhatsAppHookArgs["meta"],
): Promise<WhatsAppSendResult> {
	return whatsappWithCost((name, phone) => sendFunction(name, phone, variables), { templateName, to, meta });
}

/**
 * Wrapper específico para templates de utilidade
 */
export async function whatsappUtilityWithCost(
	sendFunction: (templateName: string, to: string, data?: any) => Promise<WhatsAppSendResult>,
	templateName: string,
	to: string,
	data?: any,
	meta?: WhatsAppHookArgs["meta"],
): Promise<WhatsAppSendResult> {
	return whatsappWithCost((name, phone) => sendFunction(name, phone, data), { templateName, to, meta });
}

/**
 * Wrapper específico para templates de autenticação
 */
export async function whatsappAuthWithCost(
	sendFunction: (templateName: string, to: string, otp: string) => Promise<WhatsAppSendResult>,
	templateName: string,
	to: string,
	otp: string,
	meta?: WhatsAppHookArgs["meta"],
): Promise<WhatsAppSendResult> {
	return whatsappWithCost((name, phone) => sendFunction(name, phone, otp), { templateName, to, meta });
}

/**
 * Função auxiliar para capturar custos de mensagens já enviadas
 * Útil para webhooks de confirmação de entrega
 */
export async function captureWhatsAppDelivery(
	messageId: string,
	templateName: string,
	to: string,
	meta?: {
		inboxId?: string;
		userId?: string;
		sessionId?: string;
		traceId?: string;
		intent?: string;
	},
): Promise<void> {
	const costQueue = getCostQueue();
	const region = deriveRegionFromPhone(to);
	const templateCategory = getTemplateCategory(templateName);

	try {
		await costQueue.add("cost-event", {
			ts: new Date().toISOString(),
			provider: "META_WHATSAPP",
			product: "WABA",
			unit: "WHATSAPP_TEMPLATE",
			units: 1,
			region,
			externalId: messageId,
			raw: {
				templateName,
				templateCategory,
				to,
				region,
				deliveredAt: new Date().toISOString(),
				status: "delivered",
				captureType: "webhook_confirmation",
			},
			traceId: meta?.traceId,
			sessionId: meta?.sessionId,
			inboxId: meta?.inboxId,
			userId: meta?.userId,
			intent: meta?.intent,
		});
	} catch (error) {
		console.error("Erro ao capturar entrega WhatsApp:", error);
	}
}
