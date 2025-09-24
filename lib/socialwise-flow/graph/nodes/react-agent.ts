// lib/socialwise-flow/graph/nodes/react-agent.ts
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createLogger } from '@/lib/utils/logger';
import { searchDocuments } from '@/lib/ai-tools/retrieval-tools';
import type { AgentStateSchema } from '../state';

const log = createLogger('Graph-Node:ReactAgent');

const DEFAULT_AGENT_PROMPT = `Você é o Capitão, assistente especialista do Chatwit.\n- Responda em português claro.\n- Use ferramentas quando houver dúvidas sobre fatos ou datas.\n- Se recuperar informações externas, produza um resumo objetivo que o roteador possa usar posteriormente.`;

export async function reactAgentNode(state: AgentStateSchema): Promise<Partial<AgentStateSchema>> {
  const { context, agent, userId } = state;

  if (!context?.userText || !userId) {
    return {};
  }

  try {
    const nowTool = tool(
      async () => {
        const now = new Date();
        return now.toISOString();
      },
      {
        name: 'get_current_datetime',
        description: 'Retorna a data e hora atuais em formato ISO (UTC). Use para planejar atendimentos futuros.',
        schema: z.object({}).describe('Nenhum parâmetro é necessário. Chame para saber a data e hora atual.'),
      }
    );

    const ragTool = tool(
      async ({ query }: { query: string }) => {
        const result = await searchDocuments(query, userId, context.assistantId);
        return result;
      },
      {
        name: 'retrieve_ai_documents',
        description: 'Busca informações relevantes na base de documentos do cliente (AiDocument).',
        schema: z.object({
          query: z.string().min(3, 'Forneça uma pergunta ou tópico para a busca.'),
        }),
      }
    );

    const llm = new ChatOpenAI({
      model: agent?.model || 'gpt-5-nano',
      temperature: agent?.temperature ?? 0,
      maxTokens: agent?.maxOutputTokens || 512,
    }).bindTools([nowTool, ragTool]);

    const prompt = agent?.instructions?.trim()
      ? `${agent.instructions}\n\n${DEFAULT_AGENT_PROMPT}`
      : DEFAULT_AGENT_PROMPT;

    const reactAgent = createReactAgent({
      llm,
      tools: [nowTool, ragTool],
      prompt,
    });

    const langsmithProject = process.env.LANGSMITH_PROJECT || 'socialwise-react-agent';

    const run = await reactAgent.invoke({
      messages: [
        {
          role: 'user',
          content: context.userText,
        },
      ],
    }, {
      configurable: {
        project: langsmithProject,
        metadata: {
          traceId: context.traceId,
          inboxId: context.inboxId,
        },
      },
      tags: ['socialwise', 'react-agent'],
    } as any);

    const messages = Array.isArray(run?.messages) ? run.messages : [];
    const last = messages[messages.length - 1];
    const output = typeof last?.content === 'string'
      ? last.content
      : Array.isArray(last?.content)
        ? last.content.map((c: any) => (typeof c === 'string' ? c : c?.text)).filter(Boolean).join('\n')
        : undefined;

    if (!output) {
      return {};
    }

    log.info('React agent produced supplement', {
      traceId: context.traceId,
      length: output.length,
    });

    return {
      agentSupplement: output,
    };
  } catch (error) {
    log.warn('React agent failed', {
      err: error instanceof Error ? error.message : String(error),
      traceId: context?.traceId,
    });
    return {};
  }
}

