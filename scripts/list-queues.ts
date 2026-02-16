import { getRedisInstance } from "../lib/connections";
import dotenv from "dotenv";

dotenv.config();

console.log("Iniciando script de listagem de filas...");

// Padrões de chaves para filas
const queuePatterns = ["bull:*", "bullmq:*", "*:bull:*", "*:bullmq:*"];

// Função para listar as filas
async function listQueues() {
	const redis = getRedisInstance();

	try {
		console.log("Listando filas no Redis...");

		for (const pattern of queuePatterns) {
			console.log(`\nBuscando chaves com padrão: ${pattern}`);
			const keys = await redis.keys(pattern);

			if (keys.length > 0) {
				console.log(`Encontradas ${keys.length} chaves para o padrão ${pattern}`);

				// Agrupa as chaves por prefixo para facilitar a visualização
				const prefixes: Record<string, string[]> = {};
				keys.forEach((key) => {
					const parts = key.split(":");
					const prefix = parts.slice(0, 2).join(":");
					if (!prefixes[prefix]) {
						prefixes[prefix] = [];
					}
					prefixes[prefix].push(key);
				});

				// Exibe as chaves agrupadas por prefixo
				console.log("Chaves agrupadas por prefixo:");
				for (const [prefix, prefixKeys] of Object.entries(prefixes)) {
					console.log(`\n  Prefixo: ${prefix} (${prefixKeys.length} chaves)`);
					// Exibe até 5 exemplos de cada prefixo
					prefixKeys.slice(0, 5).forEach((key: string) => console.log(`    - ${key}`));
					if (prefixKeys.length > 5) {
						console.log(`    ... e mais ${prefixKeys.length - 5} chaves`);
					}
				}
			} else {
				console.log(`Nenhuma chave encontrada para o padrão ${pattern}`);
			}
		}

		console.log("\nListagem de filas concluída!");
	} catch (error) {
		console.error("Erro ao listar filas:", error);
	} finally {
		// Fecha a conexão com o Redis
		await redis.quit();
	}
}

// Executa a listagem
listQueues();
