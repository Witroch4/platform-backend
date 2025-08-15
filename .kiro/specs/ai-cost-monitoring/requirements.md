# Requirements Document

## Introduction

Este documento especifica os requisitos para implementar um sistema completo de monitoramento e controle de custos de IA no Socialwise Chatwit. O sistema deve capturar, precificar e visualizar custos de todas as integrações de IA (OpenAI, WhatsApp Business API) em tempo real, fornecendo dashboards administrativos e controles de orçamento para evitar gastos excessivos.

## Requirements

### Requirement 1

**User Story:** Como administrador do sistema, eu quero visualizar custos de IA em tempo real através de um dashboard, para que eu possa monitorar gastos e tomar decisões informadas sobre uso de recursos.

#### Acceptance Criteria

1. WHEN o administrador acessa o dashboard THEN o sistema SHALL exibir custos totais do dia atual em USD e BRL
2. WHEN o administrador visualiza métricas THEN o sistema SHALL mostrar breakdown por provider (OpenAI, WhatsApp), modelo e tipo de operação
3. WHEN dados são atualizados THEN o dashboard SHALL refletir mudanças em tempo real sem necessidade de refresh manual
4. WHEN o administrador seleciona período THEN o sistema SHALL permitir filtros por data, inbox, usuário e intent
5. WHEN custos são exibidos THEN o sistema SHALL mostrar tanto valores absolutos quanto percentuais de distribuição

### Requirement 2

**User Story:** Como administrador, eu quero que todos os custos de IA sejam automaticamente capturados e precificados, para que eu tenha visibilidade completa dos gastos sem intervenção manual.

#### Acceptance Criteria

1. WHEN uma chamada OpenAI é realizada THEN o sistema SHALL capturar tokens de entrada, saída e cached automaticamente
2. WHEN um template WhatsApp é enviado THEN o sistema SHALL registrar o custo por mensagem entregue baseado na região
3. WHEN preços são aplicados THEN o sistema SHALL usar tabela de preços versionada com vigência por período
4. WHEN eventos são processados THEN o sistema SHALL aplicar preços através de worker de baixa prioridade
5. WHEN há falha na precificação THEN o sistema SHALL marcar eventos como PENDING_PRICING para reprocessamento

### Requirement 3

**User Story:** Como administrador, eu quero configurar orçamentos e alertas por inbox/cliente, para que eu possa controlar gastos e evitar surpresas na fatura.

#### Acceptance Criteria

1. WHEN orçamento é definido THEN o sistema SHALL permitir configuração por inbox, usuário ou período
2. WHEN gasto atinge 80% do orçamento THEN o sistema SHALL enviar alerta via email/notificação
3. WHEN orçamento é excedido THEN o sistema SHALL aplicar medidas de contenção (downgrade de modelo, pausa de templates)
4. WHEN contenção é ativada THEN o sistema SHALL registrar ações tomadas para auditoria
5. WHEN orçamento é resetado THEN o sistema SHALL remover bloqueios automaticamente

### Requirement 4

**User Story:** Como desenvolvedor, eu quero que a captura de custos seja transparente e não impacte performance, para que o sistema continue responsivo mesmo com monitoramento ativo.

#### Acceptance Criteria

1. WHEN custos são capturados THEN o sistema SHALL usar filas assíncronas de baixa prioridade
2. WHEN há pico de uso THEN o sistema SHALL manter latência de APIs principais inalterada
3. WHEN worker de custo falha THEN o sistema SHALL continuar operando normalmente
4. WHEN eventos são publicados THEN o sistema SHALL usar bulk operations para otimizar performance
5. WHEN há retry THEN o sistema SHALL implementar idempotência baseada em externalId

### Requirement 5

**User Story:** Como auditor/contador, eu quero que todos os custos sejam rastreáveis e auditáveis, para que eu possa validar faturas e reconciliar gastos.

#### Acceptance Criteria

1. WHEN custo é calculado THEN o sistema SHALL preservar preço unitário aplicado no momento da transação
2. WHEN há conversão de moeda THEN o sistema SHALL registrar taxa de câmbio utilizada
3. WHEN evento é criado THEN o sistema SHALL incluir traceId, sessionId e metadata completa
4. WHEN há reprocessamento THEN o sistema SHALL manter histórico de todas as tentativas
5. WHEN dados são consultados THEN o sistema SHALL permitir export para CSV/Excel para auditoria

### Requirement 6

**User Story:** Como administrador, eu quero visualizar tendências e padrões de uso, para que eu possa otimizar custos e planejar orçamentos futuros.

#### Acceptance Criteria

1. WHEN visualizo relatórios THEN o sistema SHALL mostrar tendências de custo por período
2. WHEN analiso uso THEN o sistema SHALL identificar picos de consumo e suas causas
3. WHEN comparo períodos THEN o sistema SHALL calcular variações percentuais e destacar anomalias
4. WHEN exporto dados THEN o sistema SHALL gerar relatórios em formato adequado para análise
5. WHEN há padrões THEN o sistema SHALL sugerir otimizações baseadas em dados históricos