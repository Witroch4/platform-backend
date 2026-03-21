# Instagram Interactive Messages Implementation

## Resumo da Implementação

Esta implementação adapta completamente o criador de mensagens interativas para suportar tanto WhatsApp quanto Instagram, com interface dinâmica baseada no tipo de canal.

## Principais Modificações

### 1. Tipos de Mensagem Adaptativos

**Arquivo**: `InteractiveMessageTypeSelector.tsx`

- **WhatsApp**: 8 tipos de mensagem (button, list, cta_url, flow, location, location_request, reaction, sticker)
- **Instagram**: 3 tipos de mensagem específicos:
  - `quick_replies`: Respostas Rápidas (máx 13 opções)
  - `generic`: Template Genérico/Carrossel (máx 10 elementos)
  - `button_template`: Template de Botões (1-3 botões)

**Funcionalidades**:
- Detecção automática do tipo de canal via `channelType` prop
- Interface específica para cada canal com badges e limites
- Informações de limites do Instagram exibidas dinamicamente

### 2. Validação e Limites do Instagram

**Arquivo**: `types/interactive-messages.ts`

Novos limites específicos do Instagram:
```typescript
INSTAGRAM_QUICK_REPLIES_MAX_LENGTH: 1000,
INSTAGRAM_QUICK_REPLIES_MAX_COUNT: 13,
INSTAGRAM_QUICK_REPLY_TITLE_MAX_LENGTH: 20,
INSTAGRAM_GENERIC_MAX_ELEMENTS: 10,
INSTAGRAM_GENERIC_TITLE_MAX_LENGTH: 80,
INSTAGRAM_GENERIC_SUBTITLE_MAX_LENGTH: 80,
INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH: 640,
INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS: 3,
```

### 3. Determinação Automática de Template

**Arquivo**: `utils.ts`

Função `getInstagramTemplateType()` que determina automaticamente o tipo de template baseado no conteúdo:
- **≤ 80 chars**: Generic Template (Carrossel)
- **81-640 chars**: Button Template
- **> 640 chars**: Quick Replies (com validação de limite de 1000)

### 4. Componentes Adaptativos

#### BodySection
- Mostra automaticamente o tipo de template Instagram que será usado
- Alertas quando exceder limites específicos
- Contadores de caracteres dinâmicos
- Informações contextuais sobre cada tipo de template

#### HeaderSection
- Remove opção "Document" para Instagram (não suportado)
- Limites de upload específicos do Instagram:
  - **Imagem**: PNG, JPEG, GIF até 8MB
  - **Vídeo**: MP4, OGG, AVI, MOV, WEBM até 25MB
- Interface em português para Instagram
- Informações sobre compatibilidade

#### FooterSection
- Para Instagram: explicação que footer = subtítulo do template genérico
- Limite de 80 caracteres (subtítulo do Instagram)
- Interface contextual específica

### 5. Fluxo de Dados

O `channelType` é obtido do contexto `MtfData` baseado no `inboxId` e propagado através de toda a hierarquia de componentes:

```
InteractiveMessageCreator 
  → TypeSelectionStep (+ channelType)
    → InteractiveMessageTypeSelector (+ channelType)
  → UnifiedEditingStep (+ channelType)
    → HeaderSection (+ channelType)
    → BodySection (+ channelType) 
    → FooterSection (+ channelType)
    → ButtonsSection (já tinha channelType)
```

## Estruturas de Dados Instagram

### Quick Replies
```typescript
{
  text: string, // máx 1000 bytes UTF-8
  quick_replies: [
    {
      content_type: 'text',
      title: string, // máx 20 chars
      payload: string
    }
  ] // máx 13 items
}
```

### Generic Template (Carrossel)
```typescript
{
  template_type: 'generic',
  elements: [
    {
      title: string, // máx 80 chars (usa body)
      subtitle: string, // máx 80 chars (usa footer)
      image_url?: string,
      buttons?: [...] // máx 3 por elemento
    }
  ] // máx 10 elementos
}
```

### Button Template
```typescript
{
  template_type: 'button',
  text: string, // máx 640 chars (usa body)
  buttons: [...] // 1-3 botões
}
```

## Salvamento no Banco

O sistema reutiliza o modelo `Template` e `InteractiveContent` existente:

- **Header**: Para Instagram, título do template genérico
- **Body**: Texto principal (com limites específicos por tipo)
- **Footer**: Para Instagram, subtítulo do template genérico
- **ActionReplyButton**: Botões (com estrutura adaptada)

## Conversão Backend

O backend continuará fazendo a conversão final baseado no `channelType` da inbox, mas agora o frontend já apresenta a interface correta e aplica as validações específicas do Instagram.

## Benefícios

1. **Interface Dinâmica**: Usuário vê exatamente os tipos disponíveis para seu canal
2. **Validação Antecipada**: Erros de limite detectados antes do envio  
3. **Experiência Contextual**: Informações específicas do Instagram quando relevante
4. **Compatibilidade**: Mantém funcionalidade completa do WhatsApp
5. **Escalabilidade**: Arquitetura permite adicionar novos canais facilmente

## Próximos Passos Sugeridos

1. Implementar validação específica para botões do Instagram (web_url vs postback)
2. Adicionar preview específico do Instagram na PreviewSection
3. Implementar lógica de conversão específica do Instagram no backend
4. Adicionar testes específicos para tipos de mensagem do Instagram
