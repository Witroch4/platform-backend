import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
	throw new Error("OPENAI_API_KEY is required for the OAB evaluation pipeline");
}

export const openai = new OpenAI({ apiKey });

export async function createEmbeddingLarge(input: string) {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-large",
		input,
	});

	return response.data[0]?.embedding ?? [];
}

export async function createEmbeddingSmall(input: string) {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-small",
		input,
	});

	return response.data[0]?.embedding ?? [];
}
