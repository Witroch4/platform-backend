// app/api/admin/leads/[id]/payments/[paymentId]/route.ts
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

const prisma = getPrismaInstance();

const VALID_SERVICE_TYPES = Object.values(PaymentServiceType);
const VALID_STATUSES = Object.values(PaymentStatus);

/**
 * PATCH - Atualizar status/detalhes de um pagamento
 */
export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string; paymentId: string }> },
): Promise<Response> {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { id, paymentId } = await params;

	// Verify lead belongs to user
	const lead = await prisma.lead.findFirst({
		where: { id, userId: session.user.id },
		select: { id: true },
	});
	if (!lead) {
		return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
	}

	const existing = await prisma.leadPayment.findFirst({
		where: { id: paymentId, leadId: id },
	});
	if (!existing) {
		return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
	}

	const body = await request.json();
	const updateData: Record<string, unknown> = {};

	if (body.status && VALID_STATUSES.includes(body.status)) {
		updateData.status = body.status;
		if (body.status === PaymentStatus.CONFIRMED && !existing.confirmedAt) {
			updateData.confirmedAt = new Date();
			updateData.confirmedBy = session.user.id;
			updateData.paidAmountCents = existing.amountCents;
		}
	}
	if (body.serviceType && VALID_SERVICE_TYPES.includes(body.serviceType)) {
		updateData.serviceType = body.serviceType;
	}
	if (body.description !== undefined) {
		updateData.description = body.description;
	}
	if (body.amountCents && typeof body.amountCents === "number" && body.amountCents > 0) {
		updateData.amountCents = body.amountCents;
	}

	const payment = await prisma.leadPayment.update({
		where: { id: paymentId },
		data: updateData,
	});

	return NextResponse.json({ payment });
}

/**
 * DELETE - Remover pagamento
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string; paymentId: string }> },
): Promise<Response> {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { id, paymentId } = await params;

	// Verify lead belongs to user
	const lead = await prisma.lead.findFirst({
		where: { id, userId: session.user.id },
		select: { id: true },
	});
	if (!lead) {
		return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
	}

	const existing = await prisma.leadPayment.findFirst({
		where: { id: paymentId, leadId: id },
	});
	if (!existing) {
		return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
	}

	await prisma.leadPayment.delete({ where: { id: paymentId } });

	return NextResponse.json({ ok: true });
}
