/**
 * Sistema de conexões para Edge Runtime (middleware)
 * Apenas Prisma, sem Redis - compatível com Edge Runtime
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
  var prismaEdge: PrismaClient | undefined;
}

/**
 * Obtém instância singleton do Prisma para Edge Runtime
 * Otimizada para middleware - sem logs verbosos
 */
export function getPrismaInstanceEdge(): PrismaClient {
  if (!globalThis.prismaEdge) {
    const nodeEnv = getEnvironment();
    
    // Configurações mínimas para Edge Runtime
    globalThis.prismaEdge = new PrismaClient({
      log: nodeEnv === "production" ? [] : ["error"], // Logs mínimos
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Conectar silenciosamente
    globalThis.prismaEdge.$connect().catch((error: any) => {
      // Log mínimo em caso de erro
      console.error("❌ Erro Prisma Edge:", error.message);
    });
  }

  return globalThis.prismaEdge;
}

/**
 * Função para limpar conexões Edge (usado em shutdown)
 */
export async function closeEdgeConnections(): Promise<void> {
  if (globalThis.prismaEdge) {
    await globalThis.prismaEdge.$disconnect();
    globalThis.prismaEdge = undefined;
  }
}