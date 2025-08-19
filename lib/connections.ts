/**
 * Sistema de conexões singleton para evitar cold starts
 * Mantém conexões reutilizáveis em memória com suporte a HMR
 */

import { PrismaClient } from "@prisma/client";
// Lazy import do Redis para evitar problemas no Edge Runtime
let Redis: any = null;
const getRedisClass = () => {
  if (!Redis) {
    try {
      Redis = require("ioredis").Redis;
    } catch (error) {
      console.error("[Redis] Erro ao importar ioredis:", error);
      throw error;
    }
  }
  return Redis;
};
import { getRedisConfig, getRedisConnectionOptions } from "./redis-config";

// Tipos de ambiente suportados
type Environment = "development" | "staging" | "production" | "test";

// Helper para obter ambiente com tipagem correta
function getEnvironment(): Environment {
  return (process.env.NODE_ENV as Environment) || "development";
}

// Declarações globais para persistir durante HMR
declare global {
  var prisma: PrismaClient | undefined;
  var redis: any | undefined;
}

// Flag para controlar se já foi inicializado
let prismaInitialized = false;

/**
 * Obtém instância singleton do Prisma
 * Persiste durante HMR usando globalThis
 */
export function getPrismaInstance(): PrismaClient {
  if (!globalThis.prisma) {
    // Configurações de log baseadas no ambiente
    const nodeEnv = getEnvironment();
    const logConfig =
      nodeEnv === "development"
        ? ["error", "warn"] // Removido "query" para reduzir logs
        : nodeEnv === "staging"
          ? ["error", "warn"] // Mais logs em staging para debug
          : ["error"]; // Apenas erros em produção

    globalThis.prisma = new PrismaClient({
      log: logConfig as any,

      // Configurações otimizadas para Docker/Container
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Conectar automaticamente e detectar erros cedo
    globalThis.prisma.$connect().catch((error: any) => {
      console.error("❌ Erro ao conectar Prisma:", error);

      // Em produção, tentar reconectar após delay
      if (nodeEnv === "production") {
        setTimeout(() => {
          console.log("🔄 Tentando reconectar Prisma...");
          globalThis.prisma?.$connect().catch(console.error);
        }, 5000);
      }
    });

    // Log apenas na primeira inicialização real
    if (!prismaInitialized) {
      console.log(`🔗 Prisma Client inicializado (${nodeEnv})`);
      prismaInitialized = true;
    }

    // Log de configuração apenas em staging/desenvolvimento
    /*    if (nodeEnv !== "production") {
      console.log("📊 Configuração do banco:", {
        url: process.env.DATABASE_URL?.replace(/:\/\/.*@/, "://***@"), // Mascarar credenciais
        logLevel: logConfig.join(", "),
      });
    } */
  }

  return globalThis.prisma;
}

/**
 * Obtém instância singleton do Redis
 * Persiste durante HMR usando globalThis
 */
export function getRedisInstance(): any {
  if (!globalThis.redis) {
    const nodeEnv = getEnvironment();

    // Em desenvolvimento/teste, verificar configuração
    if (nodeEnv === "development" || nodeEnv === "test") {
      const useMock = process.env.USE_REDIS_MOCK === "true";
      const useTestRedis = process.env.USE_TEST_REDIS === "true";

      if (useMock) {
        console.log("🔗 Using Redis Mock for development/testing");
        const MockRedis = require("../__mocks__/ioredis").default;
        globalThis.redis = new MockRedis() as any;
        return globalThis.redis!;
      }

      if (useTestRedis) {
        console.log("🔗 Using Test Redis on port 6380");
        const {
          testRedisConfig,
        } = require("../__tests__/setup/test-redis-config");
        const RedisClass = getRedisClass();
        globalThis.redis = new RedisClass(testRedisConfig);
        return globalThis.redis;
      }
    }

    // Usar configurações base e adicionar otimizações para containers
    const baseOptions = getRedisConnectionOptions();

    const RedisClass = getRedisClass();
    globalThis.redis = new RedisClass({
      ...baseOptions,
      // Configurações ajustadas para funcionar com feature flags
      enableOfflineQueue: true, // Permitir queue offline para feature flags
      enableReadyCheck: true, // Verificar se está pronto antes de usar
      lazyConnect: true, // Conectar apenas quando necessário

      // Configurações de reconexão mais agressivas para containers
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },

      // Timeout mais generoso para conexão inicial e comandos
      connectTimeout: 20000, // 20s para conectar
      commandTimeout: 60000, // 60s para comandos (era 5s)

      // Configurações adicionais para estabilidade
      maxRetriesPerRequest: null, // BullMQ exige que seja null
      retryDelayOnFailover: 200,
      enableAutoPipelining: false, // Desabilitar para evitar problemas
    });

    // Event listeners apenas uma vez
    globalThis.redis.on("connect", () => {
      console.log("✅ Redis conectado");
    });

    globalThis.redis.on("error", (error: Error) => {
      console.error("❌ Erro Redis:", error.message);

      // Em produção, log adicional para debugging
      if (nodeEnv === "production") {
        console.error("🔍 Redis Error Details:", {
          code: (error as any).code,
          errno: (error as any).errno,
          syscall: (error as any).syscall,
        });
      }
    });

    globalThis.redis.on("close", () => {
      console.log("🔌 Redis desconectado");
    });

    globalThis.redis.on("reconnecting", (delay: number) => {
      console.log(`🔄 Redis reconectando em ${delay}ms...`);
    });

    console.log(`🔗 Redis Client inicializado (${nodeEnv})`);

    // Log de configuração apenas em staging/desenvolvimento
    if (nodeEnv !== "production") {
      console.log("📊 Configuração Redis:", {
        host: baseOptions.host,
        port: baseOptions.port,
        maxRetries: baseOptions.maxRetriesPerRequest,
        connectTimeout: `${baseOptions.connectTimeout}ms`,
        lazyConnect: baseOptions.lazyConnect,
      });
    }
  }

  return globalThis.redis;
}

/**
 * Função para limpar conexões (usado em shutdown)
 */
export async function closeConnections(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (globalThis.prisma) {
    promises.push(
      globalThis.prisma.$disconnect().then(() => {
        globalThis.prisma = undefined;
        console.log("🔌 Prisma desconectado");
      })
    );
  }

  if (globalThis.redis) {
    promises.push(
      new Promise<void>((resolve) => {
        globalThis.redis!.disconnect();
        globalThis.redis = undefined;
        console.log("🔌 Redis desconectado");
        resolve();
      })
    );
  }

  await Promise.all(promises);
  console.log("✅ Todas as conexões fechadas");
}

/**
 * Configurar handlers de shutdown para servidores sempre-on
 */
if (getEnvironment() === "production") {
  process.on("SIGINT", async () => {
    console.log("🛑 SIGINT recebido, fechando conexões...");
    await closeConnections();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("🛑 SIGTERM recebido, fechando conexões...");
    await closeConnections();
    process.exit(0);
  });

  process.on("beforeExit", async () => {
    console.log("🛑 Processo encerrando, fechando conexões...");
    await closeConnections();
  });
}
