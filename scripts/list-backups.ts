#!/usr/bin/env tsx

import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

function listBackups() {
	console.log("📋 Listando backups disponíveis...\n");

	const backupsDir = join(process.cwd(), "backups");

	if (!existsSync(backupsDir)) {
		console.error(`❌ Diretório de backups não encontrado: ${backupsDir}`);
		return;
	}

	// Buscar arquivos .sql.gz no padrão faceApp_backup_*
	const backupFiles = readdirSync(backupsDir)
		.filter((file) => file.startsWith("faceApp_backup_") && file.endsWith(".sql.gz"))
		.map((file) => {
			const filePath = join(backupsDir, file);
			const stats = statSync(filePath);
			return {
				name: file,
				size: Math.round((stats.size / (1024 * 1024)) * 100) / 100, // MB
				date: stats.mtime,
				path: filePath,
			};
		})
		.sort((a, b) => b.date.getTime() - a.date.getTime()); // Ordenar por data (mais recente primeiro)

	if (backupFiles.length === 0) {
		console.error(`❌ Nenhum arquivo de backup (.sql.gz) encontrado no diretório: ${backupsDir}`);
		console.log("💡 Certifique-se de que os arquivos seguem o padrão: faceApp_backup_YYYY-MM-DD_HH_MM_SS_XMB.sql.gz");
		return;
	}

	console.log(`📊 Backups encontrados (${backupFiles.length} arquivos):\n`);

	backupFiles.forEach((file, index) => {
		const isLatest = index === 0 ? " (MAIS RECENTE)" : "";
		console.log(`[${index + 1}] ${file.name}${isLatest}`);
		console.log(`    📅 Data: ${file.date.toLocaleString("pt-BR")}`);
		console.log(`    📏 Tamanho: ${file.size} MB\n`);
	});

	console.log("💡 Para restaurar um backup específico, use:");
	console.log(`   npx tsx scripts/restore-sql-backup.ts "${backupFiles[0].name}"`);
	console.log("");
	console.log("💡 Para restaurar o backup mais recente automaticamente:");
	console.log("   npx tsx scripts/restore-sql-backup.ts");
}

// Executar se chamado diretamente
if (require.main === module) {
	listBackups();
}

export { listBackups };
