/**
 * Classifica a intenção usando a Responses API, com instruções do Capitão e modelo do agente.
 * Retorna o nome da intenção (ex.: "@pagar_fatura") ou null.
 */
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const classifierLogger = createLogger('AI-Classifier');

function extractResponsesApiText(data: any): string {
  try {
    // 1) Campo direto (quando presente)
    const direct: string = typeof data?.output_text === 'string' ? data.output_text : '';
    if (direct && direct.trim()) return direct.trim();

    // 2) Novo formato Responses API: data.output[0].content[*]
    const outputArr: any[] = Array.isArray(data?.output) ? data.output : [];
    if (outputArr.length > 0) {
      const first = outputArr[0];
      const contentArr: any[] = Array.isArray(first?.content) ? first.content : [];
      for (const item of contentArr) {
        // 2.a) { type: 'output_text', text: '...' }
        if (typeof item?.text === 'string' && item.text.trim()) return item.text.trim();
        // 2.b) { type: 'text', text: { value: '...' } } (variação compatível)
        const value = item?.text?.value;
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }

    // 3) Mensagens API compatível: choices[0].message/content (fallback amplo)
    const choices: any[] = Array.isArray(data?.choices) ? data.choices : [];
    if (choices.length > 0) {
      const msg = choices[0]?.message;
      const content: string = typeof msg?.content === 'string' ? msg.content : '';
      if (content && content.trim()) return content.trim();
    }
  } catch {}
  return '';
}

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

async function embedText(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-large', input: text })
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  const v: any = j?.data?.[0]?.embedding;
  return Array.isArray(v) ? (v as number[]) : null;
}

function smartTrim(text: string, maxLen: number): string {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  const cut = t.lastIndexOf(' ', maxLen);
  if (cut >= Math.max(8, maxLen - 8)) return t.slice(0, cut);
  return t.slice(0, maxLen);
}

async function summarizeShortTitle(name: string, description: string | null | undefined, model: string, maxLen = 20): Promise<string | null> {
  try {
    const desc = (description || '').trim();
    const sys = `Você é um assistente que cria rótulos curtos e claros para botões.
Regra: máximo de ${maxLen} caracteres, pt-BR, sem aspas e sem emojis.
Objetivo: capture a ideia central, evitando termos genéricos; tente usar entre ${Math.max(maxLen-2, 8)} e ${maxLen} caracteres quando possível, sem truncar palavras.
Saída: retorne apenas o rótulo final.`;
    const user = `Gere apenas o rótulo final.\nNome: ${name}\nDescrição: ${desc}`;
    const usedModel = model || 'gpt-4o-mini';
    const body = {
      model: usedModel,
      instructions: sys,
      input: [ { role: 'user', content: [ { type: 'input_text', text: user } ] } ],
      stream: false,
      store: false,
    } as any;
    // Log do prompt de resumo
    try { classifierLogger.info('Short title prompt (input)', { model: usedModel, maxLen, instructions: sys, user }); } catch {}
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    try { classifierLogger.info('Short title raw response', data); } catch {}
    const out = extractResponsesApiText(data);
    // Log do resultado do resumo
    try { classifierLogger.info('Short title result (output)', { result: out }); } catch {}
    if (!out) return null;
    return smartTrim(out, maxLen);
  } catch {
    // Fallback: segunda tentativa com modelo padrão
    try {
      const sys = `Você é um assistente que cria rótulos curtos e claros para botões.
Regra: máximo de ${maxLen} caracteres, pt-BR, sem aspas e sem emojis.
Objetivo: capture a ideia central; tente usar entre ${Math.max(maxLen-2, 8)} e ${maxLen} caracteres quando possível, sem truncar palavras.
Saída: retorne apenas o rótulo final.`;
      const user = `Gere apenas o rótulo final.\nNome: ${name}\nDescrição: ${description || ''}`;
      classifierLogger.info('Short title prompt (fallback try)', { model: 'gpt-4o-mini', maxLen, instructions: sys, user });
      const r2 = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', instructions: sys, input: [ { role: 'user', content: [ { type: 'input_text', text: user } ] } ], stream: false, store: false }),
      });
      if (!r2.ok) return null;
      const j2: any = await r2.json();
      try { classifierLogger.info('Short title raw response (fallback)', j2); } catch {}
      const out2 = extractResponsesApiText(j2);
      if (!out2) return null;
      return smartTrim(out2, maxLen);
    } catch {
      return null;
    }
  }
}

export async function classifyIntentWithAssistant(
  instructions: string,
  userText: string,
  model: string,
  options?: { userId?: string; skipLlmFallback?: boolean }
): Promise<string | null> {
  try {
    // 1) Tentativa rápida via embeddings (catálogo do usuário)
    if (options?.userId && userText.trim()) {
      const prisma = getPrismaInstance();
      const intents = await (prisma as any).intent.findMany({
        where: { createdById: options.userId, isActive: true },
        select: { id: true, name: true, description: true, similarityThreshold: true, embedding: true },
      });
      const candidates = intents.filter((i: any) => Array.isArray(i.embedding) && i.embedding.length > 0);
      if (candidates.length > 0) {
        // Log do texto usado para embedding (similaridade)
        try { classifierLogger.info('Embedding input (userText)', { text: userText }); } catch {}
        const q = await embedText(userText);
        if (q) {
          const makeShortTitle = (nm: string, desc?: string, maxLen = 20) => {
            const base = (desc && desc.trim()) ? desc.trim() : (nm || '').trim();
            return smartTrim(base, maxLen);
          };

          const scored = candidates.map((it: any) => {
            const score = cosineSimilarity(q, it.embedding as number[]);
            const threshold = typeof it.similarityThreshold === 'number' ? it.similarityThreshold : 0.8;
            const shortTitle = makeShortTitle(it.name, it.description);
            return { name: it.name, description: it.description as string | undefined, shortTitle, score, threshold };
          }).sort((a: any, b: any) => b.score - a.score);

          // Tentar melhorar os títulos das top-3 intenções com IA (resumo curto)
          try {
            const top3 = scored.slice(0, 3);
            for (let i = 0; i < top3.length; i++) {
              const s = top3[i];
              const summary = await summarizeShortTitle(s.name, s.description, model, 20);
              if (summary && typeof summary === 'string' && summary.trim()) {
                s.shortTitle = summary.trim();
              }
            }
          } catch {}

          const top = scored.slice(0, 5).map((s: { name: string; shortTitle: string; score: number; threshold: number }) => ({ name: s.name, shortTitle: s.shortTitle, score: Number(s.score.toFixed(4)), threshold: s.threshold }));
          classifierLogger.info('Intent similarity results', { userId: options.userId, top });

          const best = scored[0];
          if (best && best.score >= best.threshold) {
            const intentName = best.name.startsWith('@') ? best.name : `@${best.name}`;
            classifierLogger.info('Intent chosen by embeddings', { intent: intentName, score: Number(best.score.toFixed(4)), threshold: best.threshold });
            return intentName;
          }
          classifierLogger.info('No intent passed threshold', { best: best ? { name: best.name, score: Number(best.score.toFixed(4)), threshold: best.threshold } : null });
          // Aquecimento: se nenhuma passou, retornamos nulo aqui e o webhook monta botões com top-K
          (global as any).__AI_TOPK_CANDIDATES__ = top; // opção de inspeção rápida
          if (options?.skipLlmFallback) {
            return null;
          }
        }
      }
    }

    // 2) Fallback: LLM (usa instruções do Capitão)
    const sys = [
      'INSTRUÇÕES DO SISTEMA (OBRIGATÓRIAS):',
      'Você é o Capitão, um agente de classificação de intenções e extração de entidades.',
      'Responda com UMA das formas a seguir:',
      '1) Somente o nome da intenção (começando com @), ex.: @pagar_fatura',
      'OU',
      '2) Um JSON no formato { "intent": { "name": "@nome", "confidence": <0..1> }, "entities": [...] }',
      'Se não tiver confiança, responda @outros_assuntos.',
      instructions?.trim() ? `\nDiretivas do Capitão:\n${instructions.trim()}` : ''
    ].filter(Boolean).join('\n');

    const input = `${sys}\n\nMENSAGEM DO USUÁRIO:\n"${userText}"`;
    // Log do prompt completo enviado à OpenAI Responses API
    try { classifierLogger.info('LLM classification prompt (input)', input); } catch {}

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        input: [
          { role: 'user', content: [{ type: 'input_text', text: input }] }
        ],
        stream: false,
        store: false,
      }),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const raw = extractResponsesApiText(data);
    if (!raw) return null;
    if (raw.startsWith('@')) return raw.split(/\s|\n/)[0].trim();
    try {
      const obj = JSON.parse(raw);
      const n = obj?.intent?.name || obj?.intentName;
      if (typeof n === 'string') return n.trim();
    } catch {}
    return null;
  } catch {
    return null;
  }
}


