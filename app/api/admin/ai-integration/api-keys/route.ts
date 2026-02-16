import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import crypto from "crypto";

const prisma = getPrismaInstance();

function generateToken(): { token: string; prefix: string; suffix: string; hash: string } {
	const raw = `sk_${crypto.randomBytes(32).toString("hex")}`; // ex: sk_...
	const prefix = raw.slice(0, 16);
	const suffix = raw.slice(-16);
	const hash = crypto.createHash("sha256").update(raw).digest("hex");
	return { token: raw, prefix, suffix, hash };
}

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	const keys = await prisma.apiKey.findMany({
		where: { ownerId: session.user.id },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			label: true,
			active: true,
			createdAt: true,
			revokedAt: true,
			lastUsedAt: true,
			tokenPrefix: true,
			tokenSuffix: true,
		},
	});

	return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}) as any);
	const label = typeof body?.label === "string" ? body.label.slice(0, 64) : null;

	const { token, prefix, suffix, hash } = generateToken();

	// Garantir que exista um registro em User com o ID da sessão
	const appUserId = session.user.id;
	const userEmail = (session.user as any)?.email as string | undefined;
	const userName = session.user.name || undefined;

	// Resolvemos o ID efetivo do usuário que será o dono da chave
	let effectiveUserId = appUserId;
	const existingUser = await prisma.user.findUnique({ where: { id: appUserId } });
	if (!existingUser) {
		// Tentar casar por email antes de criar com o id da sessão
		if (userEmail) {
			const byEmail = await prisma.user.findUnique({ where: { email: userEmail } });
			if (byEmail) {
				effectiveUserId = byEmail.id;
			} else {
				// criar usuário com o id da sessão para manter consistência com outros módulos
				await prisma.user.create({
					data: {
						id: appUserId,
						email: userEmail,
						name: userName,
					},
				});
			}
		} else {
			// Sem email na sessão: criar usuário sintético com email derivado
			const syntheticEmail = `${appUserId}@local.invalid`;
			await prisma.user.create({
				data: {
					id: appUserId,
					email: syntheticEmail,
					name: userName,
				},
			});
		}
	}

	const created = await prisma.apiKey.create({
		data: {
			ownerId: effectiveUserId,
			label,
			tokenHash: hash,
			tokenPrefix: prefix,
			tokenSuffix: suffix,
			active: true,
		},
		select: { id: true, label: true, active: true, createdAt: true, tokenPrefix: true, tokenSuffix: true },
	});

	return NextResponse.json({ key: created, token }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) return NextResponse.json({ error: "Parâmetro id é obrigatório" }, { status: 400 });

	const key = await prisma.apiKey.findUnique({ where: { id } });
	if (!key || key.ownerId !== session.user.id) {
		return NextResponse.json({ error: "Chave não encontrada" }, { status: 404 });
	}

	await prisma.apiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
	return NextResponse.json({ ok: true });
}
