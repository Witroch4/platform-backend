# Requirements Document

## Introduction

O sistema SocialWise Flow está enfrentando erros de schema inválido com a nova API do OpenAI GPT-5 (família). O erro específico é "400 Invalid schema" com código `invalid_json_schema` no parâmetro `text.format.schema`, indicando que o schema gerado pelo Zod contém palavras-chave não suportadas como `allOf`/`anyOf`. O problema aparece especificamente no schema `RouterDecision` em `buttons[].title`. A solução deve ser cirúrgica e rápida, seguindo o padrão da rota de teste `app/api/openai-source-test-biblia` que funciona 100% com a nova API.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor do sistema, eu quero que os schemas Zod sejam compatíveis com Structured Outputs da OpenAI, para que as chamadas da API não falhem com erros de schema inválido.

#### Acceptance Criteria

1. WHEN um schema Zod é convertido para JSON Schema THEN ele NÃO SHALL conter `allOf`, `anyOf`, ou `oneOf`
2. WHEN strings têm validações de comprimento THEN elas SHALL usar apenas regex (pattern) em vez de `.min()`/`.max()` de string (evita allOf). Observação: `.min()`/`.max()` continuam permitidos para arrays e números
3. WHEN campos são opcionais THEN eles SHALL usar `.nullable().default(null)` mantendo o campo como requerido em vez de `.optional()`
4. WHEN objetos são definidos THEN eles SHALL usar `.strict()` para garantir `additionalProperties: false`
5. WHEN schemas são usados com `zodTextFormat` THEN eles SHALL ser aceitos sem erros pela OpenAI Responses API

### Requirement 2

**User Story:** Como desenvolvedor, eu quero um sistema de fallback automático para JSON mode, para que quando Structured Outputs falhar, o sistema continue funcionando sem interrupção.

#### Acceptance Criteria

1. WHEN uma chamada com `client.responses.parse` falha com erro de schema THEN o sistema SHALL automaticamente tentar com `client.responses.create` usando JSON mode
2. WHEN usando JSON mode como fallback THEN o sistema SHALL validar a resposta com `Schema.parse()` localmente
3. WHEN o fallback é acionado THEN o sistema SHALL retornar `mode: "json_mode_fallback"` para identificar o método usado
4. WHEN ambos os modos falham THEN o sistema SHALL retornar um erro com detalhes do `raw_output_text` para debug

### Requirement 3

**User Story:** Como desenvolvedor, eu quero que todos os schemas de botões sejam compatíveis com as restrições por canal, para que as mensagens sejam formatadas corretamente para WhatsApp, Instagram e Facebook.

#### Acceptance Criteria

1. WHEN um schema de botão é criado THEN ele SHALL usar regex `/^.{1,20}$/u` para validar o comprimento do título (evitar `.max(20)` de string)
2. WHEN um schema de botão é criado THEN ele SHALL usar regex apenas quando necessário, evitando combinações que geram `allOf`
3. WHEN um schema de botão é criado THEN ele SHALL usar `.nullable().default(null)` para payload opcional
4. WHEN diferentes canais são usados THEN os schemas SHALL ser criados dinamicamente com `createButtonSchemaForChannel(channel)`

### Requirement 4

**User Story:** Como desenvolvedor, eu quero que o sistema RouterDecision funcione sem erros de schema, para que o roteamento de intenções continue operacional.

#### Acceptance Criteria

1. WHEN o RouterDecision schema é usado THEN ele SHALL usar schemas de botão criados dinamicamente por canal
2. WHEN campos são nullable THEN eles SHALL usar `.nullable()` mantendo o campo como requerido
3. WHEN o schema é enviado para OpenAI com `zodTextFormat` THEN ele SHALL ser aceito sem erros de validação
4. WHEN a resposta é recebida THEN ela SHALL ser parseada corretamente usando `response.output_parsed`

### Requirement 5

**User Story:** Como desenvolvedor, eu quero que as funções de geração (warmup buttons, router LLM, etc.) sejam atualizadas para usar os schemas corrigidos, para que todo o fluxo SocialWise funcione sem interrupções.

#### Acceptance Criteria

1. WHEN `generateWarmupButtons` é chamada THEN ela SHALL usar `client.responses.parse` com fallback automático para `client.responses.create`
2. WHEN `routerLLM` é chamada THEN ela SHALL usar o padrão `structuredOrJson` da rota de teste
3. WHEN `generateFreeChatButtons` é chamada THEN ela SHALL seguir o mesmo padrão de try/catch com fallback
4. WHEN qualquer função usa `buildTextFormat` THEN ela SHALL incluir verbosity dinâmica para modelos GPT-5
### R
equirement 6

**User Story:** Como desenvolvedor, eu quero que o sistema use as melhores práticas da nova API Responses, para que a integração seja otimizada e compatível com GPT-5.

#### Acceptance Criteria

1. WHEN chamadas são feitas para OpenAI THEN elas SHALL usar `client.responses.parse` ou `client.responses.create` em vez de chat completions
2. WHEN modelos GPT-5 são usados THEN o sistema SHALL incluir `reasoning: { effort }` e `text: { verbosity }`
3. WHEN modelos não suportam reasoning THEN o sistema SHALL omitir o parâmetro reasoning
4. WHEN sessões são usadas THEN elas SHALL usar `store: true` e `previous_response_id` para continuidade
5. WHEN timeouts são necessários THEN elas SHALL usar `AbortController` com `signal`