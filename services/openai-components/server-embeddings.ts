
// services/openai-components/server-embeddings.ts
import OpenAI from "openai";
import { DEFAULT_MODELS } from "./types";

export async function getEmbeddings(this: { client: OpenAI }, input: string | string[]) {
  try {
    const { openaiEmbeddingWithCost } = await import("@/lib/cost/openai-wrapper");
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
