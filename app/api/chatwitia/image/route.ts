import { NextResponse } from "next/server";
import { openaiService } from "@/services/openai";

export async function POST(req: Request) {
	try {
		const {
			prompt,
			model = "gpt-image-1",
			size = "auto",
			quality = "auto",
			background = "auto",
			n = 1,
		} = await req.json();

		if (!prompt) {
			return NextResponse.json({ error: "Prompt é obrigatório" }, { status: 400 });
		}

		console.log(`Gerando imagem: "${prompt.substring(0, 50)}..." com modelo ${model}`);

		// Usar a nova implementação com Responses API para modelos compatíveis
		const imageCompatibleModels = ["gpt-image-1", "dall-e-3", "dall-e-2"];

		if (imageCompatibleModels.includes(model)) {
			// Usar a nova implementação direta com image generation
			const result = await openaiService.generateImage(prompt, {
				model: model as any,
				size: size === "auto" ? "auto" : (size as any),
				quality: quality === "auto" ? "auto" : (quality as any),
				background: background === "auto" ? "auto" : (background as any),
				n,
				response_format: "b64_json",
			});

			console.log("Imagem gerada com sucesso");

			return NextResponse.json({
				success: true,
				data: result.data || [],
			});
		} else {
			return NextResponse.json({ error: `Modelo ${model} não suportado para geração de imagens` }, { status: 400 });
		}
	} catch (error: any) {
		console.error("Erro ao gerar imagem:", error);

		return NextResponse.json(
			{
				error: "Erro ao gerar imagem",
				details: error.message || "Erro desconhecido",
			},
			{ status: 500 },
		);
	}
}

export async function GET() {
	return NextResponse.json({
		message: "Endpoint para geração de imagem",
		methods: ["POST"],
		models_supported: ["gpt-image-1", "dall-e-3", "dall-e-2"],
		sizes_supported: ["1024x1024", "1024x1536", "1536x1024"],
		qualities_supported: ["low", "medium", "high", "auto"],
		backgrounds_supported: ["auto", "transparent", "opaque"],
	});
}
