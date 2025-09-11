// services/openai-components/server-socialwise-componentes/text-normalizers.ts
// Normalizadores simples e à prova de erro para saída da LLM

export type Btn = { title: string; payload: string };

const HANDOFF_SLUG = '@falar_atendente';
const HANDOFF_TITLES = [
  'Atendimento Humano',     // preferido
  'Falar com atendente',
  'Falar com humano',
  'Suporte humano',
];

const PAYLOAD_HANDOFF_REGEX = /^@(falar(_.*)?|humano|atendente|atendimento(_)?humano)$/i;
const TITLE_HANDOFF_REGEX = /\b(atendimento humano|falar com atendente|falar com humano|suporte humano)\b/i;

export function normalizeHandoffButtons(buttons: Btn[], titleMax = 20): Btn[] {
  const seen = new Set<string>();

  const normed = (buttons || []).map((b) => {
    let title = (b.title ?? '').trim();
    let payload = (b.payload ?? '').trim();

    const isHandoffByPayload = PAYLOAD_HANDOFF_REGEX.test(payload);
    const isHandoffByTitle = TITLE_HANDOFF_REGEX.test(title);

    if (isHandoffByPayload || isHandoffByTitle) {
      title = HANDOFF_TITLES[0];    // "Atendimento Humano"
      payload = HANDOFF_SLUG;       // canônico
    }

    title = title.slice(0, titleMax);
    const sig = `${title}::${payload}`;
    if (seen.has(sig)) return null as any;
    seen.add(sig);
    return { title, payload };
  }).filter(Boolean) as Btn[];

  // manter no máx. 1 handoff e movê-lo para o final
  const idxs = normed.map((b, i) => b.payload === HANDOFF_SLUG ? i : -1).filter(i => i >= 0);
  if (idxs.length > 1) {
    for (let k = idxs.length - 1; k > 0; k--) normed.splice(idxs[k], 1);
  }
  const idx = normed.findIndex(b => b.payload === HANDOFF_SLUG);
  if (idx > -1 && idx !== normed.length - 1) {
    const [h] = normed.splice(idx, 1);
    normed.push(h);
  }

  return normed;
}

const NOTICE_PLAIN = 'Se nenhum botão atender, digite sua solicitação';
const NOTICE_MARKED = `\`${NOTICE_PLAIN}\``;
const NOTICE_REGEX = /`?\s*Se nenhum botão atender, digite sua solicitação\s*`?/i;

export function ensureFinalNotice(text: string): string {
  let t = (text || '').replace(/\u0000/g, '').trim();
  if (NOTICE_REGEX.test(t)) return normalizeNoticeFormat(t);
  if (t && !/[.!?…]$/.test(t)) t += '.';
  return (t ? `${t}\n\n` : '') + NOTICE_MARKED;
}

function normalizeNoticeFormat(t: string) {
  const without = t.replace(NOTICE_REGEX, '').trimEnd();
  const sep = without ? '\n\n' : '';
  return `${without}${sep}${NOTICE_MARKED}`;
}