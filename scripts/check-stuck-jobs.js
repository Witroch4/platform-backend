#!/usr/bin/env node

/**
 * Script para verificar jobs travados na fila de leads-chatwit
 */

const { Queue } = require("bullmq");
const { getRedisInstance } = require("../lib/connections");

async function checkStuckJobs() {
	console.log("🔍 Verificando jobs travados na fila leads-chatwit...\n");

	try {
		const redis = getRedisInstance();
		const leadsQueue = new Queue("filaLeadsChatwit", { connection: redis });

		// Obter status da fila
		const waiting = await leadsQueue.getWaiting();
		const active = await leadsQueue.getActive();
		const completed = await leadsQueue.getCompleted();
		const failed = await leadsQueue.getFailed();
		const delayed = await leadsQueue.getDelayed();

		console.log("📊 Status da Fila:");
		console.log(`   Aguardando: ${waiting.length}`);
		console.log(`   Ativos: ${active.length}`);
		console.log(`   Concluídos: ${completed.length}`);
		console.log(`   Falhados: ${failed.length}`);
		console.log(`   Atrasados: ${delayed.length}\n`);

		// Verificar jobs aguardando
		if (waiting.length > 0) {
			console.log("⏳ Jobs aguardando processamento:");
			waiting.forEach((job, index) => {
				console.log(`   ${index + 1}. Job ${job.id} - Lead: ${job.data.payload?.origemLead?.source_id}`);
			});
			console.log("");
		}

		// Verificar jobs ativos (podem estar travados)
		if (active.length > 0) {
			console.log("⚙️ Jobs ativos (processando):");
			for (const job of active) {
				const timeSinceStart = Date.now() - job.processedOn;
				console.log(`   Job ${job.id} - Lead: ${job.data.payload?.origemLead?.source_id}`);
				console.log(`   Tempo processando: ${Math.round(timeSinceStart / 1000)}s`);

				if (timeSinceStart > 60000) {
					// Mais de 1 minuto
					console.log(`   ⚠️ POSSÍVEL JOB TRAVADO (>${Math.round(timeSinceStart / 1000)}s)`);
				}
			}
			console.log("");
		}

		// Verificar jobs falhados
		if (failed.length > 0) {
			console.log("❌ Jobs falhados (últimos 3):");
			failed.slice(-3).forEach((job) => {
				console.log(`   Job ${job.id}: ${job.failedReason}`);
			});
			console.log("");
		}

		// Sugestões
		console.log("💡 Sugestões:");

		if (waiting.length > 5) {
			console.log("   - Muitos jobs aguardando: considere aumentar concorrência");
		}

		if (active.length > 0 && waiting.length > 0) {
			console.log("   - Jobs ativos + aguardando: worker pode estar sobrecarregado");
		}

		if (failed.length > completed.length * 0.1) {
			console.log("   - Taxa de falha alta: verifique logs de erro");
		}

		if (active.length === 0 && waiting.length > 0) {
			console.log("   - Jobs aguardando mas nenhum ativo: worker pode ter parado");
			console.log("   - Reinicie o worker: docker restart <worker_container>");
		}

		console.log("\n✅ Verificação concluída");
	} catch (error) {
		console.error("❌ Erro durante verificação:", error.message);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	checkStuckJobs();
}

module.exports = { checkStuckJobs };
