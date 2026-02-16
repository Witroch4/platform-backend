import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";

// Use Node.js runtime instead of Edge to enable Prisma
export const runtime = "nodejs";

// GET - Listar espelhos da biblioteca
export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const usuarioId = url.searchParams.get("usuarioId");

		if (!usuarioId) {
			return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
		}

		const espelhos = await getPrismaInstance().espelhoBiblioteca.findMany({
			where: {
				criadoPorId: usuarioId,
				isAtivo: true,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		console.log(`[API Biblioteca] Encontrados ${espelhos.length} espelhos para usuário ${usuarioId}`);

		return NextResponse.json({
			success: true,
			espelhos: espelhos,
		});
	} catch (error: any) {
		console.error("[API Biblioteca] Erro ao buscar espelhos:", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}

// POST - Criar novo espelho na biblioteca
export async function POST(request: Request) {
	try {
		const payload = await request.json();
		const { nome, descricao, textoDOEspelho, espelhoCorrecao, usuarioId } = payload;

		console.log("[API Biblioteca] Payload recebido:", {
			nome,
			usuarioId,
			hasTexto: !!textoDOEspelho,
			hasImagens: !!espelhoCorrecao,
		});

		if (!nome || !usuarioId) {
			return NextResponse.json(
				{
					error: "Nome e ID do usuário são obrigatórios",
				},
				{ status: 400 },
			);
		}

		const novoEspelho = await getPrismaInstance().espelhoBiblioteca.create({
			data: {
				nome,
				descricao,
				textoDOEspelho,
				espelhoCorrecao,
				criadoPorId: usuarioId,
			},
		});

		console.log("[API Biblioteca] Espelho criado:", novoEspelho.id);

		return NextResponse.json({
			success: true,
			message: "Espelho adicionado à biblioteca com sucesso",
			espelho: novoEspelho,
		});
	} catch (error: any) {
		console.error("[API Biblioteca] Erro ao criar espelho:", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}

// PUT - Atualizar espelho da biblioteca
export async function PUT(request: Request) {
	try {
		const payload = await request.json();
		const { id, nome, descricao, textoDOEspelho, espelhoCorrecao, espelhoBibliotecaProcessado, aguardandoEspelho } =
			payload;

		if (!id) {
			return NextResponse.json({ error: "ID do espelho é obrigatório" }, { status: 400 });
		}

		const espelhoAtualizado = await getPrismaInstance().espelhoBiblioteca.update({
			where: { id },
			data: {
				...(nome && { nome }),
				...(descricao !== undefined && { descricao }),
				...(textoDOEspelho !== undefined && { textoDOEspelho }),
				...(espelhoCorrecao !== undefined && { espelhoCorrecao }),
				...(espelhoBibliotecaProcessado !== undefined && { espelhoBibliotecaProcessado }),
				...(aguardandoEspelho !== undefined && { aguardandoEspelho }),
				updatedAt: new Date(),
			},
		});

		console.log("[API Biblioteca] Espelho atualizado:", espelhoAtualizado.id);

		return NextResponse.json({
			success: true,
			message: "Espelho atualizado com sucesso",
			espelho: espelhoAtualizado,
		});
	} catch (error: any) {
		console.error("[API Biblioteca] Erro ao atualizar espelho:", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}

// DELETE - Remover espelho da biblioteca (soft delete)
export async function DELETE(request: Request) {
	try {
		const url = new URL(request.url);
		const espelhoId = url.searchParams.get("id");

		if (!espelhoId) {
			return NextResponse.json({ error: "ID do espelho é obrigatório" }, { status: 400 });
		}

		// Soft delete - marcar como inativo ao invés de deletar
		await getPrismaInstance().espelhoBiblioteca.update({
			where: { id: espelhoId },
			data: {
				isAtivo: false,
				updatedAt: new Date(),
			},
		});

		// Remover associações com leads
		await getPrismaInstance().leadOabData.updateMany({
			where: { espelhoBibliotecaId: espelhoId },
			data: { espelhoBibliotecaId: null },
		});

		console.log("[API Biblioteca] Espelho removido:", espelhoId);

		return NextResponse.json({
			success: true,
			message: "Espelho removido da biblioteca com sucesso",
		});
	} catch (error: any) {
		console.error("[API Biblioteca] Erro ao remover espelho:", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}
