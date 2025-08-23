# Instagram Button Template Implementation

## 📋 Implementação Baseada no Guia Instagram

Esta implementação segue rigorosamente as especificações do **Template de Botões** do Instagram conforme documentado no guia oficial.

## 🎯 Especificações do Instagram Button Template

### Estrutura Permitida
```typescript
interface ButtonTemplateMessage {
  recipient: { id: string };
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'button';
        text: string;        // Máximo 640 caracteres UTF-8
        buttons: Array<{     // 1 a 3 botões
          type: 'web_url' | 'postback';
          title: string;
          url?: string;      // Para web_url
          payload?: string;  // Para postback
        }>;
      };
    };
  };
}
```

### Limitações Específicas
- **SEM HEADER**: Apenas texto + botões (sem imagem/vídeo/documento)
- **Texto**: Máximo 640 caracteres UTF-8
- **Botões**: 1 a 3 botões obrigatórios
- **Tipos de botão**: Apenas `web_url` e `postback`

## 🔧 Implementações Realizadas

### 1. ButtonsSection.tsx

**Principais Melhorias:**
- ✅ Detecção automática de Button Template (textos 81-640 chars)
- ✅ Validação específica para Instagram Button Template
- ✅ Limite de 3 botões para Instagram Button Template
- ✅ Avisos específicos sobre headers não suportados
- ✅ Cores compatíveis com tema escuro (shadcn/ui)

**Validações Implementadas:**
```typescript
const instagramButtonValidation = {
  textWithinLimit: bodyLength <= 640,    // Máx 640 chars
  hasInvalidHeader: hasHeader,           // Headers não permitidos
  buttonCountValid: buttonCount >= 1 && buttonCount <= 3, // 1-3 botões
  maxButtons: 3
};
```

**Interface de Avisos:**
- 🟡 **Amber Alert**: Header não suportado no Button Template
- 🔴 **Red Alert**: Texto excede 640 caracteres
- 🟢 **Green Info**: Requisitos do Button Template

### 2. HeaderSection.tsx

**Melhorias Implementadas:**
- ✅ Aviso específico quando detecta Button Template
- ✅ Explicação que headers não são suportados
- ✅ Detecção automática via `getInstagramTemplateType()`
- ✅ Cores compatíveis com tema escuro

**Aviso Button Template:**
```tsx
{isButtonTemplate && (
  <div className="bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800">
    Headers (imagem/vídeo) não são suportados no Button Template. 
    Use apenas texto no corpo (máx 640 chars) + botões (1-3).
  </div>
)}
```

### 3. BodySection.tsx

**Melhorias Implementadas:**
- ✅ Badge dinâmico mostrando tipo de template
- ✅ Descrição específica para Button Template
- ✅ Cores compatíveis com tema escuro
- ✅ Avisos sobre limites excedidos

**Interface Adaptativa:**
```tsx
<Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
  {instagramTemplate.type.replace('_', ' ')}
</Badge>
```

## 🎨 Compatibilidade com Tema Escuro

### Padrão de Cores Implementado
```css
/* Light Theme */
bg-purple-50 text-purple-900 border-purple-200

/* Dark Theme */
dark:bg-purple-950/50 dark:text-purple-100 dark:border-purple-800
```

### Cores por Tipo de Aviso
- **Info (Purple)**: Informações gerais do Instagram
- **Warning (Amber)**: Button Template sem header
- **Error (Red)**: Limites excedidos
- **Success (Green)**: Requisitos atendidos

## 🔄 Fluxo de Detecção Automática

### 1. Análise do Texto
```typescript
const getInstagramTemplateType = (bodyText: string) => {
  const bodyLength = bodyText.length;
  
  if (bodyLength > 640) return { type: "quick_replies" };
  if (bodyLength <= 80) return { type: "generic" };
  return { type: "button_template" }; // 81-640 chars
};
```

### 2. Validação Específica
- **Button Template**: Verifica se tem header + valida limite de texto
- **Generic Template**: Permite header + valida limite de 80 chars
- **Quick Replies**: Aceita textos longos + valida limite de 1000 bytes

### 3. Interface Dinâmica
- Badges mostram o tipo detectado
- Avisos específicos por tipo
- Limites ajustados automaticamente

## 📊 Tabela de Validações

| Campo | WhatsApp | Instagram Generic | Instagram Button | Instagram Quick Replies |
|-------|----------|------------------|------------------|------------------------|
| **Header** | ✅ Todos | ✅ Todos | ❌ Não suportado | ✅ Todos |
| **Body** | Até 4096 | Até 80 chars | 81-640 chars | Até 1000 bytes |
| **Botões** | Até 10 | Até 3 | 1-3 obrigatório | Até 13 |
| **Footer** | ✅ | ✅ (subtitle) | ❌ | ❌ |

## 🚀 Funcionalidades Implementadas

### ✅ Detecção Automática
- Canal type via SWR context
- Template type baseado no tamanho do texto
- Validação específica por tipo

### ✅ Interface Adaptativa
- Badges dinâmicos
- Avisos contextuais
- Limites específicos

### ✅ Validação Rigorosa
- Button Template: sem header + 640 chars máx
- Contagem de bytes UTF-8
- Validação em tempo real

### ✅ UX Otimizada
- Cores compatíveis com tema escuro
- Avisos claros e informativos
- Guias visuais para cada template

## 🔮 Próximos Passos

1. **Teste com Caixa Instagram**: Verificar funcionamento com `channelType === 'Channel::Instagram'`
2. **Botões Específicos**: Implementar validação para tipos `web_url` vs `postback`
3. **Preview Instagram**: Adaptar PreviewSection para mostrar como ficará no Instagram
4. **Backend Integration**: Implementar conversão específica para Instagram API

## 📚 Referências

- **Guia Instagram**: `guia menssagens instagram.md` (linha 434+)
- **Button Template Spec**: 640 chars max, 1-3 buttons, no header
- **shadcn/ui**: Tema escuro com classes `dark:`
- **Instagram API**: Template type 'button' structure
