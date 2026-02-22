import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runRecursoAgent } from "@/lib/oab-eval/recurso-generator-agent";
import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Você precisa estar autenticado." }, { status: 401 });
        }

        const body = await req.json();
        const { leadId, analiseValidada, dadosAdicionais, selectedProvider } = body;

        if (!leadId) {
            return NextResponse.json({ error: "O ID do lead é obrigatório." }, { status: 400 });
        }

        if (!analiseValidada) {
            return NextResponse.json({ error: "A análise validada é obrigatória para gerar o recurso." }, { status: 400 });
        }

        console.log(`[API Gerar Recurso Interno] Iniciando para Lead ID: ${leadId}`);

        // Dispara o agente Vercel AI SDK
        const result = await runRecursoAgent({
            leadId,
            analiseValidada,
            dadosAdicionais,
            selectedProvider,
            onProgress: async (msg: string) => {
                // Para feedback em tempo real no futuro, pode-se usar Server-Sent Events (SSE)
                console.log(`[Progress] ${msg}`);
            },
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Falha ao gerar o recurso." },
                { status: 500 }
            );
        }

        // Atualizar o banco de dados marcando que o recurso foi feito e salvando o rascunho.
        // Precisamos converter o leadId real e pegar a relation correta
        const leadOabData = await prisma.leadOabData.findFirst({
            where: { leadId: leadId }
        });

        if (leadOabData) {
            await prisma.leadOabData.update({
                where: { id: leadOabData.id },
                data: {
                    recursoPreliminar: result.recursoOutput || {},
                    aguardandoRecurso: false
                }
            });
        }

        return NextResponse.json({
            success: true,
            recursoOutput: result.recursoOutput,
            message: "Recurso gerado com sucesso."
        });

    } catch (error: any) {
        console.error("[API Gerar Recurso Interno] Falha capturada:", error);
        return NextResponse.json(
            { error: error?.message || "Ocorreu um erro interno ao gerar o recurso." },
            { status: 500 }
        );
    }
}
