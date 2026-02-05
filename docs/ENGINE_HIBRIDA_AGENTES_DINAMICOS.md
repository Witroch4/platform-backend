# Engine Híbrida e Agentes Dinâmicos

## Visão Geral

A **Engine Híbrida** é uma arquitetura que separa a inteligência comportamental (Persona/Blueprint no banco de dados) da inteligência técnica (Engine/Código). Isso permite que administradores configurem agentes de IA via interface gráfica enquanto o sistema injeta automaticamente instruções técnicas específicas do modelo quando necessário.

### Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HYBRID ENGINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │  BLUEPRINT (DB)      │     │  ENGINE (CODE)                   │  │
│  │  ─────────────────   │     │  ─────────────────────────────   │  │
│  │  • Nome do Agente    │     │  • Instruções Técnicas Gemini    │  │
│  │  • Persona/Papel     │     │  • Code Execution Config         │  │
│  │  • System Prompt     │     │  • Thinking Level Config         │  │
│  │  • Modelo Preferido  │     │  • Tool Injection                │  │
│  │  • linkedColumn      │     │  • Provider-Specific Logic       │  │
│  │  • defaultProvider   │     │  • Retry/Fallback Strategies     │  │
│  └──────────────────────┘     └──────────────────────────────────┘  │
│           │                              │                           │
│           └──────────────┬───────────────┘                           │
│                          ▼                                           │
│              ┌─────────────────────┐                                 │
│              │  MERGED PROMPT      │                                 │
│              │  ─────────────────  │                                 │
│              │  [Técnico] + [Persona]                                │
│              └─────────────────────┘                                 │
│                          │                                           │
│                          ▼                                           │
│              ┌─────────────────────┐                                 │
│              │  UNIFIED VISION     │                                 │
│              │  CLIENT             │                                 │
│              │  ─────────────────  │                                 │
│              │  OpenAI ◀──▶ Gemini │                                 │
│              └─────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. LinkedColumn (Enum Prisma)

Vincula um agente a uma coluna específica da tabela de avaliação OAB:

```prisma
enum LinkedColumn {
  PROVA_CELL    // Transcrição de provas manuscritas
  ESPELHO_CELL  // Extração de dados do espelho de correção
  ANALISE_CELL  // Análise comparativa (futuro)
  RECURSO_CELL  // Geração de recursos (futuro)
}
```

### 2. AiProvider (Enum Prisma)

Define o provedor de IA padrão do agente:

```prisma
enum AiProvider {
  OPENAI  // GPT-4.1, GPT-5, etc
  GEMINI  // Gemini 3 Flash/Pro
}
```

### 3. AiAgentBlueprint (Model Prisma)

```prisma
model AiAgentBlueprint {
  id              String         @id @default(cuid())
  ownerId         String
  name            String
  description     String?
  agentType       AiAgentType    @default(CUSTOM)
  model           String
  systemPrompt    String?        @db.Text
  instructions    String?        @db.Text

  // Engine Híbrida
  linkedColumn    LinkedColumn?  // Coluna da tabela que este agente executa
  defaultProvider AiProvider?    // Provedor padrão (OPENAI ou GEMINI)

  // ... outros campos
  @@index([linkedColumn])
}
```

## Fluxo de Execução

### 1. Busca de Blueprint por Coluna

```typescript
import { getAgentBlueprintByLinkedColumn } from "@/lib/ai-agents/blueprints";

// Busca o agente vinculado à coluna PROVA_CELL
const blueprint = await getAgentBlueprintByLinkedColumn('PROVA_CELL');
```

### 2. Injeção de Instruções Técnicas

Quando o modelo selecionado é Gemini, o sistema injeta automaticamente instruções técnicas para Agentic Vision:

```typescript
import { isGeminiModel, GEMINI_AGENTIC_VISION_INSTRUCTIONS } from "@/lib/ai-agents/blueprints";

if (isGeminiModel(model)) {
  systemInstructions = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemInstructions}`;
}
```

### 3. Processamento com Unified Vision Client

```typescript
import { processVisionRequest } from "./unified-vision-client";

const response = await processVisionRequest({
  model,
  systemInstructions,
  userPrompt,
  imageBase64,
  maxOutputTokens,
  enableCodeExecution: isGeminiModel(model),  // Habilita para Gemini
  thinkingLevel: 'high',                       // Máximo raciocínio
});
```

## Gemini 3 Agentic Vision

### O que é?

Gemini 3 Flash/Pro possui capacidades de "Agentic Vision" - pode executar código Python para manipular imagens durante a análise. Isso é crucial para OCR de manuscritos onde a caligrafia pode ser difícil de ler.

### Capacidades

1. **Code Execution**: Executa scripts Python para crop/zoom de regiões específicas
2. **Thinking Mode**: Raciocínio estruturado em níveis (minimal, low, medium, high)
3. **Think-Act-Observe Loop**: Ciclo de investigação para regiões duvidosas

### Configuração

```typescript
// unified-vision-client.ts

// Habilitar code execution
const tools: Array<Record<string, unknown>> = [];
if (enableCodeExecution || isGemini3Model(model)) {
  tools.push({ codeExecution: {} });
}

// Configurar thinking level
const thinkingConfig = isGemini3Model(model) ? {
  thinkingConfig: {
    includeThoughts: false,
    thinkingLevel: thinkingLevel ?? 'high',
  },
} : {};
```

### Níveis de Raciocínio (Thinking Level)

**IMPORTANTE**: Para Gemini 3 e GPT-5+, a **temperatura deve ser sempre 1** (recomendação oficial). Valores abaixo de 1 podem causar loops ou degradação em tarefas de raciocínio.

#### Gemini 3 Flash

| Nível | Descrição | Uso Recomendado |
|-------|-----------|-----------------|
| `high` | Máximo raciocínio (padrão) | Tarefas complexas, análise profunda |
| `medium` | Balanceado | Maioria das tarefas |
| `low` | Raciocínio leve | Chat, instruções simples |
| `minimal` | Quase sem thinking | Máxima velocidade, tarefas triviais |

#### Gemini 3 Pro

| Nível | Descrição |
|-------|-----------|
| `high` | Máximo raciocínio (padrão) |
| `low` | Raciocínio leve |

#### OpenAI GPT-5+

| Nível | Descrição | Modelos |
|-------|-----------|---------|
| `high` | Máximo raciocínio | Todos GPT-5+ |
| `medium` | Balanceado (padrão pré-5.1) | GPT-5, GPT-5.1, GPT-5.2 |
| `low` | Raciocínio leve | GPT-5, GPT-5.1, GPT-5.2 |
| `none` | Sem raciocínio (padrão 5.1+) | GPT-5.1+ |
| `xhigh` | Extra alto | Modelos após gpt-5.1-codex-max |

**Nota**: GPT-5 Pro usa raciocínio fixo em `high`.

### Instruções Técnicas Injetadas

```
[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI 3 AGENTIC VISION]

Fase de Visão Ativa:
- Você TEM acesso à execução de código Python via a ferramenta 'code_execution'.
- É OBRIGATÓRIO: Se houver trechos de caligrafia ilegível, borrada ou duvidosa, você DEVE gerar e executar um script Python para:
  1. Recortar (crop) a área específica da imagem
  2. Aplicar zoom na região problemática
  3. Reanalisar com maior resolução
- Não tente adivinhar sem investigar. Use a ferramenta de execução de código para manipular a imagem.
- Para cada região duvidosa, execute o loop: Pensar → Agir (crop/zoom) → Observar → Decidir

Comportamento do "Escrivão":
1. Fase de Visão: Identifique todas as regiões de texto
2. Fase de Investigação: Para regiões difíceis, use code_execution para zoom
3. Fase de Transcrição: Transcreva 100% Ipsis Litteris - se o aluno errou, mantenha o erro
4. Fase de Verificação: Revise a transcrição final

IMPORTANTE: A precisão é mais importante que a velocidade. Investigue cada caractere duvidoso.
```

## Agentes Nativos (Blueprints de Sistema)

### OAB — Transcritor de Provas

- **linkedColumn**: `PROVA_CELL`
- **defaultProvider**: `GEMINI`
- **model**: `gemini-3-flash-preview`
- **Persona**: "O ESCRIVÃO" - transcreve provas manuscritas com 100% de fidelidade

### OAB — Extrator de Espelho

- **linkedColumn**: `ESPELHO_CELL`
- **defaultProvider**: `GEMINI`
- **model**: `gemini-3-flash-preview`
- **Função**: Extrai dados estruturados do espelho de correção

### Seed de Agentes Nativos

```bash
# Executar seed para criar blueprints nativos
pnpm exec ts-node scripts/seed-native-agents.ts
```

## Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| `prisma/schema.prisma` | Enums LinkedColumn, AiProvider e model AiAgentBlueprint |
| `lib/ai-agents/blueprints.ts` | Service de blueprints com busca por coluna vinculada |
| `lib/oab-eval/unified-vision-client.ts` | Cliente unificado OpenAI/Gemini com Agentic Vision |
| `lib/oab-eval/transcription-agent.ts` | Agente de transcrição (PROVA_CELL) |
| `lib/oab-eval/mirror-generator-agent.ts` | Agente de extração de espelho (ESPELHO_CELL) |
| `scripts/seed-native-agents.ts` | Seed de blueprints nativos do sistema |

## Modelos de Vision Suportados

### Gemini (Recomendado para OCR)

| Modelo | Descrição |
|--------|-----------|
| `gemini-3-flash-preview` | Agentic Vision com code execution (zoom/crop automático) |
| `gemini-3-pro-preview` | Mais avançado, melhor para código e raciocínio |
| `gemini-2.5-pro` | Pro com thinking nativo |
| `gemini-2.5-flash` | Flash com thinking |

### OpenAI

| Modelo | Descrição |
|--------|-----------|
| `gpt-4.1` | Melhor OpenAI para visão |
| `gpt-4.1-mini` | Balanceado custo/qualidade |
| `gpt-4o` | Multimodal avançado |

## Configuração de Ambiente

```bash
# Gemini API (recomendado para OCR de manuscritos)
GEMINI_API_KEY=your_gemini_api_key
# ou
GOOGLE_AI_API_KEY=your_google_ai_api_key

# OpenAI API (fallback)
OPENAI_API_KEY=your_openai_api_key

# IDs de Blueprint (opcional - sistema busca por linkedColumn)
OAB_TRANSCRIBER_BLUEPRINT_ID=cuid_do_blueprint_transcritor
OAB_MIRROR_EXTRACTOR_BLUEPRINT_ID=cuid_do_blueprint_espelho
```

## Migrações

### Criar Migration

```bash
pnpm exec prisma migrate dev --name add_linked_column_and_provider
```

### Aplicar Migration em Produção

```bash
pnpm exec prisma migrate deploy
```

### Regenerar Client

```bash
pnpm exec prisma generate
```

## Uso Programático

### Buscar Blueprint por Coluna

```typescript
import { getAgentBlueprintByLinkedColumn } from "@/lib/ai-agents/blueprints";

const transcriberBlueprint = await getAgentBlueprintByLinkedColumn('PROVA_CELL');
const mirrorBlueprint = await getAgentBlueprintByLinkedColumn('ESPELHO_CELL');
```

### Listar Blueprints de uma Coluna

```typescript
import { listAgentBlueprintsForColumn } from "@/lib/ai-agents/blueprints";

const transcribers = await listAgentBlueprintsForColumn('PROVA_CELL');
```

### Verificar se é Modelo Gemini

```typescript
import { isGeminiModel } from "@/lib/ai-agents/blueprints";

if (isGeminiModel(blueprint.model)) {
  // Habilitar features específicas do Gemini
}
```

## Diagrama de Sequência: Transcrição de Prova

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────────┐
│ ProvaCell│     │TranscriptionAgent│  │ blueprints.ts│    │UnifiedVisionClient│
└────┬────┘     └──────┬───────┘     └──────┬──────┘     └───────┬────────┘
     │                  │                    │                    │
     │ transcribe()     │                    │                    │
     │─────────────────>│                    │                    │
     │                  │                    │                    │
     │                  │ getAgentBlueprintByLinkedColumn('PROVA_CELL')
     │                  │───────────────────>│                    │
     │                  │                    │                    │
     │                  │<───────────────────│                    │
     │                  │   blueprint        │                    │
     │                  │                    │                    │
     │                  │ isGeminiModel()?   │                    │
     │                  │───────────────────>│                    │
     │                  │<───────────────────│                    │
     │                  │   true             │                    │
     │                  │                    │                    │
     │                  │ [Injeta GEMINI_AGENTIC_VISION_INSTRUCTIONS]
     │                  │                    │                    │
     │                  │ processVisionRequest(config)            │
     │                  │────────────────────────────────────────>│
     │                  │                    │                    │
     │                  │                    │    [Gemini 3 com   │
     │                  │                    │    code_execution] │
     │                  │                    │                    │
     │                  │<────────────────────────────────────────│
     │                  │   VisionResponse   │                    │
     │                  │                    │                    │
     │<─────────────────│                    │                    │
     │  transcription   │                    │                    │
```

## Troubleshooting

### Erro: LinkedColumn não encontrado no Prisma Client

```bash
# Regenerar o client após migration
pnpm exec prisma generate
```

### Erro: Gemini API não configurada

Verifique se uma das variáveis está definida:
- `GEMINI_API_KEY`
- `GOOGLE_AI_API_KEY`

### Erro: Blueprint não encontrado para coluna

O sistema tem fallbacks:
1. Busca por `linkedColumn` diretamente
2. Busca por `metadata.role` (ex: 'transcriber')
3. Busca por padrões de nome (ex: 'Transcrição', 'Transcritor')
4. Usa configuração padrão hardcoded

### Logs de Debug

```typescript
// transcription-agent.ts
console.log('[TranscriptionAgent] 📝 Configuração do Blueprint:');
console.log(`  - Modelo: ${model}`);
console.log(`  - Max Output Tokens: ${maxOutputTokens}`);
console.log(`  - Code Execution: ${enableCodeExecution ? '✅ Habilitado' : '❌ Desabilitado'}`);
console.log(`  - Thinking Level: ${thinkingLevel}`);
```

### Erro: 503 "The model is overloaded" (Gemini)

O erro 503 pode ocorrer mesmo com billing ativado porque modelos preview têm capacidade globalmente limitada.

**Solução implementada**: Retry automático + Fallback para OpenAI

## Retry e Fallback Automático

### Arquitetura de Resiliência

O sistema implementa retry automático com exponential backoff e fallback para OpenAI quando o Gemini falha:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RETRY + FALLBACK ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐ │
│  │   REQUEST    │────>│   GEMINI     │────>│ SUCCESS                  │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────┘ │
│                              │                                           │
│                        503/429/500?                                      │
│                              │                                           │
│                              ▼                                           │
│                    ┌─────────────────┐                                   │
│                    │ RETRY (4x)      │                                   │
│                    │ 2s → 4s → 8s →  │                                   │
│                    │     16s         │                                   │
│                    └─────────────────┘                                   │
│                              │                                           │
│                        Still failing?                                    │
│                              │                                           │
│                              ▼                                           │
│                    ┌─────────────────┐     ┌──────────────────────────┐ │
│                    │ CLEAN PROMPT    │────>│ FALLBACK: gpt-4.1        │ │
│                    │ Remove Gemini   │     │ (OpenAI)                 │ │
│                    │ instructions    │     └──────────────────────────┘ │
│                    └─────────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Configuração

```typescript
// lib/oab-eval/unified-vision-client.ts

/** Status codes que devem ser retried (erros temporários) */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Número máximo de retries antes de fallback */
const MAX_RETRIES = 4;

/** Delay base em ms (exponential backoff: 2s, 4s, 8s, 16s) */
const BASE_DELAY_MS = 2000;

/** Modelo OpenAI usado como fallback quando Gemini falha */
const OPENAI_FALLBACK_MODEL = 'gpt-4.1';
```

### Limpeza de Prompt para Fallback

**CRÍTICO**: Ao fazer fallback para OpenAI, o sistema remove instruções específicas do Gemini para não confundir o GPT:

```typescript
function cleanPromptForOpenAI(systemInstructions: string): string {
  // Remove bloco completo de instruções técnicas do Gemini Agentic Vision
  let cleaned = systemInstructions.replace(
    /\[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI.*?---\s*/s,
    ''
  );

  // Remove referências específicas que podem confundir o GPT
  cleaned = cleaned
    .replace(/code_execution/gi, '')
    .replace(/execução de código Python/gi, '')
    .replace(/ferramenta 'code_ex[^']*'/gi, '')
    .replace(/Gemini 3 Agentic Vision/gi, '')
    .replace(/GEMINI_AGENTIC_VISION/gi, '')
    .trim();

  return cleaned;
}
```

### Logs de Retry e Fallback

```
[UnifiedVision] ⚠️ Gemini falhou (503), retry 1/4 em 2000ms
[UnifiedVision] ⚠️ Gemini falhou (503), retry 2/4 em 4000ms
[UnifiedVision] ⚠️ Gemini falhou (503), retry 3/4 em 8000ms
[UnifiedVision] ⚠️ Gemini falhou (503), retry 4/4 em 16000ms
[UnifiedVision] 🔄 Gemini falhou após 4 retries (503), usando fallback OpenAI (gpt-4.1)
[UnifiedVision] 🧹 Prompt limpo para OpenAI (removidas instruções Gemini-específicas)
[TranscriptionAgent] ⚠️ Pág 3/8 usou fallback OpenAI (prompt limpo)
```

### Por que o Erro 503 Ocorre?

Mesmo com billing ativado, o erro 503 "model overloaded" pode ocorrer porque:

1. **Modelos preview** (`gemini-3-flash-preview`) têm capacidade globalmente limitada
2. **Picos de uso** causam throttling temporário
3. **Quota por projeto** pode ter limites diferentes do tier gratuito

A solução com retry (4x até 16s) + fallback para GPT-4.1 (com prompt limpo) garante que o processamento complete independente da disponibilidade do Gemini.

## Deduplicação de Jobs

### Problema

Se o usuário clicar múltiplas vezes no botão de transcrição ou se houver retry no frontend, múltiplos jobs podem ser criados para o mesmo lead, causando processamento duplicado.

### Solução Implementada

Antes de criar um novo job, o sistema verifica se já existe um job ativo ou pendente para o mesmo lead:

```typescript
// lib/oab-eval/transcription-queue.ts

export async function enqueueTranscription(data: TranscriptionJobData): Promise<Job<TranscriptionJobData>> {
  // DEDUPLICAÇÃO: Verificar se já existe um job ativo ou pendente
  const existingJobs = await transcriptionQueue.getJobs(['waiting', 'active', 'delayed']);
  const activeJob = existingJobs.find((j) => j.data.leadID === data.leadID);

  if (activeJob) {
    console.log(`[TranscriptionQueue] ⚠️ Job já existe para lead ${data.leadID} - ignorando duplicata`);
    return activeJob; // Retorna o job existente ao invés de criar um novo
  }

  // Criar novo job apenas se não existir um ativo
  const job = await transcriptionQueue.add('transcribe', data, { ... });
  return job;
}
```

### Log de Deduplicação

```
[TranscriptionQueue] ⚠️ Job já existe para lead cml6gmh3g006wo501vutlxfwt (transcribe-cml6gmh3g006wo501vutlxfwt-1770212711044, estado: active) - ignorando duplicata
```

### Estados Verificados

- `waiting` - Job aguardando na fila
- `active` - Job em processamento
- `delayed` - Job atrasado aguardando retry

Jobs nos estados `completed` e `failed` **não bloqueiam** novos jobs, permitindo reprocessamento quando necessário.

## Interface do Usuário

### 1. Switch de Provedor nas Colunas (leads-chatwit)

Na página `/admin/leads-chatwit`, as colunas **Prova** e **Espelho** possuem um switch visual para alternar entre Gemini e GPT:

```
┌─────────────────────────────────────────────────────────┐
│ Lead     │ ... │ Prova  [🔵]  │ Espelho [🔵]  │ ...    │
│          │     │ ◀─ Gemini    │ ◀─ Gemini     │        │
└─────────────────────────────────────────────────────────┘
```

**Arquivo**: `app/admin/leads-chatwit/components/provider-switch.tsx`

**Funcionalidades**:
- Toggle visual com logos do GPT e Gemini
- Persistência no localStorage por coluna
- Tooltip explicativo
- Hook `useColumnProvider()` para componentes consumirem a preferência
- Função `getColumnProvider()` para uso fora do React

**Uso no código**:
```typescript
import { useColumnProvider, getColumnProvider } from './provider-switch';

// Em componentes React
const provider = useColumnProvider('PROVA_CELL', 'GEMINI');

// Fora do React
const provider = getColumnProvider('ESPELHO_CELL', 'GEMINI');
```

### 2. Configuração de Agente (MTF Agents Builder)

Na página `/admin/MTFdashboard/agentes`, ao editar um agente, há uma seção "Engine Híbrida" com:

1. **Coluna Vinculada**: Define qual coluna da tabela OAB este agente executa
   - 📝 Prova (Transcrição) → `PROVA_CELL`
   - 📋 Espelho (Extração) → `ESPELHO_CELL`
   - 🔍 Análise (Comparação) → `ANALISE_CELL`
   - 📄 Recurso (Geração) → `RECURSO_CELL`

2. **Provedor Padrão**: Define qual IA usar por padrão
   - Gemini (Visão Agêntica) → `GEMINI`
   - OpenAI GPT → `OPENAI`

**Arquivo**: `app/admin/MTFdashboard/components/canvas/AgentNodeDialog.tsx`

```
┌──────────────────────────────────────────────────────────┐
│                    Engine Híbrida                         │
├──────────────────────────────────────────────────────────┤
│  Coluna Vinculada          │  Provedor Padrão            │
│  [📝 Prova (Transcrição) ▼]│  [🔵 Gemini (Visão...) ▼]  │
├──────────────────────────────────────────────────────────┤
│ ℹ️ Este agente será executado automaticamente quando     │
│ a coluna for acionada. Instruções técnicas do Gemini     │
│ Agentic Vision serão injetadas automaticamente.          │
└──────────────────────────────────────────────────────────┘
```

## APIs de Agentes (MTF Agents)

### Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/mtf-agents` | Lista todos os blueprints do usuário |
| GET | `/api/admin/mtf-agents?id=xxx` | Busca um blueprint específico |
| POST | `/api/admin/mtf-agents` | Cria um novo blueprint |
| PATCH | `/api/admin/mtf-agents/[id]` | Atualiza um blueprint existente |
| DELETE | `/api/admin/mtf-agents/[id]` | Remove um blueprint |

### Payload de Criação/Atualização

```typescript
interface AgentBlueprintPayload {
  name: string;                    // Nome do agente (obrigatório)
  description?: string;            // Descrição opcional
  agentType: AiAgentType;          // TOOLS | OPENAI_FUNCTIONS | PLAN_AND_EXECUTE | REACT | CUSTOM
  icon?: string;                   // Emoji ou URL do ícone
  model: string;                   // Ex: gemini-3-flash-preview, gpt-4.1
  temperature?: number;            // 0-2 (Gemini: 1, OpenAI: 0.1)
  topP?: number;                   // Top P sampling
  maxOutputTokens?: number;        // 0 = ilimitado
  systemPrompt?: string;           // Prompt do sistema
  instructions?: string;           // Instruções adicionais
  toolset?: AgentToolConfig[];     // Ferramentas habilitadas
  outputParser?: OutputParserConfig; // Configuração de saída estruturada
  memory?: Record<string, unknown>; // Configuração de memória
  canvasState?: AgentCanvasState;  // Estado do canvas visual
  metadata?: Record<string, unknown>; // Metadados customizados

  // Engine Híbrida
  linkedColumn?: LinkedColumn;     // PROVA_CELL | ESPELHO_CELL | ANALISE_CELL | RECURSO_CELL
  defaultProvider?: AiProvider;    // OPENAI | GEMINI
}
```

### Exemplo de Requisição

```bash
# Criar agente vinculado à coluna PROVA_CELL
curl -X POST /api/admin/mtf-agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Transcritor OAB",
    "model": "gemini-3-flash-preview",
    "agentType": "CUSTOM",
    "systemPrompt": "Você é O ESCRIVÃO...",
    "linkedColumn": "PROVA_CELL",
    "defaultProvider": "GEMINI"
  }'

# Atualizar coluna vinculada
curl -X PATCH /api/admin/mtf-agents/[id] \
  -H "Content-Type: application/json" \
  -d '{
    "linkedColumn": "ESPELHO_CELL"
  }'

# Remover vinculação (usar valor especial "_none" ou null)
curl -X PATCH /api/admin/mtf-agents/[id] \
  -H "Content-Type: application/json" \
  -d '{
    "linkedColumn": "_none"
  }'
```

### Arquivos das APIs

| Arquivo | Descrição |
|---------|-----------|
| `app/api/admin/mtf-agents/route.ts` | GET (lista/busca) e POST (criação) |
| `app/api/admin/mtf-agents/[id]/route.ts` | PATCH (atualização) e DELETE (remoção) |
| `lib/ai-agents/blueprints.ts` | Service com funções de CRUD e busca por coluna |

### Funções de Coerção

As APIs utilizam funções de coerção para validar os enums:

```typescript
// Converte string para LinkedColumn ou null
function coerceLinkedColumn(value: unknown): LinkedColumn | null {
  if (value === null || value === undefined || value === '_none') return null;
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase() as keyof typeof LinkedColumn;
  if (upper in LinkedColumn) {
    return LinkedColumn[upper];
  }
  return null;
}

// Converte string para AiProvider ou null
function coerceAiProvider(value: unknown): AiProvider | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase() as keyof typeof AiProvider;
  if (upper in AiProvider) {
    return AiProvider[upper];
  }
  return null;
}
```

## Processamento Interno de Espelho (ESPELHO_CELL)

### Visão Geral

O sistema processa automaticamente o espelho do aluno usando o agente blueprint vinculado à coluna `ESPELHO_CELL`. Este fluxo é **interno** (não depende de sistema externo) e utiliza a Engine Híbrida para buscar o blueprint configurado no MTF Agents Builder.

### Habilitação

O processamento interno é **habilitado por padrão**. Para desabilitar (usar sistema externo legado):

```bash
# .env
USE_INTERNAL_MIRROR_AGENT=false
```

### Diagrama de Sequência

```
┌─────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐
│ EspelhoCell │   │ enviar-manuscrito │  │ mirror-queue │   │ MirrorWorker   │   │ mirror-agent    │
│ (Frontend)  │   │ (API Route)       │  │ (BullMQ)     │   │ (Background)   │   │ (Engine Híbrida)│
└──────┬──────┘   └────────┬──────────┘  └──────┬───────┘   └───────┬────────┘   └────────┬────────┘
       │                   │                     │                   │                     │
       │ POST /enviar-     │                     │                   │                     │
       │ manuscrito        │                     │                   │                     │
       │ {espelho: true,   │                     │                   │                     │
       │  arquivos_imagens │                     │                   │                     │
       │  _espelho: [...]} │                     │                   │                     │
       │──────────────────>│                     │                   │                     │
       │                   │                     │                   │                     │
       │                   │ USE_INTERNAL_       │                   │                     │
       │                   │ MIRROR_AGENT=true?  │                   │                     │
       │                   │         │           │                   │                     │
       │                   │         ▼           │                   │                     │
       │                   │ Buscar lead (        │                   │                     │
       │                   │ especialidade,      │                   │                     │
       │                   │ espelhoPadraoId)    │                   │                     │
       │                   │         │           │                   │                     │
       │                   │         ▼           │                   │                     │
       │                   │ UPDATE lead SET     │                   │                     │
       │                   │ aguardandoEspelho=  │                   │                     │
       │                   │ true                │                   │                     │
       │                   │         │           │                   │                     │
       │                   │         ▼           │                   │                     │
       │                   │ enqueueMirror       │                   │                     │
       │                   │ Generation()        │                   │                     │
       │                   │────────────────────>│                   │                     │
       │                   │                     │                   │                     │
       │                   │                     │ Job criado        │                     │
       │<──────────────────│                     │ (oab-mirror-      │                     │
       │ {success: true,   │                     │  generation)      │                     │
       │  mode: "internal",│                     │                   │                     │
       │  jobId: "..."}    │                     │                   │                     │
       │                   │                     │                   │                     │
       │                   │                     │ Worker processa   │                     │
       │                   │                     │──────────────────>│                     │
       │                   │                     │                   │                     │
       │                   │                     │                   │ generateMirror      │
       │                   │                     │                   │ Locally()           │
       │                   │                     │                   │────────────────────>│
       │                   │                     │                   │                     │
       │                   │                     │                   │                     │ getAgentBlueprint
       │                   │                     │                   │                     │ ByLinkedColumn
       │                   │                     │                   │                     │ ('ESPELHO_CELL')
       │                   │                     │                   │                     │
       │                   │                     │                   │                     │ Buscar OabRubric
       │                   │                     │                   │                     │ (espelho padrão)
       │                   │                     │                   │                     │
       │                   │                     │                   │                     │ processVision
       │                   │                     │                   │                     │ Request()
       │                   │                     │                   │                     │ [Gemini/OpenAI]
       │                   │                     │                   │                     │
       │                   │                     │                   │<────────────────────│
       │                   │                     │                   │  Extracted JSON     │
       │                   │                     │                   │                     │
       │                   │                     │                   │ POST /api/admin/    │
       │                   │                     │                   │ leads-chatwit/      │
       │                   │                     │                   │ webhook             │
       │                   │                     │                   │ (espelhoLocal       │
       │                   │                     │                   │  Processado: true)  │
       │                   │                     │                   │                     │
       │                   │                     │                   │                     │
       │ SSE: lead.espelho │                     │                   │                     │
       │ Processado=true   │                     │                   │                     │
       │<══════════════════╪═════════════════════╪═══════════════════│                     │
       │                   │                     │                   │                     │
```

### Arquivos Envolvidos

| Arquivo | Função |
|---------|--------|
| `app/admin/leads-chatwit/enviar-manuscrito/route.ts` | API que detecta `espelho: true` e enfileira job |
| `lib/oab-eval/mirror-queue.ts` | Fila BullMQ `oab-mirror-generation` |
| `worker/WebhookWorkerTasks/mirror-generation.task.ts` | Worker que processa jobs da fila |
| `lib/oab-eval/mirror-generator-agent.ts` | Agente que extrai dados usando blueprint |
| `lib/ai-agents/blueprints.ts` | Busca blueprint por `linkedColumn` |
| `lib/oab-eval/unified-vision-client.ts` | Cliente unificado Gemini/OpenAI |

### Fluxo Detalhado

#### 1. Frontend Envia Espelho

```typescript
// useLeadHandlers.ts - handleEnviarEspelho()
const payload = {
  leadID: lead.id,
  espelho: true,  // ← Flag que ativa processamento de espelho
  arquivos_imagens_espelho: images.map((url, index) => ({
    id: `${lead.id}-espelho-${index}`,
    url: url,
    nome: `Espelho ${index + 1}`
  })),
  espelhoPadraoId: lead.espelhoPadraoId,  // ← ID da rubrica padrão (OabRubric)
};

await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
  method: "POST",
  body: JSON.stringify(payload)
});
```

#### 2. API Detecta e Enfileira

```typescript
// enviar-manuscrito/route.ts
if (isEspelho && USE_INTERNAL_MIRROR_AGENT && leadId) {
  // 1. Buscar especialidade do lead
  const lead = await prisma.leadOabData.findUnique({
    where: { id: leadId },
    select: { especialidade: true, espelhoPadraoId: true }
  });

  // 2. Marcar lead como aguardando
  await prisma.leadOabData.update({
    where: { id: leadId },
    data: { aguardandoEspelho: true }
  });

  // 3. Enfileirar job
  const job = await enqueueMirrorGeneration({
    leadId,
    especialidade: lead.especialidade,
    espelhoPadraoId: lead.espelhoPadraoId,
    images: imagensEspelho,
  });

  return NextResponse.json({
    success: true,
    mode: "internal",
    jobId: job.id,
  });
}
```

#### 3. Worker Processa com Blueprint

```typescript
// mirror-generation.task.ts
export async function processMirrorGenerationTask(job: Job<MirrorGenerationJobData>) {
  const { leadId, especialidade, espelhoPadraoId, images } = job.data;

  // Chama agente que usa blueprint vinculado a ESPELHO_CELL
  const result = await generateMirrorLocally({
    leadId,
    especialidade,
    espelhoPadraoId,
    images,
  });

  // Notifica webhook interno com resultado
  await notifyWebhook({
    leadID: leadId,
    espelhoLocalProcessado: true,
    success: true,
    markdownMirror: result.markdownMirror,
    jsonMirror: result.jsonMirror,
  });
}
```

#### 4. Agente Busca Blueprint e Processa

```typescript
// mirror-generator-agent.ts
export async function getMirrorExtractorConfig() {
  // Buscar blueprint vinculado à coluna ESPELHO_CELL
  const blueprint = await getAgentBlueprintByLinkedColumn('ESPELHO_CELL');

  if (blueprint) {
    const model = blueprint.model || 'gpt-4.1';
    let systemPrompt = blueprint.systemPrompt || DEFAULT_MIRROR_PROMPT;

    // Se for Gemini, injetar instruções de Agentic Vision
    if (isGeminiModel(model)) {
      systemPrompt = `${GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n${systemPrompt}`;
    }

    return { model, systemPrompt, maxOutputTokens: blueprint.maxOutputTokens };
  }

  // Fallback para configuração padrão
  return { model: 'gpt-4.1', systemPrompt: DEFAULT_MIRROR_PROMPT };
}
```

### Configuração do Blueprint (MTF Agents Builder)

Para configurar o agente de extração de espelho:

1. Acesse `/admin/MTFdashboard/agentes`
2. Crie ou edite um agente
3. Na aba **Parâmetros**, configure:
   - **Nome**: "OAB — Extrator de Espelho" (ou outro nome descritivo)
   - **Tipo**: Custom Agent
   - **Vinculação com Lead Chatwit > Coluna da Tabela**: `📋 Espelho (Transcrição de manuscritos)`
4. Na aba **Modelo**, configure:
   - **Modelo**: `gemini-3-flash-preview` (recomendado) ou `gpt-4.1`
   - **Temperature**: 0 (para máxima precisão)
   - **Max Tokens**: 5000
5. Na aba **Saída**, configure o schema JSON esperado (opcional)
6. Clique em **Salvar Blueprint**

### Prompt do Agente de Espelho

O prompt deve instruir o agente a:

1. Receber a imagem do espelho de correção do aluno
2. Receber o texto padrão da rubrica (espelhoPadraoTexto)
3. Identificar todas as variáveis no formato `{nome_da_variavel}`
4. Extrair os valores correspondentes da imagem
5. Retornar um JSON estruturado

Exemplo de prompt:

```xml
<agent>
  <task>Extração de Variáveis de Imagem para Preenchimento de JSON</task>
  <language>pt-BR</language>

  <description>
    Sua função é extrair dados de uma imagem de espelho de correção OAB
    e mapear para as variáveis do modelo padrão.
  </description>

  <instructions>
    1. Analise o espelhoPadraoTexto para identificar todas as variáveis {nome_variavel}
    2. Vasculhe a imagem para encontrar cada valor
    3. Se não encontrar, use "[não-visivel]"
    4. Retorne APENAS o JSON estruturado
  </instructions>

  <outputFormat>
    {
      "json": {
        "nome_do_examinando": "...",
        "nota_final": "...",
        ...
      }
    }
  </outputFormat>
</agent>
```

### Variáveis de Ambiente

```bash
# Habilitar/desabilitar processamento interno (padrão: true)
USE_INTERNAL_MIRROR_AGENT=true

# Configuração da fila (oab-config.yml)
mirror_concurrency: 5
queue:
  job_timeout: 300000  # 5 minutos
  retry_attempts: 2
```

### Logs de Monitoramento

```bash
# API
[Enviar Espelho] 🔄 Usando agente INTERNO (Engine Híbrida)
[Enviar Espelho] 📋 Lead: cml6gmh3g006wo501vutlxfwt
[Enviar Espelho] 📋 Especialidade: Direito Penal
[Enviar Espelho] 📋 Espelho Padrão ID: cuid_do_rubric
[Enviar Espelho] 🖼️ Imagens: 2
[Enviar Espelho] ✅ Job mirror-cml6gmh3g006wo501vutlxfwt-1234567890 enfileirado

# Worker
[MirrorWorker] 🔄 Iniciando processamento do job mirror-xxx-123
[MirrorWorker] 📋 Lead: xxx, Especialidade: Direito Penal
[MirrorWorker] 🤖 Chamando agente local para lead xxx...
[MirrorWorker] 📋 Usando espelho padrão: cuid_do_rubric
[MirrorWorker] ✅ Espelho gerado com sucesso em 12.5s
[MirrorWorker] 📊 Aluno: João Silva, Nota: 6.50
[MirrorWorker] 📤 Notificando webhook com resultado
```

### Troubleshooting

#### Erro: "Especialidade não definida para o lead"

O lead precisa ter uma especialidade definida. Verifique se:
1. O lead tem o campo `especialidade` preenchido
2. Ou passe a especialidade no payload

#### Erro: "Blueprint não encontrado para ESPELHO_CELL"

1. Crie um blueprint no MTF Agents Builder
2. Vincule à coluna "Espelho" na aba Parâmetros
3. Ou execute o seed: `pnpm exec ts-node scripts/seed-native-agents.ts`

#### Job não é processado

Verifique se o worker está rodando:
```bash
pnpm run start:worker
```

## Referências

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini Code Execution](https://ai.google.dev/gemini-api/docs/code-execution)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [BullMQ Documentation](https://docs.bullmq.io/)
