// services/openai.ts
import OpenAI, { toFile } from "openai";
import { Message } from "@/hooks/useChatwitIA";

// Importações condicionais para evitar problemas com o bundler no navegador
// Isso é necessário porque o código pode ser importado durante o build pelo Webpack/Next.js,
// mesmo que a função específica que usa fs nunca seja executada no navegador
// O typeof window verifica se estamos em ambiente de navegador (não Node.js)
const isServer = typeof window === "undefined";

// Código que pode ser carregado pelo bundler (webpack/vite) mas nunca é executado no navegador
// Tipos para os modelos disponíveis da OpenAI
export type GPTModel =
  | "gpt-4o-latest"
  | "chatgpt-4o-latest"
  | "gpt-3.5-turbo"
  | "gpt-3.5-turbo-16k"
  | "gpt-4o";

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
      model: "gpt-4o-latest",
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

          // 🚨 CORREÇÃO: Detectar file_id com URL (erro comum) e converter para input_image
          const invalidFileIdMatches = message.content.match(
            /\[.*?\]\(file_id:(https?:\/\/[^)]+)\)/g
          );
          if (invalidFileIdMatches && invalidFileIdMatches.length > 0) {
            console.log(
              `⚠️ Detectados ${invalidFileIdMatches.length} file_id inválidos com URLs - convertendo para input_image`
            );
            invalidFileIdMatches.forEach((match: string) => {
              const invalidUrl = match.match(
                /\[.*?\]\(file_id:(https?:\/\/[^)]+)\)/
              )?.[1];
              if (invalidUrl) {
                imageUrls.push(invalidUrl);
                console.log(
                  `🔄 Convertendo file_id inválido para input_image: ${invalidUrl.substring(0, 50)}...`
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
      const firstSystem = cleanedMessages.find((m: any) => m.role === 'system');
      const systemText = (() => {
        if (!firstSystem) return '';
        if (typeof firstSystem.content === 'string') return firstSystem.content.trim();
        if (Array.isArray(firstSystem.content)) {
          const txt = firstSystem.content.find((it: any) => it?.type === 'text' && typeof it?.text === 'string');
          return txt?.text?.trim() || '';
        }
        return '';
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
          image_url: imageUrl, // 🔧 CORREÇÃO: Responses API usa string direta, não objeto
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
                image_url: imageUrl, // 🔧 CORREÇÃO: Responses API usa string direta
              });
              console.log(
                `🖼️ Adicionada imagem do conteúdo complexo como input_image`
              );
            }
          });
        }
      });

      // Configurar opções para a requisição da Responses API
      const requestOptions: any = {
        model: actualModel,
        input: [
          {
            role: "user",
            content: inputContent,
          },
        ],
        ...(systemText ? { instructions: systemText } : {}), // ✅ System prompt vai no campo correto
        stream: false,
        store: true,
        parallel_tool_calls: true,
        truncation: "disabled",
        temperature: mergedOptions.temperature,
        top_p: mergedOptions.top_p,
        max_output_tokens: mergedOptions.max_tokens,
      };

      // Adicionar parâmetro reasoning para modelos da série O
      if (isOSeriesModel) {
        const effort = reasoningEffort || "medium";
        requestOptions.reasoning = { effort };
        console.log(
          `🧠 Adicionando reasoning effort: ${effort} para modelo da série O`
        );
      }

      console.log("📤 Enviando requisição para Responses API:", {
        model: requestOptions.model,
        inputItems: inputContent.length,
        hasFiles: fileIdReferences.length > 0,
      });

      // Usar a Responses API
      const response = await this.client.responses.create(
        requestOptions as any
      );

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
        model: "gpt-4.1-mini",
        quality: "auto",
        size: "auto",
        background: "auto",
        stream: false,
      };

      const mergedOptions = { ...defaultOptions, ...options };

      const response = await this.client.responses.create({
        model: mergedOptions.model,
        input: prompt,
        tools: [
          {
            type: "image_generation",
            quality: mergedOptions.quality,
            size: mergedOptions.size,
            background: mergedOptions.background,
          },
        ],
        stream: mergedOptions.stream,
      } as any);

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
      const response = await this.client.embeddings.create({
        model: "text-embedding-ada-002",
        input,
      });

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
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 420000,
      };

      const mergedOptions = { ...defaultOptions, ...options };

      // Usar a API responses.create ao invés de chat.completions.create
      const response = await this.client.responses.create({
        model: mergedOptions.model!,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileId },
              { type: "input_text", text: question },
            ],
          },
        ],
        temperature: mergedOptions.temperature,
        max_tokens: mergedOptions.max_tokens,
      } as any); // Usar any por enquanto para contornar possíveis restrições de tipo

      return response.output_text || "";
    } catch (error) {
      console.error("Erro ao perguntar sobre PDF:", error);
      throw error;
    }
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
          model: options.model || "gpt-4.1-mini",
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
