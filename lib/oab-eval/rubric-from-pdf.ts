//lib/oab-eval/rubric-from-pdf.ts
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse";
import { RubricSchema, type RubricPayload } from "./types";
import { jsonrepair } from "jsonrepair";
import {
	parseGabaritoDeterministico,
	verificarPontuacao,
	type GabaritoAtomico,
	type ParseMetaInput,
} from "../oab/gabarito-parser-deterministico";

interface BuildRubricOptions {
	fileName?: string;
	model?: string;
}

const DEFAULT_RUBRIC_MODEL = process.env.OAB_EVAL_RUBRIC_MODEL ?? "gpt-4o";

type OpenAIClientModule = typeof import("./openai-client");
let openaiClientModule: OpenAIClientModule | null = null;

async function ensureOpenAIClient(): Promise<OpenAIClientModule> {
	if (!openaiClientModule) {
		openaiClientModule = await import("./openai-client");
	}
	return openaiClientModule;
}

function composeEmbeddingText(item: RubricPayload["itens"][number], meta?: RubricPayload["meta"]) {
	const headerParts = ["OAB"];
	if (meta?.exam) headerParts.push(String(meta.exam));
	if (meta?.area) headerParts.push(String(meta.area));
	if (meta?.caderno) headerParts.push(String(meta.caderno));

	const fundamentals = item.fundamentos?.length ? ` Fundamentos: ${item.fundamentos.join("; ")}.` : "";
	const keywords = item.palavras_chave?.length ? ` Palavras-chave: ${item.palavras_chave.join(", ")}.` : "";
	return (
		`${headerParts.join(" ")} | ${item.escopo} | ${item.questao} | ${item.id} :: ${item.descricao}.` +
		fundamentals +
		keywords +
		" Tarefa: localizar no texto do candidato trechos que atendam integral ou parcialmente a este subitem."
	);
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
	const result = await pdfParse(buffer, { pagerender: undefined });
	// Normaliza CRLF, remove NUL chars e espaços antes da quebra de linha
	return result.text
		.replace(/\r\n/g, "\n")
		.replace(/\u0000/g, "")
		.replace(/\t+/g, " ")
		.replace(/[ \t]+\n/g, "\n");
}

async function buildRubricFromPdfLLM(buffer: Buffer, options: BuildRubricOptions = {}, preExtractedText?: string) {
	const rawText = preExtractedText ?? (await extractTextFromPdf(buffer));

	// Log do texto bruto extraído
	console.log("[OAB::TEXT_EXTRACTION] Texto bruto extraído:", {
		totalChars: rawText.length,
		totalLines: rawText.split("\n").length,
	});
	console.log("[OAB::TEXT_EXTRACTION] Texto bruto completo:");
	console.log(rawText);
	const compacted = rawText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => Boolean(line))
		.join("\n");

	// Log do texto compactado
	console.log("[OAB::TEXT_EXTRACTION] Texto compactado:", {
		originalChars: rawText.length,
		compactedChars: compacted.length,
		originalLines: rawText.split("\n").length,
		compactedLines: compacted.split("\n").length,
	});
	console.log("[OAB::TEXT_EXTRACTION] Texto compactado completo:");
	console.log(compacted);

	const prompt =
		`Você receberá a transcrição integral de um padrão oficial de respostas da prova prático-profissional da OAB.\n` +
		`Sua tarefa é estruturar esse conteúdo em JSON no seguinte formato: {"meta": {...}, "schema_docs": {...}, "itens": [...]}.\n` +
		`Cada item representa um subitem de correção com os campos: id, escopo ("Peça" ou "Questão"), questao ("PEÇA" ou "Q1" etc.), descricao (texto objetivo), peso (número), fundamentos (lista de dispositivos legais em formato curto, ex.: "CPC art. 335"), alternativas_grupo (quando houver itens com OU, agrupe ids semelhantes), palavras_chave (sinônimos úteis), embedding_text (deixe vazio).\n` +
		`Converta pesos que aparecem como frações em números decimais. Não deixe campos nulos; use null apenas quando o padrão realmente não atribui pontuação.\n` +
		`Meta deve conter exam, area, data_aplicacao (YYYY-MM-DD) e quaisquer outros dados explícitos no cabeçalho.\n` +
		`Responda apenas com JSON válido.\n\n` +
		`Padrão de resposta transcrito (use todo o contexto):\n"""\n${compacted}\n"""`;

	// Log das estatísticas antes do envio para LLM
	console.log("[OAB::TEXT_EXTRACTION] Enviando para LLM:", {
		textLength: compacted.length,
		promptLength: prompt.length,
		model: options.model ?? DEFAULT_RUBRIC_MODEL,
	});

	const { openai } = await ensureOpenAIClient();
	const response = await openai.chat.completions.create({
		model: options.model ?? DEFAULT_RUBRIC_MODEL,
		temperature: 0,
		messages: [
			{
				role: "system",
				content:
					"Você é um analista jurídico da FGV especializado em normalizar padrões de resposta da OAB. Sempre responda com JSON válido.",
			},
			{
				role: "user",
				content: prompt,
			},
		],
		response_format: { type: "json_object" },
		max_tokens: 3500,
	});

	const content = response.choices[0]?.message?.content ?? "";

	// Robusto contra cercas ```json ... ``` ou texto extra
	const tryParsers: Array<() => any> = [
		() => JSON.parse(content),
		() => {
			const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
			if (fence) return JSON.parse(fence[1]);
			throw new Error("no fenced block");
		},
		() => {
			const start = content.indexOf("{");
			const end = content.lastIndexOf("}");
			if (start >= 0 && end > start) {
				return JSON.parse(content.slice(start, end + 1));
			}
			throw new Error("no json braces");
		},
		() => JSON.parse(jsonrepair(content)),
		() => {
			const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
			if (fence) return JSON.parse(jsonrepair(fence[1]));
			throw new Error("no fenced block");
		},
	];

	let rawObj: any;
	let lastErr: any;
	for (const fn of tryParsers) {
		try {
			rawObj = fn();
			break;
		} catch (e) {
			lastErr = e;
		}
	}
	if (!rawObj) {
		throw new Error(`Falha ao interpretar JSON do gabarito gerado: ${String(lastErr?.message || lastErr)}`);
	}

	// Coerção branda para estabilizar a estrutura vinda do LLM
	const coerceRubric = (raw: any) => {
		const safe: any = { ...raw };
		const itens = Array.isArray(raw?.itens) ? raw.itens : [];
		safe.itens = itens.map((it: any, idx: number) => {
			const id = typeof it?.id === "number" ? String(it.id) : String(it?.id ?? `I-${idx + 1}`);
			const escopo = typeof it?.escopo === "string" ? it.escopo : "Peça";
			const questao = typeof it?.questao === "string" ? it.questao : "PEÇA";
			const descricao = typeof it?.descricao === "string" ? it.descricao : String(it?.descricao ?? "");
			let peso = it?.peso;
			if (typeof peso === "string") {
				// converte "0,20" → 0.2 ou "0.20" → 0.2
				const normalized = peso.replace(/,/g, ".");
				const n = Number(normalized);
				if (!Number.isNaN(n)) peso = n;
			}
			if (peso != null && typeof peso !== "number") peso = null;

			const fundamentos = Array.isArray(it?.fundamentos)
				? it.fundamentos.map((f: any) => String(f))
				: it?.fundamentos
					? [String(it.fundamentos)]
					: [];

			let alternativas = it?.alternativas_grupo;
			if (alternativas == null) alternativas = [];
			if (!Array.isArray(alternativas)) alternativas = [alternativas];
			alternativas = alternativas.map((v: any) => String(v));

			const keywords = Array.isArray(it?.palavras_chave)
				? it.palavras_chave.map((k: any) => String(k))
				: it?.palavras_chave
					? [String(it.palavras_chave)]
					: [];

			return {
				id,
				escopo,
				questao,
				descricao,
				peso,
				fundamentos,
				alternativas_grupo: alternativas,
				palavras_chave: keywords,
				embedding_text: "", // preenchido abaixo
			};
		});
		return safe;
	};

	let parsed: RubricPayload;
	try {
		const coerced = coerceRubric(rawObj);
		parsed = RubricSchema.parse(coerced);
	} catch (error) {
		throw new Error(`Estrutura inválida do gabarito: ${(error as Error).message}`);
	}

	const itens = parsed.itens.map((item) => ({
		...item,
		peso: typeof item.peso === "number" ? Number(item.peso.toFixed(2)) : item.peso,
		embedding_text: composeEmbeddingText(item, parsed.meta),
	}));

	const normalized: RubricPayload = {
		meta: {
			...(parsed.meta ?? {}),
			fileName: options.fileName,
			generated_at: new Date().toISOString(),
		},
		schema_docs: parsed.schema_docs,
		itens,
	};

	return normalized;
}

const DEFAULT_SCHEMA_DOCS = {
	subitem_fields: [
		"id",
		"escopo",
		"questao",
		"descricao",
		"peso",
		"fundamentos",
		"alternativas_grupo",
		"palavras_chave",
		"embedding_text",
	],
	group_fields: [
		"id",
		"escopo",
		"questao",
		"indice",
		"rotulo",
		"segmento",
		"descricao",
		"descricao_bruta",
		"descricao_limpa",
		"peso_maximo",
		"pesos_opcoes",
		"pesos_brutos",
		"subitens",
	],
	notas: [
		"Itens com OU viram 'alternativas_grupo' para permitir múltiplos caminhos válidos.",
		"Fundamentos jurídicos listam artigos/leis/súmulas citadas no padrão.",
		"palavras_chave inclui sinônimos comuns.",
		"embedding_text é o texto canônico sugerido para gerar embeddings de alta qualidade.",
		"grupos agregam os subitens exatamente como o padrão oficial apresenta cada linha da tabela.",
	],
};

function convertDeterministicToPayload(parsed: GabaritoAtomico, fileName?: string): RubricPayload {
	const groupMap = new Map<string, string[]>();
	parsed.itens.forEach((item) => {
		if (item.ou_group_id) {
			if (!groupMap.has(item.ou_group_id)) {
				groupMap.set(item.ou_group_id, []);
			}
			groupMap.get(item.ou_group_id)!.push(item.id);
		}
	});

	const preferredVariants: Record<string, string> = {};
	for (const grupo of parsed.grupos ?? []) {
		if (grupo.variant_family && grupo.variant_key && !preferredVariants[grupo.variant_family]) {
			preferredVariants[grupo.variant_family] = grupo.variant_key;
		}
	}

	return {
		meta: {
			exam: parsed.meta.exam,
			area: parsed.meta.area,
			data_aplicacao: parsed.meta.data_aplicacao,
			fonte: parsed.meta.fonte,
			versao_schema: parsed.meta.versao_schema,
			gerado_em: parsed.meta.gerado_em,
			fileName,
			...(Object.keys(preferredVariants).length ? { preferred_variants: preferredVariants } : {}),
		},
		schema_docs: DEFAULT_SCHEMA_DOCS,
		itens: parsed.itens.map((item) => ({
			id: item.id,
			escopo: item.escopo,
			questao: item.questao,
			descricao: item.descricao,
			peso: item.peso,
			fundamentos: item.fundamentos,
			alternativas_grupo: item.ou_group_id ? groupMap.get(item.ou_group_id) : undefined,
			palavras_chave: item.palavras_chave,
			embedding_text: item.embedding_text,
		})),
		grupos: (parsed.grupos || []).map((grupo) => ({
			id: grupo.id,
			escopo: grupo.escopo,
			questao: grupo.questao,
			indice: grupo.indice,
			rotulo: grupo.rotulo,
			segmento: grupo.segmento ?? null,
			descricao: grupo.descricao,
			descricao_bruta: grupo.descricao_bruta,
			descricao_limpa: grupo.descricao_limpa,
			peso_maximo: Number((grupo.peso_maximo ?? 0).toFixed(2)),
			pesos_opcoes: (grupo.pesos_opcoes || []).map((p) => Number(p.toFixed(2))),
			pesos_brutos: (grupo.pesos_brutos || []).map((p) => Number(p.toFixed(2))),
			subitens: grupo.subitens,
			variant_family: grupo.variant_family,
			variant_key: grupo.variant_key,
			variant_label: grupo.variant_label,
		})),
	};
}

function convertDate(date: string | undefined) {
	if (!date) return undefined;
	const m = date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
	if (!m) return date;
	return `${m[3]}-${m[2]}-${m[1]}`;
}

function extractMetaFromText(
	rawText: string,
	fallback: { exam?: string; area?: string; data_aplicacao?: string },
): ParseMetaInput {
	const exam = rawText.match(/\d+º Exame de Ordem Unificado/i)?.[0]?.trim() ?? fallback.exam ?? "Exame OAB";
	const area = rawText.match(/ÁREA:\s*([^\n]+)/i)?.[1]?.trim() ?? fallback.area ?? "Área não identificada";
	const dataBruta = rawText.match(/Aplicada em\s*([^\n]+)/i)?.[1]?.trim() ?? fallback.data_aplicacao;

	return {
		exam,
		area,
		data_aplicacao: convertDate(dataBruta),
		fonte: "Padrão de Resposta da FGV",
	};
}

function shouldFallback(parsed: GabaritoAtomico) {
	if (!parsed.itens.length) return true;
	// até 15% de pesos nulos tolerados (OCR difícil / PDF ruim)
	const nullCount = parsed.itens.filter((it) => it.peso == null).length;
	const ratio = parsed.itens.length ? nullCount / parsed.itens.length : 1;
	if (ratio > 0.15) return true;

	// verificação quantitativa oficial (com tolerâncias)
	const v = verificarPontuacao(parsed.itens);
	// só cai em fallback se alguma parte sair da faixa de tolerância
	if (!v.peca.ok) return true;
	if (!v.questoes.ok) return true;
	if (!v.geral.ok) return true;
	return false;
}

export async function buildRubricFromPdf(buffer: Buffer, options: BuildRubricOptions = {}) {
	const rawText = await extractTextFromPdf(buffer);

	// Log sempre ativo para debug - forçar exibição do texto
	console.log("[OAB::DEBUG_TEXT] FORÇA DEBUG - DEBUG_GABARITO =", process.env.DEBUG_GABARITO);
	console.log("[OAB::DEBUG_TEXT] Texto completo extraído do PDF:");
	console.log("=".repeat(80));
	console.log(rawText);
	console.log("=".repeat(80));
	console.log(`[OAB::DEBUG_TEXT] Total de ${rawText.length} caracteres`);

	const metaInput = extractMetaFromText(rawText, {});

	const deterministic = parseGabaritoDeterministico(rawText, metaInput);
	const fallback = shouldFallback(deterministic);

	if (!fallback) {
		const payload = convertDeterministicToPayload(deterministic, options.fileName);
		const verificacao = verificarPontuacao(deterministic.itens);

		const gruposDet = deterministic.grupos ?? [];
		const gruposPeca = gruposDet.filter((g) => g.questao === "PEÇA");
		const gruposQuestoes = gruposDet.filter((g) => g.questao !== "PEÇA");
		const gruposPorVariant = gruposDet.reduce<Record<string, string[]>>((acc, grupo) => {
			const key = `${grupo.questao}::${grupo.variant_family || "default"}::${grupo.variant_key || "default"}`;
			if (!acc[key]) acc[key] = [];
			acc[key].push(grupo.id);
			return acc;
		}, {});

		console.info("[OAB::RUBRIC_UPLOAD::DETERMINISTIC]", {
			itens: payload.itens.length,
			meta: payload.meta,
			pontuacao: {
				peca: { total: verificacao.peca.total, ok: verificacao.peca.ok },
				questoes: { total: verificacao.questoes.total, ok: verificacao.questoes.ok },
				geral: { total: verificacao.geral.total, ok: verificacao.geral.ok },
			},
			grupos: {
				total: gruposDet.length,
				peca: {
					total: gruposPeca.length,
					ids: gruposPeca.map((g) => g.id),
				},
				questoes: {
					total: gruposQuestoes.length,
					ids: gruposQuestoes.map((g) => g.id),
				},
				por_variant: gruposPorVariant,
			},
		});
		return payload;
	}

	// 🚫 FALLBACK LLM PODE SER DESABILITADO VIA ENV VAR PARA TESTES
	// ⚠️  CONTROLE: OAB_EVAL_FORCE_DETERMINISTIC=1 força sempre parser determinístico
	const FORCE_DETERMINISTIC = process.env.OAB_EVAL_FORCE_DETERMINISTIC === "1";

	// Diagnóstico detalhado do fallback
	const nullCount = deterministic.itens.filter((it) => it.peso == null).length;
	const nullRatio = deterministic.itens.length ? nullCount / deterministic.itens.length : 1;
	const hasMissingParts = deterministic.itens.some((it) => it.flags?.missingParts);

	console.warn("[OAB::RUBRIC_UPLOAD::FALLBACK] Acionando LLM devido a inconsistências", {
		itensDeterministicos: deterministic.itens.length,
		forceDeterministic: FORCE_DETERMINISTIC,
		diagnostico: {
			itensComPesoNulo: nullCount,
			ratioNulos: Number((nullRatio * 100).toFixed(1)) + "%",
			limiteTolerado: "15%",
			temPartesAusentes: hasMissingParts,
			itensProblematicos: deterministic.itens
				.filter((it) => it.peso == null)
				.map((it) => ({
					id: it.id,
					questao: it.questao,
					escopo: it.escopo,
					descricao: it.descricao.substring(0, 150) + "...",
					temOuGroup: !!it.ou_group_id,
					ouGroupId: it.ou_group_id,
				})),
		},
	});

	// Log detalhado dos primeiros 5 itens problemáticos para análise
	const problematicos = deterministic.itens.filter((it) => it.peso == null).slice(0, 5);
	if (problematicos.length > 0) {
		console.warn("[OAB::RUBRIC_UPLOAD::FALLBACK::DETAILED_ANALYSIS] Primeiros itens problemáticos:");
		problematicos.forEach((item, idx) => {
			console.warn(`[${idx + 1}/${problematicos.length}]`, {
				id: item.id,
				questao: item.questao,
				escopo: item.escopo,
				descricaoCompleta: item.descricao,
				peso: item.peso,
				temOuGroup: !!item.ou_group_id,
				ouGroupId: item.ou_group_id,
				fundamentos: item.fundamentos,
				flags: item.flags,
			});
		});
	}

	if (!FORCE_DETERMINISTIC) {
		return buildRubricFromPdfLLM(buffer, options, rawText);
	}

	// 🧪 MODO TESTE: Mostra que LLM seria chamada mas foi forçado parser determinístico
	const payload = convertDeterministicToPayload(deterministic, options.fileName);
	const verificacao = verificarPontuacao(deterministic.itens);

	const gruposDet = deterministic.grupos ?? [];
	const gruposPeca = gruposDet.filter((g) => g.questao === "PEÇA");
	const gruposQuestoes = gruposDet.filter((g) => g.questao !== "PEÇA");
	const gruposPorVariant = gruposDet.reduce<Record<string, string[]>>((acc, grupo) => {
		const key = `${grupo.questao}::${grupo.variant_family || "default"}::${grupo.variant_key || "default"}`;
		if (!acc[key]) acc[key] = [];
		acc[key].push(grupo.id);
		return acc;
	}, {});

	console.error("[OAB::RUBRIC_UPLOAD::FORCED_DETERMINISTIC] LLM seria acionada mas foi forçado parser determinístico", {
		itens: payload.itens.length,
		meta: payload.meta,
		pontuacao: {
			peca: { total: verificacao.peca.total, ok: verificacao.peca.ok },
			questoes: { total: verificacao.questoes.total, ok: verificacao.questoes.ok },
			geral: { total: verificacao.geral.total, ok: verificacao.geral.ok },
		},
		grupos: {
			total: gruposDet.length,
			peca: {
				total: gruposPeca.length,
				ids: gruposPeca.map((g) => g.id),
			},
			questoes: {
				total: gruposQuestoes.length,
				ids: gruposQuestoes.map((g) => g.id),
			},
			por_variant: gruposPorVariant,
		},
		fallbackReasons: {
			noItems: !deterministic.itens.length,
			hasNullWeights: deterministic.itens.some((it) => it.peso == null),
			hasMissingParts: deterministic.itens.some((it) => it.flags?.missingParts),
		},
	});
	return payload;
}
