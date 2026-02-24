# AGENTS.md — Socialwise Chatwit

> **Universal Agent Instructions** — Compatible with Claude Code, Cursor, Copilot, Codex, Gemini CLI, and other AI coding agents.

## 🚨 Regras Arquiteturais Críticas (LEITURA OBRIGATÓRIA)

1. **SOCIALWISE = CÉREBRO | CHATWIT/CHATWOOT = CARTEIRO:** Em todas as mensagens, integrações, Flow e Flowbuilder, o Socialwise detém 100% da inteligência e processamento. O Chatwit é estritamente o "carteiro" (apenas entrega e recebe). Garanta essa separação estrutural em qualquer código gerado. O SOCIALWISE JAMAIS entrega, só processa e repassa para o CHATWIT via sync + async (solicitações do chatwit ponte aberta por 30 seg) ou async chatwit bot (quando mandamos flows de campanha etc., usamos o bot e seu token).
2. **RESTRIÇÃO DE APIs INTERNAS:** É terminantemente **PROIBIDO** fazer chamadas para APIs internas do Chatwit. As **ÚNICAS exceções permitidas** são chamadas para: **buscar, editar e criar templates oficiais**.
3. **Contrato Chatwit:** Se precisar que o Chatwit/Chatwoot modifique algo em sua estrutura, NÃO tente forçar via código. Documente a necessidade em `/home/wital/chatwitv4.10/chatwitdocs/chatwit-contrato-async-30s.md` para a equipe deles verificar.

## Dinâmica Socialwise ↔ Chatwit (Contrato via Documentação)

O Chatwit (fork Chatwoot v4.10) é mantido por uma **equipe separada**. Qualquer mudança no lado deles é feita via **contrato documentado**, não por gambiarras no código do Socialwise.

### Como funciona
1. **Identifique** que a solução ideal requer mudança no Chatwit (novo endpoint, novo branch, nova config)
2. **Documente** a necessidade em `/home/wital/chatwitv4.10/chatwitdocs/chatwit-contrato-async-30s.md` com: contexto, o que enviar, o que o Chatwit precisa implementar, código Ruby proposto, e complexidade estimada
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
`/home/wital/chatwitv4.10/chatwitdocs/chatwit-contrato-async-30s.md` — índice no topo, seções numeradas, changelog no final.

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
| State | SWR 2.3.6 |
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

## SWR 2.3.6 — Guia Compacto

**Arquitetura BFF:** O Backend For Frontend é a fonte única da UI. UI **lê** do BFF e **muta** a mesma SWR key. CRUD puro fica para serviços/integradores.

### Regras & Configuração

* **Fetcher global:** JSON + throw se `!res.ok`
* **SWRConfig:** `revalidateOnFocus:true`, `revalidateOnReconnect:true`, `revalidateIfStale:true`, `dedupingInterval:1500`
* **Listas:** `keepPreviousData:true` (sem flicker)
* **Tempo real:** `useSWRSubscription` (WS/SSE)

### Padrão de Mutation Optimistic

```typescript
await mutate(
  (async () => {
    const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Falha');
    const { data } = await r.json();
    return (curr: T[] = []) => /* merge data no array */;
  })(),
  {
    optimisticData: (curr: T[] = []) => /* UI imediata */,
    rollbackOnError: true,
    populateCache: (updater, curr) => (typeof updater === 'function' ? updater(curr) : curr),
    revalidate: false,
  }
);

```

### Checklist por Tela

* [ ] BFF como fonte única? Mesma SWR key leitura/mutate?
* [ ] `keepPreviousData:true`? Optimistic + rollback + `revalidate:false`?
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
* **Bug MTF "aparece→some→volta":** A UI lia do BFF e mutava direto no CRUD (keys diferentes). Solução aplicada: BFF como fonte única, mesma SWR key, bypass cache, optimistic + rollback.
* **Flow Engine vs Intents (Regressão):** NUNCA intercepte todas as mensagens no webhook. O pipeline de classificação (alias/embedding → bands) SEMPRE tem prioridade sobre o FlowOrchestrator default.
* **Bug 422 Template Rejection:** Resolvido ao migrar do formato customizado (`content_type: 'template'`) para o padrão nativo do Chatwit (`additional_attributes.template_params`). Ver `docs/HOTFIX-422-TEMPLATE.md`.
* **FOEC — Flash of Empty Content (SWR):** `data?.x || []` retorna `[]` enquanto `isLoading=true`, causando flash de "estado vazio" antes dos dados chegarem. **Fix:** sempre desestruturar `isLoading` do `useSWR` e renderizar skeleton quando `isLoading`. Se houver conflito de nome com estado local, usar alias: `isLoading: isLoadingXxx`. Adicionar `keepPreviousData: true` para evitar flash ao revalidar.

## Ferramentas de Debug (SSH MCP) 

A interface portainer (BFF/Proxy) é limitada. Use o **SSH MCP** como "fonte da verdade" para investigar estados do Swarm e logs extensos no host.

* Logs filtrados: `docker service logs <service_name> --tail 500 2>&1 | grep "keyword"` (`socialwise_app`, `socialwise_worker`)
* Status do host: `docker service ls`, `df -h`, `free -m`.

## MCP PORTAINER USAR Portainer [dockerProxy] 

USE FILTROS PQ OS LOGS NO SSH E DO PORTAINER SAO GRANDES
