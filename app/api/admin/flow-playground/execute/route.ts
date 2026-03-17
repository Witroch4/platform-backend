/**
 * Flow Playground — Execute API
 *
 * Executa flows diretamente via FlowOrchestrator com DeliveryContext
 * sintético (isPlayground=true). Nenhuma mensagem é enviada ao Chatwit.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { FlowOrchestrator } from "@/services/flow-engine/flow-orchestrator";
import { initCollector, drainCollector } from "@/services/flow-engine/playground-collector";
import { getPrismaInstance } from "@/lib/connections";
import type { DeliveryContext, ChatwitWebhookPayload } from "@/types/flow-engine";

const ExecuteSchema = z.object({
	type: z.enum(["message", "button_click", "free_text"]),
	text: z.string().optional(),
	buttonId: z.string().optional(),
	buttonTitle: z.string().optional(),
	flowId: z.string().optional(),
	inboxId: z.string().min(1, "Inbox obrigatório"),
	channelType: z.enum(["whatsapp", "instagram", "facebook"]).default("whatsapp"),
	playgroundConversationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const body = await request.json();
	const validation = ExecuteSchema.safeParse(body);
	if (!validation.success) {
		return NextResponse.json({ error: "Dados inválidos", details: validation.error.errors }, { status: 400 });
	}

	const { type, text, buttonId, buttonTitle, flowId, inboxId, channelType, playgroundConversationId } = validation.data;

	try {
		const prisma = getPrismaInstance();

		const inbox = await prisma.chatwitInbox.findUnique({
			where: { id: inboxId },
			include: { usuarioChatwit: { select: { chatwitAccountId: true } } },
		});
		if (!inbox) {
			return NextResponse.json({ error: "Inbox não encontrado" }, { status: 404 });
		}

		const executionId = `pg_${nanoid(12)}`;
		const conversationId = playgroundConversationId || `playground_${nanoid(10)}`;

		const ctx: DeliveryContext = {
			accountId: Number(inbox.usuarioChatwit.chatwitAccountId) || 1,
			conversationId: -Date.now(),
			inboxId: Number(inbox.inboxId) || 0,
			contactId: -1,
			contactName: session.user.name ?? "Playground",
			contactPhone: "+5500000000000",
			channelType,
			prismaInboxId: inboxId,
			chatwitAccessToken: "playground_noop",
			chatwitBaseUrl: "http://playground",
			isPlayground: true,
			playgroundExecutionId: executionId,
		};

		initCollector(executionId);

		const orchestrator = new FlowOrchestrator();
		let result;

		if (type === "message") {
			if (flowId) {
				result = await orchestrator.executeFlowById(flowId, ctx);
			} else {
				const payload: ChatwitWebhookPayload = {
					event: "message_created",
					text: text || "",
					message: { content: text || "", message_type: "incoming" },
					conversation: { id: ctx.conversationId, inbox_id: ctx.inboxId },
					contact: { id: ctx.contactId, name: ctx.contactName },
				};
				result = await orchestrator.handle(payload, ctx);
			}
		} else if (type === "button_click") {
			if (!buttonId) {
				return NextResponse.json({ error: "buttonId obrigatório para button_click" }, { status: 400 });
			}
			const payload: ChatwitWebhookPayload = {
				event: "message_created",
				content_attributes: { button_reply: { id: buttonId, title: buttonTitle } },
				message: { content: buttonTitle || "", message_type: "incoming" },
				conversation: { id: ctx.conversationId, inbox_id: ctx.inboxId },
				contact: { id: ctx.contactId, name: ctx.contactName },
			};
			result = await orchestrator.handle(payload, ctx);
		} else {
			// free_text — resume WAIT_FOR_REPLY
			const payload: ChatwitWebhookPayload = {
				event: "message_created",
				text: text || "",
				message: { content: text || "", message_type: "incoming" },
				conversation: { id: ctx.conversationId, inbox_id: ctx.inboxId },
				contact: { id: ctx.contactId, name: ctx.contactName },
			};
			result = await orchestrator.handle(payload, ctx);
		}

		// Esperar setImmediate chains (async deliveries)
		await new Promise((r) => setTimeout(r, 2000));

		const asyncDeliveries = drainCollector(executionId);

		// Buscar session atualizada para retornar variáveis e log
		const flowSession = await prisma.flowSession.findFirst({
			where: { conversationId: String(ctx.conversationId), status: { in: ["WAITING_INPUT", "COMPLETED", "ACTIVE"] } },
			orderBy: { updatedAt: "desc" },
		});

		// Transformar sync response em mensagens
		const messages = parseSyncResponse(result.syncResponse, asyncDeliveries);

		return NextResponse.json({
			success: true,
			messages,
			playgroundConversationId: conversationId,
			sessionStatus: flowSession?.status ?? (result.waitingInput ? "WAITING_INPUT" : "COMPLETED"),
			variables: (flowSession?.variables as Record<string, unknown>) ?? {},
			executionLog: (flowSession?.executionLog as unknown[]) ?? [],
			error: result.error,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Erro na execução", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface PlaygroundMessage {
	id: string;
	direction: "bot";
	type: "text" | "interactive" | "reaction" | "media" | "template" | "action";
	content?: string;
	interactivePayload?: Record<string, unknown>;
	emoji?: string;
	mediaUrl?: string;
	timestamp: number;
	deliveryMode: "sync" | "async";
}

function parseSyncResponse(
	syncResponse: unknown,
	asyncDeliveries: Array<{ payload: unknown; timestamp: number }>,
): PlaygroundMessage[] {
	const messages: PlaygroundMessage[] = [];

	if (syncResponse) {
		const resp = syncResponse as Record<string, unknown>;

		// Reaction (emoji)
		if (resp.emoji) {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "reaction",
				emoji: String(resp.emoji),
				timestamp: Date.now(),
				deliveryMode: "sync",
			});
		}

		// Text
		if (resp.text) {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "text",
				content: String(resp.text),
				timestamp: Date.now(),
				deliveryMode: "sync",
			});
		}

		// WhatsApp interactive or text
		const wa = resp.whatsapp as Record<string, unknown> | undefined;
		if (wa) {
			const waInteractive = wa.interactive as Record<string, unknown> | undefined;
			if (wa.type === "interactive" && waInteractive) {
				messages.push({
					id: nanoid(8),
					direction: "bot",
					type: "interactive",
					interactivePayload: wa,
					timestamp: Date.now(),
					deliveryMode: "sync",
				});
			} else if (wa.type === "text") {
				const textObj = wa.text as { body?: string } | undefined;
				messages.push({
					id: nanoid(8),
					direction: "bot",
					type: "text",
					content: textObj?.body ?? String(wa.text),
					timestamp: Date.now(),
					deliveryMode: "sync",
				});
			}
		}

		// Instagram quick replies
		const ig = resp.instagram as Record<string, unknown> | undefined;
		if (ig) {
			if (ig.message_format === "QUICK_REPLIES") {
				messages.push({
					id: nanoid(8),
					direction: "bot",
					type: "interactive",
					interactivePayload: ig,
					content: String(ig.text || ""),
					timestamp: Date.now(),
					deliveryMode: "sync",
				});
			} else {
				const igMsg = ig.message as { text?: string } | undefined;
				messages.push({
					id: nanoid(8),
					direction: "bot",
					type: "text",
					content: igMsg?.text ?? String(ig.text || ""),
					timestamp: Date.now(),
					deliveryMode: "sync",
				});
			}
		}
	}

	// Async deliveries
	for (const d of asyncDeliveries) {
		const p = d.payload as Record<string, unknown>;
		const pType = p.type as string;

		if (pType === "text") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "text",
				content: String(p.content ?? ""),
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		} else if (pType === "interactive") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "interactive",
				interactivePayload: p.interactivePayload as Record<string, unknown>,
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		} else if (pType === "media") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "media",
				mediaUrl: String(p.mediaUrl ?? ""),
				content: String(p.content ?? p.filename ?? ""),
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		} else if (pType === "reaction") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "reaction",
				emoji: String(p.emoji ?? ""),
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		} else if (pType === "chatwit_action") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "action",
				content: `Ação: ${p.actionType}${p.labels ? ` (${(p.labels as string[]).join(", ")})` : ""}${p.assigneeId ? ` → agente ${p.assigneeId}` : ""}`,
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		} else if (pType === "template") {
			messages.push({
				id: nanoid(8),
				direction: "bot",
				type: "template",
				content: `Template: ${JSON.stringify(p.templatePayload ?? {}).slice(0, 200)}`,
				interactivePayload: p.templatePayload as Record<string, unknown>,
				timestamp: d.timestamp,
				deliveryMode: "async",
			});
		}
	}

	return messages;
}
