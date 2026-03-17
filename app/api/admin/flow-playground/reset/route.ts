/**
 * Flow Playground — Reset (delete playground sessions)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	try {
		const prisma = getPrismaInstance();

		const deleted = await prisma.flowSession.deleteMany({
			where: {
				conversationId: { startsWith: "-" },
				contactId: "-1",
			},
		});

		return NextResponse.json({ success: true, deletedCount: deleted.count });
	} catch (error) {
		return NextResponse.json(
			{ error: "Erro ao resetar sessões", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
