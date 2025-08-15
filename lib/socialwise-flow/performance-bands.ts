// lib/socialwise-flow/performance-bands.ts

import { openaiService, AgentConfig, IntentCandidate, WarmupButtonsResponse } from "@/services/openai";

export interface ClassificationResult {
  band: 'HARD' | 'SOFT' | 'LOW' | 'ROUTER';
  score: number;
  candidates: IntentCandidate[];
  strategy: 'direct_map' | 'warmup_buttons' | 'domain_topics' | 'router_llm';
}

export interface HardBandResult {
  type: 'direct_map';
  intent_slug: string;
  microcopy?: {
    text: string;
    buttons?: Array<{
      title: string;
      payload: string;
    }>;
  };
  response_time_ms: number;
}

export interface SoftBandResult {
  type: 'warmup_buttons';
  introduction_text: string;
  buttons: Array<{
    title: string;
    payload: string;
  }>;
  response_time_ms: number;
}

export interface LowBandResult {
  type: 'domain_topics';
  introduction_text: string;
  buttons: Array<{
    title: string;
    payload: string;
  }>;
  response_time_ms: number;
}

export type BandProcessingResult = HardBandResult | SoftBandResult | LowBandResult;

/**
 * HARD Band Processing (≥0.80 score)
 * Direct intent mapping with optional non-blocking microcopy enhancement
 * Target: sub-120ms response time for direct mappings
 */
export class HardBandProcessor {
  private agent: AgentConfig;

  constructor(agent: AgentConfig) {
    this.agent = agent;
  }

  /**
   * Process HARD band classification with direct mapping
   * @param userText Original user message
   * @param topCandidate Highest scoring intent candidate
   * @param enableMicrocopy Whether to enhance with LLM microcopy (non-blocking)
   * @returns Direct mapping result with optional microcopy
   */
  async process(
    userText: string,
    topCandidate: IntentCandidate,
    enableMicrocopy = true
  ): Promise<HardBandResult> {
    const startTime = Date.now();

    console.log(`🎯 HARD band processing for intent: ${topCandidate.slug} (score: ${topCandidate.score})`);

    // Direct mapping - immediate response for p95 optimization
    const directResult: HardBandResult = {
      type: 'direct_map',
      intent_slug: topCandidate.slug,
      response_time_ms: Date.now() - startTime
    };

    // Optional non-blocking microcopy enhancement
    if (enableMicrocopy) {
      // Fire and forget - don't block the 200 response
      this.enhanceWithMicrocopy(userText, topCandidate)
        .then(microcopy => {
          if (microcopy) {
            directResult.microcopy = microcopy;
            console.log(`✨ Microcopy enhanced for ${topCandidate.slug}: "${microcopy.text.substring(0, 50)}..."`);
          }
        })
        .catch(error => {
          console.warn(`⚠️ Microcopy enhancement failed for ${topCandidate.slug}:`, error.message);
        });
    }

    const totalTime = Date.now() - startTime;
    console.log(`⚡ HARD band completed in ${totalTime}ms (target: <120ms)`);

    return {
      ...directResult,
      response_time_ms: totalTime
    };
  }

  /**
   * Non-blocking microcopy enhancement using structured LLM output
   * @param userText Original user message
   * @param intent Intent candidate to enhance
   * @returns Enhanced microcopy or null if failed
   */
  private async enhanceWithMicrocopy(
    userText: string,
    intent: IntentCandidate
  ): Promise<{ text: string; buttons?: Array<{ title: string; payload: string }> } | null> {
    try {
      const prompt = `# INSTRUÇÃO
Você é um especialista em UX Writing para chatbots jurídicos.
Confirme a intenção do usuário com uma resposta personalizada e empática.

# CONTEXTO
O usuário disse: "${userText}"
Intenção identificada: ${intent.slug} - ${intent.desc || intent.name || intent.slug}

# SUA TAREFA
Gere uma confirmação no formato JSON com:
1. "text": confirmação empática e personalizada (≤ 180 chars)
2. "buttons": opcional, até 2 botões de confirmação/ação

# REGRAS
- Use linguagem jurídica acessível
- Seja empático com a situação do usuário
- Confirme que entendeu corretamente
- Botões opcionais para confirmar ou esclarecer

# FORMATO DE RESPOSTA
{
  "text": "Entendi que você precisa de ajuda com [situação]. Posso te orientar sobre isso.",
  "buttons": [
    {"title": "Confirmar", "payload": "@${intent.slug}"},
    {"title": "Esclarecer", "payload": "@consulta_juridica"}
  ]
}`;

      // Use structured output with deadline management
      const response = await openaiService.createChatCompletion([
        {
          role: "user",
          content: prompt
        }
      ], {
        model: this.agent.model as any,
        temperature: this.agent.tempCopy || 0.3,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return null;

      const result = JSON.parse(content);
      
      // Validate and clamp the response
      if (!result.text) return null;

      // Clamp text to 180 characters
      result.text = result.text.length <= 180 
        ? result.text 
        : result.text.slice(0, 180).trim();

      // Validate and clamp buttons if present
      if (result.buttons && Array.isArray(result.buttons)) {
        result.buttons = result.buttons
          .slice(0, 2) // Max 2 buttons for HARD band
          .map((button: any) => ({
            title: button.title?.length <= 20 
              ? button.title 
              : button.title?.slice(0, 20).trim() || "Confirmar",
            payload: button.payload?.match(/^@[a-z0-9_]+$/) 
              ? button.payload 
              : `@${intent.slug}`
          }));
      }

      return result;
    } catch (error) {
      console.error("Erro ao gerar microcopy para HARD band:", error);
      return null;
    }
  }
}

/**
 * SOFT Band Processing (0.65-0.79 score)
 * Aquecimento com Botões workflow with candidate intents
 * Target: sub-300ms response time with proper deadline management
 */
export class SoftBandProcessor {
  private agent: AgentConfig;

  constructor(agent: AgentConfig) {
    this.agent = agent;
  }

  /**
   * Process SOFT band classification with warmup buttons
   * @param userText Original user message
   * @param candidates Intent candidates for warmup
   * @returns Warmup buttons result
   */
  async process(
    userText: string,
    candidates: IntentCandidate[]
  ): Promise<SoftBandResult> {
    const startTime = Date.now();

    console.log(`🔥 SOFT band processing with ${candidates.length} candidates`);

    try {
      // Step 1: Generate short titles for candidates (batch operation)
      const shortTitles = await this.generateShortTitles(candidates);
      
      // Step 2: Generate warmup buttons with contextual introduction
      const candidatesWithTitles = candidates.map((candidate, index) => ({
        ...candidate,
        shortTitle: shortTitles?.[index] || candidate.name || candidate.slug
      }));

      const warmupResult = await openaiService.generateWarmupButtons(
        userText,
        candidatesWithTitles,
        this.agent
      );

      if (!warmupResult) {
        throw new Error("Failed to generate warmup buttons");
      }

      const totalTime = Date.now() - startTime;
      console.log(`🔥 SOFT band completed in ${totalTime}ms (target: <300ms)`);

      // Additional validation and clamping (defense in depth)
      const validatedButtons = warmupResult.buttons
        .slice(0, 3) // Ensure max 3 buttons
        .map(button => ({
          title: button.title.length <= 20 
            ? button.title 
            : button.title.slice(0, 20).trim(),
          payload: button.payload.match(/^@[a-z0-9_]+$/) 
            ? button.payload 
            : `@${button.payload.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`
        }));

      return {
        type: 'warmup_buttons',
        introduction_text: warmupResult.introduction_text.length <= 180 
          ? warmupResult.introduction_text 
          : warmupResult.introduction_text.slice(0, 180).trim(),
        buttons: validatedButtons,
        response_time_ms: totalTime
      };
    } catch (error) {
      console.error("Erro no processamento SOFT band:", error);
      
      // Fallback to deterministic buttons
      return this.createFallbackButtons(userText, candidates, Date.now() - startTime);
    }
  }

  /**
   * Generate short titles for intent candidates in batch
   * @param candidates Intent candidates
   * @returns Array of short titles or null if failed
   */
  private async generateShortTitles(candidates: IntentCandidate[]): Promise<string[] | null> {
    try {
      console.log(`📝 Generating short titles for ${candidates.length} candidates`);
      
      const titles = await openaiService.generateShortTitlesBatch(candidates, this.agent);
      
      if (titles && titles.length === candidates.length) {
        console.log(`✅ Generated ${titles.length} short titles successfully`);
        return titles;
      }
      
      console.warn("⚠️ Short title generation failed or incomplete, using fallback");
      return null;
    } catch (error) {
      console.error("Erro ao gerar títulos curtos:", error);
      return null;
    }
  }

  /**
   * Create fallback buttons when LLM generation fails
   * @param userText Original user message
   * @param candidates Intent candidates
   * @param elapsedTime Time already elapsed
   * @returns Fallback warmup result
   */
  private createFallbackButtons(
    userText: string,
    candidates: IntentCandidate[],
    elapsedTime: number
  ): SoftBandResult {
    console.log("🔄 Creating fallback buttons for SOFT band");

    const fallbackButtons = candidates.slice(0, 3).map(candidate => ({
      title: this.humanizeTitle(candidate.slug),
      payload: `@${candidate.slug}`
    }));

    return {
      type: 'warmup_buttons',
      introduction_text: "Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?",
      buttons: fallbackButtons,
      response_time_ms: elapsedTime
    };
  }

  /**
   * Convert slug to human-readable title
   * @param slug Intent slug
   * @returns Humanized title (clamped to 20 characters)
   */
  private humanizeTitle(slug: string): string {
    const humanized = slug
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    
    // Clamp to 20 characters at word boundaries
    if (humanized.length <= 20) return humanized;
    
    const words = humanized.split(' ');
    let result = '';
    for (const word of words) {
      if ((result + ' ' + word).trim().length <= 20) {
        result = (result + ' ' + word).trim();
      } else {
        break;
      }
    }
    
    return result || humanized.slice(0, 20).trim();
  }
}

/**
 * LOW Band Processing (<0.65 score)
 * Domain-specific legal topic suggestion
 * Target: sub-200ms response time with deterministic fallbacks
 */
export class LowBandProcessor {
  private agent: AgentConfig;

  constructor(agent: AgentConfig) {
    this.agent = agent;
  }

  /**
   * Process LOW band classification with domain topics
   * @param userText Original user message
   * @returns Domain topics result
   */
  async process(userText: string): Promise<LowBandResult> {
    const startTime = Date.now();

    console.log(`📚 LOW band processing for vague query`);

    try {
      // Attempt LLM-based legal topic suggestion
      const llmResult = await this.generateLegalTopics(userText);
      
      if (llmResult) {
        const totalTime = Date.now() - startTime;
        console.log(`📚 LOW band completed with LLM in ${totalTime}ms (target: <200ms)`);
        
        return {
          type: 'domain_topics',
          introduction_text: llmResult.introduction_text,
          buttons: llmResult.buttons,
          response_time_ms: totalTime
        };
      }
    } catch (error) {
      console.error("Erro na geração de tópicos jurídicos:", error);
    }

    // Fallback to deterministic legal topics
    const totalTime = Date.now() - startTime;
    console.log(`📚 LOW band completed with fallback in ${totalTime}ms`);
    
    return this.createFallbackTopics(totalTime);
  }

  /**
   * Generate legal topics using LLM
   * @param userText Original user message
   * @returns LLM-generated topics or null if failed
   */
  private async generateLegalTopics(
    userText: string
  ): Promise<{ introduction_text: string; buttons: Array<{ title: string; payload: string }> } | null> {
    const prompt = `# INSTRUÇÃO
Você é um especialista em direito brasileiro.
Analise a mensagem do usuário e sugira as 3 áreas jurídicas mais relevantes.

# MENSAGEM DO USUÁRIO
"${userText}"

# SUA TAREFA
Gere uma resposta no formato JSON com:
1. "introduction_text": frase empática reconhecendo a situação (≤ 180 chars)
2. "buttons": 3 áreas jurídicas relevantes com títulos claros (≤ 20 chars cada)

# ÁREAS JURÍDICAS COMUNS
- Direito do Consumidor
- Direito Trabalhista
- Direito de Família
- Direito Previdenciário
- Direito Civil
- Direito Criminal
- Direito de Trânsito
- Direito Tributário
- Direito Imobiliário

# FORMATO DE RESPOSTA
{
  "introduction_text": "Posso ajudar com sua questão. Qual área jurídica melhor se relaciona com sua situação?",
  "buttons": [
    {"title": "Direito Civil", "payload": "@consulta_direito_civil"},
    {"title": "Direito Consumidor", "payload": "@consulta_direito_consumidor"},
    {"title": "Direito Família", "payload": "@consulta_direito_familia"}
  ]
}`;

    try {
      const response = await openaiService.createChatCompletion([
        {
          role: "user",
          content: prompt
        }
      ], {
        model: this.agent.model as any,
        temperature: this.agent.tempSchema || 0.1,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return null;

      const result = JSON.parse(content);
      
      // Validate and clamp the response
      if (!result.introduction_text || !Array.isArray(result.buttons)) {
        return null;
      }

      // Clamp introduction text
      result.introduction_text = result.introduction_text.length <= 180 
        ? result.introduction_text 
        : result.introduction_text.slice(0, 180).trim();

      // Validate and clamp buttons
      result.buttons = result.buttons
        .slice(0, 3)
        .map((button: any) => ({
          title: button.title?.length <= 20 
            ? button.title 
            : button.title?.slice(0, 20).trim() || "Consulta",
          payload: button.payload?.match(/^@[a-z0-9_]+$/) 
            ? button.payload 
            : `@${button.payload?.replace(/^@/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '') || 'consulta_juridica_geral'}`
        }));

      return result;
    } catch (error) {
      console.error("Erro ao gerar tópicos jurídicos:", error);
      return null;
    }
  }

  /**
   * Create deterministic fallback legal topics
   * @param elapsedTime Time already elapsed
   * @returns Fallback topics result
   */
  private createFallbackTopics(elapsedTime: number): LowBandResult {
    console.log("🔄 Using deterministic legal topics fallback");

    return {
      type: 'domain_topics',
      introduction_text: "Posso ajudar com sua questão jurídica. Qual área melhor se relaciona com sua situação?",
      buttons: [
        { title: "Direito Civil", payload: "@consulta_direito_civil" },
        { title: "Direito Consumidor", payload: "@consulta_direito_consumidor" },
        { title: "Direito Família", payload: "@consulta_direito_familia" }
      ],
      response_time_ms: elapsedTime
    };
  }
}

/**
 * Performance Band Processing Factory
 * Creates appropriate processor based on classification result
 */
export class PerformanceBandProcessor {
  private hardProcessor: HardBandProcessor;
  private softProcessor: SoftBandProcessor;
  private lowProcessor: LowBandProcessor;

  constructor(agent: AgentConfig) {
    this.hardProcessor = new HardBandProcessor(agent);
    this.softProcessor = new SoftBandProcessor(agent);
    this.lowProcessor = new LowBandProcessor(agent);
  }

  /**
   * Process classification result based on performance band
   * @param userText Original user message
   * @param classification Classification result with band and candidates
   * @returns Band-specific processing result
   */
  async process(
    userText: string,
    classification: ClassificationResult
  ): Promise<BandProcessingResult> {
    const startTime = Date.now();

    console.log(`🎯 Processing ${classification.band} band with strategy: ${classification.strategy}`);

    try {
      switch (classification.band) {
        case 'HARD':
          return await this.hardProcessor.process(
            userText,
            classification.candidates[0], // Top candidate
            true // Enable microcopy
          );

        case 'SOFT':
          return await this.softProcessor.process(
            userText,
            classification.candidates.slice(0, 3) // Top 3 candidates
          );

        case 'LOW':
          return await this.lowProcessor.process(userText);

        default:
          throw new Error(`Unsupported band: ${classification.band}`);
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Band processing failed for ${classification.band}:`, error);
      
      // Ultimate fallback
      return {
        type: 'domain_topics',
        introduction_text: "Desculpe, houve um problema. Como posso ajudar com sua questão jurídica?",
        buttons: [
          { title: "Falar com Humano", payload: "@handoff_human" },
          { title: "Tentar Novamente", payload: "@retry_classification" },
          { title: "Consulta Geral", payload: "@consulta_juridica_geral" }
        ],
        response_time_ms: totalTime
      };
    }
  }
}