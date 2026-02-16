#!/usr/bin/env tsx

/**
 * Script para executar testes do sistema de custos
 * Executa testes unitários e de integração para o sistema de monitoramento de custos
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const COST_TEST_CONFIG = path.join(PROJECT_ROOT, "__tests__/cost/jest.config.cost.js");

async function main() {
	console.log("🧪 Executando testes do sistema de custos...\n");

	try {
		// Verificar se o arquivo de configuração existe
		if (!existsSync(COST_TEST_CONFIG)) {
			console.error("❌ Arquivo de configuração de testes não encontrado:", COST_TEST_CONFIG);
			process.exit(1);
		}

		// Verificar variáveis de ambiente necessárias
		const requiredEnvVars = ["DATABASE_URL", "REDIS_URL"];
		const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

		if (missingEnvVars.length > 0) {
			console.warn("⚠️ Variáveis de ambiente ausentes:", missingEnvVars.join(", "));
			console.warn("Usando valores padrão para testes...\n");
		}

		// Executar testes unitários
		console.log("📋 Executando testes unitários...");
		execSync(`npx jest --config=${COST_TEST_CONFIG} --testPathPattern="unit/cost" --verbose`, {
			stdio: "inherit",
			cwd: PROJECT_ROOT,
		});

		console.log("\n✅ Testes unitários concluídos com sucesso!\n");

		// Executar testes de integração
		console.log("🔗 Executando testes de integração...");
		execSync(`npx jest --config=${COST_TEST_CONFIG} --testPathPattern="integration/cost" --verbose --runInBand`, {
			stdio: "inherit",
			cwd: PROJECT_ROOT,
		});

		console.log("\n✅ Testes de integração concluídos com sucesso!\n");

		// Executar todos os testes com coverage
		console.log("📊 Gerando relatório de cobertura...");
		execSync(`npx jest --config=${COST_TEST_CONFIG} --coverage --coverageDirectory=coverage/cost`, {
			stdio: "inherit",
			cwd: PROJECT_ROOT,
		});

		console.log("\n🎉 Todos os testes do sistema de custos foram executados com sucesso!");
		console.log("📊 Relatório de cobertura disponível em: coverage/cost/");
	} catch (error) {
		console.error("\n❌ Erro ao executar testes:", error);
		process.exit(1);
	}
}

// Executar apenas se chamado diretamente
if (require.main === module) {
	main().catch(console.error);
}

export { main as runCostSystemTests };
