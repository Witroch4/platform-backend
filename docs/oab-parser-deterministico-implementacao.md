# Parser OAB Gabarito Determinístico - Documentação Completa

### Todos os Arquivos Envolvidos

#### 📁 Core Parser (`lib/oab/`)
```
lib/oab/gabarito-parser-deterministico.ts    # Parser principal com heurísticas
  ├─ parseGabaritoDeterministico()          # Entry point
  ├─ parseLinhasItens()                      # Extração de itens/pesos
  ├─ splitPorOU()                            # Divisão de alternativas
  ├─ verificarPontuacao()                    # Validação 5+5=10
  └─ atomizarItem()                          # Quebra itens multi-peso

lib/oab/pdf-exemplos-gabaritos/               # 7 PDFs de teste
  ├─ DIREITO CIVIL.pdf                       # ✅ 10.0/10.0
  ├─ DIREITO CONSTITUCIONAL.pdf              # ✅ 10.0/10.0
  ├─ DIREITO DO TRABALHO.pdf                 # ✅ 10.0/10.0
  ├─ DIREITO EMPRESARIAL.pdf                 # ✅ 10.0/10.0
  ├─ DIREITO PENAL.pdf                       # ✅ 10.0/10.0
  ├─ DIREITO TRIBUTÁRIO.pdf                  # ✅ 10.0/10.0
  └─ direito ADM.pdf                         # ✅ 10.0/10.0
```

#### 📁 OAB Eval System (`lib/oab-eval/`)
```
lib/oab-eval/rubric-from-pdf.ts              # Coordenador principal
  ├─ buildRubricFromPdf()                    # Decisão determinístico vs LLM
  ├─ extractTextFromPdf()                    # Extração PDF → texto
  ├─ convertDeterministicToPayload()         # GabaritoAtomico → RubricPayload
  ├─ shouldFallback()                        # Critérios de fallback
  └─ buildRubricFromPdfLLM()                 # Fallback LLM (GPT-4o)

lib/oab-eval/types.ts                         # Tipos TypeScript
lib/oab-eval/repository.ts                    # Prisma CRUD
lib/oab-eval/openai-client.ts                 # OpenAI wrapper
lib/oab-eval/evaluator.ts                     # Avaliação de respostas
lib/oab-eval/chunker.ts                       # Chunking de textos
lib/oab-eval/text-extraction.ts               # Extração de texto
```

#### 📁 API Endpoints (`app/api/oab-eval/`)
```
app/api/oab-eval/rubric/upload/route.ts       # POST single PDF
app/api/oab-eval/rubric/batch-upload/route.ts # POST múltiplos PDFs (com logs)
  ├─ Recalcula verificarPontuacao()
  ├─ Logs detalhados por PDF
  └─ Tabela resumo final

app/api/oab-eval/rubric/route.ts              # GET rubrics
app/api/oab-eval/evaluate/route.ts            # POST avaliação
app/api/oab-eval/submission/route.ts          # POST submissão
app/api/oab-eval/validate-pdfs/route.ts       # POST validação
app/api/oab-eval/load-examples/route.ts       # GET exemplos
outros:

app/admin/MTFdashboard/mtf-oab/oab-eval/page.tsx
components/ai-elements/prompt-input.tsx
lib/oab-eval/rubric-from-pdf.ts
lib/socialwise-flow/graph/nodes/react-agent.ts
        app/admin/MTFdashboard/agentes/
        app/admin/MTFdashboard/components/
        app/admin/MTFdashboard/hooks/
        app/admin/MTFdashboard/mtf-oab/data.json
        app/admin/MTFdashboard/mtf-oab/oab-eval/image.png
        app/admin/MTFdashboard/mtf-oab/page.tsx
        app/admin/MTFdashboard/page.tsx
        app/admin/MTFdashboard/types.ts
        app/api/admin/mtf-agents/
        app/api/oab-eval/
        lib/ai-agents/
        lib/oab-eval/chunker.ts
        lib/oab-eval/evaluator.ts
        lib/oab-eval/graph/
        lib/oab-eval/openai-client.ts
        lib/oab-eval/repository.ts
        lib/oab-eval/text-extraction.ts
        lib/oab-eval/types.ts
        lib/oab
```

#### 📁 Frontend (`app/admin/MTFdashboard/mtf-oab/`)
```
app/admin/MTFdashboard/mtf-oab/oab-eval/page.tsx  # UI de upload/avaliação
```

#### 📁 Database (`prisma/`)
```
prisma/schema.prisma                          # Models: Rubric, Submission
prisma/migrations/20250927131128_add_oab_eval_models/
  └─ migration.sql                            # Tabelas OAB eval
```

#### 📁 Testes (`./`)
```
test_batch_oab_pdfs.ts                        # Batch test com tabela visual
test_single_pdf.ts                            # Test individual com debug
test_batch_simple.ts                          # Test simplificado
```

#### 📁 Documentação (`docs/`)
```
docs/oab-parser-deterministico-implementacao.md  # Esta documentação completa
docs/oab-eval-final-test.md                      # Resultados de testes
CLAUDE.md                                        # Guia geral do projeto
```

#### 📁 Debug Scripts (`./`)
```
debug-grupos-ou.js                            # Debug grupos OU
debug-item3.js                                # Debug item específico
debug-pdf-completo.js                         # Debug PDF completo
debug-peso-detalhado.js                       # Debug extração de pesos
debug-secoes.js                               # Debug seções
debug-soma-peca.js                            # Debug soma PEÇA
debug_oab_scoring.js                          # Debug scoring geral
```

#### 📁 Tipos (`types/`)
```
types/pdf-parse.d.ts                          # Type definitions para pdf-parse
```

### Estrutura de Dependências

```
User Upload
    ↓
API Route (batch-upload)
    ↓
buildRubricFromPdf (rubric-from-pdf.ts)
    ↓
parseGabaritoDeterministico (gabarito-parser-deterministico.ts)
    ├─ extractTextFromPdf
    ├─ parseLinhasItens
    ├─ splitPorOU
    ├─ atomizarItem
    └─ verificarPontuacao
    ↓
convertDeterministicToPayload
    ↓
createRubric (repository.ts)
    ↓
PostgreSQL (Prisma)
```

### Como Usar

```bash
# 1. Teste batch completo
export OAB_EVAL_FORCE_DETERMINISTIC=1
npx tsx test_batch_oab_pdfs.ts

# 2. Teste single PDF
npx tsx test_single_pdf.ts "DIREITO CIVIL.pdf"

# 3. Upload via API
curl -X POST http://localhost:3000/api/oab-eval/rubric/batch-upload \
  -F "files=@gabarito1.pdf" \
  -F "files=@gabarito2.pdf"
```

### Variáveis de Ambiente

```bash
OAB_EVAL_FORCE_DETERMINISTIC=1  # Força parser determinístico (sem LLM)
DEBUG_GABARITO=0                # 0=scoring preciso, 1=debug verbose
OAB_EVAL_RUBRIC_MODEL=gpt-4o    # Modelo LLM fallback (padrão: gpt-4o)
```

### Métricas Finais

| Métrica | Valor |
|---------|-------|
| PDFs testados | 7 |
| Taxa de sucesso | 100% |
| Pontuação média | 10.0/10.0 |
| Tempo médio | 150ms |
| Custo por PDF | $0 |
| Linhas de código | ~1800 (parser) |
| Commits para perfeição | 5 correções |

---

**Autores:** Wital + Claude Code
