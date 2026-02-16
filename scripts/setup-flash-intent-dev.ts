#!/usr/bin/env tsx

/**
 * Script para configurar Flash Intent em desenvolvimento
 * Ativa as feature flags via variáveis de ambiente quando Redis não está disponível
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_FILE = ".env.development";

const FLASH_INTENT_FLAGS = {
	FEATURE_FLAG_FLASH_INTENT_GLOBAL: "true",
	FEATURE_FLAG_NEW_WEBHOOK_PROCESSING: "true",
	FEATURE_FLAG_HIGH_PRIORITY_QUEUE: "true",
	FEATURE_FLAG_LOW_PRIORITY_QUEUE: "true",
	FEATURE_FLAG_UNIFIED_LEAD_MODEL: "true",
	FEATURE_FLAG_INTELLIGENT_CACHING: "true",
	FEATURE_FLAG_APPLICATION_MONITORING: "true",
	FEATURE_FLAG_UNIFIED_PAYLOAD_EXTRACTION: "true",
};

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command) {
		console.log(`
Flash Intent Development Setup

Comandos disponíveis:
  enable    - Ativa Flash Intent via variáveis de ambiente
  disable   - Desativa Flash Intent via variáveis de ambiente
  status    - Mostra status das variáveis de ambiente
  clean     - Remove todas as variáveis de Flash Intent

Exemplos:
  npm run setup-flash-intent-dev -- enable
  npm run setup-flash-intent-dev -- status
    `);
		process.exit(0);
	}

	try {
		switch (command) {
			case "enable":
				await enableFlashIntent();
				break;
			case "disable":
				await disableFlashIntent();
				break;
			case "status":
				await showStatus();
				break;
			case "clean":
				await cleanFlags();
				break;
			default:
				console.error(`❌ Comando desconhecido: ${command}`);
				process.exit(1);
		}
	} catch (error) {
		console.error("❌ Erro:", error);
		process.exit(1);
	}
}

async function enableFlashIntent() {
	console.log("🚀 Ativando Flash Intent via variáveis de ambiente...\n");

	let envContent = "";

	// Ler arquivo .env existente se houver
	if (existsSync(ENV_FILE)) {
		envContent = readFileSync(ENV_FILE, "utf8");
	}

	// Remover flags existentes
	const lines = envContent.split("\n").filter((line) => {
		return !Object.keys(FLASH_INTENT_FLAGS).some((flag) => line.startsWith(`${flag}=`));
	});

	// Adicionar flags da Flash Intent
	lines.push("");
	lines.push("# Flash Intent Feature Flags (Development)");

	Object.entries(FLASH_INTENT_FLAGS).forEach(([flag, value]) => {
		lines.push(`${flag}=${value}`);
		console.log(`✅ ${flag}=${value}`);
	});

	// Escrever arquivo atualizado
	writeFileSync(ENV_FILE, lines.join("\n"));

	console.log(`\n🎉 Flash Intent ativada em ${ENV_FILE}!`);
	console.log("⚡ Reinicie o servidor para aplicar as mudanças");
	console.log('🔍 Use "npm run setup-flash-intent-dev -- status" para verificar');
}

async function disableFlashIntent() {
	console.log("🛑 Desativando Flash Intent via variáveis de ambiente...\n");

	let envContent = "";

	// Ler arquivo .env existente se houver
	if (existsSync(ENV_FILE)) {
		envContent = readFileSync(ENV_FILE, "utf8");
	}

	// Remover flags existentes e adicionar como false
	const lines = envContent.split("\n").filter((line) => {
		return !Object.keys(FLASH_INTENT_FLAGS).some((flag) => line.startsWith(`${flag}=`));
	});

	// Adicionar flags desabilitadas
	lines.push("");
	lines.push("# Flash Intent Feature Flags (Development) - DISABLED");

	Object.keys(FLASH_INTENT_FLAGS).forEach((flag) => {
		lines.push(`${flag}=false`);
		console.log(`❌ ${flag}=false`);
	});

	// Escrever arquivo atualizado
	writeFileSync(ENV_FILE, lines.join("\n"));

	console.log(`\n✅ Flash Intent desativada em ${ENV_FILE}!`);
	console.log("🐌 Sistema voltará ao modo padrão");
	console.log("🔄 Reinicie o servidor para aplicar as mudanças");
}

async function showStatus() {
	console.log("🔍 Status das Feature Flags de Desenvolvimento\n");

	// Verificar variáveis de ambiente atuais
	console.log("📊 Variáveis de Ambiente:");
	Object.keys(FLASH_INTENT_FLAGS).forEach((flag) => {
		const value = process.env[flag];
		const status = value === "true" ? "✅ ATIVA" : value === "false" ? "❌ INATIVA" : "⚪ NÃO DEFINIDA";
		console.log(`  • ${flag}: ${status}`);
	});

	// Verificar arquivo .env
	console.log("\n📄 Arquivo .env.development:");
	if (existsSync(ENV_FILE)) {
		const envContent = readFileSync(ENV_FILE, "utf8");
		const hasFlags = Object.keys(FLASH_INTENT_FLAGS).some((flag) => envContent.includes(`${flag}=`));

		if (hasFlags) {
			console.log("✅ Contém configurações de Flash Intent");

			Object.keys(FLASH_INTENT_FLAGS).forEach((flag) => {
				const match = envContent.match(new RegExp(`^${flag}=(.*)$`, "m"));
				if (match) {
					const value = match[1];
					const status = value === "true" ? "✅ ATIVA" : "❌ INATIVA";
					console.log(`  • ${flag}: ${status}`);
				}
			});
		} else {
			console.log("⚪ Não contém configurações de Flash Intent");
		}
	} else {
		console.log("❌ Arquivo não existe");
	}

	// Status resumido
	const activeFlags = Object.keys(FLASH_INTENT_FLAGS).filter((flag) => process.env[flag] === "true");

	console.log(`\n📈 Resumo: ${activeFlags.length}/${Object.keys(FLASH_INTENT_FLAGS).length} flags ativas`);

	if (activeFlags.length === Object.keys(FLASH_INTENT_FLAGS).length) {
		console.log("⚡ Flash Intent está TOTALMENTE ATIVA");
	} else if (activeFlags.length > 0) {
		console.log("🔶 Flash Intent está PARCIALMENTE ATIVA");
	} else {
		console.log("🐌 Flash Intent está INATIVA");
	}
}

async function cleanFlags() {
	console.log("🧹 Removendo todas as variáveis de Flash Intent...\n");

	if (!existsSync(ENV_FILE)) {
		console.log("⚪ Arquivo .env.development não existe");
		return;
	}

	const envContent = readFileSync(ENV_FILE, "utf8");

	// Remover todas as linhas relacionadas à Flash Intent
	const lines = envContent.split("\n").filter((line) => {
		// Remover flags
		const isFlag = Object.keys(FLASH_INTENT_FLAGS).some((flag) => line.startsWith(`${flag}=`));
		// Remover comentários relacionados
		const isComment = line.includes("Flash Intent Feature Flags");

		return !isFlag && !isComment;
	});

	// Remover linhas vazias extras
	const cleanedLines = [];
	let lastWasEmpty = false;

	for (const line of lines) {
		if (line.trim() === "") {
			if (!lastWasEmpty) {
				cleanedLines.push(line);
			}
			lastWasEmpty = true;
		} else {
			cleanedLines.push(line);
			lastWasEmpty = false;
		}
	}

	// Escrever arquivo limpo
	writeFileSync(ENV_FILE, cleanedLines.join("\n"));

	console.log("✅ Todas as variáveis de Flash Intent foram removidas");
	console.log("🔄 Reinicie o servidor para aplicar as mudanças");
}

// Executar script
main().catch(console.error);
