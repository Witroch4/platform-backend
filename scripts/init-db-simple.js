#!/usr/bin/env node

/**
 * Script de inicialização do banco de dados (versão simples)
 * Apenas executa migrações se DATABASE_URL estiver definida
 */

const { execSync } = require("child_process");

async function initDatabase() {
	console.log("🔍 Verificando configuração do banco de dados...");

	// Debug das variáveis de ambiente
	console.log("🔧 NODE_ENV:", process.env.NODE_ENV);
	console.log("🔧 DATABASE_URL definida:", !!process.env.DATABASE_URL);

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("❌ DATABASE_URL não está definida");
		console.log("🔧 Variáveis de ambiente disponíveis:");
		Object.keys(process.env)
			.filter((key) => key.includes("DATABASE"))
			.forEach((key) => {
				console.log(`   ${key}: ${process.env[key]}`);
			});
		throw new Error("DATABASE_URL não está definida");
	}

	console.log("✅ DATABASE_URL encontrada");

	try {
		// Executar migrações
		console.log("🔄 Executando migrações do Prisma...");
		try {
			execSync("npx prisma migrate deploy", {
				stdio: "inherit",
				env: { ...process.env, DATABASE_URL: databaseUrl },
			});
			console.log("✅ Migrações executadas com sucesso!");
		} catch (migrationError) {
			console.error("⚠️  Erro durante migrações:", migrationError.message);
			console.log("🔄 Tentando push do schema...");
			try {
				execSync("npx prisma db push", {
					stdio: "inherit",
					env: { ...process.env, DATABASE_URL: databaseUrl },
				});
				console.log("✅ Schema push executado com sucesso!");
			} catch (pushError) {
				console.error("❌ Erro durante push do schema:", pushError.message);
				throw pushError;
			}
		}

		// Gerar cliente Prisma
		console.log("🔧 Gerando cliente Prisma...");
		execSync("npx prisma generate", {
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: databaseUrl },
		});
		console.log("✅ Cliente Prisma gerado!");

		console.log("🎉 Configuração do banco de dados concluída!");
	} catch (error) {
		console.error("❌ Erro durante a inicialização do banco:", error.message);
		console.error("Stack trace:", error.stack);
		throw error;
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	initDatabase().catch((error) => {
		console.error("Erro fatal:", error);
		process.exit(1);
	});
}

module.exports = { initDatabase };
