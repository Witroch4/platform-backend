import { openai } from "./openai-client";
import type { ExtractedPage } from "./types";

interface ImagePayload {
  base64: string;
  mimeType?: string;
  page?: number;
  label?: string;
}

const DEFAULT_VISION_MODEL = process.env.OAB_EVAL_VISION_MODEL ?? "gpt-4o-mini";

export async function transcribeExamImages(images: ImagePayload[]): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];

  for (let idx = 0; idx < images.length; idx += 1) {
    const current = images[idx];
    const base64 = current.base64.split(",").pop() ?? current.base64;
    const imageUrl = `data:${current.mimeType ?? "image/png"};base64,${base64}`;

    const res = await openai.chat.completions.create({
      model: DEFAULT_VISION_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Você é um assistente jurídico especializado em transcrever provas manuscritas com fidelidade. Retorne somente o texto legível, seguindo a ordem original. Mantenha marcações relevantes como títulos e numeração de questões.".
            replace(/\s+/g, " "),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva integralmente o texto presente nesta página de prova." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 1800,
    });

    const text = res.choices[0]?.message?.content ?? "";
    pages.push({
      page: current.page ?? idx + 1,
      text: text.trim(),
      imageKey: current.label,
    });
  }

  return pages;
}
