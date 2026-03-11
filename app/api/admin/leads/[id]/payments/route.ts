// app/api/admin/leads/[id]/payments/route.ts
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

const prisma = getPrismaInstance();

const VALID_SERVICE_TYPES = Object.values(PaymentServiceType);
const VALID_STATUSES = Object.values(PaymentStatus);

/**
 * GET - Lista pagamentos de um lead
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { id } = await params;

	// Verify lead belongs to user
	const lead = await prisma.lead.findFirst({
		where: { id, userId: session.user.id },
		select: { id: true },
	});
	if (!lead) {
		return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
	}

	const payments = await prisma.leadPayment.findMany({
		where: { leadId: id },
		orderBy: { createdAt: "desc" },
	});

	// Summary
	const confirmed = payments.filter((p) => p.status === "CONFIRMED");
	const totalPaidCents = confirmed.reduce((sum, p) => sum + (p.paidAmountCents ?? p.amountCents), 0);
	const hasPending = payments.some((p) => p.status === "PENDING");

	return NextResponse.json({
		payments,
		summary: {
			count: payments.length,
			confirmedCount: confirmed.length,
			totalPaidCents,
			hasPending,
		},
	});
}

/**
 * POST - Registrar pagamento manualmente
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { id } = await params;

	// Verify lead belongs to user
	const lead = await prisma.lead.findFirst({
		where: { id, userId: session.user.id },
		select: { id: true, tags: true },
	});
	if (!lead) {
		return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
	}

	const body = await request.json();
	const { amountCents, serviceType, captureMethod, description, status } = body;

	if (!amountCents || typeof amountCents !== "number" || amountCents <= 0) {
		return NextResponse.json({ error: "amountCents é obrigatório e deve ser positivo" }, { status: 400 });
	}

	if (serviceType && !VALID_SERVICE_TYPES.includes(serviceType)) {
		return NextResponse.json({ error: `serviceType inválido. Válidos: ${VALID_SERVICE_TYPES.join(", ")}` }, { status: 400 });
	}

	const paymentStatus = status && VALID_STATUSES.includes(status) ? status : PaymentStatus.CONFIRMED;

	const payment = await prisma.leadPayment.create({
		data: {
			leadId: id,
			amountCents,
			paidAmountCents: paymentStatus === PaymentStatus.CONFIRMED ? amountCents : null,
			serviceType: serviceType || PaymentServiceType.OUTRO,
			status: paymentStatus,
			captureMethod: captureMethod || "manual",
			description: description || null,
			confirmedAt: paymentStatus === PaymentStatus.CONFIRMED ? new Date() : null,
			confirmedBy: session.user.id,
		},
	});

	// Auto-tag
	const paymentTag = "pago";
	if (paymentStatus === PaymentStatus.CONFIRMED && !lead.tags.includes(paymentTag)) {
		await prisma.lead.update({
			where: { id },
			data: { tags: { push: paymentTag } },
		});
	}

	return NextResponse.json({ payment }, { status: 201 });
}
