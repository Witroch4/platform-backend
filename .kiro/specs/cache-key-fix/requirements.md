# Cache Key Fix - Requirements Document

## Introduction

O sistema atual de cache do Instagram está usando apenas `intentName:inboxId` como chave, mas isso não é único quando há múltiplos usuários do Chatwit com inboxes de mesmo ID. A chave única deveria ser `intentName:usuarioChatwitId:inboxId` para garantir isolamento entre usuários.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor do sistema, eu quero que o cache do Instagram use chaves únicas por usuário, para que não haja conflito entre usuários diferentes com inboxes de mesmo ID.

#### Acceptance Criteria

1. WHEN um template é cacheado THEN a chave deve incluir o usuarioChatwitId
2. WHEN um template é invalidado THEN a invalidação deve usar a chave completa com usuarioChatwitId
3. WHEN uma consulta de cache é feita THEN deve usar a chave completa com usuarioChatwitId
4. WHEN há múltiplos usuários com mesmo inboxId THEN cada um deve ter cache isolado

### Requirement 2

**User Story:** Como usuário do Chatwit, eu quero que meus templates sejam isolados de outros usuários, para que mudanças em templates de outros usuários não afetem meu cache.

#### Acceptance Criteria

1. WHEN eu modifico um template THEN apenas meu cache deve ser invalidado
2. WHEN outro usuário modifica um template THEN meu cache não deve ser afetado
3. WHEN eu consulto um template THEN deve retornar apenas templates do meu contexto
4. WHEN há conflito de inboxId entre usuários THEN cada usuário deve ter dados isolados

### Requirement 3

**User Story:** Como administrador do sistema, eu quero que as APIs de invalidação de cache funcionem corretamente, para que as mudanças nos templates sejam refletidas imediatamente.

#### Acceptance Criteria

1. WHEN uma API de mapeamento é chamada THEN deve invalidar o cache usando a chave correta
2. WHEN um template é deletado THEN deve invalidar o cache usando a chave correta
3. WHEN um template é atualizado THEN deve invalidar o cache usando a chave correta
4. WHEN a invalidação falha THEN deve logar o erro mas não falhar a operação