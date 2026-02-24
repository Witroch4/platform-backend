import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import FormData from "form-data";
import axios from "axios";

const prisma = getPrismaInstance();

const CHATWOOT_ACCESS_TOKEN = process.env.CHATWITACESSTOKEN;
const CHATWOOT_BASE_URL = process.env.CHATWIT_BASE_URL ?? "https://chatwit.witdev.com.br";

/**
 * Extrai conversationId de uma URL do tipo
 * https://.../accounts/3/conversations/1199
 */
function extractConversationId(leadUrl: string) {
	const url = new URL(leadUrl);
	const parts = url.pathname.split("/");
	const convIdx = parts.indexOf("conversations");
	if (convIdx === -1 || !parts[convIdx + 1]) {
		throw new Error(`leadUrl fora do formato esperado: ${leadUrl}`);
	}
	return parts[convIdx + 1];
}

/**
 * POST: Valida recurso, gera DOCX a partir do HTML e envia como anexo no chat do lead.
 *
 * Body: { leadID, html, textoRecurso?, message?, accessToken? }
 */
export async function POST(request: Request): Promise<Response> {
	try {
		const payload = await request.json();
		const leadId = payload.leadID;

		if (!leadId) {
			return NextResponse.json({ error: "leadID não fornecido" }, { status: 400 });
		}

		if (!payload.html) {
			return NextResponse.json({ error: "html do recurso não fornecido" }, { status: 400 });
		}

		console.log(`[Enviar Recurso Validado] Iniciando para lead ${leadId}`);

		// 1) Buscar lead
		const lead = await prisma.leadOabData.findUnique({
			where: { id: leadId },
			include: {
				lead: { select: { name: true, sourceIdentifier: true } },
			},
		});

		if (!lead) {
			return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
		}

		if (!lead.leadUrl) {
			return NextResponse.json({ error: "Lead sem leadUrl (conversa não vinculada)" }, { status: 400 });
		}

		// 2) Buscar accountId do usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findFirst({
			where: {
				leadsOabData: { some: { id: leadId } },
			},
			select: { chatwitAccountId: true },
		});

		if (!usuarioChatwit?.chatwitAccountId) {
			return NextResponse.json({ error: "Usuário Chatwit não configurado" }, { status: 400 });
		}

		// 3) Token de acesso
		const accessToken = payload.accessToken || CHATWOOT_ACCESS_TOKEN;
		if (!accessToken) {
			return NextResponse.json({ error: "Token de acesso não configurado" }, { status: 500 });
		}

		// 4) Gerar DOCX a partir do HTML
		const HTMLtoDOCX = (await import("html-to-docx")).default;

		const wrappedHtml = `
			<html>
			<head><style>
				body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; }
				h1 { font-size: 16pt; font-weight: bold; }
				h2 { font-size: 14pt; font-weight: bold; }
				h3 { font-size: 13pt; font-weight: bold; }
			</style></head>
			<body>${payload.html}</body>
			</html>
		`;

		const docxResult = await HTMLtoDOCX(wrappedHtml, null, {
			table: { row: { cantSplit: true } },
			footer: true,
			pageNumber: true,
		});

		const docxBuffer =
			docxResult instanceof Buffer
				? docxResult
				: Buffer.from(await (docxResult as Blob).arrayBuffer());

		console.log(`[Enviar Recurso Validado] DOCX gerado: ${docxBuffer.length} bytes`);

		// 5) Enviar DOCX para o chat via Chatwit API
		const conversationId = extractConversationId(lead.leadUrl);
		const accountId = usuarioChatwit.chatwitAccountId;
		const message = payload.message || "Segue o nosso Recurso, qualquer dúvida estamos à disposição.";
		const nomeReal = lead.nomeReal || lead.lead?.name || "lead";
		const filename = `recurso_${nomeReal.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;

		const form = new FormData();
		form.append("content", message);
		form.append("message_type", "outgoing");
		form.append("attachments[]", docxBuffer, {
			filename,
			contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});

		const chatwootUrl = `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

		const cwRes = await axios.post(chatwootUrl, form, {
			headers: {
				...form.getHeaders(),
				api_access_token: accessToken,
			},
			maxBodyLength: Number.POSITIVE_INFINITY,
		});

		console.log(`[Enviar Recurso Validado] DOCX enviado para conversa ${conversationId}`);

		// 6) Atualizar DB: recurso validado + feito + não mais aguardando
		const updateData: Record<string, unknown> = {
			recursoValidado: true,
			fezRecurso: true,
			aguardandoRecurso: false,
			anotacoes: message,
		};

		if (payload.textoRecurso) {
			updateData.recursoPreliminar = { textoRecurso: payload.textoRecurso };
		}

		await prisma.leadOabData.update({
			where: { id: leadId },
			data: updateData,
		});

		console.log(`[Enviar Recurso Validado] DB atualizado: recursoValidado=true, fezRecurso=true`);

		return NextResponse.json({
			success: true,
			message: "Recurso validado e enviado para o chat com sucesso",
			chatwoot: cwRes.data,
		});
	} catch (error: any) {
		console.error("[Enviar Recurso Validado] Erro:", error);
		return NextResponse.json(
			{ error: error.message || "Erro interno ao enviar recurso validado" },
			{ status: 500 },
		);
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
