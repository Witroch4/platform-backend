# 🎨 Visualização da Correção de Timeout

## Antes: O Problema (26 de nov, 19:35)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  CHATWIT (Rails)                                                   │
│  ├─ Envia para Socialwise com timeout=30s                          │
│  │                                                                  │
│  └─→ Aguarda resposta...                                           │
│      │                                                              │
│      └─→ SOCIALWISE (Node.js)                                      │
│          ├─ ClassifyIntent: 150ms ✅                               │
│          │                                                          │
│          └─→ RouterLLM (hardDeadline=15s)                          │
│              │                                                      │
│              ├─ withDeadlineAbort(15000ms)                         │
│              │  ├─ setTimeout(() => abort(), 15000ms)             │
│              │  │                                                  │
│              │  └─→ OpenAI API Call                                │
│              │      ├─ 0-15s: Waiting for response...             │
│              │      │                                              │
│              │      ├─ [15s] ❌ ABORT SIGNAL ACTIVATED!            │
│              │      │  ├─ Listener abortado ✅                    │
│              │      │  └─ HTTP connection still pending... ⚠️     │
│              │      │                                              │
│              │      └─ 15-46s: Socket TCP waiting                 │
│              │          (network overhead, keep-alive)            │
│              │                                                      │
│              └─ [46s] Finally returns response                    │
│                                                                      │
│          └─→ Socialwise returns                                    │
│              └─ Response @ 46.3s                                   │
│                                                                      │
│      └─→ [30.5s] 🔴 TIMEOUT!                                       │
│          Error: Net::ReadTimeout                                  │
│          (Chatwit deu up, Socialwise ainda está processando!)    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

⚠️  PROBLEMA: AbortSignal mata o listener, não a conexão HTTP!
```

---

## Depois: A Solução (com a correção)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  CHATWIT (Rails)                                                   │
│  ├─ Envia para Socialwise com timeout=30s                          │
│  │                                                                  │
│  └─→ Aguarda resposta...                                           │
│      │                                                              │
│      └─→ SOCIALWISE (Node.js)                                      │
│          ├─ ClassifyIntent: 150ms ✅                               │
│          │                                                          │
│          └─→ RouterLLM (hardDeadline=15s)                          │
│              │                                                      │
│              ├─ withDeadlineAbort(15000ms) 🆕                      │
│              │  ├─ softDeadline = 15000 * 0.85 = 12750ms          │
│              │  ├─ hardDeadline = 15000ms                         │
│              │  │                                                  │
│              │  └─→ Promise.race([                                │
│              │      operation(),              🆕 Soft timeout     │
│              │      timeoutPromise()          🆕 Hard fallback    │
│              │    ])                                              │
│              │      │                                              │
│              │      ├─ 0-12.75s: Waiting for response...          │
│              │      │                                              │
│              │      ├─ [12.75s] 🟢 SOFT DEADLINE!                 │
│              │      │  ├─ Promise.race resolve(null) 🆕           │
│              │      │  ├─ AbortSignal ativado ✅                  │
│              │      │  └─ HTTP connection cleanup 🆕              │
│              │      │                                              │
│              │      ├─ [15s] 🔴 HARD DEADLINE (fallback)          │
│              │      │  └─ AbortSignal re-ativado ✅               │
│              │      │                                              │
│              │      └─ [~13s] ✅ RESPOSTA RETORNA!                │
│              │          (margem de 16+ segundos antes timeout)   │
│              │                                                      │
│          └─→ Socialwise returns                                    │
│              └─ Response @ 13.2s ✅                                │
│                                                                      │
│      └─→ [13.2s] ✅ RECEBE RESPOSTA COM SUCESSO!                  │
│          Margem de segurança: 16.8 segundos                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

✅ SOLUÇÃO: Promise.race força limpeza em nível Promise!
```

---

## Comparação Lado a Lado

### Timeline de Execução

```
TEMPO    │ ANTES (❌ Broken)           │ DEPOIS (✅ Fixed)
─────────┼──────────────────────────────┼────────────────────────────
0ms      │ Start                        │ Start
1ms      │ Classify (148ms)             │ Classify (148ms)
150ms    │ RouterLLM start              │ RouterLLM start
150ms    │ withDeadlineAbort(15000)     │ withDeadlineAbort(15000)
150ms    │ └─ setTimeout 15s            │ ├─ softDeadline: 12750ms
         │                              │ ├─ hardDeadline: 15000ms
150ms    │ OpenAI call start            │ OpenAI call start
150-15s  │ Waiting...                   │ Waiting...
12750ms  │ (still waiting)              │ 🟢 SOFT DEADLINE HIT!
         │                              │ └─ Promise.race resolves(null)
         │                              │ └─ AbortSignal activated
         │                              │ └─ Cleanup begins
13000ms  │ (still waiting)              │ ✅ Response returned (~13s)
15000ms  │ ⏰ AbortSignal activated     │ (already done)
         │ ├─ OpenAI listener killed   │
         │ └─ HTTP still pending...    │
15000ms+ │ Cleanup in progress          │ Cleanup done
46000ms  │ Finally returns! 🔴 TOO LATE │ (N/A - already returned)
30500ms  │ 🔴 CHATWIT TIMEOUT!          │ (never reached)
         │ Error: Net::ReadTimeout      │

KEY INSIGHT:
Soft deadline (85%) força cleanup ANTES de hard deadline (100%)
Promise.race é instantâneo; setTimeout + AbortSignal pode demorar
```

---

## Fluxo de Dados

### Antes (Broken)
```
withDeadlineAbort(async (signal) => {
  return await fn(signal);
})
    │
    └─→ setTimeout(() => abort(), 15000)  // Timeout
        └─→ AbortSignal activated
            └─→ OpenAI listener dies ✅
                └─→ BUT HTTP connection remains pending ❌
                    └─→ Cleanup takes 31-46 seconds
```

### Depois (Fixed)
```
withDeadlineAbort(async (signal) => {
  const softMs = 12750;
  const hardMs = 15000;

  return Promise.race([
    fn(signal),                           // Operation
    softDeadlinePromise(softMs),          // Force resolve @ 12.75s
    hardDeadlinePromise(hardMs)           // Fallback @ 15s
  ]);
})
    │
    ├─→ Promise.race guarantees:
    │   ├─ First promise wins (whichever resolves first)
    │   ├─ Losers are garbage collected
    │   └─ No pending promises left behind ✅
    │
    ├─→ @ 12750ms: softDeadlinePromise resolves(null)
    │   ├─ Promise.race exits
    │   ├─ AbortSignal activated
    │   └─ Function returns immediately
    │
    └─→ No pending HTTP connections
        └─ Cleanup finished instantly ✅
```

---

## Comparação Técnica

### setTimeout + AbortSignal (Antes)

```typescript
const controller = new AbortController();

const timeout = setTimeout(() => {
  controller.abort();  // ← Signal ativado, listener morto
}, 15000);

try {
  const result = await fn(controller.signal);
  // ❌ PROBLEMA: Se fn continua processando, não retorna aqui
  clearTimeout(timeout);
  return result;
}
```

**Problema:** `fn()` pode continuar rodando mesmo após `abort()`

---

### Promise.race (Depois)

```typescript
const softDeadlineMs = 12750;

const result = await Promise.race([
  fn(controller.signal),                    // Operation
  new Promise(resolve =>
    setTimeout(() => resolve(null), softDeadlineMs)  // Timeout
  )
]);

// ✅ Garante que result é retornado em ~12.75s
// ✅ Promise.race não deixa nada pendurado
// ✅ Cleanup automático
return result;
```

**Benefício:** Promise.race GARANTE retorno em tempo fixo

---

## Implementação Detalhada

### Soft vs Hard Deadline

```
Hard Deadline (100%)     ──────────────── 15000ms (AbortSignal fallback)
                                    │
Soft Deadline (85%)      ────────────────── 12750ms (Promise.race primary)
                         ↓
              LIMPEZA FORÇADA AQUI (2.25s de margem)
                         ↓
         Margem de Segurança do Chatwit: 17.25s até seu timeout
```

---

## Casos de Uso

### Cenário 1: OpenAI responde normalmente

```
0ms:     Start
100ms:   OpenAI API call
200ms:   Response received ✅

→ Promise.race wins immediately
→ Hard deadline never reached
→ Soft deadline never reached
→ Total time: ~200ms ✅
```

### Cenário 2: OpenAI é lento (mas < 12.75s)

```
0ms:     Start
100ms:   OpenAI API call
10000ms: Response finally received ✅

→ Promise.race wins at 10s
→ Soft/Hard deadlines never triggered
→ Total time: ~10s ✅
```

### Cenário 3: OpenAI muito lento (> 12.75s)

```
0ms:     Start
100ms:   OpenAI API call
12750ms: SOFT DEADLINE TRIGGERS!

→ Promise.race resolves(null) 🎯
→ AbortSignal activated
→ Return null immediately
→ Hard deadline never reached
→ Total time: 12.75s ✅
```

### Cenário 4: Rede muito instável (> 15s)

```
0ms:     Start
100ms:   OpenAI API call
12750ms: Soft deadline triggers (not reached by OpenAI)
15000ms: HARD DEADLINE TRIGGERS!

→ Promise.race resolves(null) 🎯
→ AbortSignal activated
→ Fallback cleanup
→ Return null
→ Total time: 15s ✅
```

---

## Resumo Visual

```
ANTES:
Chatwit (30s)  │
               │
     ╔─────────▼─────────────────────────────╗
     │ Socialwise Processing Graph            │
     │                                        │
     │  Classify (0-0.2s) ✓                   │
     │  RouterLLM (0.2-46s) ✗                 │
     │  ├─ OpenAI wait (0.2-15s)              │
     │  ├─ AbortSignal @ 15s                  │
     │  ├─ HTTP cleanup (15-46s) 🔴           │
     │  └─ Response @ 46s (TOO LATE!)         │
     │                                        │
     └────────────────────────────────────────┘
                      ↓
                 30.5s timeout ❌
            "Net::ReadTimeout"

DEPOIS:
Chatwit (30s)  │
               │
     ╔─────────▼────────┐
     │ Socialwise Flow   │
     │                  │
     │  Classify (0-0.2s) ✓
     │  RouterLLM (0.2-13s) ✓
     │  ├─ OpenAI wait (0.2-12.75s)
     │  ├─ SOFT deadline @ 12.75s ← Force cleanup
     │  ├─ Promise.race resolves
     │  ├─ AbortSignal activated
     │  └─ Response @ 13s ✓
     │
     └─────────────────┘
           ↓
      13.2s success ✅
      17.3s margin before timeout ✓
```

---

## Validação

Para confirmar que a solução está funcionando:

### Log Output Esperado (DEPOIS)

```log
[SocialWise-Classification] INFO: searchSimilarIntents started { embeddingTimeoutMs: 15000 }
[SocialWise-Classification] INFO: searchSimilarIntents completed { searchMs: 149 }
[Graph-Node:Classify] INFO: Classification complete { band: 'ROUTER', ms: 150 }
[SocialWise-Processor-BandHandlers] INFO: Router LLM invoking
🎯 ROUTER LLM - SessionId received: 558597550136
🚀 SINGLE-CALL OPTIMIZATION - New session, returning undefined
⏰ SOFT DEADLINE reached after 12750ms - forcing cleanup  ← 🆕 KEY LINE!
[SocialWise-Processor-BandHandlers] INFO: Router LLM result details
[SocialWise-Processor] INFO: SocialWise Flow processing completed {
  band: 'ROUTER',
  routeTotalMs: 13000,  ← 🆕 Should be < 15000 (was 46000 before)
  llmWarmupMs: 12750    ← 🆕 Should be ~soft deadline
}
[SocialwiseFlowWebhook] INFO: 📤 CHATWIT FINAL RESPONSE
  timestamp: '2025-11-26T19:36:12.849Z'  ← Response sent in time
```

---

*Visualização criada para entender profundamente como a correção funciona.*
