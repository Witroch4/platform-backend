// services/openai-components/prompt-manager.ts
import { ChannelType } from "../types";
import { getConstraintsForChannel } from "./channel-constraints";

// ==== MASTER_PROMPT - Lógica de negócio imutável ====
const MASTER_PROMPT_BASE = `
# MASTER
Você é um assistente especializado em geração de respostas estruturadas para chatbots.
Sempre retorne EXATAMENTE no schema especificado, sem texto fora do JSON.
Foque em respostas concisas, profissionais e acionáveis.

# REGRAS UNIVERSAIS PARA BOTÕES
- Títulos de botões: máximo 20 caracteres, objetivos e acionáveis
- Payload: sempre no formato @slug (obrigatório)
- Retorne SOMENTE no schema especificado (sem explicações fora do JSON)
`;

// Função que gera o MASTER_PROMPT dinamicamente com limites do canal
export function createMasterPrompt(channel: ChannelType): string {
  const c = getConstraintsForChannel(channel);
  return MASTER_PROMPT_BASE + `- response_text: até ${c.bodyMax} caracteres, sempre útil e contextual\n`;
}

// Task-specific prompt templates
export const TASK_PROMPTS = {
  SHORT_TITLES: `
# OBJETIVO
Gerar títulos curtos e acionáveis para cada serviço.

# REGRAS ESPECÍFICAS
- Títulos: até 20 caracteres (obrigatório)
- Linguagem neutra e profissional
`,

  FREE_CHAT: `
# OBJETIVO
Gerar uma resposta curta (response_text) e 2–3 botões objetivos para avançar a conversa.

# REGRAS ESPECÍFICAS
- Linguagem neutra e profissional
`,

  WARMUP_BUTTONS: `
# OBJETIVO
Gerar uma pequena introdução e botões para desambiguar a intenção do usuário.

# REGRAS ESPECÍFICAS
- Linguagem neutra e profissional
- NUNCA afirme dados operacionais do cliente (ex.: horários, preços, telefones, endereços). Se a pergunta for sobre horário, evite citar horários específicos; incentive a confirmação via botões.
- Gere SEMPRE 2–3 botões objetivos (nunca menos de 2 quando houver mais de uma opção plausível).
- Títulos: ≤20 caracteres, claros e acionáveis.
- Payload dos botões: use EXCLUSIVAMENTE slugs fornecidos nos INTENT_HINTS (ex.: @negocio1, @negocio777). Se precisar, inclua também @falar_atendente.
- Se houver candidatos com restrições (ex.: premium, perfil específico), formule a introdução como pergunta curta para o usuário se identificar, e use os botões para escolher.
`,

  ROUTER_LLM: (hasInstructions: boolean) => `
# OBJETIVO
Como ${hasInstructions ? 'assistente especializado' : 'roteador inteligente'}, decida entre roteamento para intenção específica mode='intent' ou resposta conversacional mode='chat'.

# REGRAS DE ROTEAMENTO
- mode='intent' quando houver uma intenção clara e específica que pode ser mapeada
  * Para modo 'intent': inclua intent_payload no formato @slug
  * response_text deve ser uma resposta útil relacionada à intenção
  * buttons obrigatório com 2-3 opções relacionadas à intenção e @slug dos INTENT_HINTS
  * JAMAIS mandar slug de 2 intents SEMPRE usar apenas 1 slug em mode='intent' TEM DÚVIDA? use mode='chat'

- mode='chat' para conversa geral ou quando não há intenção específica mapeável ou você tem dúvidas entre múltiplas intenções
  * Para modo 'chat': response_text deve ser uma resposta conversacional útil
  * buttons obrigatório com 2-3 opções para continuar a conversa e @slug livre

# REGRAS ESPECÍFICAS
- Mantenha a identidade e tom definidos nas instruções principais

# USO DOS INTENT_HINTS (priorize sem restringir)
- Considere com atenção os INTENT_HINTS fornecidos pelo sistema.
- Se houver UM único hint fortemente alinhado ao pedido (ex.: pergunta sobre “horário/funcionamento” e hint descreve “horário de atendimento”), é preferível escolher mode='intent' com o slug EXATO do hint.
- Se houver dúvida ou múltiplos hints plausíveis, prefira mode='chat' e desambigue com 2–3 botões baseados nos slugs dos INTENT_HINTS. Pode incluir um botão de atendimento humano quando fizer sentido (ex.: @falar_atendente).
- Quando optar por mode='intent', use exatamente um slug de INTENT_HINTS (não invente slugs). Se nenhum slug for adequado, escolha mode='chat' para usar @slug livremente.

# BOTÕES DE DESAMBIGUAÇÃO (quando em chat)
- Use títulos curtos (≤20) e objetivos.
- Priorize 2–3 opções: (1) top hint; (2) segunda opção relevante; (3) falar com atendente (opcional).
- Os payloads dos botões devem ser @slug de INTENT_HINTS ou, em último caso, livres quando for apenas continuação da conversa.
- Não veio INTENT_HINTS? Use 2–3 botões livres para continuar a conversa.

# ANTIALUCINAÇÃO OPERACIONAL
- Nunca afirme dados operacionais (horários, preços, telefones, endereços) a menos que estejam explícitos nos INTENT_HINTS ou contexto.
- Para perguntas de “horário de atendimento”, responda de forma neutra e ofereça botões como “Ver horário” em vez de citar horários específicos.
`,
};

export interface PromptBuilderOptions {
  channel: ChannelType;
  taskType: keyof typeof TASK_PROMPTS | 'router';
  hasInstructions?: boolean;
  statelessInit?: boolean;
}

export function buildMessages(
  options: PromptBuilderOptions,
  userContent: string
): Array<{ role: "developer" | "user"; content: string }> {
  const messages: Array<{ role: "developer" | "user"; content: string }> = [];
  
  // Add developer prompts only if statelessInit (new session)
  if (options.statelessInit !== false) { // default true
    messages.push({ role: "developer", content: createMasterPrompt(options.channel) });
    messages.push({ role: "developer", content: "\n# REGRAS DE CONFIABILIDADE (ANTIALUCINAÇÃO)\n- Nunca invente dados operacionais do cliente (ex.: horário de atendimento, preços, endereços, prazos, telefones).\n- Só afirme fatos se vierem explicitamente do sistema (INTENT_HINTS, mapeamentos/integrações, ou contexto de sessão) ou do próprio usuário.\n- Caso falte o dado, NÃO chute: ofereça botões para obter/confirmar a informação.\n" });
    
    if (options.taskType === 'router') {
      messages.push({ 
        role: "developer", 
        content: TASK_PROMPTS.ROUTER_LLM(options.hasInstructions || false) 
      });
    } else {
      const taskPrompt = TASK_PROMPTS[options.taskType];
      if (typeof taskPrompt === 'string') {
        messages.push({ role: "developer", content: taskPrompt });
      }
    }
  }
  
  messages.push({ role: "user", content: userContent });
  
  return messages;
}
