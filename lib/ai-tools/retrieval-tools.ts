// lib/ai-tools/retrieval-tools.ts
import { z } from "zod";
import { getPrismaInstance } from "@/lib/connections";
import { OpenAI } from "openai";

// Schema das tools disponíveis
export const RetrievalToolsSchema = {
	search_business_info: {
		type: "function" as const,
		function: {
			name: "search_business_info",
			description:
				"Busca informações sobre o negócio/empresa nos documentos carregados pelo usuário (horários, endereço, serviços, políticas, etc.)",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description:
							"Termo de busca sobre o negócio (ex: 'horário funcionamento', 'endereço', 'serviços', 'políticas')",
					},
					userId: {
						type: "string",
						description: "ID do usuário para buscar seus documentos",
					},
					assistantId: {
						type: "string",
						description: "ID do assistente (opcional) para buscar documentos específicos",
					},
				},
				required: ["query", "userId"],
			},
		},
	},
	search_intents: {
		type: "function" as const,
		function: {
			name: "search_intents",
			description: "Busca intents/respostas automáticas disponíveis baseado na pergunta do usuário",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Pergunta ou contexto do usuário para encontrar intent relevante",
					},
					accountId: {
						type: "string",
						description: "ID da conta para buscar intents específicos",
					},
				},
				required: ["query", "accountId"],
			},
		},
	},
	search_documents: {
		type: "function" as const,
		function: {
			name: "search_documents",
			description: "Busca informações em documentos/arquivos carregados pelo usuário",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Pergunta sobre conteúdo de documentos",
					},
					accountId: {
						type: "string",
						description: "ID da conta para buscar documentos específicos",
					},
				},
				required: ["query", "accountId"],
			},
		},
	},
};

// Função para buscar informações do negócio usando AiDocument
export async function searchBusinessInfo(query: string, userId: string, assistantId?: string): Promise<string> {
	const prisma = getPrismaInstance();

	try {
		// TODO: Implementar busca vetorial quando você adicionar o campo embedding
		// Por enquanto, busca textual simples nos documentos

		const documents = await prisma.aiDocument.findMany({
			where: {
				userId,
				assistantId, // Se fornecido, busca documentos específicos do assistente
				isActive: true,
				contentText: {
					not: null,
				},
			},
			select: {
				id: true,
				title: true,
				contentText: true,
				sourceUrl: true,
			},
			orderBy: {
				updatedAt: "desc",
			},
		});

		if (documents.length === 0) {
			return "Nenhum documento sobre o negócio foi encontrado. Faça upload de documentos com informações da empresa no painel de IA.";
		}

		// Busca textual simples por enquanto (substituir por busca vetorial depois)
		const searchTerms = query.toLowerCase();
		const matchingDocuments = documents.filter((doc) => {
			const searchableText = `${doc.title} ${doc.contentText || ""}`.toLowerCase();
			return (
				searchableText.includes(searchTerms) ||
				searchTerms.split(" ").some((term) => term.length > 2 && searchableText.includes(term))
			);
		});

		if (matchingDocuments.length === 0) {
			// Se não encontrar correspondência específica, retorna info dos documentos mais recentes
			const recentDocs = documents.slice(0, 2);
			let result = "Documentos disponíveis sobre o negócio:\n\n";
			recentDocs.forEach((doc) => {
				result += `📄 ${doc.title}\n`;
				if (doc.contentText) {
					// Extrai primeiras linhas do conteúdo
					const preview = doc.contentText.substring(0, 200).replace(/\n/g, " ").trim();
					result += `${preview}${doc.contentText.length > 200 ? "..." : ""}\n\n`;
				}
			});
			return result;
		}

		// Retorna documentos que correspondem à busca
		let result = `Informações encontradas sobre "${query}":\n\n`;
		matchingDocuments.slice(0, 3).forEach((doc) => {
			// Limita a 3 resultados
			result += `📄 **${doc.title}**\n`;
			if (doc.sourceUrl) {
				result += `🔗 Fonte: ${doc.sourceUrl}\n`;
			}

			if (doc.contentText) {
				// Extrai contexto relevante ao redor dos termos de busca
				const content = doc.contentText.toLowerCase();
				const queryTerms = searchTerms.split(" ").filter((term) => term.length > 2);

				let bestMatch = "";
				let bestScore = 0;

				// Encontra o melhor trecho que contém mais termos de busca
				const sentences = doc.contentText.split(/[.!?]\s+/);
				sentences.forEach((sentence) => {
					const sentenceLower = sentence.toLowerCase();
					const score = queryTerms.reduce((acc, term) => {
						return acc + (sentenceLower.includes(term) ? 1 : 0);
					}, 0);

					if (score > bestScore) {
						bestScore = score;
						bestMatch = sentence.trim();
					}
				});

				if (bestMatch) {
					result += `💡 ${bestMatch}\n\n`;
				} else {
					// Fallback para as primeiras linhas
					const preview = doc.contentText.substring(0, 300).replace(/\n/g, " ").trim();
					result += `${preview}${doc.contentText.length > 300 ? "..." : ""}\n\n`;
				}
			}
		});

		return result;
	} catch (error) {
		console.error("Erro ao buscar informações do negócio:", error);
		return "Erro ao buscar informações nos documentos. Tente novamente.";
	}
}

// Função para buscar intents
export async function searchIntents(query: string, accountId: string): Promise<string> {
	const prisma = getPrismaInstance();

	try {
		// Busca intents da conta
		const intents = await prisma.intent.findMany({
			where: {
				accountId,
				isActive: true,
			},
			select: {
				id: true,
				slug: true,
				name: true,
				description: true,
				actionType: true,
			},
		});

		if (intents.length === 0) {
			return "Nenhum intent configurado para esta conta.";
		}

		// Busca simples por palavras-chave
		const searchTerms = query.toLowerCase();
		const matchingIntents = intents.filter((intent) => {
			const searchableText = `${intent.name} ${intent.description || ""}`.toLowerCase();
			return (
				searchableText.includes(searchTerms) || searchTerms.split(" ").some((term) => searchableText.includes(term))
			);
		});

		if (matchingIntents.length === 0) {
			return `Não foram encontrados intents relacionados a "${query}".`;
		}

		// Retorna os intents encontrados
		let result = "Intents encontrados:\n";
		matchingIntents.slice(0, 3).forEach((intent) => {
			// Limita a 3 resultados
			result += `\n• ${intent.name}: ${intent.description || "Sem descrição"}\n`;
			result += `  Slug: @${intent.slug}\n`;
			result += `  Tipo: ${intent.actionType}\n`;
		});

		return result;
	} catch (error) {
		console.error("Erro ao buscar intents:", error);
		return "Erro ao buscar intents. Tente novamente.";
	}
}

// Função para buscar documentos (implementação completa com preparação para vetorial)
export async function searchDocuments(query: string, userId: string, assistantId?: string): Promise<string> {
	const prisma = getPrismaInstance();

	try {
		// Busca todos os documentos do usuário
		const documents = await prisma.aiDocument.findMany({
			where: {
				userId,
				...(assistantId && { assistantId }),
				isActive: true,
				contentText: {
					not: null,
				},
			},
			select: {
				id: true,
				title: true,
				contentText: true,
				sourceUrl: true,
				updatedAt: true,
				assistant: {
					select: {
						name: true,
					},
				},
			},
			orderBy: {
				updatedAt: "desc",
			},
		});

		if (documents.length === 0) {
			return assistantId
				? "Nenhum documento foi carregado para este assistente."
				: "Nenhum documento foi carregado. Faça upload de documentos no painel de IA.";
		}

		// TODO: Quando implementar busca vetorial, substituir por:
		// const embeddings = await generateEmbeddings(query);
		// const results = await prisma.$queryRaw`
		//   SELECT *, (embedding <=> ${embeddings}) as distance
		//   FROM "AiDocument"
		//   WHERE "userId" = ${userId} AND "isActive" = true
		//   ORDER BY distance ASC
		//   LIMIT 5
		// `;

		// Busca textual por enquanto
		const searchTerms = query.toLowerCase();
		const matchingDocuments = documents.filter((doc) => {
			const searchableText = `${doc.title} ${doc.contentText || ""}`.toLowerCase();
			return (
				searchableText.includes(searchTerms) ||
				searchTerms.split(" ").some((term) => term.length > 2 && searchableText.includes(term))
			);
		});

		if (matchingDocuments.length === 0) {
			let result = "Não foram encontrados documentos específicos para sua consulta.\n\n";
			result += "📚 Documentos disponíveis:\n";
			documents.slice(0, 3).forEach((doc) => {
				result += `• ${doc.title}`;
				if (doc.assistant?.name) result += ` (${doc.assistant.name})`;
				result += `\n`;
			});
			return result;
		}

		// Retorna documentos relevantes
		let result = `📋 Documentos encontrados para "${query}":\n\n`;
		matchingDocuments.slice(0, 3).forEach((doc) => {
			result += `📄 **${doc.title}**\n`;
			if (doc.assistant?.name) {
				result += `🤖 Assistente: ${doc.assistant.name}\n`;
			}
			if (doc.sourceUrl) {
				result += `🔗 Fonte: ${doc.sourceUrl}\n`;
			}

			if (doc.contentText) {
				// Extrai contexto relevante
				const content = doc.contentText;
				const queryTerms = searchTerms.split(" ").filter((term) => term.length > 2);

				// Encontra o parágrafo mais relevante
				const paragraphs = content.split(/\n\s*\n/);
				let bestParagraph = "";
				let bestScore = 0;

				paragraphs.forEach((paragraph) => {
					const paragraphLower = paragraph.toLowerCase();
					const score = queryTerms.reduce((acc, term) => {
						return acc + (paragraphLower.includes(term) ? 1 : 0);
					}, 0);

					if (score > bestScore && paragraph.trim().length > 50) {
						bestScore = score;
						bestParagraph = paragraph.trim();
					}
				});

				if (bestParagraph) {
					// Limita o tamanho do trecho
					const excerpt = bestParagraph.length > 400 ? bestParagraph.substring(0, 400) + "..." : bestParagraph;
					result += `💡 ${excerpt}\n\n`;
				}
			}

			result += "---\n\n";
		});

		return result;
	} catch (error) {
		console.error("Erro ao buscar documentos:", error);
		return "Erro ao buscar documentos. Tente novamente.";
	}
}

// Executor de tools
export async function executeRetrievalTool(
	toolName: string,
	parameters: any,
	context: { userId: string; assistantId?: string; accountId?: string },
): Promise<string> {
	switch (toolName) {
		case "search_business_info":
			return await searchBusinessInfo(
				parameters.query,
				parameters.userId || context.userId,
				parameters.assistantId || context.assistantId,
			);

		case "search_intents":
			return await searchIntents(parameters.query, parameters.accountId || context.accountId || "");

		case "search_documents":
			return await searchDocuments(parameters.query, context.userId);

		default:
			return `Tool "${toolName}" não reconhecida.`;
	}
}

// Função para definir quais tools estão disponíveis baseado no contexto
export function getAvailableTools(context: {
	hasBusinessInfo?: boolean;
	hasIntents?: boolean;
	hasDocuments?: boolean;
}) {
	const tools = [];

	if (context.hasBusinessInfo) {
		tools.push(RetrievalToolsSchema.search_business_info);
	}

	if (context.hasIntents) {
		tools.push(RetrievalToolsSchema.search_intents);
	}

	if (context.hasDocuments) {
		tools.push(RetrievalToolsSchema.search_documents);
	}

	return tools;
}
