# CONCURRENCY_LIMIT_UPDATE - Resolução do Problema "Sistema Ocupado"

## 📋 Resumo das Alterações

### ✅ Problema Resolvido
- **Antes**: Limite de 3 operações simultâneas por inbox causava degradação e resposta "Sistema ocupado"
- **Depois**: Limite aumentado para 100 operações simultâneas por inbox com configuração via variáveis de ambiente

### 🔧 Arquivos Modificados

#### 1. `lib/socialwise-flow/concurrency-manager.ts`
```typescript
// ANTES (linha 57)
maxConcurrentLlmCallsPerInbox: 3,
maxConcurrentLlmCallsGlobal: 50,

// DEPOIS (com ENV configurável)
maxConcurrentLlmCallsPerInbox: parseInt(process.env.SOCIALWISE_CONCURRENCY_LIMIT || '100', 10),
maxConcurrentLlmCallsGlobal: parseInt(process.env.SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT || '300', 10),
```

#### 2. `.env.docker.example` (Novas Variáveis)
```bash
# SocialWise Flow Concurrency Configuration
SOCIALWISE_CONCURRENCY_LIMIT=100              # Operações simultâneas por inbox (default: 100)
SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT=300       # Limite global de operações (default: 300)
SOCIALWISE_QUEUE_TIMEOUT_MS=5000              # Timeout da fila em ms (default: 5000)
SOCIALWISE_DEGRADATION_ENABLED=true           # Habilita degradação em sobrecarga (default: true)
```

#### 3. `config.yml` (Novo Arquivo)
- Arquivo consolidado com todas as configurações de limites do sistema
- Centraliza documentação de variáveis de ambiente
- Serve como referência para operações

## 🚀 Configuração e Deploy

### Variáveis de Ambiente Disponíveis

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SOCIALWISE_CONCURRENCY_LIMIT` | 100 | Operações simultâneas por inbox |
| `SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT` | 300 | Limite global de operações |
| `SOCIALWISE_QUEUE_TIMEOUT_MS` | 5000 | Timeout da fila em ms |
| `SOCIALWISE_DEGRADATION_ENABLED` | true | Habilita degradação em sobrecarga |

### Para Ambientes de Produção

1. **Docker/Container**:
   ```bash
   # No .env ou docker-compose.yml
   SOCIALWISE_CONCURRENCY_LIMIT=100
   SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT=300
   ```

2. **Kubernetes**:
   ```yaml
   env:
     - name: SOCIALWISE_CONCURRENCY_LIMIT
       value: "100"
     - name: SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT
       value: "300"
   ```

3. **Ambiente Local**:
   ```bash
   # No .env.local
   SOCIALWISE_CONCURRENCY_LIMIT=50  # Menor para desenvolvimento
   ```

## 📊 Logs de Debug Adicionados

### Payload Original RAW
```
🔍 CHATWIT ORIGINAL RAW PAYLOAD DEBUG
Headers: {...}
Payload Size: 1234 bytes
Raw String: "{"sender":...}"
```

### Payload JSON Parseado
```
📋 CHATWIT PARSED JSON PAYLOAD DEBUG
Structure: {...}
Message Type: text
Sender: {...}
```

## 🔍 Monitoramento e Observabilidade

### Métricas para Acompanhar
1. **Taxa de Degradação**: Deve diminuir significativamente
2. **Latência de Resposta**: Monitorar se não aumentou
3. **Uso de Memória**: Verificar se o aumento de concorrência afeta RAM
4. **Taxa de Erro**: Garantir que não aumentou

### Logs Relevantes
```bash
# Verificar logs de concorrência
grep "Inbox concurrency limit exceeded" /var/log/chatwit.log

# Verificar operações em degradação
grep "LLM operation degraded" /var/log/chatwit.log

# Monitorar estatísticas de concorrência
grep "Concurrency slot acquired" /var/log/chatwit.log
```

## 🧪 Testes

### Validação Local
```bash
# 1. Verificar TypeScript
npx tsc --noEmit

# 2. Executar testes de concorrência
npm test -- concurrency-load.test.ts

# 3. Testar configuração de ambiente
SOCIALWISE_CONCURRENCY_LIMIT=50 npm run dev
```

### Testes de Carga
- Testes existentes em `lib/socialwise-flow/__tests__/concurrency-load.test.ts` continuam válidos
- Testes usam configuração própria (`maxConcurrentLlmCallsPerInbox: 2`) não afetada

## 📈 Impacto Esperado

### ✅ Benefícios
- **Eliminação do "Sistema ocupado"**: 97x mais capacidade (3→100)
- **Melhor experiência do usuário**: Respostas mais rápidas
- **Configuração flexível**: Ajuste por ambiente via ENV
- **Degradação inteligente**: Mantém funcionalidade em picos

### ⚠️ Considerações
- **Uso de memória**: Monitorar com o aumento de concorrência
- **Rate limits de APIs**: Verificar limites do OpenAI/ChatGPT
- **Recursos do servidor**: Avaliar se a infraestrutura suporta

## 🔄 Rollback (se necessário)

```bash
# Voltar aos valores anteriores via ENV
SOCIALWISE_CONCURRENCY_LIMIT=3
SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT=50

# Ou via código
# Reverter commit em lib/socialwise-flow/concurrency-manager.ts
```

## 📋 Checklist de Deploy

- [ ] Verificar TypeScript compilation (`npx tsc --noEmit`)
- [ ] Configurar variáveis de ambiente
- [ ] Monitorar logs após deploy
- [ ] Verificar métricas de performance
- [ ] Acompanhar rate de degradação
- [ ] Documentar configuração específica do ambiente

---

**Data**: 2025-01-28  
**Autor**: GitHub Copilot  
**Versão**: 1.0  
**Status**: ✅ Implementado e Testado
