// services/openai-components/prompt-manager.ts
import { ChannelType } from "../types";
import { getConstraintsForChannel } from "./channel-constraints";
import type { IntentCandidate } from "../types";

// ==== MASTER_PROMPT - lógica de negócio IMUTÁVEL ====
// Conciso, assertivo e econômico em tokens. Consolidamos regras universais
// (JSON estrito, identidade/tom, antialucinação e botões) aqui, e reforçamos
// pontualmente nos TASK_PROMPTS quando necessário.
const MASTER_PROMPT_BASE = `
# MASTER (imutável)
- Saída: apenas JSON válido no schema fornecido; sem texto fora do JSON.
- Respeite a identidade e o tom definidos nas instructions do agente.

# Antialucinação Operacional
- Não invente dados operacionais (horários, preços, telefones, endereços, prazos).
- Afirme fatos só se vierem de INTENT_HINTS, integrações, contexto da sessão ou do próprio usuário.
- Na falta de dado, não chute: ofereça botões para confirmar/obter informação.

# Regras Universais de Botões
- Títulos até 20 caracteres, objetivos e acionáveis.
- Quantidade: use poucos botões úteis (siga os limites do canal abaixo).
- Payload em formato @slug; não invente slugs.

# Handoff Humano (regra simples e obrigatória)
- Quando precisar oferecer atendimento humano, use APENAS o slug @falar_atendente.
- O título do botão DEVE ser um destes (preferir o primeiro): "Atendimento Humano", "Falar com atendente", "Falar com humano", "Suporte humano".
- É proibido mascarar handoff com outro título (ex.: "Mandado de Segurança" não pode apontar para @falar_atendente).
- Incluir no MÁXIMO 1 botão de handoff e posicioná-lo por último.

# Aviso final (formatação literal)
- Ao final do response_text (quando houver botões/desambiguação), inclua literalmente NO FINAL: \`Se nenhum botão atender, digite sua solicitação\`.
- Não repetir o aviso se já estiver presente. Não usar crases triplas.
`;

// Gera o MASTER com limites do canal (mantém o bloco imutável + ajustes de canal)
export function createMasterPrompt(channel: ChannelType): string {
  const c = getConstraintsForChannel(channel);
  const buttonRange = channel === 'whatsapp' ? '3' : '4-6';
  return (
    MASTER_PROMPT_BASE +
    `# Limites do Canal\n` +
    `- response_text: até ${c.bodyMax} caracteres.\n` +
    `- button_title: até ${c.buttonTitleMax} caracteres.\n` +
    `- buttons: ${buttonRange}.\n`
  );
}

// Task-specific prompt templates (enxutos e assertivos)
export const TASK_PROMPTS = {
  SHORT_TITLES: `
# Objetivo
Gerar títulos curtos (≤ 20) e acionáveis para cada serviço.
Linguagem neutra e profissional.
`,

  FREE_CHAT: `
# Objetivo
Gerar response_text conciso e botões para continuar a conversa.
Evite afirmar dados operacionais não fornecidos.
`,

  WARMUP_BUTTONS: `
# Objetivo
Gerar breve introdução e botões para desambiguar a intenção do usuário.

# Específicas
- Títulos baseados na "desc" dos intents, não no slug técnico.
- Use apenas slugs de INTENT_HINTS no payload. Se houver ambiguidade real OU o usuário pedir humano, pode incluir 1 handoff:
  - payload: @falar_atendente
  - título: "Atendimento Humano" (ou variações permitidas)
  - por último.
- Títulos ≤ 20 caracteres, claros e acionáveis.
`,

  ROUTER_LLM: (hasInstructions: boolean) => `
# Objetivo
Decidir entre mode='intent' ou mode='chat'.

# Decisão
- O modo padrão é 'chat'.
- Use 'intent' SOMENTE com CERTEZA ABSOLUTA de que o pedido corresponde a UMA única intenção (baseando-se principalmente na "desc" da intenção):
  - então preencha intent_payload=@slug EXATO (apenas um).
- Se houver dúvida, múltiplas plausíveis, conflito ou falta de informação → use 'chat'.

# Em ambos
- response_text útil e conciso; gere botões conforme CHANNEL_LIMITS.
- mode='intent': botões relacionados à intenção usando slugs EXATOS de INTENT_HINTS.
- mode='chat': use slugs de INTENT_HINTS para hipóteses. Se ambiguidade real OU pedido explícito por humano, inclua 1 botão de handoff:
  - payload: @falar_atendente
  - título: "Atendimento Humano" (ou variações permitidas)
  - por último.

# Identidade
Mantenha a identidade e o tom definidos nas instruções principais${hasInstructions ? " (injetadas)." : "."}

# Antialucinação
Siga o MASTER: não invente dados operacionais; prefira perguntar.
`,
};

export interface PromptBuilderOptions {
  channel: ChannelType;
  taskType: keyof typeof TASK_PROMPTS | 'router';
  hasInstructions?: boolean;
  statelessInit?: boolean;
}

// Constrói 'messages' no formato esperado pelos clientes que usam developer+user
export function buildMessages(
  options: PromptBuilderOptions,
  userContent: string
): Array<{ role: "developer" | "user"; content: string }> {
  const messages: Array<{ role: "developer" | "user"; content: string }> = [];

  // Adiciona apenas MASTER nas developer messages (nova sessão).
  // Task rules e hints ficam em `instructions` (evita duplicação).
  if (options.statelessInit !== false) {
    messages.push({ role: "developer", content: createMasterPrompt(options.channel) });
  }

  // Texto cru do usuário (sem molduras).
  messages.push({ role: "user", content: userContent });

  return messages;
}

// Builder de instructions efêmeras (task rules + guardrails + limits + hints JSON)
export function buildEphemeralInstructions(opts: {
  task: keyof typeof TASK_PROMPTS | 'router';
  channel: ChannelType;
  hasInstructions?: boolean;
  hints?: Array<{ slug: string; score?: number; aliases?: string[]; desc?: string }>;
  extra?: string;
}): string {
  const { channel, task, hasInstructions, hints, extra } = opts;
  const c = getConstraintsForChannel(channel);
  const core =
    task === 'router'
      ? TASK_PROMPTS.ROUTER_LLM(!!hasInstructions)
      : (TASK_PROMPTS[task] as string);

  // Helper function to safely escape strings for JSON context
  const safeString = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')    // Escape backslashes
      .replace(/"/g, '\\"')      // Escape quotes
      .replace(/\n/g, '\\n')     // Escape newlines
      .replace(/\r/g, '\\r')     // Escape carriage returns
      .replace(/\t/g, '\\t');    // Escape tabs
  };

  // mantém ordem e números curtos
  const top = (hints ?? [])
    .map(h => ({
      slug: h.slug?.startsWith('@') ? h.slug : `@${h.slug}`,
      score: typeof h.score === 'number' ? Number(h.score.toFixed(3)) : undefined,
      aliases: (h.aliases ?? []).slice(0, 3).map(alias => safeString(String(alias))),
      desc: safeString((h.desc ?? '').toString().trim()), // <<< descrição completa escapada
    }));

  let out = "";
  out += "TASK_RULES:\n" + core.trim();
  out += `\n\nGUARDRAILS\n- Não afirme dados operacionais sem fonte no contexto ou do usuário.\n- Não invente payloads: use somente slugs permitidos.`;
  const buttonRange = channel === 'whatsapp' ? `2–${c.maxButtons}` : `2–${c.maxButtons}`;
  out += `\n\nCHANNEL_LIMITS\n- response_text<=${c.bodyMax}; button_title<=${c.buttonTitleMax}; buttons=${buttonRange}; payload=@slug ou vazio ("").`;
  out += `\n\nBUTTON_POLICY\n- Gere pelo menos 2 opções úteis.\n- Títulos ≤ ${c.buttonTitleMax} chars. Use slugs de INTENT_HINTS no payload.\n- Se houver ambiguidade real OU o usuário pedir humano, inclua 1 botão de handoff por último: "Atendimento Humano" (@falar_atendente).`;
  out += `\n\nINTENT_HINTS_JSON\n` + JSON.stringify(top, null, 0);
  if (extra && extra.trim()) out += `\n\nEXTRA\n` + extra.trim();
  return out;
}
