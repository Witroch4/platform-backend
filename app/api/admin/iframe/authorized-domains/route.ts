import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";

// GET - Listar domínios autorizados
export async function GET(): Promise<NextResponse> {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	if (session.user.role !== "SUPERADMIN") {
		return NextResponse.json(
			{ error: "Acesso negado. Apenas SUPERADMIN pode gerenciar domínios autorizados." },
			{ status: 403 },
		);
	}

	try {
		const prisma = getPrismaInstance();

		const domains = await prisma.iframeAuthorizedDomain.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				user: {
					select: {
						name: true,
						email: true,
					},
				},
			},
		});

		return NextResponse.json({ domains });
	} catch (error) {
		console.error("Erro ao buscar domínios autorizados:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// POST - Adicionar novo domínio autorizado
export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	if (session.user.role !== "SUPERADMIN") {
		return NextResponse.json(
			{ error: "Acesso negado. Apenas SUPERADMIN pode gerenciar domínios autorizados." },
			{ status: 403 },
		);
	}

	try {
		const { domain, description } = await request.json();

		if (!domain) {
			return NextResponse.json({ error: "Domínio é obrigatório" }, { status: 400 });
		}

		// Validar formato do domínio
		try {
			new URL(domain);
		} catch {
			return NextResponse.json(
				{ error: "Formato de domínio inválido. Use formato completo: https://exemplo.com" },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();

		// Verificar se o domínio já existe
		const existingDomain = await prisma.iframeAuthorizedDomain.findUnique({
			where: { domain },
		});

		if (existingDomain) {
			return NextResponse.json({ error: "Este domínio já está cadastrado" }, { status: 409 });
		}

		const newDomain = await prisma.iframeAuthorizedDomain.create({
			data: {
				domain,
				description,
				createdBy: session.user.id,
			},
			include: {
				user: {
					select: {
						name: true,
						email: true,
					},
				},
			},
		});

		// Log da criação
		await prisma.auditLog.create({
			data: {
				userId: session.user.id,
				action: "iframe_domain_created",
				resourceType: "iframe_domain",
				resourceId: newDomain.id,
				details: {
					domain,
					description,
					timestamp: new Date().toISOString(),
				},
			},
		});

		return NextResponse.json({ domain: newDomain }, { status: 201 });
	} catch (error) {
		console.error("Erro ao criar domínio autorizado:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// PUT - Atualizar domínio autorizado
export async function PUT(request: NextRequest): Promise<NextResponse> {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	if (session.user.role !== "SUPERADMIN") {
		return NextResponse.json(
			{ error: "Acesso negado. Apenas SUPERADMIN pode gerenciar domínios autorizados." },
			{ status: 403 },
		);
	}

	try {
		const { id, domain, description, isActive } = await request.json();

		if (!id) {
			return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
		}

		const prisma = getPrismaInstance();

		const updatedDomain = await prisma.iframeAuthorizedDomain.update({
			where: { id },
			data: {
				...(domain && { domain }),
				...(description !== undefined && { description }),
				...(isActive !== undefined && { isActive }),
			},
			include: {
				user: {
					select: {
						name: true,
						email: true,
					},
				},
			},
		});

		// Log da atualização
		await prisma.auditLog.create({
			data: {
				userId: session.user.id,
				action: "iframe_domain_updated",
				resourceType: "iframe_domain",
				resourceId: id,
				details: {
					domainId: id,
					changes: { domain, description, isActive },
					timestamp: new Date().toISOString(),
				},
			},
		});

		return NextResponse.json({ domain: updatedDomain });
	} catch (error) {
		console.error("Erro ao atualizar domínio autorizado:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// DELETE - Remover domínio autorizado
export async function DELETE(request: NextRequest): Promise<NextResponse> {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	if (session.user.role !== "SUPERADMIN") {
		return NextResponse.json(
			{ error: "Acesso negado. Apenas SUPERADMIN pode gerenciar domínios autorizados." },
			{ status: 403 },
		);
	}

	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
		}

		const prisma = getPrismaInstance();

		const deletedDomain = await prisma.iframeAuthorizedDomain.delete({
			where: { id },
		});

		// Log da remoção
		await prisma.auditLog.create({
			data: {
				userId: session.user.id,
				action: "iframe_domain_deleted",
				resourceType: "iframe_domain",
				resourceId: id,
				details: {
					domain: deletedDomain.domain,
					timestamp: new Date().toISOString(),
				},
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Erro ao remover domínio autorizado:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
