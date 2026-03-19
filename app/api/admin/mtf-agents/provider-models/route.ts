import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { openai } from "@/lib/oab-eval/openai-client";
import { getGeminiClient, isGeminiAvailable } from "@/lib/oab-eval/gemini-client";

/**
 * Metadata conhecida para modelos — usada para enriquecer modelos descobertos via API.
 * Modelos novos que não estão aqui ainda aparecem, só sem pricing/description detalhado.
 */
interface ModelMeta {
	label: string;
	description: string;
	pricing: string;
	cutoff?: string;
	supportsReasoning?: boolean;
	fixedReasoning?: string;
}

const KNOWN_OPENAI: Record<string, ModelMeta> = {
	"gpt-4.1": { label: "GPT-4.1 (Vision)", description: "Principal modelo de visão", pricing: "$2.00 / $8.00 por 1M tokens", supportsReasoning: false },
	"gpt-4.1-mini": { label: "GPT-4.1 Mini", description: "Balanceado custo/qualidade", pricing: "$0.40 / $1.60 por 1M tokens", supportsReasoning: false },
	"gpt-4.1-nano": { label: "GPT-4.1 Nano", description: "Ultra rápido, baixo custo", pricing: "$0.10 / $0.40 por 1M tokens", supportsReasoning: false },
	"gpt-4o": { label: "GPT-4o", description: "Modelo anterior multimodal", pricing: "$2.50 / $10.00 por 1M tokens", supportsReasoning: false },
	"gpt-4o-mini": { label: "GPT-4o Mini", description: "Versão compacta do GPT-4o", pricing: "$0.15 / $0.60 por 1M tokens", supportsReasoning: false },
	"gpt-5": { label: "GPT-5", description: "Raciocínio avançado", pricing: "$1.25 / $10.00 por 1M tokens", supportsReasoning: true },
	"gpt-5-mini": { label: "GPT-5 Mini", description: "Raciocínio compacto", pricing: "$0.25 / $2.00 por 1M tokens", supportsReasoning: true },
	"gpt-5.1": { label: "GPT-5.1", description: "Evolução do GPT-5", pricing: "$1.25 / $10.00 por 1M tokens", supportsReasoning: true },
	"gpt-5.2": { label: "GPT-5.2", description: "Última geração GPT conhecida", pricing: "$1.75 / $14.00 por 1M tokens", supportsReasoning: true },
	"gpt-5-pro": { label: "GPT-5 Pro", description: "Raciocínio máximo fixo", pricing: "$15.00 / $120.00 por 1M tokens", supportsReasoning: true, fixedReasoning: "high" },
};

const KNOWN_GEMINI: Record<string, ModelMeta> = {
	"gemini-3.1-pro-preview": { label: "Gemini 3.1 Pro Preview", description: "SOTA reasoning com profundidade e multimodal avançado", pricing: "≤200K: $2.00 / $12.00 · >200K: $4.00 / $18.00", cutoff: "Jan 2025" },
	"gemini-3-flash-preview": { label: "Gemini 3 Flash Preview", description: "Inteligência frontier com velocidade, search e grounding", pricing: "$0.50 / $3.00 por 1M tokens", cutoff: "Jan 2025" },
	"gemini-3-pro-preview": { label: "Gemini 3 Pro Preview", description: "Raciocínio avançado, multimodal e vibe coding", pricing: "≤200K: $2.00 / $12.00 · >200K: $4.00 / $18.00", cutoff: "Jan 2025" },
	"gemini-2.5-pro": { label: "Gemini 2.5 Pro", description: "Geração anterior, excelente em código e raciocínio complexo", pricing: "≤200K: $1.25 / $10.00 · >200K: $2.50 / $15.00", cutoff: "Jan 2025" },
	"gemini-2.5-flash": { label: "Gemini 2.5 Flash", description: "Raciocínio híbrido, 1M context, thinking budgets", pricing: "$0.30 / $2.50 por 1M tokens", cutoff: "Jan 2025" },
	"gemini-2.5-flash-lite": { label: "Gemini 2.5 Flash Lite", description: "Menor e mais econômico, feito para uso em escala", pricing: "$0.10 / $0.40 por 1M tokens", cutoff: "Jan 2025" },
};

/** Patterns para classificar modelos OpenAI desconhecidos */
function classifyOpenAiModel(id: string): { supportsReasoning: boolean; label: string; description: string } {
	// GPT-5.x+ → reasoning
	if (/^gpt-5/i.test(id)) {
		const version = id.replace(/^gpt-/i, "").replace(/-/g, " ").trim();
		return { supportsReasoning: true, label: `GPT-${version.toUpperCase()}`, description: `Modelo GPT-5 série (${version})` };
	}
	// GPT-4.x → no reasoning
	if (/^gpt-4/i.test(id)) {
		const version = id.replace(/^gpt-/i, "").replace(/-/g, " ").trim();
		return { supportsReasoning: false, label: `GPT-${version.toUpperCase()}`, description: `Modelo GPT-4 série (${version})` };
	}
	// o-series (o1, o3, o4) → reasoning
	if (/^o\d/i.test(id)) {
		return { supportsReasoning: true, label: id.toUpperCase(), description: `Modelo de raciocínio ${id}` };
	}
	return { supportsReasoning: false, label: id, description: `Modelo OpenAI ${id}` };
}

/** Gera label para modelo Gemini desconhecido */
function classifyGeminiModel(name: string): { label: string; description: string } {
	// name vem como "models/gemini-x-y" — extrair o ID
	const id = name.replace(/^models\//, "");
	// Capitaliza partes do nome
	const parts = id.split("-");
	const label = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
	return { label, description: `Modelo Google ${label}` };
}

// Cache em memória (5 min) para não bater nas APIs a cada abertura do dialog
interface CachedModels {
	openai: ProviderModelOption[];
	gemini: ProviderModelOption[];
	fetchedAt: number;
}

interface ProviderModelOption {
	value: string;
	label: string;
	description: string;
	pricing: string;
	cutoff?: string;
	supportsReasoning?: boolean;
	fixedReasoning?: string;
	isNew?: boolean; // modelo descoberto via API mas sem metadata conhecida
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let modelsCache: CachedModels | null = null;

async function fetchOpenAiModels(): Promise<ProviderModelOption[]> {
	const seen = new Set<string>();
	const results: ProviderModelOption[] = [];

	try {
		const list = await openai.models.list();
		const models = list.data || [];

		for (const model of models) {
			const id = model.id || "";
			// Filtrar: apenas modelos de chat/vision/reasoning (gpt-*, o1-*, o3-*, o4-*)
			if (!/^(gpt-|o\d)/i.test(id)) continue;
			// Excluir embeddings, audio, image, etc.
			if (/embed|tts|whisper|audio|dall-e|gpt-image|realtime|search|instruct/i.test(id)) continue;
			// Excluir snapshots datados (ex: gpt-4o-2024-11-20) — manter só os aliases limpos
			if (/\d{4}-\d{2}-\d{2}/.test(id)) continue;
			if (seen.has(id)) continue;
			seen.add(id);

			const known = KNOWN_OPENAI[id];
			if (known) {
				results.push({
					value: id,
					label: known.label,
					description: known.description,
					pricing: known.pricing,
					supportsReasoning: known.supportsReasoning,
					fixedReasoning: known.fixedReasoning,
				});
			} else {
				const classified = classifyOpenAiModel(id);
				results.push({
					value: id,
					label: classified.label,
					description: classified.description,
					pricing: "Consultar openai.com/pricing",
					supportsReasoning: classified.supportsReasoning,
					isNew: true,
				});
			}
		}
	} catch (error) {
		console.error("[ProviderModels] Falha ao buscar modelos OpenAI:", error);
	}

	// Garantir que modelos conhecidos estão presentes mesmo se API falhar
	for (const [id, meta] of Object.entries(KNOWN_OPENAI)) {
		if (!seen.has(id)) {
			results.push({
				value: id,
				label: meta.label,
				description: meta.description,
				pricing: meta.pricing,
				supportsReasoning: meta.supportsReasoning,
				fixedReasoning: meta.fixedReasoning,
			});
		}
	}

	// Ordenar: GPT-5.x desc, GPT-4.x desc, o-series
	results.sort((a, b) => {
		const scoreA = modelSortScore(a.value);
		const scoreB = modelSortScore(b.value);
		return scoreB - scoreA;
	});

	return results;
}

function modelSortScore(id: string): number {
	// Extrair versão numérica para sort
	const m = id.match(/^gpt-(\d+)\.?(\d*)/i);
	if (m) {
		const major = parseInt(m[1], 10);
		const minor = parseInt(m[2] || "0", 10);
		// pro/mini/nano como sub-sort
		let bonus = 0;
		if (id.includes("-pro")) bonus = 0.3;
		else if (id.includes("-mini")) bonus = -0.1;
		else if (id.includes("-nano")) bonus = -0.2;
		return major * 100 + minor * 10 + bonus;
	}
	// o-series
	const oMatch = id.match(/^o(\d+)/i);
	if (oMatch) return parseInt(oMatch[1], 10) * 50;
	return 0;
}

async function fetchGeminiModels(): Promise<ProviderModelOption[]> {
	const seen = new Set<string>();
	const results: ProviderModelOption[] = [];

	try {
		const client = getGeminiClient();
		if (!client) throw new Error("Gemini não configurado");

		const pager = await client.models.list({ config: { pageSize: 100 } });
		for await (const model of pager) {
			const fullName = model.name || "";
			const id = fullName.replace(/^models\//, "");

			// Filtrar apenas modelos gemini de geração de conteúdo
			if (!id.startsWith("gemini")) continue;
			// Excluir embeddings e modelos muito antigos
			if (/embed|aqa|1\.0|nano/i.test(id)) continue;
			// Excluir snapshots datados
			if (/\d{4}-\d{2}-\d{2}/.test(id) && !id.includes("preview")) continue;
			if (seen.has(id)) continue;
			seen.add(id);

			const known = KNOWN_GEMINI[id];
			if (known) {
				results.push({
					value: id,
					label: known.label,
					description: known.description,
					pricing: known.pricing,
					cutoff: known.cutoff,
				});
			} else {
				const classified = classifyGeminiModel(fullName);
				results.push({
					value: id,
					label: classified.label,
					description: classified.description,
					pricing: "Consultar ai.google.dev/pricing",
					isNew: true,
				});
			}
		}
	} catch (error) {
		console.error("[ProviderModels] Falha ao buscar modelos Gemini:", error);
	}

	// Garantir modelos conhecidos presentes mesmo se API falhar
	for (const [id, meta] of Object.entries(KNOWN_GEMINI)) {
		if (!seen.has(id)) {
			results.push({
				value: id,
				label: meta.label,
				description: meta.description,
				pricing: meta.pricing,
				cutoff: meta.cutoff,
			});
		}
	}

	// Ordenar por versão descendente
	results.sort((a, b) => {
		const scoreA = geminiSortScore(a.value);
		const scoreB = geminiSortScore(b.value);
		return scoreB - scoreA;
	});

	return results;
}

function geminiSortScore(id: string): number {
	const m = id.match(/gemini-(\d+)\.?(\d*)/);
	if (!m) return 0;
	const major = parseInt(m[1], 10);
	const minor = parseInt(m[2] || "0", 10);
	let bonus = 0;
	if (id.includes("pro")) bonus = 0.5;
	else if (id.includes("flash-lite")) bonus = -0.2;
	else if (id.includes("flash")) bonus = 0.2;
	if (id.includes("preview")) bonus += 0.1;
	return major * 100 + minor * 10 + bonus;
}

async function getModels(): Promise<CachedModels> {
	if (modelsCache && Date.now() - modelsCache.fetchedAt < CACHE_TTL_MS) {
		return modelsCache;
	}

	const [openaiModels, geminiModels] = await Promise.all([
		fetchOpenAiModels(),
		fetchGeminiModels(),
	]);

	modelsCache = { openai: openaiModels, gemini: geminiModels, fetchedAt: Date.now() };
	console.log(`[ProviderModels] Cache atualizado — OpenAI: ${openaiModels.length}, Gemini: ${geminiModels.length}`);
	return modelsCache;
}

/**
 * GET /api/admin/mtf-agents/provider-models
 * Retorna listas dinâmicas de modelos OpenAI e Gemini com metadata enriquecida.
 * Cache de 5 min em memória para não sobrecarregar as APIs.
 */
export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { openai: openaiModels, gemini: geminiModels } = await getModels();

	return NextResponse.json({
		openai: openaiModels,
		gemini: geminiModels,
		geminiAvailable: isGeminiAvailable(),
	});
}
