import { openai } from "./openai-client";
import type { ExtractedPage } from "./types";

interface ImagePayload {
	base64: string;
	mimeType?: string;
	page?: number;
	label?: string;
}

const DEFAULT_VISION_MODEL = process.env.OAB_EVAL_VISION_MODEL ?? "gpt-4.1";

function extractOutputText(response: unknown): string {
	const outputText = (response as any)?.output_text;
	if (typeof outputText === "string" && outputText.trim()) {
		return outputText.trim();
	}

	const outputItems = (response as any)?.output;
	if (Array.isArray(outputItems)) {
		const texts: string[] = [];
		for (const item of outputItems) {
			const content = (item as any)?.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					const text = (part as any)?.text;
					if (typeof text === "string" && text.trim()) {
						texts.push(text.trim());
					}
				}
			} else {
				const text = (item as any)?.text;
				if (typeof text === "string" && text.trim()) {
					texts.push(text.trim());
				}
			}
		}
		return texts.join("\n").trim();
	}

	return "";
}

export async function transcribeExamImages(images: ImagePayload[]): Promise<ExtractedPage[]> {
	const pages: ExtractedPage[] = [];

	for (let idx = 0; idx < images.length; idx += 1) {
		const current = images[idx];
		const base64 = current.base64.split(",").pop() ?? current.base64;
		const imageUrl = `data:${current.mimeType ?? "image/png"};base64,${base64}`;

		const res = await openai.responses.create({
			model: DEFAULT_VISION_MODEL,
			max_output_tokens: 5000,
			instructions:
				"Você é um assistente jurídico especializado em transcrever provas manuscritas com fidelidade. Retorne somente o texto legível, seguindo a ordem original. Mantenha marcações relevantes como títulos e numeração de questões.",
			input: [
				{
					role: "user",
					content: [
						{ type: "input_text", text: "Transcreva integralmente o texto presente nesta página de prova." },
						{ type: "input_image", image_url: imageUrl, detail: "high" },
					],
				},
			],
		});

		const text = extractOutputText(res);
		pages.push({
			page: current.page ?? idx + 1,
			text: text.trim(),
			imageKey: current.label,
		});
	}

	return pages;
}
