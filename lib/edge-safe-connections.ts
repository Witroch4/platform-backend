/**
 * Conexões seguras para Edge Runtime
 * Este arquivo não deve importar Redis ou outras dependências que não funcionam no Edge Runtime
 */

import { PrismaClient } from "@prisma/client";

// Tipos de ambiente suportados
type Environment = "development" | "staging" | "production" | "test";

// Helper para obter ambiente com tipagem correta
function getEnvironment(): Environment {
	return (process.env.NODE_ENV as Environment) || "development";
}

// Declarações globais para persistir durante HMR
declare global {
	var prismaEdgeSafe: PrismaClient | undefined;
}

/**
 * Obtém instância singleton do Prisma para Edge Runtime
 * Não inclui Redis para evitar problemas no middleware
 */
export function getPrismaInstanceEdgeSafe(): PrismaClient {
	if (!globalThis.prismaEdgeSafe) {
		const nodeEnv = getEnvironment();

		// Configurações mínimas para Edge Runtime
		const logConfig = nodeEnv === "production" ? ["error"] : ["error", "warn"];

		globalThis.prismaEdgeSafe = new PrismaClient({
			log: logConfig as any,
			datasources: {
				db: {
					url: process.env.DATABASE_URL,
				},
			},
		});

		console.log(`🔗 Prisma Client (Edge Safe) inicializado (${nodeEnv})`);
	}

	return globalThis.prismaEdgeSafe;
}

/**
 * Função para limpar conexões Edge Safe
 */
export async function closeEdgeSafeConnections(): Promise<void> {
	if (globalThis.prismaEdgeSafe) {
		await globalThis.prismaEdgeSafe.$disconnect();
		globalThis.prismaEdgeSafe = undefined;
		console.log("🔌 Prisma (Edge Safe) desconectado");
	}
}
