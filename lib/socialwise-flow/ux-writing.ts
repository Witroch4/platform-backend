/**
 * UX Writing and Legal Domain Prompts for SocialWise Flow
 * Specialized prompts for legal chatbot interactions with versioning support
 */

import { IntentCandidate, WarmupButtonsResponse, AgentConfig } from '@/services/openai';

/**
 * Legal terminology patterns for context recognition
 */
export const LEGAL_TERMS = {
  // Traffic and DETRAN related
  traffic: [
    'detran', 'multa', 'cnh', 'carteira', 'habilitação', 'pontos', 'suspensão',
    'cassação', 'recurso', 'defesa', 'autuação', 'infração', 'velocidade',
    'radar', 'blitz', 'alcoolemia', 'embriaguez'
  ],
  
  // Civil and contracts
  civil: [
    'contrato', 'acordo', 'inadimplência', 'cobrança', 'dívida', 'negociação',
    'rescisão', 'distrato', 'cláusula', 'multa contratual', 'danos morais',
    'indenização', 'responsabilidade civil'
  ],
  
  // Family law
  family: [
    'divórcio', 'divorciar', 'separação', 'pensão', 'alimentos', 'guarda', 'visitação',
    'partilha', 'bens', 'união estável', 'reconhecimento', 'paternidade',
    'adoção', 'tutela', 'curatela'
  ],
  
  // Labor law
  labor: [
    'trabalhista', 'demissão', 'rescisão', 'fgts', 'seguro desemprego',
    'horas extras', 'adicional', 'insalubridade', 'periculosidade',
    'assédio', 'acidente trabalho', 'aposentadoria', 'inss'
  ],
  
  // Consumer law
  consumer: [
    'consumidor', 'produto defeituoso', 'serviço', 'garantia', 'troca',
    'devolução', 'procon', 'cdc', 'código defesa consumidor', 'propaganda',
    'enganosa', 'vício', 'recall'
  ],
  
  // Criminal law
  criminal: [
    'criminal', 'penal', 'processo crime', 'delegacia', 'boletim ocorrência',
    'inquérito', 'denúncia', 'queixa', 'habeas corpus', 'prisão',
    'liberdade provisória', 'fiança'
  ]
};

/**
 * Common legal action patterns for button generation
 */
export const LEGAL_ACTIONS = {
  // Defensive actions
  defensive: [
    'Recorrer', 'Contestar', 'Defender', 'Impugnar', 'Anular', 'Cancelar'
  ],
  
  // Offensive actions
  offensive: [
    'Processar', 'Cobrar', 'Executar', 'Requerer', 'Solicitar', 'Pleitear'
  ],
  
  // Administrative actions
  administrative: [
    'Regularizar', 'Renovar', 'Transferir', 'Alterar', 'Registrar', 'Protocolar'
  ],
  
  // Consultation actions
  consultation: [
    'Consultar', 'Orientar', 'Esclarecer', 'Analisar', 'Avaliar', 'Verificar'
  ]
};

/**
 * Prompt templates with versioning support
 */
export const PROMPT_TEMPLATES = {
  version: '1.0.0',
  
  warmupButtons: {
    version: '1.0.0',
    template: `# INSTRUÇÃO
Você é um especialista em UX Writing e Microcopy para chatbots jurídicos.
Sua tarefa é gerar um conjunto de opções de botões para um usuário que fez uma pergunta ambígua.

# CONTEXTO JURÍDICO
O sistema de IA identificou as seguintes intenções jurídicas como as mais prováveis, mas não tem certeza suficiente para agir diretamente.

# INTENÇÕES CANDIDATAS
{candidates}

# MENSAGEM ORIGINAL DO USUÁRIO
"{userText}"

# ANÁLISE DE CONTEXTO LEGAL
{legalContext}

# SUA TAREFA
Gere uma resposta no formato JSON com:
1. "introduction_text": frase curta e empática (≤ 180 chars) que reconhece a situação jurídica do usuário
2. "buttons": até 3 objetos com "title" (≤ 20 chars, ação jurídica clara) e "payload" (@intent_name)

# REGRAS DE UX WRITING JURÍDICO
- Títulos dos botões devem ser ações jurídicas claras (ex: "Recorrer Multa", "Ação Judicial", "Defesa Admin")
- Use linguagem jurídica acessível mas precisa
- Payloads devem usar o formato @slug das intenções candidatas
- Texto de introdução deve ser empático e direcionador
- Priorize ações que o usuário pode tomar imediatamente
- Evite jargão excessivo, mas mantenha precisão técnica

# EXEMPLOS DE BONS TÍTULOS
- "Recorrer Multa" (para recursos de trânsito)
- "Ação Judicial" (para mandados de segurança)
- "Defesa Admin" (para defesas administrativas)
- "Cobrar Dívida" (para execuções)
- "Consulta Jurídica" (para orientações gerais)

# FORMATO DE RESPOSTA
{
  "introduction_text": "Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?",
  "buttons": [
    {"title": "Recorrer Multa", "payload": "@recurso_multa_transito"},
    {"title": "Ação Judicial", "payload": "@mandado_seguranca"},
    {"title": "Consulta Geral", "payload": "@consulta_juridica"}
  ]
}`
  },
  
  shortTitles: {
    version: '1.0.0',
    template: `# INSTRUÇÃO
Você é um especialista em UX Writing para chatbots jurídicos.
Gere títulos curtos e acionáveis para os seguintes serviços jurídicos.

# REGRAS DE UX WRITING JURÍDICO
- Máximo 4 palavras por título
- Máximo 20 caracteres por título
- Foque na ação jurídica do usuário (ex: "Recorrer Multa", "Ação Judicial")
- Use linguagem direta e profissional
- Priorize verbos de ação jurídica
- Retorne apenas um array JSON de strings

# AÇÕES JURÍDICAS PREFERENCIAIS
Defensivas: Recorrer, Contestar, Defender, Impugnar, Anular
Ofensivas: Processar, Cobrar, Executar, Requerer, Solicitar
Administrativas: Regularizar, Renovar, Transferir, Alterar
Consultivas: Consultar, Orientar, Esclarecer, Analisar

# SERVIÇOS JURÍDICOS
{intents}

# FORMATO DE RESPOSTA
Retorne apenas um array JSON com os títulos na mesma ordem:
["Título 1", "Título 2", "Título 3"]

# EXEMPLOS DE BONS TÍTULOS
- "Recorrer Multa" (20 chars, 2 palavras)
- "Ação Judicial" (12 chars, 2 palavras)
- "Defesa Admin" (12 chars, 2 palavras)
- "Cobrar Dívida" (13 chars, 2 palavras)`
  },
  
  domainTopics: {
    version: '1.0.0',
    template: `# INSTRUÇÃO
Você é um especialista em direito brasileiro.
O usuário fez uma pergunta vaga sobre questões jurídicas. Sugira 3 áreas jurídicas mais comuns que podem ajudar.

# MENSAGEM DO USUÁRIO
"{userText}"

# SUA TAREFA
Analise a mensagem e sugira as 3 áreas jurídicas mais relevantes para um escritório de advocacia.

# ÁREAS JURÍDICAS PRINCIPAIS
- Direito do Trânsito (multas, CNH, DETRAN, recursos)
- Direito Civil (contratos, danos morais, responsabilidade civil)
- Direito de Família (divórcio, pensão, guarda, partilha)
- Direito Trabalhista (demissão, FGTS, horas extras, assédio)
- Direito do Consumidor (produtos defeituosos, garantia, Procon)
- Direito Criminal (processos criminais, habeas corpus, defesa)
- Direito Previdenciário (INSS, aposentadoria, benefícios)
- Direito Empresarial (contratos comerciais, sociedades, recuperação judicial)

# FORMATO DE RESPOSTA
{
  "introduction_text": "Posso ajudar com diversas questões jurídicas. Qual área se aproxima mais da sua necessidade?",
  "buttons": [
    {"title": "Direito Trânsito", "payload": "@direito_transito"},
    {"title": "Direito Civil", "payload": "@direito_civil"},
    {"title": "Direito Família", "payload": "@direito_familia"}
  ]
}`
  }
};

/**
 * Analyzes user text for legal context and terminology
 * @param userText User's input message
 * @returns Legal context analysis
 */
export function analyzeLegalContext(userText: string): {
  detectedTerms: string[];
  primaryArea: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggestedActions: string[];
} {
  const text = userText.toLowerCase();
  const detectedTerms: string[] = [];
  const areaScores: Record<string, number> = {};
  
  // Detect legal terms and score areas
  Object.entries(LEGAL_TERMS).forEach(([area, terms]) => {
    terms.forEach(term => {
      if (text.includes(term.toLowerCase())) {
        detectedTerms.push(term);
        areaScores[area] = (areaScores[area] || 0) + 1;
      }
    });
  });
  
  // Find primary area
  const primaryArea = Object.entries(areaScores).length > 0
    ? Object.entries(areaScores).reduce((a, b) => a[1] > b[1] ? a : b)[0]
    : null;
  
  // Determine confidence
  const maxScore = Math.max(...Object.values(areaScores), 0);
  const confidence = maxScore >= 3 ? 'high' : maxScore >= 2 ? 'medium' : 'low';
  
  // Suggest actions based on detected terms
  const suggestedActions: string[] = [];
  if (detectedTerms.some(term => ['multa', 'detran', 'cnh'].includes(term))) {
    suggestedActions.push(...LEGAL_ACTIONS.defensive);
  }
  if (detectedTerms.some(term => ['cobrança', 'dívida', 'inadimplência'].includes(term))) {
    suggestedActions.push(...LEGAL_ACTIONS.offensive);
  }
  if (detectedTerms.some(term => ['contrato', 'acordo', 'regularizar'].includes(term))) {
    suggestedActions.push(...LEGAL_ACTIONS.administrative);
  }
  
  return {
    detectedTerms,
    primaryArea,
    confidence,
    suggestedActions: [...new Set(suggestedActions)].slice(0, 3)
  };
}

/**
 * Generates legal context string for prompt injection
 * @param userText User's input message
 * @returns Formatted legal context for prompt
 */
export function generateLegalContextPrompt(userText: string): string {
  const analysis = analyzeLegalContext(userText);
  
  if (analysis.detectedTerms.length === 0) {
    return "Contexto: Questão jurídica geral, sem termos específicos detectados.";
  }
  
  return `Contexto Legal Detectado:
- Termos identificados: ${analysis.detectedTerms.join(', ')}
- Área principal: ${analysis.primaryArea || 'Não identificada'}
- Confiança: ${analysis.confidence}
- Ações sugeridas: ${analysis.suggestedActions.join(', ')}`;
}

/**
 * Builds the warmup buttons prompt with legal context
 * @param userText User's input message
 * @param candidates Intent candidates
 * @returns Complete prompt for warmup button generation
 */
export function buildWarmupButtonsPrompt(
  userText: string,
  candidates: IntentCandidate[]
): string {
  const candidatesText = candidates
    .map((c, i) => `${i + 1}. @${c.slug}: ${c.desc || c.name || c.slug}`)
    .join('\n');
  
  const legalContext = generateLegalContextPrompt(userText);
  
  return PROMPT_TEMPLATES.warmupButtons.template
    .replace('{candidates}', candidatesText)
    .replace('{userText}', userText)
    .replace('{legalContext}', legalContext);
}

/**
 * Builds the short titles prompt for batch generation
 * @param intents Intent candidates for title generation
 * @returns Complete prompt for short title generation
 */
export function buildShortTitlesPrompt(intents: IntentCandidate[]): string {
  const intentsText = intents
    .map((intent, i) => `${i + 1}. ${intent.slug}: ${intent.desc || intent.name || intent.slug}`)
    .join('\n');
  
  return PROMPT_TEMPLATES.shortTitles.template
    .replace('{intents}', intentsText);
}

/**
 * Builds the domain topics prompt for low confidence scenarios
 * @param userText User's input message
 * @returns Complete prompt for domain topic suggestion
 */
export function buildDomainTopicsPrompt(userText: string): string {
  return PROMPT_TEMPLATES.domainTopics.template
    .replace('{userText}', userText);
}

/**
 * Humanized fallback titles for failed LLM generation
 */
export const FALLBACK_TITLES: Record<string, string> = {
  // Traffic and DETRAN
  'recurso_multa_transito': 'Recorrer Multa',
  'defesa_administrativa_detran': 'Defesa Admin',
  'suspensao_cnh': 'Suspensão CNH',
  'cassacao_habilitacao': 'Cassação CNH',
  
  // Civil law
  'acao_cobranca': 'Cobrar Dívida',
  'danos_morais': 'Danos Morais',
  'rescisao_contrato': 'Rescindir',
  'indenizacao': 'Indenização',
  
  // Family law
  'divorcio_consensual': 'Divórcio',
  'pensao_alimenticia': 'Pensão',
  'guarda_compartilhada': 'Guarda',
  'partilha_bens': 'Partilha',
  
  // Labor law
  'rescisao_trabalhista': 'Rescisão',
  'horas_extras': 'Horas Extras',
  'assedio_moral': 'Assédio',
  'acidente_trabalho': 'Acidente',
  
  // Consumer law
  'defeito_produto': 'Produto Defeito',
  'garantia_servico': 'Garantia',
  'procon_reclamacao': 'Procon',
  
  // Criminal law
  'habeas_corpus': 'Habeas Corpus',
  'defesa_criminal': 'Defesa Crime',
  'liberdade_provisoria': 'Liberdade',
  
  // Generic fallbacks
  'consulta_juridica': 'Consulta',
  'orientacao_legal': 'Orientação',
  'analise_caso': 'Analisar Caso'
};

/**
 * Gets humanized fallback title for an intent
 * @param intentSlug Intent slug
 * @returns Humanized title or generic fallback
 */
export function getHumanizedTitle(intentSlug: string): string {
  if (!intentSlug) return 'Consulta';
  const cleanSlug = String(intentSlug).replace(/^@/, '');
  return FALLBACK_TITLES[cleanSlug] || 'Consulta';
}