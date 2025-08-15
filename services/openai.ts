// services/openai.ts
import OpenAI, { toFile } from "openai";
import { Message } from "@/hooks/useChatwitIA";
import {
  openaiWithCost,
  openaiChatWithCost,
  openaiEmbeddingWithCost,
  responsesCall,
} from "@/lib/cost/openai-wrapper";

// Importações condicionais para evitar problemas com o bundler no navegador
// Isso é necessário porque o código pode ser importado durante o build pelo Webpack/Next.js,
// mesmo que a função específica que usa fs nunca seja executada no navegador
// O typeof window verifica se estamos em ambiente de navegador (não Node.js)
const isServer = typeof window === "undefined";

// Código que pode ser carregado pelo bundler (webpack/vite) mas nunca é executado no navegador
// Tipos para os modelos disponíveis da OpenAI
// 🔧 REFATORAÇÃO: Removida lista estática - modelos são obtidos dinamicamente via API
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
}

export interface WarmupButtonsResponse {
  introduction_text: string;
  buttons: Array<{
    title: string;
    payload: string;
  }>;
}

export interface RouterDecision {
  mode: "intent" | "chat";
  intent_payload?: string;
  introduction_text?: string;
  buttons?: Array<{
    title: string;
    payload: string;
  }>;
  text?: string;
}

export interface AgentConfig {
  model: string;
  developer?: string;
  instructions?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  toolChoice?: "none" | "auto";
  tempSchema?: number;
  tempCopy?: number;
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
    agent: AgentConfig
  ): Promise<WarmupButtonsResponse | null>;

  routerLLM(
    userText: string,
    agent: AgentConfig
  ): Promise<RouterDecision | null>;

  // Enhanced deadline management
  withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms?: number
  ): Promise<T | null>;
}

/**
 * Executes an operation with a real AbortController and deadline management
 * @param fn Function to execute with abort signal
 * @param ms Deadline in milliseconds (default: 250ms)
 * @returns Result of the operation or null if aborted
 */
async function withDeadlineAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 250
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.warn(`⏰ Operation aborted after ${ms}ms deadline`);
    controller.abort();
  }, ms);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError" || controller.signal.aborted) {
      console.warn(`🚫 LLM call aborted after ${ms}ms`);
      return null;
    }
    throw error;
  }
}

// Implementação para servidor que usa a SDK OpenAI diretamente
class ServerOpenAIService implements IOpenAIService {
  client: OpenAI; // Expose client directly for external access
  private pdfAssistantId: string | null = process.env.PDF_ASSISTANT_ID || null;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async createChatCompletion(messages: any[], options: ChatOptions = {}) {
    const defaultOptions: ChatOptions = {
      model: DEFAULT_MODELS.CHAT,
      temperature: 0.7,
      max_tokens: 420000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      // 🖼️ CORREÇÃO: Separar claramente URLs de imagem de file IDs
      const fileIdReferences: string[] = [];
      const imageUrls: string[] = [];

      const cleanedMessages = messages.map((message) => {
        if (typeof message.content === "string") {
          let cleanedContent = message.content;

          // Extrair file IDs válidos (que começam com 'file-')
          const fileIdMatches = message.content.match(
            /\[.*?\]\(file_id:(file-[^)]+)\)/g
          );
          if (fileIdMatches && fileIdMatches.length > 0) {
            // Extrair os IDs dos arquivos válidos
            fileIdMatches.forEach((match: string) => {
              const fileId = match.match(
                /\[.*?\]\(file_id:(file-[^)]+)\)/
              )?.[1];
              if (fileId) fileIdReferences.push(fileId);
            });
            // Remover as referências de arquivo válido do texto
            cleanedContent = cleanedContent
              .replace(/\[.*?\]\(file_id:file-[^)]+\)/g, "")
              .trim();
          }

          // 🚨 CORREÇÃO: Detectar file_id com URL (erro comum) e converter para image_url
          const invalidFileIdMatches = message.content.match(
            /\[.*?\]\(file_id:(https?:\/\/[^)]+)\)/g
          );
          if (invalidFileIdMatches && invalidFileIdMatches.length > 0) {
            console.log(
              `⚠️ Detectados ${invalidFileIdMatches.length} file_id inválidos com URLs - convertendo para image_url`
            );
            invalidFileIdMatches.forEach((match: string) => {
              const invalidUrl = match.match(
                /\[.*?\]\(file_id:(https?:\/\/[^)]+)\)/
              )?.[1];
              if (invalidUrl) {
                imageUrls.push(invalidUrl);
                console.log(
                  `🔄 Convertendo file_id inválido para image_url: ${invalidUrl.substring(0, 50)}...`
                );
              }
            });
            // Remover as referências inválidas do texto
            cleanedContent = cleanedContent
              .replace(/\[.*?\]\(file_id:https?:\/\/[^)]+\)/g, "")
              .trim();
          }

          // Extrair URLs de imagem do markdown
          const imageMarkdownMatches = message.content.match(
            /!\[.*?\]\((https?:\/\/[^)]+)\)/g
          );
          if (imageMarkdownMatches && imageMarkdownMatches.length > 0) {
            imageMarkdownMatches.forEach((match: string) => {
              const imageUrl = match.match(
                /!\[.*?\]\((https?:\/\/[^)]+)\)/
              )?.[1];
              if (imageUrl) {
                imageUrls.push(imageUrl);
                console.log(
                  `🖼️ Extraída URL de imagem: ${imageUrl.substring(0, 50)}...`
                );
              }
            });
            // Remover as referências de imagem do texto
            cleanedContent = cleanedContent
              .replace(/!\[.*?\]\((https?:\/\/[^)]+)\)/g, "")
              .trim();
          }

          return { ...message, content: cleanedContent };
        }
        return message;
      });

      console.log(
        `🚀 Usando Responses API exclusivamente para modelo: ${mergedOptions.model}`
      );
      console.log(`📁 File IDs extraídos: ${fileIdReferences.length}`);
      console.log(`🖼️ URLs de imagem extraídas: ${imageUrls.length}`);

      // Verificar se é modelo da série O para adicionar reasoning
      const isOSeriesModel = mergedOptions.model!.startsWith("o");

      // Mapeamento especial para o4-mini-high
      let actualModel: string = mergedOptions.model!;
      let reasoningEffort: string | undefined;
      if (mergedOptions.model === ("o4-mini-high" as any)) {
        actualModel = "o4-mini";
        reasoningEffort = "high";
        console.log(
          `🧠 Mapeando ${mergedOptions.model} para ${actualModel} com reasoning effort: ${reasoningEffort}`
        );
      }

      // Extrair mensagem de sistema (instruções)
      const firstSystem = cleanedMessages.find((m: any) => m.role === "system");
      const systemText = (() => {
        if (!firstSystem) return "";
        if (typeof firstSystem.content === "string")
          return firstSystem.content.trim();
        if (Array.isArray(firstSystem.content)) {
          const txt = firstSystem.content.find(
            (it: any) => it?.type === "text" && typeof it?.text === "string"
          );
          return txt?.text?.trim() || "";
        }
        return "";
      })();

      // Converter mensagens para o formato da Responses API
      const lastUserMessage = [...cleanedMessages]
        .reverse()
        .find((m) => m.role === "user");
      let userContent = "";

      if (lastUserMessage) {
        if (typeof lastUserMessage.content === "string") {
          userContent = lastUserMessage.content;
        } else if (Array.isArray(lastUserMessage.content)) {
          const textItem = lastUserMessage.content.find(
            (item: any) => item.type === "text"
          );
          if (textItem && textItem.text) {
            userContent = textItem.text;
          }
        }
      }

      // Se não tiver conteúdo, usar uma instrução genérica
      const promptText = userContent || "Analise o conteúdo fornecido.";

      // Preparar o input para a Responses API (apenas conteúdo do usuário)
      const inputContent: any[] = [{ type: "input_text", text: promptText }];

      // Adicionar imagens como input_image
      imageUrls.forEach((imageUrl, index) => {
        inputContent.push({
          type: "input_image",
          image_url: imageUrl, // 🔧 CORREÇÃO: Responses API usa image_url direta
        });
        console.log(
          `🖼️ Adicionada imagem ${index + 1} como input_image: ${imageUrl.substring(0, 50)}...`
        );
      });

      // Adicionar cada arquivo como um item separado no content
      fileIdReferences.forEach((fileId) => {
        inputContent.push({ type: "input_file", file_id: fileId });
        console.log(`📁 Adicionado arquivo como input_file: ${fileId}`);
      });

      // Processar mensagens com conteúdo complexo (imagens, etc.)
      cleanedMessages.forEach((message: any) => {
        if (Array.isArray(message.content)) {
          (message.content as any[]).forEach((item: any) => {
            if (item.type === "image" && item.image_url) {
              // Garantir que o formato esteja correto para Responses API
              let imageUrl: string;
              if (typeof item.image_url === "string") {
                imageUrl = item.image_url;
              } else if (
                typeof item.image_url === "object" &&
                item.image_url &&
                "url" in item.image_url
              ) {
                imageUrl = item.image_url.url;
              } else {
                console.warn(
                  "⚠️ Formato de image_url não reconhecido:",
                  item.image_url
                );
                return;
              }

              inputContent.push({
                type: "input_image",
                image_url: imageUrl, // 🔧 CORREÇÃO: Responses API usa image_url direta
              });
              console.log(
                `🖼️ Adicionada imagem do conteúdo complexo como input_image`
              );
            }
          });
        }
      });

      // Configurar opções para a requisição da Responses API
      // Helper para clamp seguro
      const clamp = (n: number | undefined, min: number, max: number) =>
        typeof n === "number" ? Math.max(min, Math.min(max, n)) : undefined;

      // Configurar parâmetros da Responses API (sem campos inválidos)
      const requestParams: any = {
        model: actualModel,
        input: [
          {
            role: "user",
            content: inputContent,
          },
        ],
        ...(systemText ? { instructions: systemText } : {}),
        store: true,
        temperature: mergedOptions.temperature,
        top_p: mergedOptions.top_p,
        // Evita 400 por excesso de tokens de saída; ajuste se precisar
        max_output_tokens: clamp(mergedOptions.max_tokens, 1, 8192) ?? 1024,
      };

      // Adicionar parâmetro reasoning (O-series e GPT-5)
      const isReasoningModel =
        isOSeriesModel || actualModel.startsWith("gpt-5");
      if (isReasoningModel) {
        const effort = reasoningEffort || "medium";
        requestParams.reasoning = { effort };
        console.log(`🧠 Reasoning effort: ${effort} (${actualModel})`);
      }

      console.log("📤 Enviando requisição para Responses API:", {
        model: requestParams.model,
        inputItems: inputContent.length,
        hasFiles: fileIdReferences.length > 0,
      });

      // Usar a Responses API (passando params completos e options com signal)
      const response = await withDeadlineAbort(async (signal) => {
        return responsesCall(
          this.client,
          requestParams,
          { traceId: `chat-completion-${Date.now()}`, intent: "chat_completion" },
          { signal, timeout: 5000 }
        );
      }, 5000);

      if (!response) {
        throw new Error("Chat completion aborted due to timeout");
      }

      console.log("✅ Resposta recebida da Responses API");

      // Simular a resposta no formato que seria retornado por chat.completions para compatibilidade
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: response.output_text || "",
            },
          },
        ],
        // Incluir dados adicionais da Responses API
        responsesApiData: {
          id: response.id,
          model: response.model,
          usage: response.usage,
          created_at: response.created_at,
          status: response.status,
          output: response.output,
        },
      };
    } catch (error) {
      console.error("Erro ao criar chat completion com Responses API:", error);
      throw error;
    }
  }

  async generateImage(prompt: string, options: ImageGenerationOptions = {}) {
    const defaultOptions: ImageGenerationOptions = {
      model: "gpt-image-1",
      n: 1,
      size: "1024x1024",
      quality: "auto",
      background: "auto",
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      console.log(`Servidor: Gerando imagem com modelo ${mergedOptions.model}`);

      // Preparar parâmetros compatíveis com a SDK
      const generateParams: any = {
        model: mergedOptions.model as any,
        prompt,
        n: mergedOptions.n,
        user: mergedOptions.user,
      };

      // Adicionar parâmetros específicos baseado no modelo
      if (mergedOptions.model === "gpt-image-1") {
        // Para gpt-image-1, usar apenas parâmetros suportados
        if (mergedOptions.size) generateParams.size = mergedOptions.size;
        if (mergedOptions.quality)
          generateParams.quality = mergedOptions.quality;
        if (mergedOptions.background)
          generateParams.background = mergedOptions.background;
        // gpt-image-1 sempre retorna base64, não usar response_format
      } else if (mergedOptions.model === "dall-e-3") {
        // Para DALL-E 3, usar parâmetros completos
        if (mergedOptions.size) generateParams.size = mergedOptions.size;
        if (mergedOptions.response_format)
          generateParams.response_format = mergedOptions.response_format;
        if (mergedOptions.quality)
          generateParams.quality = mergedOptions.quality;
        if (mergedOptions.style) generateParams.style = mergedOptions.style;
      } else if (mergedOptions.model === "dall-e-2") {
        // Para DALL-E 2, usar apenas parâmetros suportados
        if (mergedOptions.size) generateParams.size = mergedOptions.size;
        if (mergedOptions.response_format)
          generateParams.response_format = mergedOptions.response_format;
      }

      const response = await this.client.images.generate(generateParams);

      console.log(
        `Servidor: Imagem gerada com sucesso - ${response.data?.length || 0} imagem(ns)`
      );
      return response;
    } catch (error) {
      console.error("Erro ao gerar imagem:", error);
      throw error;
    }
  }

  /**
   * Gera imagem usando a Responses API para conversas interativas
   */
  async generateImageWithResponses(prompt: string, options: any = {}) {
    try {
      console.log(
        `Servidor: Gerando imagem via Responses API com prompt: "${prompt.substring(0, 50)}..."`
      );

      const defaultOptions = {
        model: DEFAULT_MODELS.CHAT_FAST,
        quality: "auto",
        size: "auto",
        background: "auto",
        stream: false,
      };

      const mergedOptions = { ...defaultOptions, ...options };

      const response = await openaiWithCost(this.client, {
        model: mergedOptions.model,
        input: prompt,
        meta: {
          traceId: `image-generation-${Date.now()}`,
          intent: "image_generation",
        },
      });

      if (mergedOptions.stream) {
        // Retornar stream diretamente
        return response;
      }

      // Extrair dados de imagem da resposta
      const imageData = response.output
        ?.filter((output: any) => output.type === "image_generation_call")
        ?.map((output: any) => ({
          id: output.id,
          result: output.result,
          revised_prompt: output.revised_prompt,
        }));

      console.log(
        `Servidor: Imagens geradas via Responses API: ${imageData?.length || 0}`
      );

      return {
        images: imageData || [],
        text_response: response.output_text || "",
        response_id: response.id,
      };
    } catch (error) {
      console.error("Erro ao gerar imagem via Responses API:", error);
      throw error;
    }
  }

  async transcribeAudio(audioFile: File) {
    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("model", "whisper-1");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.client.apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Erro na transcrição: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Erro ao transcrever áudio:", error);
      throw error;
    }
  }

  async getEmbeddings(input: string | string[]) {
    try {
      const response = await openaiEmbeddingWithCost(
        this.client,
        DEFAULT_MODELS.EMBEDDING,
        input,
        {
          traceId: `embedding-${Date.now()}`,
          intent: "embedding",
        }
      );

      return response;
    } catch (error) {
      console.error("Erro ao obter embeddings:", error);
      throw error;
    }
  }

  async moderateContent(input: string | string[]) {
    try {
      const response = await this.client.moderations.create({
        input,
      });

      return response;
    } catch (error) {
      console.error("Erro ao moderar conteúdo:", error);
      throw error;
    }
  }

  async listModels() {
    try {
      const response = await this.client.models.list();
      return response;
    } catch (error) {
      console.error("Erro ao listar modelos:", error);
      throw error;
    }
  }

  /**
   * Upload de arquivos, agora usando toFile para evitar erro 413.
   */
  async uploadFile(file: File, options: FileUploadOptions) {
    try {
      // Converte File para Buffer e usa helper toFile
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const oaiFile = await toFile(buffer, file.name, { type: file.type });

      // PDF não é suportado em "vision" → redireciona para assistants
      const isPdf = file.type === "application/pdf";
      const purpose =
        isPdf && options.purpose === "vision" ? "assistants" : options.purpose;

      // Se for PDF no propósito vision, faz raw fetch para permitir application/pdf
      if (isPdf && options.purpose === "vision") {
        const formData = new FormData();
        formData.append("file", oaiFile as unknown as any, file.name);
        formData.append("purpose", "assistants"); // Força assistants para PDFs

        const resp = await fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: formData,
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Erro upload PDF vision: ${resp.status} - ${text}`);
        }
        return await resp.json();
      }

      // Para demais formatos/usos, usa SDK normalmente
      const response = await this.client.files.create({
        file: oaiFile,
        purpose: purpose as any,
      });

      console.log("Servidor: uploadFile concluído com sucesso:", response);
      return response;
    } catch (err: any) {
      console.error("Servidor: erro no uploadFile()", err);
      throw err;
    }
  }

  async uploadFileFromPath(
    filePath: string,
    opts: { filename: string; mimeType: string; purpose: FilePurpose }
  ) {
    try {
      // Check if running in a server environment
      if (typeof window !== "undefined") {
        throw new Error(
          "uploadFileFromPath só pode ser usado no lado do servidor"
        );
      }

      // Implementação para ambiente Node.js usando eval para evitar bundling
      console.log(`Servidor: Enviando arquivo do caminho: ${filePath}`);

      // Usar eval para evitar que o webpack tente resolver 'fs' no cliente
      const fs = eval("require")("fs");

      // Verificar se o arquivo existe
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      // Ler o arquivo
      const fileBuffer = fs.readFileSync(filePath);

      // Criar um File object para usar com toFile
      const oaiFile = await toFile(fileBuffer, opts.filename, {
        type: opts.mimeType,
      });

      // PDF não é suportado em "vision" → redireciona para assistants
      const isPdf = opts.mimeType === "application/pdf";
      const purpose =
        isPdf && opts.purpose === "vision" ? "assistants" : opts.purpose;

      // Se for PDF no propósito vision, faz raw fetch para permitir application/pdf
      if (isPdf && opts.purpose === "vision") {
        const formData = new FormData();
        formData.append("file", oaiFile as unknown as any, opts.filename);
        formData.append("purpose", "assistants"); // Força assistants para PDFs

        const response = await fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Erro upload PDF via path: ${response.status} - ${text}`
          );
        }

        const result = await response.json();
        console.log("Servidor: uploadFileFromPath (PDF) concluído:", result.id);
        return result;
      }

      // Para demais formatos/usos, usa SDK normalmente
      const response = await this.client.files.create({
        file: oaiFile,
        purpose: purpose as any,
      });

      console.log(
        "Servidor: uploadFileFromPath concluído com sucesso:",
        response.id
      );
      return response;
    } catch (error) {
      console.error("Erro ao enviar arquivo do caminho:", filePath, error);
      throw error;
    }
  }

  async listFiles(purpose?: FilePurpose) {
    try {
      let url = "https://api.openai.com/v1/files";
      if (purpose) {
        url += `?purpose=${purpose}`;
      }

      console.log(`Servidor: Listando arquivos com URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao listar arquivos: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Servidor: Erro detalhado ao listar arquivos:", error);
      throw error;
    }
  }

  async retrieveFile(fileId: string) {
    try {
      console.log(`Servidor: Obtendo detalhes do arquivo: ${fileId}`);

      const response = await fetch(
        `https://api.openai.com/v1/files/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${this.client.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao obter arquivo: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Servidor: Erro detalhado ao obter arquivo:", error);
      throw error;
    }
  }

  async retrieveFileContent(fileId: string) {
    try {
      console.log(`Servidor: Obtendo conteúdo do arquivo: ${fileId}`);

      const response = await fetch(
        `https://api.openai.com/v1/files/${fileId}/content`,
        {
          headers: {
            Authorization: `Bearer ${this.client.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao obter conteúdo do arquivo: ${response.status} - ${errorData}`
        );
      }

      // Para contenttdo binário
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error(
        "Servidor: Erro detalhado ao obter conteúdo do arquivo:",
        error
      );
      throw error;
    }
  }

  async deleteFile(fileId: string) {
    try {
      console.log(`Servidor: Excluindo arquivo: ${fileId}`);

      const response = await fetch(
        `https://api.openai.com/v1/files/${fileId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.client.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao excluir arquivo: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Servidor: Erro detalhado ao excluir arquivo:", error);
      throw error;
    }
  }

  async createImageEdit(
    image: File,
    prompt: string,
    mask?: File,
    options?: {
      model?: string;
      n?: number;
      size?: string;
      responseFormat?: "url" | "b64_json";
      user?: string;
    }
  ) {
    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("prompt", prompt);

      if (mask) {
        formData.append("mask", mask);
      }

      if (options?.model) {
        formData.append("model", options.model);
      }

      if (options?.n) {
        formData.append("n", options.n.toString());
      }

      if (options?.size) {
        formData.append("size", options.size);
      }

      if (options?.responseFormat) {
        formData.append("response_format", options.responseFormat);
      }

      if (options?.user) {
        formData.append("user", options.user);
      }

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error creating image edit: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating image edit:", error);
      throw error;
    }
  }

  async createImageVariation(
    image: File,
    options?: {
      model?: string;
      n?: number;
      size?: string;
      responseFormat?: "url" | "b64_json";
      user?: string;
    }
  ) {
    try {
      const formData = new FormData();
      formData.append("image", image);

      if (options?.model) {
        formData.append("model", options.model);
      }

      if (options?.n) {
        formData.append("n", options.n.toString());
      }

      if (options?.size) {
        formData.append("size", options.size);
      }

      if (options?.responseFormat) {
        formData.append("response_format", options.responseFormat);
      }

      if (options?.user) {
        formData.append("user", options.user);
      }

      const response = await fetch(
        "https://api.openai.com/v1/images/variations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.client.apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Error creating image variation: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating image variation:", error);
      throw error;
    }
  }

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

  /**
   * Extrai texto de um PDF usando o Assistants API
   * @param fileId ID do arquivo PDF já enviado para a OpenAI
   * @param prompt Instrução para extração de texto
   * @returns Texto extraído do PDF
   */
  async extractPdfWithAssistant(
    fileId: string,
    prompt: string
  ): Promise<string> {
    // 1. Garante que temos um Assistant preparado (gpt‑4o + file_search)
    if (!this.pdfAssistantId) {
      const assistant = await this.client.beta.assistants.create({
        model: "gpt-4o",
        name: "PDF extractor",
        description: "Lê PDFs e responde perguntas sobre o conteúdo",
        tools: [{ type: "file_search" }],
      });
      this.pdfAssistantId = assistant.id;
      console.log(`Criado assistente para PDFs com ID: ${assistant.id}`);
      // opcional: persistir na env ou DB
    }

    // 2. Cria thread
    const thread = await this.client.beta.threads.create();

    // 3. Mensagem do usuário com o arquivo anexado
    await this.client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt,
      attachments: [
        {
          file_id: fileId,
        },
      ],
    });

    // 4. Executa e aguarda conclusão
    const run = await this.client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: this.pdfAssistantId,
    });

    if (run.status !== "completed") {
      throw new Error(`Assistant run failed: ${run.status}`);
    }

    // 5. Recupera a última mensagem
    const messages = await this.client.beta.threads.messages.list(thread.id, {
      limit: 1,
    });
    const latest = messages.data[0];

    // Verifica se temos conteúdo de texto na resposta
    const textContent = latest.content.find((c) => c.type === "text");
    const textBlock =
      textContent?.type === "text" ? textContent.text.value : "";

    return textBlock;
  }

  /**
   * Faz uma pergunta sobre um PDF usando o modelo de visão
   * @param fileId ID do arquivo na OpenAI
   * @param question Pergunta sobre o conteúdo do PDF
   * @returns Resposta do modelo
   */
  async askAboutPdf(
    fileId: string,
    question: string,
    options: ChatOptions = {}
  ): Promise<string> {
    try {
      console.log(`Perguntando ao PDF ${fileId}: "${question}"`);

      const defaultOptions: ChatOptions = {
        model: DEFAULT_MODELS.CHAT,
        temperature: 0.7,
        max_tokens: 420000,
      };

      const mergedOptions = { ...defaultOptions, ...options };

      // Usar a API responses.create com cost tracking with deadline management
      const response = await withDeadlineAbort(async (signal) => {
        return responsesCall(
          this.client,
          {
            model: mergedOptions.model!,
            input: [{
              role: "user",
              content: [
                { type: "input_file", file_id: fileId },
                { type: "input_text", text: question },
              ],
            }],
            store: true,
            temperature: mergedOptions.temperature,
            max_output_tokens: 1024,
          },
          { traceId: `pdf-question-${Date.now()}`, intent: "pdf_analysis" },
          { signal, timeout: 10_000 }
        );
      }, 10_000);

      if (!response) {
        throw new Error("PDF analysis aborted due to timeout");
      }

      return response.output_text || "";
    } catch (error) {
      console.error("Erro ao perguntar sobre PDF:", error);
      throw error;
    }
  }

  /**
   * Generates short titles for multiple intent candidates in a single batch call
   * Optimized for SOFT band processing in SocialWise Flow
   */
  async generateShortTitlesBatch(
    intents: IntentCandidate[],
    agent: AgentConfig
  ): Promise<string[] | null> {
    if (!intents.length) return [];

    const prompt = `# INSTRUÇÃO
Você é um especialista em UX Writing para chatbots jurídicos.
Gere títulos curtos e acionáveis para os seguintes serviços jurídicos.

# REGRAS
- Máximo 4 palavras por título
- Máximo 20 caracteres por título
- Foque na ação do usuário (ex: "Recorrer Multa", "Ação Judicial")
- Use linguagem direta e profissional
- Retorne apenas um array JSON de strings

# SERVIÇOS
${intents.map((intent, i) => `${i + 1}. ${intent.slug}: ${intent.desc || intent.name || intent.slug}`).join("\n")}

# FORMATO DE RESPOSTA
Retorne apenas um array JSON com os títulos na mesma ordem:
["Título 1", "Título 2", "Título 3"]`;

    return withDeadlineAbort(
      async (signal) => {
        try {
                  const response = await responsesCall(
          this.client,
          {
            model: agent.model,
            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
            store: false,
            temperature: agent.tempSchema ?? 0.2,
            max_output_tokens: 512,
          },
          { traceId: `short-titles-batch-${Date.now()}`, intent: "short_titles_generation" },
          { signal, timeout: agent.warmupDeadlineMs || 250 }
        );

          const content = response.output_text?.trim();
          if (!content) return null;

          // Parse JSON response
          const titles = JSON.parse(content);
          if (!Array.isArray(titles)) return null;

          // Clamp each title to 20 characters and 4 words
          return titles.map((title: string) => {
            const clean = String(title || "")
              .replace(/\s+/g, " ")
              .trim();
            const words = clean.split(" ");
            const clamped = words.slice(0, 4).join(" ");
            return clamped.length <= 20 ? clamped : clamped.slice(0, 20).trim();
          });
        } catch (error) {
          console.error("Erro ao gerar títulos curtos em lote:", error);
          return null;
        }
      },
      agent.warmupDeadlineMs || 250
    );
  }

  /**
   * Generates warmup buttons with contextual introduction for uncertain intents
   * Used in SOFT band processing (0.65-0.79 similarity score)
   */
  async generateWarmupButtons(
    userText: string,
    candidates: IntentCandidate[],
    agent: AgentConfig
  ): Promise<WarmupButtonsResponse | null> {
    if (!candidates.length) return null;

    const candidatesText = candidates
      .map((c, i) => `${i + 1}. @${c.slug}: ${c.desc || c.name || c.slug}`)
      .join("\n");

    const prompt = `# INSTRUÇÃO
Você é um especialista em UX Writing e Microcopy para chatbots jurídicos.
Sua tarefa é gerar um conjunto de opções de botões para um usuário que fez uma pergunta ambígua.

# CONTEXTO
O sistema de IA identificou as seguintes intenções como as mais prováveis, mas não tem certeza suficiente para agir.

# INTENÇÕES CANDIDATAS
${candidatesText}

# MENSAGEM ORIGINAL DO USUÁRIO
"${userText}"

# SUA TAREFA
Gere uma resposta no formato JSON com:
1. "introduction_text": frase curta e amigável (≤ 180 chars) que reconhece a situação do usuário
2. "buttons": até 3 objetos com "title" (≤ 20 chars, ação do usuário) e "payload" (@intent_name)

# REGRAS
- Títulos dos botões devem ser ações claras (ex: "Recorrer Multa", "Ação Judicial")
- Payloads devem usar o formato @slug das intenções
- Texto de introdução deve ser empático e direcionador
- Use linguagem jurídica acessível

# FORMATO DE RESPOSTA
{
  "introduction_text": "Posso ajudar com sua questão. Qual dessas opções se aproxima mais do que você precisa?",
  "buttons": [
    {"title": "Recorrer Multa", "payload": "@recurso_multa_transito"},
    {"title": "Ação Judicial", "payload": "@mandado_seguranca"},
    {"title": "Consulta Geral", "payload": "@consulta_juridica"}
  ]
}`;

    return withDeadlineAbort(async (signal) => {
      try {
        const response = await responsesCall(
          this.client,
          {
            model: agent.model,
            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
            store: false,
            temperature: agent.tempCopy ?? 0.5,
            max_output_tokens: 768,
          },
          { traceId: `warmup-buttons-${Date.now()}`, intent: "warmup_buttons_generation" },
          { signal, timeout: agent.softDeadlineMs || 300 }
        );

        const content = response.output_text?.trim();
        if (!content) return null;

        const result = JSON.parse(content) as WarmupButtonsResponse;

        // Validate and clamp the response
        if (!result.introduction_text || !Array.isArray(result.buttons)) {
          return null;
        }

        // Clamp introduction text to 180 characters
        result.introduction_text =
          result.introduction_text.length <= 180
            ? result.introduction_text
            : result.introduction_text.slice(0, 180).trim();

        // Clamp button titles and validate payloads
        result.buttons = result.buttons
          .slice(0, 3) // Max 3 buttons
          .map((button) => ({
            title:
              button.title.length <= 20
                ? button.title
                : button.title.slice(0, 20).trim(),
            payload: button.payload.match(/^@[a-z0-9_]+$/)
              ? button.payload
              : `@${button.payload.replace(/[^a-z0-9_]/g, "_").toLowerCase()}`,
          }));

        return result;
      } catch (error) {
        console.error("Erro ao gerar botões de aquecimento:", error);
        return null;
      }
    }, agent.softDeadlineMs || 300); // Slightly longer deadline for complex generation
  }

  /**
   * Router LLM for embedipreview=false mode
   * Decides between intent classification and open chat
   */
  async routerLLM(
    userText: string,
    agent: AgentConfig
  ): Promise<RouterDecision | null> {
    const prompt = `# INSTRUÇÃO
Você é um roteador inteligente para um chatbot jurídico.
Analise a mensagem do usuário e decida se deve:
1. Classificar como intenção específica (mode: "intent")
2. Engajar em conversa aberta (mode: "chat")

# MENSAGEM DO USUÁRIO
"${userText}"

# CRITÉRIOS DE DECISÃO
- Use "intent" se a mensagem indica uma necessidade jurídica específica
- Use "chat" se a mensagem é vaga, conversacional, ou precisa de esclarecimento
- Para "intent": forneça payload específico e botões opcionais
- Para "chat": forneça texto de resposta engajante

# FORMATO DE RESPOSTA
Para intenção específica:
{
  "mode": "intent",
  "intent_payload": "@nome_da_intencao",
  "introduction_text": "Texto opcional de confirmação",
  "buttons": [{"title": "Confirmar", "payload": "@intencao"}]
}

Para conversa aberta:
{
  "mode": "chat",
  "text": "Resposta conversacional que esclarece ou engaja o usuário"
}`;

    return withDeadlineAbort(async (signal) => {
      try {
        const response = await responsesCall(
          this.client,
          {
            model: agent.model,
            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
            store: false,
            temperature: agent.tempCopy ?? 0.3,
            max_output_tokens: 768,
          },
          { traceId: `router-llm-${Date.now()}`, intent: "routing_decision" },
          { signal, timeout: agent.hardDeadlineMs || 400 }
        );

        const content = response.output_text?.trim();
        if (!content) return null;

        const result = JSON.parse(content) as RouterDecision;

        // Validate the response structure
        if (!result.mode || !["intent", "chat"].includes(result.mode)) {
          return null;
        }

        // Validate intent mode requirements
        if (result.mode === "intent" && !result.intent_payload) {
          return null;
        }

        // Validate chat mode requirements
        if (result.mode === "chat" && !result.text) {
          return null;
        }

        // Clamp text fields if present
        if (result.introduction_text) {
          result.introduction_text =
            result.introduction_text.length <= 180
              ? result.introduction_text
              : result.introduction_text.slice(0, 180).trim();
        }

        if (result.text) {
          result.text =
            result.text.length <= 1024
              ? result.text
              : result.text.slice(0, 1024).trim();
        }

        // Validate and clamp buttons if present
        if (result.buttons) {
          result.buttons = result.buttons.slice(0, 3).map((button) => ({
            title:
              button.title.length <= 20
                ? button.title
                : button.title.slice(0, 20).trim(),
            payload: button.payload.match(/^@[a-z0-9_]+$/)
              ? button.payload
              : `@${button.payload.replace(/[^a-z0-9_]/g, "_").toLowerCase()}`,
          }));
        }

        return result;
      } catch (error) {
        console.error("Erro no Router LLM:", error);
        return null;
      }
    }, agent.hardDeadlineMs || 400);
  }

  /**
   * Enhanced deadline management with real AbortController
   */
  async withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms = 250
  ): Promise<T | null> {
    return withDeadlineAbort(fn, ms);
  }
}

// Implementação para cliente que usa APIs NextJS
class ClientOpenAIService implements IOpenAIService {
  async createChatCompletion(messages: any[], options: ChatOptions = {}) {
    try {
      const response = await fetch("/api/chatwitia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          model: options.model,
          temperature: options.temperature,
          max_tokens: options.max_tokens,
          top_p: options.top_p,
          frequency_penalty: options.frequency_penalty,
          presence_penalty: options.presence_penalty,
          stream: options.stream,
        }),
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao criar chat completion:", error);
      throw error;
    }
  }

  async generateImage(prompt: string, options: ImageGenerationOptions = {}) {
    try {
      console.log(
        `Cliente: Preparando geração de imagem: "${prompt.substring(0, 50)}..."`
      );

      const requestBody: any = {
        prompt,
        model: options.model || "gpt-image-1",
        size: options.size || "1024x1024",
        quality: options.quality || "auto",
        background: options.background || "auto",
        n: options.n || 1,
      };

      // Adicionar response_format apenas se especificado para modelos que suportam
      if (
        options.response_format &&
        (options.model === "dall-e-3" || options.model === "dall-e-2")
      ) {
        requestBody.response_format = options.response_format;
      }

      const response = await fetch("/api/chatwitia/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`Cliente: Resposta recebida com status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Cliente: Erro detalhado:", errorData);
        throw new Error(
          `Erro ao gerar imagem: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Cliente: Erro ao gerar imagem:", error);
      throw error;
    }
  }

  async generateImageWithResponses(prompt: string, options: any = {}) {
    try {
      console.log(
        `Cliente: Gerando imagem via Responses API: "${prompt.substring(0, 50)}..."`
      );

      const response = await fetch("/api/chatwitia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          model: options.model || DEFAULT_MODELS.CHAT_FAST,
          generateImage: true,
          imageOptions: {
            quality: options.quality || "high",
            size: options.size || "auto",
            background: options.background || "auto",
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao gerar imagem via Responses API: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao gerar imagem via Responses API:", error);
      throw error;
    }
  }

  async transcribeAudio(audioFile: File) {
    try {
      const formData = new FormData();
      formData.append("file", audioFile);

      const response = await fetch("/api/chatwitia/audio/transcriptions", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao transcrever áudio:", error);
      throw error;
    }
  }

  async getEmbeddings(input: string | string[]) {
    try {
      const response = await fetch("/api/chatwitia/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao obter embeddings:", error);
      throw error;
    }
  }

  async moderateContent(input: string | string[]) {
    try {
      const response = await fetch("/api/chatwitia/moderations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao moderar conteúdo:", error);
      throw error;
    }
  }

  async listModels() {
    try {
      const response = await fetch("/api/chatwitia/models");

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao listar modelos:", error);
      throw error;
    }
  }

  async uploadFile(file: File, options: FileUploadOptions) {
    try {
      console.log(`Cliente: Preparando upload do arquivo: ${file.name}`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", options.purpose);

      console.log("Cliente: Enviando requisição para API interna");

      const response = await fetch("/api/chatwitia/files", {
        method: "POST",
        body: formData,
      });

      console.log(`Cliente: Resposta recebida com status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Cliente: Erro detalhado:", errorData);
        throw new Error(
          `Erro ao fazer upload de arquivo: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Cliente: Erro ao fazer upload de arquivo:", error);
      throw error;
    }
  }

  async uploadFileFromPath(
    filePath: string,
    opts: { filename: string; mimeType: string; purpose: FilePurpose }
  ) {
    try {
      // Client-side implementation should never be called directly
      // Just to fulfill the interface
      throw new Error("uploadFileFromPath não disponível no cliente");
    } catch (error) {
      console.error("Erro: uploadFileFromPath chamado no cliente", error);
      throw error;
    }
  }

  async listFiles(purpose?: FilePurpose) {
    try {
      const url = purpose
        ? `/api/chatwitia/files?purpose=${purpose}`
        : "/api/chatwitia/files";

      console.log(`Cliente: Listando arquivos com URL: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao listar arquivos: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao listar arquivos:", error);
      throw error;
    }
  }

  async retrieveFile(fileId: string) {
    try {
      console.log(`Cliente: Obtendo detalhes do arquivo: ${fileId}`);

      const response = await fetch(`/api/chatwitia/files/${fileId}`);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao obter arquivo: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao obter arquivo:", error);
      throw error;
    }
  }

  async retrieveFileContent(fileId: string) {
    try {
      console.log(`Cliente: Obtendo conteúdo do arquivo: ${fileId}`);

      const response = await fetch(`/api/chatwitia/files/${fileId}/content`);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao obter conteúdo do arquivo: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao obter conteúdo do arquivo:", error);
      throw error;
    }
  }

  async deleteFile(fileId: string) {
    try {
      console.log(`Cliente: Excluindo arquivo: ${fileId}`);

      const response = await fetch(`/api/chatwitia/files/${fileId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao excluir arquivo: ${response.status} - ${errorData}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao excluir arquivo:", error);
      throw error;
    }
  }

  async createImageEdit(
    image: File,
    prompt: string,
    mask?: File,
    options?: {
      model?: string;
      n?: number;
      size?: string;
      responseFormat?: "url" | "b64_json";
      user?: string;
    }
  ) {
    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("prompt", prompt);

      if (mask) {
        formData.append("mask", mask);
      }

      if (options?.model) {
        formData.append("model", options.model);
      }

      if (options?.n) {
        formData.append("n", options.n.toString());
      }

      if (options?.size) {
        formData.append("size", options.size);
      }

      if (options?.responseFormat) {
        formData.append("response_format", options.responseFormat);
      }

      if (options?.user) {
        formData.append("user", options.user);
      }

      const response = await fetch("/api/chatwitia/images/edit", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao editar imagem:", error);
      throw error;
    }
  }

  async createImageVariation(
    image: File,
    options?: {
      model?: string;
      n?: number;
      size?: string;
      responseFormat?: "url" | "b64_json";
      user?: string;
    }
  ) {
    try {
      const formData = new FormData();
      formData.append("image", image);

      if (options?.model) {
        formData.append("model", options.model);
      }

      if (options?.n) {
        formData.append("n", options.n.toString());
      }

      if (options?.size) {
        formData.append("size", options.size);
      }

      if (options?.responseFormat) {
        formData.append("response_format", options.responseFormat);
      }

      if (options?.user) {
        formData.append("user", options.user);
      }

      const response = await fetch("/api/chatwitia/images/variations", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Cliente: Erro ao criar variação de imagem:", error);
      throw error;
    }
  }

  async checkApiConnection() {
    try {
      console.log("Cliente: Verificando conexão via API interna");
      const response = await fetch("/api/chatwitia/health");

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          message: `Falha na conexão: ${response.status}`,
        };
      }

      const data = await response.json();
      return data.services.openai;
    } catch (error: any) {
      return {
        success: false,
        status: "error",
        message: `Erro na conexão: ${error.message}`,
      };
    }
  }

  async extractPdfWithAssistant(
    fileId: string,
    prompt: string
  ): Promise<string> {
    // Implementation for extracting text from a PDF using the Assistants API
    try {
      console.log(
        `Cliente: Extraindo texto do PDF ${fileId} com prompt: "${prompt.substring(0, 30)}..."`
      );

      const response = await fetch("/api/chatwitia/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileId, prompt }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao extrair texto do PDF: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      console.error("Cliente: Erro ao extrair texto do PDF:", error);
      throw error;
    }
  }

  async askAboutPdf(
    fileId: string,
    question: string,
    options: ChatOptions = {}
  ): Promise<string> {
    try {
      console.log(
        `Cliente: Perguntando ao PDF ${fileId}: "${question.substring(0, 30)}..."`
      );

      const response = await fetch("/api/chatwitia/pdf/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileId, question, options }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao perguntar sobre PDF: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      console.error("Cliente: Erro ao perguntar sobre PDF:", error);
      throw error;
    }
  }

  async generateShortTitlesBatch(
    intents: IntentCandidate[],
    agent: AgentConfig
  ): Promise<string[] | null> {
    try {
      const response = await fetch("/api/chatwitia/socialwise/short-titles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intents, agent }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao gerar títulos curtos: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data.titles;
    } catch (error) {
      console.error("Cliente: Erro ao gerar títulos curtos:", error);
      return null;
    }
  }

  async generateWarmupButtons(
    userText: string,
    candidates: IntentCandidate[],
    agent: AgentConfig
  ): Promise<WarmupButtonsResponse | null> {
    try {
      const response = await fetch("/api/chatwitia/socialwise/warmup-buttons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userText, candidates, agent }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro ao gerar botões de aquecimento: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Cliente: Erro ao gerar botões de aquecimento:", error);
      return null;
    }
  }

  async routerLLM(
    userText: string,
    agent: AgentConfig
  ): Promise<RouterDecision | null> {
    try {
      const response = await fetch("/api/chatwitia/socialwise/router", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userText, agent }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Erro no Router LLM: ${response.status} - ${errorData}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Cliente: Erro no Router LLM:", error);
      return null;
    }
  }

  /**
   * Enhanced deadline management with real AbortController (client-side stub)
   */
  async withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms = 250
  ): Promise<T | null> {
    // Client-side implementation - delegate to server
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ms);

      const result = await fn(controller.signal);
      clearTimeout(timeout);
      return result;
    } catch (error: any) {
      if (error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }
}

// Factory function to create the appropriate service based on environment
const createOpenAIService = (apiKey?: string): IOpenAIService => {
  // Verificação mais robusta se estamos no servidor ou cliente
  const isServer =
    typeof window === "undefined" &&
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node;

  if (isServer) {
    console.log("Criando ServerOpenAIService para ambiente Node.js");
    return new ServerOpenAIService(apiKey);
  } else {
    console.log("Criando ClientOpenAIService para ambiente do navegador");
    return new ClientOpenAIService();
  }
};

// Create and export the service instance
export const openaiService = createOpenAIService();

export default openaiService;
