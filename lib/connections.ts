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
	// 🔒 lock global para evitar múltiplos $connect() concorrentes
	// (usado pelo getPrismaInstance/withPrismaReconnect)
	// eslint-disable-next-line no-var
	var __prismaConnectLock: Promise<void> | null | undefined;
}

// Flag para controlar se já foi inicializado
let prismaInitialized = false;
let heartbeatInterval: NodeJS.Timeout | null = null;

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

		// 🔒 Conectar apenas uma vez usando lock; inicia heartbeat SÓ após conectar
		if (!globalThis.__prismaConnectLock) {
			globalThis.__prismaConnectLock = (async () => {
				try {
					await globalThis.prisma!.$connect();
					startPrismaHeartbeat(); // 💓 agora só inicia depois do connect bem-sucedido
				} catch (error: any) {
					console.error("❌ Erro ao conectar Prisma:", error);
					// tenta uma reconexão simples em produção
					if (nodeEnv === "production") {
						try {
							await new Promise((r) => setTimeout(r, 5000));
							await globalThis.prisma!.$connect();
							startPrismaHeartbeat();
							console.log("✅ Prisma reconectado após falha inicial");
						} catch (e) {
							console.error("❌ Falha na reconexão inicial do Prisma:", (e as any)?.message);
						}
					}
				} finally {
					globalThis.__prismaConnectLock = null;
				}
			})();
		}

		// Log apenas na primeira inicialização real
		if (!prismaInitialized) {
			console.log(`🔗 Prisma Client inicializado (${nodeEnv})`);
			prismaInitialized = true;
			// 🛑 (REMOVIDO) NÃO iniciar heartbeat aqui para não bater antes de conectar
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
 * Wrapper para todas as queries do Prisma com reconexão automática
 * Intercepta erros de conexão e reconecta automaticamente
 */
export function withPrismaReconnect<T>(queryFn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
	return new Promise(async (resolve, reject) => {
		const maxRetries = 3;
		let attempts = 0;

		// 🔒 Aguarda conexão em andamento (se houver) antes de executar a primeira query
		if (globalThis.__prismaConnectLock) {
			try {
				await globalThis.__prismaConnectLock;
			} catch {}
		}

		const executeQuery = async (): Promise<T> => {
			attempts++;
			const prisma = getPrismaInstance();

			try {
				const result = await queryFn(prisma);
				return result;
			} catch (error: any) {
				const isConnectionError =
					error.message?.includes("Engine is not yet connected") ||
					error.message?.includes("Response from the Engine was empty") ||
					error.message?.includes("Connection pool timeout") ||
					error.code === "P1001" || // Connection error
					error.code === "P1002" || // Connection timeout
					error.code === "P1008" || // Operations timeout
					error.code === "P1017"; // Server has closed connection

				if (isConnectionError && attempts < maxRetries) {
					console.warn(`⚠️ Prisma connection error (attempt ${attempts}/${maxRetries}):`, error.message);

					try {
						// Força desconexão e reconexão
						await prisma.$disconnect().catch(() => {});

						// Recria instância se necessário
						if (attempts >= 2) {
							globalThis.prisma = undefined;
							prismaInitialized = false;
						}

						// 🔒 Recria e garante connect via lock compartilhado
						const newPrisma = getPrismaInstance();
						if (!globalThis.__prismaConnectLock) {
							globalThis.__prismaConnectLock = newPrisma.$connect().finally(() => {
								globalThis.__prismaConnectLock = null;
							});
						}
						try {
							await globalThis.__prismaConnectLock;
						} catch {}
						// Heartbeat será (ou já foi) iniciado após o connect em getPrismaInstance()

						console.log(`✅ Prisma reconectado (tentativa ${attempts})`);

						// Tenta novamente
						return await executeQuery();
					} catch (reconnectError: any) {
						console.error(`❌ Falha na reconexão (tentativa ${attempts}):`, reconnectError.message);

						if (attempts >= maxRetries) {
							throw reconnectError;
						} else {
							// Aguarda um pouco antes da próxima tentativa
							await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
							return await executeQuery();
						}
					}
				} else {
					// Não é erro de conexão ou esgotaram tentativas
					throw error;
				}
			}
		};

		try {
			const result = await executeQuery();
			resolve(result);
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Inicia heartbeat para manter conexão Prisma viva
 * Evita conexões fantasma com timeout do PostgreSQL
 */
function startPrismaHeartbeat() {
	// ✅ Evita múltiplos heartbeats simultâneos
	if (heartbeatInterval) return;

	// Heartbeat a cada 5 minutos (300 segundos)
	// PostgreSQL default idle_in_transaction_session_timeout = 0 (desabilitado)
	// Mas idle timeout pode ser configurado pelo DBA
	heartbeatInterval = setInterval(
		async () => {
			try {
				const prisma = globalThis.prisma;
				if (prisma) {
					await prisma.$queryRaw`SELECT 1`;
					if (process.env.MONITOR_LOG === "true") {
						console.log("💓 Prisma heartbeat - conexão mantida viva");
					}
				}
			} catch (error: any) {
				console.warn("⚠️ Prisma heartbeat falhou - conexão pode estar morta:", error.message);

				// Se heartbeat falhar, marca para recriar na próxima vez
				if (
					error.message?.includes("Engine is not yet connected") ||
					error.message?.includes("Response from the Engine was empty")
				) {
					console.log("🔄 Marcando Prisma para recriação...");
					globalThis.prisma = undefined;
					prismaInitialized = false;
				}
			}
		},
		5 * 60 * 1000,
	); // 5 minutos

	console.log("💓 Prisma heartbeat iniciado (5 min)");
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
				console.log("🔗 Using Test Redis na porta 6380 (configuração de teste removida)");
				// Configuração de teste removida: test-redis-config não existe mais
				// Se necessário, adicione configuração inline ou ajuste conforme o novo padrão de testes
				const RedisClass = getRedisClass();
				globalThis.redis = new RedisClass();
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

	// Limpa heartbeat
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
		console.log("💓 Prisma heartbeat parado");
	}

	if (globalThis.prisma) {
		promises.push(
			globalThis.prisma.$disconnect().then(() => {
				globalThis.prisma = undefined;
				prismaInitialized = false;
				console.log("🔌 Prisma desconectado");
			}),
		);
	}

	if (globalThis.redis) {
		promises.push(
			new Promise<void>((resolve) => {
				globalThis.redis!.disconnect();
				globalThis.redis = undefined;
				console.log("🔌 Redis desconectado");
				resolve();
			}),
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
