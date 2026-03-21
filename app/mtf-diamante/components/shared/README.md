# Componentes de Texto Aprimorados para Templates WhatsApp

Este documento descreve os componentes de texto aprimorados criados para o sistema MTF Diamante, que oferecem suporte avançado a variáveis, validação em tempo real e integração com o sistema de conversão de variáveis para a API Meta.

## Componentes Principais

### 1. EnhancedTextArea

Componente base que estende os campos de texto padrão com funcionalidades avançadas:

#### Funcionalidades
- **Menu de contexto para inserção de variáveis**: Clique direito para acessar variáveis disponíveis
- **Validação em tempo real**: Valida sintaxe de variáveis e regras de negócio
- **Estatísticas de variáveis**: Mostra contagem e informações sobre variáveis utilizadas
- **Gerenciamento de posição do cursor**: Insere variáveis na posição correta do cursor
- **Suporte a modo single-line e multi-line**: Flexível para diferentes tipos de campo
- **Integração com tema**: Suporte completo ao modo escuro

#### Propriedades
```typescript
interface EnhancedTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  variables: MtfDiamanteVariavel[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
  label?: React.ReactNode;
  description?: string;
  showValidation?: boolean;
  showVariableStats?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}
```

#### Exemplo de Uso
```tsx
<EnhancedTextArea
  value={bodyText}
  onChange={setBodyText}
  variables={variables}
  label="Corpo da Mensagem"
  description="Conteúdo principal da mensagem"
  showValidation={true}
  showVariableStats={true}
  maxLength={1024}
  onValidationChange={(isValid, errors) => {
    console.log('Validação:', { isValid, errors });
  }}
/>
```

### 2. Componentes de Campo Especializados

#### HeaderField
Componente especializado para cabeçalhos de template:
- Limitado a 60 caracteres
- Modo single-line
- Só é renderizado quando `headerType` é 'TEXT'

#### BodyField
Componente para o corpo da mensagem:
- Limitado a 1024 caracteres
- Modo multi-line (4 linhas por padrão)
- Campo obrigatório
- Suporte a pré-visualização em tempo real
- Estatísticas de variáveis habilitadas por padrão

#### FooterField
Componente para rodapé da mensagem:
- Limitado a 60 caracteres
- Modo single-line
- Auto-população com nome da empresa (opcional)
- Campo opcional

#### Exemplo de Uso dos Campos Especializados
```tsx
<HeaderField
  value={headerText}
  onChange={setHeaderText}
  variables={variables}
  headerType="TEXT"
/>

<BodyField
  value={bodyText}
  onChange={setBodyText}
  variables={variables}
  showPreview={true}
  previewMode="numbered"
/>

<FooterField
  value={footerText}
  onChange={setFooterText}
  variables={variables}
  autoPopulateCompanyName={true}
/>
```

### 3. TemplateFields (Componente Combinado)

Componente que combina todos os campos de template em uma interface unificada:

```tsx
<TemplateFields
  headerType="TEXT"
  headerValue={headerText}
  onHeaderChange={setHeaderText}
  bodyValue={bodyText}
  onBodyChange={setBodyText}
  footerValue={footerText}
  onFooterChange={setFooterText}
  variables={variables}
  showPreview={true}
  previewMode="numbered"
  autoPopulateFooter={true}
  onValidationChange={(field, isValid, errors) => {
    console.log(`${field} validation:`, { isValid, errors });
  }}
/>
```

## Hook de Validação

### useTemplateValidation

Hook personalizado que gerencia validação de templates e integração com o sistema de conversão de variáveis:

#### Funcionalidades
- Validação em tempo real de todos os campos
- Integração com o VariableConverter
- Geração de pré-visualizações
- Conversão para formato Meta API
- Estatísticas de variáveis

#### Exemplo de Uso
```tsx
const {
  validation,
  getPreviewText,
  getMetaConversion,
  getVariableStats,
  isValid,
  errors
} = useTemplateValidation({
  headerText,
  bodyText,
  footerText,
  variables,
  headerType: 'TEXT'
});

// Verificar se o template é válido
if (isValid) {
  // Obter conversão para Meta API
  const metaPayload = getMetaConversion(bodyText);
  console.log('Payload Meta:', metaPayload);
}

// Obter pré-visualização
const preview = getPreviewText(bodyText, 'actual');
const numberedPreview = getPreviewText(bodyText, 'numbered');
```

## Sistema de Validação

### Regras de Validação

1. **Variáveis**:
   - Não podem estar vazias: `{{}}` é inválido
   - Devem usar apenas letras minúsculas e underscores: `{{Nome}}` é inválido, `{{nome}}` é válido

2. **Limites de Caracteres**:
   - Cabeçalho (TEXT): máximo 60 caracteres
   - Corpo: máximo 1024 caracteres (obrigatório)
   - Rodapé: máximo 60 caracteres (opcional)

3. **Campos Obrigatórios**:
   - Corpo da mensagem é sempre obrigatório
   - Cabeçalho é obrigatório apenas se o tipo for 'TEXT'

### Mensagens de Erro em Português

Todas as mensagens de validação são exibidas em português brasileiro:
- "O corpo da mensagem é obrigatório"
- "Cabeçalho excede o limite de 60 caracteres"
- "Template contém variáveis vazias. Nomes de variáveis não podem estar vazios."
- "Nome de variável inválido. Use apenas letras minúsculas e underscores."

## Integração com Sistema de Variáveis

### Menu de Contexto

O menu de contexto (clique direito) oferece:
- **Variáveis Especiais**: PIX, nome da empresa
- **Variáveis Customizadas**: Definidas na aba de configurações
- **Ícones visuais**: Diferentes ícones para cada tipo de variável
- **Descrições**: Explicações sobre cada variável

### Auto-População

- **Rodapé**: Automaticamente populado com `{{nome_do_escritorio_rodape}}` quando vazio
- **Variáveis PIX**: Validação especial para chaves PIX (máximo 15 caracteres)

## Pré-visualização em Tempo Real

### Modos de Pré-visualização

1. **Modo Numerado**: Mostra variáveis no formato Meta API (`{{1}}`, `{{2}}`) com valores de exemplo
2. **Modo Real**: Mostra o texto final com valores reais das variáveis

### Exemplo de Pré-visualização

**Texto Original:**
```
Olá {{nome}}, seu protocolo {{protocolo_oab}} foi processado.
```

**Modo Numerado:**
```
Olá {{1}} (João Silva), seu protocolo {{2}} (ABC123456) foi processado.
```

**Modo Real:**
```
Olá João Silva, seu protocolo ABC123456 foi processado.
```

## Testes

Todos os componentes possuem testes abrangentes:

- **EnhancedTextArea**: 10 testes cobrindo funcionalidades principais
- **TemplateFieldComponents**: 12 testes para componentes especializados
- **useTemplateValidation**: 10 testes para o hook de validação

### Executar Testes

```bash
# Testar componente principal
npm test -- app/admin/mtf-diamante/components/__tests__/EnhancedTextArea.test.tsx --run

# Testar componentes de campo
npm test -- app/admin/mtf-diamante/components/shared/__tests__/TemplateFieldComponents.test.tsx --run

# Testar hook de validação
npm test -- app/admin/mtf-diamante/hooks/__tests__/useTemplateValidation.test.ts --run
```

## Demonstração

O componente `TemplateEditorDemo` oferece uma demonstração completa de todas as funcionalidades:

- Editor de template interativo
- Pré-visualização em tempo real
- Visualização do payload Meta API
- Estatísticas de variáveis
- Validação em tempo real

Para usar a demonstração, importe e renderize o componente:

```tsx
import { TemplateEditorDemo } from './components/shared/TemplateEditorDemo';

// Em sua página ou componente
<TemplateEditorDemo />
```

## Considerações de Performance

- **Debounce**: Validação é executada com debounce para evitar execuções excessivas
- **Memoização**: Pré-visualizações são memoizadas para evitar recálculos desnecessários
- **Lazy Loading**: Componentes são carregados apenas quando necessários

## Acessibilidade

- **Labels**: Todos os campos possuem labels apropriados
- **Descrições**: Textos de ajuda para orientar o usuário
- **Validação**: Mensagens de erro são anunciadas por leitores de tela
- **Navegação por teclado**: Suporte completo à navegação por teclado
- **Contraste**: Cores seguem diretrizes de contraste WCAG

## Próximos Passos

1. **Highlighting de Variáveis**: Implementar destaque visual das variáveis no texto
2. **Auto-complete**: Sugestões de variáveis durante a digitação
3. **Histórico**: Manter histórico de templates criados
4. **Templates Favoritos**: Sistema de favoritos para templates frequentes
5. **Importação/Exportação**: Funcionalidade para importar/exportar templates