#!/usr/bin/env tsx

/**
 * Script para inicializar o sistema de taxas de câmbio
 * - Configura jobs recorrentes
 * - Busca taxa inicial se necessário
 * - Testa conectividade com APIs externas
 */

import { initializeFxRateSystem } from "@/lib/cost/fx-rate-worker";
import FxRateService from "@/lib/cost/fx-rate-service";
import log from "@/lib/log";

async function main() {
	console.log("🚀 Inicializando sistema de taxas de câmbio...");

	try {
		// Testar conectividade com API externa
		console.log("🌐 Testando conectividade com API de taxas...");
		const testRate = await FxRateService.fetchCurrentRate();
		console.log(`✅ API funcionando. Taxa atual USD/BRL: ${testRate}`);

		// Verificar se já existem taxas no banco
		const latestRate = await FxRateService.getLatestStoredRate();
		if (latestRate) {
			console.log(`📊 Última taxa armazenada: ${latestRate.rate} (${latestRate.date.toISOString().split("T")[0]})`);
		} else {
			console.log("📊 Nenhuma taxa encontrada no banco");
		}

		// Inicializar sistema completo
		console.log("⚙️ Configurando jobs recorrentes...");
		await initializeFxRateSystem();

		// Estatísticas finais
		const finalRate = await FxRateService.getLatestStoredRate();
		if (finalRate) {
			console.log(`📈 Taxa atual no sistema: ${finalRate.rate} (${finalRate.date.toISOString().split("T")[0]})`);
		}

		console.log("✅ Sistema de taxas de câmbio inicializado com sucesso!");
		console.log("\n📋 Próximos passos:");
		console.log("  - Taxa será atualizada diariamente às 9:00 AM UTC");
		console.log("  - Limpeza de taxas antigas aos domingos às 2:00 AM UTC");
		console.log("  - Use a API /api/admin/cost-monitoring/fx-rates para consultas");
	} catch (error) {
		console.error("❌ Erro ao inicializar sistema de taxas:", error);
		process.exit(1);
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	main()
		.then(() => {
			console.log("🎉 Inicialização concluída!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Falha na inicialização:", error);
			process.exit(1);
		});
}

export { main as initializeFxRateSystem };
