import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getAvailableVisionModels, isGeminiAvailable } from "@/lib/oab-eval/unified-vision-client";

/**
 * GET /api/admin/ai-models
 * Retorna lista de modelos de IA disponíveis para Vision
 */
export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const models = getAvailableVisionModels();

	return NextResponse.json({
		success: true,
		data: {
			models,
			providers: {
				openai: true, // OpenAI sempre disponível (requer OPENAI_API_KEY)
				gemini: isGeminiAvailable(),
			},
			recommended: isGeminiAvailable() ? "gemini-3-pro-preview" : "gpt-4.1",
		},
	});
}
