#!/usr/bin/env node

/**
 * Script para limpar jobs travados e reprocessar
 */

const { Queue } = require("bullmq");
const { getRedisInstance } = require("../lib/connections");

async function cleanStuckJobs() {
	console.log("🧹 Limpando jobs travados na fila leads-chatwit...\n");

	try {
		const redis = getRedisInstance();
		const leadsQueue = new Queue("filaLeadsChatwit", { connection: redis });

		// 1. Verificar jobs ativos há muito tempo
		const active = await leadsQueue.getActive();
		let cleanedJobs = 0;

		if (active.length > 0) {
			console.log(`🔍 Verificando ${active.length} jobs ativos...`);

			for (const job of active) {
				const timeSinceStart = Date.now() - (job.processedOn || job.timestamp);

				if (timeSinceStart > 120000) {
					// Mais de 2 minutos
					console.log(`⚠️ Job ${job.id} travado há ${Math.round(timeSinceStart / 1000)}s`);

					try {
						// Mover job de volta para a fila
						await job.moveToWaiting();
						console.log(`✅ Job ${job.id} movido de volta para fila`);
						cleanedJobs++;
					} catch (error) {
						console.log(`❌ Erro ao mover job ${job.id}: ${error.message}`);
					}
				}
			}
		}

		// 2. Limpar jobs falhados antigos (opcional)
		const failed = await leadsQueue.getFailed();
		if (failed.length > 50) {
			console.log(`🗑️ Limpando ${failed.length - 50} jobs falhados antigos...`);
			await leadsQueue.clean(24 * 60 * 60 * 1000, 50, "failed"); // Manter apenas 50 jobs falhados
		}

		// 3. Limpar jobs concluídos antigos (opcional)
		const completed = await leadsQueue.getCompleted();
		if (completed.length > 100) {
			console.log(`🗑️ Limpando ${completed.length - 100} jobs concluídos antigos...`);
			await leadsQueue.clean(24 * 60 * 60 * 1000, 100, "completed"); // Manter apenas 100 jobs concluídos
		}

		console.log(`\n✅ Limpeza concluída: ${cleanedJobs} jobs reprocessados`);

		// Status final
		const waiting = await leadsQueue.getWaiting();
		const activeAfter = await leadsQueue.getActive();

		console.log("\n📊 Status após limpeza:");
		console.log(`   Aguardando: ${waiting.length}`);
		console.log(`   Ativos: ${activeAfter.length}`);
	} catch (error) {
		console.error("❌ Erro durante limpeza:", error.message);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	cleanStuckJobs();
}

module.exports = { cleanStuckJobs };
