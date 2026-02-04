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

## Referências

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini Code Execution](https://ai.google.dev/gemini-api/docs/code-execution)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
