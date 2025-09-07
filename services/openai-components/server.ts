// services/openai-components/server.ts
import OpenAI from "openai";
import {
  IOpenAIService,
  ChatOptions,
  ImageGenerationOptions,
  FileUploadOptions,
  FilePurpose,
  DEFAULT_MODELS,
  IntentCandidate,
  WarmupButtonsResponse,
  RouterDecision,
  AgentConfig,
} from "./types";
import { withDeadlineAbort } from "./utils";

// Import individual method handlers
import { createChatCompletion } from "./server-chat";
import { generateImage, generateImageWithResponses, createImageEdit, createImageVariation } from "./server-images";
import { transcribeAudio } from "./server-audio";
import { getEmbeddings } from "./server-embeddings";
import { moderateContent } from "./server-moderations";
import { listModels } from "./server-models";
import { uploadFile, uploadFileFromPath, listFiles, retrieveFile, retrieveFileContent, deleteFile } from "./server-files";
import { extractPdfWithAssistant, askAboutPdf } from "./server-pdf";
import { generateShortTitlesBatch, generateWarmupButtons, generateFreeChatButtons, routerLLM } from "./server-socialwise";

// Implementação para servidor que usa a SDK OpenAI diretamente
export class ServerOpenAIService implements IOpenAIService {
  client: OpenAI;
  pdfAssistantId: string | null = process.env.PDF_ASSISTANT_ID || null;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    // Bind methods to the instance
    this.createChatCompletion = createChatCompletion.bind(this);
    this.generateImage = generateImage.bind(this);
    this.generateImageWithResponses = generateImageWithResponses.bind(this);
    this.createImageEdit = createImageEdit.bind(this);
    this.createImageVariation = createImageVariation.bind(this);
    this.transcribeAudio = transcribeAudio.bind(this);
    this.getEmbeddings = getEmbeddings.bind(this);
    this.moderateContent = moderateContent.bind(this);
    this.listModels = listModels.bind(this);
    this.uploadFile = uploadFile.bind(this);
    this.uploadFileFromPath = uploadFileFromPath.bind(this);
    this.listFiles = listFiles.bind(this);
    this.retrieveFile = retrieveFile.bind(this);
    this.retrieveFileContent = retrieveFileContent.bind(this);
    this.deleteFile = deleteFile.bind(this);
    this.extractPdfWithAssistant = extractPdfWithAssistant.bind(this);
    this.askAboutPdf = askAboutPdf.bind(this);
    this.generateShortTitlesBatch = generateShortTitlesBatch.bind(this);
    this.generateWarmupButtons = generateWarmupButtons.bind(this);
    this.generateFreeChatButtons = generateFreeChatButtons.bind(this);
    this.routerLLM = routerLLM.bind(this);
  }

  // Chat
  createChatCompletion: (messages: any[], options?: ChatOptions) => Promise<any>;

  // Images
  generateImage: (prompt: string, options?: ImageGenerationOptions) => Promise<any>;
  generateImageWithResponses: (prompt: string, options?: any) => Promise<any>;
  createImageEdit: (image: File, prompt: string, mask?: File, options?: any) => Promise<any>;
  createImageVariation: (image: File, options?: any) => Promise<any>;

  // Audio
  transcribeAudio: (audioFile: File) => Promise<any>;

  // Embeddings
  getEmbeddings: (input: string | string[]) => Promise<any>;

  // Moderations
  moderateContent: (input: string | string[]) => Promise<any>;

  // Models
  listModels: () => Promise<any>;

  // Files
  uploadFile: (file: File, options: FileUploadOptions) => Promise<any>;
  uploadFileFromPath: (filePath: string, opts: { filename: string; mimeType: string; purpose: FilePurpose }) => Promise<any>;
  listFiles: (purpose?: FilePurpose) => Promise<any>;
  retrieveFile: (fileId: string) => Promise<any>;
  retrieveFileContent: (fileId: string) => Promise<any>;
  deleteFile: (fileId: string) => Promise<any>;

  // PDF
  extractPdfWithAssistant: (fileId: string, prompt: string) => Promise<string>;
  askAboutPdf: (fileId: string, question: string, options?: ChatOptions) => Promise<string>;

  // SocialWise
  generateShortTitlesBatch: (intents: IntentCandidate[], agent: AgentConfig) => Promise<string[] | null>;
  generateWarmupButtons: (userText: string, candidates: IntentCandidate[], agent: AgentConfig, opts?: { channelType?: import("./types").ChannelType }) => Promise<WarmupButtonsResponse | null>;
  generateFreeChatButtons: (userText: string, agent: AgentConfig, opts?: { channelType?: import("./types").ChannelType }) => Promise<WarmupButtonsResponse | null>;
  routerLLM: (
    userText: string,
    agent: AgentConfig,
    opts?: { channelType?: import("./types").ChannelType; sessionId?: string; intentHints?: import("./types").IntentCandidate[] }
  ) => Promise<RouterDecision | null>;

  async checkApiConnection() {
    try {
      console.log("Servidor: Verificando conexão com a API da OpenAI...");

      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          status: response.status,
          message: `Falha na conexão: ${response.status} - ${errorData}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        status: response.status,
        message: "Conexão estabelecida com sucesso",
        models: data.data.length,
      };
    } catch (error: any) {
      return {
        success: false,
        status: "error",
        message: `Erro na conexão: ${error.message}`,
      };
    }
  }

  withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms = 250
  ): Promise<T | null> {
    return withDeadlineAbort(fn, ms);
  }
}
