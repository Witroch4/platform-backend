// services/openai-components/server-socialwise-componentes/router-llm.ts
import OpenAI from "openai";
import { AgentConfig, ChannelType, IntentCandidate, RouterDecision } from "../types";
import { withDeadlineAbort } from "../utils";
import { createRouterSchema, getConstraintsForChannel } from "./channel-constraints";
import { buildMessages, createMasterPrompt } from "./prompt-manager";
import { structuredOrJson } from "./structured-outputs";
import { ensureSession } from "./session-manager";
import { getModelCaps, isGPT5, normEffort, normVerb } from "./model-capabilities";

/**
 * Router LLM for embedipreview=false mode (patched)
 * - Always composes finalInstructions = agent.instructions + INTENT_HINTS (when hints.length > 0, i.e., score ≥ 0.35 upstream)
 * - Includes ROUTER_RULES developer prompt on first session call (history), together with MASTER prompt
 */
export async function routerLLM(
	this: { client: OpenAI },
	userText: string,
	agent: AgentConfig,
	opts?: {
		channelType?: ChannelType;
		sessionId?: string;
		intentHints?: IntentCandidate[];
		supplementalContext?: string;
	},
): Promise<RouterDecision | null> {
	const channel: ChannelType = opts?.channelType || "whatsapp";
	const schema = createRouterSchema(channel);
	const constraints = getConstraintsForChannel(channel);

	// Calcular max_output_tokens baseado no bodyMax do canal
	// Regra: ~1.5 tokens por caractere + margem de segurança
	const channelMaxTokens = Math.min(Math.ceil(constraints.bodyMax * 1.5), 1024);
	// Agente sobrescreve o limite do canal (agente manda!)
	const finalMaxTokens = agent.maxOutputTokens || channelMaxTokens;

	// Debug: log session id
	console.log("🎯 ROUTER LLM - SessionId recebido:", opts?.sessionId);

	// ✅ Texto cru do usuário - sem prefixos para evitar prompt injection
	const user = userText;

	return withDeadlineAbort(async (signal) => {
		try {
			const caps = getModelCaps(agent.model);

			// Session handling to decide if we inject developer prompts in messages
			const hasSessionId = !!opts?.sessionId;
			let isNewSession = true;
			let previousResponseId: string | undefined;
			if (hasSessionId) {
				try {
					const sessionResult = await ensureSession(
						{ sessionId: opts!.sessionId as string, agent, channel },
						createMasterPrompt,
						signal,
					);
					isNewSession = sessionResult.isNewSession;
					previousResponseId = sessionResult.responseId;
				} catch (error) {
					console.warn("[Session] Erro ao obter sessão:", error);
					isNewSession = true;
					previousResponseId = undefined;
				}
			}

			const messages = buildMessages(
				{
					channel,
					taskType: "router",
					hasInstructions: !!agent.instructions,
					// Add MASTER + ROUTER_RULES only for first call in a session
					statelessInit: isNewSession,
				},
				user,
			);

			// Build INTENT_HINTS block (score ≥ 0.35 filtered upstream)
			const hints = opts?.intentHints || [];
			let finalInstructions = agent.instructions || "Você é um roteador inteligente. Siga o schema estritamente.";

			// Helper function to safely escape strings for JSON context
			const safeString = (str: string) => {
				return str
					.replace(/\\/g, "\\\\") // Escape backslashes
					.replace(/"/g, '\\"') // Escape quotes
					.replace(/\n/g, "\\n") // Escape newlines
					.replace(/\r/g, "\\r") // Escape carriage returns
					.replace(/\t/g, "\\t"); // Escape tabs
			};

			if (hints.length > 0) {
				const lines = hints
					.slice(0, 5)
					.map((h) => {
						const sc = typeof h.score === "number" ? Number(h.score!.toFixed(3)) : undefined;
						const nm = h.name ? ` (${safeString(h.name)})` : "";
						const desc = safeString((h.desc || "").replace(/\s+/g, " ").trim().slice(0, 140));
						const aliases =
							Array.isArray((h as any).aliases) && (h as any).aliases.length
								? ` aliases: ${((h as any).aliases as string[])
										.slice(0, 5)
										.map((alias) => safeString(alias))
										.join(", ")}`
								: "";
						return `- @${h.slug}${nm}${sc !== undefined ? ` score:${sc}` : ""}${desc ? `\n  desc: ${desc}` : ""}${aliases ? `\n  ${aliases}` : ""}`;
					})
					.join("\n");
				finalInstructions += `\n\n# INTENT_HINTS (score ≥ 0.35)\nFornecidas pelo sistema. Use-as para decidir o roteamento.\n${lines}`;

				// Reforço suave de políticas de uso de hints sem obrigar roteamento
				finalInstructions += `\n\n# POLÍTICA DE ROTEAMENTO COM HINTS (não restritiva)\n- Avalie o ALINHAMENTO semântico entre a pergunta e cada hint.\n- Se existir UM hint claramente alinhado, é PREFERÍVEL usar mode='intent' com o slug EXATO do hint (incluindo @).\n- Se houver AMBIGUIDADE ou múltiplos hints plausíveis, escolha mode='chat' e DESAMBIGUE com 2–3 botões usando EXCLUSIVAMENTE slugs dos INTENT_HINTS; você pode incluir @falar_atendente quando apropriado.\n- Caso opte por mode='intent', NUNCA invente novos slugs: escolha somente entre os fornecidos em INTENT_HINTS; se nenhum servir, use mode='chat'.\n- Não afirme dados operacionais (ex.: horário exato). Prefira linguagem neutra e ofereça botões como “Ver horário”.`;
			}

			if (opts?.supplementalContext) {
				finalInstructions += `\n\n# CONTEXTO RECUPERADO\n${opts.supplementalContext.trim()}`;
			}

			const result = await structuredOrJson<RouterDecision>({
				client: this.client,
				model: agent.model,
				messages,
				instructions: finalInstructions,
				previous_response_id: previousResponseId,
				max_output_tokens: finalMaxTokens,
				verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
				reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
				agent,
				schema,
				schemaName: "RouterDecision",
				sessionId: opts?.sessionId,
				channel,
				signal,
				// Avoid internal ensureSession (done above) and use stable pointer key (avoid dynamic hints)
				disableEnsureSession: true,
				pointerKey: agent.instructions || "router_v1",
			});

			if (!result.parsed.mode || !["intent", "chat"].includes(result.parsed.mode)) {
				return null;
			}

			return result.parsed;
		} catch (error) {
			console.error("Erro no Router LLM:", error);
			return null;
		}
	}, agent.hardDeadlineMs || 15000);
}
