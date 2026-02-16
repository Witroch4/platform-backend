// lib/socialwise-flow/graph/nodes/react-agent.ts
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { searchDocuments } from "@/lib/ai-tools/retrieval-tools";
import type { AgentStateSchema } from "../state";

const log = createLogger("Graph-Node:ReactAgent");

const DEFAULT_AGENT_PROMPT = `Você é o Capitão, assistente especialista do Chatwit.\n- Responda em português claro.\n- Use ferramentas quando houver dúvidas sobre fatos ou datas.\n- Se recuperar informações externas, produza um resumo objetivo que o roteador possa usar posteriormente.`;

export async function reactAgentNode(state: AgentStateSchema): Promise<Partial<AgentStateSchema>> {
	const { context, agent } = state;

	if (!context?.userText) {
		return {};
	}

	try {
		const nowTool = tool(
			async (_input: Record<string, any>) => {
				const currentState = getCurrentTaskInput() as AgentStateSchema;
				const now = new Date();
				const iso = now.toISOString();

				// Structured output para melhor observabilidade
				const result = {
					timestamp: iso,
					timezone: "UTC",
					formatted: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
					weekday: now.toLocaleDateString("pt-BR", { weekday: "long" }),
				};

				// Log estruturado para auditoria de ferramentas
				log.info("Tool invoked", {
					tool: "get_current_datetime",
					result,
					traceId: currentState.context?.traceId,
					userId: currentState.userId,
				});

				return JSON.stringify(result, null, 2);
			},
			{
				name: "get_current_datetime",
				description:
					"Retorna a data e hora atuais com informações detalhadas. Use para planejar atendimentos futuros ou quando precisar de informações temporais.",
				schema: z
					.object({})
					.describe("Nenhum parâmetro é necessário. Chama automaticamente para obter data/hora atual."),
			},
		);

		const ragTool = tool(
			async ({ query }: { query: string }) => {
				const currentState = getCurrentTaskInput() as AgentStateSchema;
				const { userId, context: currentContext } = currentState;

				if (!userId || !currentContext?.assistantId) {
					throw new Error("Estado inválido: userId ou assistantId não encontrados");
				}

				const result = await searchDocuments(query, userId, currentContext.assistantId);

				// Structured output para melhor observabilidade
				const structuredResult = {
					query,
					hasResults: !!result && result.length > 0,
					resultLength: result?.length || 0,
					content: result || "Nenhum documento relevante encontrado.",
					timestamp: new Date().toISOString(),
				};

				log.info("Tool invoked", {
					tool: "retrieve_ai_documents",
					query,
					hasResults: structuredResult.hasResults,
					resultLength: structuredResult.resultLength,
					traceId: currentContext.traceId,
					userId,
				});

				return structuredResult.content;
			},
			{
				name: "retrieve_ai_documents",
				description:
					"Busca informações relevantes na base de documentos do cliente usando embedding semântico. Retorna conteúdo específico baseado na consulta.",
				schema: z.object({
					query: z.string().min(3, "Forneça uma pergunta ou tópico específico para a busca na base de conhecimento."),
				}),
			},
		);

		// Alguns modelos (ex.: gpt-5-nano/mini) não aceitam temperature ≠ 1.
		// Evite enviar temperature quando o modelo é "nano/mini" ou quando o valor é 1/indefinido.
		const modelId = agent?.model || "gpt-5-nano";
		const isNanoOrMini = /nano|mini/i.test(modelId);
		const isReasoningFamily = /gpt-5/i.test(modelId);
		const requestedTemp = agent?.temperature;
		const requestedTopP = agent?.topP as number | null | undefined;
		// Regra geral:
		// - Famílias com reasoning (gpt-5*): omitir sampling (ou enviar neutro) — aqui omitimos.
		// - Modelos nano/mini: omitir temperature sempre.
		const shouldOmitTemp = isReasoningFamily || isNanoOrMini || requestedTemp == null || requestedTemp === 1;
		const shouldIncludeTopP = !isReasoningFamily && !isNanoOrMini && requestedTopP != null;

		const baseOptions: any = {
			model: modelId,
			maxTokens: agent?.maxOutputTokens || 512,
		};
		if (!shouldOmitTemp) baseOptions.temperature = requestedTemp;
		if (shouldIncludeTopP) baseOptions.topP = requestedTopP;

		const llm = new ChatOpenAI(baseOptions).bindTools([nowTool, ragTool]);

		const prompt = agent?.instructions?.trim()
			? `${agent.instructions}\n\n${DEFAULT_AGENT_PROMPT}`
			: DEFAULT_AGENT_PROMPT;

		const reactAgent = createReactAgent({
			llm,
			tools: [nowTool, ragTool],
			prompt,
		});

		const langsmithProject = process.env.LANGSMITH_PROJECT || "socialwise-react-agent";

		const run = await reactAgent.invoke(
			{
				messages: [
					{
						role: "user",
						content: context.userText,
					},
				],
			},
			{
				configurable: {
					project: langsmithProject,
					metadata: {
						traceId: context.traceId,
						inboxId: context.inboxId,
						userId: state.userId,
						assistantId: context.assistantId,
					},
				},
				tags: ["socialwise", "react-agent", "langgraph"],
			} as any,
		);

		const messages = Array.isArray(run?.messages) ? run.messages : [];
		const last = messages[messages.length - 1];

		// Melhor extração do conteúdo com fallbacks robustos
		let output: string | undefined;

		if (typeof last?.content === "string") {
			output = last.content;
		} else if (Array.isArray(last?.content)) {
			output = last.content
				.map((c: any) => {
					if (typeof c === "string") return c;
					if (c?.text) return c.text;
					if (c?.content) return c.content;
					return "";
				})
				.filter(Boolean)
				.join("\n");
		} else if (last?.content && typeof last.content === "object" && "text" in last.content) {
			output = (last.content as any).text;
		}

		if (!output || output.trim().length === 0) {
			log.warn("React agent produced empty output", {
				traceId: context.traceId,
				messageCount: messages.length,
				lastMessageType: (last as any)?.type || "unknown",
			});
			return {};
		}

		// Log estruturado com métricas de qualidade
		log.info("React agent produced supplement", {
			traceId: context.traceId,
			length: output.length,
			wordCount: output.split(/\s+/).length,
			messageCount: messages.length,
			userId: state.userId,
		});

		return {
			agentSupplement: output.trim(),
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;

		log.error("React agent failed", {
			error: errorMessage,
			stack: errorStack,
			traceId: context?.traceId,
			userId: state.userId,
			userText: context?.userText?.slice(0, 100) + "...",
			modelId: agent?.model,
		});

		// Em caso de erro, retornar estado que indica falha mas não quebra o fluxo
		return {
			agentSupplement: undefined, // Deixa claro que não há suplemento
		};
	}
}
