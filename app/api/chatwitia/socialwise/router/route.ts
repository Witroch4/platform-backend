import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { openaiService } from "@/services/openai";

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { userText, agent } = await request.json();

		if (!userText || !agent) {
			return NextResponse.json(
				{ error: "Parâmetros inválidos. Esperado: userText (string) e agent (object)." },
				{ status: 400 },
			);
		}

		const result = await openaiService.routerLLM(userText, agent);

		return NextResponse.json(result);
	} catch (error) {
		console.error("Erro no Router LLM:", error);
		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}
