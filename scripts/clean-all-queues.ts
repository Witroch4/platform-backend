import { getRedisInstance } from "../lib/connections";
import dotenv from "dotenv";

dotenv.config();

console.log("Iniciando script de limpeza de todas as filas...");

// Padrões de chaves para filas
// [CLEANUP 2026-02-16] contato-sem-clique REMOVIDO - fila sem consumidor
const queuePatterns = [
	"bull:agendamento:*",
	"bull:instagram-webhooks:*",
	"bull:auto-notifications:*",
];

// Função para limpar todas as filas
async function cleanAllQueues() {
	const redis = getRedisInstance();

	try {
		console.log("Iniciando limpeza de todas as filas...");

		for (const pattern of queuePatterns) {
			console.log(`\nBuscando chaves com padrão: ${pattern}`);
			const keys = await redis.keys(pattern);

			if (keys.length > 0) {
				console.log(`Encontradas ${keys.length} chaves para o padrão ${pattern}`);

				// Exibe as primeiras 10 chaves para verificação
				if (keys.length > 0) {
					console.log("Exemplos de chaves encontradas:");
					keys.slice(0, 10).forEach((key) => console.log(`  - ${key}`));
				}

				// Remove as chaves
				const result = await redis.del(...keys);
				console.log(`Removidas ${result} chaves para o padrão ${pattern}`);
			} else {
				console.log(`Nenhuma chave encontrada para o padrão ${pattern}`);
			}
		}

		console.log("\nLimpeza de todas as filas concluída com sucesso!");
		console.log("Agora você pode reiniciar o servidor para que as filas sejam recriadas corretamente.");
	} catch (error) {
		console.error("Erro ao limpar filas:", error);
	} finally {
		// Fecha a conexão com o Redis
		await redis.quit();
		console.log("Conexão com o Redis fechada.");
	}
}

// Executa a limpeza
cleanAllQueues();
