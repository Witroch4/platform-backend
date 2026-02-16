import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

/**
 * GET - Buscar modelo de recurso
 */
export async function GET(request: Request): Promise<Response> {
	try {
		console.log("[Modelo Recurso] Buscando modelo de recurso");

		// Buscar modelo global ativo
		const modelo = await prisma.modeloRecurso.findFirst({
			where: { isGlobal: true },
			orderBy: { updatedAt: "desc" },
		});

		if (!modelo) {
			console.log("[Modelo Recurso] Nenhum modelo encontrado, retornando modelo padrão");
			return NextResponse.json({
				success: true,
				modelo: "Modelo de recurso não configurado. Configure um modelo primeiro.",
				isDefault: true,
			});
		}

		console.log("[Modelo Recurso] Modelo encontrado:", modelo.id);
		return NextResponse.json({
			success: true,
			modelo: modelo.texto,
			modeloId: modelo.id,
			isDefault: false,
		});
	} catch (error: any) {
		console.error("[Modelo Recurso] Erro ao buscar modelo:", error);
		return NextResponse.json(
			{
				error: error.message || "Erro interno ao buscar modelo de recurso",
			},
			{ status: 500 },
		);
	}
}

/**
 * POST - Salvar modelo de recurso
 */
export async function POST(request: Request): Promise<Response> {
	try {
		console.log("[Modelo Recurso] Salvando modelo de recurso");

		const { texto } = await request.json();

		if (!texto || texto.trim() === "") {
			return NextResponse.json({ error: "Texto do modelo é obrigatório" }, { status: 400 });
		}

		// Verificar se já existe um modelo global
		const modeloExistente = await prisma.modeloRecurso.findFirst({
			where: { isGlobal: true },
		});

		if (modeloExistente) {
			// Atualizar modelo existente
			const modeloAtualizado = await prisma.modeloRecurso.update({
				where: { id: modeloExistente.id },
				data: {
					texto: texto.trim(),
					updatedAt: new Date(),
				},
			});

			console.log("[Modelo Recurso] Modelo atualizado:", modeloAtualizado.id);
			return NextResponse.json({
				success: true,
				message: "Modelo de recurso atualizado com sucesso",
				modeloId: modeloAtualizado.id,
			});
		} else {
			// Criar novo modelo
			const novoModelo = await prisma.modeloRecurso.create({
				data: {
					texto: texto.trim(),
					isGlobal: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			console.log("[Modelo Recurso] Novo modelo criado:", novoModelo.id);
			return NextResponse.json({
				success: true,
				message: "Modelo de recurso criado com sucesso",
				modeloId: novoModelo.id,
			});
		}
	} catch (error: any) {
		console.error("[Modelo Recurso] Erro ao salvar modelo:", error);
		return NextResponse.json(
			{
				error: error.message || "Erro interno ao salvar modelo de recurso",
			},
			{ status: 500 },
		);
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
