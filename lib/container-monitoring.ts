/**
 * Monitoramento específico para ambientes containerizados
 */

import { getPrismaInstance, getRedisInstance } from "./connections";

interface ContainerHealth {
	status: "healthy" | "degraded" | "unhealthy";
	services: {
		database: {
			status: string;
			connections: number;
			responseTime: number;
		};
		redis: {
			status: string;
			memory: string;
			responseTime: number;
		};
	};
	container: {
		uptime: number;
		memory: NodeJS.MemoryUsage;
		pid: number;
	};
	timestamp: string;
}

/**
 * Verifica saúde completa do container
 */
export async function checkContainerHealth(): Promise<ContainerHealth> {
	const startTime = Date.now();

	const health: ContainerHealth = {
		status: "healthy",
		services: {
			database: {
				status: "unknown",
				connections: 0,
				responseTime: 0,
			},
			redis: {
				status: "unknown",
				memory: "0MB",
				responseTime: 0,
			},
		},
		container: {
			uptime: process.uptime(),
			memory: process.memoryUsage(),
			pid: process.pid,
		},
		timestamp: new Date().toISOString(),
	};

	// Testar Prisma
	try {
		const dbStart = Date.now();
		const prisma = getPrismaInstance();

		// Query simples para testar conexão
		await prisma.$queryRaw`SELECT 1 as test`;

		health.services.database = {
			status: "healthy",
			connections: 1, // Prisma gerencia internamente
			responseTime: Date.now() - dbStart,
		};
	} catch (error) {
		health.services.database.status = "unhealthy";
		health.status = "degraded";
		console.error("❌ Database health check failed:", error);
	}

	// Testar Redis
	try {
		const redisStart = Date.now();
		const redis = getRedisInstance();

		// Ping e info de memória
		await redis.ping();
		const info = await redis.info("memory");
		const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

		health.services.redis = {
			status: "healthy",
			memory: memoryMatch ? memoryMatch[1] : "unknown",
			responseTime: Date.now() - redisStart,
		};
	} catch (error) {
		health.services.redis.status = "unhealthy";
		health.status = "degraded";
		console.error("❌ Redis health check failed:", error);
	}

	// Determinar status geral
	if (health.services.database.status === "unhealthy" && health.services.redis.status === "unhealthy") {
		health.status = "unhealthy";
	}

	return health;
}

/**
 * Log periódico de saúde (para containers sempre-on)
 */
export function startHealthMonitoring(intervalMs: number = 60000) {
	if (process.env.NODE_ENV !== "production") {
		return; // Apenas em produção
	}

	console.log(`🏥 Iniciando monitoramento de saúde (${intervalMs}ms)`);

	setInterval(async () => {
		try {
			const health = await checkContainerHealth();

			if (health.status !== "healthy") {
				console.warn("⚠️ Container health degraded:", {
					status: health.status,
					database: health.services.database.status,
					redis: health.services.redis.status,
					memory: `${Math.round(health.container.memory.heapUsed / 1024 / 1024)}MB`,
				});
			} else {
				// Log resumido apenas se tudo estiver ok
				console.log("💚 Container healthy", {
					uptime: `${Math.round(health.container.uptime)}s`,
					memory: `${Math.round(health.container.memory.heapUsed / 1024 / 1024)}MB`,
				});
			}
		} catch (error) {
			console.error("❌ Health monitoring error:", error);
		}
	}, intervalMs);
}

/**
 * Métricas para Prometheus/Grafana (se necessário)
 */
export async function getPrometheusMetrics(): Promise<string> {
	const health = await checkContainerHealth();

	return `
# HELP container_status Container health status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE container_status gauge
container_status{service="chatwit-social"} ${health.status === "healthy" ? 1 : health.status === "degraded" ? 0.5 : 0}

# HELP database_response_time Database response time in milliseconds
# TYPE database_response_time gauge
database_response_time{service="chatwit-social"} ${health.services.database.responseTime}

# HELP redis_response_time Redis response time in milliseconds
# TYPE redis_response_time gauge
redis_response_time{service="chatwit-social"} ${health.services.redis.responseTime}

# HELP container_memory_usage Container memory usage in bytes
# TYPE container_memory_usage gauge
container_memory_usage{service="chatwit-social"} ${health.container.memory.heapUsed}

# HELP container_uptime Container uptime in seconds
# TYPE container_uptime counter
container_uptime{service="chatwit-social"} ${health.container.uptime}
`.trim();
}
