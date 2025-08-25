
// services/openai-components/server-pdf.ts
import OpenAI from "openai";
import { ChatOptions, DEFAULT_MODELS } from "./types";
import { withDeadlineAbort } from "./utils";

/**
 * Extrai texto de um PDF usando o Assistants API
 * @param fileId ID do arquivo PDF já enviado para a OpenAI
 * @param prompt Instrução para extração de texto
 * @returns Texto extraído do PDF
 */
export async function extractPdfWithAssistant(
  this: { client: OpenAI; pdfAssistantId: string | null },
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
export async function askAboutPdf(
  this: { client: OpenAI },
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
      const { responsesCall } = await import("@/lib/cost/openai-wrapper");
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
