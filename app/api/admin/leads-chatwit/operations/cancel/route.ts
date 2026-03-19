import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearLeadOperationCancel, emitLeadOperationEvent, requestLeadOperationCancel } from "@/lib/oab-eval/operation-control";
import { clearLeadAwaitingFlag, getLeadOperationJob, getLeadOperationLeadData } from "@/lib/oab-eval/operation-service";
import {
	LEAD_OPERATION_STAGES,
	buildLeadOperationCancelUrl,
	buildLeadOperationJobId,
	buildLeadOperationStatusUrl,
	type LeadOperationStage,
} from "@/lib/oab-eval/operation-types";
import { sseManager } from "@/lib/sse-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLeadOperationStage(value: string | null | undefined): value is LeadOperationStage {
	return !!value && LEAD_OPERATION_STAGES.includes(value as LeadOperationStage);
}

function buildOperationResponse(leadId: string, stage: LeadOperationStage, status: string) {
	const jobId = buildLeadOperationJobId(stage, leadId);
	return {
		jobId,
		leadId,
		stage,
		status,
		statusUrl: buildLeadOperationStatusUrl(leadId, stage),
		cancelUrl: buildLeadOperationCancelUrl(),
	};
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const body = await request.json();
	const leadId = body.leadId ?? body.leadID;
	const stage = body.stage;

	if (!leadId || !isLeadOperationStage(stage)) {
		return NextResponse.json({ error: "leadId e stage válidos são obrigatórios." }, { status: 400 });
	}

	const jobId = buildLeadOperationJobId(stage, leadId);
	const job = await getLeadOperationJob(stage, leadId);

	if (!job) {
		const updatedLead = await clearLeadAwaitingFlag(leadId, stage).catch(() => null);
		await clearLeadOperationCancel(jobId);
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage,
			status: "canceled",
			message: "Operação já não existia mais na fila. Estado destravado.",
			queueState: null,
		});

		if (updatedLead) {
			await sseManager.sendNotification(leadId, {
				type: "leadUpdate",
				message: "Processamento cancelado.",
				leadData: await getLeadOperationLeadData(leadId),
				timestamp: new Date().toISOString(),
			});
		}

		return NextResponse.json({
			success: true,
			operation: buildOperationResponse(leadId, stage, "canceled"),
		});
	}

	const state = await job.getState();
	if (state === "waiting" || state === "delayed" || state === "prioritized") {
		await job.remove();
		await clearLeadAwaitingFlag(leadId, stage);
		await clearLeadOperationCancel(jobId);
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage,
			status: "canceled",
			message: "Operação cancelada antes do início.",
			queueState: state,
		});
		await sseManager.sendNotification(leadId, {
			type: "leadUpdate",
			message: "Processamento cancelado.",
			leadData: await getLeadOperationLeadData(leadId),
			timestamp: new Date().toISOString(),
		});

		return NextResponse.json({
			success: true,
			operation: buildOperationResponse(leadId, stage, "canceled"),
		});
	}

	if (state === "active") {
		await requestLeadOperationCancel({
			leadId,
			stage,
			jobId,
			message: "Cancelamento solicitado pelo usuário.",
		});
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage,
			status: "cancel_requested",
			message: "Cancelamento solicitado. O worker vai encerrar a operação.",
			queueState: state,
		});

		return NextResponse.json(
			{
				success: true,
				operation: buildOperationResponse(leadId, stage, "cancel_requested"),
			},
			{ status: 202 },
		);
	}

	return NextResponse.json({
		success: true,
		operation: buildOperationResponse(leadId, stage, state),
	});
}
