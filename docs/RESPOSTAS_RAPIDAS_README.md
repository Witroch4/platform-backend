# 🚀 Sistema de Respostas Rápidas (Flash Intent)

O Sistema de Respostas Rápidas é uma funcionalidade avançada que otimiza o processamento de webhooks e mensagens do WhatsApp, proporcionando respostas em menos de 100ms e processamento de alta prioridade.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Como Usar](#como-usar)
- [Interface de Administração](#interface-de-administração)
- [API](#api)
- [CLI](#cli)
- [Integração com Webhook](#integração-com-webhook)
- [Monitoramento](#monitoramento)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

A Flash Intent é um sistema de feature flags que permite ativar/desativar funcionalidades de resposta rápida de forma granular:

- **Global**: Ativa para todos os usuários do sistema
- **Por Usuário**: Ativa apenas para usuários específicos
- **Por Funcionalidade**: Controle granular de cada componente

### Componentes da Flash Intent

1. **NEW_WEBHOOK_PROCESSING** - Processamento otimizado de webhooks
2. **HIGH_PRIORITY_QUEUE** - Fila de alta prioridade para respostas imediatas
3. **LOW_PRIORITY_QUEUE** - Fila de baixa prioridade para persistência
4. **UNIFIED_LEAD_MODEL** - Modelo unificado de leads
5. **INTELLIGENT_CACHING** - Cache inteligente para credenciais
6. **APPLICATION_MONITORING** - Monitoramento avançado de performance

## ✨ Funcionalidades

### 🌐 Controle Global
- Ativar/desativar Flash Intent para todo o sistema
- Rollout gradual com percentuais configuráveis
- Rollback de emergência em caso de problemas

### 👤 Controle por Usuário
- Ativar Flash Intent para usuários específicos
- Lista de usuários com status individual
- Busca e filtros por nome/email

### 📊 Monitoramento em Tempo Real
- Estatísticas de uso e performance
- Saúde das filas de processamento
- Métricas de resposta e throughput

### 🔧 Gerenciamento via CLI
- Scripts para automação e deployment
- Comandos para verificação de status
- Health checks do sistema

## 🖥️ Como Usar

### Interface Web

1. Acesse o painel administrativo: `/admin`
2. Clique em "⚡ Respostas Rápidas" 
3. Use o controle global ou configure usuários individuais

### Via CLI

```bash
# Verificar status
npm run flash-intent -- status

# Ativar globalmente
npm run flash-intent -- enable-global

# Ativar para usuário específico
npm run flash-intent -- enable-user clp123abc

# Ver estatísticas
npm run flash-intent -- stats

# Health check
npm run flash-intent -- health-check
```

## 🎛️ Interface de Administração

### Página Principal: `/admin/resposta-rapida`

#### Controle Global
- **Switch Global**: Ativa/desativa Flash Intent para todo o sistema
- **Status em Tempo Real**: Mostra se as funcionalidades estão ativas
- **Estatísticas**: Número de usuários, filas ativas, etc.

#### Gestão de Usuários
- **Lista de Usuários**: Todos os usuários do sistema
- **Switch Individual**: Ativa/desativa por usuário
- **Busca**: Filtrar por nome ou email
- **Status Visual**: Badges indicando se está ativa/inativa

#### Dashboard de Métricas
- **Total de Usuários**: Quantidade total no sistema
- **Flash Intent Ativa**: Quantos usuários têm a funcionalidade ativa
- **Saúde das Filas**: Status das filas de processamento
- **Performance**: Métricas de resposta e throughput

## 🔌 API

### Endpoints Disponíveis

#### `GET /api/admin/resposta-rapida/users`
Lista todos os usuários com status da Flash Intent
```json
{
  "users": [
    {
      "id": "clp123abc",
      "name": "João Silva",
      "email": "joao@exemplo.com",
      "role": "ADMIN",
      "flashIntentEnabled": true
    }
  ],
  "total": 150
}
```

#### `GET /api/admin/resposta-rapida/stats`
Estatísticas do sistema
```json
{
  "totalUsers": 150,
  "flashIntentEnabledUsers": 75,
  "queueHealth": {
    "respostaRapida": true,
    "persistenciaCredenciais": true
  }
}
```

#### `GET /api/admin/resposta-rapida/global-status`
Status global da Flash Intent
```json
{
  "enabled": true,
  "components": {
    "newWebhookProcessing": true,
    "highPriorityQueue": true,
    "lowPriorityQueue": true,
    "unifiedLeadModel": true,
    "intelligentCaching": true,
    "applicationMonitoring": true
  }
}
```

#### `POST /api/admin/resposta-rapida/toggle-user`
Ativa/desativa Flash Intent para usuário
```json
{
  "userId": "clp123abc",
  "enabled": true
}
```

#### `POST /api/admin/resposta-rapida/toggle-global`
Ativa/desativa Flash Intent globalmente
```json
{
  "enabled": true
}
```

## 🖥️ CLI

### Comandos Disponíveis

```bash
# Status geral
npm run flash-intent -- status

# Controle global
npm run flash-intent -- enable-global
npm run flash-intent -- disable-global

# Controle por usuário
npm run flash-intent -- enable-user <userId>
npm run flash-intent -- disable-user <userId>

# Informações
npm run flash-intent -- stats
npm run flash-intent -- list-users
npm run flash-intent -- health-check
```

### Exemplos de Uso

```bash
# Verificar status atual
npm run flash-intent -- status
# 🌐 Status Global: ✅ ATIVA
# 📊 Componentes:
#   • Webhook Processing:     ✅
#   • High Priority Queue:    ✅
#   • Low Priority Queue:     ✅

# Ativar para usuário específico
npm run flash-intent -- enable-user clp123abc
# ✅ Flash Intent ativada para João Silva
# ⚡ Usuário clp123abc agora tem acesso às respostas rápidas

# Ver estatísticas
npm run flash-intent -- stats
# 📊 Estatísticas da Flash Intent...
# 🌐 Status Global: ✅ ATIVA
# 👥 Total de Usuários: 150
# ⚡ Usuários com Flash Intent: 75
# 📈 Percentual de Adoção: 50.0%
```

## 🔗 Integração com Webhook

### Uso Básico

```typescript
import { processWebhookWithFlashIntent } from "@/lib/resposta-rapida/webhook-integration";

// No webhook handler
const result = await processWebhookWithFlashIntent({
  type: "intent",
  intentName: "welcome_message",
  recipientPhone: "+5511999999999",
  whatsappApiKey: "token123",
  inboxId: "inbox-456",
  userId: "user-789",
  correlationId: "corr-abc123",
  originalPayload: requestData,
});

// result.processingMode = "flash" | "standard"
// result.queueUsed = "high_priority" | "low_priority"
```

### Verificação de Status

```typescript
import { isFlashIntentActive } from "@/lib/resposta-rapida/flash-intent-checker";

// Verificar se está ativa para usuário
const isActive = await isFlashIntentActive("user-id");

// Verificar globalmente
const isGlobalActive = await isFlashIntentActive();
```

## 📊 Monitoramento

### Métricas Automáticas

A Flash Intent registra automaticamente:

- **webhook_response_time**: Tempo de resposta do webhook (target: < 100ms)
- **worker_processing_time**: Tempo de processamento do worker (target: < 5s)
- **cache_hit_rate**: Taxa de acerto do cache (target: > 70%)
- **queue_processing_rate**: Taxa de processamento das filas (jobs/min)
- **flash_intent_usage_percentage**: Percentual de uso da Flash Intent

### Dashboard de Monitoramento

Acesse `/admin/resposta-rapida` para ver:

- Status em tempo real das filas
- Número de usuários com Flash Intent ativa
- Performance das funcionalidades
- Alertas de saúde do sistema

### Health Checks

```bash
# Via CLI
npm run flash-intent -- health-check

# Via API
curl http://localhost:3000/api/admin/resposta-rapida/stats
```

## 🚨 Troubleshooting

### Problemas Comuns

#### Flash Intent não está funcionando
1. Verificar se está ativa: `npm run flash-intent -- status`
2. Verificar saúde do sistema: `npm run flash-intent -- health-check`
3. Verificar logs do worker: `docker logs <worker-container>`

#### Usuário não recebe respostas rápidas
1. Verificar se Flash Intent está ativa para o usuário
2. Verificar se o userId está sendo passado corretamente no webhook
3. Verificar logs de processamento

#### Filas não estão processando
1. Verificar se Redis está funcionando
2. Verificar se workers estão rodando
3. Verificar feature flags das filas

### Logs Importantes

```bash
# Logs do webhook
[Flash Intent] Status para usuário user-123: ATIVA
[Flash Intent] Processando com ALTA PRIORIDADE

# Logs do worker
[Worker] Processando job com Flash Intent: ATIVA
[Intent Processor] Processing intent: welcome_message
```

### Rollback de Emergência

Se houver problemas, desative imediatamente:

```bash
# Via CLI
npm run flash-intent -- disable-global

# Via API
curl -X POST http://localhost:3000/api/admin/resposta-rapida/toggle-global \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## 🔧 Configuração de Produção

### Variáveis de Ambiente

```bash
# Feature Flags
FLASH_INTENT_ENABLED=true
FLASH_INTENT_DEFAULT_ROLLOUT=100

# Performance
WEBHOOK_RESPONSE_TIME_THRESHOLD=100
WORKER_PROCESSING_TIME_THRESHOLD=5000
CACHE_HIT_RATE_THRESHOLD=70

# Filas
RESPOSTA_RAPIDA_CONCURRENCY=10
PERSISTENCIA_CREDENCIAIS_CONCURRENCY=5
```

### Deployment

1. **Fase 1**: Ativar monitoramento
2. **Fase 2**: Ativar filas com rollout gradual
3. **Fase 3**: Ativar processamento otimizado
4. **Fase 4**: Ativar cache inteligente
5. **Fase 5**: Rollout completo

```bash
# Rollout gradual
npm run flash-intent -- enable-global  # Começa com 0%
# Aumentar gradualmente: 10%, 25%, 50%, 100%
```

## 📚 Documentação Adicional

- [Guia de Arquitetura do Sistema](./SYSTEM_ARCHITECTURE_GUIDE.md)
- [Exemplo de Integração](./FLASH_INTENT_INTEGRATION_EXAMPLE.md)
- [API Reference](./API_REFERENCE.md)

## 🤝 Suporte

Para dúvidas ou problemas:

1. Verificar logs do sistema
2. Executar health check: `npm run flash-intent -- health-check`
3. Consultar documentação de troubleshooting
4. Contatar equipe de desenvolvimento

---

**⚡ Flash Intent - Respostas em milissegundos, experiência em tempo real!**