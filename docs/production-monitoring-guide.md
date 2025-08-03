# Guia do Sistema de Monitoramento de Produção

## Visão Geral

O Sistema de Monitoramento de Produção é uma solução completa para monitorar a infraestrutura das filas BullMQ, implementando alertas proativos, backup automático e procedimentos de disaster recovery.

## Componentes Principais

### 1. ProductionMonitor

Responsável pelo monitoramento contínuo da infraestrutura:

- **Monitoramento de Conexões**: Prisma e Redis
- **Alertas Inteligentes**: Sistema anti-spam
- **Backup Automático**: Configurações, estado e métricas
- **Métricas do Sistema**: CPU, memória, uptime

### 2. DisasterRecoveryManager

Gerencia procedimentos automáticos de recuperação:

- **Procedimentos Pré-definidos**: Recuperação de falhas comuns
- **Execução Automática**: Baseada em triggers de alertas
- **Rollback Suportado**: Reversão de procedimentos
- **Monitoramento de Execução**: Status em tempo real

## Instalação e Configuração

### Inicialização Automática

Em ambiente de produção, o sistema se inicializa automaticamente:

```typescript
// lib/monitoring/init-production-monitoring.ts
if (process.env.NODE_ENV === "production") {
  setTimeout(() => {
    initializeProductionMonitoring().catch(console.error);
  }, 10000); // 10 segundos de delay
}
```

### Inicialização Manual

```typescript
import { initializeProductionMonitoring } from "@/lib/monitoring/init-production-monitoring";

await initializeProductionMonitoring();
```

### Configurações por Ambiente

```typescript
const config = {
  memoryThreshold: isProduction ? 85 : 90,
  cpuThreshold: isProduction ? 80 : 85,
  responseTimeThreshold: isProduction ? 3000 : 5000,
  errorRateThreshold: isProduction ? 3 : 5,
  queueDepthThreshold: isProduction ? 500 : 1000,
};
```

## Tipos de Alertas

### CONNECTION_FAILURE

- **Descrição**: Falha de conexão com Prisma ou Redis
- **Severidade**: CRITICAL
- **Ação Automática**: Procedimento de reconexão

### HIGH_MEMORY

- **Descrição**: Uso excessivo de memória
- **Severidade**: HIGH/CRITICAL (baseado no percentual)
- **Ação Manual**: Procedimento de limpeza de memória

### HIGH_CPU

- **Descrição**: Uso alto de CPU
- **Severidade**: HIGH/CRITICAL
- **Ação Manual**: Análise e otimização

### QUEUE_OVERLOAD

- **Descrição**: Filas sobrecarregadas
- **Severidade**: HIGH
- **Ação Automática**: Pausar filas críticas

## Procedimentos de Disaster Recovery

### 1. Recuperação de Conexão Redis

**Trigger**: `CONNECTION_FAILURE:REDIS`
**Execução**: Automática

**Etapas**:

1. Verificar status do Redis
2. Reconectar Redis
3. Verificar integridade das filas

```typescript
// Exemplo de execução manual
const recovery = DisasterRecoveryManager.getInstance();
await recovery.executeProcedure("redis_connection_failure");
```

### 2. Recuperação de Conexão Prisma

**Trigger**: `CONNECTION_FAILURE:PRISMA`
**Execução**: Automática

**Etapas**:

1. Verificar status do banco
2. Reconectar Prisma
3. Validar conectividade

### 3. Recuperação de Memória Alta

**Trigger**: `HIGH_MEMORY:SYSTEM`, `HIGH_MEMORY:REDIS`
**Execução**: Manual (requer aprovação)

**Etapas**:

1. Analisar uso de memória
2. Limpar jobs concluídos antigos
3. Forçar garbage collection

### 4. Recuperação de Sobrecarga de Filas

**Trigger**: `QUEUE_OVERLOAD`
**Execução**: Automática

**Etapas**:

1. Analisar status das filas
2. Pausar filas sobrecarregadas (>2000 jobs)

**Rollback**: Despausar filas automaticamente

## Sistema de Backup

### Tipos de Backup

#### 1. Configurações de Fila

- **Arquivo**: `/tmp/queue_configs_[timestamp].json`
- **Conteúdo**: Configurações do banco de dados
- **Frequência**: A cada 6 horas

#### 2. Estado das Filas

- **Arquivo**: `/tmp/queue_state_[timestamp].json`
- **Conteúdo**: Estado atual das filas no Redis
- **Frequência**: A cada 6 horas

#### 3. Métricas Históricas

- **Arquivo**: `/tmp/queue_metrics_[timestamp].json`
- **Conteúdo**: Métricas das últimas 24 horas
- **Frequência**: A cada 6 horas

### Formato dos Backups

```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "1.0",
  "configs": [...],
  "totalRecords": 42
}
```

### Backup Manual

```typescript
const monitor = ProductionMonitor.getInstance();
const backups = await monitor.performAutomaticBackup();
```

## APIs de Monitoramento

### Endpoints Disponíveis

#### GET /api/admin/queue-management/production-monitoring

**Parâmetros**:

- `component`: `status`, `alerts`, `connections`, `recovery`

**Exemplos**:

```bash
# Status geral
curl "/api/admin/queue-management/production-monitoring?component=status"

# Alertas ativos
curl "/api/admin/queue-management/production-monitoring?component=alerts"

# Saúde das conexões
curl "/api/admin/queue-management/production-monitoring?component=connections"

# Procedimentos de recovery
curl "/api/admin/queue-management/production-monitoring?component=recovery"
```

#### POST /api/admin/queue-management/production-monitoring

**Ações Disponíveis**:

##### Resolver Alerta

```json
{
  "action": "resolve_alert",
  "data": { "alertId": "alert_123" }
}
```

##### Executar Procedimento de Recovery

```json
{
  "action": "execute_recovery",
  "data": { "procedureId": "redis_connection_failure" }
}
```

##### Rollback de Procedimento

```json
{
  "action": "rollback_recovery",
  "data": { "executionId": "exec_123" }
}
```

##### Forçar Backup

```json
{
  "action": "force_backup",
  "data": {}
}
```

##### Health Check Manual

```json
{
  "action": "health_check",
  "data": {}
}
```

## Interface Web

### Acesso

- **URL**: `/admin/queue-management/production-monitoring`
- **Permissão**: Apenas SUPERADMIN

### Funcionalidades

#### Dashboard Principal

- Status geral do sistema
- Contadores de alertas
- Saúde das conexões
- Estatísticas de recovery

#### Aba de Alertas

- Lista de alertas ativos
- Filtros por severidade
- Ação de resolver alertas
- Detalhes e métricas

#### Aba de Conexões

- Status das conexões Prisma e Redis
- Tempo de resposta
- Contadores de erro
- Metadados detalhados

#### Aba de Disaster Recovery

- Procedimentos disponíveis
- Histórico de execuções
- Execução manual de procedimentos
- Rollback de execuções

## Monitoramento e Logs

### Logs Estruturados

O sistema gera logs com prefixos específicos:

```
[ProductionMonitor] 🎉 All monitoring systems initialized successfully
[ProductionMonitor] 🚨 ALERTA CRÍTICO: Falha na conexão Redis
[DisasterRecovery] 🔧 Iniciando procedimento: Recuperação de Conexão Redis
[DisasterRecovery] ✅ Procedimento concluído com sucesso
```

### Auditoria

Todas as ações são registradas na tabela `AuditLog`:

```sql
INSERT INTO audit_logs (
  user_id, action, resource_type, resource_id,
  details, ip_address, user_agent
) VALUES (
  'system', 'INFRASTRUCTURE_ALERT', 'MONITORING', 'alert_123',
  '{"type": "CONNECTION_FAILURE", "severity": "CRITICAL"}',
  '127.0.0.1', 'ProductionMonitor'
);
```

## Integração com Sistema Existente

### Conexões Singleton

O monitoramento utiliza as instâncias singleton existentes:

```typescript
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";

// Mesmo padrão usado em todo o projeto
const prisma = getPrismaInstance();
const redis = getRedisInstance();
```

### Sistema de Autenticação

Integração com Auth.js 5 existente:

```typescript
// Verificação de permissão SUPERADMIN
const session = await auth();
if (session?.user?.role !== "SUPERADMIN") {
  return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
}
```

## Testes

### Script de Teste

```bash
npx tsx scripts/test-production-monitoring.ts
```

### Testes Incluídos

1. **Inicialização**: Verificar se o sistema inicializa corretamente
2. **Status**: Obter status geral do sistema
3. **Health Checks**: Executar verificações de saúde
4. **Backup**: Testar sistema de backup
5. **Recovery**: Listar procedimentos disponíveis
6. **Limpeza**: Parar sistema corretamente

## Troubleshooting

### Problemas Comuns

#### Sistema não inicializa

- Verificar conexões com Prisma e Redis
- Verificar permissões de escrita em `/tmp`
- Verificar logs de erro no console

#### Alertas não são gerados

- Verificar se o monitoramento está ativo
- Verificar configurações de threshold
- Verificar logs do ProductionMonitor

#### Procedimentos de recovery falham

- Verificar conectividade com serviços
- Verificar permissões de execução
- Verificar logs detalhados da execução

### Comandos de Diagnóstico

```bash
# Verificar status via API
curl -s "http://localhost:3000/api/admin/queue-management/production-monitoring?component=status" | jq

# Verificar alertas ativos
curl -s "http://localhost:3000/api/admin/queue-management/production-monitoring?component=alerts" | jq '.data.activeAlerts'

# Executar health check manual
curl -X POST "http://localhost:3000/api/admin/queue-management/production-monitoring" \
  -H "Content-Type: application/json" \
  -d '{"action": "health_check", "data": {}}'
```

## Configurações Avançadas

### Personalizar Thresholds

```typescript
const customConfig = {
  memoryThreshold: 90, // 90% de uso de memória
  cpuThreshold: 85, // 85% de uso de CPU
  responseTimeThreshold: 2000, // 2 segundos
  errorRateThreshold: 2, // 2% de taxa de erro
  queueDepthThreshold: 2000, // 2000 jobs em espera
};

const monitor = ProductionMonitor.getInstance(customConfig);
```

### Adicionar Procedimentos Customizados

```typescript
const recovery = DisasterRecoveryManager.getInstance();

recovery.registerProcedure({
  id: "custom_recovery",
  name: "Procedimento Customizado",
  description: "Recuperação específica do projeto",
  triggerConditions: ["CUSTOM_ALERT"],
  priority: "HIGH",
  autoExecute: false,
  steps: [
    {
      id: "custom_step",
      name: "Etapa Customizada",
      description: "Executa ação específica",
      timeout: 30000,
      action: async () => {
        // Implementar lógica customizada
        return {
          success: true,
          message: "Ação executada com sucesso",
          duration: 1000,
        };
      },
    },
  ],
});
```

## Considerações de Segurança

### Controle de Acesso

- Apenas usuários SUPERADMIN podem acessar
- APIs protegidas por autenticação
- Logs de auditoria completos

### Proteção de Dados

- Credenciais mascaradas nos logs
- Backups em diretório temporário
- Limpeza automática de arquivos antigos

### Rate Limiting

- Prevenção de spam de alertas
- Cooldown entre execuções de procedimentos
- Timeouts configuráveis para operações

Este guia fornece uma visão completa do Sistema de Monitoramento de Produção, permitindo operação segura e eficiente do ambiente de filas BullMQ.
