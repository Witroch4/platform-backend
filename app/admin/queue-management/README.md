# Sistema de Gerenciamento de Filas BullMQ

## Visão Geral

Este sistema fornece um dashboard completo para monitoramento e gerenciamento de filas BullMQ, com controle de acesso restrito a usuários com role `SUPERADMIN`.

## Acesso ao Sistema

### Pré-requisitos

- Usuário deve ter role `SUPERADMIN` no sistema
- Estar logado na aplicação

### URLs de Acesso

- **Dashboard Principal**: `/admin/queue-management`
- **Logs de Auditoria**: `/admin/queue-management/audit-logs`
- **Monitoramento de Produção**: `/admin/queue-management/production-monitoring`

### Autenticação e Autorização

O sistema utiliza o Auth.js 5 existente com as seguintes características:

1. **Middleware de Autenticação**: Reutiliza o middleware existente em `middleware.ts`
2. **Controle de Roles**: Apenas usuários com role `SUPERADMIN` podem acessar
3. **Rotas Protegidas**: Configuradas em `config/routes/index.ts`
4. **Redirecionamento**: Usuários sem permissão são redirecionados para `/denied`

## Funcionalidades

### Dashboard Principal (`/admin/queue-management`)

#### Visão Geral

- **Total de Filas**: Número total de filas registradas
- **Jobs Aguardando**: Soma de todos os jobs em espera
- **Jobs Ativos**: Soma de todos os jobs sendo processados
- **Jobs Falharam**: Soma de todos os jobs que falharam

#### Gerenciamento de Filas

Para cada fila, é possível:

- **Pausar/Retomar**: Controlar o processamento da fila
- **Retry**: Tentar novamente todos os jobs falhados
- **Limpar**: Remover jobs concluídos

#### Atualização Automática

- Dashboard atualiza automaticamente a cada 5 segundos
- Status em tempo real das filas

### Logs de Auditoria (`/admin/queue-management/audit-logs`)

#### Funcionalidades

- **Visualização**: Histórico completo de todas as ações
- **Filtros**: Por ação, recurso, data, usuário
- **Paginação**: Navegação eficiente pelos registros
- **Detalhes**: Informações completas de cada ação

#### Tipos de Ações Registradas

- `QUEUE_PAUSED`: Fila pausada
- `QUEUE_RESUMED`: Fila retomada
- `QUEUE_RETRY_FAILED`: Retry de jobs falhados
- `QUEUE_CLEANED`: Fila limpa

#### Informações Registradas

- **Usuário**: Quem executou a ação
- **Data/Hora**: Timestamp da ação
- **IP**: Endereço IP do usuário
- **User Agent**: Navegador/cliente utilizado
- **Detalhes**: Informações específicas da ação

## APIs Disponíveis

### Listar Filas

```
GET /api/admin/queue-management/queues
```

Retorna status de todas as filas registradas.

### Ações em Filas

```
POST /api/admin/queue-management/queues/{queueName}/{action}
```

Executa ações específicas nas filas:

- `pause`: Pausar fila
- `resume`: Retomar fila
- `retry-failed`: Tentar novamente jobs falhados
- `clean`: Limpar jobs concluídos

### Logs de Auditoria

```
GET /api/admin/queue-management/audit-logs
```

Busca logs com filtros opcionais.

### Estatísticas de Auditoria

```
GET /api/admin/queue-management/audit-logs/stats
```

Retorna estatísticas dos logs de auditoria.

## Segurança

### Controle de Acesso

- Todas as rotas verificam se o usuário tem role `SUPERADMIN`
- APIs retornam erro 403 para usuários não autorizados
- Verificação dupla: middleware + validação na API

### Auditoria

- Todas as ações são registradas automaticamente
- Logs incluem informações de rastreabilidade
- Retenção configurável dos logs (padrão: 90 dias)

### Proteção de Dados

- IPs são armazenados de forma segura
- User agents são registrados para análise de segurança
- Detalhes das ações em formato JSON estruturado

## Estrutura de Arquivos

```
app/admin/queue-management/
├── page.tsx                    # Dashboard principal
├── layout.tsx                  # Layout comum
├── components/
│   └── QueueDashboard.tsx     # Componente principal do dashboard
├── audit-logs/
│   ├── page.tsx               # Página de logs
│   └── components/
│       └── AuditLogsViewer.tsx # Visualizador de logs
└── README.md                  # Esta documentação

app/api/admin/queue-management/
├── queues/
│   ├── route.ts               # API para listar filas
│   └── [queueName]/[action]/
│       └── route.ts           # API para ações em filas
└── audit-logs/
    ├── route.ts               # API para logs
    └── stats/
        └── route.ts           # API para estatísticas

lib/services/
└── audit-log.service.ts       # Serviço de auditoria
```

## Dependências

### Serviços Necessários

- `QueueManagerService`: Para gerenciamento das filas
- `AuditLogService`: Para logging de auditoria
- Banco de dados PostgreSQL com tabela `AuditLog`

### Componentes UI

- Shadcn/ui components
- Lucide React icons
- date-fns para formatação de datas

### Sistema de Conexões Singleton

O projeto utiliza um sistema de conexões singleton para otimizar performance:

```typescript
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";

// Exemplo de uso correto
const prisma = getPrismaInstance();
const redis = getRedisInstance();

// ❌ Evitar criar novas instâncias
// const prisma = new PrismaClient(); // INCORRETO

// ✅ Usar instâncias singleton
// const prisma = getPrismaInstance(); // CORRETO
```

**Benefícios do sistema singleton:**

- Evita cold starts em serverless
- Reutiliza conexões existentes
- Suporte a Hot Module Replacement (HMR)
- Connection pooling otimizado
- Configurações centralizadas

## Manutenção

### Limpeza de Logs

O serviço de auditoria inclui método para limpeza automática:

```typescript
await auditLogService.cleanOldLogs(90); // Remove logs com mais de 90 dias
```

### Monitoramento

- Logs de erro são registrados no console
- Falhas na auditoria não afetam operações principais
- Sistema degrada graciosamente em caso de problemas

## Monitoramento de Produção

### Funcionalidades Implementadas

#### Alertas de Infraestrutura
- **Monitoramento Contínuo**: Verificações automáticas a cada 30 segundos
- **Alertas Inteligentes**: Sistema anti-spam que evita alertas duplicados
- **Severidade Configurável**: LOW, MEDIUM, HIGH, CRITICAL
- **Componentes Monitorados**: Prisma, Redis, Sistema, Filas

#### Tipos de Alertas
- `CONNECTION_FAILURE`: Falhas de conexão com Prisma/Redis
- `HIGH_MEMORY`: Uso excessivo de memória (sistema/Redis)
- `HIGH_CPU`: Uso alto de CPU
- `QUEUE_OVERLOAD`: Filas sobrecarregadas

#### Saúde das Conexões Singleton
- **Monitoramento Prisma**: Tempo de resposta, erros, conectividade
- **Monitoramento Redis**: Ping, uso de memória, clientes conectados
- **Métricas em Tempo Real**: Status, tempo de resposta, contadores de erro

#### Sistema de Backup Automático
- **Backup de Configurações**: Configurações de fila salvas em JSON
- **Backup de Estado**: Estado atual das filas no Redis
- **Backup de Métricas**: Métricas das últimas 24 horas
- **Execução Automática**: A cada 6 horas
- **Backup Manual**: Disponível via interface

#### Disaster Recovery
- **Procedimentos Automáticos**: Recuperação de falhas críticas
- **Execução Condicional**: Baseada em alertas específicos
- **Rollback Suportado**: Reversão de procedimentos executados
- **Monitoramento de Execução**: Status e progresso em tempo real

#### Procedimentos de Recuperação Disponíveis
1. **Recuperação de Conexão Redis**
   - Verificar status, reconectar, validar integridade
   - Execução automática em falhas de conexão

2. **Recuperação de Conexão Prisma**
   - Verificar banco, reconectar, validar conectividade
   - Execução automática em falhas de conexão

3. **Recuperação de Memória Alta**
   - Análise de uso, limpeza de jobs, garbage collection
   - Execução manual (requer aprovação)

4. **Recuperação de Sobrecarga de Filas**
   - Análise de filas, pausar filas sobrecarregadas
   - Execução automática com rollback disponível

### APIs de Monitoramento

#### Obter Status Geral
```bash
GET /api/admin/queue-management/production-monitoring?component=status
```

#### Obter Alertas Ativos
```bash
GET /api/admin/queue-management/production-monitoring?component=alerts
```

#### Obter Saúde das Conexões
```bash
GET /api/admin/queue-management/production-monitoring?component=connections
```

#### Obter Procedimentos de Recovery
```bash
GET /api/admin/queue-management/production-monitoring?component=recovery
```

#### Resolver Alerta
```bash
POST /api/admin/queue-management/production-monitoring
Content-Type: application/json

{
  "action": "resolve_alert",
  "data": { "alertId": "alert_123" }
}
```

#### Executar Procedimento de Recovery
```bash
POST /api/admin/queue-management/production-monitoring
Content-Type: application/json

{
  "action": "execute_recovery",
  "data": { "procedureId": "redis_connection_failure" }
}
```

#### Forçar Backup Manual
```bash
POST /api/admin/queue-management/production-monitoring
Content-Type: application/json

{
  "action": "force_backup",
  "data": {}
}
```

### Configuração e Inicialização

#### Auto-inicialização em Produção
O sistema se inicializa automaticamente em ambiente de produção:

```typescript
import { initializeProductionMonitoring } from '@/lib/monitoring/init-production-monitoring';

// Inicialização automática em produção
if (process.env.NODE_ENV === 'production') {
  await initializeProductionMonitoring();
}
```

#### Configurações por Ambiente
- **Produção**: Limites mais restritivos, backup automático
- **Desenvolvimento**: Limites relaxados, logs detalhados
- **Teste**: Monitoramento desabilitado

#### Integração com Sistema de Conexões Singleton
O monitoramento utiliza as instâncias singleton existentes:

```typescript
import { getPrismaInstance, getRedisInstance } from '@/lib/connections';

// Monitoramento usa as mesmas instâncias
const prisma = getPrismaInstance();
const redis = getRedisInstance();
```

### Segurança e Auditoria

#### Controle de Acesso
- Apenas usuários SUPERADMIN podem acessar
- Todas as ações são auditadas automaticamente
- Logs incluem usuário, timestamp, IP e detalhes

#### Logs de Auditoria
- Alertas salvos na tabela `AuditLog`
- Execuções de recovery registradas
- Backups documentados com status e localização

### Arquivos de Backup

#### Localização
- `/tmp/queue_configs_[timestamp].json` - Configurações
- `/tmp/queue_state_[timestamp].json` - Estado das filas
- `/tmp/queue_metrics_[timestamp].json` - Métricas históricas

#### Formato dos Backups
```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "1.0",
  "data": { ... },
  "metadata": { ... }
}
```

## Próximos Passos

1. **✅ Alertas**: Sistema de alertas implementado
2. **✅ Backup**: Backup automático configurado
3. **✅ Disaster Recovery**: Procedimentos automáticos implementados
4. **✅ Monitoramento**: Dashboard de produção completo
5. **Relatórios**: Gerar relatórios periódicos de atividade
6. **Integração Externa**: Webhooks para Slack/Teams/PagerDuty
