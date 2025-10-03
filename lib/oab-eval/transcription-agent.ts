import { z } from "zod";
import { openai } from "./openai-client";
import { getOabEvalConfig } from "@/lib/config";
import { getPrismaInstance } from "@/lib/connections";
import type { ExtractedPage } from "./types";

interface ManuscriptImageDescriptor {
  id: string;
  url: string;
  nome?: string;
  page?: number;
}

interface TranscriptionSegment {
  output: string;
}

const PreparedImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  nome: z.string().optional(),
  page: z.number().optional(),
  base64: z.string(),
  mimeType: z.string().optional(),
});

type PreparedImageState = z.infer<typeof PreparedImageSchema>;

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

function splitSegments(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const results: string[] = [];
  let buffer: string[] = [];
  const markerRegex = /^(Quest[ãa]o:\s*\d+|Peça\s+P[aá]gina:\s*\d+)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (markerRegex.test(trimmed)) {
      if (buffer.length > 0) {
        results.push(buffer.join("\n").trim());
        buffer = [];
      }
    }

    if (buffer.length === 0 && !trimmed) {
      continue;
    }

    buffer.push(line);
  }

  if (buffer.length > 0) {
    results.push(buffer.join("\n").trim());
  }

  return results.length > 0 ? results : [text];
}

function organizeSegments(segments: string[]): TranscriptionSegment[] {
  const questions: Array<{ num: number; output: string }> = [];
  const pages: Array<{ page: number; output: string }> = [];
  const others: Array<{ output: string; index: number }> = [];

  segments.forEach((segment, index) => {
    const trimmed = segment.trim();
    if (!trimmed) return;

    const questionMatch = trimmed.match(/^Quest[ãa]o:\s*(\d+)/i);
    if (questionMatch) {
      questions.push({ num: Number.parseInt(questionMatch[1], 10), output: trimmed });
      return;
    }

    const pageMatch = trimmed.match(/^Peça\s+P[aá]gina:\s*(\d+)/i);
    if (pageMatch) {
      pages.push({ page: Number.parseInt(pageMatch[1], 10), output: trimmed });
      return;
    }

    others.push({ output: trimmed, index });
  });

  questions.sort((a, b) => a.num - b.num);
  pages.sort((a, b) => a.page - b.page);
  others.sort((a, b) => a.index - b.index);

  return [
    ...questions.map((item) => ({ output: item.output })),
    ...pages.map((item) => ({ output: item.output })),
    ...others.map((item) => ({ output: item.output })),
  ];
}

async function transcribeSingleImage(
  image: PreparedImageState,
  page: number,
  total: number,
  model: string,
  systemInstructions: string,
  maxOutputTokens: number,
): Promise<string> {
  const imageUrl = `data:${image.mimeType ?? "image/png"};base64,${image.base64}`;

  const userPrompt = [
    `Transcreva a página ${page} de ${total}. Formato obrigatório:`,
    "Questão: <número> (quando aplicável) OU Peça Pagina: <número/total se visível>",
    "Resposta do Aluno:",
    "Linha 1: ...",
    "Linha 2: ...",
    "Linha 3: ...",
    "(continue até o fim da página).",
    "Se houver mais de um bloco (ex: Questão e Peça na mesma página), inicie um novo cabeçalho para cada bloco.",
  ].join("\n");

  const response = await openai.responses.create({
    model,
    instructions: systemInstructions,
    max_output_tokens: maxOutputTokens,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      },
    ],
  });

  return extractOutputText(response);
}

async function fetchImageAsBase64(descriptor: ManuscriptImageDescriptor): Promise<PreparedImageState> {
  const { url } = descriptor;
  if (!url) {
    throw new Error("URL da imagem do manuscrito ausente");
  }

  if (url.startsWith("data:")) {
    const [meta, data] = url.split(",");
    const mimeMatch = meta.match(/data:([^;]+);base64/);
    return {
      ...descriptor,
      base64: data ?? "",
      mimeType: mimeMatch?.[1],
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem do manuscrito (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = response.headers.get("content-type") ?? undefined;

  return {
    ...descriptor,
    base64,
    mimeType: contentType,
  };
}

export interface TranscriptionAgentInput {
  leadId: string;
  images: ManuscriptImageDescriptor[];
  telefone?: string;
  nome?: string;
}

export interface TranscriptionAgentOutput {
  pages: ExtractedPage[];
  textoDAprova: TranscriptionSegment[];
  combinedText: string;
  segments: string[];
}

export async function transcribeManuscriptLocally(input: TranscriptionAgentInput): Promise<TranscriptionAgentOutput> {
  console.log(
    `[TranscriptionAgent] Iniciando digitação local para lead ${input.leadId} com ${input.images.length} imagens`,
  );

  const preparedImages: PreparedImageState[] = [];
  for (const image of input.images) {
    const prepared = await fetchImageAsBase64(image);
    preparedImages.push(PreparedImageSchema.parse(prepared));
  }

  const total = preparedImages.length;
  const { transcribe_concurrency = 10 } = getOabEvalConfig();
  const concurrency = Math.max(1, transcribe_concurrency || 10);
  console.log(`[TranscriptionAgent] ⚙️ Concurrency: ${concurrency}`);

  async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let rejected: any = null;

    async function worker() {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length || rejected) break;
        try {
          results[current] = await fn(items[current], current);
        } catch (err) {
          rejected = err;
          break;
        }
      }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    if (rejected) throw rejected;
    return results;
  }

  const { model, systemInstructions, maxOutputTokens } = await getTranscriberConfig();

  const results = await mapConcurrent(preparedImages, concurrency, async (image, index) => {
    const pageNumber = image.page ?? index + 1;
    console.log(
      `[TranscriptionAgent] 🖼️ Processando página ${index + 1}/${total} (page label: ${pageNumber})`,
    );
    const text = await transcribeSingleImage(image, pageNumber, total, model, systemInstructions, maxOutputTokens);
    const trimmed = text.trim();
    const newSegments = splitSegments(trimmed);
    return {
      index,
      pageNumber,
      imageId: image.id,
      text: trimmed,
      segments: newSegments,
    };
  });
  // Ordenar por pageNumber para manter consistência
  results.sort((a, b) => a.pageNumber - b.pageNumber);

  const pages: ExtractedPage[] = results.map((r) => ({
    page: r.pageNumber,
    text: r.text,
    imageKey: r.imageId,
  }));
  const segments: string[] = results.flatMap((r) => r.segments);

  const textoDAprova = organizeSegments(segments);
  const combinedText = pages
    .map((page) => `[[PÁGINA ${page.page}]]\n${page.text}`.trim())
    .join("\n\n");

  console.log(
    `[TranscriptionAgent] Finalizado: ${pages.length} páginas processadas, ${textoDAprova.length} blocos prontos`,
  );

  return {
    pages,
    textoDAprova,
    combinedText,
    segments,
  };
}

// Carrega modelo/instruções/tokens preferencialmente de AiAgentBlueprint (Builder MTF),
// com fallback para AiAssistant. Tudo editável via front.
async function getTranscriberConfig(): Promise<{ model: string; systemInstructions: string; maxOutputTokens: number }> {
  const prisma = getPrismaInstance();
  const baseInstructions = [
    "Você é um assistente jurídico especializado em transcrever provas manuscritas com o máximo de fidelidade.",
    "Regras obrigatórias:",
    "1. Nunca invente ou corrija informações. Quando algo estiver ilegível, escreva '[ilegível]'.",
    "2. Transcreva linha a linha mantendo a ordem original e numere como 'Linha X: ...'.",
    "3. Preserve títulos, numeração de questões, palavras sublinhadas ou destacados quando claros.",
    "4. Se identificar que o texto é da peça processual, use o prefixo 'Peça Pagina:' (aceitando grafias com ou sem acento).",
    "5. Para respostas das questões, inicie com 'Questão: <número>'.",
    "6. Sempre inclua a seção 'Resposta do Aluno:' logo após o cabeçalho (Questão/Peça).",
    "7. Pode retornar múltiplos blocos caso a página tenha mais de uma questão; cada bloco precisa seguir o formato abaixo.",
    "8. Não faça qualquer análise ou resumo; apenas digite exatamente o texto identificável.",
  ].join(" ");

  // 1) Tentar AiAgentBlueprint (MTF Agents Builder)
  try {
    const bpId = process.env.OAB_TRANSCRIBER_BLUEPRINT_ID;
    let blueprint: any = null;
    if (bpId) {
      blueprint = await (prisma as any).aiAgentBlueprint.findUnique({
        where: { id: bpId },
        select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true },
      });
    }
    if (!bpId || !blueprint) {
      blueprint = await (prisma as any).aiAgentBlueprint.findFirst({
        where: {
          OR: [
            { name: { contains: 'Transcrição', mode: 'insensitive' } },
            { name: { contains: 'Transcricao', mode: 'insensitive' } },
            { name: { contains: 'OAB', mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true },
      });
    }

    if (blueprint) {
      const model = blueprint.model || DEFAULT_VISION_MODEL;
      const maxOutputTokens = Number(blueprint.maxOutputTokens || 5000);
      const sys = (blueprint.systemPrompt || blueprint.instructions || baseInstructions).toString();
      const systemInstructions = sys.replace(/\s+/g, ' ');
      return { model, systemInstructions, maxOutputTokens };
    }
  } catch (err) {
    console.warn('[TranscriptionAgent] Falha ao consultar AiAgentBlueprint:', err);
  }

  // 2) Fallback: AiAssistant
  try {
    const assistantId = process.env.OAB_TRANSCRIBER_ASSISTANT_ID;
    let assistant: any = null;
    if (assistantId) {
      assistant = await (prisma as any).aiAssistant.findFirst({
        where: { id: assistantId, isActive: true },
        select: { model: true, instructions: true, maxOutputTokens: true },
      });
    }
    if (!assistant) {
      assistant = await (prisma as any).aiAssistant.findFirst({
        where: {
          isActive: true,
          OR: [
            { name: { contains: 'Transcrição', mode: 'insensitive' } },
            { name: { contains: 'Transcricao', mode: 'insensitive' } },
            { name: { contains: 'OAB', mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        select: { model: true, instructions: true, maxOutputTokens: true },
      });
    }
    if (assistant) {
      const model = assistant.model || DEFAULT_VISION_MODEL;
      const maxOutputTokens = Number(assistant.maxOutputTokens || 5000);
      const systemInstructions = (assistant.instructions?.trim() || baseInstructions).replace(/\s+/g, ' ');
      return { model, systemInstructions, maxOutputTokens };
    }
  } catch (err) {
    console.warn('[TranscriptionAgent] Falha ao consultar AiAssistant:', err);
  }

  // 3) Último recurso: defaults
  return { model: DEFAULT_VISION_MODEL, systemInstructions: baseInstructions, maxOutputTokens: 5000 };
}
