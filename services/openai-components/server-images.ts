
// services/openai-components/server-images.ts
import OpenAI from "openai";
import { ImageGenerationOptions, DEFAULT_MODELS } from "./types";

export async function generateImage(
  this: { client: OpenAI },
  prompt: string,
  options: ImageGenerationOptions = {}
) {
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
export async function generateImageWithResponses(
  this: { client: OpenAI },
  prompt: string,
  options: any = {}
) {
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

    const { openaiWithCost } = await import("@/lib/cost/openai-wrapper");
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

export async function createImageEdit(
  this: { client: OpenAI },
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

export async function createImageVariation(
  this: { client: OpenAI },
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
