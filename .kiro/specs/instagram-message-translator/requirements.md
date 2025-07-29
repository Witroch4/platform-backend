# Requirements Document

## Introduction

Este documento define os requisitos para implementar um sistema de tradução de mensagens interativas do WhatsApp para Instagram no webhook do Dialogflow. O sistema deve atuar como um tradutor que identifica o canal de origem (channel_type) e converte mensagens do formato WhatsApp para os templates compatíveis com Instagram (Generic Template ou Button Template), mantendo a lógica atual do WhatsApp intacta.

## Requirements

### Requirement 1

**User Story:** Como um usuário do sistema, eu quero que mensagens interativas criadas para WhatsApp sejam automaticamente traduzidas para o formato compatível com Instagram quando enviadas através do Dialogflow, para que eu possa usar o mesmo template em ambas as plataformas.

#### Acceptance Criteria

1. WHEN o webhook recebe uma requisição do Dialogflow THEN o sistema SHALL identificar o channel_type no payload originalDetectIntentRequest.payload
2. WHEN o channel_type for "Channel::Instagram" THEN o sistema SHALL aplicar a lógica de tradução para Instagram
3. WHEN o channel_type NÃO for "Channel::Instagram" THEN o sistema SHALL manter a lógica atual do WhatsApp sem modificações
4. WHEN a tradução for aplicada THEN o sistema SHALL retornar um JSON formatado com custom_payload para o Dialogflow

### Requirement 2

**User Story:** Como desenvolvedor, eu quero que o sistema use filas BullMQ para orquestrar a tradução, mas que a resposta final seja retornada na requisição original do Dialogflow, para manter a compatibilidade com o fluxo do Chatwit.

#### Acceptance Criteria

1. WHEN o webhook recebe uma requisição do Dialogflow THEN o sistema SHALL adicionar uma tarefa com um ID de Job único em uma fila BullMQ
2. WHEN a tarefa é processada na fila pelo worker THEN o sistema SHALL buscar o template no banco de dados usando Prisma
3. WHEN o processamento é concluído pelo worker THEN o resultado (payload traduzido) SHALL ser armazenado e sinalizado para o processo do webhook original usando o ID do Job
4. IF ocorrer erro no processamento THEN o sistema SHALL implementar retry automático na fila e o erro final SHALL ser comunicado de volta ao processo do webhook
5. WHEN o processo do webhook recebe o sinal de conclusão (ou erro) do worker THEN ele SHALL buscar o resultado e enviá-lo como resposta final completa para o Dialogflow, garantindo que todo o ciclo ocorra dentro do timeout de 5 segundos

### Requirement 3

**User Story:** Como usuário, eu quero que mensagens com corpo até 80 caracteres sejam convertidas para Generic Template do Instagram, para que eu possa enviar mensagens com imagem, título, subtítulo e botões.

#### Acceptance Criteria

1. WHEN o corpo da mensagem tiver até 80 caracteres THEN o sistema SHALL usar Generic Template
2. WHEN usar Generic Template THEN o body do WhatsApp SHALL ser mapeado para title do Instagram
3. WHEN usar Generic Template THEN o footer do WhatsApp SHALL ser mapeado para subtitle do Instagram
4. WHEN usar Generic Template THEN o header (imagem) do WhatsApp SHALL ser mapeado para image_url do Instagram
5. WHEN usar Generic Template THEN os buttons do WhatsApp SHALL ser convertidos para buttons do Instagram

### Requirement 4

**User Story:** Como usuário, eu quero que mensagens com corpo entre 81 e 640 caracteres sejam convertidas para Button Template do Instagram, para que eu possa enviar mensagens de texto com botões mesmo quando não posso usar imagens.

#### Acceptance Criteria

1. WHEN o corpo da mensagem tiver entre 81 e 640 caracteres THEN o sistema SHALL usar Button Template
2. WHEN usar Button Template THEN o body do WhatsApp SHALL ser mapeado para text do Instagram
3. WHEN usar Button Template THEN o sistema SHALL descartar header (imagem) e footer
4. WHEN usar Button Template THEN os buttons do WhatsApp SHALL ser convertidos para buttons do Instagram
5. WHEN usar Button Template THEN o sistema SHALL manter até 3 botões conforme limitação do Instagram

### Requirement 5

**User Story:** Como usuário, eu quero que o sistema trate adequadamente mensagens incompatíveis com Instagram, para que eu seja informado sobre limitações da plataforma.

#### Acceptance Criteria

1. WHEN o corpo da mensagem tiver mais de 640 caracteres THEN o sistema SHALL considerar incompatível com Instagram
2. WHEN a mensagem for incompatível THEN o sistema SHALL retornar erro específico
3. WHEN houver incompatibilidade THEN o sistema SHALL manter funcionalidade para WhatsApp
4. WHEN ocorrer erro de tradução THEN o sistema SHALL fazer fallback para resposta padrão

### Requirement 6

**User Story:** Como desenvolvedor, eu quero que o sistema mantenha compatibilidade total com a lógica atual do WhatsApp, para que não haja regressões no sistema existente.

#### Acceptance Criteria

1. WHEN implementar nova funcionalidade THEN o sistema SHALL preservar toda lógica atual do WhatsApp
2. WHEN processar WhatsApp THEN o sistema SHALL usar exatamente o mesmo fluxo atual
3. WHEN adicionar código novo THEN o sistema SHALL usar feature flags ou condicionais para Instagram
4. WHEN fazer deploy THEN o sistema SHALL manter backward compatibility completa

### Requirement 7

**User Story:** Como usuário, eu quero que os botões sejam corretamente convertidos entre formatos WhatsApp e Instagram, para que a interatividade seja mantida em ambas as plataformas.

#### Acceptance Criteria

1. WHEN converter botões THEN o sistema SHALL mapear type "web_url" para web_url do Instagram
2. WHEN converter botões THEN o sistema SHALL mapear type "postback" para postback do Instagram
3. WHEN converter botões THEN o sistema SHALL preservar title e payload/url dos botões
4. WHEN houver mais de 3 botões THEN o sistema SHALL limitar a 3 botões para Instagram
5. WHEN converter botões THEN o sistema SHALL manter ordem original dos botões

### Requirement 8

**User Story:** Como operador do sistema, eu quero que os workers de tradução processem jobs de forma eficiente e em alto volume, para garantir que as respostas sejam sempre entregues dentro dos limites de tempo e o sistema possa lidar com crescimento futuro.

#### Acceptance Criteria

1. WHEN o sistema estiver sob carga THEN o worker SHALL ser configurado para processar múltiplos jobs IO-bound concorrentemente
2. WHEN configurar o worker THEN o fator de concorrência inicial SHALL ser definido como 100 como baseline para tuning de performance
3. WHEN o sistema estiver em produção THEN o monitoramento SHALL rastrear tempos de espera de jobs, duração de processamento e uso de CPU para permitir otimização futura do fator de concorrência
4. WHEN monitorar performance THEN o sistema SHALL alertar se o tempo de processamento exceder 4 segundos
