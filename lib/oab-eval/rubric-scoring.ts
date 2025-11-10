import { verificarPontuacao, type Subitem } from "@/lib/oab/gabarito-parser-deterministico";
import type { RubricPayload } from "./types";

type RawExtractedData = Record<string, unknown>;

function roundToTwo(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number.parseFloat(value.toFixed(2));
}

function buildOuGroupId(ids?: string[]): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  const sorted = [...ids].sort();
  return `OG-${sorted.join('|')}`;
}

function normalizePeso(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  return roundToTwo(value);
}

function convertRubricToSubitems(
  rubric: RubricPayload,
  overrides?: Map<string, number>,
): Subitem[] {
  const overridesProvided = overrides instanceof Map;

  return rubric.itens.map((item) => {
    const override = overrides?.get(item.id);
    let pesoBase: number | null;

    if (override != null) {
      pesoBase = normalizePeso(override);
    } else if (overridesProvided) {
      pesoBase = 0;
    } else {
      pesoBase = normalizePeso(item.peso ?? null);
    }

    return {
      id: item.id,
      escopo: item.escopo === 'Questão' ? 'Questão' : 'Peça',
      questao: item.questao as any,
      descricao: item.descricao,
      peso: pesoBase ?? 0,
      fundamentos: item.fundamentos ?? [],
      palavras_chave: item.palavras_chave ?? [],
      embedding_text: item.embedding_text ?? '',
      ou_group_id: buildOuGroupId(item.alternativas_grupo),
      ou_group_mode: 'pick_best',
    } satisfies Subitem;
  });
}

export function sanitizeRawScore(raw: unknown, maxPeso?: number | null): number | null {
  let numeric: number | null = null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    numeric = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[não-visivel]') return null;
    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) numeric = parsed;
  }

  if (numeric == null) return null;

  let sanitized = roundToTwo(numeric);
  if (typeof maxPeso === 'number' && Number.isFinite(maxPeso)) {
    const limite = roundToTwo(Math.max(0, maxPeso));
    sanitized = Math.min(sanitized, limite);
  }

  if (sanitized < 0) return 0;
  return roundToTwo(sanitized);
}

export function buildScoreMap(
  rubric: RubricPayload,
  extractedData: RawExtractedData,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const item of rubric.itens) {
    const notaKey = `nota_obtida_${item.id}`;
    const rawValue = extractedData[notaKey];
    const sanitized = sanitizeRawScore(rawValue, item.peso ?? null);
    if (sanitized != null) {
      scores.set(item.id, sanitized);
    }
  }

  return scores;
}

export function verifyRubricTotals(
  rubric: RubricPayload,
  overrides?: Map<string, number>,
) {
  const subitems = convertRubricToSubitems(rubric, overrides);
  return verificarPontuacao(subitems);
}

export function prepareRubricScoring(
  rubric: RubricPayload,
  extractedData: RawExtractedData,
) {
  const expected = verifyRubricTotals(rubric);
  const scoreMap = buildScoreMap(rubric, extractedData);
  const obtained = verifyRubricTotals(rubric, scoreMap);

  return { expected, obtained, scoreMap };
}
