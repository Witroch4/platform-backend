import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		console.log("API de contas - Sessão:", session?.user?.id || "Não autenticado");

		if (!session?.user) {
			console.log("API de contas - Usuário não autenticado");
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		console.log("API de contas - Buscando contas para usuário:", session.user.id);

		const accounts = await getPrismaInstance().account.findMany({
			where: {
				userId: session.user.id,
				provider: "instagram",
			},
			select: {
				id: true,
				providerAccountId: true,
				access_token: true,
				igUsername: true,
				igUserId: true,
				isMain: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		console.log("API de contas - Contas encontradas:", accounts.length);

		const mappedAccounts = accounts.map((account) => ({
			id: account.id,
			providerAccountId: account.providerAccountId,
			access_token: account.access_token,
			igUsername: account.igUsername || null,
			igUserId: account.igUserId || null,
			isMain: account.isMain || false,
			createdAt: account.createdAt,
			updatedAt: account.updatedAt,
		}));

		// Retornar no formato esperado pelo frontend
		return NextResponse.json({ accounts: mappedAccounts });
	} catch (error) {
		console.error("Erro ao buscar contas do Instagram:", error);
		return NextResponse.json({ error: "Erro ao buscar contas do Instagram" }, { status: 500 });
	}
}
