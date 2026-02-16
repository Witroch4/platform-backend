import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
/**
 * Handler da rota PUT para atualizar a especialidade de um lead.
 */
export async function PUT(request: Request): Promise<Response> {
	try {
		const { leadId, especialidade, espelhoPadraoId } = await request.json();

		if (!leadId) {
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		console.log(
			`[Atualizar Especialidade] Atualizando lead ${leadId} com especialidade: ${especialidade}, espelhoPadraoId: ${espelhoPadraoId}`,
		);

		// Atualizar a especialidade e espelhoPadraoId do lead
		const updatedLead = await prisma.leadOabData.update({
			where: { id: leadId },
			data: {
				especialidade: especialidade || null,
				espelhoPadraoId: espelhoPadraoId || null,
			},
		});

		console.log(`[Atualizar Especialidade] Lead atualizado com sucesso: ${leadId}`);

		return NextResponse.json({
			success: true,
			message: "Especialidade e espelho padrão atualizados com sucesso",
			lead: updatedLead,
		});
	} catch (error: any) {
		console.error("[Atualizar Especialidade] Erro:", error);
		return NextResponse.json({ error: error.message || "Erro interno do servidor" }, { status: 500 });
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
