# 🧪 Guia Completo de Validação da Correção de Timeout

## 📋 Pré-Requisitos

- Acesso aos logs do Socialwise
- Acesso aos logs do Chatwit (Rails)
- Acesso ao APM/Monitoring (Prometheus/Grafana se disponível)
- Redis acesso para checar métricas em tempo real

---

## ✅ Teste 1: Verificar Soft Deadline no Log

### Objetivo
Confirmar que o `SOFT DEADLINE` está sendo disparado aos 12.75s

### Passos

1. **Redeploy com a correção:**
   ```bash
   git push origin master
   # ou deploy para staging
   ```

2. **Envie uma mensagem ROUTER (que demora):**
   ```
   Para seu assistente (ex: Ana):
   "Olá! Tenho interesse e queria mais informações, por favor."
   ```

   ⚠️ **Por quê ROUTER?**
   - Mensagens simples (HARD band) respondem em <1s
   - ROUTER band usa LLM e demora mais (13-15s normalmente)

3. **Procure no log Socialwise:**
   ```bash
   # Em tempo real
   tail -f /path/to/socialwise/logs

   # Procure por:
   grep "SOFT DEADLINE" /path/to/logs
   ```

4. **Esperado:**
   ```log
   ⏰ SOFT DEADLINE reached after 12750ms - forcing cleanup
   [SocialWise-Processor] INFO: SocialWise Flow processing completed {
     band: 'ROUTER',
     routeTotalMs: 13000,      ← CRÍTICO: deve ser < 15000
     llmWarmupMs: 12750,       ← Este é o soft deadline
     embeddingMs: 148
   }
   ```

### ✅ Validação
- [ ] Log mostra "SOFT DEADLINE reached after 12750ms"
- [ ] `routeTotalMs` é < 15000ms (idealmente 13000-14000ms)
- [ ] Nenhuma linha mostra "HARD DEADLINE EXCEEDED"

---

## ✅ Teste 2: Confirmar Chatwit Recebe Resposta em Tempo

### Objetivo
Validar que Chatwit NÃO timeout após 30 segundos

### Passos

1. **Monitore os logs do Chatwit enquanto envia a mensagem:**
   ```bash
   # Terminal 1: Watch Chatwit logs
   tail -f /path/to/chatwit/logs/production.log | grep -E "HookJob|SocialWise|timeout"
   ```

2. **Envie a mensagem ROUTER (mesmo do teste anterior)**

3. **Observe o resultado em Chatwit:**
   ```ruby
   # ✅ BOM - Job completa com sucesso
   I, [2025-11-26T19:36:12.000000 #1]  INFO -- : Performed HookJob
      ...
      ... from Sidekiq(medium) in 13500.42ms

   # ❌ RUIM - Job timeout
   E, [2025-11-26T19:35:22.457259 #1] ERROR -- : [ActiveJob] [HookJob]
      Request failed: Net::ReadTimeout
      ... in 30508.18ms
   ```

4. **Esperado:**
   - Job completa em < 15000ms ✅
   - Nenhuma linha com `Net::ReadTimeout` ❌

### ✅ Validação
- [ ] Chatwit job completa < 15000ms
- [ ] Sem erro `Net::ReadTimeout`
- [ ] Status 200 OK recebido

---

## ✅ Teste 3: Medir Tempo Total de Resposta

### Objetivo
Validar que webhook responde em ~13-15 segundos (era 46+)

### Passos

1. **Capture timestamp de início e fim:**
   ```
   Início: Log mostra [SocialwiseFlowWebhook] INFO: Processing SocialWise Flow request
   Fim:    Log mostra [SocialwiseFlowWebhook] INFO: 📤 CHATWIT FINAL RESPONSE
   ```

2. **Calcule a diferença:**
   ```
   Seu log deve mostrar:

   [SocialwiseFlowWebhook] INFO: Processing SocialWise Flow request {
     timestamp: '2025-11-26T19:36:00.000Z',  ← Start
     ...
   }

   ... (processamento)

   [SocialwiseFlowWebhook] INFO: 📤 CHATWIT FINAL RESPONSE DEBUG {
     timestamp: '2025-11-26T19:36:13.200Z',  ← End
     ...
   }

   Diferença: 13.2 segundos ✅ (antes era 46+ segundos)
   ```

3. **Ou procure pela métrica consolidada:**
   ```log
   [SocialWise-Metrics] INFO: Performance metrics collected {
     route_total_ms: 13000,    ← ESTE É O IMPORTANTE
     embedding_ms: 148,
     llm_warmup_ms: 12750,
   }
   ```

### ✅ Validação
- [ ] `route_total_ms` é 13000-15000ms (antes era 46-50s)
- [ ] Sem métricas > 30000ms
- [ ] Consistente em múltiplas requisições

---

## ✅ Teste 4: Verificar Múltiplas Requisições Simultâneas

### Objetivo
Garantir que o sistema funciona bem sob carga

### Passos

1. **Envie 5 mensagens ROUTER rapidamente:**
   ```
   (em intervalos de 1-2 segundos)

   Usuário 1: "Olá! Tenho interesse..."
   Usuário 2: "Olá! Tenho interesse..."
   Usuário 3: "Olá! Tenho interesse..."
   Usuário 4: "Olá! Tenho interesse..."
   Usuário 5: "Olá! Tenho interesse..."
   ```

2. **Monitore logs para:**
   ```
   [SocialWise-Concurrency] active_operations_count

   Esperado: 1-2 simultâneas (respeitando concurrency limit)
   ```

3. **Confirme tempos:**
   ```log
   Requisição 1: routeTotalMs: 13200  ✓
   Requisição 2: routeTotalMs: 13400  ✓
   Requisição 3: routeTotalMs: 13100  ✓
   Requisição 4: routeTotalMs: 13300  ✓
   Requisição 5: routeTotalMs: 13200  ✓

   Todos < 15000ms ✅
   ```

### ✅ Validação
- [ ] Todas requisições completam < 15000ms
- [ ] Sem degradação progressiva de tempo
- [ ] Concurrency limit respeitado

---

## ✅ Teste 5: Validar APM Metrics

### Objetivo
Confirmar que métricas do sistema mostram melhoria

### Passos

1. **Acesse seu dashboard APM (Prometheus/Grafana):**
   ```
   URL: {seu-grafana}/d/{dashboard-id}
   ```

2. **Procure pelos gráficos:**
   - `webhook_response_time`
   - `llm_warmup_time`
   - `route_total_time`

3. **Esperado:**
   ```
   ANTES (26 nov ~19:35):
   - webhook_response_time p99: 46000ms ❌
   - llm_warmup_time p99: 15000ms+ ❌
   - timeout_errors: frequentes ❌

   DEPOIS (26 nov ~19:36 em diante):
   - webhook_response_time p99: 13500ms ✅
   - llm_warmup_time p99: 12800ms ✅
   - timeout_errors: 0 ✅
   ```

4. **Ou query direto do Prometheus:**
   ```promql
   # Tempo de resposta de webhook (p99)
   histogram_quantile(0.99, rate(webhook_response_time_bucket[5m]))

   # LLM warmup time (p99)
   histogram_quantile(0.99, rate(llm_warmup_time_bucket[5m]))

   # Timeout errors
   rate(timeout_errors_total[5m])
   ```

### ✅ Validação
- [ ] `webhook_response_time` reduzido de 46s para ~13-15s
- [ ] `llm_warmup_time` consistente com soft deadline (12.75s)
- [ ] `timeout_errors_total` reduzido para zero/quase zero

---

## ✅ Teste 6: Edge Cases

### Caso 1: Resposta Rápida (< 1s)

```
Envie: "Olá"  (será HARD band, muito rápido)

Esperado:
- routeTotalMs: < 1000ms ✓
- Soft deadline: nunca disparado
- Hard deadline: nunca disparado
```

### Caso 2: Resposta Normal (5-8s)

```
Envie: "Quero contratar mentoria"  (será SOFT band)

Esperado:
- routeTotalMs: 5000-8000ms ✓
- Soft deadline: nunca disparado
- Hard deadline: nunca disparado
```

### Caso 3: Resposta Lenta (11-13s)

```
Envie: "Olá! Tenho interesse..."  (será ROUTER band)

Esperado:
- routeTotalMs: 11000-13000ms ✓
- Soft deadline: disparado aos 12750ms
- Hard deadline: nunca disparado
```

### ✅ Validação
- [ ] Todos os casos retornam < 15000ms
- [ ] Soft deadline apenas dispara em casos necessários

---

## 📊 Checklist de Validação

### Antes de Deploy
- [ ] Código compilado sem erros TypeScript (`pnpm exec tsc --noEmit`)
- [ ] Testes passam (se houver)
- [ ] Git status limpo

### Imediatamente após Deploy
- [ ] [ ] Soft deadline aparece no log
- [ ] [ ] routeTotalMs reduzido significativamente
- [ ] [ ] Chatwit não timeout
- [ ] [ ] Múltiplas requisições funcionam

### Depois de 1 hora
- [ ] Nenhum erro em 100+ requisições
- [ ] APM metrics mostram melhoria
- [ ] Sem degradação progressiva

### Depois de 24 horas
- [ ] Sistema estável
- [ ] Sem timeouts recorrentes
- [ ] Métrica p99 consistente

---

## 🚨 Troubleshooting

### Se ainda vir `routeTotalMs > 15000`

```typescript
// Verificação 1: Soft deadline está configurado?
// Em utils.ts, linha 23:
const softDeadlineMs = Math.max(Math.floor(ms * 0.85), ms - 2000);
// Deve calcular: 15000 * 0.85 = 12750

// Verificação 2: Log mostra SOFT DEADLINE?
grep "SOFT DEADLINE" logs
// Se não aparecer, algo está errado

// Solução: Aumentar soft deadline para 90%
const softDeadlineMs = Math.max(Math.floor(ms * 0.90), ms - 1500);
//  15000 * 0.90 = 13500 (maior margem)
```

### Se Chatwit ainda timeout ocasionalmente

```
Possível causa: Rede muito lenta, soft deadline insuficiente

Solução:
1. Aumentar soft deadline para 90% (13500ms ao invés de 12750ms)
2. Aumentar hard deadline para 18000ms
3. Verificar latência de rede

const softDeadlineMs = Math.floor(ms * 0.90);  // 13500ms
const hardDeadlineMs = ms + 3000;              // 18000ms
```

### Se ver "HARD DEADLINE EXCEEDED" nos logs

```
Significa que até mesmo 100% do deadline foi ultrapassado

Causa provável:
- OpenAI API extremamente lenta
- Rede instável
- Servidor sobrecarregado

Ação:
1. Aumentar hardDeadlineMs para 20000ms
2. Checar status da OpenAI API
3. Monitorar CPU/memória do servidor
```

---

## 📈 Métricas de Sucesso

Após a validação completa, você deve ter:

```
✅ 100% das requisições completam < 15s
✅ 0 timeouts Net::ReadTimeout no Chatwit
✅ 0 HARD_DEADLINE_EXCEEDED no Socialwise
✅ routeTotalMs consistente 13-14s
✅ Soft deadline dispara conforme esperado
✅ Zero regressões em tempo de resposta
✅ Sistema estável por 24+ horas
```

---

## 📞 Se Encontrar Problemas

1. **Verifique os commits:**
   ```bash
   git log --oneline | grep -i timeout
   # Deve mostrar seus 3 commits
   ```

2. **Revert se necessário:**
   ```bash
   git revert 97924d6  # Revert o commit principal
   ```

3. **Contacte suporte com:**
   - Timestamp exato do problema
   - TraceIds dos logs
   - Valores de routeTotalMs observados
   - Número de requisições simultâneas

---

## 🎉 Conclusão

Quando todos os testes passarem, você terá:
- ✅ Timeouts respeitados (15 segundos)
- ✅ Sistema estável e previsível
- ✅ Chatwit nunca timeout (30s é seguro)
- ✅ Problema crítico resolvido! 🎊

---

*Guia criado para tornar a validação simples e objetiva.*
