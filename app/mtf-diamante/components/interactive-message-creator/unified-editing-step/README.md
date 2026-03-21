# UnifiedEditingStep - Componentes Refatorados

Este diretório contém a versão refatorada do componente `UnifiedEditingStep`, dividido em componentes lógicos menores e mais gerenciáveis.

## Estrutura dos Componentes

### 📁 `unified-editing-step/`

#### 🔧 **Arquivos de Configuração**
- **`types.ts`** - Todas as interfaces TypeScript e constantes de validação
- **`utils.ts`** - Funções utilitárias para conversão e validação
- **`index.ts`** - Exportações centralizadas

#### 🧩 **Componentes de Seção**

1. **`MessageConfiguration.tsx`**
   - Configuração básica da mensagem (nome)
   - Validação de campo em tempo real

2. **`HeaderSection.tsx`**
   - Configuração do cabeçalho (texto, imagem, vídeo)
   - Upload de mídia integrado
   - Seleção de tipo de cabeçalho

3. **`BodySection.tsx`**
   - Editor do corpo principal da mensagem
   - Integração com WhatsAppTextEditor
   - Validação de comprimento

4. **`FooterSection.tsx`**
   - Configuração do rodapé opcional
   - Validação de limite de caracteres

5. **`ButtonsSection.tsx`**
   - Gerenciamento de botões interativos
   - Configuração de reações automáticas
   - Suporte a diferentes tipos de canal (Instagram/WhatsApp)

6. **`CtaUrlSection.tsx`**
   - Configuração de Call-to-Action URLs
   - Validação de URL e texto do botão

7. **`NavigationSection.tsx`**
   - Controles de navegação (Voltar/Continuar)
   - Indicadores de erro
   - Estado de validação

8. **`PreviewSection.tsx`**
   - Preview em tempo real da mensagem
   - Resolução de variáveis
   - Visualização sticky

## 🔄 **Principais Melhorias**

### **Separação de Responsabilidades**
- Cada componente tem uma responsabilidade específica
- Melhor organização e manutenibilidade
- Reutilização de componentes facilitada

### **Tipagem Melhorada**
- Interfaces TypeScript bem definidas
- Props tipadas para cada componente
- Melhor IntelliSense e detecção de erros

### **Gerenciamento de Estado**
- Estado distribuído adequadamente
- Callbacks otimizados com useCallback
- Memoização adequada com useMemo

### **Validação Centralizada**
- Hook de validação reutilizado
- Validação em tempo real
- Tratamento de erros consistente

## 📝 **Como Usar**

```tsx
import { UnifiedEditingStep } from './UnifiedEditingStep';

// O componente principal continua com a mesma interface
<UnifiedEditingStep
  message={message}
  reactions={reactions}
  variables={variables}
  onMessageUpdate={onMessageUpdate}
  onReactionUpdate={onReactionUpdate}
  onNext={onNext}
  onBack={onBack}
  disabled={disabled}
  inboxId={inboxId}
/>
```

## 🛠 **Componentes Individuais**

Você também pode usar os componentes individuais se necessário:

```tsx
import { 
  MessageConfiguration,
  HeaderSection,
  BodySection,
  // ... outros componentes
} from './unified-editing-step';
```

## 🔧 **Utilitários Disponíveis**

```tsx
import {
  convertBackendToInteractive,
  convertInteractiveToBackend,
  convertCentralToLocal,
  generatePrefixedId,
  resolveVariables,
  getInstagramTemplateType,
  VALIDATION_LIMITS
} from './unified-editing-step';
```

## 📦 **Dependências Mantidas**

- Componentes legados ainda funcionam (WhatsAppTextEditor, ReactionConfigManager)
- Hook de validação preservado
- Todas as funcionalidades existentes mantidas
- Compatibilidade total com a versão anterior

## 🚀 **Benefícios da Refatoração**

1. **Manutenibilidade**: Cada componente é pequeno e focado
2. **Testabilidade**: Componentes podem ser testados individualmente
3. **Reutilização**: Componentes podem ser usados em outros contextos
4. **Performance**: Melhor controle de re-renderização
5. **Desenvolvimento**: Desenvolvimento paralelo facilitado
6. **Debugging**: Mais fácil identificar e corrigir problemas

---

> **Nota**: O arquivo original foi renomeado para `UnifiedEditingStep.backup.tsx` como backup de segurança.
