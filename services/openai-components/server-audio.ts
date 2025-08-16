
// services/openai-components/server-audio.ts
import OpenAI from "openai";

export async function transcribeAudio(this: { client: OpenAI }, audioFile: File) {
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
