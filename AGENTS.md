# AGENTS.md — Socialwise Chatwit

Se eu pedir commit faça de tudo e push

## Flow Builder & Flow Engine — Mapa de Arquivos

**Área mais editada do projeto.** Leia esta seção antes de mexer em qualquer coisa de flow.

### Engine Core (`services/flow-engine/`)

| Arquivo | Export principal | Papel |
|---------|-----------------|-------|
| `flow-orchestrator.ts` | `FlowOrchestrator` | Entry-point do webhook — detecta `flow_` buttons, cria/resume `FlowSession`, delega pro Executor |
| `flow-executor.ts` | `FlowExecutor` | Executa nó a nó; harvest (coleta light nodes) até bater barreira → migra pra async |
| `sync-bridge.ts` | `SyncBridge` | Ponte sync de 30s — acumula 1 interactive payload pro HTTP response; após consumido, força async |
| `chatwit-delivery-service.ts` | `ChatwitDeliveryService` | Delivery async via API REST do Chatwit (texto, mídia, interactive, template) com retry 3x backoff |
| `variable-resolver.ts` | `VariableResolver` | Resolve `{{var}}` — chain: session → MTF → contact → system; suporta dot notation |
| `mtf-variable-loader.ts` | `loadMtfVariablesForInbox()` | Carrega variáveis MTF (normais + lotes) do Redis/DB pra injetar como session vars |
| `playground-collector.ts` | `initCollector()` / `drainCollector()` | Coleta payloads de delivery pra debug no Flow Playground |

### Conceitos-chave

- **Sync Bridge (ponte 30s):** Primeira mensagem interativa vai no HTTP response do webhook. Chatwit fecha a conexão. Tudo depois é async via `ChatwitDeliveryService`.
- **Harvest + Barreira:** Nós leves (TEXT, REACTION, INTERACTIVE) são coletados em sequência. Nós barreira (MEDIA, DELAY, WAIT_FOR_REPLY) forçam `syncConsumed = true` e continuam via BullMQ async.
- **Variáveis — chain de resolução:** 1) Session (wait_for_reply, payment_url) → 2) MTF Diamante (lote_ativo, valor_analise) → 3) Contact (name, phone) → 4) System (date, time).
- **`lote_ativo`** inclui cálculo automático de complemento (`valor_lote - valor_analise`). Fonte: `lib/mtf-diamante/variables-resolver.ts` → `formatarLoteAtivo()`.

### Flow Builder UI (`app/admin/mtf-diamante/components/flow-builder/`)

| Arquivo | Papel |
|---------|-------|
| `FlowCanvas.tsx` | Canvas ReactFlow — integra 10+ tipos de nó, edges, drag-drop, auto-layout |
| `context/FlowBuilderContext.tsx` | Estado global das variáveis (static + MTF + session) |
| `panels/NodeDetailDialog.tsx` | Editor full-screen por tipo de nó (texto, botões, template, etc.) |
| `panels/FlowSelector.tsx` | Lista de flows com create/delete/duplicate, filtro por inbox |
| `panels/ExportImportPanel.tsx` | Import/export JSON |
| `ui/FlowTextEditorDialog.tsx` | Editor de texto com preview e inserção de variáveis |
| `nodes/*.tsx` | Um componente por tipo: `TextMessageNode`, `InteractiveMessageNode`, `WhatsAppTemplateNode`, `MediaNode`, `DelayNode`, `WaitForReplyNode`, `ChatwitActionNode`, `GeneratePaymentLinkNode`, etc. |

### API Routes (`app/api/admin/mtf-diamante/`)

| Rota | Papel |
|------|-------|
| `flows/` GET, POST | Listar/criar flows |
| `flows/[flowId]/` GET, PUT, DELETE | CRUD de flow individual |
| `variaveis/` GET, POST | Variáveis MTF (normais + lotes computados) |
| `lote-ativo/` GET | Lote ativo formatado (fresh, sem cache) |

---

## Infra compartilhada local

- Rede Docker: `minha_rede`
- PostgreSQL compartilhado: host `postgres`, porta `5432`, imagem `pgvector/pgvector:pg17`
- Redis compartilhado: host `redis`, porta `6379`, imagem `redis:8.6.1`
- Compose da infra: `/home/wital/shared-infra/docker-compose.yml`
- Os scripts `dev.sh` devem reutilizar essa infra e subir `postgres`/`redis` apenas se ainda não estiverem ativos

## Regra para Docker Compose

- Não adicionar `version:` no topo de arquivos `docker-compose*.yml`/`docker-compose*.yaml`; esse campo está deprecated no Compose atual

> **Universal Agent Instructions** — Compatible with Claude Code, Cursor, Copilot, Codex, Gemini CLI, and other AI coding agents.
SERVIDOR DE PRODUÇÃO ssh -i ~/.ssh/keys/production-server.key root@49.13.155.94 "docker exec...
## 🚨 Regras Arquiteturais Críticas (LEITURA OBRIGATÓRIA)

1. **SOCIALWISE = CÉREBRO | CHATWIT/CHATWOOT = CARTEIRO:** Em todas as mensagens, integrações, Flow e Flowbuilder, o Socialwise detém 100% da inteligência e processamento. O Chatwit é estritamente o "carteiro" (apenas entrega e recebe). Garanta essa separação estrutural em qualquer código gerado. O SOCIALWISE JAMAIS entrega, só processa e repassa para o CHATWIT via sync + async (solicitações do chatwit ponte aberta por 30 seg) ou async chatwit bot (quando mandamos flows de campanha etc., usamos o bot e seu token).
2. **RESTRIÇÃO DE APIs INTERNAS:** É terminantemente **PROIBIDO** fazer chamadas para APIs internas do Chatwit. As **ÚNICAS exceções permitidas** são chamadas para: **buscar, editar e criar templates oficiais**.
3. **Contrato Chatwit:** Se precisar que o Chatwit/Chatwoot modifique algo em sua estrutura, NÃO tente forçar via código. Documente a necessidade em `/home/wital/chatwit/chatwitdocs/chatwit-contrato-async-30s.md` (symlink: `docs/chatwit-contrato-async-30s.md`) para a equipe deles verificar.

## Dinâmica Socialwise ↔ Chatwit (Contrato via Documentação)

O Chatwit (fork Chatwoot v4.10) é mantido por uma **equipe separada**. Qualquer mudança no lado deles é feita via **contrato documentado**, não por gambiarras no código do Socialwise.

### Como funciona
1. **Identifique** que a solução ideal requer mudança no Chatwit (novo endpoint, novo branch, nova config)
2. **Documente** a necessidade em `/home/wital/chatwit/chatwitdocs/chatwit-contrato-async-30s.md` (symlink: `docs/chatwit-contrato-async-30s.md`) com: contexto, o que enviar, o que o Chatwit precisa implementar, código Ruby proposto, e complexidade estimada
3. **Implemente o lado Socialwise** (endpoint receptor, fallback para ENV, workaround temporário se necessário)
4. A equipe Chatwit lê o contrato e implementa — geralmente em 24-48h

### Regras
- **NUNCA** faça workarounds complexos no Socialwise para contornar limitações do Chatwit. Se é simples pedir pra eles, peça.
- **Exemplos reais**: pedir para adicionar endpoints ao `BOT_ACCESSIBLE_ENDPOINTS` (2 linhas Ruby) é muito melhor do que usar user token como workaround; pedir para o Chatwit chamar um `/init` no startup (~15 linhas Ruby) é melhor do que inventar sincronização complexa.
- **Sempre inclua** código Ruby proposto no contrato — facilita a implementação e reduz ida e volta.
- O contrato tem versionamento (changelog) e índice de seções. Siga o padrão existente.

### Tokens e credenciais Chatwit
- **Agent Bot token** (global, `account_id=NULL`): persistido em `SystemConfig` via endpoint `/api/integrations/webhooks/socialwiseflow/init` (chamado pelo Chatwit no startup) + atualizado por cada webhook (fire-and-forget). Leitura via `getChatwitSystemConfig()` em `lib/chatwit/system-config.ts` (cache 5min, fallback ENV).
- **Base URL**: mesma dinâmica — `SystemConfig` → ENV → webhook metadata.
- **User token** (`UsuarioChatwit.chatwitAccessToken`): usado apenas para operações específicas do usuário, **nunca** para operações de sistema/campanha.

### Arquivo do contrato
`/home/wital/chatwit/chatwitdocs/chatwit-contrato-async-30s.md` (symlink: `docs/chatwit-contrato-async-30s.md`) — índice no topo, seções numeradas, changelog no final.

## Regras de Desenvolvimento e Código

* **Contexto:** Assuma que já está no root do projeto.
* **Validação (Pós-edição):** Rode sempre `pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p tsconfig.worker.json` após toda edição.
* **Idiomas:** Strings da UI devem ser em PT-BR (linguagem clara ). Código, variáveis e commits em Inglês.
* **UI/UX:** Use apenas Shadcn/UI Dialog (NUNCA use `confirm()` ou `alert()`). Prefira Optimistic UI updates. Garanta compatibilidade com Dark/Light theme do Shadcn. Toasts com `sonner` (`toast.promise`).
* **Feature Flags:** Nenhuma feature deve ter controle global direto — o acesso deve ser via `admin/features`.
* **MCPs:** * Use Context7 MCP proativamente para documentação de bibliotecas, geração de código e setup sem eu precisar pedir.
    * Antigravity MCP Config global está em `/home/wital/.gemini/antigravity/mcp_config.json`. Use-o para adicionar servers (como Context7) se não estiverem no `.mcp.json` do projeto.

## Migrations e Banco de Dados (OBRIGATÓRIO)

**NUNCA RODE `prisma db pull` e NUNCA USE `prisma db push` (nem em dev, nem em prod).** Eles apagam histórico, causam drift e destroem dados. Sempre commite a pasta `prisma/migrations/` junto com o `schema.prisma`.

```bash
pnpm exec prisma migrate dev --name descricao  # DEV: cria migration + aplica
pnpm exec prisma migrate deploy                # PROD: aplica migrations pendentes

```

* **Bug de sincronização:** Criou a migração e o Prisma não atualizou? **NÃO use db pull**. Delete a pasta `node_modules` e instale novamente com `pnpm` para ele reconhecer.
* **Drift em DEV:** Se `migrate dev` reportar drift, é aceitável resetar o banco de desenvolvimento:
```bash
pnpm exec prisma migrate reset --force       # DEV ONLY: apaga tudo e reaplica
pnpm exec prisma migrate dev --name descricao # Em seguida, cria a nova migration

```


**NUNCA use `migrate reset` em PROD.** Em prod, resolva drift manualmente.

### Backup & Restore (via SSH MCP)

* **leitura obrigatoria pra Backup & Restore (via SSH MCP)**/home/wital/Chatwit-Social-dev/docs/database-backup-restore.md
* **Backup (Prod):** ```bash
CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1) && docker exec (date +%Y%m%d).sql.gz
```

```


* **Restore (Dev):** ```bash
psql $DB_URL/postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='socialwise' AND pid<>pg_backend_pid();" && psql $DB_URL/postgres -c "DROP DATABASE IF EXISTS socialwise; CREATE DATABASE socialwise OWNER postgres;" && gunzip -c ~/backup.sql.gz | psql $DB_URL/socialwise
```
*(Arquivos ≤5MB: base64. Maiores: rclone → MinIO. Nunca restaure por cima — sempre drope/recrie).*


```



## Stack Tecnológica

| Camada | Tecnologia |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind, Shadcn/UI, Framer Motion |
| Backend | Next.js API Routes, Express.js, Prisma ORM |
| DB | PostgreSQL 17 + pgvector |
| Cache/Queue | Redis 7 + BullMQ |
| State | TanStack Query v5 (React Query) |
| Auth | NextAuth.js v5 + Prisma adapter |
| Storage | MinIO (S3-compatible) |
| Lint/Format | Biome, TypeScript strict |

## Patterns Obrigatórios

### Auth (todas as API routes protegidas)

```typescript
import { auth } from "@/auth";
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });

```

### Dynamic Routes (Next.js 16)

```typescript
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountid: string }> }) {
  const { accountid } = await params; // AWAIT obrigatório
}

```

### Proxy (antes middleware.ts)

```typescript
// proxy.ts - Next.js 16 renomeou middleware.ts para proxy.ts
export default async function proxy(req: any) {
  // lógica de roteamento/proteção
}

```

### Prisma: JSON null

```typescript
await prisma.model.update({ where: { id }, data: { jsonField: Prisma.JsonNull } });

```

## TanStack Query v5 (React Query) — Guia Compacto

**Arquitetura BFF:** O Backend For Frontend é a fonte única da UI. UI **lê** do BFF e **muta** a mesma query key. CRUD puro fica para serviços/integradores.

### Regras & Configuração

* **QueryClient global:** `staleTime: 30s`, `retry: 2`, `refetchOnWindowFocus: true`
* **Query keys:** Factory por domínio em `lib/query-keys.ts` — NUNCA inline
* **Listas:** `placeholderData: keepPreviousData` (sem flicker)
* **staleTime por volatilidade:** Referência 10min, Config 5min, Volátil 30s, Tempo real 0
* **Dados nullish:** Sempre `data ?? []` (NUNCA `data || []`)

### Padrão de Mutation Optimistic

```typescript
useMutation({
  mutationFn: entityApi.create,
  onMutate: async (payload) => {
    await queryClient.cancelQueries({ queryKey: entityKeys.lists() });
    const previous = queryClient.getQueryData<Entity[]>(entityKeys.lists());
    queryClient.setQueryData<Entity[]>(entityKeys.lists(), (curr = []) => [...curr, { id: `temp-${crypto.randomUUID()}`, ...payload } as Entity]);
    return { previous };
  },
  onError: (_err, _payload, ctx) => { if (ctx?.previous) queryClient.setQueryData(entityKeys.lists(), ctx.previous); toast.error("Erro"); },
  onSettled: () => { queryClient.invalidateQueries({ queryKey: entityKeys.lists() }); },
  onSuccess: () => { toast.success("Criado"); },
});
```

### Checklist por Tela

* [ ] BFF como fonte única? Mesma query key leitura/mutate?
* [ ] `placeholderData: keepPreviousData`? Optimistic + rollback?
* [ ] `onSettled` com `invalidateQueries` (SEMPRE, mesmo no sucesso)?
* [ ] Sem misturar CRUD puro na UI?

## Manipulação de Dados (MTF Diamante)

**Regra**: para edição, use os dados **originais** do provedor (`interactiveMessages` via `useMtfData()`), e **NUNCA** os normalizados (`mensagens`).

* **Preservar**: `content` (contém `genericPayload`, `action`). Verifique em 3 locais: `message.action.elements`, `message.content.action.elements` ou `message.content.genericPayload.elements`.
* **Red flags**: usar `msg.nome`/`msg.texto` (normalizados) para edição, perder `content` no `setEditingMessage`.

## Commands

```bash
# Dev
pnpm run dev | build | start | lint | lint-apply | format-apply
pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p tsconfig.worker.json

# DB
pnpm exec prisma migrate dev --name X  # ✅ criar migration
pnpm exec prisma migrate deploy        # ✅ produção
pnpm run db:generate | db:studio | db:reset:dev | db:seed | db:seed-prices

# Workers
pnpm run start:worker | worker | start:ai-worker | build:workers

# Test
pnpm test | test:unit | test:integration | test:e2e | test:performance

# Docker
docker compose build | up | down

```

## Estrutura do Projeto

* `/app/api/`: Endpoints (admin, integrações, webhooks, chatwitia).
* `/app/admin/`: Dashboards administrativos (Capitão, MTF Diamante, queue-management, leads).
* `/lib/`: Lógica core (ai-integration, socialwise-flow, cost, monitoring, queue, webhook, whatsapp).
* `/worker/`: Background jobs (webhook, automação, ai-integration, queues).
* `/services/flow-engine/`: ⭐ **Flow Engine (deadline-first)**.
* `/docs/`: ⭐ Docs técnicas de features (roadmap Flow Builder, contrato Chatwit, filas). **Consulte antes de alterar o Flow.**
* `/.agents/skills/`: Skills do Vercel Agent (boas práticas de React e UI design).

## SocialWise Flow Pipeline (v3.4+)

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│  WEBHOOK (/api/integrations/webhooks/socialwiseflow)                            │
│  Auth → Validation → Deduplication → Rate Limit                                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────┴──────────────────────────────────────────┐
│  BUTTON INTERACTION DETECTION                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  buttonId.startsWith('flow_')?                                                  │
│  ├─ YES → FlowOrchestrator.handle() → Resume FlowSession (WAITING_INPUT)        │
│  └─ NO  → Legacy Button Reaction Check (MapeamentoBotao lookup)                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────┴──────────────────────────────────────────┐
│  VERCEL AI SDK PIPELINE: classify → gating → router (Single-shot)               │
├─────────────────────────────────────────────────────────────────────────────────┤
│  HARD (Score ≥0.80): Direct intent mapping (<120ms)                             │
│  ROUTER (Score <0.80): Full LLM routing (400ms timeout)                         │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────┴──────────────────────────────────────────┐
│  INTENT RESOLUTION: buildWhatsAppByIntentRaw()                                  │
│  ├─ MapeamentoIntencao.flowId exists + active?                                  │
│  │  └─ YES → Execute FlowOrchestrator (O CÉREBRO)                               │
│  └─ NO  → Return template/interactive message ao Chatwit (O CARTEIRO)           │
└─────────────────────────────────────────────────────────────────────────────────┘

```

* **Vercel AI SDK:** Migrado para execução linear e single-shot usando `generateObject` com `mode: "json"`. Provedores: `gemini-2.0-flash` ou `claude-3-5-sonnet`.
* **Anti-Loop Protocol:** Router LLM filtra hints de intents já ativos para evitar repetição de menus.
* **Flow Engine:** Arquitetura deadline-first. Sincroniza até o deadline (28s). Se ultrapassar, migra para async (delivery via API do Chatwit) e não volta para sync.
* **Flow Builder Queue:** O nó `CHATWIT_ACTION` (resolve, assign, label) é assíncrono e processado na fila `flow-builder-queues` (BullMQ/Redis) garantindo: retrys com exponential backoff, persistência e execução não-bloqueante.

## Business Logic & Security

* **Segurança:** Payload máx: 256KB | XSS/injection sanitization | Zod validation | Rate limiting (per-session, per-account, burst) | Replay protection (nonce + timestamp + dedup).
* **Leads (Legal):** Unificação docs, análise jurídica IA, batch processing, LGPD.
* **Cost:** Event → idempotency → pricing → cálculo → DB → audit.

## Code Conventions & Env Vars

| Tipo | Formato | Exemplo |
| --- | --- | --- |
| Components | PascalCase | `UserProfile.tsx` |
| Pages | kebab-case | `user-settings/page.tsx` |
| Utilities | camelCase | `formatDate.ts` |
| API Routes | `route.ts` | Sempre |
| Types | PascalCase `.ts` | `FlowEngine.ts` |

**Imports:** 1) externos → 2) `@/` internos → 3) relativos.

**Env Vars Necessárias:** `DATABASE_URL | REDIS_URL | NEXTAUTH_SECRET | OPENAI_API_KEY`

## Key Insights / Histórico de Bugs

* **Bugs de foco/input React:** keys instáveis, IDs que mudam entre renders, refs que quebram igualdade → mantenha a identidade dos elementos estável.
* **Bug MTF "aparece→some→volta":** A UI lia do BFF e mutava direto no CRUD (keys diferentes). Solução aplicada: BFF como fonte única, mesma query key, bypass cache, optimistic + rollback.
* **Flow Engine vs Intents (Regressão):** NUNCA intercepte todas as mensagens no webhook. O pipeline de classificação (alias/embedding → bands) SEMPRE tem prioridade sobre o FlowOrchestrator default.
* **Bug 422 Template Rejection:** Resolvido ao migrar do formato customizado (`content_type: 'template'`) para o padrão nativo do Chatwit (`additional_attributes.template_params`). Ver `docs/HOTFIX-422-TEMPLATE.md`.
* **FOEC — Flash of Empty Content:** `data?.x || []` retorna `[]` enquanto `isLoading=true`, causando flash de "estado vazio" antes dos dados chegarem. **Fix:** sempre desestruturar `isLoading` do `useQuery` e renderizar skeleton quando `isLoading`. Se houver conflito de nome com estado local, usar alias: `isLoading: isLoadingXxx`. Adicionar `placeholderData: keepPreviousData` para evitar flash ao revalidar.

## Ferramentas de Debug (SSH MCP) 

A interface portainer (BFF/Proxy) é limitada. Use o **SSH MCP** como "fonte da verdade" para investigar estados do Swarm e logs extensos no host.

* Logs filtrados: `docker service logs <service_name> --tail 500 2>&1 | grep "keyword"` (`socialwise_app`, `socialwise_worker`)
* Status do host: `docker service ls`, `df -h`, `free -m`.

**SSH MCP vs SSH direto no terminal:** Prefira **SSH MCP** quando o agente precisa raciocinar sobre o output (o resultado chega limpo como string, sem quebra de linha por TTY). Use **SSH direto** (`ssh -i id_rsa.v3 root@49.13.155.94 "cmd"`) para comandos simples onde você quer ver o output puro no shell — ambos chegam ao mesmo resultado.

## MCP PORTAINER USAR Portainer [dockerProxy] 

USE FILTROS PQ OS LOGS NO SSH E DO PORTAINER SAO GRANDES
