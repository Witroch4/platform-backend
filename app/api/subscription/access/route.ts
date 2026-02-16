// app/api/subscription/access/route.ts
import { NextResponse } from "next/server";
import { checkSubscriptionAccess } from "@/lib/subscription-access";

export async function GET() {
	try {
		const accessInfo = await checkSubscriptionAccess();

		return NextResponse.json({
			success: true,
			...accessInfo,
		});
	} catch (error) {
		console.error("Erro ao verificar acesso de assinatura:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Erro interno do servidor",
				hasAccess: false,
				reason: "no_access",
			},
			{ status: 500 },
		);
	}
}
