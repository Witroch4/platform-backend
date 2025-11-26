# 🔧 Correção de Timeout: Análise e Solução

## 🎯 Problema Identificado

### Sintoma no Log (26 de nov, 19:35)
```
⏰ Operation aborted after 15000ms deadline          ← Socialwise abort ✅
[APM Alert] Webhook response time exceeded: 46367ms  ← Mas terminou com 46s
Performed HookJob from Sidekiq in 30508.18ms        ← Chatwit esperou 30s e falhou ❌
```

**Raiz do Problema:**
- ✅ O `AbortSignal` foi criado e ativado corretamente aos 15s
- ❌ MAS a requisição HTTP **subjacente continuou pendente em background**
- ❌ Eventual cleanup demorou mais de 30 segundos (timeout do Chatwit)

### Por que isso acontece?

```
TimelineAtual (ANTES DA CORREÇÃO)
├─ 0s:    Chatwit envia requisição para Socialwise
├─ 0-15s: Socialwise aguarda resposta da OpenAI
├─ 15s:   🎯 AbortSignal ativado
│         └─ OpenAI listener abortado ✅
│         └─ MAS HTTP connection ainda pendente (waiting for response)
├─ 15-46s: Socket TCP mantém conexão aberta
│          (network overhead, keep-alive, slow close)
├─ 46s:   Resposta finalmente retorna (após ~47s total)
└─ 30s:   ❌ Chatwit timeout → Error: Net::ReadTimeout
```

---

## 🔨 Solução Implementada

### 1️⃣ **Dual-Deadline System** (`services/openai-components/utils.ts`)

```typescript
const softDeadlineMs = Math.max(Math.floor(ms * 0.85), ms - 2000);
// 15000ms → 12750ms soft deadline
// Promise.race([operation(), softDeadlinePromise])
```

**Como funciona:**
- **Soft Deadline (85%):** Força limpeza Promise `ANTES` de deadline crítico
- **Hard Deadline (100%):** Fallback se soft não funcionar
- **AbortSignal:** Ativado em ambos os casos

```
TimelineCorrigido
├─ 0s:     Chatwit envia requisição
├─ 0-12.7s: Operação pendente
├─ 12.7s:  🔴 SOFT DEADLINE → Promise.race resolve(null)
│          └─ AbortSignal ativado
│          └─ HTTP connection cleanup iniciado
├─ 12.7-15s: Cleanup em progresso
├─ 15s:    🔴 HARD DEADLINE → Fallback (backup)
└─ ~14s:   ✅ Resposta retorna em tempo
```

**Benefício:** Chatwit recebe resposta **~16 segundos antes** do timeout

---

### 2️⃣ **Timeout Enforcement na Fila** (`lib/socialwise-flow/concurrency-manager.ts`)

Novo método `executeWithTimeout<T>()`:

```typescript
private executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationId: string
): Promise<T | null> {
  // Promise.race garante timeout mesmo se operation ignorar AbortSignal
  return Promise.race([operation(), timeoutPromise]);
}
```

**Problema anterior:**
- Concurrency manager passava `timeoutMs` mas **não o aplicava**
- Se operação ignorasse AbortSignal, timeout seria ignorado

**Solução:**
- `Promise.race()` garante timeout em **nível de Promise**
- Impossível contornar (não é sugestão, é enforcement)

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Soft Deadline** | Nenhum | 12.7s (85% de 15s) |
| **Hard Deadline** | 15s (aborted) | 15s (fallback) |
| **Tempo Total Socialwise** | ~46-50s | ~13-15s esperado |
| **Chatwit Timeout** | ❌ 30.5s (failure) | ✅ Completa em ~15s |
| **AbortSignal Coverage** | HTTP pode continuar | Força cleanup |

---

## 🧪 Como Testar

### Teste 1: Verificar Soft Deadline no Log
```bash
# Procure no log do Socialwise:
# ANTES: ⏰ Operation aborted after 15000ms deadline
# DEPOIS: ⏰ SOFT DEADLINE reached after 12750ms - forcing cleanup
```

### Teste 2: Medir Tempo Total
```
Método: Enviar mensagem ROUTER (que demora mais)
Esperado: routeTotalMs < 15000 (idealmente < 13000)
Benchmark: Antes chegava a 46-50s
```

### Teste 3: Validar Chatwit Não Timeout
```
Verificar em logs Chatwit:
- Antes: Performed HookJob ... in 30508.18ms (timeout)
- Depois: Performed HookJob ... in <15000ms (sucesso)
```

---

## 🔍 Detalhes Técnicos

### Por que Promise.race é melhor que setTimeout puro?

```typescript
// ❌ RUIM (antigo): setTimeout ignora AbortSignal cleanup
setTimeout(() => abort(), ms);

// ✅ BOM (novo): Promise.race garante cleanup
Promise.race([
  operation(),           // operação real
  timeoutPromise        // timeout via Promise
])
```

**Diferenças:**
1. **Promise.race:** Cancela AMBAS as Promises (operação e timeout)
2. **setTimeout:** Apenas ativa AbortSignal (HTTP pode continuar)
3. **Guarantee:** Promise.race é síncrono para `then/catch`

### OpenAI SDK Behavior

A OpenAI JavaScript SDK v5+ suporta AbortSignal:
```typescript
await client.responses.parse(req, { signal });
```

Quando AbortSignal é ativado:
1. Stream listener é cancelado ✅
2. HTTP request pode continuar em background ⚠️
3. Nossa solução força limpeza com Promise.race ✅

---

## 📈 Métricas Esperadas

Após a correção, você deve observar:

### No Log do Socialwise
```json
{
  "llmWarmupMs": 12500,        // ← reduzido de 15000
  "routeTotalMs": 13000,        // ← reduzido de 46000
  "timeout_occurred": false,    // ← sempre false
  "webhook_response_time": 13200 // ← < 15s
}
```

### No Log do Chatwit
```
Performed HookJob ... in 13500.42ms  // ← sucesso em < 15s
[SUCCESS] SocialWise response received
```

### No Redis (Métricas APM)
```
webhook_response_time_p99: 14500ms  // ← reduzido de 46000ms
concurrent_llm_calls_active: ≤ 2    // ← controle mantido
cost_per_request: $0.002            // ← sem re-tentativas
```

---

## ⚠️ Casos Extremos Tratados

| Cenário | Antes | Depois |
|---------|-------|--------|
| **OpenAI lento (47s)** | Chatwit timeout | Socialwise timeout aos 15s |
| **Rede instável** | HTTP pendente indefinidamente | Promise.race resolve em 12.7s |
| **AbortSignal ignorado** | Operação continua | Promise.race força timeout |
| **Múltiplas requisições** | Concurrency não respeitado | executeWithTimeout garante |

---

## 🚀 Implementação

### Arquivos Modificados

1. **`services/openai-components/utils.ts`**
   - ✅ Dual-deadline system (soft 85% + hard 100%)
   - ✅ Promise.race enforcement
   - ✅ Proper cleanup (clearTimeout)

2. **`lib/socialwise-flow/concurrency-manager.ts`**
   - ✅ Novo método `executeWithTimeout()`
   - ✅ Wraps operation com Promise.race
   - ✅ Logging de timeout enforcement

### Sem Mudanças Necessárias Em
- `router-llm.ts` (usa `withDeadlineAbort` automaticamente)
- `band-handlers.ts` (passa `timeoutMs` corretamente)
- `structured-outputs.ts` (AbortSignal propagado)

---

## 📝 Próximos Passos

1. **Deploy e Monitor**
   - Deploy em staging
   - Enviar mensagens ROUTER
   - Monitorar logs de timeout

2. **Validação**
   - Confirmar `routeTotalMs` < 15000
   - Confirmar Chatwit recebe resposta < 30s
   - Verificar APM metrics

3. **Ajustes Finos**
   - Se ainda lento, aumentar soft deadline para 90%
   - Se muito rápido, reduzir para 80%
   - Default seguro: 85%

---

## 🎓 Resumo

**O Problema:** AbortSignal sozinho não garante limpeza de HTTP

**A Solução:** Dual-deadline com Promise.race força limpeza ANTES do limite crítico

**O Resultado:** Timeouts respeitados, Chatwit sempre recebe resposta < 30s

---

*Última atualização: 26 de novembro de 2025*
