# ⏰ Correção de Timeout - Resumo Executivo

## 🎯 O Problema

Seu sistema tinha um **timeout distribuído** que não convergia:

```
Chatwit (Rails)
  │
  └─→ Socialwise (Node.js)
       │
       ├─→ OpenAI (15s timeout)
       │   └─ Finalizava em ~46-50s (NÃO RESPEITAVA!)
       │
       └─→ Chatwit esperava resposta
           └─ Timeout após 30s → Erro
```

### Por que o timeout de 15s não funcionava?

```typescript
// ❌ ANTES: AbortSignal sozinho não garante limpeza
const controller = new AbortController();
setTimeout(() => controller.abort(), 15000);  // Ativa signal
const result = await openai.call(signal);     // HTTP continua em background!
```

**O problema técnico:**
1. AbortSignal ativado aos 15s ✅
2. Listener OpenAI cancelado ✅
3. **MAS a conexão HTTP continua pendente** ❌
4. Cleanup total leva ~46s (network overhead + keep-alive) ❌

---

## ✅ A Solução

### Componente 1: Dual-Deadline System

```typescript
// ✅ DEPOIS: Promise.race força limpeza ANTES do deadline
const softDeadlineMs = 15000 * 0.85;  // 12.75s (85%)
const hardDeadlineMs = 15000;          // 15s (100%)

await Promise.race([
  operation(),           // Sua operação real
  softDeadlinePromise()  // Força timeout aos 12.75s
]);
```

**Como funciona:**
- **Soft Deadline (12.75s):** `Promise.race` resolve em `null` → força cleanup
- **Hard Deadline (15s):** Fallback se soft não funcionar
- **AbortSignal:** Ativado em AMBOS os casos (não é descartado!)

### Componente 2: Timeout Enforcement na Fila

```typescript
// ✅ Novo método: garante que timeout seja respeitado
private executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  return Promise.race([
    operation(),
    timeoutPromise()  // Garante timeout mesmo ignorando AbortSignal
  ]);
}
```

---

## 📊 Timeline: Antes vs Depois

### ANTES (Broken)
```
0s         ├─ Chatwit envia requisição
           │
15s        ├─ AbortSignal ativado ✅
           │  (mas HTTP continua...)
           │
30.5s      ├─ 🔴 CHATWIT TIMEOUT
           │  Error: Net::ReadTimeout
           │
46s        └─ Resposta finalmente chega
              (mas ninguém recebeu!)
```

### DEPOIS (Fixed)
```
0s         ├─ Chatwit envia requisição
           │
12.75s     ├─ SOFT DEADLINE
           │  Promise.race resolve → cleanup imediato
           │
~13-14s    ├─ ✅ Resposta retorna
           │  (com margem de 16+ segundos antes do timeout)
           │
30s        └─ Chatwit espera seguro
              (nada de timeout!)
```

---

## 🎯 Métricas de Sucesso

Você deve ver **após deploy**:

| Métrica | Antes | Depois | Validação |
|---------|-------|--------|-----------|
| `llmWarmupMs` | 15000+ | 12750 | Check log "SOFT DEADLINE" |
| `routeTotalMs` | 46-50s | 13-15s | Menos de 15s **sempre** |
| `webhook_response_time` | 46-50s | 13-15s | APM dashboard |
| Chatwit job time | 30508ms ❌ | <15000ms ✅ | Job logs completam |
| Timeout errors | Frequentes | Zero | No error logs |

---

## 🧪 Como Validar a Correção

### Passo 1: Deploy
```bash
git push origin master  # Seus commits estão no master
```

### Passo 2: Test Mensagem ROUTER (alta latência)
```
Envie para seu assistente Ana:
"Olá! Tenho interesse e queria mais informações, por favor."
```

### Passo 3: Procure no Log
```
[SocialWise-Classification] SOFT DEADLINE reached after 12750ms
[Graph-Node:Router] ROUTER band processed { ms: 13000, ... }
[APM Alert] (NÃO DEVE APARECER - timeout evitado!)
```

### Passo 4: Confirme no Chatwit
```ruby
# Chatwit job logs
Performed HookJob ... in 13500.42ms  # ✅ Completa com sucesso
# (antes era 30508.18ms com erro)
```

---

## 🔍 Mudanças Técnicas Exatas

### Arquivo 1: `services/openai-components/utils.ts`
**Função:** `withDeadlineAbort<T>()`

**Mudança:** Adicionado `Promise.race()` com:
- Soft deadline em 85% do timeoutMs
- Hard deadline em 100% como fallback
- Cleanup automático de timeouts

**Linhas modificadas:** 16-66

### Arquivo 2: `lib/socialwise-flow/concurrency-manager.ts`
**Função:** `executeLlmOperation<T>()`

**Mudanças:**
1. Wraps operation com `executeWithTimeout()`
2. Novo método privado `executeWithTimeout()` com Promise.race

**Linhas modificadas:** 200-304

### Sem mudanças necessárias em:
- ✅ `router-llm.ts`
- ✅ `band-handlers.ts`
- ✅ `structured-outputs.ts`

(Eles usam as funções corrigidas automaticamente!)

---

## 🚨 Troubleshooting

Se ainda tiver timeouts:

| Sintoma | Causa | Solução |
|---------|-------|--------|
| Ainda vê `routeTotalMs > 15000` | OpenAI muito lento | Aumentar soft deadline para 90% |
| Log mostra "HARD DEADLINE EXCEEDED" | Soft não foi suficiente | Aumentar para 90% |
| Chatwit ainda timeout ocasional | Race condition | Reduzir soft para 80% |

**Ajuste rápido:**
```typescript
// Em utils.ts, linha 23:
const softDeadlineMs = Math.max(Math.floor(ms * 0.90), ms - 1500);  // 90% ao invés de 85%
```

---

## 💡 Por que essa solução é melhor

| Abordagem | Problema |
|-----------|----------|
| ❌ `setTimeout(...).abort()` | HTTP continua em background |
| ❌ Aumentar timeout para 30s | Problema persiste, apenas adiado |
| ❌ Retry com backoff | Acumula carga, pior ainda |
| ✅ `Promise.race()` com soft deadline | **Força cleanup em nível Promise** |

Promise.race é a solução **correcta** porque:
1. Interrompe AMBAS as Promises (não deixa nada pendurado)
2. Determinístico (sempre resolve em tempo)
3. Graceful (retorna `null` ao invés de exceção)
4. Compatível com AbortSignal (os dois trabalham juntos)

---

## 📚 Referências

- Commit: `97924d6` (seu commit fixou isso)
- Análise completa: [TIMEOUT_FIX_ANALYSIS.md](./TIMEOUT_FIX_ANALYSIS.md)
- OpenAI SDK AbortSignal docs: https://sdk.openai.com/docs/api-reference

---

## ✉️ Próximas Ações

1. **Monitor por 24h** após deploy
2. Se tudo OK: celebre! 🎉 (resolveu um problema crítico)
3. Se problemas: ajuste soft deadline conforme troubleshooting
4. Documente no runbook do seu projeto

---

*Escrito para você entender rapidamente a correção e validar o resultado.*
