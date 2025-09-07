/**
 * 🎯 NOVA FUNCIONALIDADE: Chat livre com IA gerando botões dinâmicos
 * Usado na banda LOW quando não há intenções claras mas cliente quer conversar
 */
export async function generateFreeChatButtons(
  this: { client: OpenAI },
  userText: string,
  agent: AgentConfig,
  opts?: { 
    channelType?: ChannelType;
    sessionId?: string;
  }
): Promise<WarmupButtonsResponse | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);

  // 🔍 DEBUG: Log sessionId recebido
  console.log("🎯 FREE CHAT BUTTONS - SessionId recebido:", opts?.sessionId);

  const user = `Cliente: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      
      const messages = buildMessages(
        { 
          channel, 
          taskType: "FREE_CHAT", 
          statelessInit: false 
        },
        user
      );

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: agent.instructions || "Você é um UX writer especializado em criar botões de navegação. Siga o schema estritamente e gere botões objetivos.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "FreeChatButtons",
        sessionId: opts?.sessionId,
        channel,
        signal,
      });

      return result.parsed;
    } catch (error) {
      console.error("Erro ao gerar chat livre com botões:", error);
      return null;
    }
  }, agent.warmupDeadlineMs || 15000);
}
