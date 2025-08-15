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
    pricePerUnit: 2.50, // $2.50 per 1M input tokens
    effectiveFrom: new Date("2024-05-13"),
  },
  {
    provider: "OPENAI" as Provider,
    product: "gpt-4o",
    unit: "TOKENS_OUT" as Unit,
    pricePerUnit: 10.00, // $10.00 per 1M output tokens
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
    pricePerUnit: 0.60, // $0.60 per 1M output tokens
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
    pricePerUnit: 10.00, // $10.00 per 1M input tokens
    effectiveFrom: new Date("2024-04-09"),
  },
  {
    provider: "OPENAI" as Provider,
    product: "gpt-4-turbo",
    unit: "TOKENS_OUT" as Unit,
    pricePerUnit: 30.00, // $30.00 per 1M output tokens
    effectiveFrom: new Date("2024-04-09"),
  },

  // GPT-3.5 Turbo models
  {
    provider: "OPENAI" as Provider,
    product: "gpt-3.5-turbo",
    unit: "TOKENS_IN" as Unit,
    pricePerUnit: 0.50, // $0.50 per 1M input tokens
    effectiveFrom: new Date("2023-06-13"),
  },
  {
    provider: "OPENAI" as Provider,
    product: "gpt-3.5-turbo",
    unit: "TOKENS_OUT" as Unit,
    pricePerUnit: 1.50, // $1.50 per 1M output tokens
    effectiveFrom: new Date("2023-06-13"),
  },

  // DALL-E 3 models
  {
    provider: "OPENAI" as Provider,
    product: "dall-e-3",
    unit: "IMAGE_HIGH" as Unit,
    pricePerUnit: 0.080, // $0.080 per image (1024×1024, HD)
    effectiveFrom: new Date("2023-10-01"),
  },
  {
    provider: "OPENAI" as Provider,
    product: "dall-e-3",
    unit: "IMAGE_MEDIUM" as Unit,
    pricePerUnit: 0.040, // $0.040 per image (1024×1024, standard)
    effectiveFrom: new Date("2023-10-01"),
  },

  // DALL-E 2 models
  {
    provider: "OPENAI" as Provider,
    product: "dall-e-2",
    unit: "IMAGE_HIGH" as Unit,
    pricePerUnit: 0.020, // $0.020 per image (1024×1024)
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
    pricePerUnit: 0.10, // $0.10 per 1M tokens
    effectiveFrom: new Date("2022-12-15"),
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
    pricePerUnit: 0.0050, // $0.0050 per message
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
    pricePerUnit: 0.0300, // $0.0300 per message (preço mais alto como fallback)
    effectiveFrom: new Date("2024-02-01"),
  },

  {
    provider: "META_WHATSAPP" as Provider,
    product: "WABA",
    unit: "UTILITY_TEMPLATE" as Unit,
    region: null, // Global fallback
    pricePerUnit: 0.0080, // $0.0080 per message
    effectiveFrom: new Date("2024-02-01"),
  },

  {
    provider: "META_WHATSAPP" as Provider,
    product: "WABA",
    unit: "AUTH_TEMPLATE" as Unit,
    region: null, // Global fallback
    pricePerUnit: 0.0060, // $0.0060 per message
    effectiveFrom: new Date("2024-02-01"),
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

    // Estatísticas finais
    const totalPrices = await prisma.priceCard.count();
    const openaiCount = await prisma.priceCard.count({
      where: { provider: "OPENAI" },
    });
    const whatsappCount = await prisma.priceCard.count({
      where: { provider: "META_WHATSAPP" },
    });

    console.log("✅ Seed de preços concluído com sucesso!");
    console.log(`📊 Total de preços inseridos: ${totalPrices}`);
    console.log(`🤖 OpenAI: ${openaiCount} preços`);
    console.log(`📱 WhatsApp: ${whatsappCount} preços`);

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
        } | $${price.pricePerUnit} | ${price.effectiveFrom.toISOString().split("T")[0]}`
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