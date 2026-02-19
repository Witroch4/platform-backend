import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@/auth";
import { mtfDiamanteConfig } from "@/app/config/mtf-diamante";
import { getPrismaInstance } from "@/lib/connections";

/**
 * Função auxiliar para obter as configurações da API do WhatsApp.
 */
async function getWhatsAppApiConfig(userId: string) {
	try {
		const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
			where: { appUserId: userId },
			include: {
				configuracaoGlobalWhatsApp: true,
			},
		});

		if (usuarioChatwit?.configuracaoGlobalWhatsApp) {
			const config = usuarioChatwit.configuracaoGlobalWhatsApp;
			return {
				fbGraphApiBase: config.graphApiBaseUrl,
				whatsappBusinessAccountId: config.whatsappBusinessAccountId,
				whatsappToken: config.whatsappApiKey,
			};
		}

		return {
			fbGraphApiBase: process.env.FB_GRAPH_API_BASE || "https://graph.facebook.com/v22.0",
			whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "294585820394901",
			whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken,
		};
	} catch (error) {
		console.error("Erro ao buscar configuração do WhatsApp:", error);
		return {
			fbGraphApiBase: process.env.FB_GRAPH_API_BASE || "https://graph.facebook.com/v22.0",
			whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "294585820394901",
			whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken,
		};
	}
}

/**
 * PUT /api/admin/mtf-diamante/templates/edit/[metaTemplateId]
 * Edita um template existente na Meta API.
 * A Meta permite editar templates aprovados, que voltam para status PENDING.
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ metaTemplateId: string }> }
) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { metaTemplateId } = await params;

		if (!metaTemplateId) {
			return NextResponse.json(
				{ success: false, error: "ID do template é obrigatório" },
				{ status: 400 }
			);
		}

		const config = await getWhatsAppApiConfig(session.user.id);

		if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
			return NextResponse.json(
				{ success: false, error: "Credenciais do WhatsApp não configuradas." },
				{ status: 400 }
			);
		}

		const body = await request.json();
		console.log(`[Template Edit] Editando template ${metaTemplateId}:`, body);

		// Validar payload
		if (!body.components || !Array.isArray(body.components)) {
			return NextResponse.json(
				{ success: false, error: "Componentes do template são obrigatórios." },
				{ status: 400 }
			);
		}

		// Montar payload para edição
		// A Meta API aceita POST para /{message_template_id} com os componentes atualizados
		const editPayload: Record<string, unknown> = {
			components: body.components,
		};

		// Categoria pode ser atualizada em alguns casos
		if (body.category) {
			editPayload.category = body.category;
		}

		console.log(`[Template Edit] Payload para Meta API:`, JSON.stringify(editPayload, null, 2));

		// Enviar para a Meta API
		// POST /{message_template_id} edita o template existente
		const response = await axios.post(
			`${config.fbGraphApiBase}/${metaTemplateId}`,
			editPayload,
			{
				headers: {
					Authorization: `Bearer ${config.whatsappToken}`,
					"Content-Type": "application/json",
				},
			}
		);

		console.log(`[Template Edit] Resposta da Meta API:`, response.data);

		// Atualizar no banco de dados local
		try {
			await getPrismaInstance().whatsAppOfficialInfo.updateMany({
				where: { metaTemplateId },
				data: {
					status: "PENDING",
					components: body.components,
				},
			});
			console.log(`[Template Edit] Template atualizado no banco local`);
		} catch (dbError) {
			console.error(`[Template Edit] Erro ao atualizar banco:`, dbError);
			// Não falha se não conseguir atualizar o banco
		}

		return NextResponse.json({
			success: true,
			result: response.data,
			message: "Template atualizado e reenviado para validação",
		});
	} catch (error: unknown) {
		const axiosError = error as { response?: { status: number; data: { error?: { code: number; message: string } } }; message?: string };

		if (axiosError.response) {
			console.error("[Template Edit] Erro da Meta API:", {
				status: axiosError.response.status,
				data: axiosError.response.data,
			});

			if (axiosError.response.data?.error) {
				const metaError = axiosError.response.data.error;
				return NextResponse.json(
					{
						success: false,
						error: `Erro API Meta: [${metaError.code}] ${metaError.message}`,
					},
					{ status: axiosError.response.status }
				);
			}
		}

		console.error("[Template Edit] Erro ao editar template:", axiosError.message || error);
		return NextResponse.json(
			{
				success: false,
				error: axiosError.message || "Erro desconhecido ao editar template",
			},
			{ status: 500 }
		);
	}
}
