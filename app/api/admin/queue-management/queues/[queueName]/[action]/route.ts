import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getRedisInstance } from "@/lib/connections";
import { Queue } from "bullmq";

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ queueName: string; action: string }> },
) {
	try {
		// Verificação de autenticação e autorização
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode executar ações nas filas." },
				{ status: 403 },
			);
		}

		const { queueName, action } = await params;

		try {
			const redis = getRedisInstance();
			const queue = new Queue(queueName, { connection: redis });

			let result;

			switch (action) {
				case "pause":
					await queue.pause();
					result = { success: true, message: `Queue ${queueName} paused` };
					break;

				case "resume":
					await queue.resume();
					result = { success: true, message: `Queue ${queueName} resumed` };
					break;

				case "retry-failed":
					const failedJobs = await queue.getFailed();
					let retriedCount = 0;
					for (const job of failedJobs) {
						try {
							await job.retry();
							retriedCount++;
						} catch (retryError) {
							console.warn(`Failed to retry job ${job.id}:`, retryError);
						}
					}
					result = {
						success: true,
						processed: retriedCount,
						total: failedJobs.length,
						message: `Retried ${retriedCount}/${failedJobs.length} failed jobs`,
					};
					break;

				case "clean":
					const completedJobs = await queue.getCompleted();
					const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
					const jobsToClean = completedJobs.filter((job) => job.finishedOn && job.finishedOn < cutoffTime);

					let cleanedCount = 0;
					for (const job of jobsToClean) {
						try {
							await job.remove();
							cleanedCount++;
						} catch (cleanError) {
							console.warn(`Failed to clean job ${job.id}:`, cleanError);
						}
					}

					result = {
						success: true,
						processed: cleanedCount,
						total: jobsToClean.length,
						message: `Cleaned ${cleanedCount}/${jobsToClean.length} completed jobs`,
					};
					break;

				default:
					return NextResponse.json({ error: `Ação '${action}' não suportada` }, { status: 400 });
			}

			return NextResponse.json({
				success: true,
				message: `Ação '${action}' executada com sucesso na fila '${queueName}'`,
				result,
			});
		} catch (queueError) {
			console.error(`Queue manager error for action ${action} on queue ${queueName}:`, queueError);
			return NextResponse.json(
				{ error: `Falha ao executar ação: ${queueError instanceof Error ? queueError.message : "Unknown error"}` },
				{ status: 500 },
			);
		}
	} catch (error) {
		console.error(`Erro ao executar ação na fila:`, error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
