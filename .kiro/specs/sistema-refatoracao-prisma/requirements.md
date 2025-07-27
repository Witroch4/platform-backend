# Requirements Document

## Introduction

Este documento define os requisitos para a refatoração completa do backend e frontend do sistema ChatWit, alinhando todo o código com o novo "Super Modelo" do Prisma. A refatoração visa unificar a gestão de dados, otimizar a performance do webhook do WhatsApp para responder em milissegundos, e implementar um sistema inteligente de cache para credenciais do WhatsApp.

O sistema atual possui múltiplos modelos fragmentados e um webhook que não está otimizado para alta performance. O novo modelo Prisma unifica conceitos como Leads, Templates e Credenciais, permitindo uma arquitetura mais limpa e performática.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor do sistema, eu quero que o webhook do WhatsApp responda em milissegundos (200 OK), para que o Dialogflow não experimente timeouts e a experiência do usuário seja fluida.

#### Acceptance Criteria

1. WHEN o webhook recebe uma requisição THEN o sistema SHALL responder com status 200 em menos de 100ms
2. WHEN o webhook recebe dados do payload THEN o sistema SHALL extrair as credenciais diretamente do payload sem consultar o banco de dados
3. WHEN o processamento pesado é necessário THEN o sistema SHALL transferir para workers assíncronos usando filas
4. WHEN uma resposta é enviada ao usuário THEN o sistema SHALL usar as credenciais do payload como fonte de verdade

### Requirement 2

**User Story:** Como administrador do sistema, eu quero que as credenciais do WhatsApp sejam salvas de forma inteligente no banco de dados, para que eu possa ter fallback quando os dados não vierem pelo webhook e evitar consultas desnecessárias.

#### Acceptance Criteria

1. WHEN credenciais chegam pelo webhook THEN o sistema SHALL salvar whatsapp_api_key, phone_number_id e business_id no modelo ChatwitInbox
2. WHEN as credenciais já estão atualizadas THEN o sistema SHALL usar cache Redis para evitar escritas desnecessárias no banco
3. WHEN o cache expira THEN o sistema SHALL permitir nova atualização das credenciais no banco
4. WHEN credenciais não vêm pelo payload THEN o sistema SHALL usar as credenciais salvas no banco como fallback
5. IF não existem credenciais no ChatwitInbox THEN o sistema SHALL usar WhatsAppGlobalConfig como fallback final

### Requirement 3

**User Story:** Como desenvolvedor, eu quero que todas as consultas ao banco de dados usem o modelo Lead unificado, para que não haja mais fragmentação de dados entre diferentes fontes de leads.

#### Acceptance Criteria

1. WHEN uma API lista leads THEN o sistema SHALL consultar apenas o modelo Lead usando o campo source para filtrar
2. WHEN um lead é criado THEN o sistema SHALL usar o campo sourceIdentifier para identificar o lead no sistema de origem
3. WHEN dados específicos são necessários THEN o sistema SHALL usar include para trazer LeadOabData ou LeadInstagramProfile
4. WHEN um lead é atualizado THEN o sistema SHALL usar o contact_source do payload para encontrar o lead correto
5. IF um lead não existe THEN o sistema SHALL criar um novo lead com source apropriado

### Requirement 4

**User Story:** Como desenvolvedor, eu quero que o sistema de templates seja unificado, para que eu possa gerenciar todos os tipos de mensagem (WhatsApp oficial, interativa, automação) em um só lugar.

#### Acceptance Criteria

1. WHEN um template é criado THEN o sistema SHALL usar o modelo Template com type apropriado (WHATSAPP_OFFICIAL, INTERACTIVE_MESSAGE, AUTOMATION_REPLY)
2. WHEN um intent é mapeado THEN o sistema SHALL usar MapeamentoIntencao para conectar intent com Template
3. WHEN um botão é criado THEN o sistema SHALL usar MapeamentoBotao para mapear buttonId com ações
4. WHEN uma mensagem é enviada THEN o sistema SHALL consultar o template unificado através do mapeamento
5. IF múltiplos tipos de template existem THEN o sistema SHALL priorizar unified template > enhanced interactive > legacy template

### Requirement 5

**User Story:** Como desenvolvedor, eu quero que o sistema de filas seja otimizado com duas prioridades, para que respostas ao usuário tenham alta prioridade e persistência de dados tenha baixa prioridade.

#### Acceptance Criteria

1. WHEN o webhook recebe uma requisição THEN o sistema SHALL criar job de alta prioridade para resposta ao usuário
2. WHEN credenciais precisam ser persistidas THEN o sistema SHALL criar job de baixa prioridade para atualização do banco
3. WHEN o worker de alta prioridade processa THEN o sistema SHALL usar credenciais do payload diretamente
4. WHEN o worker de baixa prioridade processa THEN o sistema SHALL atualizar ChatwitInbox e invalidar cache Redis
5. WHEN jobs falham THEN o sistema SHALL manter logs detalhados sem afetar a resposta ao usuário

### Requirement 6

**User Story:** Como desenvolvedor frontend, eu quero que as APIs sejam atualizadas para o modelo unificado, para que a interface reflita corretamente a nova estrutura de dados.

#### Acceptance Criteria

1. WHEN a API de leads é chamada THEN o sistema SHALL retornar dados do modelo Lead unificado
2. WHEN filtros são aplicados THEN o sistema SHALL usar o campo source para filtrar leads por origem
3. WHEN detalhes de um lead são exibidos THEN o sistema SHALL incluir dados específicos baseados no source
4. WHEN templates são listados THEN o sistema SHALL usar o modelo Template unificado
5. WHEN configurações são exibidas THEN o sistema SHALL mostrar credenciais do ChatwitInbox e WhatsAppGlobalConfig

### Requirement 7

**User Story:** Como administrador, eu quero que o sistema mantenha compatibilidade com dados existentes, para que a migração seja transparente e não cause perda de informações.

#### Acceptance Criteria

1. WHEN dados antigos existem THEN o sistema SHALL migrar automaticamente para os novos modelos
2. WHEN consultas antigas são feitas THEN o sistema SHALL redirecionar para os novos modelos
3. WHEN APIs antigas são chamadas THEN o sistema SHALL manter compatibilidade temporária
4. WHEN a migração é concluída THEN o sistema SHALL remover código legado gradualmente
5. IF erros de migração ocorrem THEN o sistema SHALL manter logs detalhados para correção

### Requirement 8

**User Story:** Como desenvolvedor, eu quero que o sistema de cache Redis seja implementado de forma inteligente, para que consultas desnecessárias ao banco sejam evitadas e a performance seja otimizada.

#### Acceptance Criteria

1. WHEN credenciais são atualizadas THEN o sistema SHALL criar chave de cache indicando que dados estão atualizados
2. WHEN o cache expira THEN o sistema SHALL permitir nova atualização das credenciais
3. WHEN credenciais são consultadas THEN o sistema SHALL verificar cache antes de consultar o banco
4. WHEN cache é invalidado THEN o sistema SHALL remover chaves específicas do Redis
5. IF cache não está disponível THEN o sistema SHALL funcionar normalmente consultando o banco diretamente