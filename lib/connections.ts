/**
 * Sistema de conexões singleton para evitar cold starts
 * Mantém conexões reutilizáveis em memória com suporte a HMR
 */

import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
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
  var redis: Redis | undefined;
}

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
        ? ["query", "error", "warn"]
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
    globalThis.prisma.$connect().catch((error) => {
      console.error("❌ Erro ao conectar Prisma:", error);

      // Em produção, tentar reconectar após delay
      if (nodeEnv === "production") {
        setTimeout(() => {
          console.log("🔄 Tentando reconectar Prisma...");
          globalThis.prisma?.$connect().catch(console.error);
        }, 5000);
      }
    });

    console.log(`🔗 Prisma Client inicializado (${nodeEnv})`);

    // Log de configuração apenas em staging/desenvolvimento
    if (nodeEnv !== "production") {
      console.log("📊 Configuração do banco:", {
        url: process.env.DATABASE_URL?.replace(/:\/\/.*@/, "://***@"), // Mascarar credenciais
        logLevel: logConfig.join(", "),
      });
    }
  }

  return globalThis.prisma;
}

/**
 * Obtém instância singleton do Redis
 * Persiste durante HMR usando globalThis
 */
export function getRedisInstance(): Redis {
  if (!globalThis.redis) {
    const nodeEnv = getEnvironment();

    // Usar configurações base e adicionar otimizações para containers
    const baseOptions = getRedisConnectionOptions();

    globalThis.redis = new Redis({
      ...baseOptions,
      // Configurações adicionais otimizadas para Docker/Container
      enableOfflineQueue: false,
      enableReadyCheck: false,

      // Configurações de reconexão mais agressivas para containers
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
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
