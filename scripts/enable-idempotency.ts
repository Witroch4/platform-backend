#!/usr/bin/env tsx

/**
 * Script para reabilitar a idempotência após testes
 */

import { getRedisInstance } from "@/lib/connections";

async function enableIdempotency() {
	try {
		console.log("🔄 Conectando ao Redis...");
		const redis = getRedisInstance();

		// Chave para controlar se a idempotência está desabilitada
		const disableKey = "test:disable_idempotency";

		// Verificar se está desabilitada
		const isDisabled = await redis.get(disableKey);

		if (isDisabled) {
			// Reabilitar idempotência
			await redis.del(disableKey);
			console.log("✅ Idempotência reabilitada com sucesso");
		} else {
			console.log("ℹ️  Idempotência já está habilitada");
		}

		// Verificar status
		const currentStatus = await redis.get(disableKey);
		console.log("\n📊 Status da Idempotência:");
		console.log(`🟢 Habilitada: ${!currentStatus ? "SIM" : "NÃO"}`);
	} catch (error) {
		console.error("❌ Erro ao reabilitar idempotência:", error);
		process.exit(1);
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	enableIdempotency()
		.then(() => {
			console.log("✅ Script concluído com sucesso");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Script falhou:", error);
			process.exit(1);
		});
}

export { enableIdempotency };
