// services/openai.ts
//biblia app\api\openai-source-test\route.ts
import { IOpenAIService } from "./openai-components/types";
import { ServerOpenAIService } from "./openai-components/server";
import { ClientOpenAIService } from "./openai-components/client";

const isServer = typeof window === "undefined";

let openAIService: IOpenAIService;

if (isServer) {
  // Ambiente de servidor (Node.js)
  openAIService = new ServerOpenAIService();
} else {
  // Ambiente de cliente (navegador)
  openAIService = new ClientOpenAIService();
}

export default openAIService;

// Export the service instance with the old name for backward compatibility
export const openaiService = openAIService;

/**
 * Retorna uma instância singleton do serviço OpenAI para o lado do servidor.
 * Lança um erro se chamado no lado do cliente.
 * @returns Uma instância de ServerOpenAIService.
 */
export function getOpenAIServiceForServer(
  apiKey?: string
): ServerOpenAIService {
  if (!isServer) {
    throw new Error(
      "getOpenAIServiceForServer só pode ser chamada no lado do servidor."
    );
  }
  // Retorna uma nova instância ou uma instância singleton, dependendo da necessidade.
  // Para este caso, uma nova instância com a chave de API específica é mais flexível.
  return new ServerOpenAIService(apiKey);
}

// Re-export types from the types file for backward compatibility
export type {
  GPTModel,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageStyle,
  FilePurpose,
  IntentCandidate,
  WarmupButtonsResponse,
  RouterDecision,
  AgentConfig,
  ChatOptions,
  ImageGenerationOptions,
  FileUploadOptions,
  IOpenAIService,
} from "./openai-components/types";

export { DEFAULT_MODELS } from "./openai-components/types";
