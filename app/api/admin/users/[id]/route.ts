import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { TurboModeAccessService } from "@/lib/turbo-mode/user-access-service";
import { FlashIntentChecker } from "@/lib/resposta-rapida/flash-intent-checker";

const prisma = getPrismaInstance();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Verificar se é SUPERADMIN
		const currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
		});

		if (currentUser?.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode visualizar dados de usuários." },
				{ status: 403 },
			);
		}

		const { id } = await params;

		// Buscar o usuário
		const user = await prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				turboModeEnabled: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!user) {
			return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
		}

		// Usar o TurboModeAccessService (mesmo padrão da página principal)
		const turboModeEnabled = await TurboModeAccessService.hasAccess(id);
		const turboModeActivatedAt = null; // Não temos mais registro de quando foi ativado
		const turboModeUpdatedAt = user.updatedAt;

		// Usar o FlashIntentChecker (mesmo padrão da página principal)
		const flashIntentChecker = FlashIntentChecker.getInstance();
		const flashIntentEnabled = await flashIntentChecker.isFlashIntentEnabledForUser(id);

		return NextResponse.json({
			user: {
				...user,
				turboModeEnabled,
				flashIntentEnabled,
				turboModeActivatedAt,
				turboModeUpdatedAt,
				createdAt: user.createdAt.toISOString(),
				updatedAt: user.updatedAt.toISOString(),
			},
		});
	} catch (error) {
		console.error("Erro ao buscar dados do usuário:", error);
		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}
