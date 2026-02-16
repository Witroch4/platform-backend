import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
	try {
		const {
			prompt = "Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape",
		} = await req.json();

		console.log(`Testando geração de imagem com streaming: "${prompt.substring(0, 50)}..."`);

		// Configurar a stream para retornar os dados de volta ao cliente
		const stream = new TransformStream();
		const writer = stream.writable.getWriter();
		const encoder = new TextEncoder();

		// Iniciar o processamento em segundo plano
		(async () => {
			try {
				console.log("Iniciando teste de streaming de imagem...");

				const streamResponse = await openai.responses.create({
					model: "gpt-4.1-mini",
					input: prompt,
					stream: true,
					tools: [
						{
							type: "image_generation",
							quality: "high",
							size: "auto",
							background: "auto",
							partial_images: 2,
						},
					],
				} as any);

				console.log("Stream iniciado, processando eventos...");

				// Processar cada evento do stream
				for await (const event of streamResponse as unknown as AsyncIterable<any>) {
					console.log(`Evento de teste recebido: ${event.type}`);

					if (event.type === "response.output_text.delta") {
						const textDelta = event.delta || "";

						const message = JSON.stringify({
							type: "chunk",
							content: textDelta,
						});

						await writer.write(encoder.encode(message + "\n"));
					} else if (event.type === "response.image_generation_call.started") {
						console.log("Teste: Geração de imagem iniciada");

						const statusMessage = JSON.stringify({
							type: "image_generation_started",
							message: "Teste: Gerando imagem...",
						});

						await writer.write(encoder.encode(statusMessage + "\n"));
					} else if (event.type === "response.image_generation_call.partial_image") {
						console.log(`Teste: Imagem parcial recebida - índice ${event.partial_image_index}`);

						const partialImageMessage = JSON.stringify({
							type: "partial_image",
							image_data: event.partial_image_b64,
							index: event.partial_image_index,
							test: true,
						});

						await writer.write(encoder.encode(partialImageMessage + "\n"));
					} else if (event.type === "response.image_generation_call.completed") {
						console.log("Teste: Geração de imagem completa");

						const imageMessage = JSON.stringify({
							type: "image_generated",
							image_data: event.result,
							revised_prompt: event.revised_prompt,
							image_id: event.id,
							test: true,
						});

						await writer.write(encoder.encode(imageMessage + "\n"));
					} else if (event.type === "response.completed") {
						console.log("Teste: Resposta completa");

						const doneMessage = JSON.stringify({
							type: "done",
							test: true,
							message: "Teste de streaming de imagem concluído",
						});

						await writer.write(encoder.encode(doneMessage + "\n"));
						await writer.close();
						return;
					} else if (event.type === "response.failed") {
						console.error("Teste: Falha na resposta:", event.response?.error);
						throw new Error(event.response?.error?.message || "Falha no teste de streaming");
					}
				}

				// Fallback se não recebemos evento de conclusão
				const doneMessage = JSON.stringify({
					type: "done",
					test: true,
					message: "Teste finalizado sem evento de conclusão",
				});

				await writer.write(encoder.encode(doneMessage + "\n"));
				await writer.close();
			} catch (error) {
				console.error("Erro no teste de streaming de imagem:", error);

				const errorMsg = JSON.stringify({
					type: "error",
					error: error instanceof Error ? error.message : "Erro desconhecido no teste",
					test: true,
				});

				await writer.write(encoder.encode(errorMsg + "\n"));
				await writer.close();
			}
		})();

		// Retornar a stream para o cliente
		return new Response(stream.readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error: any) {
		console.error("Erro no endpoint de teste:", error);

		return NextResponse.json(
			{
				error: "Erro no teste de streaming de imagem",
				details: error.message || "Erro desconhecido",
			},
			{ status: 500 },
		);
	}
}

export async function GET() {
	return NextResponse.json({
		message: "Endpoint de teste para streaming de imagens",
		methods: ["POST"],
		description: "Testa o streaming de imagens com partial_images usando a Responses API",
		models_supported: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
		features: ["partial_images", "streaming", "image_generation"],
	});
}
