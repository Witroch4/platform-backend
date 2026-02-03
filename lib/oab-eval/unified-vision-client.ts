/**
 * Cliente unificado de Vision AI - suporta OpenAI e Gemini
 *
 * Detecta automaticamente o provedor baseado no modelo selecionado:
 * - Modelos começando com "gemini" → Google Gemini API
 * - Outros modelos (gpt-4.1, etc) → OpenAI API
 */

import { openai } from "./openai-client";
import { getGeminiClient, isGeminiModel, isGeminiAvailable } from "./gemini-client";

export interface VisionRequest {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  imageBase64: string;
  imageMimeType?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface VisionResponse {
  text: string;
  provider: "openai" | "gemini";
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Processa uma imagem com Vision AI (OpenAI ou Gemini)
 */
export async function processVisionRequest(request: VisionRequest): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, imageBase64, imageMimeType, maxOutputTokens, temperature } = request;

  // Detectar provedor baseado no modelo
  if (isGeminiModel(model)) {
    return processWithGemini(request);
  }

  return processWithOpenAI(request);
}

/**
 * Processa com OpenAI Vision API
 */
async function processWithOpenAI(request: VisionRequest): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, imageBase64, imageMimeType, maxOutputTokens } = request;

  const imageUrl = `data:${imageMimeType ?? "image/png"};base64,${imageBase64}`;

  const response = await openai.responses.create({
    model,
    instructions: systemInstructions,
    // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
    ...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      },
    ],
  });

  // Extrair uso de tokens se disponível
  const usage = (response as any)?.usage;

  return {
    text: extractOpenAIOutputText(response),
    provider: "openai",
    model,
    usage: usage
      ? {
          inputTokens: usage.input_tokens ?? usage.prompt_tokens,
          outputTokens: usage.output_tokens ?? usage.completion_tokens,
          totalTokens: usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Processa com Google Gemini Vision API
 */
async function processWithGemini(request: VisionRequest): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, imageBase64, imageMimeType, maxOutputTokens, temperature } = request;

  const gemini = getGeminiClient();
  if (!gemini) {
    throw new Error(
      "Gemini API não configurada. Defina GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente."
    );
  }

  const response = await gemini.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          mimeType: imageMimeType ?? "image/png",
          data: imageBase64,
        },
      },
      userPrompt,
    ],
    config: {
      systemInstruction: systemInstructions,
      // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
      ...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
      ...(temperature !== undefined && { temperature }),
    },
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata;

  return {
    text,
    provider: "gemini",
    model,
    usage: usage
      ? {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  };
}

/**
 * Processa múltiplas imagens com Vision AI (OpenAI ou Gemini)
 */
export async function processMultiImageVisionRequest(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  images: Array<{ base64: string; mimeType?: string }>;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, images, maxOutputTokens, temperature } = request;

  if (isGeminiModel(model)) {
    return processMultiImageWithGemini(request);
  }

  return processMultiImageWithOpenAI(request);
}

/**
 * Processa múltiplas imagens com OpenAI
 */
async function processMultiImageWithOpenAI(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  images: Array<{ base64: string; mimeType?: string }>;
  maxOutputTokens?: number;
}): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, images, maxOutputTokens } = request;

  const imageContents = images.map((img) => ({
    type: "input_image" as const,
    image_url: `data:${img.mimeType ?? "image/png"};base64,${img.base64}`,
    detail: "high" as const,
  }));

  const response = await openai.responses.create({
    model,
    instructions: systemInstructions,
    // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
    ...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }, ...imageContents],
      },
    ],
  });

  return {
    text: extractOpenAIOutputText(response),
    provider: "openai",
    model,
  };
}

/**
 * Processa múltiplas imagens com Gemini
 */
async function processMultiImageWithGemini(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  images: Array<{ base64: string; mimeType?: string }>;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, images, maxOutputTokens, temperature } = request;

  const gemini = getGeminiClient();
  if (!gemini) {
    throw new Error(
      "Gemini API não configurada. Defina GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente."
    );
  }

  const imageContents = images.map((img) => ({
    inlineData: {
      mimeType: img.mimeType ?? "image/png",
      data: img.base64,
    },
  }));

  const response = await gemini.models.generateContent({
    model,
    contents: [...imageContents, userPrompt],
    config: {
      systemInstruction: systemInstructions,
      // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
      ...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
      ...(temperature !== undefined && { temperature }),
    },
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata;

  return {
    text,
    provider: "gemini",
    model,
    usage: usage
      ? {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  };
}

/**
 * Processa múltiplas imagens via URL (Gemini suporta URL direta)
 */
export async function processMultiImageUrlVisionRequest(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  imageUrls: string[];
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<VisionResponse> {
  const { model } = request;

  // Gemini suporta URLs diretas, OpenAI precisa de base64
  if (isGeminiModel(model)) {
    return processMultiImageUrlWithGemini(request);
  }

  // Para OpenAI, mantemos compatibilidade com o código existente
  return processMultiImageUrlWithOpenAI(request);
}

/**
 * Processa múltiplas imagens via URL com OpenAI
 */
async function processMultiImageUrlWithOpenAI(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  imageUrls: string[];
  maxOutputTokens?: number;
}): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, imageUrls, maxOutputTokens } = request;

  const imageContents = imageUrls.map((url) => ({
    type: "input_image" as const,
    image_url: url,
    detail: "high" as const,
  }));

  const response = await openai.responses.create({
    model,
    instructions: systemInstructions,
    // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
    ...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }, ...imageContents],
      },
    ],
  });

  return {
    text: extractOpenAIOutputText(response),
    provider: "openai",
    model,
  };
}

/**
 * Processa múltiplas imagens via URL com Gemini
 */
async function processMultiImageUrlWithGemini(request: {
  model: string;
  systemInstructions: string;
  userPrompt: string;
  imageUrls: string[];
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<VisionResponse> {
  const { model, systemInstructions, userPrompt, imageUrls, maxOutputTokens, temperature } = request;

  const gemini = getGeminiClient();
  if (!gemini) {
    throw new Error(
      "Gemini API não configurada. Defina GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente."
    );
  }

  // Gemini aceita URLs HTTP/HTTPS diretamente
  const imageContents = imageUrls.map((url) => ({
    fileData: {
      mimeType: "image/png",
      fileUri: url,
    },
  }));

  const response = await gemini.models.generateContent({
    model,
    contents: [...imageContents, userPrompt],
    config: {
      systemInstruction: systemInstructions,
      // 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
      ...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
      ...(temperature !== undefined && { temperature }),
    },
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata;

  return {
    text,
    provider: "gemini",
    model,
    usage: usage
      ? {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  };
}

/**
 * Extrai texto de resposta OpenAI
 */
function extractOpenAIOutputText(response: unknown): string {
  const outputText = (response as any)?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const outputItems = (response as any)?.output;
  if (Array.isArray(outputItems)) {
    const texts: string[] = [];
    for (const item of outputItems) {
      const content = (item as any)?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = (part as any)?.text;
          if (typeof text === "string" && text.trim()) {
            texts.push(text.trim());
          }
        }
      } else {
        const text = (item as any)?.text;
        if (typeof text === "string" && text.trim()) {
          texts.push(text.trim());
        }
      }
    }
    return texts.join("\n").trim();
  }

  return "";
}

/**
 * Lista todos os modelos de visão disponíveis
 * Ordenados do mais avançado para o mais básico
 */
export function getAvailableVisionModels(): Array<{ id: string; name: string; provider: string; tier: string }> {
  const models: Array<{ id: string; name: string; provider: string; tier: string }> = [
    // OpenAI Models
    { id: "gpt-4.1", name: "GPT-4.1 (Vision)", provider: "openai", tier: "pro" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini (Vision)", provider: "openai", tier: "standard" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano (Vision)", provider: "openai", tier: "lite" },
    { id: "gpt-4o", name: "GPT-4o (Vision)", provider: "openai", tier: "pro" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Vision)", provider: "openai", tier: "standard" },
  ];

  // Adicionar modelos Gemini se disponível
  if (isGeminiAvailable()) {
    models.push(
      // Gemini 3 - Mais avançados (RECOMENDADOS)
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview (Mais Avançado)", provider: "gemini", tier: "flagship" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", provider: "gemini", tier: "pro" },
      // Gemini 2.5 - Alta performance
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Thinking)", provider: "gemini", tier: "pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Thinking)", provider: "gemini", tier: "standard" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "gemini", tier: "lite" },
      // Gemini 2.0 - Estáveis
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", tier: "standard" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "gemini", tier: "lite" },
    );
  }

  return models;
}

export { isGeminiModel, isGeminiAvailable };
