# Flow Analytics Dashboard - Implementação Completa

## Visão Geral

Dashboard completo de análise de qualidade e performance para o Flow Engine, fornecendo insights acionáveis sobre execução de flows, comportamento de usuários e saúde operacional.

## Funcionalidades Implementadas

### ✅ 1. KPIs Executivos (Tasks 1-5)
- 10 métricas principais de performance
- Atualização automática a cada 30 segundos
- Cache Redis para otimização
- Cards responsivos com ícones e cores

**Métricas:**
- Total de execuções
- Taxa de conclusão
- Taxa de abandono
- Tempo médio até conclusão
- Tempo médio até abandono
- Taxa de erro
- Taxa de conversão
- CTR médio de botões
- Taxa de resposta após delays
- Sessões ativas

### ✅ 2. Heatmap Visual (Tasks 6-8)
- Visualização de comportamento por nó
- Overlay de métricas no canvas do flow
- Indicadores de saúde (verde/amarelo/vermelho)
- Painel de detalhes por nó
- Identificação de gargalos

**Métricas por Nó:**
- Contagem de visitas
- Percentual de visitas
- Tempo médio no nó
- Taxa de abandono
- Status de saúde

### ✅ 3. Funil de Conversão (Tasks 9, 12)
- Visualização de progressão entre etapas
- Gráfico de barras com Recharts
- Percentuais de drop-off
- Identificação do maior ponto de abandono
- Cores baseadas em severidade

### ✅ 4. Gerenciamento de Sessões (Task 13)
- Lista de sessões com filtros
- Busca por ID de conversa/contato/flow
- Modal de replay com timeline detalhada
- Ações: visualizar, abortar, excluir
- Atualização automática a cada 5 segundos

**Replay de Sessão:**
- Timeline cronológica
- Timestamps e durações
- Modo de entrega (sync/async)
- Status de cada etapa
- Variáveis da sessão
- Detalhes de erros

### ✅ 5. Sistema de Alertas (Task 14)
- Geração automática de alertas
- 3 tipos de alertas implementados
- Severidades: crítico, aviso, info
- Atualização a cada 15 segundos

**Tipos de Alerta:**
1. **Alto Abandono**: Taxa > 50% com mínimo 5 sessões
2. **Sessão Travada**: WAITING_INPUT por > 60 minutos
3. **Erro Recorrente**: 5+ erros no mesmo nó em 1 hora

### ✅ 6. Otimizações de Performance (Task 15)
- Índices de banco de dados
- Cache Redis (30-60s TTL)
- Error boundaries em todos componentes
- Loading states e error handling
- Queries otimizadas

**Índices Criados:**
```sql
FlowSession_flowId_status_idx
FlowSession_flowId_createdAt_idx
FlowSession_status_updatedAt_idx
FlowSession_createdAt_idx
Flow_inboxId_isActive_idx
FlowSession_flowId_status_createdAt_idx
```

### ✅ 7. Integração e Polish (Task 16)
- Design responsivo (mobile/tablet/desktop)
- Documentação completa da API
- Error boundaries
- Tratamento de erros robusto
- TypeScript sem erros

## Arquitetura

### Componentes React
```
app/admin/mtf-diamante/components/
├── FlowAnalyticsDashboard.tsx          # Dashboard principal
└── flow-analytics/
    ├── ExecutiveKPICards.tsx           # Cards de KPIs
    ├── HeatmapVisualization.tsx        # Heatmap visual
    ├── FunnelChart.tsx                 # Funil de conversão
    ├── GlobalFilters.tsx               # Filtros globais
    ├── AlertsPanel.tsx                 # Painel de alertas
    ├── SessionReplayModal.tsx          # Modal de replay
    └── ErrorBoundary.tsx               # Error boundary
```

### Serviços de Cálculo
```
lib/flow-analytics/
├── kpi-service.ts                      # Cálculo de KPIs
├── heatmap-service.ts                  # Cálculo de heatmap
├── funnel-service.ts                   # Cálculo de funil
├── alert-service.ts                    # Geração de alertas
└── README.md                           # Esta documentação
```

### API Endpoints
```
app/api/admin/mtf-diamante/flow-analytics/
├── kpis/route.ts                       # GET KPIs
├── heatmap/route.ts                    # GET Heatmap
├── funnel/route.ts                     # GET Funil
├── alerts/route.ts                     # GET Alertas
└── sessions/[sessionId]/route.ts       # GET Sessão
```

## Uso

### Integração no MTF Diamante

O dashboard está integrado no painel MTF Diamante e pode ser acessado através da aba "Analytics" ou similar.

```tsx
import { FlowAnalyticsDashboard } from './components/FlowAnalyticsDashboard';

<FlowAnalyticsDashboard inboxId={inboxId} />
```

### Filtros Globais

Todos os dados podem ser filtrados por:
- **Inbox**: Obrigatório
- **Flow**: Opcional (alguns recursos requerem)
- **Data Range**: Opcional (últimos 7/30 dias, custom)

### Tabs do Dashboard

1. **Visão Geral**: KPIs + Alertas + Funil
2. **Heatmap**: Visualização de comportamento (requer flow selecionado)
3. **Sessões**: Lista e gerenciamento de sessões

## Performance

### Metas de Resposta
- KPIs: < 500ms
- Heatmap: < 1000ms
- Funil: < 800ms
- Alertas: < 600ms
- Sessão: < 300ms

### Cache
- KPIs: 30 segundos
- Heatmap: 60 segundos
- Funil: 60 segundos
- Alertas: Sem cache (tempo real)
- Sessões: Sem cache (dinâmico)

### Auto-refresh
- KPIs: 30 segundos
- Heatmap: 60 segundos
- Sessões: 5 segundos
- Alertas: 15 segundos

## Testes

### Property-Based Tests
Implementados para:
- Cálculo de KPIs
- Cálculo de heatmap
- Cálculo de funil

### Unit Tests
Implementados para:
- Edge cases de KPIs
- Edge cases de heatmap
- Validação de dados

## Documentação

- **API**: `docs/flow-analytics-api.md`
- **Implementação**: Este arquivo
- **Migrações**: `prisma/migrations/add_flow_analytics_indexes.sql`

## Próximos Passos (Futuro)

Features avançadas que podem ser adicionadas:
- Path analysis detalhada
- Temporal analysis por hora/dia
- A/B testing comparison
- Export avançado (CSV/JSON)
- Real-time updates via WebSocket
- Performance metrics técnicos detalhados
- Abandonment path mapping
- Flow health score com sparklines

## Requisitos Validados

✅ Requirements 1.1-1.9: Executive KPIs
✅ Requirements 2.1-2.10: Heatmap Visualization
✅ Requirements 3.1-3.8: Funnel Analysis
✅ Requirements 4.1-4.10: Session Replay
✅ Requirements 6.1-6.5: Quality Alerts
✅ Requirements 11.1-11.8: Advanced Filtering
✅ Requirements 13.1-13.10: Session Management
✅ Requirements 16.1-16.9: Dashboard Organization
✅ Requirements 17.1-17.4: Real-time Updates
✅ Requirements 18.1-18.10: Responsive Design
✅ Requirements 19.1-19.6: API Endpoints
✅ Requirements 20.1-20.9: Performance Optimization

## Tecnologias Utilizadas

- **Frontend**: React 18, Next.js 15, TypeScript
- **UI**: Shadcn/UI, Tailwind CSS
- **Data Fetching**: SWR 2.3.6
- **Charts**: Recharts
- **Flow Visualization**: React Flow
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma
- **Cache**: Redis (ioredis)
- **Authentication**: NextAuth.js v5

## Manutenção

### Adicionar Novo Tipo de Alerta

1. Adicionar tipo em `lib/flow-analytics/alert-service.ts`
2. Implementar função de geração
3. Adicionar ao `generateAlerts()`
4. Atualizar label em `AlertsPanel.tsx`

### Adicionar Nova Métrica de KPI

1. Adicionar cálculo em `lib/flow-analytics/kpi-service.ts`
2. Atualizar tipo `ExecutiveKPIs`
3. Adicionar card em `ExecutiveKPICards.tsx`

### Otimizar Query Lenta

1. Verificar logs de performance
2. Adicionar índice apropriado
3. Considerar cache adicional
4. Revisar lógica de agregação

---

**Implementado por**: Kiro AI Assistant
**Data**: Janeiro 2024
**Versão**: 1.0.0 (MVP)
