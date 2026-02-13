# Requirements Document

## Introduction

O sistema atual agrupa diferentes tipos de mensagens interativas (`button`, `quick_replies`, `generic`, `button_template`) no mesmo modelo `ActionReplyButton` sem distinção clara do tipo específico. Esta refatoração visa adicionar um campo `type` ao modelo `ActionReplyButton` para identificar explicitamente o tipo de cada mensagem interativa, mantendo a estrutura existente mas permitindo diferenciação e validação específica por tipo.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor do sistema, eu quero que o modelo `ActionReplyButton` tenha um campo `type` explícito, para que eu possa identificar claramente se é `button`, `quick_replies`, `generic` ou `button_template`.

#### Acceptance Criteria

1. WHEN um template do tipo `quick_replies` for criado THEN o sistema SHALL criar um registro no modelo `ActionReplyButton` com `type: "quick_replies"`
2. WHEN um template do tipo `generic` for criado THEN o sistema SHALL criar um registro no modelo `ActionReplyButton` com `type: "generic"`  
3. WHEN um template do tipo `button_template` for criado THEN o sistema SHALL criar um registro no modelo `ActionReplyButton` com `type: "button_template"`
4. WHEN um template do tipo `button` for criado THEN o sistema SHALL criar um registro no modelo `ActionReplyButton` com `type: "button"`

### Requirement 2

**User Story:** Como administrador do sistema, eu quero que o tipo específico da mensagem seja persistido no banco de dados, para que eu possa consultar e filtrar mensagens por tipo específico.

#### Acceptance Criteria

1. WHEN uma mensagem interativa for salva THEN o sistema SHALL persistir o tipo específico (`quick_replies`, `generic`, `button_template`, `button`) no campo `type` do modelo `ActionReplyButton`
2. WHEN uma consulta for feita THEN o sistema SHALL retornar o tipo específico correto do campo `type` do `ActionReplyButton`
3. WHEN uma consulta for feita THEN o sistema SHALL usar o campo `type` do `ActionReplyButton` para determinar o tipo da mensagem interativa

### Requirement 3

**User Story:** Como desenvolvedor da API, eu quero que a criação e leitura de mensagens interativas funcione com o campo `type` explícito, para que a funcionalidade existente continue operando corretamente.

#### Acceptance Criteria

1. WHEN a API POST `/api/admin/mtf-diamante/messages-with-reactions` receber um payload com `type: "quick_replies"` THEN o sistema SHALL criar um registro em `ActionReplyButton` com `type: "quick_replies"`
2. WHEN a API POST receber um payload com `type: "generic"` THEN o sistema SHALL criar um registro em `ActionReplyButton` com `type: "generic"`
3. WHEN a API POST receber um payload com `type: "button_template"` THEN o sistema SHALL criar um registro em `ActionReplyButton` com `type: "button_template"`
4. WHEN a API GET for chamada THEN o sistema SHALL retornar o tipo correto do campo `type` do `ActionReplyButton`

### Requirement 4

**User Story:** Como desenvolvedor, eu quero que a migração dos dados existentes seja feita automaticamente, para que templates já criados tenham o campo `type` preenchido corretamente.

#### Acceptance Criteria

1. WHEN a migração for executada THEN o sistema SHALL identificar todos os registros `ActionReplyButton` existentes sem campo `type`
2. IF um registro `ActionReplyButton` tiver mais de 3 botões THEN o sistema SHALL definir `type: "quick_replies"`
3. IF um registro `ActionReplyButton` tiver header de imagem THEN o sistema SHALL definir `type: "generic"`
4. IF um registro `ActionReplyButton` tiver 1-3 botões sem header de imagem THEN o sistema SHALL definir `type: "button_template"`
5. IF nenhuma das condições acima for atendida THEN o sistema SHALL definir `type: "button"` como padrão

### Requirement 5

**User Story:** Como desenvolvedor, eu quero que o modelo `ActionReplyButton` tenha validações específicas baseadas no campo `type`, para que dados inconsistentes sejam rejeitados na criação.

#### Acceptance Criteria

1. WHEN um `ActionReplyButton` com `type: "quick_replies"` for criado THEN o sistema SHALL validar que existem entre 4-13 botões
2. WHEN um `ActionReplyButton` com `type: "generic"` for criado THEN o sistema SHALL validar que existe um header de imagem no `InteractiveContent` relacionado
3. WHEN um `ActionReplyButton` com `type: "button_template"` for criado THEN o sistema SHALL validar que existem entre 1-3 botões
4. IF as validações falharem THEN o sistema SHALL retornar erro HTTP 400 com mensagem específica

### Requirement 6

**User Story:** Como desenvolvedor do frontend, eu quero que os tipos específicos sejam retornados nas consultas, para que eu possa renderizar a interface apropriada para cada tipo.

#### Acceptance Criteria

1. WHEN uma consulta GET for feita THEN o sistema SHALL retornar o campo `type` com o valor específico (`quick_replies`, `generic`, `button_template`, `button`) do modelo `ActionReplyButton`
2. WHEN o tipo for `quick_replies` THEN o sistema SHALL incluir os dados do modelo `ActionReplyButton` com `type: "quick_replies"`
3. WHEN o tipo for `generic` THEN o sistema SHALL incluir os dados do modelo `ActionReplyButton` com `type: "generic"`
4. WHEN o tipo for `button_template` THEN o sistema SHALL incluir os dados do modelo `ActionReplyButton` com `type: "button_template"`