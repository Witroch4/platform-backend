import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";

interface LoteOab {
	id: string;
	numero: number;
	nome: string;
	valor: string;
	dataInicio: string;
	dataFim: string;
	isActive: boolean;
}

// Helper function to ensure "R$" prefix in value
function normalizeValor(valor: string): string {
	if (!valor) return valor;
	const trimmedValor = valor.trim();
	// Check if already has R$ prefix (case insensitive)
	if (/^R\$\s*/i.test(trimmedValor)) {
		return trimmedValor;
	}
	// Add R$ prefix
	return `R$ ${trimmedValor}`;
}

// GET - Listar lotes
export async function GET() {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Buscar a configuração do MTF Diamante
		const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
			where: { userId: session.user.id },
			include: { variaveis: true },
		});

		if (!config) {
			return NextResponse.json({ success: true, data: [] });
		}

		// Buscar a variável que contém os lotes
		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");

		if (!lotesVariavel || !lotesVariavel.valor) {
			return NextResponse.json({ success: true, data: [] });
		}

		// Converter o JSON para array de lotes
		const lotes = Array.isArray(lotesVariavel.valor) ? (lotesVariavel.valor as unknown as any[]) : [];

		return NextResponse.json({ success: true, data: lotes });
	} catch (error) {
		console.error("Erro ao buscar lotes:", error);
		return NextResponse.json({ error: "Erro interno" }, { status: 500 });
	}
}

// POST - Criar novo lote
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { numero, nome, valor, dataInicio, dataFim } = body;

		// Validar campos obrigatórios
		if (!numero || !nome || !valor || !dataInicio || !dataFim) {
			return NextResponse.json({ error: "Campos obrigatórios não preenchidos" }, { status: 400 });
		}

		// Buscar ou criar a configuração do MTF Diamante
		let config = await getPrismaInstance().mtfDiamanteConfig.upsert({
			where: { userId: session.user.id },
			update: {},
			create: { userId: session.user.id },
			include: { variaveis: true },
		});

		// Buscar a variável existente de lotes ou criar uma nova
		let lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");

		// Obter lotes existentes
		let lotes: any[] = [];
		if (lotesVariavel && lotesVariavel.valor && Array.isArray(lotesVariavel.valor)) {
			lotes = lotesVariavel.valor as unknown as any[];
		}

		// Determinar se o novo lote deve ser ativo
		// Se não há lotes existentes, o primeiro será ativo
		// Se já existem lotes, o novo será inativo por padrão
		const isFirstLote = lotes.length === 0;

		// Normalizar valor para garantir prefixo R$
		const valorNormalizado = normalizeValor(valor);

		// Criar novo lote
		const novoLote: LoteOab = {
			id: `lote_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
			numero: parseInt(numero),
			nome,
			valor: valorNormalizado,
			dataInicio,
			dataFim,
			isActive: isFirstLote, // Apenas o primeiro lote é ativo por padrão
		};

		// Adicionar o novo lote ao array
		lotes.push(novoLote);

		// Atualizar ou criar a variável de lotes
		if (lotesVariavel) {
			await getPrismaInstance().mtfDiamanteVariavel.update({
				where: { id: lotesVariavel.id },
				data: { valor: lotes as any },
			});
		} else {
			await getPrismaInstance().mtfDiamanteVariavel.create({
				data: {
					configId: config.id,
					chave: "lotes_oab",
					valor: lotes as any,
				},
			});
		}

		// Invalidar cache das variáveis (incluindo lotes) - força reload das variáveis no frontend
		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redis = getRedisInstance();

			// Invalidar cache de variáveis para este usuário
			await redis.del(`mtf_variables:${session.user.id}`);
			await redis.del(`mtf_lotes:${session.user.id}`);

			console.log(`[MTF Lotes] Cache invalidado para usuário ${session.user.id} após criação de lote`);
		} catch (cacheError) {
			console.warn("[MTF Lotes] Erro ao invalidar cache:", cacheError);
			// Não falhar a operação por causa do cache
		}

		return NextResponse.json({
			success: true,
			data: novoLote,
			message: "Lote criado com sucesso",
		});
	} catch (error) {
		console.error("Erro ao criar lote:", error);
		return NextResponse.json({ error: "Erro interno" }, { status: 500 });
	}
}

// PUT - Atualizar lote
export async function PUT(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { id, numero, nome, valor, dataInicio, dataFim, isActive } = body;

		if (!id) {
			return NextResponse.json({ error: "ID do lote é obrigatório" }, { status: 400 });
		}

		// Buscar a configuração do MTF Diamante
		const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
			where: { userId: session.user.id },
			include: { variaveis: true },
		});

		if (!config) {
			return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 });
		}

		// Buscar a variável de lotes
		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");

		if (!lotesVariavel || !lotesVariavel.valor || !Array.isArray(lotesVariavel.valor)) {
			return NextResponse.json({ error: "Lotes não encontrados" }, { status: 404 });
		}

		// Encontrar e atualizar o lote
		const lotes: any[] = lotesVariavel.valor as unknown as any[];
		const loteIndex = lotes.findIndex((l: any) => l.id === id);

		if (loteIndex === -1) {
			return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
		}

		// Atualizar o lote
		lotes[loteIndex] = {
			...lotes[loteIndex],
			numero: numero !== undefined ? parseInt(numero) : lotes[loteIndex].numero,
			nome: nome || lotes[loteIndex].nome,
			valor: valor ? normalizeValor(valor) : lotes[loteIndex].valor,
			dataInicio: dataInicio || lotes[loteIndex].dataInicio,
			dataFim: dataFim || lotes[loteIndex].dataFim,
			isActive: isActive !== undefined ? isActive : lotes[loteIndex].isActive,
		};

		// Salvar as alterações
		await getPrismaInstance().mtfDiamanteVariavel.update({
			where: { id: lotesVariavel.id },
			data: { valor: lotes as any },
		});

		return NextResponse.json({
			success: true,
			data: lotes[loteIndex],
			message: "Lote atualizado com sucesso",
		});
	} catch (error) {
		console.error("Erro ao atualizar lote:", error);
		return NextResponse.json({ error: "Erro interno" }, { status: 500 });
	}
}

// DELETE - Deletar lote
export async function DELETE(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json({ error: "ID do lote é obrigatório" }, { status: 400 });
		}

		// Buscar a configuração do MTF Diamante
		const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
			where: { userId: session.user.id },
			include: { variaveis: true },
		});

		if (!config) {
			return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 });
		}

		// Buscar a variável de lotes
		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");

		if (!lotesVariavel || !lotesVariavel.valor || !Array.isArray(lotesVariavel.valor)) {
			return NextResponse.json({ error: "Lotes não encontrados" }, { status: 404 });
		}

		// Filtrar o lote a ser removido
		const lotes: any[] = (lotesVariavel.valor as unknown as any[]).filter((l: any) => l.id !== id);

		// Salvar as alterações
		await getPrismaInstance().mtfDiamanteVariavel.update({
			where: { id: lotesVariavel.id },
			data: { valor: lotes as any },
		});

		return NextResponse.json({
			success: true,
			message: "Lote removido com sucesso",
		});
	} catch (error) {
		console.error("Erro ao remover lote:", error);
		return NextResponse.json({ error: "Erro interno" }, { status: 500 });
	}
}
