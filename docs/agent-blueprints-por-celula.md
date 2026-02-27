# Agent Blueprints por Célula — Mapa Completo

> **Engine Híbrida:** cada célula da tabela de Leads busca seu agente em 3 camadas:
> 1. Blueprint com `linkedColumn` correspondente no DB (editável via **Admin → MTF Agents Builder**)
> 2. Fallback por ID de ENV var ou nome no DB
> 3. Defaults hardcoded no código

---

## PROVA_CELL — Transcritor de Manuscritos

| Campo | Valor |
|---|---|
| **Arquivo** | `lib/oab-eval/transcription-agent.ts` |
| **Função** | `getTranscriberConfig()` → `transcribeManuscriptLocally()` |
| **Acionado por** | Upload de imagens da prova manuscrita do aluno |
| **Seed nativo** | `OAB — Transcritor de Provas (Blueprint)` — criado automaticamente ao abrir `/admin/MTFdashboard/agentes` |
| **Modelo padrão** | `OAB_EVAL_VISION_MODEL` env → `gpt-4.1` |
| **Thinking padrão** | `high` (hardcoded, ignorado se não Gemini) |

### Cadeia de fallback (resolução)
1. Blueprint `linkedColumn = PROVA_CELL` + `defaultProvider` (se provider selecionado)
2. Qualquer blueprint `linkedColumn = PROVA_CELL`
3. Blueprint por `OAB_TRANSCRIBER_BLUEPRINT_ID` (env) ou nome contendo `Transcrição`/`OAB`
4. `AiAssistant` por `OAB_TRANSCRIBER_ASSISTANT_ID` (env) ou nome
5. Defaults abaixo

### System Prompt padrão (fallback hardcoded)
```
Você é um assistente jurídico especializado em transcrever provas manuscritas com o máximo de fidelidade.
Regras obrigatórias:
1. Nunca invente ou corrija informações. Quando algo estiver ilegível, escreva '[ilegível]'.
2. Transcreva linha a linha mantendo a ordem original e numere como 'Linha X: ...'.
3. Preserve títulos, numeração de questões, palavras sublinhadas ou destacados quando claros.
4. Se identificar que o texto é da peça processual, use o prefixo 'Peça Pagina:'.
5. Para respostas das questões, inicie com 'Questão: <número>'.
6. Sempre inclua a seção 'Resposta do Aluno:' logo após o cabeçalho.
7. Pode retornar múltiplos blocos caso a página tenha mais de uma questão.
8. Não faça qualquer análise ou resumo; apenas digite exatamente o texto identificável.
```

### Injeção automática (Gemini 3 only)
Quando o modelo for Gemini, `GEMINI_AGENTIC_VISION_INSTRUCTIONS` é **pré-pendado** ao system prompt (definido em `lib/ai-agents/blueprints.ts:330`). Instrui o modelo a usar `code_execution` para crop/zoom em regiões ilegíveis.

### User message (por página)
```
Transcreva a página X de Y. Formato obrigatório:
Questão: <número> (quando aplicável) OU Peça Pagina: <número/total se visível>
Resposta do Aluno:
Linha 1: ...
(continue até o fim da página).
```

---

## ESPELHO_CELL — Extrator de Espelho de Correção

| Campo | Valor |
|---|---|
| **Arquivo** | `lib/oab-eval/mirror-generator-agent.ts` |
| **Função** | `getMirrorExtractorConfig()` → `generateMirrorLocally()` |
| **Acionado por** | Upload de imagens do espelho de correção da OAB |
| **Seed nativo** | `OAB — Extrator de Espelho (Blueprint)` — criado automaticamente |
| **Modelo padrão** | `OAB_MIRROR_VISION_MODEL` env → `gpt-4.1` |
| **Provider efetivo** | Se `selectedProvider` não informado, default é `GEMINI` |

### Cadeia de fallback (resolução)
1. Blueprint `linkedColumn = ESPELHO_CELL` (com provider switch se necessário)
2. Blueprint por `OAB_MIRROR_EXTRACTOR_BLUEPRINT_ID` (env) ou nome contendo `Espelho`/`Mirror`/`Extrator`
3. Defaults abaixo

### System Prompt padrão (fallback hardcoded)
```
Você é um assistente especializado em extrair dados de espelhos de correção da OAB.
Sua tarefa é identificar e extrair com precisão:
1. Dados do candidato: nome, inscrição, nota final, situação (APROVADO/REPROVADO)
2. Notas de cada item avaliado (formato: PECA-01A, Q1-01A, etc.)
3. Totais parciais: pontuação da peça, pontuação das questões
IMPORTANTE:
- Retorne APENAS um objeto JSON válido
- Quando um dado não estiver visível, use '[não-visivel]'
- Para notas, use formato numérico com 2 casas decimais (ex: '0.65', '1.25')
- IDs dos itens devem manter o formato exato da rubrica
```

### Injeção automática (Gemini 3 only)
`GEMINI_AGENTIC_VISION_INSTRUCTIONS` pré-pendado apenas para modelos `gemini-3*`. Gemini 2.5 não recebe (não tem code execution compatível).

### User message (dinâmica)
Construída em runtime a partir dos IDs da rubrica carregada do DB. Solicita extração de:
- Dados do candidato (nome, inscrição, nota, situação)
- `nota_total_<ID>` + `fonte_nota_total_<ID>` + `coluna_nota_total_<ID>` por grupo da rubrica
- `total_questao_Q1..Q4` + fonte + coluna

---

## ANALISE_CELL — Analista Comparativo (Prova × Espelho)

| Campo | Valor |
|---|---|
| **Arquivo** | `lib/oab-eval/analysis-agent.ts` |
| **Função** | `getAnalyzerConfig()` |
| **Acionado por** | Botão "Gerar Análise" na tabela de Leads / worker `analysis-generation.task.ts` |
| **Seed nativo** | ❌ Nenhum — configurar manualmente no MTF Agents Builder |
| **Modelo padrão** | `gpt-5.2` (OPENAI) / `gemini-2.5-flash` (GEMINI) |
| **Feature flag** | `BLUEPRINT_ANALISE=true` (se false/ausente → fluxo externo n8n) |

### Cadeia de fallback (resolução)
1. Blueprint `linkedColumn = ANALISE_CELL`
2. Blueprint por `OAB_ANALYZER_BLUEPRINT_ID` (env) ou nome contendo `Análise`/`Analyzer`
3. Defaults abaixo

### System Prompt — Arquitetura em 2 camadas

O prompt do blueprint é **sempre precedido** por `ANALYSIS_REINFORCEMENT_PROMPT` (camada interna imutável):

```
[REFORÇO INTERNO DO SISTEMA — OBRIGATÓRIO]

Você é um ANALISTA JURÍDICO ESPECIALIZADO em provas da OAB (2ª Fase).
Sua missão: comparar "TEXTO DA PROVA" × "ESPELHO DA PROVA" e identificar acertos
do examinando que NÃO foram pontuados pela banca.

REGRAS ABSOLUTAS (sobrescrevem qualquer instrução conflitante):
1. OTIMISMO FUNDAMENTADO: A banca frequentemente erra. Analise com viés favorável
   ao examinando, mas NUNCA invente pontos inexistentes.
2. APENAS ACERTOS EXISTENTES: Aponte somente o que o aluno de FATO escreveu e não
   foi contabilizado. Cite sempre "Linhas XX-YY".
3. PROIBIDO SUGERIR MELHORIAS: O examinando NÃO pode reescrever a prova.
4. PROIBIDO ULTRAPASSAR TETO: Nunca atribua mais pontos do que o máximo previsto.
5. VERIFICAR DUPLA PONTUAÇÃO: Confirme que o aluno ainda NÃO recebeu a pontuação.
6. SAÍDA EXCLUSIVAMENTE JSON: Resposta DEVE começar com { e terminar com }.
7. ANÁLISE COMPLETA: Analise SEMPRE Peça + TODAS as Questões.
8. nota_maxima_peca = 5.00 e nota_maxima_questoes = 5.00, total máximo = 10.00.

[... seguido do prompt do blueprint se configurado ...]
```

### Output schema (hardcoded)
```json
{
  "exameDescricao": "string",
  "inscricao": "string",
  "nomeExaminando": "string",
  "seccional": "string",
  "areaJuridica": "string",
  "notaFinal": "string",
  "situacao": "string",
  "pontosPeca": [{ "titulo": "string", "descricao": "Linhas XX-YY...", "valor": "+0,XX" }],
  "subtotalPeca": "+X,XX pontos.",
  "pontosQuestoes": [{ "titulo": "string", "descricao": "Linhas XX-YY...", "valor": "+0,XX" }],
  "subtotalQuestoes": "+X,XX pontos.",
  "conclusao": "string",
  "argumentacao": ["string"]
}
```

---

## RECURSO_CELL — Gerador de Recurso

| Campo | Valor |
|---|---|
| **Arquivo** | `lib/oab-eval/recurso-generator-agent.ts` |
| **Função** | `getRecursoConfig()` |
| **Acionado por** | Botão "Gerar Recurso" na tabela de Leads |
| **Seed nativo** | ❌ Nenhum — configurar manualmente no MTF Agents Builder |
| **Modelo padrão** | `gpt-5.2` (OPENAI) / `gemini-2.5-flash` (GEMINI) / `claude-3-5-sonnet-latest` (CLAUDE) |
| **Temperatura padrão** | `0.3` (um pouco de criatividade para escrita) |
| **Variáveis de template** | `{analise_validada}`, `{modelo_recurso}`, `{nome}` — substituídas em runtime |

### Cadeia de fallback (resolução)
1. Blueprint `linkedColumn = RECURSO_CELL` (modelo override por `selectedProvider` se necessário)
2. Defaults abaixo

### System Prompt padrão (DEFAULT_RECURSO_PROMPT — XML style)
```xml
<agent>
  <name>RedatorJuridicoRecursosOAB</name>
  <task>
    Atuar como ASSISTENTE JURÍDICO focado em REDAÇÃO DE RECURSOS para o exame da OAB.
    Você receberá uma "Análise do Especialista" e formatará o recurso completo.
    NÃO crie novos argumentos — transponha a argumentação da análise para linguagem
    persuasiva, técnica e respeitosa exigida pelas bancas examinadoras.
  </task>
  <rules>
    1. ESTRITAMENTE FIEL À ANÁLISE: NÃO inclua fatos novos não constantes na análise.
    2. ESTRUTURA DO MODELO: Siga RIGOROSAMENTE a estrutura dada no "Formato de Saída".
    3. OBJETIVO ÚNICO: Pedir majoração da nota com base no que foi analisado.
    4. ANONIMATO: NUNCA identifique o aluno por nome. Use "O Examinando", "O Candidato".
    5. DADOS EVIDENCIADOS: Cite expressamente as linhas (ex: linhas 10-12) e transcreva
       o trecho exato entre aspas.
  </rules>
  <instructions>
    1. Cabeçalho: "Senhores Examinadores da Banca Recursal,"
    2. Seção PEÇA: subtítulo <u>**PEÇA**</u>, um parágrafo por quesito
    3. Seção QUESTÕES: subtítulo <u>**QUESTÕES**</u>, subtítulo por questão
    4. Formatação: Markdown com <u>**negrito+sublinhado**</u> para destaques críticos
  </instructions>
  <!-- Inclui exemplo completo de saída esperada -->
</agent>
```

### Output schema
**Dinâmico** — definido pelo campo `outputParser.schema` do blueprint no DB.
Sem blueprint configurado, usa schema mínimo `{ texto_recurso: string }`.

---

## ESPELHO_PADRAO_CELL — Extrator de Gabarito (Padrão de Resposta)

| Campo | Valor |
|---|---|
| **Arquivo** | `lib/oab-eval/rubric-from-pdf.ts` |
| **Função** | `resolveBlueprintConfig()` → `buildRubricFromPdfVision()` / `buildRubricFromPdfLLM()` |
| **Acionado por** | Upload de PDF do Padrão de Resposta OAB com opção "Via IA (Visão)" |
| **Seed nativo** | ❌ Nenhum — configurar manualmente no MTF Agents Builder |
| **Modelo padrão** | `OAB_EVAL_RUBRIC_MODEL` env → `gpt-4.1` |
| **Max tokens padrão** | `80000` |

### Cadeia de fallback (resolução)
1. Blueprint `linkedColumn = ESPELHO_PADRAO_CELL`
2. Defaults abaixo

### System Prompt padrão (`DEFAULT_SYSTEM_PROMPT` — linha 415)
```
Você é um parser especializado em extrair quesitos da Distribuição dos Pontos de
provas prático-profissionais da OAB (FGV). Você receberá o conteúdo do Padrão de
Resposta em texto transcrito ou em imagens do PDF. Responda APENAS com JSON válido
seguindo todas instruções.
```

### User messages (hardcoded — NÃO vêm do blueprint)

**Modo Imagem** (`VISION_RUBRIC_PROMPT` — linha 684):
> Analise as imagens do PDF + regras para extrair quesitos PEÇA e Q1-Q4 + JSON schema de saída

**Modo Texto** (`LLM_PROMPT_TEMPLATE` — linha 461):
> Texto transcrito do PDF + mesmas regras + JSON schema de saída

### Parser determinístico (linha 91)
Antes de chamar a IA, tenta `parseSimpleDeterministic()`. Se extrair ≥ 10 quesitos, retorna direto sem LLM.
- Override via `OAB_EVAL_FORCE_DETERMINISTIC=1` → nunca chama LLM
- Override via `options.forceAI=true` → pula parser, vai direto para LLM

---

## Resumo Geral

| Célula | Arquivo agente | Seed automático | ENV vars relevantes |
|---|---|---|---|
| `PROVA_CELL` | `transcription-agent.ts` | ✅ "OAB — Transcritor de Provas" | `OAB_EVAL_VISION_MODEL`, `OAB_TRANSCRIBER_BLUEPRINT_ID`, `OAB_TRANSCRIBER_ASSISTANT_ID` |
| `ESPELHO_CELL` | `mirror-generator-agent.ts` | ✅ "OAB — Extrator de Espelho" | `OAB_MIRROR_VISION_MODEL`, `OAB_MIRROR_EXTRACTOR_BLUEPRINT_ID` |
| `ANALISE_CELL` | `analysis-agent.ts` | ❌ Manual | `OAB_ANALYZER_BLUEPRINT_ID`, `BLUEPRINT_ANALISE` |
| `RECURSO_CELL` | `recurso-generator-agent.ts` | ❌ Manual | — |
| `ESPELHO_PADRAO_CELL` | `rubric-from-pdf.ts` | ❌ Manual | `OAB_EVAL_RUBRIC_MODEL`, `OAB_EVAL_FORCE_DETERMINISTIC` |

### Injeção `GEMINI_AGENTIC_VISION_INSTRUCTIONS`

Definido em `lib/ai-agents/blueprints.ts:330`. Injetado automaticamente **pré-pendado** ao system prompt quando:
- `PROVA_CELL`: qualquer modelo Gemini
- `ESPELHO_CELL`: apenas modelos `gemini-3*`
- `ESPELHO_PADRAO_CELL`: não injetado (usa Vercel AI SDK diretamente)
- `ANALISE_CELL` / `RECURSO_CELL`: não injetado (não são agentes de visão)

### Prioridade de provider switch

Todos os agentes de visão (`PROVA_CELL`, `ESPELHO_CELL`) respeitam `selectedProvider` vindo do frontend (toggle OpenAI/Gemini na UI). Se o blueprint está configurado para um provider mas o usuário selecionou outro, o modelo é trocado para o default do provider selecionado.
