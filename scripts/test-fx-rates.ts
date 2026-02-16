#!/usr/bin/env tsx

/**
 * Script para testar o sistema de taxas de câmbio
 */

import FxRateService from "@/lib/cost/fx-rate-service";
import log from "@/lib/log";

async function testFxRates() {
	console.log("🧪 Testando sistema de taxas de câmbio...");

	try {
		// Teste 1: Obter taxa atual
		console.log("\n1️⃣ Testando obtenção de taxa atual...");
		const currentRate = await FxRateService.getRateForDate(new Date());
		console.log(`Taxa atual: ${currentRate} BRL/USD`);

		// Teste 2: Conversão USD para BRL
		console.log("\n2️⃣ Testando conversão USD → BRL...");
		const conversion = await FxRateService.convertUsdToBrl(100);
		console.log(`$100 USD = R$ ${conversion.brlAmount} BRL (taxa: ${conversion.rate})`);

		// Teste 3: Obter última taxa armazenada
		console.log("\n3️⃣ Testando última taxa armazenada...");
		const latestRate = await FxRateService.getLatestStoredRate();
		if (latestRate) {
			console.log(`Última taxa: ${latestRate.rate} em ${latestRate.date.toISOString().split("T")[0]}`);
		} else {
			console.log("Nenhuma taxa armazenada encontrada");
		}

		// Teste 4: Histórico de taxas (últimos 7 dias)
		console.log("\n4️⃣ Testando histórico de taxas...");
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - 7);

		const history = await FxRateService.getRateHistory(startDate, endDate);
		console.log(`Histórico encontrado: ${history.length} registros`);

		if (history.length > 0) {
			console.log("Últimas taxas:");
			history.slice(-3).forEach((rate) => {
				console.log(`  ${rate.date.toISOString().split("T")[0]}: ${rate.rate}`);
			});
		}

		console.log("\n✅ Todos os testes passaram!");
	} catch (error) {
		console.error("❌ Erro nos testes:", error);
		throw error;
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	testFxRates()
		.then(() => {
			console.log("🎉 Testes concluídos!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Falha nos testes:", error);
			process.exit(1);
		});
}

export { testFxRates };
