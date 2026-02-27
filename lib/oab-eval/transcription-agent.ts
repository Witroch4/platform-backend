import { z } from "zod";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createModel, buildProviderOptions } from "@/lib/socialwise-flow/services/ai-provider-factory";
import type { AiProviderType } from "@/lib/socialwise-flow/processor-components/assistant-config";
import { withRetry, cleanPromptForOpenAI, OPENAI_FALLBACK_MODEL } from "./ai-retry-fallback";
import { getOabEvalConfig } from "@/lib/config";
import { getPrismaInstance } from "@/lib/connections";
import {
	getAgentBlueprintByLinkedColumn,
	getAgentBlueprintByLinkedColumnAndProvider,
	isGeminiModel,
	GEMINI_AGENTIC_VISION_INSTRUCTIONS,
} from "@/lib/ai-agents/blueprints";
import type { ExtractedPage } from "./types";

/** Modelo OpenAI menor como último recurso (3o nível de fallback) */
const OPENAI_LAST_RESORT_MODEL = "gpt-4.1-mini";

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
	actualModel: string; // modelo efetivamente usado (pode diferir se houve fallback)
	tokens?: {
		input?: number;
		output?: number;
		total?: number;
	};
	durationMs: number;
	wasFallback: boolean;
	retryCount: number;
}

/** Extrai token usage do resultado do Vercel AI SDK, com fallback para providerMetadata */
function extractTokenUsage(result: any): { input?: number; output?: number; total?: number } | undefined {
	const usage = result.usage;

	let input: number | undefined;
	let output: number | undefined;

	// Path 1: Vercel AI SDK standard (promptTokens / completionTokens)
	if (usage) {
		input = usage.promptTokens;
		output = usage.completionTokens;
	}

	// Path 2: Fallback para providerMetadata.google (Gemini pode não popular usage corretamente)
	if (input === undefined || output === undefined) {
		const googleMeta = result.experimental_providerMetadata?.google?.usageMetadata
			?? result.providerMetadata?.google?.usageMetadata;
		if (googleMeta) {
			input = input ?? googleMeta.promptTokenCount;
			output = output ?? googleMeta.candidatesTokenCount ?? googleMeta.totalTokenCount;
		}
	}

	// Path 3: response.usageMetadata direto (Google SDK nativo via Vercel adapter)
	if (input === undefined || output === undefined) {
		const responseMeta = result.response?.usageMetadata ?? result.rawResponse?.usageMetadata;
		if (responseMeta) {
			input = input ?? responseMeta.promptTokenCount;
			output = output ?? responseMeta.candidatesTokenCount ?? responseMeta.totalTokenCount;
		}
	}

	if (input === undefined && output === undefined) {
		// Debug: log para diagnosticar qual path funciona
		console.warn("[TranscriptionAgent] ⚠️ Token usage not found.",
			"usage:", JSON.stringify(usage),
			"providerMetadata keys:", Object.keys(result.providerMetadata ?? {}),
			"response keys:", Object.keys(result.response ?? {}),
		);
		return undefined;
	}

	return {
		input,
		output,
		total: (input ?? 0) + (output ?? 0),
	};
}

async function transcribeSingleImage(
	image: PreparedImageState,
	page: number,
	total: number,
	model: string,
	systemInstructions: string,
	maxOutputTokens: number,
	options: {
		provider: AiProviderType;
		enableCodeExecution?: boolean;
		reasoningEffort?: string;
	},
): Promise<TranscriptionResult> {
	const startTime = Date.now();
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

	// Vercel AI SDK: image content part com base64
	const mimeType = image.mimeType ?? "image/png";
	const dataUrl = `data:${mimeType};base64,${image.base64}`;
	const imagePart = { type: "image" as const, image: new URL(dataUrl) };

	const isGemini3 = model.toLowerCase().startsWith("gemini-3");
	const tools = isGemini3 && options.enableCodeExecution
		? { code_execution: google.tools.codeExecution({}) }
		: undefined;

	let rawText: string;
	let usedProvider = options.provider;
	let usedModel = model;
	let tokens: { input?: number; output?: number; total?: number } | undefined;
	let wasFallback = false;
	let retryCount = 0;

	// === NÍVEL 1: Provider primário com retry ===
	try {
		const result = await withRetry(async () => {
			retryCount++;
			const aiModel = createModel(options.provider, model);
			const providerOptions = buildProviderOptions(options.provider, model, {
				reasoningEffort: options.reasoningEffort ?? "medium",
			});

			return generateText({
				model: aiModel,
				system: systemInstructions,
				messages: [{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: userPrompt },
						imagePart,
					],
				}],
				tools,
				...(maxOutputTokens > 0 ? { maxOutputTokens } : {}),
				temperature: 0,
				providerOptions,
			});
		}, `Transcription:${options.provider}/${model}`);

		rawText = result.text;
		tokens = extractTokenUsage(result);
	} catch (primaryError) {
		if (options.provider === "OPENAI") {
			// === NÍVEL 3 (direto): Se já é OpenAI, tenta modelo menor ===
			console.warn(`[TranscriptionAgent] ⚠️ OPENAI/${model} falhou p${page}, tentando ${OPENAI_LAST_RESORT_MODEL}`);
			try {
				const lastResortModel = createModel("OPENAI", OPENAI_LAST_RESORT_MODEL);
				const result = await withRetry(async () => {
					return generateText({
						model: lastResortModel,
						system: cleanPromptForOpenAI(systemInstructions),
						messages: [{
							role: "user" as const,
							content: [
								{ type: "text" as const, text: userPrompt },
								imagePart,
							],
						}],
						...(maxOutputTokens > 0 ? { maxOutputTokens } : {}),
						temperature: 0,
					});
				}, `Transcription:OPENAI/${OPENAI_LAST_RESORT_MODEL}`);
				rawText = result.text;
				tokens = extractTokenUsage(result);
				usedModel = OPENAI_LAST_RESORT_MODEL;
				wasFallback = true;
			} catch {
				throw primaryError;
			}
		} else {
			// === NÍVEL 2: Fallback Gemini/Claude → OpenAI com retry ===
			const errStatus = (primaryError as any)?.status || (primaryError as any)?.response?.status;
			const errCode = (primaryError as any)?.code || (primaryError as any)?.error?.code;
			const errMsg = (primaryError as any)?.message?.substring(0, 300);
			console.warn(
				`[TranscriptionAgent] ⚠️ ${options.provider}/${model} falhou p${page}` +
				` | status: ${errStatus ?? "N/A"} | code: ${errCode ?? "N/A"}` +
				` | msg: ${errMsg ?? "N/A"}` +
				` → fallback para OpenAI/${OPENAI_FALLBACK_MODEL}`,
			);
			wasFallback = true;
			try {
				const result = await withRetry(async () => {
					const fallbackModel = createModel("OPENAI", OPENAI_FALLBACK_MODEL);
					return generateText({
						model: fallbackModel,
						system: cleanPromptForOpenAI(systemInstructions),
						messages: [{
							role: "user" as const,
							content: [
								{ type: "text" as const, text: userPrompt },
								imagePart,
							],
						}],
						...(maxOutputTokens > 0 ? { maxOutputTokens } : {}),
						temperature: 0,
					});
				}, `Transcription:OPENAI/${OPENAI_FALLBACK_MODEL}`);
				rawText = result.text;
				tokens = extractTokenUsage(result);
				usedProvider = "OPENAI";
				usedModel = OPENAI_FALLBACK_MODEL;
			} catch {
				// === NÍVEL 3: Último recurso — modelo menor ===
				console.warn(`[TranscriptionAgent] ⚠️ Fallback OpenAI/${OPENAI_FALLBACK_MODEL} também falhou p${page}, tentando ${OPENAI_LAST_RESORT_MODEL}`);
				try {
					const lastResortModel = createModel("OPENAI", OPENAI_LAST_RESORT_MODEL);
					const result = await withRetry(async () => {
						return generateText({
							model: lastResortModel,
							system: cleanPromptForOpenAI(systemInstructions),
							messages: [{
								role: "user" as const,
								content: [
									{ type: "text" as const, text: userPrompt },
									imagePart,
								],
							}],
							...(maxOutputTokens > 0 ? { maxOutputTokens } : {}),
							temperature: 0,
						});
					}, `Transcription:OPENAI/${OPENAI_LAST_RESORT_MODEL}`);
					rawText = result.text;
					tokens = extractTokenUsage(result);
					usedProvider = "OPENAI";
					usedModel = OPENAI_LAST_RESORT_MODEL;
				} catch {
					throw primaryError; // throw original error
				}
			}
		}
	}

	return {
		text: rawText,
		provider: usedProvider === "GEMINI" ? "gemini" : "openai",
		model,
		actualModel: usedModel,
		tokens,
		durationMs: Date.now() - startTime,
		wasFallback,
		retryCount: Math.max(0, retryCount - 1), // first attempt is not a retry
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

export interface PageCompleteDetail {
	provider: string;
	model: string;
	tokensIn: number;
	tokensOut: number;
	durationMs: number;
	wasFallback: boolean;
}

export interface TranscriptionAgentInput {
	leadId: string;
	images: ManuscriptImageDescriptor[] | string[]; // Suporta URLs diretas ou descritores
	telefone?: string;
	nome?: string;
	selectedProvider?: "OPENAI" | "GEMINI"; // Provider selecionado pelo usuário no frontend
	concurrency?: number;
	onPageComplete?: (pageIndex: number, pageLabel: string, detail?: PageCompleteDetail) => Promise<void> | void;
}

export interface PageTokenUsage {
	page: number;
	input: number;
	output: number;
	provider: string;
	model: string;
	durationMs: number;
	wasFallback: boolean;
}

export interface TranscriptionTokenUsage {
	totalInput: number;
	totalOutput: number;
	perPage: PageTokenUsage[];
}

export interface TranscriptionAgentOutput {
	pages: ExtractedPage[];
	textoDAprova: TranscriptionSegment[];
	combinedText: string;
	segments: string[];
	tokenUsage: TranscriptionTokenUsage;
	primaryProvider: string;
	primaryModel: string;
}

// Alias para compatibilidade com transcription-queue
export interface TranscribeManuscriptResult {
	blocks: Array<{ pageLabel: string; transcription: string }>;
	textoDAprova: TranscriptionSegment[];
	combinedText: string;
	segments: string[];
	tokenUsage: TranscriptionTokenUsage;
	primaryProvider: string;
	primaryModel: string;
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
		tokenUsage: result.tokenUsage,
		primaryProvider: result.primaryProvider,
		primaryModel: result.primaryModel,
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

	// Download PARALELO de imagens (antes era serial)
	const downloadStart = Date.now();
	const preparedImages = await Promise.all(
		imageDescriptors.map(async (image) => {
			const prepared = await fetchImageAsBase64(image);
			return PreparedImageSchema.parse(prepared);
		}),
	);
	console.log(`[TranscriptionAgent] 📥 ${preparedImages.length} imagens baixadas em ${Date.now() - downloadStart}ms`);

	const total = preparedImages.length;
	const { transcribe_concurrency = 10 } = getOabEvalConfig();
	const concurrency = input.concurrency ?? Math.max(1, transcribe_concurrency || 10);
	console.log(`[TranscriptionAgent] ⚙️ Concurrency: ${concurrency}`);

	// mapConcurrent TOLERANTE a falhas — continua processando mesmo se uma página falhar
	async function mapConcurrentTolerant<T, R>(
		items: T[],
		limit: number,
		fn: (item: T, index: number) => Promise<R>,
	): Promise<{ results: (R | null)[]; errors: Array<{ index: number; error: any }> }> {
		const results: (R | null)[] = new Array(items.length).fill(null);
		const errors: Array<{ index: number; error: any }> = [];
		let nextIndex = 0;

		async function worker() {
			while (true) {
				const current = nextIndex++;
				if (current >= items.length) break;
				try {
					results[current] = await fn(items[current], current);
				} catch (err) {
					errors.push({ index: current, error: err });
					console.error(`[TranscriptionAgent] ❌ Página ${current + 1}/${items.length} falhou após todos os níveis de retry:`, (err as any)?.message || err);
				}
			}
		}

		const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
		await Promise.all(workers);
		return { results, errors };
	}

	const { model, systemInstructions, maxOutputTokens, enableCodeExecution, provider, reasoningEffort } =
		await getTranscriberConfig(input.selectedProvider);

	console.log("[TranscriptionAgent] 📝 Configuração do Blueprint:");
	console.log(`  - Modelo: ${model}`);
	console.log(`  - Provider: ${provider}`);
	console.log(`  - Max Output Tokens: ${maxOutputTokens}`);
	console.log(
		`  - Code Execution: ${enableCodeExecution ? "✅ Habilitado (Gemini Agentic Vision)" : "❌ Desabilitado"}`,
	);
	console.log(`  - Reasoning Effort: ${reasoningEffort}`);
	console.log(`  - System Prompt (preview): ${systemInstructions.substring(0, 150)}...`);

	// Acumuladores para estatísticas
	const perPageTokens: PageTokenUsage[] = [];
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let providerUsed = "";

	const { results: rawResults, errors } = await mapConcurrentTolerant(preparedImages, concurrency, async (image, index) => {
		const pageNumber = image.page ?? index + 1;

		const result = await transcribeSingleImage(image, pageNumber, total, model, systemInstructions, maxOutputTokens, {
			provider,
			enableCodeExecution,
			reasoningEffort,
		});
		const trimmed = result.text.trim();
		const newSegments = splitSegments(trimmed);

		providerUsed = result.provider;

		// Acumular tokens
		const pageInput = result.tokens?.input ?? 0;
		const pageOutput = result.tokens?.output ?? 0;
		totalInputTokens += pageInput;
		totalOutputTokens += pageOutput;

		perPageTokens.push({
			page: pageNumber,
			input: pageInput,
			output: pageOutput,
			provider: result.provider,
			model: result.actualModel,
			durationMs: result.durationMs,
			wasFallback: result.wasFallback,
		});

		// Preview do texto (primeiras 80 chars)
		const textPreview = trimmed.length > 80 ? `${trimmed.substring(0, 80)}...` : trimmed;

		// Log informativo por página
		const tokenInfo = result.tokens ? `tokens: ${result.tokens.input ?? "?"}→${result.tokens.output ?? "?"}` : "";
		console.log(
			`[TranscriptionAgent] ✅ Pág ${index + 1}/${total} | ${result.provider.toUpperCase()} ${result.actualModel} | ${(result.durationMs / 1000).toFixed(1)}s | ${trimmed.length} chars ${tokenInfo}`,
		);
		console.log(`[TranscriptionAgent]    📄 "${textPreview.replace(/\n/g, " ")}"`);

		// Log de fallback quando Gemini falhou e OpenAI foi usado
		if (result.wasFallback) {
			console.log(`[TranscriptionAgent] ⚠️ Pág ${index + 1}/${total} usou fallback → ${result.actualModel}`);
		}

		// Callback de progresso (enriquecido)
		if (input.onPageComplete) {
			await input.onPageComplete(index, String(pageNumber), {
				provider: result.provider,
				model: result.actualModel,
				tokensIn: pageInput,
				tokensOut: pageOutput,
				durationMs: result.durationMs,
				wasFallback: result.wasFallback,
			});
		}

		return {
			index,
			pageNumber,
			imageId: image.id,
			text: trimmed,
			segments: newSegments,
		};
	});

	// Filtrar resultados nulos (páginas que falharam)
	const successResults = rawResults.filter((r): r is NonNullable<typeof r> => r !== null);

	if (successResults.length === 0) {
		throw new Error(`Todas as ${total} páginas falharam na transcrição. Erros: ${errors.map(e => (e.error as any)?.message || String(e.error)).join("; ")}`);
	}

	if (errors.length > 0) {
		console.warn(`[TranscriptionAgent] ⚠️ ${errors.length}/${total} páginas falharam, ${successResults.length} páginas processadas com sucesso`);
	}

	// Ordenar por pageNumber para manter consistência
	successResults.sort((a, b) => a.pageNumber - b.pageNumber);

	console.log(`[TranscriptionAgent] 🔢 Ordem após sort: ${successResults.map((r) => `p${r.pageNumber}`).join(" → ")}`);

	const pages: ExtractedPage[] = successResults.map((r) => ({
		page: r.pageNumber,
		text: r.text,
		imageKey: r.imageId,
	}));
	const segments: string[] = successResults.flatMap((r) => r.segments);

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

	const tokenUsage: TranscriptionTokenUsage = {
		totalInput: totalInputTokens,
		totalOutput: totalOutputTokens,
		perPage: perPageTokens.sort((a, b) => a.page - b.page),
	};

	return {
		pages,
		textoDAprova,
		combinedText,
		segments,
		tokenUsage,
		primaryProvider: provider,
		primaryModel: model,
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
	provider: AiProviderType;
	reasoningEffort: string;
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

			const effectiveProvider: AiProviderType = isGeminiModel(model) ? "GEMINI" : "OPENAI";

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model) && (blueprint.metadata as any)?.codeExecution !== false,
				provider: effectiveProvider,
				reasoningEffort: blueprint.reasoningEffort ?? blueprint.thinkingLevel ?? "high",
			};
		}
	} catch (err) {
		console.warn("[TranscriptionAgent] Falha ao consultar blueprint por linkedColumn:", err);
	}

	// 2) Fallback: Buscar por ID ou nome (compatibilidade)
	try {
		const bpId = process.env.OAB_TRANSCRIBER_BLUEPRINT_ID;
		const bpSelect = { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, metadata: true, reasoningEffort: true, thinkingLevel: true };
		let blueprint: any = null;
		if (bpId) {
			blueprint = await (prisma as any).aiAgentBlueprint.findUnique({
				where: { id: bpId },
				select: bpSelect,
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
				select: bpSelect,
			});
		}

		if (blueprint) {
			const model = blueprint.model || DEFAULT_VISION_MODEL;
			const maxOutputTokens = Number(blueprint.maxOutputTokens ?? 0);
			let systemInstructions = (blueprint.systemPrompt || blueprint.instructions || baseInstructions).toString();

			if (isGeminiModel(model)) {
				systemInstructions = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemInstructions}`;
				console.log("[TranscriptionAgent] 🔬 Injetando instruções Gemini Agentic Vision (fallback)");
			}

			systemInstructions = systemInstructions.replace(/\s+/g, " ");

			const effectiveProvider: AiProviderType = isGeminiModel(model) ? "GEMINI" : "OPENAI";
			const bpMetadata = typeof blueprint.metadata === "object" ? blueprint.metadata : {};

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model) && bpMetadata?.codeExecution !== false,
				provider: effectiveProvider,
				reasoningEffort: blueprint.reasoningEffort ?? blueprint.thinkingLevel ?? "high",
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

			const effectiveProvider: AiProviderType = isGeminiModel(model) ? "GEMINI" : "OPENAI";

			return {
				model,
				systemInstructions,
				maxOutputTokens,
				enableCodeExecution: isGeminiModel(model),
				provider: effectiveProvider,
				reasoningEffort: "high",
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
		provider: "OPENAI",
		reasoningEffort: "high",
	};
}
