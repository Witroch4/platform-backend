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
`,

  ROUTER_LLM: (hasInstructions: boolean) => `
# OBJETIVO
Como ${hasInstructions ? 'assistente especializado' : 'roteador inteligente'}, decida entre roteamento para intenção específica ou resposta conversacional.

# REGRAS DE ROTEAMENTO
- mode='intent' quando houver uma intenção clara e específica que pode ser mapeada
  * Para modo 'intent': inclua intent_payload no formato @slug
  * response_text deve ser uma resposta útil relacionada à intenção
  * buttons obrigatório com 2-3 opções relacionadas à intenção

- mode='chat' para conversa geral ou quando não há intenção específica mapeável
  * Para modo 'chat': response_text deve ser uma resposta conversacional útil
  * buttons obrigatório com 2-3 opções para continuar a conversa

# REGRAS ESPECÍFICAS
- Mantenha a identidade e tom definidos nas instruções principais
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
