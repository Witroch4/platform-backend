//app\auth\instagram\accounts\route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

// Forçar ambiente Node
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const accounts = await prisma.account.findMany({
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

		return NextResponse.json(mappedAccounts);
	} catch (error) {
		console.error("Erro ao buscar contas do Instagram:", error);
		return NextResponse.json({ error: "Erro ao buscar contas do Instagram" }, { status: 500 });
	}
}
