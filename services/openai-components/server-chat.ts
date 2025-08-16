
// services/openai-components/server-chat.ts
import OpenAI from "openai";
import { ChatOptions, DEFAULT_MODELS } from "./types";
import { responsesCall } from "@/lib/cost/openai-wrapper";
import { withDeadlineAbort } from "./utils";

export async function createChatCompletion(
  this: { client: OpenAI },
  messages: any[],
  options: ChatOptions = {}
) {
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
