
// services/openai-components/server-models.ts
import OpenAI from "openai";

export async function listModels(this: { client: OpenAI }) {
  try {
    const response = await this.client.models.list();
    return response;
  } catch (error) {
    console.error("Erro ao listar modelos:", error);
    throw error;
  }
}
