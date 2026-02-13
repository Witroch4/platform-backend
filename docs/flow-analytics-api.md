# Flow Analytics API Documentation

Documentação completa dos endpoints de API do Flow Analytics Dashboard.

## Autenticação

Todos os endpoints requerem autenticação via NextAuth.js. O usuário deve estar autenticado e ter acesso à inbox especificada.

## Endpoints

### 1. KPIs Executivos

**GET** `/api/admin/mtf-diamante/flow-analytics/kpis`

Retorna métricas executivas agregadas para análise de performance.

**Query Parameters:**
- `inboxId` (required): ID da inbox
- `flowId` (optional): Filtrar por flow específico
- `dateStart` (optional): Data inicial (ISO string)
- `dateEnd` (optional): Data final (ISO string)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalExecutions": 150,
    "completionRate": 75.5,
    "abandonmentRate": 24.5,
    "avgTimeToCompletion": 45000,
    "avgTimeToAbandonment": 30000,
    "errorRate": 5.2,
    "conversionRate": 68.3,
    "avgClickThroughRate": 82.1,
    "avgResponseRate": 91.4,
    "activeSessionsCount": 12
  }
}
```

**Cache:** 30 segundos (Redis)

---

### 2. Heatmap de Comportamento

**GET** `/api/admin/mtf-diamante/flow-analytics/heatmap`

Retorna dados de heatmap para visualização de comportamento por nó.

**Query Parameters:**
- `flowId` (required): ID do flow
- `inboxId` (optional): Filtrar por inbox específica
- `dateStart` (optional): Data inicial (ISO string)
- `dateEnd` (optional): Data final (ISO string)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nodeId": "node_123",
      "nodeName": "Mensagem de Boas-vindas",
      "nodeType": "INTERACTIVE_MESSAGE",
      "visitCount": 100,
      "visitPercentage": 100.0,
      "avgTimeSpent": 5000,
      "dropOffRate": 15.0,
      "dropOffCount": 15,
      "health": "healthy"
    }
  ]
}
```

**Cache:** 60 segundos (Redis)

---

### 3. Funil de Conversão

**GET** `/api/admin/mtf-diamante/flow-analytics/funnel`

Retorna dados do funil de conversão mostrando progressão entre etapas.

**Query Parameters:**
- `flowId` (required): ID do flow
- `inboxId` (optional): Filtrar por inbox específica
- `dateStart` (optional): Data inicial (ISO string)
- `dateEnd` (optional): Data final (ISO string)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nodeId": "node_start",
      "nodeName": "Início",
      "nodeType": "START",
      "sessionCount": 100,
      "percentage": 100.0,
      "dropOffPercentage": 0.0,
      "order": 0
    },
    {
      "nodeId": "node_123",
      "nodeName": "Primeira Pergunta",
      "nodeType": "INTERACTIVE_MESSAGE",
      "sessionCount": 85,
      "percentage": 85.0,
      "dropOffPercentage": 15.0,
      "order": 1
    }
  ]
}
```

**Cache:** 60 segundos (Redis)

---

### 4. Detalhes de Sessão

**GET** `/api/admin/mtf-diamante/flow-analytics/sessions/:sessionId`

Retorna detalhes completos de uma sessão incluindo log de execução.

**Path Parameters:**
- `sessionId` (required): ID da sessão

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "session_123",
    "flowId": "flow_456",
    "flowName": "Atendimento Principal",
    "conversationId": "conv_789",
    "contactId": "contact_012",
    "status": "COMPLETED",
    "createdAt": "2024-01-15T10:00:00Z",
    "completedAt": "2024-01-15T10:05:00Z",
    "variables": {
      "userName": "João",
      "userEmail": "joao@example.com"
    },
    "executionLog": [
      {
        "timestamp": "2024-01-15T10:00:00Z",
        "nodeId": "node_start",
        "nodeName": "Início",
        "nodeType": "START",
        "action": "executed",
        "durationMs": 100,
        "deliveryMode": "sync",
        "status": "ok"
      }
    ],
    "lastNodeVisited": "node_end",
    "inactivityTime": null
  }
}
```

**Cache:** Nenhum

---

### 5. Alertas de Qualidade

**GET** `/api/admin/mtf-diamante/flow-analytics/alerts`

Retorna alertas de qualidade detectados automaticamente.

**Query Parameters:**
- `inboxId` (required): ID da inbox
- `flowId` (optional): Filtrar por flow específico
- `dateStart` (optional): Data inicial (ISO string)
- `dateEnd` (optional): Data final (ISO string)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "alert_123",
      "type": "high_dropoff",
      "severity": "critical",
      "title": "Taxa de abandono crítica",
      "message": "Nó com 55.0% de abandono (11/20 sessões)",
      "flowId": "flow_456",
      "flowName": "Atendimento Principal",
      "nodeId": "node_123",
      "nodeName": "Pergunta Complexa",
      "metadata": {
        "dropOffRate": 55.0,
        "totalSessions": 20,
        "dropOffCount": 11
      },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Cache:** Nenhum (atualização em tempo real)

---

## Tipos de Alerta

### high_dropoff
- **Severidade:** critical
- **Condição:** Taxa de abandono > 50% com mínimo de 5 sessões
- **Ação recomendada:** Revisar conteúdo e fluxo do nó

### stuck_session
- **Severidade:** warning
- **Condição:** Sessão em WAITING_INPUT por > 60 minutos
- **Ação recomendada:** Verificar se usuário precisa de assistência

### recurring_error
- **Severidade:** critical
- **Condição:** 5+ erros no mesmo nó em 1 hora
- **Ação recomendada:** Investigar causa raiz do erro

---

## Códigos de Erro

- `401` - Não autenticado
- `403` - Acesso negado à inbox
- `404` - Recurso não encontrado
- `400` - Parâmetros inválidos
- `500` - Erro interno do servidor

---

## Rate Limiting

Não há rate limiting específico para estes endpoints, mas eles respeitam os limites globais da aplicação.

---

## Caching

Os endpoints utilizam Redis para cache com os seguintes TTLs:
- KPIs: 30 segundos
- Heatmap: 60 segundos
- Funnel: 60 segundos
- Alertas: Sem cache (tempo real)
- Sessões: Sem cache (dados dinâmicos)

---

## Performance

### Índices de Banco de Dados

Os seguintes índices foram criados para otimizar as queries:

```sql
CREATE INDEX "FlowSession_flowId_status_idx" ON "FlowSession"("flowId", "status");
CREATE INDEX "FlowSession_flowId_createdAt_idx" ON "FlowSession"("flowId", "createdAt");
CREATE INDEX "FlowSession_status_updatedAt_idx" ON "FlowSession"("status", "updatedAt");
CREATE INDEX "FlowSession_createdAt_idx" ON "FlowSession"("createdAt");
CREATE INDEX "Flow_inboxId_isActive_idx" ON "Flow"("inboxId", "isActive");
CREATE INDEX "FlowSession_flowId_status_createdAt_idx" ON "FlowSession"("flowId", "status", "createdAt");
```

### Metas de Performance

- KPIs: < 500ms
- Heatmap: < 1000ms
- Funnel: < 800ms
- Alertas: < 600ms
- Sessão: < 300ms

---

## Exemplos de Uso

### Buscar KPIs dos últimos 7 dias

```bash
curl -X GET \
  'https://api.example.com/api/admin/mtf-diamante/flow-analytics/kpis?inboxId=inbox_123&dateStart=2024-01-08T00:00:00Z&dateEnd=2024-01-15T23:59:59Z' \
  -H 'Cookie: next-auth.session-token=...'
```

### Buscar heatmap de um flow específico

```bash
curl -X GET \
  'https://api.example.com/api/admin/mtf-diamante/flow-analytics/heatmap?flowId=flow_456&inboxId=inbox_123' \
  -H 'Cookie: next-auth.session-token=...'
```

### Buscar alertas críticos

```bash
curl -X GET \
  'https://api.example.com/api/admin/mtf-diamante/flow-analytics/alerts?inboxId=inbox_123' \
  -H 'Cookie: next-auth.session-token=...'
```
