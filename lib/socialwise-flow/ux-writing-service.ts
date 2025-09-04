/**
 * UX Writing Service for SocialWise Flow
 * Integrates legal domain prompts, contextual analysis, and channel formatting
 */

import {
  IntentCandidate,
  WarmupButtonsResponse,
  AgentConfig,
  IOpenAIService,
} from "@/services/openai";
import {
  buildWarmupButtonsPrompt,
  buildShortTitlesPrompt,
  buildDomainTopicsPrompt,
  analyzeLegalContext,
  getHumanizedTitle,
  FALLBACK_TITLES,
} from "./ux-writing";
import { clampTitle, clampButtonData, validateChannelLimits } from "@/lib/socialwise/clamps";
import {
  buildChannelResponse,
  buildFallbackResponse,
  ButtonOption,
} from "./channel-formatting";

/**
 * UX Writing Service for legal domain chatbot interactions
 */
export class UXWritingService {
  constructor(private openaiService: IOpenAIService) {}

  /**
   * Generates warmup buttons with legal context analysis
   * @param userText User's input message
   * @param candidates Intent candidates from embedding search
   * @param agent Agent configuration
   * @returns Warmup buttons response or null if failed
   */
  async generateWarmupButtons(
    userText: string,
    candidates: IntentCandidate[],
    agent: AgentConfig
  ): Promise<WarmupButtonsResponse | null> {
    if (!candidates.length) {
      return this.generateFallbackWarmupButtons(userText);
    }

    try {
      // Use the OpenAI service method with legal context
      const result = await this.openaiService.generateWarmupButtons(
        userText,
        candidates,
        agent
      );

      if (result) {
        // Validate and enhance the result with legal context
        return this.enhanceWarmupButtons(result, userText, candidates);
      }

      // Fallback to deterministic generation
      return this.generateFallbackWarmupButtons(userText, candidates);
    } catch (error) {
      console.error("Error generating warmup buttons:", error);
      return this.generateFallbackWarmupButtons(userText, candidates);
    }
  }

  /**
   * Generates short titles for intent candidates in batch
   * @param intents Intent candidates
   * @param agent Agent configuration
   * @returns Array of short titles or null if failed
   */
  async generateShortTitlesBatch(
    intents: IntentCandidate[],
    agent: AgentConfig
  ): Promise<string[] | null> {
    if (!intents.length) return [];

    try {
      // Use the OpenAI service method
      const result = await this.openaiService.generateShortTitlesBatch(
        intents,
        agent
      );

      if (result && result.length === intents.length) {
        // Validate and clamp each title
        return result.map((title, index) => {
          const clamped = clampTitle(title, 4, 20);
          return clamped || getHumanizedTitle(intents[index].slug);
        });
      }

      // Fallback to humanized titles
      return this.generateHumanizedTitles(intents);
    } catch (error) {
      console.error("Error generating short titles batch:", error);
      return this.generateHumanizedTitles(intents);
    }
  }

  /**
   * Generates domain-specific legal topic suggestions for low confidence scenarios
   * @param userText User's input message
   * @param agent Agent configuration
   * @returns Domain topics response or fallback
   */
  async generateDomainTopics(
    userText: string,
    agent: AgentConfig
  ): Promise<WarmupButtonsResponse> {
    try {
      // Analyze legal context first
      const legalContext = analyzeLegalContext(userText);

      // Use router LLM with domain topics prompt
      const prompt = buildDomainTopicsPrompt(userText);

      const result = await this.openaiService.routerLLM(userText, agent);

      if (result && result.mode === "intent" && result.buttons) {
        return {
          response_text:
            result.response_text ||
            "Posso ajudar com diversas questões jurídicas. Qual área se aproxima mais da sua necessidade?",
          buttons: result.buttons.map((btn) => {
            const clamped = clampButtonData(btn, "whatsapp");
            return { title: clamped.title, payload: clamped.payload };
          }),
        };
      }

      // Fallback to deterministic domain topics
      return this.generateFallbackDomainTopics(
        legalContext.primaryArea || undefined
      );
    } catch (error) {
      console.error("Error generating domain topics:", error);
      return this.generateFallbackDomainTopics();
    }
  }

  /**
   * Formats response for specific channel with proper validation
   * @param channel Channel type
   * @param introText Introduction text
   * @param buttons Button options
   * @returns Formatted channel response
   */
  formatChannelResponse(
    channel: "whatsapp" | "instagram" | "facebook",
    introText: string,
    buttons: ButtonOption[]
  ): any {
    return buildChannelResponse(channel, introText, buttons);
  }

  /**
   * Enhances warmup buttons with legal context validation
   * @param result Original LLM result
   * @param userText User's input
   * @param candidates Intent candidates
   * @returns Enhanced warmup buttons
   */
  private enhanceWarmupButtons(
    result: WarmupButtonsResponse,
    userText: string,
    candidates: IntentCandidate[]
  ): WarmupButtonsResponse {
    const legalContext = analyzeLegalContext(userText);

    // Enhance introduction text with legal context if needed
    let enhancedIntro = result.response_text;
    if (legalContext.confidence === "high" && legalContext.primaryArea) {
      const areaNames: Record<string, string> = {
        traffic: "trânsito",
        civil: "civil",
        family: "família",
        labor: "trabalhista",
        consumer: "consumidor",
        criminal: "criminal",
      };

      const areaName = areaNames[legalContext.primaryArea];
      if (areaName && !enhancedIntro.toLowerCase().includes(areaName)) {
        enhancedIntro = `Vejo que sua questão envolve direito ${areaName}. ${enhancedIntro}`;
      }
    }

    // Validate and enhance buttons
    const enhancedButtons = result.buttons.map((button, index) => {
      const validation = validateChannelLimits({ buttons: [button] }, "whatsapp");

      if (!validation.isValid) {
        // Use candidate as fallback
        const candidate = candidates[index];
        if (candidate) {
          return {
            title: getHumanizedTitle(candidate.slug),
            payload: `@${candidate.slug}`,
          };
        }

        return {
          title: "Consulta",
          payload: "@consulta_juridica",
        };
      }

      const clamped = clampButtonData(button, "whatsapp");
      return {
        title: clamped.title,
        payload: clamped.payload
      };
    });

    return {
      response_text: enhancedIntro.slice(0, 180),
      buttons: enhancedButtons.slice(0, 3),
    };
  }

  /**
   * Generates fallback warmup buttons when LLM fails
   * @param userText User's input
   * @param candidates Optional intent candidates
   * @returns Fallback warmup buttons
   */
  private generateFallbackWarmupButtons(
    userText: string,
    candidates?: IntentCandidate[]
  ): WarmupButtonsResponse {
    const legalContext = analyzeLegalContext(userText);

    let buttons: ButtonOption[] = [];

    if (candidates && candidates.length > 0) {
      // Use candidates with humanized titles
      buttons = candidates.slice(0, 3).map((candidate) => ({
        title: getHumanizedTitle(candidate.slug),
        payload: `@${candidate.slug}`,
      }));
    } else {
      // Use generic legal area buttons based on context
      if (legalContext.primaryArea === "traffic") {
        buttons = [
          { title: "Recorrer Multa", payload: "@recurso_multa_transito" },
          { title: "Defesa Admin", payload: "@defesa_administrativa" },
          { title: "Consulta CNH", payload: "@consulta_cnh" },
        ];
      } else if (legalContext.primaryArea === "civil") {
        buttons = [
          { title: "Cobrar Dívida", payload: "@acao_cobranca" },
          { title: "Danos Morais", payload: "@danos_morais" },
          { title: "Consulta Civil", payload: "@consulta_civil" },
        ];
      } else {
        // Generic fallback
        buttons = [
          { title: "Consulta Jurídica", payload: "@consulta_juridica" },
          { title: "Orientação Legal", payload: "@orientacao_legal" },
          { title: "Analisar Caso", payload: "@analise_caso" },
        ];
      }
    }

    const introText =
      legalContext.confidence === "high" && legalContext.primaryArea
        ? `Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?`
        : `Posso ajudar com diversas questões jurídicas. Qual opção melhor descreve sua necessidade?`;

    return {
      response_text: introText,
      buttons: buttons.map((btn) => {
        const clamped = clampButtonData(btn, "whatsapp");
        return { title: clamped.title, payload: clamped.payload };
      }),
    };
  }

  /**
   * Generates humanized titles for intents when LLM fails
   * @param intents Intent candidates
   * @returns Array of humanized titles
   */
  private generateHumanizedTitles(intents: IntentCandidate[]): string[] {
    return intents.map((intent) => getHumanizedTitle(intent.slug));
  }

  /**
   * Generates fallback domain topics when LLM fails
   * @param primaryArea Detected primary legal area
   * @returns Fallback domain topics response
   */
  private generateFallbackDomainTopics(
    primaryArea?: string
  ): WarmupButtonsResponse {
    const domainButtons: Record<string, ButtonOption[]> = {
      traffic: [
        { title: "Direito Trânsito", payload: "@direito_transito" },
        { title: "Direito Civil", payload: "@direito_civil" },
        { title: "Consulta Geral", payload: "@consulta_juridica" },
      ],
      civil: [
        { title: "Direito Civil", payload: "@direito_civil" },
        { title: "Direito Família", payload: "@direito_familia" },
        { title: "Direito Consumidor", payload: "@direito_consumidor" },
      ],
      family: [
        { title: "Direito Família", payload: "@direito_familia" },
        { title: "Direito Civil", payload: "@direito_civil" },
        { title: "Consulta Geral", payload: "@consulta_juridica" },
      ],
      default: [
        { title: "Direito Civil", payload: "@direito_civil" },
        { title: "Direito Trânsito", payload: "@direito_transito" },
        { title: "Direito Família", payload: "@direito_familia" },
      ],
    };

    const buttons =
      domainButtons[primaryArea || "default"] || domainButtons.default;

    return {
      response_text:
        "Posso ajudar com diversas questões jurídicas. Qual área se aproxima mais da sua necessidade?",
      buttons: buttons.map((btn) => {
        const clamped = clampButtonData(btn, "whatsapp");
        return { title: clamped.title, payload: clamped.payload };
      }),
    };
  }
}

/**
 * Creates a UX Writing Service instance
 * @param openaiService OpenAI service instance
 * @returns UX Writing Service
 */
export function createUXWritingService(
  openaiService: IOpenAIService
): UXWritingService {
  return new UXWritingService(openaiService);
}
