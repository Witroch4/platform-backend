import { z } from "zod";
import { processVisionRequest } from "./unified-vision-client";
import { getOabEvalConfig } from "@/lib/config";
import { getPrismaInstance } from "@/lib/connections";
import {
	getAgentBlueprintByLinkedColumn,
	getAgentBlueprintByLinkedColumnAndProvider,
	isGeminiModel,
	GEMINI_AGENTIC_VISION_INSTRUCTIONS,
} from "@/lib/ai-agents/blueprints";
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

	// Ordenar questões por número (1, 2, 3, ...)
	questions.sort((a, b) => a.num - b.num);

	// Ordenar páginas da peça por número (1, 2, 3, ...)
	pages.sort((a, b) => a.page - b.page);

	// Outros mantêm ordem original
	others.sort((a, b) => a.index - b.index);

	// Ordem final: Questões (ordenadas) → Páginas da Peça (ordenadas) → Outros
	return [
		...questions.map((item) => ({ output: item.output })),
		...pages.map((item) => ({ output: item.output })),
		...others.map((item) => ({ output: item.output })),
	];
}

interface TranscriptionResult {
	text: string;
	provider: "openai" | "gemini";
	model: string;
	tokens?: {
		input?: number;
		output?: number;
		total?: number;
	};
}

async function transcribeSingleImage(
	image: PreparedImageState,
	page: number,
	total: number,
	model: string,
	systemInstructions: string,
	maxOutputTokens: number,
	options?: {
		enableCodeExecution?: boolean;
		thinkingLevel?: "minimal" | "low" | "medium" | "high";
	},
): Promise<TranscriptionResult> {
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

	// Cliente unificado: suporta OpenAI e Gemini automaticamente
	// Para Gemini 3, habilita code execution e thinking para Agentic Vision
	const response = await processVisionRequest({
		model,
		systemInstructions,
		userPrompt,
		imageBase64: image.base64,
		imageMimeType: image.mimeType,
		maxOutputTokens,
		enableCodeExecution: options?.enableCodeExecution,
		thinkingLevel: options?.thinkingLevel,
	});

	return {
		text: response.text,
		provider: response.provider,
		model: response.model,
		tokens: response.usage
			? {
					input: response.usage.inputTokens,
					output: response.usage.outputTokens,
					total: response.usage.totalTokens,
				}
			: undefined,
	};
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
	images: ManuscriptImageDescriptor[] | string[]; // Suporta URLs diretas ou descritores
	telefone?: string;
	nome?: string;
	selectedProvider?: "OPENAI" | "GEMINI"; // Provider selecionado pelo usuário no frontend
	concurrency?: number;
	onPageComplete?: (pageIndex: number, pageLabel: string) => Promise<void> | void;
}

export interface TranscriptionAgentOutput {
	pages: ExtractedPage[];
	textoDAprova: TranscriptionSegment[];
	combinedText: string;
	segments: string[];
}

// Alias para compatibilidade com transcription-queue
export interface TranscribeManuscriptResult {
	blocks: Array<{ pageLabel: string; transcription: string }>;
	textoDAprova: TranscriptionSegment[];
	combinedText: string;
	segments: string[];
}

export async function transcribeManuscript(
	input: Omit<TranscriptionAgentInput, "images"> & { images: string[] },
): Promise<TranscribeManuscriptResult> {
	const descriptors: ManuscriptImageDescriptor[] = input.images.map((url, index) => ({
		id: `img-${index}`,
		url,
		page: index + 1,
	}));

	const result = await transcribeManuscriptLocally({
		...input,
		images: descriptors,
	});

	return {
		blocks: result.pages.map((page) => ({
			pageLabel: String(page.page),
			transcription: page.text,
		})),
		textoDAprova: result.textoDAprova,
		combinedText: result.combinedText,
		segments: result.segments,
	};
}

export async function transcribeManuscriptLocally(input: TranscriptionAgentInput): Promise<TranscriptionAgentOutput> {
	console.log(
		`[TranscriptionAgent] Iniciando digitação local para lead ${input.leadId} com ${input.images.length} imagens`,
	);

	// Normalizar images para ManuscriptImageDescriptor[]
	const imageDescriptors: ManuscriptImageDescriptor[] = input.images.map((img, index) => {
		if (typeof img === "string") {
			return { id: `img-${index}`, url: img, page: index + 1 };
		}
		return img;
	});

	const preparedImages: PreparedImageState[] = [];
	for (const image of imageDescriptors) {
		const prepared = await fetchImageAsBase64(image);
		preparedImages.push(PreparedImageSchema.parse(prepared));
	}

	const total = preparedImages.length;
	const { transcribe_concurrency = 10 } = getOabEvalConfig();
	const concurrency = input.concurrency ?? Math.max(1, transcribe_concurrency || 10);
	console.log(`[TranscriptionAgent] ⚙️ Concurrency: ${concurrency}`);

	async function mapConcurrent<T, R>(
		items: T[],
		limit: number,
		fn: (item: T, index: number) => Promise<R>,
	): Promise<R[]> {
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

	const { model, systemInstructions, maxOutputTokens, enableCodeExecution, thinkingLevel } =
		await getTranscriberConfig(input.selectedProvider);

	console.log("[TranscriptionAgent] 📝 Configuração do Blueprint:");
	console.log(`  - Modelo: ${model}`);
	console.log(`  - Max Output Tokens: ${maxOutputTokens}`);
	console.log(
		`  - Code Execution: ${enableCodeExecution ? "✅ Habilitado (Gemini Agentic Vision)" : "❌ Desabilitado"}`,
	);
	console.log(`  - Thinking Level: ${thinkingLevel}`);
	console.log(`  - System Prompt (preview): ${systemInstructions.substring(0, 150)}...`);

	// Acumuladores para estatísticas
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let providerUsed = "";

	const results = await mapConcurrent(preparedImages, concurrency, async (image, index) => {
		const pageNumber = image.page ?? index + 1;
		const startTime = Date.now();

		const result = await transcribeSingleImage(image, pageNumber, total, model, systemInstructions, maxOutputTokens, {
			enableCodeExecution,
			thinkingLevel,
		});
		const trimmed = result.text.trim();
		const newSegments = splitSegments(trimmed);

		const elapsedMs = Date.now() - startTime;
		providerUsed = result.provider;

		// Acumular tokens
		if (result.tokens) {
			totalInputTokens += result.tokens.input ?? 0;
			totalOutputTokens += result.tokens.output ?? 0;
		}

		// Preview do texto (primeiras 80 chars)
		const textPreview = trimmed.length > 80 ? `${trimmed.substring(0, 80)}...` : trimmed;

		// Log informativo por página
		const tokenInfo = result.tokens ? `tokens: ${result.tokens.input ?? "?"}→${result.tokens.output ?? "?"}` : "";
		console.log(
			`[TranscriptionAgent] ✅ Pág ${index + 1}/${total} | ${result.provider.toUpperCase()} ${result.model} | ${(elapsedMs / 1000).toFixed(1)}s | ${trimmed.length} chars ${tokenInfo}`,
		);
		console.log(`[TranscriptionAgent]    📄 "${textPreview.replace(/\n/g, " ")}"`);

		// Log de fallback quando Gemini falhou e OpenAI foi usado
		if (result.provider === "openai" && isGeminiModel(model)) {
			console.log(`[TranscriptionAgent] ⚠️ Pág ${index + 1}/${total} usou fallback OpenAI (prompt limpo)`);
		}

		// Callback de progresso
		if (input.onPageComplete) {
			await input.onPageComplete(index, String(pageNumber));
		}

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

	console.log(`[TranscriptionAgent] 🔢 Ordem após sort: ${results.map((r) => `p${r.pageNumber}`).join(" → ")}`);

	const pages: ExtractedPage[] = results.map((r) => ({
		page: r.pageNumber,
		text: r.text,
		imageKey: r.imageId,
	}));
	const segments: string[] = results.flatMap((r) => r.segments);

	// Ordena por número de questão e número de página da peça
	const textoDAprova = organizeSegments(segments);
	const combinedText = pages.map((page) => `[[PÁGINA ${page.page}]]\n${page.text}`.trim()).join("\n\n");

	// Log final com estatísticas
	const tokenSummary =
		totalInputTokens > 0 || totalOutputTokens > 0
			? ` | Tokens: ${totalInputTokens} in → ${totalOutputTokens} out (${totalInputTokens + totalOutputTokens} total)`
			: "";
	console.log(
		`[TranscriptionAgent] ✅ CONCLUÍDO | ${providerUsed.toUpperCase() || model} | ${pages.length} páginas | ${textoDAprova.length} blocos${tokenSummary}`,
	);

	return {
		pages,
		textoDAprova,
		combinedText,
		segments,
	};
}

// Carrega modelo/instruções/tokens preferencialmente de AiAgentBlueprint vinculado à coluna PROVA_CELL,
// com fallback para busca por nome/metadata. Tudo editável via front.
// IMPORTANTE: Se o modelo for Gemini, injeta instruções técnicas para Agentic Vision.
// @param preferredProvider - Provider selecionado pelo usuário no frontend (OPENAI ou GEMINI).
//   Quando informado, filtra blueprints por defaultProvider correspondente.
async function getTranscriberConfig(preferredProvider?: "OPENAI" | "GEMINI"): Promise<{
	model: string;
	systemInstructions: string;
	maxOutputTokens: number;
	enableCodeExecution: boolean;
	thinkingLevel: "minimal" | "low" | "medium" | "high";
}> {
	const prisma = getPrismaInstance();

	if (preferredProvider) {
		console.log(`[TranscriptionAgent] 🎛️ Provider preferido pelo usuário: ${preferredProvider}`);
	}
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

	// 1) NOVA ESTRATÉGIA: Buscar AiAgentBlueprint vinculado à coluna PROVA_CELL
	//    Quando há preferredProvider, busca primeiro blueprint com defaultProvider correspondente.
	try {
		let blueprint = preferredProvider
			? await getAgentBlueprintByLinkedColumnAndProvider("PROVA_CELL", preferredProvider)
			: null;

		// Se não encontrou blueprint para o provider preferido, busca qualquer blueprint PROVA_CELL
		if (!blueprint) {
			blueprint = await getAgentBlueprintByLinkedColumn("PROVA_CELL");
		}

		if (blueprint) {
			// Se o usuário escolheu um provider mas o blueprint encontrado é do outro,
			// usar modelo default do provider preferido em vez do modelo do blueprint
			let model = blueprint.model || DEFAULT_VISION_MODEL;
			if (preferredProvider) {
				const blueprintIsGemini = isGeminiModel(model);
				const wantsOpenai = preferredProvider === "OPENAI";
				const wantsGemini = preferredProvider === "GEMINI";

				if (wantsOpenai && blueprintIsGemini) {
					console.log(`[TranscriptionAgent] ⚠️ Usuário selecionou OPENAI mas blueprint usa ${model}. Sobrescrevendo para ${DEFAULT_VISION_MODEL}`);
					model = DEFAULT_VISION_MODEL; // gpt-4.1
				} else if (wantsGemini && !blueprintIsGemini) {
					const geminiDefault = "gemini-3-flash-preview";
					console.log(`[TranscriptionAgent] ⚠️ Usuário selecionou GEMINI mas blueprint usa ${model}. Sobrescrevendo para ${geminiDefault}`);
					model = geminiDefault;
				}
			}

			const maxOutputTokens = Number(blueprint.maxOutputTokens ?? 0);
			let systemInstructions = (blueprint.systemPrompt || blueprint.instructions || baseInstructions).toString();

			// INJEÇÃO DE DEPENDÊNCIA DE PROMPT: Se Gemini, adiciona instruções técnicas para Agentic Vision
			if (isGeminiModel(model)) {
				systemInstructions = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemInstructions}`;
				console.log("[TranscriptionAgent] 🔬 Injetando instruções Gemini Agentic Vision para OCR de manuscritos");
			}

			systemInstructions = systemInstructions.replace(/\s+/g, " ");

			console.log(`[TranscriptionAgent] ✅ Blueprint vinculado à PROVA_CELL encontrado: ${blueprint.name} (${model})`);

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model), // Habilita code execution para Gemini
				thinkingLevel: "high", // Máximo raciocínio para OCR de manuscritos
			};
		}
	} catch (err) {
		console.warn("[TranscriptionAgent] Falha ao consultar blueprint por linkedColumn:", err);
	}

	// 2) Fallback: Buscar por ID ou nome (compatibilidade)
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
						{ name: { contains: "Transcrição", mode: "insensitive" } },
						{ name: { contains: "Transcricao", mode: "insensitive" } },
						{ name: { contains: "OAB", mode: "insensitive" } },
					],
				},
				orderBy: { updatedAt: "desc" },
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true },
			});
		}

		if (blueprint) {
			const model = blueprint.model || DEFAULT_VISION_MODEL;
			const maxOutputTokens = Number(blueprint.maxOutputTokens ?? 0);
			let systemInstructions = (blueprint.systemPrompt || blueprint.instructions || baseInstructions).toString();

			// INJEÇÃO DE DEPENDÊNCIA DE PROMPT: Se Gemini, adiciona instruções técnicas
			if (isGeminiModel(model)) {
				systemInstructions = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemInstructions}`;
				console.log("[TranscriptionAgent] 🔬 Injetando instruções Gemini Agentic Vision (fallback)");
			}

			systemInstructions = systemInstructions.replace(/\s+/g, " ");

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model),
				thinkingLevel: "high",
			};
		}
	} catch (err) {
		console.warn("[TranscriptionAgent] Falha ao consultar AiAgentBlueprint:", err);
	}

	// 3) Fallback: AiAssistant
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
						{ name: { contains: "Transcrição", mode: "insensitive" } },
						{ name: { contains: "Transcricao", mode: "insensitive" } },
						{ name: { contains: "OAB", mode: "insensitive" } },
					],
				},
				orderBy: { updatedAt: "desc" },
				select: { model: true, instructions: true, maxOutputTokens: true },
			});
		}
		if (assistant) {
			const model = assistant.model || DEFAULT_VISION_MODEL;
			const maxOutputTokens = Number(assistant.maxOutputTokens ?? 0);
			let systemInstructions = assistant.instructions?.trim() || baseInstructions;

			if (isGeminiModel(model)) {
				systemInstructions = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemInstructions}`;
			}

			systemInstructions = systemInstructions.replace(/\s+/g, " ");

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model),
				thinkingLevel: "high",
			};
		}
	} catch (err) {
		console.warn("[TranscriptionAgent] Falha ao consultar AiAssistant:", err);
	}

	// 4) Último recurso: defaults
	return {
		model: DEFAULT_VISION_MODEL,
		systemInstructions: baseInstructions,
		maxOutputTokens: 0,
		enableCodeExecution: false,
		thinkingLevel: "high",
	};
}
