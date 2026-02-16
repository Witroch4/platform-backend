import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import axios from "axios";

// GET - Buscar caixas de entrada do Chatwit
export async function GET(request: NextRequest) {
	const startTime = Date.now();
	console.log("🚀 [Inboxes API] Iniciando requisição GET");

	try {
		const session = await auth();
		if (!session?.user?.id) {
			console.log("❌ [Inboxes API] Usuário não autorizado");
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		console.log(`👤 [Inboxes API] Usuário autenticado: ${session.user.id}`);

		// Buscar configurações do usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			select: {
				chatwitAccountId: true,
				chatwitAccessToken: true,
			},
		});

		if (!usuarioChatwit?.chatwitAccessToken || !usuarioChatwit?.chatwitAccountId) {
			console.log("❌ [Inboxes API] Configurações do Chatwit não encontradas");
			return NextResponse.json(
				{
					error: "Configurações do Chatwit não encontradas",
					message: "Configure seu Account ID e Token do Chatwit primeiro",
				},
				{ status: 400 },
			);
		}

		const accountId = usuarioChatwit.chatwitAccountId;
		const apiToken = usuarioChatwit.chatwitAccessToken;
		const baseURL = process.env.CHATWIT_BASE_URL || "https://chatwit.witdev.com.br";

		console.log(`🔗 [Inboxes API] Chamando API externa: ${baseURL}/api/v1/accounts/${accountId}/inboxes`);

		try {
			const response = await axios.get(`${baseURL}/api/v1/accounts/${accountId}/inboxes`, {
				headers: {
					api_access_token: apiToken,
					"Content-Type": "application/json",
				},
				timeout: 10000, // 10 segundos de timeout
			});

			const inboxes = response.data.payload || [];
			console.log(`✅ [Inboxes API] Resposta da API externa: ${inboxes.length} inboxes encontradas`);

			// Mapear para formato simplificado, incluindo o account_id
			const simplifiedInboxes = inboxes.map((inbox: any) => ({
				id: inbox.id.toString(),
				name: inbox.name,
				channel_type: inbox.channel_type,
				account_id: accountId, // Adicionando o account_id a cada objeto de inbox
			}));

			const duration = Date.now() - startTime;
			console.log(`✅ [Inboxes API] Requisição concluída em ${duration}ms`);

			return NextResponse.json({ inboxes: simplifiedInboxes });
		} catch (apiError: any) {
			const duration = Date.now() - startTime;
			console.error(
				`❌ [Inboxes API] Erro na API externa após ${duration}ms:`,
				apiError.response?.data || apiError.message,
			);

			// Se for erro 404, pode ser que a conta não tenha inboxes configuradas
			if (apiError.response?.status === 404) {
				console.log("⚠️ [Inboxes API] Conta não possui inboxes configuradas (404)");
				return NextResponse.json({ inboxes: [] });
			}

			return NextResponse.json(
				{
					error: "Erro ao conectar com a API do Chatwit",
					details: apiError.response?.data || apiError.message,
				},
				{ status: 502 },
			);
		}
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`❌ [Inboxes API] Erro interno após ${duration}ms:`, error);
		return NextResponse.json({ error: "Erro interno" }, { status: 500 });
	}
}
