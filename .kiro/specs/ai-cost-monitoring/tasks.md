# Implementation Plan

- [x] 1. Implementar extensões do schema Prisma para monitoramento de custos
  - Adicionar enums Provider, Unit, EventStatus ao schema.prisma
  - Criar models PriceCard, CostEvent, FxRate, CostBudget
  - Gerar migration e aplicar ao banco de dados
  - _Requirements: 2.3, 5.1, 5.2_

- [x] 2. Criar sistema de captura de custos com wrappers assíncronos
  - [x] 2.1 Implementar wrapper OpenAI com captura de tokens
    - Criar lib/cost/openai-wrapper.ts com função openaiWithCost
    - Implementar extração de usage (input_tokens, output_tokens, cached_tokens)
    - Configurar publicação de eventos em fila de baixa prioridade
    - _Requirements: 2.1, 4.1, 4.4_

  - [x] 2.2 Implementar wrapper WhatsApp com captura de templates
    - Criar lib/cost/whatsapp-wrapper.ts com função whatsappWithCost
    - Implementar derivação de região baseada no número de telefone
    - Configurar captura de eventos de template entregue
    - _Requirements: 2.2, 4.1, 4.4_

  - [x] 2.3 Configurar fila Redis para eventos de custo
    - Criar configuração de fila "cost-events" com baixa prioridade
    - Implementar bulk operations para otimizar performance
    - Configurar retry policy e dead letter queue
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 3. Desenvolver worker de processamento de custos
  - [x] 3.1 Implementar worker principal de precificação
    - Criar lib/cost/cost-worker.ts com processamento de eventos
    - Implementar lógica de resolução de preços por período e região
    - Configurar persistência de eventos precificados no banco
    - _Requirements: 2.4, 4.3, 5.4_

  - [x] 3.2 Implementar sistema de preços versionados
    - Criar função resolveUnitPrice com busca por vigência
    - Implementar fallback para preços regionais vs globais
    - Configurar handling de eventos PENDING_PRICING
    - _Requirements: 2.3, 2.4, 5.4_

  - [x] 3.3 Configurar idempotência e tratamento de erros
    - Implementar deduplicação baseada em externalId
    - Configurar retry exponencial para falhas temporárias
    - Implementar logging estruturado para auditoria
    - _Requirements: 4.5, 5.3, 5.4_

- [x] 4. Criar APIs de dashboard para visualização de custos
  - [x] 4.1 Implementar endpoint de overview de custos
    - Criar app/api/admin/cost-monitoring/overview/route.ts
    - Implementar agregações de custo por dia/mês/inbox
    - Configurar autenticação ADMIN/SUPERADMIN (meu sistema ja tem autenticação e validação para isso)
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 4.2 Implementar endpoint de breakdown detalhado
    - Criar app/api/admin/cost-monitoring/breakdown/route.ts
    - Implementar agregações por provider, modelo, período
    - Configurar filtros por data, inbox, usuário, intent
    - _Requirements: 1.2, 1.4, 6.1, 6.2_

  - [x] 4.3 Implementar endpoint de eventos recentes
    - Criar app/api/admin/cost-monitoring/events/route.ts
    - Implementar paginação e filtros avançados
    - Configurar export para CSV/Excel para auditoria
    - _Requirements: 1.4, 5.5, 6.4_

- [x] 5. Desenvolver componente de dashboard administrativo(lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 5.1 Criar componente principal de custos no dashboard
    - Adicionar seção "Custos de IA" em components/app-admin-dashboard.tsx
    - Implementar cards de métricas principais (hoje, mês, tendência)

    - Configurar atualização em tempo real via polling/SSE
    - _Requirements: 1.1, 1.3, 6.1_

  - [x] 5.2 Implementar gráficos de breakdown de custos(lib/cost/cost-worker.ts - Main worker implementation)
    - Criar componentes de gráfico por provider/modelo/período
    - Implementar filtros interativos por data e dimensões

    - Configurar drill-down para análise detalhada
    - _Requirements: 1.2, 1.4, 6.2, 6.3_

  - [x] 5.3 Criar tabela de eventos recentes
    - Implementar tabela paginada com eventos de custo
    - Configurar colunas: timestamp, provider, modelo, custo, inbox
    - Implementar filtros e busca por intent/sessionId
    - _Requirements: 1.4, 5.5, 6.1_

- [x] 6. Implementar sistema de orçamentos e controles(lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 6.1 Criar APIs de gerenciamento de orçamentos
    - Criar app/api/admin/cost-monitoring/budgets/route.ts
    - Implementar CRUD para orçamentos por inbox/usuário/período
    - Configurar validações e regras de negócio
    - _Requirements: 3.1, 3.4_

  - [x] 6.2 Implementar monitor de orçamentos
    - Criar lib/cost/budget-monitor.ts com verificação periódica
    - Implementar cálculo de gastos por período e escopo
    - Configurar job cron para execução horária
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.3 Desenvolver sistema de alertas e contenção
    - Implementar envio de alertas por email/notificação
    - Configurar bloqueios automáticos via Redis flags
    - Implementar downgrade de modelos quando orçamento excedido
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 7. Configurar sistema de preços e conversão de moedas (lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 7.1 Implementar seed de preços oficiais
    - Criar script de seed com preços OpenAI atuais
    - Implementar preços WhatsApp por região e categoria
    - Configurar versionamento por effectiveFrom/effectiveTo
    - _Requirements: 2.3, 5.1_

  - [x] 7.2 Implementar sistema de conversão USD/BRL
    - Criar job diário para atualizar taxas de câmbio
    - Implementar API de consulta de taxas históricas
    - Configurar exibição de valores em BRL no dashboard

    - _Requirements: 1.1, 5.2_

- [ ] 8. Integrar wrappers nas chamadas existentes de IA (lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 8.1 Substituir chamadas OpenAI por wrappers com custo
    - Identificar todas as chamadas client.responses.create no código
    - Substituir por openaiWithCost com metadata apropriada
    - Configurar traceId, sessionId, inboxId, userId, intent
    - _Requirements: 2.1, 4.1, 5.3_

  - [x] 8.2 Substituir envios WhatsApp por wrappers com custo
    - Identificar chamadas de template WhatsApp no código
    - Substituir por whatsappWithCost com metadata
    - _Requirements: 2.2, 4.1, 5.3_
      templates entregues
    - _Requirements: 2.2, 4.1, 5.3_

- [x] 9. Implementar testes e validação do sistema (lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 9.1 Criar testes unitários para componentes de custo
    - Testar wrappers de captura com mocks
    - Testar lógica de resolução de preços
    - Testar cálculos de orçamento e alertas
    - _Requirements: 4.3, 5.4_

  - [x] 9.2 Criar testes de integração end-to-end
    - Testar fluxo completo: captura → processamento → dashboard
    - Testar cenários de falha e recuperação

    - Testar performance com volume simulado
    - _Requirements: 4.2, 4.3_

- [x] 10. Configurar monitoramento e observabilidade (lib/cost/cost-worker.ts - Main worker implementation)
  - [x] 10.1 Implementar métricas de sistema de custos
    - Configurar métricas de eventos processados/falhados
    - Implementar alertas para % de falhas > 5%
    - Configurar dashboards de observabilidade
    - _Requirements: 4.3, 5.4_

  - [ ] 10.2 Configurar logs estruturados e auditoria( eu possue um logger nas libs)
    - Implementar logging de todos os acessos a dados de custo
    - Configurar auditoria de mudanças em orçamentos
    - Implementar retenção de dados por 12 meses
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
