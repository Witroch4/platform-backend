import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

// Forçar ambiente Node (em vez de Edge)
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: any) {
	try {
		const session = await auth();

		if (!session || !session.user || !session.user.id) {
			return NextResponse.json({ error: "Não autorizado. Faça login para continuar." }, { status: 401 });
		}

		// Extrair params do context
		const { params } = context;
		const { accountId } = params || {};

		if (!accountId) {
			return NextResponse.json({ error: "ID da conta não fornecido" }, { status: 400 });
		}

		// Buscar a conta específica pelo providerAccountId
		const account = await prisma.account.findFirst({
			where: {
				providerAccountId: accountId,
				userId: session.user.id,
				provider: "instagram",
			},
			select: {
				id: true,
				providerAccountId: true,
				igUsername: true,
				igUserId: true,
				isMain: true,
				access_token: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!account) {
			return NextResponse.json({ error: "Conta não encontrada ou não pertence ao usuário" }, { status: 404 });
		}

		// Formatar a resposta
		return NextResponse.json({
			account: {
				id: account.id,
				providerAccountId: account.providerAccountId,
				username: account.igUsername || "Instagram",
				igUserId: account.igUserId || account.providerAccountId,
				isMain: account.isMain || false,
				hasValidToken: !!account.access_token,
				connectedSince: account.createdAt,
				lastUpdated: account.updatedAt,
			},
		});
	} catch (error) {
		console.error("Erro ao validar conta do Instagram:", error);
		return NextResponse.json({ error: "Ocorreu um erro ao validar a conta do Instagram" }, { status: 500 });
	}
}
