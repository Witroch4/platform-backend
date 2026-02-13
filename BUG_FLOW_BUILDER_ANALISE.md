# Bug Flow Builder - Novo Flow Aparece com Dados Antigos

**Data:** 12/02/2026  
**Status:** ⚠️ Parcialmente Corrigido - Requer Teste Final

---

## 🐛 Descrição do Bug

Ao criar um novo flow no Flow Builder, o canvas aparece preenchido com os nós do flow anterior (2 nós: START + Interactive Message), quando deveria aparecer vazio (apenas 1 nó START).

**Exemplo:**
1. Usuário visualiza flow "Início" com 2 nós
2. Volta para lista
3. Cria novo flow "Teste"
4. ❌ Canvas mostra os 2 nós do flow "Início"
5. ✅ Esperado: canvas vazio ou apenas START

---

## 🔍 Reprodução do Bug (com Playwright)

```javascript
// 1. Navegar para inbox
await page.goto('http://localhost:3002/admin/mtf-diamante/inbox/cmlk1k9un000rny0ho982u3go');

// 2. Clicar em flow existente "Início" (2 nós)
await page.click('[data-flow="inicio"]');

// 3. Voltar para lista
await page.click('button:has-text("Voltar")');

// 4. Criar novo flow
await page.getByRole('button', { name: 'Novo' }).click();
await page.getByRole('textbox').fill('Teste Bug');
await page.getByRole('dialog').getByRole('button', { name: 'Criar' }).click();

// 5. Verificar nós (BUG: 2 nós antigos aparecem)
const nodes = await page.locator('.react-flow__node').count();
// Resultado: 2 (incorreto - deveria ser 0 ou 1)
```

**Logs observados:**
```
[useFlowCanvas] FlowId mudou: null -> cmlk7kg87005hny0ifbpubkg9
[useFlowCanvas] Sincronizando flow: cmlk7kg87005hny0ifbpubkg9 - tem canvas? true
[useFlowCanvas] Canvas carregado - nós: 2  ❌ PROBLEMA
```

---

## 🕵️ Investigação

### 1️⃣ Frontend - Hook `useFlowCanvas.ts`

**Problema Inicial:** O `useMemo` do `initialCanvas` estava retornando dados **antes** do `flowId` sincronizar.

```typescript
// ❌ ANTES (ERRADO)
const initialCanvas = useMemo(() => {
  if (flowId && flowResponse?.data?.canvas) {
    return flowResponse.data.canvas; // ⚠️ Usa dados antigos antes de sincronizar
  }
  return createEmptyFlowCanvas();
}, [flowId, flowResponse?.data?.canvas]);
```

**Correção 1:**
```typescript
// ✅ DEPOIS (CORRETO)
const initialCanvas = useMemo(() => {
  return createEmptyFlowCanvas(); // Sempre começa vazio
}, []); // Sem dependências - o useEffect sincroniza depois
```

**Correção 2:** Melhorar `useEffect` de sincronização

```typescript
useEffect(() => {
  // CRÍTICO: Ao mudar flowId, RESETAR IMEDIATAMENTE
  if (flowIdRef.current !== flowId) {
    console.log('[useFlowCanvas] FlowId mudou:', flowIdRef.current, '->', flowId);
    initializedRef.current = false;
    flowIdRef.current = flowId;
    
    const empty = createEmptyFlowCanvas();
    setNodes(empty.nodes as unknown as Node[]);
    setEdges(empty.edges as unknown as Edge[]);
    
    if (!flowId) {
      initializedRef.current = true;
      return;
    }
    return; // ⚠️ NÃO marcar initialized - esperar dados carregarem
  }

  if (initializedRef.current) return;

  // Aguardar dados carregarem DO SERVIDOR antes de sincronizar
  if (flowId && !isLoadingFlow && flowResponse) {
    console.log('[useFlowCanvas] Sincronizando flow:', flowId);
    
    if (flowResponse.data?.canvas) {
      const canvas = flowResponse.data.canvas;
      setNodes(canvas.nodes as unknown as Node[]);
      setEdges(canvas.edges as unknown as Edge[]);
      console.log('[useFlowCanvas] Canvas carregado - nós:', canvas.nodes.length);
    } else {
      console.log('[useFlowCanvas] Flow novo sem canvas - mantendo vazio');
    }
    initializedRef.current = true;
  }
}, [flowId, flowResponse, isLoadingFlow, setNodes, setEdges]);
```

### 2️⃣ API Faltante - `GET /api/admin/mtf-diamante/flows/[id]`

**Problema:** A rota não existia! O SWR falhava silenciosamente.

**Solução:** Criada rota completa em `/app/api/admin/mtf-diamante/flows/[id]/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  
  // Buscar flow com canvas
  const flow = await getPrismaInstance().flow.findUnique({
    where: { id: flowId },
    select: {
      id: true,
      name: true,
      inboxId: true,
      isActive: true,
      canvasJson: true, // ⚠️ Campo correto (não 'canvas')
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      ...flow,
      canvas: flow.canvasJson, // Mapear para 'canvas' na resposta
    },
  });
}
```

### 3️⃣ **RAIZ DO PROBLEMA** - API `/flow-canvas` Sobrescreve Flow Errado

**O GRANDE CULPADO:** `syncCanvasToNormalizedFlow()` em `/app/api/admin/mtf-diamante/flow-canvas/route.ts`

```typescript
async function syncCanvasToNormalizedFlow(inboxId: string, canvas: FlowCanvas) {
  return await prisma.$transaction(async (tx) => {
    // ❌ PROBLEMA: pega QUALQUER flow da inbox (geralmente o mais recente!)
    let flow = await tx.flow.findFirst({
      where: { inboxId },
    });

    if (!flow) {
      flow = await tx.flow.create({
        data: { name: '...', inboxId, isActive: true }
      });
    }

    // ⚠️ Sobrescreve o flow (pode ser o novo vazio) com canvas antigo!
    await tx.flowNode.deleteMany({ where: { flowId: flow.id } });
    await tx.flowNode.createMany({ data: ... nodesFromCanvas });
  });
}
```

**Fluxo do Bug:**
1. Usuário cria novo flow → API retorna `flowId: "xyz123"` (vazio, sem canvas)
2. React ainda tem `nodes` antigos em memória (do flow anterior)
3. Algo chama `saveFlow()` automaticamente 
4. `saveFlow()` → POST `/api/flow-canvas` → `syncCanvasToNormalizedFlow(inboxId, canvas)`
5. A função faz `findFirst({ where: { inboxId } })` → **pega o novo flow vazio**
6. Sobrescreve com os `nodes` antigos que estavam no `canvas` do POST
7. Próximo GET carrega o flow com os nós errados

**Solução:** Separar salvamento por flow específico

```typescript
// useFlowCanvas.ts - saveFlow()
const saveFlow = useCallback(
  async (viewport) => {
    const canvas = getCanvasState(viewport);

    // ✅ Se editando flow específico, salvar diretamente no Flow.canvasJson
    if (flowId) {
      const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas }),
      });
      
      await mutateFlow();
      console.log('[useFlowCanvas] Canvas salvo no flow', flowId);
      return await response.json();
    }

    // Se sem flowId, usar API antiga (canvas visual global da inbox)
    const result = await triggerSave({ inboxId, canvas });
    await mutateCanvas();
    return result;
  },
  [inboxId, flowId, getCanvasState, mutateFlow, mutateCanvas]
);
```

**Nova rota criada:** `PUT /api/admin/mtf-diamante/flows/[id]`

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const { canvas } = await request.json();

  // ✅ Atualiza APENAS o flow específico
  const flow = await getPrismaInstance().flow.update({
    where: { id: flowId },
    data: {
      canvasJson: canvas as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  console.log(`[flows/${flowId}] Canvas atualizado - nós: ${canvas.nodes.length}`);
  return NextResponse.json({ success: true, data: flow });
}
```

---

## ✅ Correções Implementadas

### Arquivo: `useFlowCanvas.ts`
- [x] `initialCanvas` sempre retorna vazio (linha ~143)
- [x] `useEffect` aguarda `isLoadingFlow === false` antes de sincronizar (linha ~176)
- [x] `useEffect` adiciona log de depuração (linha ~101, ~118, ~130)
- [x] `saveFlow()` usa PUT `/flows/[id]` quando `flowId` existe (linha ~332)

### Arquivo: `/app/api/admin/mtf-diamante/flows/[id]/route.ts`
- [x] Criado `GET` - buscar flow por ID com `canvasJson` (linha ~60)
- [x] Criado `PUT` - atualizar canvas do flow específico (linha ~212)
- [x] Criado `PATCH` - atualizar nome/isActive (linha ~140)
- [x] Criado `DELETE` - remover flow (linha ~280)

### Validation
- [x] TypeScript: `pnpm exec tsc --noEmit` ✅ Sem erros
- [x] Hot Reload: Aplicado automaticamente durante testes
- [ ] **Teste Manual Final:** PENDENTE (usuário parou para descansar)

---

## 📊 Estado Atual

### ✅ O Que Funciona
- API `/flows/[id]` retorna canvas correto do flow
- `useFlowCanvas` limpa canvas ao trocar `flowId`
- Logs de depuração mostram sincronização

### ⚠️ **Teste Pendente**
**Último resultado (antes da correção final):**
```json
{
  "nodeCount": 2,
  "nodes": [
    {"dataId": "start_1770944946867_bi0qi1vlu"},
    {"dataId": "interactive_message_1770944953564_kx5xb1ej2"}
  ],
  "nodeAges": [1112, 1105],
  "SUCCESS": false
}
```

**Possíveis causas remanescentes:**
1. ❓ `saveFlow()` sendo chamado automaticamente ao criar flow
2. ❓ Algum `useEffect` salvando estado antigo
3. ❓ Cache do SWR ainda retornando dados antigos

---

## 🔧 Próximos Passos (Quando Retornar)

### 1. Teste Manual Completo
```bash
# Terminal 1: Dev server rodando
cd /home/wital/Chatwit-Social-dev
pnpm run dev

# Terminal 2: Console do navegador aberto (F12)
# Ir para: http://localhost:3002/admin/mtf-diamante/inbox/cmlk1k9un000rny0ho982u3go

# Passos:
1. Clicar em flow "Início" (2 nós)
2. Voltar para lista
3. Clicar "Novo"
4. Digitar "TESTE FINAL"
5. Clicar "Criar"
6. **VERIFICAR:** Canvas deve estar vazio ou só com START (1 nó)
7. **VERIFICAR:** Console deve mostrar:
   [useFlowCanvas] FlowId mudou: null -> <id>
   [useFlowCanvas] Sincronizando flow: <id> - tem canvas? false
   [useFlowCanvas] Flow novo sem canvas - mantendo vazio
```

### 2. Se Bug Persistir

**Investigar:**
1. Verificar se há `auto-save` no `FlowBuilderTab.tsx`
2. Verificar se `onCreateNew()` chama `saveFlow()`
3. Adicionar breakpoint em `saveFlow()` para ver quem chama
4. Verificar banco de dados diretamente:
   ```sql
   SELECT id, name, "canvasJson" FROM "Flow" 
   WHERE "inboxId" = 'cmlk1k9un000rny0ho982u3go'
   ORDER BY "createdAt" DESC LIMIT 5;
   ```

### 3. Limpeza (Após Correção Confirmada)

- [ ] Remover logs de depuração em produção
- [ ] Adicionar testes automatizados
- [ ] Documentar comportamento esperado em `/docs/`

---

## 📝 Notas Técnicas

### SWR Configuration
```typescript
const { data: flowResponse } = useSWR(
  flowSwrKey,
  fetcher,
  {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    keepPreviousData: false, // ⚠️ CRÍTICO para não reutilizar dados antigos
  }
);
```

### Prisma Schema
```prisma
model Flow {
  id         String   @id @default(cuid())
  name       String
  inboxId    String
  isActive   Boolean  @default(true)
  canvasJson Json?    // ⚠️ Canvas visual (nodes/edges/viewport)
  nodes      FlowNode[]
  edges      FlowEdge[]
  // ...
}
```

**Diferença importante:**
- `Flow.canvasJson`: JSON completo do canvas visual (ReactFlow format)
- `Flow.nodes`: Tabela normalizada de nodes (para queries SQL)
- `Flow.edges`: Tabela normalizada de edges (para relacionamentos)

### API Routes Estrutura
```
/api/admin/mtf-diamante/
  ├── flows/
  │   ├── route.ts          → GET (listar), POST (criar)
  │   ├── [id]/
  │   │   └── route.ts      → GET, PUT, PATCH, DELETE
  │   └── import/
  │       └── route.ts      → POST (importar JSON)
  └── flow-canvas/
      └── route.ts          → GET, POST, DELETE (canvas visual global - deprecated para flows individuais)
```

---

## 🎯 Conclusão

O bug tem **3 camadas**:

1. **Frontend:** `initialCanvas` retornando dados antes de sincronizar → ✅ **CORRIGIDO**
2. **API Missing:** Rota `/flows/[id]` não existia → ✅ **CORRIGIDO**  
3. **Lógica de Save:** `syncCanvasToNormalizedFlow` pegava flow errado → ✅ **CORRIGIDO**

**Status Final:** Aguardando teste manual para confirmar correção completa.

---

**Desenvolvedor:** Claude (Copilot)  
**Ferramenta:** Playwright MCP para reprodução do bug  
**Tempo Investigação:** ~2 horas  
**Linhas Modificadas:** ~150 linhas
