import { NextResponse } from "next/server";
import { openaiService } from "@/services/openai";
import { auth } from "@/auth";

export async function GET() {
	try {
		// Opcionalmente verificar autenticação
		const session = await auth();

		// Verificar conexão com OpenAI API
		console.log("Verificando conexão com OpenAI API");
		const openaiCheck = await openaiService.checkApiConnection();

		return NextResponse.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			api_version: "1.0.0",
			services: {
				openai: openaiCheck,
			},
		});
	} catch (error) {
		console.error("Erro no health check:", error);
		return NextResponse.json(
			{
				status: "error",
				message: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
