# 🔧 Correção: Worker não processa todos os jobs em produção

## 📊 Problema Identificado

**Situação**: Em produção, apenas 6 dos 15 jobs estão sendo processados pelo worker, enquanto em desenvolvimento funciona normalmente.

**Causa Raiz**: Limitação de recursos no container Docker em produção:
- ❌ Worker limitado a apenas **512MB RAM** e **0.5 CPU**
- ❌ Concorrência alta (`concurrency: 10`) vs recursos baixos
- ❌ Container sobrecarregado processando múltiplos workers simultaneamente

## 🛠️ Soluções Implementadas

### 1. Aumento de Recursos do Container

**Arquivo**: `docker-compose-prod.yml`

```yaml
# ANTES
resources:
  limits:
    cpus: "0.5"
    memory: 512M

# DEPOIS  
resources:
  limits:
    cpus: "1.0"      # Dobrado
    memory: 1024M    # Dobrado
```

### 2. Concorrência Configurável

**Arquivo**: `worker/webhook.worker.ts`

```typescript
// ANTES
concurrency: 10,  // Fixo

// DEPOIS
const leadsChatwitConcurrency = parseInt(process.env.LEADS_CHATWIT_CONCURRENCY || '10');
concurrency: leadsChatwitConcurrency,  // Configurável via env
```

**Variável de ambiente adicionada**:
```bash
LEADS_CHATWIT_CONCURRENCY=5  # Reduzido para produção
```

### 3. Worker Otimizado para Produção

**Arquivo**: `worker/production-optimized.worker.ts`

Características:
- ✅ Configurações otimizadas para recursos limitados
- ✅ Monitoramento de saúde automático
- ✅ Shutdown graceful
- ✅ Logs otimizados (menos spam)
- ✅ Alertas de memória alta

### 4. Scripts de Diagnóstico

**Arquivos criados**:
- `scripts/diagnose-queue-production.js` - Diagnóstico detalhado
- `scripts/diagnose-queue-production.ps1` - Interface PowerShell

## 🚀 Como Aplicar as Correções

### Passo 1: Atualizar Docker Compose
```bash
# Parar containers
docker-compose -f docker-compose-prod.yml down

# Aplicar mudanças (já feitas no arquivo)
docker-compose -f docker-compose-prod.yml up -d
```

### Passo 2: Definir Variáveis de Ambiente
Adicionar ao `.env.production`:
```bash
# Configurações otimizadas para produção
LEADS_CHATWIT_CONCURRENCY=5
LEADS_CHATWIT_LOCK_DURATION=45000
LEADS_CHATWIT_MAX_RETRIES=3
```

### Passo 3: Usar Worker Otimizado (Opcional)
Para usar o worker otimizado, alterar no `docker-compose-prod.yml`:
```yaml
command: node dist/worker/production-optimized.worker.js
```

### Passo 4: Monitorar Resultados
```bash
# Executar diagnóstico
node scripts/diagnose-queue-production.js

# Ou via PowerShell
.\scripts\diagnose-queue-production.ps1 -Detailed
```

## 📈 Resultados Esperados

### Antes da Correção
- ❌ 6/15 jobs processados (40%)
- ❌ Container sobrecarregado
- ❌ Jobs ficando na fila

### Depois da Correção
- ✅ 15/15 jobs processados (100%)
- ✅ Recursos adequados
- ✅ Processamento estável

## 🔍 Monitoramento Contínuo

### Comandos Úteis

```bash
# Verificar status dos containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Verificar uso de recursos
docker stats --no-stream

# Ver logs do worker
docker logs worker_agendamento --tail 50

# Diagnóstico completo
.\scripts\diagnose-queue-production.ps1 -Detailed
```

### Métricas a Monitorar

1. **Jobs na Fila**
   - Aguardando: < 10
   - Ativos: 1-5 (baseado na concorrência)
   - Taxa de falha: < 5%

2. **Recursos do Container**
   - CPU: < 80%
   - Memória: < 90%
   - Uptime: Estável

3. **Performance**
   - Tempo de processamento: < 30s por job
   - Throughput: 15+ jobs/minuto

## 🚨 Alertas e Troubleshooting

### Se jobs ainda ficarem na fila:

1. **Verificar recursos**:
   ```bash
   docker stats worker_agendamento
   ```

2. **Aumentar concorrência gradualmente**:
   ```bash
   # Testar com 6, depois 7, etc.
   LEADS_CHATWIT_CONCURRENCY=6
   ```

3. **Verificar logs de erro**:
   ```bash
   docker logs worker_agendamento | grep ERROR
   ```

### Se container ficar sem memória:

1. **Aumentar limite**:
   ```yaml
   memory: 1536M  # ou 2048M
   ```

2. **Reduzir concorrência**:
   ```bash
   LEADS_CHATWIT_CONCURRENCY=3
   ```

## 📝 Notas Importantes

- ⚠️ **Sempre testar mudanças em staging primeiro**
- ⚠️ **Monitorar por 24h após aplicar correções**
- ⚠️ **Manter backup das configurações anteriores**
- ⚠️ **Documentar qualquer ajuste adicional**

## 🎯 Próximos Passos

1. **Implementar alertas automáticos** para fila cheia
2. **Configurar auto-scaling** baseado na carga
3. **Otimizar queries do banco** para reduzir tempo de processamento
4. **Implementar circuit breaker** para falhas em cascata

---

**Status**: ✅ Correções implementadas e prontas para deploy
**Prioridade**: 🔥 Alta - Impacta processamento de leads
**Estimativa**: 30min para aplicar + 2h monitoramento