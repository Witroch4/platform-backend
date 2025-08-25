// services/openai-client-only.ts
import { ClientOpenAIService } from "./openai-components/client";

// Client-only service to avoid server-side imports in client components
const clientOnlyService = new ClientOpenAIService();

export default clientOnlyService;
export const openaiService = clientOnlyService;

// Re-export types for convenience
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
} from "./openai-components/types";