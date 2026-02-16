#!/usr/bin/env tsx

import { getRedisInstance } from "../lib/connections";

async function checkRedisConnection() {
	console.log("🔍 Verificando conexão com o Redis...");

	const connection = getRedisInstance();

	try {
		// Testa a conexão
		await connection.ping();
		console.log("✅ Redis conectado com sucesso!");

		// Testa operações básicas
		await connection.set("test:connection", "ok");
		const result = await connection.get("test:connection");
		await connection.del("test:connection");

		console.log("✅ Operações básicas funcionando:", result);

		// Informações do servidor
		const info = await connection.info("server");
		console.log("📊 Informações do servidor Redis:");
		console.log(info.split("\n").slice(0, 5).join("\n"));
	} catch (error) {
		console.error("❌ Erro ao conectar com o Redis:", error);
		console.log("\n💡 Soluções possíveis:");
		console.log("1. Instale o Redis localmente: https://redis.io/download");
		console.log("2. Ou use Docker: docker run -d -p 6379:6379 redis:alpine");
		console.log("3. Ou configure as variáveis de ambiente REDIS_HOST e REDIS_PORT");
	} finally {
		await connection.quit();
	}
}

checkRedisConnection();
