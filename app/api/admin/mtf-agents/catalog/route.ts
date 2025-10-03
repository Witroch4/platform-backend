import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { AiAgentType } from '@prisma/client';
import { RetrievalToolsSchema } from '@/lib/ai-tools/retrieval-tools';
import { DEFAULT_MODELS } from '@/services/openai-components/types';

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

  return NextResponse.json({
    agentTypes: agentTypeCatalog,
    tools,
    models: defaultModels,
    structuredOutputExamples,
  });
}
