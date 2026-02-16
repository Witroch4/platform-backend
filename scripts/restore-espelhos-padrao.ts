#!/usr/bin/env tsx

import { getPrismaInstance } from "@/lib/connections";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = getPrismaInstance();

async function restoreEspelhosPadrao() {
	console.log("🔄 Iniciando restauração dos espelhos padrão...");

	try {
		// Carregar backup
		const backupPath = join(process.cwd(), "backups", "backup_simple_2025-07-12_18-25-34.json");
		const backupData = JSON.parse(readFileSync(backupPath, "utf8"));

		console.log("📂 Backup carregado:", backupPath);

		// Buscar Amanda no banco atual
		const amanda = await prisma.usuarioChatwit.findFirst({
			where: {
				appUser: {
					email: "amandasousa22.adv@gmail.com",
				},
			},
		});

		if (!amanda) {
			throw new Error("❌ Amanda não encontrada no banco de dados");
		}

		console.log(`✅ Amanda encontrada: ${amanda.name} (ID: ${amanda.id})`);

		// Buscar espelhos padrão no backup
		const espelhosBackup = backupData.data.espelhosPadrao || [];

		console.log(`📊 Encontrados ${espelhosBackup.length} espelhos padrão no backup`);

		if (espelhosBackup.length === 0) {
			console.log("⚠️ Nenhum espelho padrão encontrado para restaurar");
			return;
		}

		// Restaurar espelhos padrão
		let espelhosRestaurados = 0;
		let erros = 0;

		for (const espelhoBackup of espelhosBackup) {
			try {
				// Verificar se o espelho já existe
				const espelhoExistente = await prisma.espelhoPadrao.findFirst({
					where: {
						especialidade: espelhoBackup.especialidade,
						nome: espelhoBackup.nome,
					},
				});

				if (espelhoExistente) {
					console.log(`⚠️ Espelho ${espelhoBackup.nome} já existe, pulando...`);
					continue;
				}

				// Criar espelho padrão
				await prisma.espelhoPadrao.create({
					data: {
						especialidade: espelhoBackup.especialidade,
						nome: espelhoBackup.nome,
						descricao: espelhoBackup.descricao,
						textoMarkdown: espelhoBackup.textoMarkdown,
						espelhoCorrecao: espelhoBackup.espelhoCorrecao,
						isAtivo: espelhoBackup.isAtivo,
						totalUsos: espelhoBackup.totalUsos,
						processado: espelhoBackup.processado,
						aguardandoProcessamento: espelhoBackup.aguardandoProcessamento,
						atualizadoPorId: amanda.id, // Usar Amanda como atualizado por
					},
				});

				espelhosRestaurados++;
				console.log(`✅ Espelho restaurado: ${espelhoBackup.nome} (${espelhoBackup.especialidade})`);
			} catch (espelhoError) {
				console.error(`❌ Erro ao restaurar espelho ${espelhoBackup.nome}:`, espelhoError);
				erros++;
			}
		}

		console.log("\n📊 Resumo da restauração:");
		console.log(`✅ Espelhos padrão restaurados: ${espelhosRestaurados}`);
		console.log(`❌ Erros: ${erros}`);
		console.log(`🎉 Restauração concluída!`);
	} catch (error) {
		console.error("❌ Erro durante a restauração:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	restoreEspelhosPadrao().catch(console.error);
}

export { restoreEspelhosPadrao };
