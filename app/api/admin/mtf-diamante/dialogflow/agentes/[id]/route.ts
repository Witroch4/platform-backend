//app\api\admin\mtf-diamante\dialogflow\agentes\[id]\route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { auth } from "@/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;
		const body = await request.json();
		const { nome, projectId, credentials, region } = body;

		if (!id) {
			return NextResponse.json({ error: "ID do agente é obrigatório" }, { status: 400 });
		}

		// Medida de segurança: verificar se o agente pertence ao usuário logado
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado." }, { status: 404 });
		}

		const agenteExistente = await prisma.agenteDialogflow.findFirst({
			where: {
				id,
				usuarioChatwitId: usuarioChatwit.id,
			},
		});

		if (!agenteExistente) {
			return NextResponse.json({ error: "Agente não encontrado ou não pertence ao usuário" }, { status: 404 });
		}

		// Log para depuração do corpo da requisição
		console.log("Corpo recebido para atualização do agente:", body);

		// Construir objeto de atualização apenas com campos fornecidos que não sejam nulos nem indefinidos
		const dataToUpdate = Object.fromEntries(
			Object.entries({ nome, projectId, credentials, region }).filter(
				([_, value]) => value !== undefined && value !== null,
			),
		);

		// Se nada for enviado para atualização, retorna o agente existente sem fazer nada.
		if (Object.keys(dataToUpdate).length === 0) {
			return NextResponse.json({ message: "Nenhum dado fornecido para atualização.", agente: agenteExistente });
		}

		const updatedAgente = await prisma.agenteDialogflow.update({
			where: { id },
			data: dataToUpdate,
		});

		return NextResponse.json({ message: "Agente atualizado com sucesso", agente: updatedAgente });
	} catch (error: any) {
		console.error("Erro ao atualizar agente:", error);
		return NextResponse.json({ error: "Erro interno do servidor", details: error.message }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;

		if (!id) {
			return NextResponse.json({ error: "ID do agente é obrigatório" }, { status: 400 });
		}

		// Buscar o usuário Chatwit correspondente ao usuário logado
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Adicional: Verificar se o agente pertence ao usuário logado antes de deletar
		const agente = await prisma.agenteDialogflow.findFirst({
			where: {
				id,
				usuarioChatwitId: usuarioChatwit.id,
			},
		});

		if (!agente) {
			return NextResponse.json({ error: "Agente não encontrado ou não pertence ao usuário" }, { status: 404 });
		}

		await prisma.agenteDialogflow.delete({
			where: { id },
		});

		return NextResponse.json({ message: "Agente excluído com sucesso" });
	} catch (error: any) {
		console.error("Erro ao excluir agente:", error);
		return NextResponse.json({ error: "Erro interno do servidor", details: error.message }, { status: 500 });
	}
}
