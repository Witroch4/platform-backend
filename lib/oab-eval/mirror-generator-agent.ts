import { z } from "zod";
import { processMultiImageUrlVisionRequest } from "./unified-vision-client";
import { getOabEvalConfig } from "@/lib/config";
import { getPrismaInstance } from "@/lib/connections";
import type { RubricPayload, RubricGroup, StudentMirrorPayload } from "./types";
import { prepareRubricScoring } from "./rubric-scoring";

// ============================================================================
// SCHEMAS & TYPES
// ============================================================================

const MirrorImageDescriptorSchema = z.object({
  id: z.string(),
  url: z.string(),
  nome: z.string().optional(),
  page: z.number().optional(),
});

type MirrorImageDescriptor = z.infer<typeof MirrorImageDescriptorSchema>;

// Schema removido - não precisamos mais preparar imagens com base64

/**
 * Estrutura de dados extraídos da imagem do espelho do aluno.
 * Cada chave corresponde ao ID de um item da rubrica (ex: "PECA-01A", "Q1-01A")
 */
export interface ExtractedMirrorData {
  nome_do_examinando?: string;
  inscricao?: string;
  nota_final?: string;
  situacao?: string;
  pontuacao_total_peca?: string;
  pontuacao_total_questoes?: string;
  // Notas por grupo: nota_total_<ID>
  // Fontes das notas: fonte_nota_total_<ID>
  // Coluna de origem das notas: coluna_nota_total_<ID>
  // Totais por questão: total_questao_Qn
  // Fonte/coluna dos totais por questão: fonte_total_questao_Qn, coluna_total_questao_Qn
  [itemId: string]: string | undefined; // Notas dos itens individuais (nota_obtida_PECA-01A, etc)
}

export interface MirrorGeneratorInput {
  leadId: string;
  especialidade: string;
  espelhoPadraoId?: string; // ID do OabRubric selecionado pelo usuário
  images: MirrorImageDescriptor[] | string[]; // Suporta URLs diretas ou descritores
  telefone?: string;
  nome?: string;
  onProgress?: (message: string) => Promise<void> | void;
}

export interface MirrorGeneratorOutput {
  extractedData: ExtractedMirrorData;
  structuredMirror: StructuredMirror;
  markdownMirror: string;
  jsonMirror: StudentMirrorPayload;
}

interface StructuredMirror {
  meta: {
    aluno: string;
    inscricao: string;
    area: string;
    notaFinal: number;
    situacao: string;
  };
  avaliacoes: {
    peca?: SectionEvaluation;
    questoes?: QuestionEvaluation[];
  };
  totais: {
    peca: number;
    questoes: number;
    final: number;
  };
}

interface SectionEvaluation {
  titulo: string;
  pontuacaoMaxima: number;
  pontuacaoObtida: number;
  itens: ItemEvaluation[];
}

interface QuestionEvaluation {
  questao: string;
  itens: ItemEvaluation[];
  pontuacaoMaxima: number;
  total: number;
}

interface ItemEvaluation {
  id: string;
  descricao: string;
  pesoMaximo: number;
  notaObtida: number;
  subitens?: SubItemEvaluation[];
}

interface SubItemEvaluation {
  id: string;
  descricao: string;
  pesoMaximo: number;
  notaObtida: number;
}

type ActiveGroupSelection = {
  rubric: RubricPayload;
  selectedVariants: Map<string, string>;
  activeGroupIds: Set<string>;
  activeSubitemIds: Set<string>;
};

type GroupOverrideMeta = {
  escopo: "Peça" | "Questão";
  questao?: string | null;
  reliable: boolean;
};

function filterRubricByActiveGroups(rubric: RubricPayload): ActiveGroupSelection {
  const allGroups = rubric.grupos ?? [];
  const variantMap = new Map<string, Map<string, RubricGroup[]>>();

  const slugFromLabel = (label: string) =>
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || '__DEFAULT__';

  allGroups.forEach((group) => {
    let family = group.variant_family;
    let key = group.variant_key;
    let label = group.variant_label;

    if (!family && group.segmento) {
      family = `${group.questao}_SEGMENTO`;
      key = slugFromLabel(group.segmento);
      label = group.segmento;
    }

    if (!family) return;
    const resolvedKey = key ?? "__DEFAULT__";
    if (!variantMap.has(family)) variantMap.set(family, new Map());
    const familyVariants = variantMap.get(family)!;
    const list = familyVariants.get(resolvedKey) ?? [];
    list.push(group);
    if (!group.variant_family) group.variant_family = family;
    if (!group.variant_key) group.variant_key = resolvedKey;
    if (!group.variant_label && label) group.variant_label = label;
    familyVariants.set(resolvedKey, list);
  });

  const selectedVariants = new Map<string, string>();
  const metaPreferred = ((rubric.meta || {}) as any)?.preferred_variants || {};

  variantMap.forEach((variants, family) => {
    let selected: string | undefined = metaPreferred[family];
    if (!selected) {
      const keys = Array.from(variants.keys());
      if (keys.length === 1) selected = keys[0];
      else {
        selected = keys.find((key) => {
          const groups = variants.get(key)!;
          return groups.some((g) => /agravo/i.test(`${g.variant_label || ''} ${g.segmento || ''} ${g.descricao || ''}`));
        }) ?? keys[0];
      }
    }

    // LOG: Debug de seleção de variantes
    if (process.env.DEBUG_GABARITO === '1' || true) {
      console.log(`[FilterRubric] 🔍 Família: ${family}`);
      console.log(`[FilterRubric]   Variantes disponíveis:`, Array.from(variants.keys()));
      console.log(`[FilterRubric]   Variante selecionada: ${selected}`);
      const selectedGroups = variants.get(selected!)?.map(g => g.id) || [];
      console.log(`[FilterRubric]   Grupos na variante selecionada (${selectedGroups.length}):`, selectedGroups);
    }

    selectedVariants.set(family, selected);
  });

  const activeGroups = allGroups.filter((group) => {
    if (!group.variant_family) return true;
    const selected = selectedVariants.get(group.variant_family);
    if (!selected) return true;
    return (group.variant_key ?? "__default__") === selected;
  });

  const inactiveGroups = allGroups.filter((group) => {
    if (!group.variant_family) return false;
    const selected = selectedVariants.get(group.variant_family);
    if (!selected) return false;
    return (group.variant_key ?? "__default__") !== selected;
  });

  // LOG: Resultado da filtragem
  if (process.env.DEBUG_GABARITO === '1' || true) {
    console.log(`[FilterRubric] ✅ Filtragem concluída:`);
    console.log(`[FilterRubric]   Total de grupos (bruto): ${allGroups.length}`);
    console.log(`[FilterRubric]   Grupos ativos: ${activeGroups.length}`);
    console.log(`[FilterRubric]   Grupos inativos: ${inactiveGroups.length}`);
    const pecaAtivos = activeGroups.filter(g => g.questao === 'PEÇA');
    const pecaInativos = inactiveGroups.filter(g => g.questao === 'PEÇA');
    console.log(`[FilterRubric]   PEÇA: ${pecaAtivos.length} ativos, ${pecaInativos.length} inativos`);
  }

  const excludedSubitems = new Set<string>();
  inactiveGroups.forEach((group) => {
    (group.subitens || []).forEach((id) => excludedSubitems.add(id));
  });

  const activeSubitemIds = new Set<string>();
  rubric.itens.forEach((item) => {
    if (!excludedSubitems.has(item.id)) activeSubitemIds.add(item.id);
  });

  const filteredRubric: RubricPayload = {
    ...rubric,
    itens: rubric.itens.filter((item) => activeSubitemIds.has(item.id)),
    grupos: activeGroups,
  };

  return {
    rubric: filteredRubric,
    selectedVariants,
    activeGroupIds: new Set(activeGroups.map((g) => g.id)),
    activeSubitemIds,
  };
}

function roundToTwo(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number.parseFloat(value.toFixed(2));
}

const SCORE_TOLERANCE = 0.05;

type TotalSelectionResult = {
  value: number;
  source: 'extracted' | 'computed';
};

type TotalSelectionInput = {
  label: string;
  extracted: number | null | undefined;
  computed: number;
  max: number;
  reference?: number | null;
  preferExtractedWhenComputedZero?: boolean;
};

function clampScore(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(Math.max(value, 0), max);
  return roundToTwo(clamped);
}

function selectConsistentTotal({
  label,
  extracted,
  computed,
  max,
  reference,
  preferExtractedWhenComputedZero = false,
}: TotalSelectionInput): TotalSelectionResult {
  const computedClamped = clampScore(computed, max);

  if (extracted == null) {
    return { value: computedClamped, source: 'computed' };
  }

  const extractedClamped = clampScore(extracted, max);
  const hasReference = reference != null && Number.isFinite(reference);
  const referenceClamped = hasReference ? clampScore(reference as number, max) : null;

  if (
    preferExtractedWhenComputedZero &&
    extractedClamped > SCORE_TOLERANCE &&
    computedClamped <= SCORE_TOLERANCE &&
    (referenceClamped == null || referenceClamped <= SCORE_TOLERANCE)
  ) {
    console.warn(
      `[MirrorGenerator] ℹ️ ${label}: sem evidência computada, adotando total extraído ${extractedClamped.toFixed(2)}.`,
    );
    return { value: extractedClamped, source: 'extracted' };
  }

  const diff = Math.abs(extractedClamped - computedClamped);

  const referenceDiff = referenceClamped != null
    ? Math.abs(extractedClamped - referenceClamped)
    : null;
  const referenceComputedDiff = referenceClamped != null
    ? Math.abs(computedClamped - referenceClamped)
    : null;

  const largeDisagreementThreshold = Math.max(0.9, max * 0.8);
  const largeReferenceDisagreement = referenceDiff != null && referenceDiff > largeDisagreementThreshold;
  const computedCloseToReference = referenceComputedDiff != null && referenceComputedDiff <= SCORE_TOLERANCE * 2;

  if (largeReferenceDisagreement && computedCloseToReference) {
    console.warn(
      `[MirrorGenerator] ⚠️ ${label}: valor extraído (${extractedClamped.toFixed(2)}) extremamente discrepante da soma dos itens (${referenceClamped!.toFixed(2)}). Mantendo total calculado ${computedClamped.toFixed(2)}.`,
    );
    return { value: computedClamped, source: 'computed' };
  }

  if (diff > SCORE_TOLERANCE) {
    if (referenceClamped != null && Math.abs(referenceClamped - computedClamped) <= SCORE_TOLERANCE) {
      console.warn(
        `[MirrorGenerator] ⚠️ ${label}: divergência detectada (extraído ${extractedClamped.toFixed(2)}, calculado ${computedClamped.toFixed(2)}, referência ${referenceClamped.toFixed(2)}). Mantendo valor calculado.`,
      );
      return { value: computedClamped, source: 'computed' };
    }

    if (referenceClamped != null) {
      console.warn(
        `[MirrorGenerator] ⚠️ ${label}: divergência detectada (extraído ${extractedClamped.toFixed(2)}, calculado ${computedClamped.toFixed(2)}, referência ${referenceClamped.toFixed(2)}). Priorizar valor extraído.`,
      );
    } else {
      console.warn(
        `[MirrorGenerator] ⚠️ ${label}: divergência detectada (extraído ${extractedClamped.toFixed(2)}, calculado ${computedClamped.toFixed(2)}). Priorizar valor extraído.`,
      );
    }
  }

  return { value: extractedClamped, source: 'extracted' };
}

function rebalanceOverridesForScope({
  scope,
  extractedTotal,
  groupOverrides,
  meta,
  fonteEvidence,
}: {
  scope: "Peça" | "Questão";
  extractedTotal: number | null;
  groupOverrides: Map<string, number>;
  meta: Map<string, GroupOverrideMeta>;
  fonteEvidence: Map<string, { raw: string | null; detected: number | null }>;
}) {
  if (extractedTotal == null || !Number.isFinite(extractedTotal)) return;

  const entries = Array.from(meta.entries()).filter(
    ([groupId, info]) => info.escopo === scope && groupOverrides.has(groupId),
  );
  if (!entries.length) return;

  let sum = roundToTwo(
    entries.reduce((acc, [groupId]) => acc + (groupOverrides.get(groupId) ?? 0), 0),
  );
  if (sum <= extractedTotal + SCORE_TOLERANCE) return;

  let diff = roundToTwo(sum - extractedTotal);
  if (diff <= SCORE_TOLERANCE) return;

  const scopeLabel = scope === "Peça" ? "PEÇA" : "QUESTÕES";

  const prioritized = (
    entries.filter(([, info]) => !info.reliable).length
      ? entries.filter(([, info]) => !info.reliable)
      : entries
  )
    .map(([groupId, info]) => ({
      groupId,
      info,
      value: groupOverrides.get(groupId) ?? 0,
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!prioritized.length) return;

  console.warn(
    `[MirrorGenerator::Rebalance] ⚠️ Ajustando ${scopeLabel} para alinhar com total extraído ${extractedTotal.toFixed(
      2,
    )}. Excedente inicial: ${diff.toFixed(2)}.`,
  );

  for (const entry of prioritized) {
    if (diff <= SCORE_TOLERANCE) break;
    const current = groupOverrides.get(entry.groupId);
    if (current == null || current <= 0) continue;

    const reduction = Math.min(current, diff);
    const newValue = roundToTwo(current - reduction);
    diff = roundToTwo(diff - reduction);

    if (newValue <= SCORE_TOLERANCE) {
      groupOverrides.delete(entry.groupId);
      const fonte = fonteEvidence.get(entry.groupId);
      if (fonte) {
        fonteEvidence.set(entry.groupId, { raw: fonte.raw, detected: 0 });
      }
    } else {
      groupOverrides.set(entry.groupId, newValue);
      const fonte = fonteEvidence.get(entry.groupId);
      if (fonte) {
        fonteEvidence.set(entry.groupId, { raw: fonte.raw, detected: newValue });
      }
    }
  }

  const adjustedSum = roundToTwo(
    entries.reduce((acc, [groupId]) => acc + (groupOverrides.get(groupId) ?? 0), 0),
  );
  const residual = roundToTwo(adjustedSum - extractedTotal);
  if (residual > SCORE_TOLERANCE) {
    console.warn(
      `[MirrorGenerator::Rebalance] ⚠️ Residual após ajuste em ${scopeLabel}: ${residual.toFixed(2)}.`,
    );
  }
}

function parseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.parseFloat(value.toFixed(2));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[não-visivel]') {
      return null;
    }

    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? Number.parseFloat(parsed.toFixed(2)) : null;
  }

  return null;
}

function normalizeFonteText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[não-visivel]') return null;
  return trimmed.replace(/\s+/g, ' ');
}

function parseNumericToken(token: string): number | null {
  const normalized = token.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Number.parseFloat(parsed.toFixed(2));
}

function detectScoreFromFonte(raw: unknown): number | null {
  const text = normalizeFonteText(raw);
  if (!text) return null;

  const ATT_REGEX = /atendimento[^0-9]*([\d]{1,2}(?:[.,]\d{1,2})?)/i;
  const TOTAL_REGEX = /total[^0-9]*([\d]{1,2}(?:[.,]\d{1,2})?)/i;

  const attMatch = text.match(ATT_REGEX);
  if (attMatch && attMatch[1]) {
    const parsed = parseNumericToken(attMatch[1]);
    if (parsed != null) return parsed;
  }

  const totalMatch = text.match(TOTAL_REGEX);
  if (totalMatch && totalMatch[1]) {
    const parsed = parseNumericToken(totalMatch[1]);
    if (parsed != null) return parsed;
  }

  if (/^0(?:[.,]00)?$/i.test(text)) return 0;

  const genericMatch = text.match(/([\d]{1,2}(?:[.,]\d{1,2})?)/);
  if (genericMatch && genericMatch[1]) {
    return parseNumericToken(genericMatch[1]);
  }

  return null;
}

function normalizeColumnLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (!normalized) return null;
  return normalized;
}

function isAttendanceColumn(label: string | null): boolean {
  if (!label) return false;
  if (/FAIXA/.test(label)) return false;

  const patterns = [
    /ATENDIMENTO AO QUESITO/,
    /\bATENDIMENTO\b/,
    /PONTUACAO OBTIDA/,
    /NOTA OBTIDA/,
    /PONTOS OBTIDOS?/,
  ];

  return patterns.some((regex) => regex.test(label));
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISION_MODEL = process.env.OAB_MIRROR_VISION_MODEL ?? "gpt-4.1";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Valida e normaliza URL da imagem para uso direto na API
 * A API OpenAI aceita: URLs HTTP/HTTPS, data URIs (base64), ou file IDs
 */
function normalizeImageUrl(descriptor: MirrorImageDescriptor): string {
  const { url } = descriptor;

  if (!url) {
    throw new Error("URL da imagem do espelho ausente");
  }

  // URLs HTTP/HTTPS, data URIs, e file IDs são aceitos diretamente
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("file-")) {
    return url;
  }

  throw new Error(`Formato de URL não suportado: ${url.substring(0, 50)}...`);
}

/**
 * Carrega configuração do blueprint do agente extrator de espelho
 */
async function getMirrorExtractorConfig(): Promise<{
  model: string;
  systemInstructions: string;
  maxOutputTokens: number;
}> {
  const prisma = getPrismaInstance();

  const baseInstructions = [
    "Você é um assistente especializado em extrair dados de espelhos de correção da OAB.",
    "Sua tarefa é identificar e extrair com precisão:",
    "1. Dados do candidato: nome, inscrição, nota final, situação (APROVADO/REPROVADO)",
    "2. Notas de cada item avaliado (formato: PECA-01A, Q1-01A, etc.)",
    "3. Totais parciais: pontuação da peça, pontuação das questões",
    "IMPORTANTE:",
    "- Retorne APENAS um objeto JSON válido",
    "- Quando um dado não estiver visível, use '[não-visivel]'",
    "- Para notas, use formato numérico com 2 casas decimais (ex: '0.65', '1.25')",
    "- IDs dos itens devem manter o formato exato da rubrica",
  ].join(" ");

  // 1) Tentar AiAgentBlueprint (MTF Agents Builder)
  try {
    const bpId = process.env.OAB_MIRROR_EXTRACTOR_BLUEPRINT_ID;
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
            { name: { contains: 'Espelho', mode: 'insensitive' } },
            { name: { contains: 'Mirror', mode: 'insensitive' } },
            { name: { contains: 'Extrator', mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true },
      });
    }

    if (blueprint) {
      const model = blueprint.model || DEFAULT_VISION_MODEL;
      // 0 = ilimitado (omite parâmetro na chamada da API)
      const maxOutputTokens = Number(blueprint.maxOutputTokens ?? 0);
      const sys = (blueprint.systemPrompt || blueprint.instructions || baseInstructions).toString();
      const systemInstructions = sys.replace(/\s+/g, ' ');
      return { model, systemInstructions, maxOutputTokens };
    }
  } catch (err) {
    console.warn('[MirrorGenerator] Falha ao consultar AiAgentBlueprint:', err);
  }

  // 2) Fallback: defaults (0 = ilimitado)
  return { model: DEFAULT_VISION_MODEL, systemInstructions: baseInstructions, maxOutputTokens: 0 };
}

/**
 * Carrega rubrica estruturada do banco de dados
 */
async function loadRubric(especialidade: string, espelhoPadraoId?: string): Promise<RubricPayload> {
  const prisma = getPrismaInstance();

  let rubric;

  // Prioridade 1: Buscar por ID (se fornecido)
  if (espelhoPadraoId) {
    console.log(`[MirrorGenerator] 🔍 Buscando rubrica por ID: ${espelhoPadraoId}`);
    rubric = await (prisma as any).oabRubric.findUnique({
      where: { id: espelhoPadraoId },
    });

    if (rubric) {
      console.log(`[MirrorGenerator] ✅ Rubrica encontrada por ID: ${rubric.exam || 'Exame'} - ${(rubric.meta as any)?.area || rubric.area}`);
    }
  }

  // Prioridade 2: Buscar por especialidade (fallback)
  if (!rubric && especialidade) {
    console.log(`[MirrorGenerator] 🔍 Buscando rubrica para especialidade: ${especialidade}`);
    rubric = await (prisma as any).oabRubric.findFirst({
      where: {
        area: {
          equals: especialidade,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (rubric) {
      console.log(`[MirrorGenerator] ✅ Rubrica encontrada por especialidade: ${rubric.code} (${rubric.exam})`);
    }
  }

  if (!rubric) {
    throw new Error(
      espelhoPadraoId
        ? `Rubrica não encontrada para ID: ${espelhoPadraoId}`
        : `Rubrica não encontrada para especialidade: ${especialidade}`
    );
  }

  const schema = (rubric.schema || {}) as any;

  return {
    meta: schema.meta ?? rubric.meta ?? {},
    schema_docs: schema.schema_docs ?? {},
    itens: schema.itens ?? [],
    grupos: schema.grupos ?? [],
  };
}

/**
 * Extrai dados do espelho usando LLM vision
 */
async function extractMirrorDataFromImages(
  imageUrls: string[],
  rubric: RubricPayload,
  model: string,
  systemInstructions: string,
  maxOutputTokens: number,
): Promise<ExtractedMirrorData> {
  console.log(`[MirrorGenerator] 🖼️ Extraindo dados de ${imageUrls.length} imagem(ns) do espelho`);

  // Construir lista de IDs esperados da rubrica (subitens e grupos)
  const expectedSubitemIds = rubric.itens.map(item => item.id);
  const grupos = rubric.grupos ?? [];
  const expectedGroupIds = grupos.map(grupo => grupo.id);
  const subitemMap = new Map(rubric.itens.map(item => [item.id, item] as const));

  // 📊 LOG: Estatísticas da rubrica
  console.log(`[MirrorGenerator::Rubrica] 📋 Total de itens: ${rubric.itens.length}`);
  console.log(`[MirrorGenerator::Rubrica] 🔑 Grupos (${expectedGroupIds.length}):`, expectedGroupIds);
  console.log(`[MirrorGenerator::Rubrica] 🔑 Subitens (${expectedSubitemIds.length}):`, expectedSubitemIds);

  // Calcular totais por escopo
  const pecaItens = rubric.itens.filter(i => i.escopo === "Peça");
  const questaoItens = rubric.itens.filter(i => i.escopo === "Questão");
  const pecaTotal = pecaItens.reduce((sum, i) => sum + (i.peso ?? 0), 0);
  const questaoTotal = questaoItens.reduce((sum, i) => sum + (i.peso ?? 0), 0);

  console.log(`[MirrorGenerator::Rubrica] 📊 Estatísticas:`);
  console.log(`  - PEÇA: ${pecaItens.length} itens, ${pecaTotal.toFixed(2)} pontos`);
  console.log(`  - QUESTÕES: ${questaoItens.length} itens, ${questaoTotal.toFixed(2)} pontos`);
  console.log(`  - TOTAL: ${(pecaTotal + questaoTotal).toFixed(2)} pontos`);

  const notasIntro = grupos.length
    ? [
        "3. NOTAS DOS GRUPOS:",
        "Para cada grupo abaixo, informe a nota total obtida (formato: X.XX):",
      ]
    : [
        "3. NOTAS DOS ITENS:",
        "Para cada item abaixo, extraia a nota obtida (formato: X.XX):",
      ];

  const groupPromptLines = grupos.length
    ? grupos.flatMap((grupo) => {
        const headerParts = [] as string[];
        if (grupo.segmento) headerParts.push(grupo.segmento);
        const descricaoBase = grupo.descricao_bruta || grupo.descricao || `Grupo ${grupo.indice}`;
        headerParts.push(descricaoBase);
        const headerLabel = headerParts.join(" – ");
        const header = `- ${headerLabel} (máx ${grupo.peso_maximo.toFixed(2)}):`;
        const totalLine = `   - nota_total_${grupo.id}`;
        const fonteLine = `   - fonte_nota_total_${grupo.id}`;
        const colunaLine = `   - coluna_nota_total_${grupo.id}`;
        return [header, totalLine, fonteLine, colunaLine];
      })
    : expectedSubitemIds.map(id => `   - nota_obtida_${id}`);

  const userPrompt = [
    "Analise as imagens do espelho de correção e extraia os seguintes dados:",
    "",
    "1. DADOS DO CANDIDATO:",
    "   - nome_do_examinando: nome completo",
    "   - inscricao: número de inscrição",
    "   - nota_final: nota final (formato: X.XX)",
    "   - situacao: APROVADO ou REPROVADO",
    "",
    "2. TOTAIS:",
    "   - pontuacao_total_peca: total obtido na peça profissional",
    "   - pontuacao_total_questoes: total obtido nas questões",
    "",
  ...notasIntro,
  ...groupPromptLines,
  "",
  "4. TOTAIS POR QUESTÃO:",
  "   - total_questao_Q1",
  "   - fonte_total_questao_Q1",
  "   - coluna_total_questao_Q1",
  "   - total_questao_Q2",
  "   - fonte_total_questao_Q2",
  "   - coluna_total_questao_Q2",
  "   - total_questao_Q3",
  "   - fonte_total_questao_Q3",
  "   - coluna_total_questao_Q3",
  "   - total_questao_Q4",
  "   - fonte_total_questao_Q4",
  "   - coluna_total_questao_Q4",
  "",
  "5. FONTES DAS NOTAS:",
  "   - Para cada linha usada na etapa 3, inclua também `fonte_nota_total_<ID>` contendo exatamente o texto lido na célula de atendimento ao quesito correspondente (ex.: 'Atendimento ao quesito: 0,00').",
  "   - Se não for possível ler a célula, use '[não-visivel]'.",
  "",
  "6. IDENTIFICAÇÃO DA COLUNA:",
  "   - Para cada nota da etapa 3, informe `coluna_nota_total_<ID>` com o nome da coluna de onde o valor foi lido (ex.: 'ATENDIMENTO AO QUESITO', 'FAIXA DE VALORES').",
  "   - Para cada total da etapa 4, informe também `fonte_total_questao_Qn` e `coluna_total_questao_Qn`.",
  "   - Se você perceber que o número está na coluna 'FAIXA DE VALORES', devolva nota '0.00' e marque `coluna_nota_total_<ID>` como 'FAIXA DE VALORES'. Nunca use valores da faixa como nota.",
  "",
  "IMPORTANTE:",
    "- Leia SEMPRE a coluna ou campo que mostre a nota efetivamente recebida pelo aluno (ex.: 'ATENDIMENTO AO QUESITO', 'PONTUAÇÃO OBTIDA', 'NOTA OBTIDA', 'ATENDIMENTO', 'Pontos obtidos').",
    "- IGNORE faixas de valores, valores máximos ou referências como '0,00 / 0,55 / 0,65' ou '(0,55)': esses números representam limites possíveis ou pesos e não a nota do aluno.",
    "- Exemplo: se a tabela apresentar 'FAIXA DE VALORES: 0,00 / 0,55 / 0,65' e 'ATENDIMENTO AO QUESITO: 0,00', a nota correta que deve ser retornada é '0.00'.",
    "- Ao preencher `fonte_nota_total_<ID>`, copie o texto completo da célula da coluna de nota (por exemplo: 'ATENDIMENTO AO QUESITO: 0,00'). Se não encontrar o texto, retorne '[não-visivel]' e considere a nota como '0.00'.",
    "- Faça uma checagem final: some todas as notas informadas e confirme que batem com os totais exibidos no espelho. Se a soma ficar maior, revise os itens e corrija para refletir apenas o valor da coluna de nota do aluno.",
    "- Quando a célula de atendimento estiver vazia, contiver '0', '-', 'não atendido' ou equivalente, retorne '0.00'.",
    "- Retorne APENAS um objeto JSON válido",
    "- Use '[não-visivel]' para dados não disponíveis",
    "- Formato de notas: sempre com ponto decimal (ex: '0.65', '1.25')",
  ].join("\n");

  // 📝 LOG: Prompt completo sendo enviado
  console.log(`[MirrorGenerator::Prompt] 📤 Enviando prompt para Vision AI (${userPrompt.length} chars):`);
  console.log(`[MirrorGenerator::Prompt] ───────────────────────────────────────────`);
  console.log(userPrompt);
  console.log(`[MirrorGenerator::Prompt] ───────────────────────────────────────────`);

  // Cliente unificado: suporta OpenAI e Gemini automaticamente
  const response = await processMultiImageUrlVisionRequest({
    model,
    systemInstructions,
    userPrompt,
    imageUrls,
    maxOutputTokens,
  });

  console.log(`[MirrorGenerator] 🤖 Provider utilizado: ${response.provider}`);

  const rawText = response.text;

  // Tentar parsear JSON
  try {
    // Limpar possíveis markdown code blocks
    const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const extracted = JSON.parse(cleanedText);

    console.log(`[MirrorGenerator] ✅ Dados extraídos com sucesso`);
    console.log(`[MirrorGenerator] 📊 Aluno: ${extracted.nome_do_examinando || 'N/A'}, Nota: ${extracted.nota_final || 'N/A'}`);

    // 📊 LOG: Resposta completa da OpenAI
    console.log(`[MirrorGenerator::Response] 📥 JSON extraído da OpenAI (${Object.keys(extracted).length} chaves):`);
    console.log(`[MirrorGenerator::Response] ───────────────────────────────────────────`);
    console.log(JSON.stringify(extracted, null, 2));
    console.log(`[MirrorGenerator::Response] ───────────────────────────────────────────`);

    // Contar quantas notas foram extraídas
  const notasExtraidas = Object.keys(extracted).filter(k => k.startsWith('nota_obtida_')).length;
  const totaisExtraidos = Object.keys(extracted).filter(k => k.startsWith('nota_total_')).length;
  const fontesExtraidas = Object.keys(extracted).filter(k => k.startsWith('fonte_nota_total_')).length;
  const colunasExtraidas = Object.keys(extracted).filter(k => k.startsWith('coluna_nota_total_')).length;
  const totaisQuestoesExtraidos = Object.keys(extracted).filter(k => k.startsWith('total_questao_')).length;
  const fontesTotaisQuestoes = Object.keys(extracted).filter(k => k.startsWith('fonte_total_questao_')).length;
  const colunasTotaisQuestoes = Object.keys(extracted).filter(k => k.startsWith('coluna_total_questao_')).length;
    if (expectedGroupIds.length) {
      console.log(`[MirrorGenerator::Response] 🔢 Totais extraídos: ${totaisExtraidos}/${expectedGroupIds.length}`);
      if (notasExtraidas > 0) {
        console.log(`[MirrorGenerator::Response] (info) Subitens extraídos: ${notasExtraidas}/${expectedSubitemIds.length}`);
      }
    console.log(`[MirrorGenerator::Response] 🔢 Totais por questão extraídos: ${totaisQuestoesExtraidos}/4`);
    console.log(`[MirrorGenerator::Response] (info) Fontes extraídas: ${fontesExtraidas}/${expectedGroupIds.length}`);
    console.log(`[MirrorGenerator::Response] (info) Colunas extraídas: ${colunasExtraidas}/${expectedGroupIds.length}`);
    console.log(`[MirrorGenerator::Response] (info) Fontes totais por questão: ${fontesTotaisQuestoes}/4, Colunas totais por questão: ${colunasTotaisQuestoes}/4`);
    } else {
      console.log(`[MirrorGenerator::Response] 🔢 Itens extraídos: ${notasExtraidas}/${expectedSubitemIds.length}`);
    }

    return extracted as ExtractedMirrorData;
  } catch (err) {
    console.error('[MirrorGenerator] ❌ Erro ao parsear JSON extraído:', err);
    console.error('[MirrorGenerator] Raw text:', rawText.substring(0, 500));
    throw new Error('Falha ao parsear dados extraídos do espelho');
  }
}

/**
 * Mapeia dados extraídos para estrutura organizada
 */
function buildStructuredMirror(
  rubric: RubricPayload,
  extractedData: ExtractedMirrorData,
): StructuredMirror {
  const { expected, obtained, scoreMap } = prepareRubricScoring(rubric, extractedData);
  const gruposRubrica = rubric.grupos ?? [];
  const possuiGrupos = gruposRubrica.length > 0;
  const subitemMap = new Map(rubric.itens.map((item) => [item.id, item] as const));

  const extractedTotalPeca = parseScore(extractedData.pontuacao_total_peca);
  const extractedTotalQuestoes = parseScore(extractedData.pontuacao_total_questoes);
  const extractedFinal = parseScore(extractedData.nota_final);

  const groupTotalOverrides = new Map<string, number>();
  const groupFonteEvidence = new Map<string, { raw: string | null; detected: number | null }>();
  const groupOverrideMeta = new Map<string, GroupOverrideMeta>();
  let pieceOverrideSum = 0;
  let pieceOverrideCount = 0;
  const questionOverrideTotals = new Map<string, { sum: number; count: number }>();
  const questionReportedTotals = new Map<string, number>();

  if (possuiGrupos) {
    for (const grupo of gruposRubrica) {
      const overrideRaw = extractedData[`nota_total_${grupo.id}`];
      const fonteKey = `fonte_nota_total_${grupo.id}`;
      const colunaKey = `coluna_nota_total_${grupo.id}`;
      const fonteRaw = extractedData[fonteKey];
      const fonteNormalized = normalizeFonteText(fonteRaw);
      const fonteDetected = detectScoreFromFonte(fonteRaw);
      const colunaNormalized = normalizeColumnLabel(extractedData[colunaKey]);
      const colunaValida = isAttendanceColumn(colunaNormalized);

      if (process.env.DEBUG_MIRROR_GROUPS === '1' && (fonteNormalized || colunaNormalized)) {
        console.log(
          `[MirrorGenerator::Fonte] Grupo ${grupo.id} -> fonte='${fonteNormalized ?? '[null]'}', detectado=${fonteDetected != null ? fonteDetected.toFixed(2) : 'null'}, coluna='${colunaNormalized ?? '[null]'}'`,
        );
      }

      groupFonteEvidence.set(grupo.id, {
        raw: fonteNormalized,
        detected: fonteDetected,
      });

      if (!colunaValida) {
        if (fonteNormalized) {
          console.warn(
            `[MirrorGenerator::Fonte] ⚠️ Ignorando nota do grupo ${grupo.id} por ter sido lida da coluna '${colunaNormalized ?? 'DESCONHECIDA'}'.`,
          );
        }
        continue;
      }

      const override = parseScore(overrideRaw);
      let normalizedOverride = override != null ? roundToTwo(override) : null;

      if (normalizedOverride != null && fonteDetected != null && Math.abs(fonteDetected - normalizedOverride) > SCORE_TOLERANCE) {
        console.warn(
          `[MirrorGenerator::Fonte] ⚠️ Ajustando grupo ${grupo.id}: override extraído=${normalizedOverride.toFixed(2)}, fonte indica ${fonteDetected.toFixed(2)}. Usando valor da fonte.`,
        );
        normalizedOverride = roundToTwo(fonteDetected);
      } else if (normalizedOverride == null && fonteDetected != null) {
        normalizedOverride = roundToTwo(fonteDetected);
      }

      if (normalizedOverride != null) {
        const fonteHasAlpha = fonteNormalized ? /[A-Za-zÀ-ÿ]/.test(fonteNormalized) : false;
        const fonteMentionsScore = fonteNormalized
          ? /(ATENDIMENTO|PONTUA|NOTA|PONTOS?|OBTIDA|OBTIDOS?)/i.test(fonteNormalized)
          : false;
        const overrideReliable = colunaValida && fonteHasAlpha && fonteMentionsScore;

        groupTotalOverrides.set(grupo.id, normalizedOverride);
        groupOverrideMeta.set(grupo.id, {
          escopo: grupo.escopo === "Peça" ? "Peça" : "Questão",
          questao: grupo.questao,
          reliable: overrideReliable,
        });

        const existingFonte = groupFonteEvidence.get(grupo.id);
        groupFonteEvidence.set(grupo.id, {
          raw: existingFonte?.raw ?? fonteNormalized ?? null,
          detected: normalizedOverride,
        });
      }
    }
  }

  rebalanceOverridesForScope({
    scope: "Peça",
    extractedTotal: extractedTotalPeca,
    groupOverrides: groupTotalOverrides,
    meta: groupOverrideMeta,
    fonteEvidence: groupFonteEvidence,
  });

  rebalanceOverridesForScope({
    scope: "Questão",
    extractedTotal: extractedTotalQuestoes,
    groupOverrides: groupTotalOverrides,
    meta: groupOverrideMeta,
    fonteEvidence: groupFonteEvidence,
  });

  const recomputeOverrideAggregates = () => {
    pieceOverrideSum = 0;
    pieceOverrideCount = 0;
    questionOverrideTotals.clear();

    for (const [groupId, value] of groupTotalOverrides.entries()) {
      const meta = groupOverrideMeta.get(groupId);
      if (!meta) continue;
      const sanitizedValue = roundToTwo(value);
      if (sanitizedValue <= SCORE_TOLERANCE) continue;

      if (meta.escopo === "Peça") {
        pieceOverrideSum = roundToTwo(pieceOverrideSum + sanitizedValue);
        pieceOverrideCount += 1;
      } else if (meta.escopo === "Questão" && meta.questao) {
        const entry = questionOverrideTotals.get(meta.questao) ?? { sum: 0, count: 0 };
        entry.sum = roundToTwo(entry.sum + sanitizedValue);
        entry.count += 1;
        questionOverrideTotals.set(meta.questao, entry);
      }
    }
  };

  recomputeOverrideAggregates();

  (["Q1", "Q2", "Q3", "Q4"] as const).forEach((questao) => {
    const totalKey = `total_questao_${questao}`;
    const fonteKey = `fonte_total_questao_${questao}`;
    const colunaKey = `coluna_total_questao_${questao}`;
    const reported = parseScore(extractedData[totalKey]);
    const fonteTexto = normalizeFonteText(extractedData[fonteKey]);
    const colunaTexto = normalizeColumnLabel(extractedData[colunaKey]);

    if (process.env.DEBUG_MIRROR_GROUPS === '1') {
      console.log(
        `[MirrorGenerator::TotalQuestao] ${questao} -> total=${reported != null ? reported.toFixed(2) : 'null'}, fonte='${fonteTexto ?? '[null]'}', coluna='${colunaTexto ?? '[null]'}'`,
      );
    }

    if (reported != null) {
      questionReportedTotals.set(questao, reported);
    }

    if (reported != null && colunaTexto && /FAIXA/.test(colunaTexto)) {
      console.warn(
        `[MirrorGenerator::TotalQuestao] ⚠️ ${questao} informado pela coluna '${colunaTexto}'. Valor será ignorado.`,
      );
      questionReportedTotals.set(questao, 0);
    }
  });

  questionReportedTotals.forEach((reported, questao) => {
    const overridesInfo = questionOverrideTotals.get(questao);
    const sumOverrides = overridesInfo?.sum ?? 0;
    if (reported <= SCORE_TOLERANCE && sumOverrides > SCORE_TOLERANCE) {
      const gruposQuestao = gruposRubrica.filter((g) => g.questao === questao);
      gruposQuestao.forEach((grupo) => {
        if (groupTotalOverrides.has(grupo.id)) {
          groupTotalOverrides.set(grupo.id, 0);
        }
        const fonte = groupFonteEvidence.get(grupo.id);
        if (fonte) {
          groupFonteEvidence.set(grupo.id, { raw: fonte.raw, detected: 0 });
        }
      });
      questionOverrideTotals.set(questao, {
        sum: 0,
        count: gruposQuestao.length,
      });
      console.warn(
        `[MirrorGenerator::QuestionTotals] ⚠️ Total da ${questao} reportado como 0.00. Zerando ${gruposQuestao.length} grupo(s) para alinhar ao espelho.`,
      );
    } else if (Math.abs(reported - sumOverrides) > SCORE_TOLERANCE * 2) {
      console.warn(
        `[MirrorGenerator::QuestionTotals] ⚠️ Divergência na ${questao}: soma dos grupos=${sumOverrides.toFixed(2)}, total reportado=${reported.toFixed(2)}.`,
      );
    }
  });

  const pecaItems: ItemEvaluation[] = [];
  const questoesMap = new Map<string, ItemEvaluation[]>();

  if (possuiGrupos) {
    for (const grupo of gruposRubrica) {
      const subEvaluations: SubItemEvaluation[] = grupo.subitens.map((subId) => {
        const subItem = subitemMap.get(subId);
        const notaSanitizada = roundToTwo(scoreMap.get(subId) ?? 0);
        return {
          id: subId,
          descricao: subItem?.descricao ?? '',
          pesoMaximo: subItem?.peso ?? 0,
          notaObtida: notaSanitizada,
        };
      });

      const somaSubitens = subEvaluations.reduce((sum, sub) => sum + sub.notaObtida, 0);
      const override = groupTotalOverrides.get(grupo.id);
      const fonteInfo = groupFonteEvidence.get(grupo.id);
      if (override != null) {
        const diff = Math.abs(roundToTwo(override) - roundToTwo(somaSubitens));
        if (diff > SCORE_TOLERANCE) {
          const subResumo = subEvaluations.length
            ? subEvaluations.map((sub) => `${sub.id}:${sub.notaObtida.toFixed(2)}`).join(", ")
            : "nenhum subitem com nota extraída";
          console.warn(
            `[MirrorGenerator::GroupTotals] ⚠️ Divergência no grupo ${grupo.id}: override=${roundToTwo(override).toFixed(2)}, soma_subitens=${roundToTwo(somaSubitens).toFixed(2)}, max=${(grupo.peso_maximo ?? 0).toFixed(2)}. Fonte=${fonteInfo?.raw ?? '[sem fonte]'} Subitens: ${subResumo}`,
          );
        }
      } else if (process.env.DEBUG_MIRROR_GROUPS === '1' && subEvaluations.every((sub) => sub.notaObtida === 0)) {
        console.log(
          `[MirrorGenerator::GroupTotals] ℹ️ Grupo ${grupo.id} sem override e sem notas extraídas dos subitens.`,
        );
      }
      const notaGrupo = override != null ? override : somaSubitens;
      const notaCapped = roundToTwo(Math.min(notaGrupo, grupo.peso_maximo));
      const descricaoPrincipal = grupo.descricao_bruta || grupo.descricao || grupo.descricao_limpa || `Grupo ${grupo.indice}`;

      const evaluation: ItemEvaluation = {
        id: grupo.id,
        descricao: descricaoPrincipal,
        pesoMaximo: Number((grupo.peso_maximo ?? 0).toFixed(2)),
        notaObtida: notaCapped,
        subitens: subEvaluations,
      };

      if (grupo.escopo === "Peça") {
        pecaItems.push(evaluation);
      } else {
        const lista = questoesMap.get(grupo.questao) ?? [];
        lista.push(evaluation);
        questoesMap.set(grupo.questao, lista);
      }
    }
  } else {
    // Fallback: utilizar subitens diretamente quando não há grupos disponíveis
    for (const item of rubric.itens) {
      const notaSanitizada = roundToTwo(scoreMap.get(item.id) ?? 0);

      const evaluation: ItemEvaluation = {
        id: item.id,
        descricao: item.descricao,
        pesoMaximo: item.peso ?? 0,
        notaObtida: notaSanitizada,
      };

      if (item.escopo === "Peça") {
        pecaItems.push(evaluation);
      } else if (item.escopo === "Questão") {
        const lista = questoesMap.get(item.questao) ?? [];
        lista.push(evaluation);
        questoesMap.set(item.questao, lista);
      }
    }
  }

  const questoesEntries = Array.from(questoesMap.entries());
  const questoes: QuestionEvaluation[] = questoesEntries.map(([questao, itens]) => {
    const agregado = obtained.questoes.porQuestao[questao];
    const somaItens = roundToTwo(itens.reduce((sum, item) => sum + item.notaObtida, 0));
    const computedQuestaoTotal = somaItens > 0 ? somaItens : (agregado ? roundToTwo(agregado.total) : somaItens);
    const maximo = expected.questoes.porQuestao[questao]
      ? roundToTwo(expected.questoes.porQuestao[questao].esperado)
      : roundToTwo(itens.reduce((sum, item) => sum + item.pesoMaximo, 0));

    const overrideInfo = questionOverrideTotals.get(questao);
    const extractedQuestaoTotal = questionReportedTotals.has(questao)
      ? questionReportedTotals.get(questao)!
      : overrideInfo && overrideInfo.count > 0
        ? overrideInfo.sum
        : null;

    const selection = selectConsistentTotal({
      label: `QUESTÃO ${questao}`,
      extracted: extractedQuestaoTotal,
      computed: computedQuestaoTotal,
      max: maximo,
      reference: somaItens,
    });

    return { questao, itens, total: selection.value, pontuacaoMaxima: maximo };
  });

  questoes.sort((a, b) => a.questao.localeCompare(b.questao));

  const sumQuestoesSelecionadas = roundToTwo(questoes.reduce((sum, item) => sum + item.total, 0));

  let overrideQuestoesSum: number | null = null;
  if (questionOverrideTotals.size > 0) {
    let accumulator = 0;
    let hasOverride = false;
    for (const info of questionOverrideTotals.values()) {
      if (info.count > 0) {
        accumulator += info.sum;
        hasOverride = true;
      }
    }
    if (hasOverride) {
      overrideQuestoesSum = roundToTwo(accumulator);
    }
  }

  const computedTotalPeca = (() => {
    const somaItens = roundToTwo(pecaItems.reduce((sum, item) => sum + item.notaObtida, 0));
    if (somaItens > 0) {
      return roundToTwo(Math.min(somaItens, expected.peca.esperado));
    }
    return roundToTwo(obtained.peca.total);
  })();
  const computedTotalQuestoes = roundToTwo(Math.min(sumQuestoesSelecionadas, expected.questoes.esperado ?? sumQuestoesSelecionadas));

  const pieceReference = pieceOverrideCount > 0 ? pieceOverrideSum : null;
  const questoesReference = overrideQuestoesSum ?? sumQuestoesSelecionadas;

  const pieceSelection = selectConsistentTotal({
    label: 'PEÇA',
    extracted: extractedTotalPeca,
    computed: computedTotalPeca,
    max: roundToTwo(expected.peca.esperado),
    reference: pieceReference,
    preferExtractedWhenComputedZero: true,
  });

  const questoesSelection = selectConsistentTotal({
    label: 'QUESTÕES',
    extracted: extractedTotalQuestoes,
    computed: computedTotalQuestoes,
    max: roundToTwo(expected.questoes.esperado),
    reference: questoesReference,
    preferExtractedWhenComputedZero: true,
  });

  const totalPeca = pieceSelection.value;
  const totalQuestoes = questoesSelection.value;

  const maxFinal = roundToTwo((expected.peca.esperado ?? 5) + (expected.questoes.esperado ?? 5));
  const computedFinal = roundToTwo(Math.min(totalPeca + totalQuestoes, maxFinal));

  const finalSelection = selectConsistentTotal({
    label: 'NOTA FINAL',
    extracted: extractedFinal,
    computed: computedFinal,
    max: maxFinal,
    reference: roundToTwo(totalPeca + totalQuestoes),
    preferExtractedWhenComputedZero: true,
  });

  const totalFinal = finalSelection.value;

  return {
    meta: {
      aluno: extractedData.nome_do_examinando || "Aluno(a)",
      inscricao: extractedData.inscricao || "[não-visivel]",
      area: (rubric.meta as any)?.area || "Área Jurídica",
      notaFinal: totalFinal,
      situacao: extractedData.situacao || "PENDENTE",
    },
    avaliacoes: {
      peca: pecaItems.length > 0 ? {
        titulo: "AVALIAÇÃO DA PEÇA PROFISSIONAL",
        pontuacaoMaxima: roundToTwo(expected.peca.esperado),
        pontuacaoObtida: totalPeca,
        itens: pecaItems,
      } : undefined,
      questoes,
    },
    totais: {
      peca: totalPeca,
      questoes: totalQuestoes,
      final: totalFinal,
    },
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Gera espelho de correção localmente usando agente LangGraph
 */
export async function generateMirrorLocally(input: MirrorGeneratorInput): Promise<MirrorGeneratorOutput> {
  console.log(
    `[MirrorGenerator] 🚀 Iniciando geração de espelho para lead ${input.leadId} (${input.especialidade})`,
  );

  if (input.onProgress) {
    await input.onProgress("Carregando rubrica estruturada...");
  }

  // 1. Carregar rubrica
  const baseRubric = await loadRubric(input.especialidade, input.espelhoPadraoId);
  const { rubric, selectedVariants } = filterRubricByActiveGroups(baseRubric);
  if (selectedVariants.size) {
    console.log('[MirrorGenerator] 🎯 Variantes selecionadas:', Object.fromEntries(selectedVariants.entries()));
  }

  if (input.onProgress) {
    await input.onProgress("Preparando imagens do espelho...");
  }

  // 2. Normalizar e validar URLs das imagens
  const imageDescriptors: MirrorImageDescriptor[] = input.images.map((img, index) => {
    if (typeof img === 'string') {
      return { id: `mirror-${index}`, url: img, page: index + 1 };
    }
    return img;
  });

  // ✅ Validar e extrair URLs diretas (sem download/conversão)
  const imageUrls: string[] = imageDescriptors.map(img => normalizeImageUrl(img));

  console.log(`[MirrorGenerator] ✅ ${imageUrls.length} imagem(ns) validadas para processamento direto`);

  if (input.onProgress) {
    await input.onProgress("Extraindo dados com LLM vision...");
  }

  // 3. Carregar config do blueprint
  const { model, systemInstructions, maxOutputTokens } = await getMirrorExtractorConfig();

  console.log('[MirrorGenerator] 📝 Configuração do Blueprint:');
  console.log(`  - Modelo: ${model}`);
  console.log(`  - Max Output Tokens: ${maxOutputTokens}`);

  // 4. Extrair dados das imagens (usando URLs diretas)
  const extractedData = await extractMirrorDataFromImages(
    imageUrls,
    rubric,
    model,
    systemInstructions,
    maxOutputTokens,
  );

  if (input.onProgress) {
    await input.onProgress("Construindo espelho estruturado...");
  }

  // 5. Construir espelho estruturado
  const structuredMirror = buildStructuredMirror(rubric, extractedData);

  if (input.onProgress) {
    await input.onProgress("Formatando espelho...");
  }

  // 6. Formatar espelho (importar formatadores)
  const formatter = await import("./mirror-formatter");

  const markdownMirror = formatter.formatMirrorToMarkdown(structuredMirror, rubric);
  const jsonMirror = formatter.formatMirrorToJson(
    extractedData,
    rubric,
    structuredMirror,
    {
      leadId: input.leadId,
      nome: input.nome,
      telefone: input.telefone,
    },
  );

  console.log(
    `[MirrorGenerator] ✅ Espelho gerado com sucesso para ${structuredMirror.meta.aluno} (${structuredMirror.totais.final.toFixed(2)} pontos)`,
  );

  return {
    extractedData,
    structuredMirror,
    markdownMirror,
    jsonMirror,
  };
}
