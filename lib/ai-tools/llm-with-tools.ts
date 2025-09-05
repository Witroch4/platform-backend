// lib/ai-tools/llm-with-tools.ts
// Integração das retrieval tools com o sistema LLM

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { RetrievalToolsSchema, executeRetrievalTool } from './retrieval-tools';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Executa LLM com acesso a retrieval tools
 */
export async function runLLMWithRetrievalTools(
  messages: ChatCompletionMessageParam[],
  context: {
    userId: string;
    assistantId?: string;
    accountId?: string;
    model?: string;
    temperature?: number;
  }
): Promise<{
  content: string;
  toolCalls?: Array<{
    toolName: string;
    parameters: any;
    result: string;
  }>;
}> {
  const {
    userId,
    assistantId,
    accountId,
    model = 'gpt-4o-mini',
    temperature = 0.7
  } = context;

  try {
    // Prepara as tools disponíveis
    const availableTools = [
      RetrievalToolsSchema.search_business_info,
      RetrievalToolsSchema.search_intents,
      RetrievalToolsSchema.search_documents
    ];

    // Primeira chamada para o LLM com tools
    const completion = await openai.chat.completions.create({
      model,
      messages,
      tools: availableTools,
      tool_choice: "auto", // LLM decide quando usar tools
      temperature,
      max_tokens: 1000,
    });

    const assistantMessage = completion.choices[0]?.message;
    
    if (!assistantMessage) {
      throw new Error('Resposta inválida do LLM');
    }

    // Se o LLM não usou tools, retorna resposta direta
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        content: assistantMessage.content || 'Sem resposta disponível.'
      };
    }

    // Executa as tool calls
    const toolResults: Array<{
      toolName: string;
      parameters: any;
      result: string;
    }> = [];

    const toolMessages = [];

    for (const toolCall of assistantMessage.tool_calls) {
      try {
        if (toolCall.type === 'function') {
          const toolName = toolCall.function.name;
          const parameters = JSON.parse(toolCall.function.arguments);
          
          // Executa a tool
          const result = await executeRetrievalTool(toolName, parameters, {
            userId,
            assistantId,
            accountId
          });

          toolResults.push({
            toolName,
            parameters,
            result
          });

          // Adiciona resultado da tool à conversa
          toolMessages.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: result
          });
        }

      } catch (error) {
        console.error(`Erro ao executar tool:`, error);
        
        toolMessages.push({
          tool_call_id: toolCall.id,
          role: "tool" as const,
          content: `Erro ao executar ferramenta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        });
      }
    }

    // Segunda chamada para o LLM com os resultados das tools
    const finalMessages = [
      ...messages,
      {
        role: "assistant" as const,
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      },
      ...toolMessages
    ];

    const finalCompletion = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature,
      max_tokens: 1000,
    });

    const finalResponse = finalCompletion.choices[0]?.message?.content || 'Sem resposta final disponível.';

    return {
      content: finalResponse,
      toolCalls: toolResults
    };

  } catch (error) {
    console.error('Erro no LLM com retrieval tools:', error);
    throw new Error(`Falha na execução do LLM: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Exemplo de uso específico para o sistema SocialWise
 */
export async function processSocialWiseWithRetrieval(
  userMessage: string,
  context: {
    userId: string;
    assistantId?: string;
    accountId?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  }
): Promise<string> {
  const { userId, assistantId, accountId, conversationHistory = [] } = context;

  // Prepara mensagens incluindo histórico
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `Você é um assistente especializado em atendimento ao cliente. 
Você tem acesso a ferramentas para buscar informações sobre:
- Informações da empresa/negócio (horários, endereços, serviços)
- Intents/respostas configuradas no sistema
- Documentos carregados pelo usuário

Use essas ferramentas quando precisar de informações específicas para responder ao cliente.
Sempre responda de forma clara, profissional e útil.`
    },
    ...conversationHistory.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content
    })),
    {
      role: "user",
      content: userMessage
    }
  ];

  try {
    const result = await runLLMWithRetrievalTools(messages, {
      userId,
      assistantId,
      accountId,
      model: 'gpt-4o-mini',
      temperature: 0.7
    });

    return result.content;

  } catch (error) {
    console.error('Erro no processamento SocialWise com retrieval:', error);
    return "Desculpe, houve um erro ao processar sua solicitação. Tente novamente.";
  }
}

/**
 * Função para integrar com o router LLM existente
 */
export async function enhanceRouterLLMWithRetrieval(
  originalRouterFunction: Function,
  ...args: any[]
): Promise<any> {
  // Esta função pode ser usada para "interceptar" chamadas do router LLM
  // e adicionar capacidades de retrieval quando necessário
  
  try {
    // Executa a função original do router
    const originalResult = await originalRouterFunction(...args);
    
    // Se o resultado indicar que precisa de mais informações,
    // pode usar as retrieval tools aqui
    
    return originalResult;
    
  } catch (error) {
    console.error('Erro no enhanced router:', error);
    throw error;
  }
}
