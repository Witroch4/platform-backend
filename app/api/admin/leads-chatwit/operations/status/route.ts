import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLeadOperationState } from "@/lib/oab-eval/operation-control";
import { getLeadOperationDatabaseFallback, getLeadOperationJob } from "@/lib/oab-eval/operation-service";
import {
	LEAD_OPERATION_STAGES,
	buildLeadOperationJobId,
	mapBullMqStateToLeadOperationStatus,
	type LeadOperationStage,
	type LeadOperationStatusResponse,
} from "@/lib/oab-eval/operation-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLeadOperationStage(value: string | null): value is LeadOperationStage {
	return !!value && LEAD_OPERATION_STAGES.includes(value as LeadOperationStage);
}

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const leadId = searchParams.get("leadId");
	const stage = searchParams.get("stage");

	if (!leadId || !isLeadOperationStage(stage)) {
		return NextResponse.json({ error: "leadId e stage válidos são obrigatórios." }, { status: 400 });
	}

	const jobId = buildLeadOperationJobId(stage, leadId);
	const [job, redisState] = await Promise.all([getLeadOperationJob(stage, leadId), getLeadOperationState(jobId)]);

	if (job) {
		const queueState = await job.getState();
		const mappedStatus = mapBullMqStateToLeadOperationStatus(queueState);
		const progress = (job.progress ?? redisState?.progress ?? null) as LeadOperationStatusResponse["progress"];
		const status =
			redisState?.status === "cancel_requested" || redisState?.status === "canceled"
				? redisState.status
				: mappedStatus ?? redisState?.status ?? "processing";

		return NextResponse.json({
			leadId,
			jobId,
			stage,
			status,
			progress,
			message: redisState?.message,
			error: queueState === "failed" ? job.failedReason || redisState?.error : redisState?.error,
			queueState,
			updatedAt: redisState?.updatedAt ?? new Date(job.timestamp).toISOString(),
			source: "bullmq",
		} satisfies LeadOperationStatusResponse);
	}

	if (redisState) {
		return NextResponse.json(redisState satisfies LeadOperationStatusResponse);
	}

	const fallback = await getLeadOperationDatabaseFallback(leadId, stage);
	return NextResponse.json({
		leadId,
		jobId,
		stage,
		status: fallback.status,
		message: fallback.message,
		source: "database",
		updatedAt: new Date().toISOString(),
	} satisfies LeadOperationStatusResponse);
}
