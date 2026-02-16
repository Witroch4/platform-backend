import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import { Prisma } from "@prisma/client";

const prisma = getPrismaInstance();
const logger = createLogger("SocialWise-Inbox-Config");

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { assistantId, inboxId, config } = body;

		if (!assistantId || !inboxId || !config) {
			return NextResponse.json(
				{
					error: "assistantId, inboxId e config são obrigatórios",
				},
				{ status: 400 },
			);
		}

		// Validate assistant ownership
		const assistant = await prisma.aiAssistant.findUnique({
			where: { id: assistantId, userId: session.user.id },
		});

		if (!assistant) {
			return NextResponse.json({ error: "Assistente não encontrado" }, { status: 404 });
		}

		// Find the ChatwitInbox by inboxId
		const chatwitInbox = await prisma.chatwitInbox.findFirst({
			where: {
				inboxId: inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!chatwitInbox) {
			return NextResponse.json({ error: "Inbox não encontrada" }, { status: 404 });
		}

		// Get current config for history
		const previousConfig = {
			inheritFromAgent: chatwitInbox.socialwiseInheritFromAgent,
			reasoningEffort: chatwitInbox.socialwiseReasoningEffort,
			verbosity: chatwitInbox.socialwiseVerbosity,
			temperature: chatwitInbox.socialwiseTemperature,
			tempSchema: chatwitInbox.socialwiseTempSchema,
			warmupDeadlineMs: chatwitInbox.socialwiseWarmupDeadlineMs,
			hardDeadlineMs: chatwitInbox.socialwiseHardDeadlineMs,
			softDeadlineMs: chatwitInbox.socialwiseSoftDeadlineMs,
			shortTitleLLM: chatwitInbox.socialwiseShortTitleLLM,
			toolChoice: chatwitInbox.socialwiseToolChoice,
		};

		// Update the ChatwitInbox with new SocialWise config
		const updatedInbox = await prisma.chatwitInbox.update({
			where: { id: chatwitInbox.id },
			data: {
				socialwiseInheritFromAgent: config.inheritFromAgent ?? true,
				socialwiseReasoningEffort: config.inheritFromAgent ? null : config.reasoningEffort,
				socialwiseVerbosity: config.inheritFromAgent ? null : config.verbosity,
				socialwiseTemperature: config.inheritFromAgent ? null : config.temperature,
				socialwiseTempSchema: config.inheritFromAgent ? null : config.tempSchema,
				socialwiseWarmupDeadlineMs: config.inheritFromAgent ? null : config.warmupDeadlineMs,
				socialwiseHardDeadlineMs: config.inheritFromAgent ? null : config.hardDeadlineMs,
				socialwiseSoftDeadlineMs: config.inheritFromAgent ? null : config.softDeadlineMs,
				socialwiseShortTitleLLM: config.inheritFromAgent ? null : config.shortTitleLLM,
				socialwiseToolChoice: config.inheritFromAgent ? null : config.toolChoice,
			},
		});

		// Create history entry
		await prisma.inboxConfigHistory.create({
			data: {
				inboxId: chatwitInbox.id,
				userId: session.user.id,
				changeType: previousConfig.inheritFromAgent !== undefined ? "update" : "create",
				previousConfig:
					previousConfig.inheritFromAgent !== undefined ? JSON.stringify(previousConfig) : Prisma.JsonNull,
				newConfig: JSON.stringify({
					inheritFromAgent: config.inheritFromAgent ?? true,
					reasoningEffort: config.inheritFromAgent ? null : config.reasoningEffort,
					verbosity: config.inheritFromAgent ? null : config.verbosity,
					temperature: config.inheritFromAgent ? null : config.temperature,
					tempSchema: config.inheritFromAgent ? null : config.tempSchema,
					warmupDeadlineMs: config.inheritFromAgent ? null : config.warmupDeadlineMs,
					hardDeadlineMs: config.inheritFromAgent ? null : config.hardDeadlineMs,
					softDeadlineMs: config.inheritFromAgent ? null : config.softDeadlineMs,
					shortTitleLLM: config.inheritFromAgent ? null : config.shortTitleLLM,
					toolChoice: config.inheritFromAgent ? null : config.toolChoice,
				}),
				description: `Configuração ${previousConfig.inheritFromAgent !== undefined ? "atualizada" : "criada"} para inbox ${inboxId}`,
			},
		});

		logger.info("Configuração da inbox persistida", {
			userId: session.user.id,
			assistantId,
			inboxId,
			config: {
				inheritFromAgent: config.inheritFromAgent,
				hasSpecificConfig: !config.inheritFromAgent,
			},
		});

		return NextResponse.json({
			success: true,
			message: "Configuração salva com sucesso",
			config: {
				inheritFromAgent: updatedInbox.socialwiseInheritFromAgent,
				reasoningEffort: updatedInbox.socialwiseReasoningEffort,
				verbosity: updatedInbox.socialwiseVerbosity,
				temperature: updatedInbox.socialwiseTemperature,
				tempSchema: updatedInbox.socialwiseTempSchema,
				warmupDeadlineMs: updatedInbox.socialwiseWarmupDeadlineMs,
				hardDeadlineMs: updatedInbox.socialwiseHardDeadlineMs,
				softDeadlineMs: updatedInbox.socialwiseSoftDeadlineMs,
				shortTitleLLM: updatedInbox.socialwiseShortTitleLLM,
				toolChoice: updatedInbox.socialwiseToolChoice,
			},
		});
	} catch (error: any) {
		logger.error("Erro ao persistir configuração da inbox", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}
