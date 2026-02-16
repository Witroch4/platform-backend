import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { addFinalAnalysisJob } from "@/lib/queue/leads-chatwit.queue"; // Importa a função correta

// Define a estrutura do payload esperado
interface AnalysisPayload {
	leadId: string;
	manuscrito: any; // Defina o tipo correto
	espelho: any; // Defina o tipo correto
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const leadsToProcess: AnalysisPayload[] = body;

		if (!Array.isArray(leadsToProcess) || leadsToProcess.length === 0) {
			return new NextResponse("Dados inválidos", { status: 400 });
		}

		// Itera sobre cada lead e adiciona um job na fila para a análise final
		for (const leadData of leadsToProcess) {
			// Atualiza o BD com os dados do manuscrito e espelho
			await getPrismaInstance().leadOabData.update({
				where: { id: leadData.leadId },
				data: {
					// Salve os dados do manuscrito e espelho aqui, se necessário
					provaManuscrita: leadData.manuscrito,
					espelhoCorrecao: JSON.stringify(leadData.espelho?.imagens || []),
					textoDOEspelho: leadData.espelho,
				},
			});

			// Adiciona o job final de 'enviar para análise' na fila
			await addFinalAnalysisJob({
				leadId: leadData.leadId,
			});
		}

		return NextResponse.json(
			{ message: `${leadsToProcess.length} leads foram enfileirados para análise.` },
			{ status: 202 },
		);
	} catch (error) {
		console.error("[BATCH_SEND_FOR_ANALYSIS_ERROR]", error);
		return new NextResponse("Erro interno do servidor", { status: 500 });
	}
}
