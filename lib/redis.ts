//lib/redis.ts

import { getRedisInstance } from "./connections";
import * as dotenv from "dotenv";

dotenv.config();

// Detecta se está rodando em Docker
const isRunningInDocker = process.env.RUN_IN_DOCKER === "true" || process.env.NODE_ENV === "production";

// Variável para controlar se já exibimos a configuração
let configLogged = false;

// Função para exibir a configuração apenas uma vez
function logRedisConfig() {
	if (!configLogged) {
		console.log("Configuração de conexão com o Redis:", {
			environment: isRunningInDocker ? "Docker/Production" : "Local Development",
			usingGlobalConnector: true,
		});
		configLogged = true;
	}
}

// Lazy initialization to avoid Edge Runtime issues
let _redisConnection: ReturnType<typeof getRedisInstance> | null = null;

// Obtém a instância global do Redis (lazy initialization)
function getConnection() {
	if (!_redisConnection) {
		_redisConnection = getRedisInstance();
		logRedisConfig();
	}
	return _redisConnection;
}

export { getConnection as connection };
