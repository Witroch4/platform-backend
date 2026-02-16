import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getRedisInstance } from "@/lib/connections";
import { Queue } from "bullmq";

// Known queue names from the system
const QUEUE_NAMES = [
	"resposta-rapida",
	"persistencia-credenciais",
	"instagram-translation",
	"leads-chatwit",
	"manuscrito",
	"instagram-webhook-auto-notifications",
	"ai-incoming-message",
	"ai-embedding-upsert",
];

export async function GET(request: NextRequest) {
	try {
		// Verificação de autenticação e autorização
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Acesso negado. Apenas SUPERADMIN pode acessar." }, { status: 403 });
		}

		try {
			const redis = getRedisInstance();
			const queueStatuses = [];

			for (const queueName of QUEUE_NAMES) {
				try {
					const queue = new Queue(queueName, { connection: redis });

					// Get queue counts
					const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
						queue.getWaitingCount(),
						queue.getActiveCount(),
						queue.getCompletedCount(),
						queue.getFailedCount(),
						queue.getDelayedCount(),
						queue.isPaused(),
					]);

					// Determine status
					let status = "healthy";
					if (isPaused) {
						status = "paused";
					} else if (failed > 10) {
						status = "critical";
					} else if (failed > 0 || waiting > 50) {
						status = "warning";
					}

					queueStatuses.push({
						name: queueName,
						status,
						waiting,
						active,
						completed,
						failed,
						delayed,
						throughput: 0, // Will be calculated by monitoring
						avgProcessingTime: 0, // Will be calculated by monitoring
						errorRate: failed > 0 ? failed / (completed + failed) : 0,
					});
				} catch (queueError) {
					console.warn(`Error getting stats for queue ${queueName}:`, queueError);

					// Queue might not exist yet, add it with zero values
					queueStatuses.push({
						name: queueName,
						status: "healthy",
						waiting: 0,
						active: 0,
						completed: 0,
						failed: 0,
						delayed: 0,
						throughput: 0,
						avgProcessingTime: 0,
						errorRate: 0,
					});
				}
			}

			return NextResponse.json(queueStatuses);
		} catch (redisError) {
			console.error("Redis connection error:", redisError);
			return NextResponse.json({ error: "Erro de conexão com Redis" }, { status: 500 });
		}
	} catch (error) {
		console.error("Erro ao buscar status das filas:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
