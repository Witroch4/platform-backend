# Requirements Document

## Introduction

O `SwrProvider` atual é um exemplo complexo de gerenciamento de estado com SWR que implementa uma camada de proteção robusta contra revalidações prematuras. No entanto, essa complexidade pode ser drasticamente simplificada utilizando os padrões modernos do SWR 2.0, separando responsabilidades em hooks dedicados e abraçando o fluxo nativo de mutações otimistas da biblioteca.

A refatoração visa transformar um provider monolítico com lógica complexa de refs, timers e proteções manuais em uma arquitetura modular, limpa e mais confiável baseada em hooks especializados.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor, quero uma arquitetura de dados modular baseada em hooks dedicados, para que cada tipo de dado (mensagens, caixas, lotes) seja gerenciado independentemente e de forma mais eficiente.

#### Acceptance Criteria

1. WHEN o sistema é refatorado THEN deve existir hooks dedicados para cada tipo de dado (useInteractiveMessages, useCaixas, useLotes, useVariaveis, useApiKeys)
2. WHEN um hook dedicado é usado THEN ele deve encapsular toda a lógica de busca, cache e mutação para seu tipo específico de dado
3. WHEN múltiplos componentes usam o mesmo hook THEN eles devem compartilhar automaticamente o mesmo cache via SWR
4. WHEN um tipo de dado é modificado THEN apenas o cache desse tipo específico deve ser revalidado, não todos os dados
5. WHEN um novo tipo de dado precisa ser adicionado THEN deve ser possível criar um novo hook sem modificar os existentes

### Requirement 2

**User Story:** Como desenvolvedor, quero implementar mutações otimistas usando o padrão nativo do SWR 2.0, para que as atualizações sejam mais confiáveis e o código seja mais simples de manter.

#### Acceptance Criteria

1. WHEN uma mensagem é adicionada THEN a UI deve ser atualizada instantaneamente com dados otimistas usando mutate(novosDados, {revalidate: false})
2. WHEN a API confirma a operação THEN o cache deve ser atualizado com os dados reais do servidor
3. WHEN a API falha THEN o cache deve ser revertido automaticamente para o estado anterior (rollback)
4. WHEN uma operação é concluída THEN deve haver uma revalidação final para garantir consistência com o servidor
5. WHEN múltiplas operações ocorrem simultaneamente THEN cada uma deve ser tratada independentemente sem conflitos

### Requirement 3

**User Story:** Como desenvolvedor, quero eliminar a complexidade atual de refs, timers e lógicas de proteção manual, para que o código seja mais limpo e menos propenso a bugs.

#### Acceptance Criteria

1. WHEN o provider é refatorado THEN não deve mais usar useRef para controle de operações otimistas
2. WHEN o provider é refatorado THEN não deve mais usar timers ou setTimeout para proteção contra revalidações
3. WHEN o provider é refatorado THEN não deve mais ter lógica complexa de onSuccess com verificações manuais
4. WHEN o provider é refatorado THEN deve usar apenas o fluxo nativo do SWR para mutações
5. WHEN uma operação otimista é executada THEN deve seguir o padrão: mutate otimista → API call → mutate final

### Requirement 4

**User Story:** Como desenvolvedor, quero um SwrProvider simplificado que atue como orquestrador, para que ele coordene os hooks dedicados sem conter lógica complexa de data fetching.

#### Acceptance Criteria

1. WHEN o SwrProvider é refatorado THEN ele deve usar hooks dedicados internamente
2. WHEN o SwrProvider é refatorado THEN ele deve expor apenas as funções e dados necessários via contexto
3. WHEN o SwrProvider é refatorado THEN ele deve manter a API pública compatível para não quebrar componentes existentes
4. WHEN o SwrProvider é refatorado THEN deve suportar dados iniciais via fallback do SWRConfig
5. WHEN o SwrProvider é refatorado THEN deve manter o controle de pausa/retomada de updates de forma simplificada

### Requirement 5

**User Story:** Como desenvolvedor, quero APIs de backend separadas por tipo de dado, para que cada hook dedicado possa fazer requisições granulares e eficientes.

#### Acceptance Criteria

1. WHEN os hooks dedicados são implementados THEN deve existir endpoints separados para cada tipo de dado
2. WHEN uma mensagem é modificada THEN apenas o endpoint de mensagens deve ser chamado
3. WHEN uma caixa é modificada THEN apenas o endpoint de caixas deve ser chamado
4. WHEN um endpoint específico é chamado THEN ele deve retornar apenas os dados relevantes para aquele tipo
5. WHEN múltiplos tipos de dados precisam ser atualizados THEN cada um deve fazer sua própria requisição independente

### Requirement 6

**User Story:** Como usuário da aplicação, quero que as operações de edição continuem pausando atualizações automáticas, para que eu não perca dados durante a edição de formulários.

#### Acceptance Criteria

1. WHEN um usuário inicia a edição de um formulário THEN as revalidações automáticas devem ser pausadas
2. WHEN um usuário termina a edição THEN as revalidações automáticas devem ser retomadas
3. WHEN as atualizações estão pausadas THEN o polling (refreshInterval) deve ser desabilitado
4. WHEN as atualizações estão pausadas THEN revalidateOnFocus deve ser desabilitado
5. WHEN as atualizações são retomadas THEN uma revalidação deve ser disparada para sincronizar com o servidor

### Requirement 7

**User Story:** Como desenvolvedor, quero tratamento de erros centralizado e consistente, para que todos os hooks dedicados tenham comportamento uniforme em caso de falhas.

#### Acceptance Criteria

1. WHEN um erro ocorre em qualquer hook THEN deve ser tratado de forma consistente
2. WHEN uma mutação falha THEN o rollback deve ser automático
3. WHEN um erro de rede ocorre THEN deve haver retry automático para operações de leitura
4. WHEN um erro 404 ocorre THEN deve ser tratado graciosamente sem quebrar a UI
5. WHEN um erro crítico ocorre THEN deve ser logado adequadamente para debugging

### Requirement 8

**User Story:** Como desenvolvedor, quero manter compatibilidade com componentes existentes, para que a refatoração não quebre funcionalidades atuais.

#### Acceptance Criteria

1. WHEN o provider é refatorado THEN a interface pública do contexto deve permanecer compatível
2. WHEN componentes existentes usam useMtfData() THEN eles devem continuar funcionando sem modificações
3. WHEN funções como addMessage, updateMessage, deleteMessage são chamadas THEN devem manter a mesma assinatura
4. WHEN propriedades como interactiveMessages, caixas, lotes são acessadas THEN devem retornar os mesmos tipos de dados
5. WHEN o sistema é migrado THEN deve haver um período de transição suave sem quebras