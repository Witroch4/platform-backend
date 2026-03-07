#!/usr/bin/env tsx

/**
 * Script para popular tabela de preços oficiais (PriceCard)
 * Inclui preços atuais do OpenAI e WhatsApp Business API por região
 */

import { PrismaClient, Provider, Unit } from "@prisma/client";

const prisma = new PrismaClient();

// Preços OpenAI atualizados (Janeiro 2025)
const OPENAI_PRICES = [
	// GPT-4o models
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 2.5, // $2.50 per 1M input tokens
		effectiveFrom: new Date("2024-05-13"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 10.0, // $10.00 per 1M output tokens
		effectiveFrom: new Date("2024-05-13"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o",
		unit: "TOKENS_CACHED" as Unit,
		pricePerUnit: 1.25, // $1.25 per 1M cached tokens (50% discount)
		effectiveFrom: new Date("2024-10-01"),
	},

	// GPT-4o-mini models
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o-mini",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.15, // $0.15 per 1M input tokens
		effectiveFrom: new Date("2024-07-18"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o-mini",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.6, // $0.60 per 1M output tokens
		effectiveFrom: new Date("2024-07-18"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4o-mini",
		unit: "TOKENS_CACHED" as Unit,
		pricePerUnit: 0.075, // $0.075 per 1M cached tokens (50% discount)
		effectiveFrom: new Date("2024-10-01"),
	},

	// GPT-4 Turbo models
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4-turbo",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 10.0, // $10.00 per 1M input tokens
		effectiveFrom: new Date("2024-04-09"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4-turbo",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 30.0, // $30.00 per 1M output tokens
		effectiveFrom: new Date("2024-04-09"),
	},

	// GPT-3.5 Turbo models
	{
		provider: "OPENAI" as Provider,
		product: "gpt-3.5-turbo",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.5, // $0.50 per 1M input tokens
		effectiveFrom: new Date("2023-06-13"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-3.5-turbo",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 1.5, // $1.50 per 1M output tokens
		effectiveFrom: new Date("2023-06-13"),
	},

	// DALL-E 3 models
	{
		provider: "OPENAI" as Provider,
		product: "dall-e-3",
		unit: "IMAGE_HIGH" as Unit,
		pricePerUnit: 0.08, // $0.080 per image (1024×1024, HD)
		effectiveFrom: new Date("2023-10-01"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "dall-e-3",
		unit: "IMAGE_MEDIUM" as Unit,
		pricePerUnit: 0.04, // $0.040 per image (1024×1024, standard)
		effectiveFrom: new Date("2023-10-01"),
	},

	// DALL-E 2 models
	{
		provider: "OPENAI" as Provider,
		product: "dall-e-2",
		unit: "IMAGE_HIGH" as Unit,
		pricePerUnit: 0.02, // $0.020 per image (1024×1024)
		effectiveFrom: new Date("2022-11-01"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "dall-e-2",
		unit: "IMAGE_MEDIUM" as Unit,
		pricePerUnit: 0.018, // $0.018 per image (512×512)
		effectiveFrom: new Date("2022-11-01"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "dall-e-2",
		unit: "IMAGE_LOW" as Unit,
		pricePerUnit: 0.016, // $0.016 per image (256×256)
		effectiveFrom: new Date("2022-11-01"),
	},

	// Whisper models
	{
		provider: "OPENAI" as Provider,
		product: "whisper-1",
		unit: "OTHER" as Unit,
		pricePerUnit: 0.006, // $0.006 per minute
		effectiveFrom: new Date("2023-03-01"),
		metadata: { unit_description: "per_minute" },
	},

	// GPT-4.1 models (Abril 2025)
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 2.0, // $2.00 per 1M input tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 8.0, // $8.00 per 1M output tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1",
		unit: "TOKENS_CACHED" as Unit,
		pricePerUnit: 0.5, // $0.50 per 1M cached tokens
		effectiveFrom: new Date("2025-04-14"),
	},

	// GPT-4.1 Mini
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-mini",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.4, // $0.40 per 1M input tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-mini",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 1.6, // $1.60 per 1M output tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-mini",
		unit: "TOKENS_CACHED" as Unit,
		pricePerUnit: 0.1,
		effectiveFrom: new Date("2025-04-14"),
	},

	// GPT-4.1 Nano
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-nano",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.1, // $0.10 per 1M input tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-nano",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.4, // $0.40 per 1M output tokens
		effectiveFrom: new Date("2025-04-14"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "gpt-4.1-nano",
		unit: "TOKENS_CACHED" as Unit,
		pricePerUnit: 0.025,
		effectiveFrom: new Date("2025-04-14"),
	},

	// Text Embedding models
	{
		provider: "OPENAI" as Provider,
		product: "text-embedding-3-small",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.02, // $0.02 per 1M tokens
		effectiveFrom: new Date("2024-01-25"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "text-embedding-3-large",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.13, // $0.13 per 1M tokens
		effectiveFrom: new Date("2024-01-25"),
	},
	{
		provider: "OPENAI" as Provider,
		product: "text-embedding-ada-002",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.1, // $0.10 per 1M tokens
		effectiveFrom: new Date("2022-12-15"),
	},
];

// Preços Gemini (Google) — Março 2026
// Referência: https://ai.google.dev/pricing  +  valores definidos em transcription-progress.tsx
const GEMINI_PRICES = [
	// Gemini 3 Flash Preview
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3-flash-preview",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.5, // $0.50 per 1M input tokens
		effectiveFrom: new Date("2025-06-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3-flash-preview",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 3.0, // $3.00 per 1M output tokens
		effectiveFrom: new Date("2025-06-01"),
	},

	// Gemini 3 Pro Preview
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3-pro-preview",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 2.0, // $2.00 per 1M input tokens
		effectiveFrom: new Date("2025-06-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3-pro-preview",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 12.0, // $12.00 per 1M output tokens
		effectiveFrom: new Date("2025-06-01"),
	},

	// Gemini 3.1 Pro Preview
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3.1-pro-preview",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 2.0,
		effectiveFrom: new Date("2025-09-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-3.1-pro-preview",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 12.0,
		effectiveFrom: new Date("2025-09-01"),
	},

	// Gemini 2.5 Pro
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-pro",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 1.25, // $1.25 per 1M input tokens
		effectiveFrom: new Date("2025-01-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-pro",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 10.0, // $10.00 per 1M output tokens
		effectiveFrom: new Date("2025-01-01"),
	},

	// Gemini 2.5 Flash
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-flash",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.3, // $0.30 per 1M input tokens
		effectiveFrom: new Date("2025-01-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-flash",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 2.5, // $2.50 per 1M output tokens
		effectiveFrom: new Date("2025-01-01"),
	},

	// Gemini 2.5 Flash Lite
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-flash-lite",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.1,
		effectiveFrom: new Date("2025-01-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.5-flash-lite",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.4,
		effectiveFrom: new Date("2025-01-01"),
	},

	// Gemini Flash Latest (alias para 2.5-flash)
	{
		provider: "GEMINI" as Provider,
		product: "gemini-flash-latest",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.3,
		effectiveFrom: new Date("2025-01-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-flash-latest",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 2.5,
		effectiveFrom: new Date("2025-01-01"),
	},

	// Gemini 2.0 Flash
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.0-flash",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.1, // $0.10 per 1M input tokens
		effectiveFrom: new Date("2025-02-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.0-flash",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.4, // $0.40 per 1M output tokens
		effectiveFrom: new Date("2025-02-01"),
	},

	// Gemini 2.0 Flash Lite
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.0-flash-lite",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.075,
		effectiveFrom: new Date("2025-02-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-2.0-flash-lite",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.3,
		effectiveFrom: new Date("2025-02-01"),
	},

	// Gemini 1.5 Pro (legacy)
	{
		provider: "GEMINI" as Provider,
		product: "gemini-1.5-pro",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 1.25,
		effectiveFrom: new Date("2024-05-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-1.5-pro",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 5.0,
		effectiveFrom: new Date("2024-05-01"),
	},

	// Gemini 1.5 Flash (legacy)
	{
		provider: "GEMINI" as Provider,
		product: "gemini-1.5-flash",
		unit: "TOKENS_IN" as Unit,
		pricePerUnit: 0.075,
		effectiveFrom: new Date("2024-05-01"),
	},
	{
		provider: "GEMINI" as Provider,
		product: "gemini-1.5-flash",
		unit: "TOKENS_OUT" as Unit,
		pricePerUnit: 0.3,
		effectiveFrom: new Date("2024-05-01"),
	},
];

// Preços WhatsApp Business API por região (Janeiro 2025)
const WHATSAPP_PRICES = [
	// Brasil - Templates de Marketing
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "MARKETING_TEMPLATE" as Unit,
		region: "BR",
		pricePerUnit: 0.0255, // $0.0255 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Brasil - Templates de Utilidade
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "UTILITY_TEMPLATE" as Unit,
		region: "BR",
		pricePerUnit: 0.0021, // $0.0021 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Brasil - Templates de Autenticação
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "AUTH_TEMPLATE" as Unit,
		region: "BR",
		pricePerUnit: 0.0045, // $0.0045 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Estados Unidos - Templates de Marketing
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "MARKETING_TEMPLATE" as Unit,
		region: "US",
		pricePerUnit: 0.0225, // $0.0225 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Estados Unidos - Templates de Utilidade
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "UTILITY_TEMPLATE" as Unit,
		region: "US",
		pricePerUnit: 0.0055, // $0.0055 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Estados Unidos - Templates de Autenticação
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "AUTH_TEMPLATE" as Unit,
		region: "US",
		pricePerUnit: 0.005, // $0.0050 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Argentina - Templates de Marketing
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "MARKETING_TEMPLATE" as Unit,
		region: "AR",
		pricePerUnit: 0.0165, // $0.0165 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Argentina - Templates de Utilidade
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "UTILITY_TEMPLATE" as Unit,
		region: "AR",
		pricePerUnit: 0.0053, // $0.0053 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// México - Templates de Marketing
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "MARKETING_TEMPLATE" as Unit,
		region: "MX",
		pricePerUnit: 0.0235, // $0.0235 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// México - Templates de Utilidade
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "UTILITY_TEMPLATE" as Unit,
		region: "MX",
		pricePerUnit: 0.0027, // $0.0027 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Preços globais (fallback para regiões não especificadas)
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "MARKETING_TEMPLATE" as Unit,
		region: null, // Global fallback
		pricePerUnit: 0.03, // $0.0300 per message (preço mais alto como fallback)
		effectiveFrom: new Date("2024-02-01"),
	},

	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "UTILITY_TEMPLATE" as Unit,
		region: null, // Global fallback
		pricePerUnit: 0.008, // $0.0080 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "AUTH_TEMPLATE" as Unit,
		region: null, // Global fallback
		pricePerUnit: 0.006, // $0.0060 per message
		effectiveFrom: new Date("2024-02-01"),
	},

	// Fallback legado (unit genérica antes da categorização por tipo de template)
	{
		provider: "META_WHATSAPP" as Provider,
		product: "WABA",
		unit: "WHATSAPP_TEMPLATE" as Unit,
		region: null,
		pricePerUnit: 0.03, // $0.0300 — usa preço de marketing como fallback conservador
		effectiveFrom: new Date("2024-01-01"),
	},
];

async function seedPriceCards() {
	console.log("🚀 Iniciando seed de preços oficiais...");

	try {
		// Limpar preços existentes (opcional - comentar se quiser manter histórico)
		console.log("🧹 Limpando preços existentes...");
		await prisma.priceCard.deleteMany({});

		// Inserir preços OpenAI
		console.log("💰 Inserindo preços OpenAI...");
		for (const price of OPENAI_PRICES) {
			await prisma.priceCard.create({
				data: {
					provider: price.provider,
					product: price.product,
					unit: price.unit,
					region: null, // OpenAI não tem preços regionais
					currency: "USD",
					pricePerUnit: price.pricePerUnit,
					effectiveFrom: price.effectiveFrom,
					effectiveTo: null, // Preços atuais sem data de expiração
					metadata: price.metadata || {},
				},
			});
		}

		// Inserir preços WhatsApp
		console.log("📱 Inserindo preços WhatsApp...");
		for (const price of WHATSAPP_PRICES) {
			await prisma.priceCard.create({
				data: {
					provider: price.provider,
					product: price.product,
					unit: price.unit,
					region: price.region,
					currency: "USD",
					pricePerUnit: price.pricePerUnit,
					effectiveFrom: price.effectiveFrom,
					effectiveTo: null,
					metadata: {},
				},
			});
		}

		// Inserir preços Gemini
		console.log("🤖 Inserindo preços Gemini...");
		for (const price of GEMINI_PRICES) {
			await prisma.priceCard.create({
				data: {
					provider: price.provider,
					product: price.product,
					unit: price.unit,
					region: null,
					currency: "USD",
					pricePerUnit: price.pricePerUnit,
					effectiveFrom: price.effectiveFrom,
					effectiveTo: null,
					metadata: {},
				},
			});
		}

		// Estatísticas finais
		const totalPrices = await prisma.priceCard.count();
		const openaiCount = await prisma.priceCard.count({
			where: { provider: "OPENAI" },
		});
		const whatsappCount = await prisma.priceCard.count({
			where: { provider: "META_WHATSAPP" },
		});
		const geminiCount = await prisma.priceCard.count({
			where: { provider: "GEMINI" },
		});

		console.log("✅ Seed de preços concluído com sucesso!");
		console.log(`📊 Total de preços inseridos: ${totalPrices}`);
		console.log(`🤖 OpenAI: ${openaiCount} preços`);
		console.log(`📱 WhatsApp: ${whatsappCount} preços`);
		console.log(`🔮 Gemini: ${geminiCount} preços`);

		// Mostrar alguns exemplos
		console.log("\n📋 Exemplos de preços inseridos:");
		const samplePrices = await prisma.priceCard.findMany({
			take: 5,
			orderBy: { createdAt: "desc" },
			select: {
				provider: true,
				product: true,
				unit: true,
				region: true,
				pricePerUnit: true,
				effectiveFrom: true,
			},
		});

		samplePrices.forEach((price) => {
			console.log(
				`  ${price.provider} | ${price.product} | ${price.unit} | ${
					price.region || "Global"
				} | $${price.pricePerUnit} | ${price.effectiveFrom.toISOString().split("T")[0]}`,
			);
		});
	} catch (error) {
		console.error("❌ Erro durante o seed de preços:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Executar seed se chamado diretamente
if (require.main === module) {
	seedPriceCards()
		.then(() => {
			console.log("🎉 Seed de preços finalizado!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Falha no seed de preços:", error);
			process.exit(1);
		});
}

export { seedPriceCards };
