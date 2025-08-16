
// services/openai-components/client.ts
import {
  IOpenAIService,
  ChatOptions,
  ImageGenerationOptions,
  FileUploadOptions,
  FilePurpose,
  DEFAULT_MODELS,
  WarmupButtonsResponse,
  RouterDecision,
  IntentCandidate,
  AgentConfig,
} from "./types";

// Implementação para cliente que usa APIs NextJS
export class ClientOpenAIService implements IOpenAIService {
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

      const response = await fetch(
        "https://api.openai.com/v1/images/variations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
      const response = await fetch("/api/chatwitia/models");
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

  async extractPdfWithAssistant(fileId: string, prompt: string): Promise<string> {
    // This method is server-side only
    throw new Error("extractPdfWithAssistant não disponível no cliente");
  }

  async askAboutPdf(
    fileId: string,
    question: string,
    options: ChatOptions = {}
  ): Promise<string> {
    // This method is server-side only
    throw new Error("askAboutPdf não disponível no cliente");
  }

  // SocialWise Flow methods are server-side only
  async generateShortTitlesBatch(): Promise<string[] | null> {
    throw new Error("generateShortTitlesBatch não disponível no cliente");
  }
  async generateWarmupButtons(): Promise<WarmupButtonsResponse | null> {
    throw new Error("generateWarmupButtons não disponível no cliente");
  }
  async generateFreeChatButtons(): Promise<WarmupButtonsResponse | null> {
    throw new Error("generateFreeChatButtons não disponível no cliente");
  }
  async routerLLM(): Promise<RouterDecision | null> {
    throw new Error("routerLLM não disponível no cliente");
  }
  async withDeadlineAbort<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms?: number
  ): Promise<T | null> {
    // This is a helper, but the core logic it wraps is server-side
    throw new Error("withDeadlineAbort não é para ser usado diretamente no cliente");
  }
}
