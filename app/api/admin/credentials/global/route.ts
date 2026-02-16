// app/api/admin/credentials/global/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
/**
 * GET - Busca configuração global do WhatsApp
 */
export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			include: {
				configuracaoGlobalWhatsApp: true,
			},
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		const globalConfig = usuarioChatwit.configuracaoGlobalWhatsApp;

		return NextResponse.json({
			id: globalConfig?.id,
			whatsappApiKey: globalConfig?.whatsappApiKey ? "***" : null, // Mascarar por segurança
			phoneNumberId: globalConfig?.phoneNumberId,
			whatsappBusinessAccountId: globalConfig?.whatsappBusinessAccountId,
			graphApiBaseUrl: globalConfig?.graphApiBaseUrl || "https://graph.facebook.com/v22.0",
			updatedAt: globalConfig?.updatedAt,
			hasCredentials: !!globalConfig?.whatsappApiKey,
			exists: !!globalConfig,
		});
	} catch (error) {
		console.error("[Global Credentials API] Erro ao buscar configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * POST - Cria configuração global do WhatsApp
 */
export async function POST(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const {
			whatsappApiKey,
			phoneNumberId,
			whatsappBusinessAccountId,
			graphApiBaseUrl = "https://graph.facebook.com/v22.0",
		} = body;

		// Validações básicas
		if (!whatsappApiKey || !phoneNumberId || !whatsappBusinessAccountId) {
			return NextResponse.json(
				{ error: "whatsappApiKey, phoneNumberId e whatsappBusinessAccountId são obrigatórios" },
				{ status: 400 },
			);
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			include: {
				configuracaoGlobalWhatsApp: true,
			},
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Verificar se já existe configuração global
		if (usuarioChatwit.configuracaoGlobalWhatsApp) {
			return NextResponse.json({ error: "Configuração global já existe. Use PUT para atualizar." }, { status: 409 });
		}

		// Criar configuração global
		const globalConfig = await prisma.whatsAppGlobalConfig.create({
			data: {
				usuarioChatwitId: usuarioChatwit.id,
				whatsappApiKey,
				phoneNumberId,
				whatsappBusinessAccountId,
				graphApiBaseUrl,
			},
		});

		console.log(`[Global Credentials API] Configuração global criada: ${globalConfig.id}`);

		return NextResponse.json(
			{
				id: globalConfig.id,
				whatsappApiKey: "***", // Mascarar na resposta
				phoneNumberId: globalConfig.phoneNumberId,
				whatsappBusinessAccountId: globalConfig.whatsappBusinessAccountId,
				graphApiBaseUrl: globalConfig.graphApiBaseUrl,
				updatedAt: globalConfig.updatedAt,
				hasCredentials: true,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error("[Global Credentials API] Erro ao criar configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * PUT - Atualiza configuração global do WhatsApp
 */
export async function PUT(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { whatsappApiKey, phoneNumberId, whatsappBusinessAccountId, graphApiBaseUrl } = body;

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			include: {
				configuracaoGlobalWhatsApp: true,
			},
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		if (!usuarioChatwit.configuracaoGlobalWhatsApp) {
			return NextResponse.json({ error: "Configuração global não encontrada. Use POST para criar." }, { status: 404 });
		}

		// Preparar dados de atualização
		const updateData: any = {};
		if (whatsappApiKey !== undefined) updateData.whatsappApiKey = whatsappApiKey;
		if (phoneNumberId !== undefined) updateData.phoneNumberId = phoneNumberId;
		if (whatsappBusinessAccountId !== undefined) updateData.whatsappBusinessAccountId = whatsappBusinessAccountId;
		if (graphApiBaseUrl !== undefined) updateData.graphApiBaseUrl = graphApiBaseUrl;

		// Atualizar configuração global
		const updatedConfig = await prisma.whatsAppGlobalConfig.update({
			where: { id: usuarioChatwit.configuracaoGlobalWhatsApp.id },
			data: updateData,
		});

		console.log(`[Global Credentials API] Configuração global atualizada: ${updatedConfig.id}`);

		return NextResponse.json({
			id: updatedConfig.id,
			whatsappApiKey: updatedConfig.whatsappApiKey ? "***" : null,
			phoneNumberId: updatedConfig.phoneNumberId,
			whatsappBusinessAccountId: updatedConfig.whatsappBusinessAccountId,
			graphApiBaseUrl: updatedConfig.graphApiBaseUrl,
			updatedAt: updatedConfig.updatedAt,
			hasCredentials: !!updatedConfig.whatsappApiKey,
		});
	} catch (error) {
		console.error("[Global Credentials API] Erro ao atualizar configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * DELETE - Remove configuração global do WhatsApp
 */
export async function DELETE(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			include: {
				configuracaoGlobalWhatsApp: true,
			},
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		if (!usuarioChatwit.configuracaoGlobalWhatsApp) {
			return NextResponse.json({ error: "Configuração global não encontrada" }, { status: 404 });
		}

		// Remover configuração global
		await prisma.whatsAppGlobalConfig.delete({
			where: { id: usuarioChatwit.configuracaoGlobalWhatsApp.id },
		});

		console.log(
			`[Global Credentials API] Configuração global removida: ${usuarioChatwit.configuracaoGlobalWhatsApp.id}`,
		);

		return NextResponse.json({ message: "Configuração global removida com sucesso" });
	} catch (error) {
		console.error("[Global Credentials API] Erro ao remover configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
