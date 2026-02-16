//\app\api\automacao\route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { v4 as uuidv4 } from "uuid";

// Forçar o uso do runtime NodeJS (em vez do Edge)
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Pegar o providerAccountId da URL
		const { searchParams } = new URL(req.url);
		const providerAccountId = searchParams.get("providerAccountId");

		if (!providerAccountId) {
			return NextResponse.json({ error: "providerAccountId é obrigatório." }, { status: 400 });
		}

		// Buscar a conta usando o providerAccountId
		const account = await getPrismaInstance().account.findFirst({
			where: {
				providerAccountId: providerAccountId,
				userId: session.user.id,
				provider: "instagram",
			},
			select: {
				id: true,
				access_token: true,
			},
		});

		if (!account) {
			return NextResponse.json({ error: "Conta não encontrada ou não pertence ao usuário." }, { status: 404 });
		}

		// Buscar automações filtradas por accountId
		const automacoes = await getPrismaInstance().automacao.findMany({
			where: {
				userId: session.user.id,
				accountId: account.id,
			},
			orderBy: { createdAt: "desc" },
			include: {
				account: {
					select: {
						access_token: true,
					},
				},
			},
		});

		// Mapear as automações para incluir o token
		const automacoesMapeadas = automacoes.map((automacao) => ({
			...automacao,
			access_token: automacao.account?.access_token || null,
		}));

		return NextResponse.json(automacoesMapeadas, { status: 200 });
	} catch (error: any) {
		console.error("[GET /api/automacao] Erro:", error);
		return NextResponse.json({ error: "Erro ao buscar automações." }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const body = await request.json();

		// Pegar o providerAccountId da URL
		const { searchParams } = new URL(request.url);
		const providerAccountId = searchParams.get("providerAccountId");

		if (!providerAccountId) {
			return NextResponse.json({ error: "providerAccountId é obrigatório." }, { status: 400 });
		}

		// Buscar a conta usando o providerAccountId
		const account = await getPrismaInstance().account.findFirst({
			where: {
				providerAccountId: providerAccountId,
				userId: session.user.id,
				provider: "instagram",
			},
			select: {
				id: true,
				access_token: true,
			},
		});

		if (!account) {
			return NextResponse.json({ error: "Conta não encontrada ou não pertence ao usuário." }, { status: 404 });
		}

		// Extrair dados do body
		const {
			selectedMediaId,
			anyMediaSelected,
			anyword = true,
			palavrasChave,
			fraseBoasVindas,
			publicReply,
			live = true,
			folderId,
		} = body;

		// Criar a automação com o accountId correto
		const automacao = await getPrismaInstance().automacao.create({
			data: {
				userId: session.user.id,
				accountId: account.id,
				selectedMediaId: selectedMediaId || null,
				anyMediaSelected: Boolean(anyMediaSelected),
				anyword,
				palavrasChave: anyword ? null : palavrasChave,
				fraseBoasVindas: fraseBoasVindas || null,
				publicReply: publicReply || null,
				live: Boolean(live),
				buttonPayload: `WIT-EQ:${uuidv4()}`,
				folderId: folderId || null,
			},
			include: {
				account: {
					select: {
						access_token: true,
					},
				},
			},
		});

		// Retornar a automação com o token
		return NextResponse.json(
			{
				...automacao,
				access_token: automacao.account?.access_token || null,
			},
			{ status: 201 },
		);
	} catch (error: any) {
		console.error("[POST /api/automacao] Erro:", error);
		return NextResponse.json({ error: "Erro ao criar automação: " + error.message }, { status: 500 });
	}
}
