// lib/ai-tools/vector-search.ts
// Funções helper para busca vetorial (para usar quando implementar embeddings)

import OpenAI from "openai";
import { getPrismaInstance } from "@/lib/connections";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Gera embeddings para texto usando OpenAI
 */
export async function generateEmbeddings(text: string): Promise<number[]> {
	try {
		const response = await openai.embeddings.create({
			model: "text-embedding-3-small", // ou "text-embedding-3-large" para mais precisão
			input: text,
			encoding_format: "float",
		});

		return response.data[0].embedding;
	} catch (error) {
		console.error("Erro ao gerar embeddings:", error);
		throw new Error("Falha ao gerar embeddings");
	}
}

/**
 * Busca vetorial em documentos (para usar quando implementar)
 */
export async function vectorSearchDocuments(
	query: string,
	userId: string,
	assistantId?: string,
	limit: number = 5,
	similarityThreshold: number = 0.7,
): Promise<
	Array<{
		id: string;
		title: string;
		contentText: string | null;
		sourceUrl: string | null;
		similarity: number;
	}>
> {
	const prisma = getPrismaInstance();

	try {
		// Gera embedding da query
		const queryEmbedding = await generateEmbeddings(query);

		// Converte para formato PostgreSQL
		const embeddingVector = `[${queryEmbedding.join(",")}]`;

		// Query SQL com busca vetorial
		const results = await prisma.$queryRawUnsafe(
			`
      SELECT 
        id,
        title,
        "contentText",
        "sourceUrl",
        1 - (embedding <=> $1::vector) as similarity
      FROM "AiDocument"
      WHERE 
        "userId" = $2
        AND "isActive" = true
        AND embedding IS NOT NULL
        ${assistantId ? 'AND "assistantId" = $4' : ""}
        AND (1 - (embedding <=> $1::vector)) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `,
			embeddingVector,
			userId,
			similarityThreshold,
			...(assistantId ? [assistantId] : []),
		);

		return results as any[];
	} catch (error) {
		console.error("Erro na busca vetorial:", error);
		throw new Error("Falha na busca vetorial");
	}
}

/**
 * Processa e indexa um documento (gera embeddings)
 */
export async function indexDocument(documentId: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		// Busca o documento
		const document = await prisma.aiDocument.findUnique({
			where: { id: documentId },
			select: {
				id: true,
				title: true,
				contentText: true,
			},
		});

		if (!document || !document.contentText) {
			throw new Error("Documento não encontrado ou sem conteúdo");
		}

		// Prepara texto para embedding (título + conteúdo)
		const textForEmbedding = `${document.title}\n\n${document.contentText}`;

		// Gera embedding
		const embedding = await generateEmbeddings(textForEmbedding);

		// Salva embedding no banco
		await prisma.$executeRawUnsafe(
			`
      UPDATE "AiDocument" 
      SET embedding = $1::vector 
      WHERE id = $2
    `,
			`[${embedding.join(",")}]`,
			documentId,
		);

		console.log(`Documento ${documentId} indexado com sucesso`);
	} catch (error) {
		console.error(`Erro ao indexar documento ${documentId}:`, error);
		throw error;
	}
}

/**
 * Indexa todos os documentos de um usuário
 */
export async function indexAllUserDocuments(userId: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		const documents = await prisma.aiDocument.findMany({
			where: {
				userId,
				isActive: true,
				contentText: { not: null },
				// embedding: null // Apenas documentos sem embedding ainda
			},
			select: { id: true },
		});

		console.log(`Indexando ${documents.length} documentos para usuário ${userId}`);

		for (const doc of documents) {
			try {
				await indexDocument(doc.id);
				// Pequeno delay para não sobrecarregar a API
				await new Promise((resolve) => setTimeout(resolve, 100));
			} catch (error) {
				console.error(`Erro ao indexar documento ${doc.id}:`, error);
				// Continue com os outros documentos
			}
		}

		console.log("Indexação concluída");
	} catch (error) {
		console.error("Erro ao indexar documentos do usuário:", error);
		throw error;
	}
}

/**
 * Busca híbrida: combina busca textual e vetorial
 */
export async function hybridSearchDocuments(query: string, userId: string, assistantId?: string): Promise<string> {
	try {
		// Tenta busca vetorial primeiro
		const vectorResults = await vectorSearchDocuments(query, userId, assistantId, 3);

		if (vectorResults.length > 0) {
			let result = `🔍 Busca avançada encontrou ${vectorResults.length} documentos relevantes:\n\n`;

			vectorResults.forEach((doc, index) => {
				result += `${index + 1}. **${doc.title}** (relevância: ${(doc.similarity * 100).toFixed(1)}%)\n`;

				if (doc.sourceUrl) {
					result += `🔗 ${doc.sourceUrl}\n`;
				}

				if (doc.contentText) {
					// Extrai trecho relevante
					const preview = doc.contentText.substring(0, 200).replace(/\n/g, " ").trim();
					result += `💡 ${preview}${doc.contentText.length > 200 ? "..." : ""}\n\n`;
				}
			});

			return result;
		}

		// Fallback para busca textual se vetorial não funcionar
		return "Busca vetorial não disponível. Usando busca textual como fallback.";
	} catch (error) {
		console.error("Erro na busca híbrida:", error);
		return "Erro na busca avançada. Tente novamente ou use busca textual.";
	}
}
