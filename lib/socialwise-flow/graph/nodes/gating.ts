// lib/socialwise-flow/graph/nodes/gating.ts
import { embeddingGenerator } from '@/lib/ai-integration/services/embedding-generator';
import { createLogger } from '@/lib/utils/logger';
import type { AgentStateSchema, GatedHint } from '../state';

const log = createLogger('Graph-Node:Gating');

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function l2norm(v: number[]) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; }
function l2normalize(v: number[]) { const n = l2norm(v); return v.map(x => x / n); }

/**
 * Compute semantic alignment between user text and each intent description.
 * Names are ignored; only description matters for gating approval.
 */
export async function gatingNode(state: AgentStateSchema): Promise<Partial<AgentStateSchema>> {
  const { context, classification } = state;
  const candidates = classification?.candidates || [];

  if (!candidates.length) {
    return { gatedHints: [] };
  }

  const userText = context.userText;
  const t0 = Date.now();

  // Generate or reuse user embedding
  let userVec = state.userEmbedding;
  if (!userVec || userVec.length === 0) {
    try {
      const emb = await embeddingGenerator.generateEmbedding(userText, {
        normalize: true,
        trim: true,
        lowercase: true,
        removeExtraSpaces: true
      });
      userVec = l2normalize(emb.values);
    } catch (e: any) {
      log.warn('Failed to embed user text for gating; passing through candidates', {
        err: e?.message || String(e)
      });
      return { gatedHints: candidates as GatedHint[] };
    }
  }

  // Embed top-N descriptions (limit 5 for latency)
  const MAX_HINTS = 5;
  const descs = candidates.slice(0, MAX_HINTS).map(c => (c.desc || '').trim());
  const toEmbedIdx: number[] = [];
  const placeholders: Array<number[] | null> = new Array(descs.length).fill(null);
  for (let i = 0; i < descs.length; i++) {
    if (descs[i].length >= 8) toEmbedIdx.push(i);
  }

  if (toEmbedIdx.length) {
    try {
      const embBatch = await embeddingGenerator.generateEmbeddings(toEmbedIdx.map(i => descs[i]), {
        normalize: true,
        trim: true,
        lowercase: true,
        removeExtraSpaces: true
      });
      for (let j = 0; j < toEmbedIdx.length; j++) {
        const originalIndex = toEmbedIdx[j];
        placeholders[originalIndex] = l2normalize(embBatch[j].values);
      }
    } catch (e: any) {
      log.warn('Failed to embed descriptions for gating; passing through candidates', {
        err: e?.message || String(e)
      });
      return { userEmbedding: userVec, gatedHints: candidates as GatedHint[] };
    }
  }

  // Compute desc alignment and filter
  const vectorMin = Number(process.env.SW_HINT_DESC_MIN || 0.55);
  const filtered: GatedHint[] = candidates.slice(0, MAX_HINTS).map((c, idx) => {
    const dvec = placeholders[idx];
    const descScore = Array.isArray(dvec) ? cosineSimilarity(userVec!, dvec) : undefined;
    return { ...c, descScore } as GatedHint;
  }).filter(h => {
    // If no desc or no embedding, allow but prefer ones with descScore
    if (typeof h.descScore !== 'number') return true;
    return h.descScore >= vectorMin;
  });

  // Keep order by original score, but if descScore present, re-rank within ties
  filtered.sort((a, b) => {
    const sa = (a.score ?? 0);
    const sb = (b.score ?? 0);
    if (Math.abs(sb - sa) > 1e-6) return sb - sa;
    const da = (a.descScore ?? 0);
    const db = (b.descScore ?? 0);
    return db - da;
  });

  log.info('Semantic gating complete', {
    inCount: candidates.length,
    outCount: filtered.length,
    topDescScore: filtered[0]?.descScore ?? null,
    ms: Date.now() - t0,
    traceId: context.traceId
  });

  return { userEmbedding: userVec, gatedHints: filtered } as Partial<AgentStateSchema>;
}

