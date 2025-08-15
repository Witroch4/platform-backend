//lib\cost\openai-wrapper.ts
import OpenAI from "openai";
import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { guardOpenAIOperation, logBlockedOperation, logModelDowngrade, BudgetExceededException } from "./budget-guard";

// Configuração da fila de custos com baixa prioridade
const getCostQueue = () => {
  const redis = getRedisInstance();
  return new Queue("cost-events", { 
    connection: redis,
    defaultJobOptions: { 
      priority: 10, // baixa prioridade
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    }
  });
};

export type OpenAIHookArgs = {
  model: string;
  input: any;
  signal?: AbortSignal;
  meta?: { 
    sessionId?: string; 
    inboxId?: string; 
    userId?: string; 
    intent?: string; 
    traceId?: string;
  };
};

export type OpenAIUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
};

export type OpenAIResponse = {
  id: string;
  usage?: OpenAIUsage;
  [key: string]: any;
};

/**
 * Wrapper para chamadas OpenAI com captura automática de custos
 * Intercepta responses e publica eventos de custo para processamento assíncrono
 * Inclui verificação de orçamento e controles automáticos
 */
export async function openaiWithCost(
  client: OpenAI, 
  args: OpenAIHookArgs
): Promise<OpenAIResponse> {
  const started = Date.now();
  const costQueue = getCostQueue();
  
  try {
    // Verificar orçamento antes da operação
    const budgetGuard = await guardOpenAIOperation(
      args.model,
      args.meta?.inboxId,
      args.meta?.userId
    );

    if (!budgetGuard.allowed) {
      logBlockedOperation(
        'OpenAI Chat Completion',
        budgetGuard.reason || 'Orçamento excedido',
        {
          inboxId: args.meta?.inboxId,
          userId: args.meta?.userId,
          model: args.model,
        }
      );
      
      throw new BudgetExceededException(
        budgetGuard.reason || 'Operação bloqueada por orçamento excedido',
        args.meta?.inboxId ? 'inbox' : 'user',
        args.meta?.inboxId || args.meta?.userId || 'unknown'
      );
    }

    // Usar modelo sugerido (pode ser downgraded)
    const modelToUse = budgetGuard.model;
    if (modelToUse !== args.model) {
      logModelDowngrade(args.model, modelToUse, {
        inboxId: args.meta?.inboxId,
        userId: args.meta?.userId,
      });
    }

    // Executa a chamada OpenAI com o modelo apropriado
    // Suporta Chat Completions (quando content é string) e Responses API (multimodal/JSON)
    let resp: OpenAIResponse;

    // Só use Chat Completions quando TODAS as mensagens tiverem content string
    const isChatCompletionsShape =
      Array.isArray(args.input) &&
      args.input.length > 0 &&
      args.input.every(
        (m: any) => typeof m?.role === "string" && typeof m?.content === "string"
      );

    if (isChatCompletionsShape) {
      // Chat Completions — options (signal) no 2º argumento do SDK
      const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: modelToUse,
        messages: args.input,
      };
      resp = await client.chat.completions.create(params, { signal: args.signal }) as OpenAIResponse;
    } else {
      // Responses API — sempre via SDK (sem fetch manual)
      const isFullParams =
        args.input &&
        typeof args.input === "object" &&
        !Array.isArray(args.input) &&
        ("input" in args.input ||
          "tools" in args.input ||
          "store" in args.input ||
          "temperature" in args.input ||
          "max_output_tokens" in args.input ||
          "reasoning" in args.input ||
          "metadata" in args.input);

      const params: any = isFullParams
        ? {
            stream: (args.input as any).stream ?? false,
            store: (args.input as any).store ?? true,
            ...args.input,
            model: modelToUse,
          }
        : {
            model: modelToUse,
            input: args.input,
            stream: false,
            store: true,
          };

      // Para streaming, usar client.responses.stream ao invés de create
      if (params.stream) {
        resp = await client.responses.stream(params, { signal: args.signal }) as any;
      } else {
        resp = await client.responses.create(params, { signal: args.signal }) as OpenAIResponse;
      }
    }
    
    const latencyMs = Date.now() - started;

    // Extrai usage da resposta
    const usage = resp.usage || {};
    const inputTokens = Number(usage.input_tokens ?? 0);
    const cachedTokens = Number(usage.input_tokens_details?.cached_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);

    // Prepara dados comuns para todos os eventos
    const commonEventData = {
      ts: new Date().toISOString(),
      provider: "OPENAI",
      product: modelToUse, // Usar o modelo que foi realmente usado
      externalId: resp.id,
      raw: { 
        usage, 
        latencyMs,
        model: modelToUse,
        originalModel: args.model !== modelToUse ? args.model : undefined, // Track downgrades
      },
      traceId: args.meta?.traceId,
      sessionId: args.meta?.sessionId,
      inboxId: args.meta?.inboxId,
      userId: args.meta?.userId,
      intent: args.meta?.intent,
    };

    // Publica eventos de custo em bulk para otimizar performance
    const events = [];
    
    // Tokens de entrada (excluindo cached)
    if (inputTokens - cachedTokens > 0) {
      events.push({
        name: "cost-event",
        data: {
          ...commonEventData,
          unit: "TOKENS_IN",
          units: inputTokens - cachedTokens,
        }
      });
    }

    // Tokens cached (se houver)
    if (cachedTokens > 0) {
      events.push({
        name: "cost-event",
        data: {
          ...commonEventData,
          unit: "TOKENS_CACHED",
          units: cachedTokens,
        }
      });
    }

    // Tokens de saída
    if (outputTokens > 0) {
      events.push({
        name: "cost-event",
        data: {
          ...commonEventData,
          unit: "TOKENS_OUT",
          units: outputTokens,
        }
      });
    }

    // Publica eventos em bulk se houver algum
    if (events.length > 0) {
      await costQueue.addBulk(events);
    }

    return resp;
  } catch (error) {
    // Em caso de erro, ainda tenta capturar o custo se possível
    const latencyMs = Date.now() - started;
    
    // Log do erro para debugging
    console.error("Erro na chamada OpenAI:", error);
    
    // Se o erro contém informações de usage, ainda captura
    if (error && typeof error === 'object' && 'usage' in error) {
      const usage = (error as any).usage;
      const commonEventData = {
        ts: new Date().toISOString(),
        provider: "OPENAI",
        product: args.model,
        externalId: `error-${Date.now()}`,
        raw: { 
          usage, 
          latencyMs,
          error: error.toString(),
          model: args.model 
        },
        traceId: args.meta?.traceId,
        sessionId: args.meta?.sessionId,
        inboxId: args.meta?.inboxId,
        userId: args.meta?.userId,
        intent: args.meta?.intent,
      };

      try {
        await costQueue.add("cost-event", {
          ...commonEventData,
          unit: "TOKENS_IN",
          units: Number(usage.input_tokens ?? 0),
        });
      } catch (queueError) {
        console.error("Erro ao publicar evento de custo:", queueError);
      }
    }
    
    // Re-throw o erro original
    throw error;
  }
}

/**
 * Wrapper específico para chamadas de chat completion
 */
export async function openaiChatWithCost(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  meta?: OpenAIHookArgs['meta'],
  signal?: AbortSignal
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return openaiWithCost(client, {
    model,
    input: messages,
    signal,
    meta
  }) as Promise<OpenAI.Chat.Completions.ChatCompletion>;
}

/**
 * Enhanced wrapper for responses API calls with abort support
 * Used by SocialWise Flow structured output methods
 * 
 * Supports two calling conventions:
 * 1. Legacy: responsesCall(client, model, input, meta, signal)
 * 2. New: responsesCall(client, requestParams, meta, options)
 */
export async function responsesCall(
  client: OpenAI,
  modelOrParams: string | any,
  inputOrMeta?: any,
  metaOrOptions?: OpenAIHookArgs['meta'] | { signal?: AbortSignal; timeout?: number },
  signalOnly?: AbortSignal
): Promise<OpenAIResponse> {
  // Check if using new calling convention (requestParams object)
  if (typeof modelOrParams === 'object' && modelOrParams !== null) {
    // New format: responsesCall(client, requestParams, meta, options)
    const requestParams = modelOrParams;
    const meta = inputOrMeta;
    const options = metaOrOptions as { signal?: AbortSignal; timeout?: number } || {};
    
    return openaiWithCost(client, {
      model: requestParams.model,
      input: requestParams,
      signal: options.signal,
      meta
    });
  } else {
    // Legacy format: responsesCall(client, model, input, meta, signal)
    const model = modelOrParams as string;
    const input = inputOrMeta;
    const meta = metaOrOptions as OpenAIHookArgs['meta'];
    const signal = signalOnly;
    
    return openaiWithCost(client, {
      model,
      input,
      signal,
      meta
    });
  }
}

/**
 * Wrapper para chamadas de embedding
 */
export async function openaiEmbeddingWithCost(
  client: OpenAI,
  model: string,
  input: string | string[],
  meta?: OpenAIHookArgs['meta']
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  const started = Date.now();
  const costQueue = getCostQueue();
  
  try {
    const resp = await client.embeddings.create({
      model,
      input
    });
    
    const latencyMs = Date.now() - started;
    const usage = resp.usage;
    
    if (usage?.total_tokens) {
      await costQueue.add("cost-event", {
        ts: new Date().toISOString(),
        provider: "OPENAI",
        product: model,
        unit: "TOKENS_IN",
        units: usage.total_tokens,
        externalId: `embedding-${Date.now()}`,
        raw: { 
          usage, 
          latencyMs,
          model,
          inputType: Array.isArray(input) ? 'array' : 'string',
          inputLength: Array.isArray(input) ? input.length : 1
        },
        traceId: meta?.traceId,
        sessionId: meta?.sessionId,
        inboxId: meta?.inboxId,
        userId: meta?.userId,
        intent: meta?.intent,
      });
    }
    
    return resp;
  } catch (error) {
    console.error("Erro na chamada de embedding OpenAI:", error);
    throw error;
  }
}