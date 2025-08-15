# Cost System Testing Suite

Este diretório contém a suíte completa de testes para o sistema de monitoramento de custos de IA do Socialwise Chatwit.

## Estrutura dos Testes

### Testes Unitários (`__tests__/unit/cost/`)

#### 1. `openai-wrapper.test.ts`
- **Objetivo**: Testa o wrapper de captura de custos para chamadas OpenAI
- **Cobertura**:
  - Captura automática de tokens (input, output, cached)
  - Verificação de orçamento e bloqueios
  - Downgrade automático de modelos
  - Tratamento de erros
  - Publicação de eventos em fila

#### 2. `whatsapp-wrapper.test.ts`
- **Objetivo**: Testa o wrapper de captura de custos para templates WhatsApp
- **Cobertura**:
  - Derivação de região por número de telefone
  - Categorização de templates (auth, utility, marketing)
  - Verificação de orçamento
  - Captura apenas para envios bem-sucedidos
  - Tratamento de falhas

#### 3. `cost-worker.test.ts`
- **Objetivo**: Testa o worker de processamento de eventos de custo
- **Cobertura**:
  - Processamento de eventos individuais
  - Resolução de preços por período e região
  - Cálculo de custos por tipo de unidade
  - Idempotência de eventos
  - Tratamento de eventos sem preço (PENDING_PRICING)

#### 4. `budget-monitor.test.ts`
- **Objetivo**: Testa o sistema de monitoramento de orçamentos
- **Cobertura**:
  - Verificação periódica de orçamentos
  - Cálculo de gastos por período (diário, semanal, mensal)
  - Envio de alertas em diferentes thresholds
  - Aplicação de controles automáticos
  - Estatísticas de fila

### Testes de Integração (`__tests__/integration/cost/`)

#### 1. `cost-system-e2e.test.ts`
- **Objetivo**: Testa o fluxo completo de captura → processamento → armazenamento
- **Cobertura**:
  - Fluxo end-to-end OpenAI: wrapper → queue → worker → database
  - Fluxo end-to-end WhatsApp: wrapper → queue → worker → database
  - Monitoramento de orçamentos com dados reais
  - Tratamento de erros e recuperação
  - Testes de performance com alto volume
  - Processamento concorrente

#### 2. `cost-dashboard-api.test.ts`
- **Objetivo**: Testa as APIs do dashboard de custos
- **Cobertura**:
  - API de overview com agregações
  - API de breakdown com filtros
  - API de eventos com paginação
  - API de gerenciamento de orçamentos
  - Autenticação e autorização
  - Export CSV
  - Tratamento de erros

## Configuração dos Testes

### Arquivos de Configuração

- `jest.config.cost.js`: Configuração específica para testes de custo
- `setup.ts`: Setup global para testes de custo
- Scripts de validação e execução

### Dependências

- **Jest**: Framework de testes
- **ts-jest**: Suporte a TypeScript
- **@prisma/client**: Acesso ao banco de dados
- **bullmq**: Sistema de filas
- **Mocks**: Serviços externos (email, alertas)

## Executando os Testes

### Comandos Disponíveis

```bash
# Validar estrutura dos testes
npx tsx scripts/validate-cost-tests.ts

# Executar testes unitários
npm run test:unit -- --testPathPattern="cost"

# Executar testes de integração
npm run test:integration -- --testPathPattern="cost"

# Executar todos os testes de custo
npx jest --config=__tests__/cost/jest.config.cost.js

# Executar com cobertura
npx jest --config=__tests__/cost/jest.config.cost.js --coverage
```

### Pré-requisitos

1. **Banco de Dados de Teste**: PostgreSQL configurado
2. **Redis de Teste**: Instância Redis para filas
3. **Variáveis de Ambiente**:
   ```env
   DATABASE_URL=postgresql://test:test@localhost:5432/chatwit_test
   REDIS_URL=redis://localhost:6379/1
   ```

## Cenários de Teste

### Cenários de Sucesso

1. **Captura de Custos OpenAI**
   - Chamada bem-sucedida com tokens
   - Eventos publicados na fila
   - Processamento e precificação
   - Armazenamento no banco

2. **Captura de Custos WhatsApp**
   - Envio de template bem-sucedido
   - Derivação correta de região
   - Categorização de template
   - Precificação por região

3. **Monitoramento de Orçamentos**
   - Verificação periódica
   - Alertas em 80% do limite
   - Bloqueios em 100% do limite
   - Remoção de controles quando normalizado

### Cenários de Erro

1. **Falhas de Precificação**
   - Eventos marcados como PENDING_PRICING
   - Reprocessamento posterior
   - Não impacta operação principal

2. **Orçamentos Excedidos**
   - Bloqueio de operações
   - Downgrade de modelos
   - Logs de auditoria

3. **Falhas de Sistema**
   - Erros de banco de dados
   - Falhas de Redis
   - Recuperação graceful

### Cenários de Performance

1. **Alto Volume**
   - 100+ eventos simultâneos
   - Processamento em < 10 segundos
   - Sem perda de dados

2. **Concorrência**
   - Múltiplos batches simultâneos
   - Idempotência mantida
   - Performance estável

## Métricas de Cobertura

### Objetivos de Cobertura

- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

### Áreas Críticas

1. **Wrappers de Captura**: 100% cobertura
2. **Worker de Processamento**: > 95% cobertura
3. **Monitor de Orçamentos**: > 90% cobertura
4. **APIs de Dashboard**: > 85% cobertura

## Manutenção dos Testes

### Atualizações Necessárias

1. **Novos Providers**: Adicionar testes para novos provedores de IA
2. **Novos Tipos de Unidade**: Testes para novas unidades de cobrança
3. **Mudanças de Preço**: Atualizar dados de teste
4. **Novas APIs**: Testes para novos endpoints

### Boas Práticas

1. **Isolamento**: Cada teste limpa dados antes/depois
2. **Mocks**: Serviços externos sempre mockados
3. **Dados Realistas**: Usar dados próximos da produção
4. **Timeouts**: Configurar timeouts adequados para I/O
5. **Cleanup**: Sempre limpar recursos (workers, conexões)

## Troubleshooting

### Problemas Comuns

1. **Testes Lentos**: Verificar conexões de banco/Redis
2. **Falhas Intermitentes**: Verificar cleanup de dados
3. **Memory Leaks**: Verificar fechamento de workers
4. **Timeouts**: Ajustar configurações de timeout

### Debug

```bash
# Executar com debug verbose
npx jest --config=__tests__/cost/jest.config.cost.js --verbose --no-cache

# Executar teste específico
npx jest __tests__/unit/cost/openai-wrapper.test.ts --verbose

# Executar com coverage detalhado
npx jest --config=__tests__/cost/jest.config.cost.js --coverage --verbose
```

## Integração com CI/CD

Os testes de custo devem ser executados em:

1. **Pull Requests**: Testes unitários obrigatórios
2. **Merge para Main**: Testes completos (unit + integration)
3. **Deploy**: Smoke tests básicos
4. **Nightly**: Testes de performance e stress

## Contribuindo

Ao adicionar novos testes:

1. Seguir padrões existentes
2. Incluir cenários de sucesso e erro
3. Adicionar documentação
4. Verificar cobertura
5. Testar isoladamente