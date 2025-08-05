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

/**
 * Cria um mock do Redis para uso no Edge Runtime
 */
function createRedisMock(): any {
  const mockMethods = {
    // Métodos básicos
    get: async () => null,
    set: async () => "OK",
    setex: async () => "OK",
    del: async () => 1,
    exists: async () => 0,
    expire: async () => 1,
    ttl: async () => -1,

    // Métodos de hash
    hget: async () => null,
    hset: async () => 1,
    hmget: async () => [],
    hmset: async () => "OK",
    hdel: async () => 1,

    // Métodos de lista
    lpush: async () => 1,
    rpush: async () => 1,
    lpop: async () => null,
    rpop: async () => null,
    llen: async () => 0,

    // Métodos de conjunto
    sadd: async () => 1,
    srem: async () => 1,
    smembers: async () => [],
    sismember: async () => 0,

    // Pub/Sub
    publish: async () => 0,
    subscribe: async () => {},
    unsubscribe: async () => {},

    // Conexão
    ping: async () => "PONG",
    info: async () => "",
    connect: async () => {},
    disconnect: async () => {},
    duplicate: () => createRedisMock(),

    // Event emitter
    on: () => mockMethods,
    off: () => mockMethods,
    emit: () => false,

    // Pipeline
    pipeline: () => ({
      exec: async () => [],
      get: () => mockMethods,
      set: () => mockMethods,
      setex: () => mockMethods,
      del: () => mockMethods,
    }),

    // Outros métodos comuns
    keys: async () => [],
    mget: async () => [],
    mset: async () => "OK",
    flushdb: async () => "OK",
    flushall: async () => "OK",
  };

  return mockMethods;
}

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

    console.log(`🔗 Prisma Client inicializado (${nodeEnv})`);

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
 * Retorna mock no Edge Runtime para evitar erros
 */
export function getRedisInstance(): any {
  // Verificação imediata para prevenir importação do ioredis no Edge Runtime
  try {
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      console.warn(
        "[Redis] Edge Runtime detectado imediatamente, retornando mock"
      );
      return createRedisMock();
    }
  } catch (e) {
    // Ignorar erro e continuar com verificações mais detalhadas
  }
  // Verificar se estamos no Edge Runtime (middleware)
  const isEdgeRuntime = (() => {
    try {
      // Verificações mais agressivas para detectar Edge Runtime
      const checks = [
        typeof (globalThis as any).EdgeRuntime !== "undefined",
        typeof globalThis !== "undefined" && "EdgeRuntime" in globalThis,
        typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge",
        // Verificar se estamos no contexto do middleware
        typeof process !== "undefined" &&
          process.env.NODE_ENV &&
          typeof window === "undefined" &&
          typeof document === "undefined" &&
          !process.versions?.node,
        // Verificar se o stack trace contém middleware
        new Error().stack?.includes("middleware"),
        // Verificar se estamos em um contexto sem Node.js APIs completas
        typeof require === "undefined" || typeof Buffer === "undefined",
        // Verificar se estamos em um contexto que não tem fs
        (() => {
          try {
            require("fs");
            return false;
          } catch {
            return true;
          }
        })(),
      ];

      return checks.some((check) => check === true);
    } catch (e) {
      // Se houver erro ao verificar, assumir que é Edge Runtime
      return true;
    }
  })();

  if (isEdgeRuntime) {
    console.warn("[Redis] Edge Runtime detectado, retornando mock Redis");
    // Retornar um mock Redis que não faz nada
    return createRedisMock();
  }

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
      // Configurações adicionais otimizadas para Docker/Container
      enableOfflineQueue: false,
      enableReadyCheck: false,

      // Configurações de reconexão mais agressivas para containers
      retryStrategy: (times: number) => {
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
