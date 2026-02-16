// services/openai-components/server-moderations.ts
import OpenAI from "openai";

export async function moderateContent(this: { client: OpenAI }, input: string | string[]) {
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
