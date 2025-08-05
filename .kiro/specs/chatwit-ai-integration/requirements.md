# Requirements Document

## Introduction

Esta feature implementa uma integração nativa de IA com o Chatwit (fork do Chatwoot) seguindo o padrão SocialWise. O sistema processará mensagens recebidas via webhook do Chatwit, utilizará IA para classificar intenções ou gerar respostas dinâmicas, e retornará mensagens estruturadas (texto simples ou interativas com botões) diretamente para o Chatwit, que se encarregará da entrega ao cliente final via WhatsApp/Instagram.

A arquitetura garante visibilidade total para agentes no Chatwit, idempotência, rate limiting e processamento assíncrono via filas BullMQ + Redis.

## Requirements

### Requirement 1

**User Story:** Como um agente de atendimento, eu quero que o sistema de IA processe automaticamente mensagens recebidas e gere respostas inteligentes visíveis no Chatwit, para que eu possa acompanhar toda a conversa e intervir quando necessário.

#### Acceptance Criteria

1. WHEN uma mensagem incoming chega via webhook do Chatwit THEN o sistema SHALL processar a mensagem de forma assíncrona via fila BullMQ
2. WHEN o processamento de IA é concluído THEN o sistema SHALL enviar a resposta de volta ao Chatwit via API de mensagens
3. WHEN uma resposta é enviada ao Chatwit THEN a mensagem SHALL aparecer na interface do agente como mensagem outgoing do bot
4. IF o sistema falhar no processamento THEN a mensagem SHALL ser direcionada para fallback humano

### Requirement 2

**User Story:** Como desenvolvedor do sistema, eu quero garantir idempotência e rate limiting no processamento de mensagens, para que não haja duplicação de respostas ou sobrecarga do sistema.

#### Acceptance Criteria

1. WHEN uma mensagem é recebida THEN SHALL usar chave `idem:cw:${account_id}:${conversation_id}:${message_id}` com TTL=300s (SETNX)
2. IF chave já existe THEN SHALL não enfileirar, responder `{dedup:true}` e logar
3. WHEN rate limiting é aplicado THEN SHALL verificar por conversation_id (8/10s), account_id (80/10s) e contato (15/10s)
4. IF rate limit é atingido THEN o sistema SHALL retornar status 202 (throttled) e expor métrica `ai_ratelimit_hits_total{scope}`

### Requirement 3

**User Story:** Como um cliente final, eu quero receber respostas inteligentes baseadas em classificação de intenções ou geração dinâmica de IA, para que minhas dúvidas sejam resolvidas rapidamente.

#### Acceptance Criteria

1. WHEN o sistema recebe uma mensagem THEN SHALL tentar classificar a intenção usando embeddings + PGVector
2. IF uma intenção é identificada com confiança >= threshold THEN o sistema SHALL responder com template predefinido
3. IF nenhuma intenção é identificada THEN o sistema SHALL usar LLM para gerar resposta dinâmica com botões
4. WHEN gera resposta dinâmica THEN o sistema SHALL usar Structured Output para garantir formato válido

### Requirement 4

**User Story:** Como um cliente do WhatsApp, eu quero receber mensagens interativas com botões de resposta rápida seguindo o padrão oficial da Meta, para que eu possa interagir facilmente com o sistema.

#### Acceptance Criteria

1. WHEN o sistema gera mensagem interativa para WhatsApp THEN SHALL usar formato de Reply Buttons da Cloud API
2. WHEN cria botões THEN o sistema SHALL limitar a 3 botões máximo com títulos <= 20 caracteres
3. WHEN define corpo da mensagem THEN o texto SHALL ser <= 1024 caracteres
4. IF header é usado THEN SHALL ser <= 60 caracteres e footer SHALL conter nome da empresa

### Requirement 5

**User Story:** Como um cliente do Instagram, eu quero receber mensagens com Quick Replies ou Button Templates adequados ao canal, para que eu tenha uma experiência nativa da plataforma.

#### Acceptance Criteria

1. WHEN o sistema gera mensagem para Instagram THEN SHALL escolher entre Quick Reply ou Button Template
2. WHEN usa Quick Reply THEN SHALL limitar a 13 opções máximo com títulos <= 20 caracteres
3. WHEN usa Button Template THEN SHALL limitar texto a 640 caracteres e 3 botões máximo
4. WHEN cliente clica em botão/quick reply THEN o payload SHALL ser enviado de volta via webhook

### Requirement 6

**User Story:** Como administrador do sistema, eu quero ter logs detalhados e auditoria de todas as interações de IA, para que eu possa monitorar performance e debugar problemas.

#### Acceptance Criteria

1. WHEN o sistema processa uma mensagem THEN SHALL criar registro em LlmAudit com input, output e score
2. WHEN classifica intenções THEN SHALL registrar todos os candidatos em IntentHitLog
3. WHEN ocorre erro no processamento THEN SHALL logar erro estruturado com contexto completo
4. WHEN processa mensagem THEN SHALL incluir accountId, conversationId, messageId nos logs

### Requirement 7

**User Story:** Como desenvolvedor, eu quero que o sistema seja resiliente a falhas de IA e tenha mecanismos de retry e dead letter queue, para que mensagens não sejam perdidas.

#### Acceptance Criteria

1. WHEN erro 5xx ocorre THEN SHALL retry 3x com backoff exponencial (1s/2s/4s)
2. WHEN erro 429 ocorre THEN SHALL honrar Retry-After ou retry em 5s (máx 3x)
3. WHEN erro 4xx não-transiente ocorre THEN SHALL enviar para DLQ imediatamente + alerta
4. IF todas as tentativas falharem THEN SHALL enviar resposta de fallback "Acionei um atendente humano" e tag conversa

### Requirement 8

**User Story:** Como administrador, eu quero poder gerenciar intenções e seus embeddings via interface administrativa, para que eu possa treinar e ajustar o sistema de classificação.

#### Acceptance Criteria

1. WHEN uma nova intenção é criada THEN o sistema SHALL gerar embedding automaticamente via worker
2. WHEN intenção é atualizada THEN o embedding SHALL ser recalculado em background
3. WHEN busca por intenções THEN o sistema SHALL usar busca vetorial via PGVector
4. IF similarity score < threshold THEN a intenção SHALL ser rejeitada

### Requirement 9

**User Story:** Como desenvolvedor, eu quero que todas as mensagens sejam sanitizadas e validadas antes do envio, para que não haja rejeição pela API do Chatwit ou provedores.

#### Acceptance Criteria

1. WHEN gera mensagem WhatsApp THEN SHALL validar body ≤1024, header/footer ≤60, buttons 1-3 com title ≤20 e id ≤256
2. WHEN gera Quick Reply Instagram THEN SHALL validar text ≤1000, até 13 opções (capar 3 por UX), title ≤20, payload ≤1000
3. WHEN gera Button Template Instagram THEN SHALL validar text ≤640, buttons 1-3 (postback|web_url), web_url HTTPS
4. WHEN valida títulos THEN SHALL garantir únicos (case-insensitive) e truncar preservando sentido

### Requirement 10

**User Story:** Como operador do sistema, eu quero métricas e monitoramento em tempo real do processamento de IA, para que eu possa identificar problemas rapidamente.

#### Acceptance Criteria

1. WHEN sistema processa mensagens THEN SHALL expor métricas de latência e throughput
2. WHEN ocorrem erros THEN SHALL incrementar contadores por tipo de erro
3. WHEN taxa de fallback > 20% THEN o sistema SHALL gerar alerta
4. WHEN fila de processamento > 100 jobs THEN SHALL notificar sobre possível gargalo

### Requirement 11

**User Story:** Como SRE/owner do produto, eu quero metas de desempenho e disponibilidade para garantir experiência consistente.

#### Acceptance Criteria

1. WHEN sistema processa mensagem THEN p95 de latência SHALL ser ≤ 2.5s e p99 ≤ 5s
2. WHEN worker de IA está operando THEN disponibilidade SHALL ser ≥ 99.9% mensal
3. WHEN sistema inicia THEN cold start p95 SHALL ser ≤ 1s com conexões aquecidas
4. IF erro interno ocorre THEN taxa SHALL ser ≤ 0.1% das mensagens (excluindo HUMAN_FALLBACK)

### Requirement 12

**User Story:** Como DPO/segurança, eu preciso de proteção de dados e trilhas de auditoria mínimas.

#### Acceptance Criteria

1. WHEN webhook é recebido THEN SHALL validar HMAC + timestamp e retornar 401 se fora de janela ±5 min
2. WHEN dados são armazenados THEN PII sensível em LlmAudit.inputText SHALL ser mascarado
3. WHEN dados expiram THEN LlmAudit e IntentHitLog SHALL ter TTL configurável (90 dias)
4. WHEN tokens são usados THEN SHALL vir apenas de Secret Manager com rotação trimestral

### Requirement 13

**User Story:** Como dev/QA, eu quero contratos estáveis com versionamento para evitar regressões.

#### Acceptance Criteria

1. WHEN webhook é recebido THEN SHALL validar campos obrigatórios: account_id, channel, conversation.id, message.id, message.message_type, message.content OR content_attributes, message.created_at
2. WHEN resposta é enviada THEN SHALL incluir additional_attributes.schema_version="1.0.0" e content_attributes consistente por canal
3. WHEN contrato muda THEN SHALL incrementar semver e manter compatibilidade por 30 dias
4. IF mudança é breaking THEN SHALL usar feature flag para transição gradual

### Requirement 14

**User Story:** Como operador, eu preciso enxergar saúde do sistema e rastrear mensagens ponta a ponta.

#### Acceptance Criteria

1. WHEN mensagem é processada THEN SHALL gerar traceId por webhook e propagar em logs dos workers + chamada ao Chatwit
2. WHEN métricas são coletadas THEN SHALL expor ai_job_latency_ms, ai_jobs_in_queue, ai_fallback_rate, ai_ratelimit_hits_total{scope}
3. WHEN tracing é ativo THEN SHALL criar spans para webhook, job, classificador, LLM e postagem
4. WHEN alertas são configurados THEN SHALL notificar se fila > 100 (5m) ou fallback > 20% (10m)

### Requirement 15

**User Story:** Como owner, eu quero controle de custos e conformidade com cotas de API.

#### Acceptance Criteria

1. WHEN texto é curto e repetitivo THEN SHALL usar resposta cacheada sem chamar LLM
2. WHEN modelo é selecionado THEN SHALL usar embedding sempre e LLM mini por padrão
3. IF TOKENS_DIA_CONTA ou R$_DIA é excedido THEN SHALL ativar modo econômico (modelo "mini", respostas ≤ N chars, sem mídia)
4. WHEN rate limit é aplicado THEN SHALL ser configurável por conta e por contato

### Requirement 16

**User Story:** Como PM/Eng, eu quero ativar incrementalmente e reverter rápido.

#### Acceptance Criteria

1. WHEN feature é ativada THEN SHALL usar flags por account_id/inbox_id para cada funcionalidade
2. WHEN rollout inicia THEN SHALL começar com 5% das conversas e monitorar erros
3. IF taxa de erro > 1% THEN SHALL fazer rollback automático
4. WHEN kill switch é ativado THEN SHALL desativar LLM e manter apenas texto simples