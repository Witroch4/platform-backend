import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { AiAgentType } from '@prisma/client';
import { RetrievalToolsSchema } from '@/lib/ai-tools/retrieval-tools';
import { DEFAULT_MODELS } from '@/services/openai-components/types';
import { openai } from '@/lib/oab-eval/openai-client';
import { getAvailableVisionModels, isGeminiAvailable } from '@/lib/oab-eval/unified-vision-client';

const agentTypeCatalog = [
  {
    id: AiAgentType.TOOLS,
    label: 'Tools Agent',
    description: 'Agente padrão do LangChain que decide quais ferramentas chamar em cada passo.',
    capabilities: ['Escolha automática de ferramentas', 'Execução passo a passo', 'Integração com memória ou RAG'],
  },
  {
    id: AiAgentType.OPENAI_FUNCTIONS,
    label: 'OpenAI Functions Agent',
    description: 'Utiliza o modo de function calling da OpenAI para selecionar ferramentas com alta precisão.',
    capabilities: ['Compatível com JSON schema', 'Preferível para respostas estruturadas', 'Melhor com modelos OpenAI recentes'],
  },
  {
    id: AiAgentType.PLAN_AND_EXECUTE,
    label: 'Plan and Execute Agent',
    description: 'Cria um plano multi-etapas, executa ferramentas e sintetiza o resultado ao final.',
    capabilities: ['Planejamento explícito', 'Execução iterativa', 'Ideal para tarefas complexas'],
  },
  {
    id: AiAgentType.REACT,
    label: 'ReAct Agent',
    description: 'Segue o padrão de raciocínio e ação (ReAct) conectando observações do ambiente com ferramentas.',
    capabilities: ['Raciocínio iterativo', 'Combina contexto + ações', 'Excelente para investigações profundas'],
  },
  {
    id: AiAgentType.CUSTOM,
    label: 'Custom Agent',
    description: 'Configuração livre para protótipos ou integrações específicas.',
    capabilities: ['Configuração flexível', 'Integração manual', 'Ideal para experimentos'],
  },
];

// Modelos padrão usados como fallback se a API falhar
const defaultModels = [
  { value: DEFAULT_MODELS.CHAT, label: 'Chat (default)' },
  { value: DEFAULT_MODELS.CHAT_ADVANCED, label: 'Chat avançado' },
  { value: DEFAULT_MODELS.CHAT_FAST, label: 'Chat rápido' },
  { value: DEFAULT_MODELS.CHAT_NANO, label: 'Chat nano' },
  // Modelos vision/line-by-line que queremos expor explicitamente
  { value: 'gpt-4.1', label: 'gpt-4.1 (vision)' },
  { value: 'gpt-4o', label: 'gpt-4o (vision)' },
  { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini (rápido)' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini (rápido)' },
];

/**
 * Carrega lista dinâmica de modelos disponíveis da API OpenAI e Gemini
 * Categoriza modelos por capacidade (chat, vision, embedding, audio, etc)
 */
async function loadDynamicModels(): Promise<Array<{ value: string; label: string; category?: string }>> {
  try {
    const formattedModels: Array<{ value: string; label: string; category?: string }> = [];

    // 1. GEMINI MODELS (Mais avançados - aparecem primeiro se disponíveis)
    if (isGeminiAvailable()) {
      const geminiModels = getAvailableVisionModels()
        .filter(m => m.provider === 'gemini')
        .map(m => ({
          value: m.id,
          label: `${m.name} [Gemini]`,
          category: m.tier === 'flagship' ? 'flagship' : 'vision',
        }));
      formattedModels.push(...geminiModels);
      console.log(`[MTF Catalog] ✅ ${geminiModels.length} modelos Gemini adicionados`);
    }

    // 2. OPENAI MODELS
    const modelsList = await openai.models.list();
    const models = modelsList.data || [];

    // Categorias de modelos OpenAI
    const categories: Record<string, Array<{ id: string; created?: number }>> = {
      vision: [],
      chat: [],
      reasoning: [],
      embedding: [],
      audio: [],
      image: [],
      other: [],
    };

    // Classificar modelos por categoria
    for (const model of models) {
      const id: string = model.id || '';

      // Vision models (suportam imagens)
      if (/gpt-4\.1|gpt-4o|gpt-5/i.test(id) && !/audio|embed|tts/i.test(id)) {
        categories.vision.push(model);
        continue;
      }

      // Reasoning models (série o1)
      if (/^o\d/i.test(id)) {
        categories.reasoning.push(model);
        continue;
      }

      // Embedding models
      if (/embedding/i.test(id)) {
        categories.embedding.push(model);
        continue;
      }

      // Audio models (Whisper, TTS)
      if (/whisper|tts|audio/i.test(id)) {
        categories.audio.push(model);
        continue;
      }

      // Image generation (DALL-E, gpt-image)
      if (/dall-e|gpt-image/i.test(id)) {
        categories.image.push(model);
        continue;
      }

      // Chat models (demais GPT)
      if (/gpt|chat/i.test(id)) {
        categories.chat.push(model);
        continue;
      }

      // Outros
      categories.other.push(model);
    }

    // Adicionar modelos OpenAI (Gemini já foi adicionado acima se disponível)

    // 3. Vision models OpenAI
    const visionModels = categories.vision
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map(m => ({
        value: m.id,
        label: `${m.id} (vision)`,
        category: 'vision',
      }));
    formattedModels.push(...visionModels);

    // 4. Chat models OpenAI
    const chatModels = categories.chat
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map(m => ({
        value: m.id,
        label: m.id,
        category: 'chat',
      }));
    formattedModels.push(...chatModels);

    // 5. Reasoning models OpenAI
    const reasoningModels = categories.reasoning
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map(m => ({
        value: m.id,
        label: `${m.id} (reasoning)`,
        category: 'reasoning',
      }));
    formattedModels.push(...reasoningModels);

    const geminiCount = isGeminiAvailable() ? getAvailableVisionModels().filter(m => m.provider === 'gemini').length : 0;
    console.log(`[MTF Catalog] ✅ ${formattedModels.length} modelos carregados`);
    console.log(`[MTF Catalog] 📊 Gemini: ${geminiCount}, Vision: ${visionModels.length}, Chat: ${chatModels.length}, Reasoning: ${reasoningModels.length}`);

    return formattedModels;
  } catch (error) {
    console.error('[MTF Catalog] ⚠️ Falha ao carregar modelos da API OpenAI, usando lista padrão:', error);
    return defaultModels;
  }
}

const structuredOutputExamples = [
  {
    id: 'router_decision',
    name: 'Router Decision (SocialWise Flow)',
    schemaType: 'json_schema',
    description: 'Schema base usado pelo SocialWise Flow para decidir entre INTENT e CHAT.',
    schema: JSON.stringify(
      {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['intent', 'chat'],
          },
          intent_payload: {
            type: 'string',
            pattern: '^(|@[a-z0-9_]+)$',
            default: '',
          },
          response_text: {
            type: 'string',
            minLength: 3,
            maxLength: 1024,
          },
          buttons: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  pattern: '^.{1,20}$',
                },
                payload: {
                  type: 'string',
                  pattern: '^(|@[a-z0-9_]{1,256})$',
                  default: '',
                },
              },
              required: ['title', 'payload'],
              additionalProperties: false,
            },
          },
        },
        required: ['mode', 'intent_payload', 'response_text', 'buttons'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
      null,
      2,
    ),
  },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const tools = Object.entries(RetrievalToolsSchema).map(([key, tool]) => ({
    key,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));

  // Carregar modelos dinamicamente da API OpenAI
  const models = await loadDynamicModels();

  return NextResponse.json({
    agentTypes: agentTypeCatalog,
    tools,
    models,
    structuredOutputExamples,
  });
}
