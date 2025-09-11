
// services/openai-components/types.ts

// Tipos para os modelos disponíveis da OpenAI
export type GPTModel = string; // Aceita qualquer string, já que os modelos são dinâmicos

export type ImageModel = "dall-e-3" | "dall-e-2";

export type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1792x1024"
  | "1024x1792";

export type ImageQuality =
  | "standard"
  | "hd"
  | "low"
  | "medium"
  | "high"
  | "auto";

export type ImageStyle = "vivid" | "natural";

// File types
export type FilePurpose =
  | "assistants"
  | "assistants_output"
  | "batch"
  | "batch_output"
  | "fine-tune"
  | "fine-tune-results"
  | "vision"
  | "user_data";

// 🔧 CONSTANTES DINÂMICAS: Valores padrão que podem ser substituídos por modelos da API
export const DEFAULT_MODELS = {
  // Modelos padrão que serão substituídos dinamicamente quando possível
  CHAT: process.env.DEFAULT_CHAT_MODEL || "gpt-4o-latest",
  CHAT_ADVANCED: process.env.DEFAULT_CHAT_ADVANCED_MODEL || "gpt-5-chat-latest",
  CHAT_FAST: process.env.DEFAULT_CHAT_FAST_MODEL || "gpt-4.1-mini",
  CHAT_NANO: process.env.DEFAULT_CHAT_NANO_MODEL || "gpt-4.1-nano",
  IMAGE: process.env.DEFAULT_IMAGE_MODEL || "gpt-image-1",
  EMBEDDING: process.env.DEFAULT_EMBEDDING_MODEL || "text-embedding-3-small",
  AUDIO: process.env.DEFAULT_AUDIO_MODEL || "whisper-1",
} as const;

// SocialWise Flow structured output types
export interface IntentCandidate {
  slug: string;
  name?: string;
  desc?: string;
  score?: number;
  threshold?: number;
  // optional metadata for routing hints
  aliases?: string[];
  aliasMatched?: string;
}

export interface WarmupButtonsResponse {
  response_text: string;
  buttons: Array<{
    title: string;
    payload: string;
  }>;
}

export interface RouterDecision {
  mode: "intent" | "chat";
  intent_payload?: string;
  response_text: string; // Obrigatório
  buttons: Array<{           // Obrigatório, mínimo 2, máximo 3
    title: string;
    payload: string;
  }>;
  // text removido - forçar uso de botões
}

// Canal do front (controla limites do schema)
export type ChannelType = "whatsapp" | "instagram" | "facebook";

export interface AgentConfig {
  model: string;
  developer?: string;
  instructions?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  toolChoice?: "none" | "auto";
  tempSchema?: number;
  tempCopy?: number;
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number;
  warmupDeadlineMs?: number;
  hardDeadlineMs?: number;
  softDeadlineMs?: number;
  embedipreview?: boolean;
}

// Interface para as opções de configuração de chat
export interface ChatOptions {
  model?: GPTModel;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

// Interface para as opções de geração de imagem
export interface ImageGenerationOptions {
  model?: ImageModel | "gpt-image-1";
  n?: number;
  quality?: ImageQuality;
  response_format?: "url" | "b64_json";
  size?: ImageSize;
  style?: ImageStyle;
  user?: string;
  background?: "auto" | "transparent" | "opaque";
  moderation?: "auto" | "low";
}

// Interface for file options
export interface FileUploadOptions {
  purpose: FilePurpose;
}

// Interface para o serviço OpenAI
export interface IOpenAIService {
  createChatCompletion(messages: any[], options?: ChatOptions): Promise<any>;
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<any>;
  generateImageWithResponses(prompt: string, options?: any): Promise<any>;
  transcribeAudio(audioFile: File): Promise<any>;
  getEmbeddings(input: string | string[]): Promise<any>;
  moderateContent(input: string | string[]): Promise<any>;
  listModels(): Promise<any>;
  uploadFile(file: File, options: FileUploadOptions): Promise<any>;
  uploadFileFromPath(
    filePath: string,
    opts: { filename: string; mimeType: string; purpose: FilePurpose }
  ): Promise<any>;
  listFiles(purpose?: FilePurpose): Promise<any>;
  retrieveFile(fileId: string): Promise<any>;
  retrieveFileContent(fileId: string): Promise<any>;
  deleteFile(fileId: string): Promise<any>;
  createImageEdit(
    image: File,
    prompt: string,
    mask?: File,
    options?: any
  ): Promise<any>;
  createImageVariation(image: File, options?: any): Promise<any>;
  checkApiConnection(): Promise<any>;
  extractPdfWithAssistant(fileId: string, prompt: string): Promise<string>;
  askAboutPdf(
    fileId: string,
    question: string,
    options?: ChatOptions
  ): Promise<string>;

  // SocialWise Flow structured output methods
  generateShortTitlesBatch(
    intents: IntentCandidate[],
    agent: AgentConfig
  ): Promise<string[] | null>;

  generateWarmupButtons(
    userText: string,
    candidates: IntentCandidate[],
    agent: AgentConfig,
    opts?: { 
      channelType?: ChannelType;
      sessionId?: string;
    }
  ): Promise<WarmupButtonsResponse | null>;

  // 🎯 NOVA FUNCIONALIDADE: Chat livre com IA para banda LOW
  generateFreeChatButtons(
    userText: string,
    agent: AgentConfig,
    opts?: { 
      channelType?: ChannelType;
      sessionId?: string;
    }
  ): Promise<WarmupButtonsResponse | null>;

  routerLLM(
    userText: string,
    agent: AgentConfig,
    opts?: { 
      channelType?: ChannelType;
      sessionId?: string;
      intentHints?: IntentCandidate[];
      profile?: 'lite' | 'full';
    }
  ): Promise<RouterDecision | null>;

  // Enhanced deadline management
  withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms?: number
  ): Promise<T | null>;
}
