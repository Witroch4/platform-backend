# Sistema de Variáveis Unificadas - MTF Diamante

## Resumo da Implementação

Foi implementado um sistema unificado de variáveis que combina variáveis normais e lotes em uma única API e interface, conforme solicitado.

## Principais Mudanças

### 1. API Unificada de Variáveis (`/api/admin/mtf-diamante/variaveis`)

**Arquivo:** `app/api/admin/mtf-diamante/variaveis/route.ts`

- **Unificação:** A API agora retorna tanto variáveis normais quanto lotes em um formato unificado
- **Lotes Formatados:** Cada lote é convertido em uma variável com valor humanizado:
  ```
  Lote 1
  Valor: R$ 287,90
  Período: 06/08/2025 15:00 às 07/08/2025 16:00
  ```
- **Estrutura de Resposta:**
  ```typescript
  {
    id: string;
    chave: string;
    valor: string; // Valor humanizado para lotes
    valorRaw?: string; // Valor puro para processamento
    tipo: 'normal' | 'lote';
    descricao: string;
    displayName: string;
    isActive?: boolean;
    loteData?: LoteData; // Dados completos do lote
  }
  ```

### 2. Hook Personalizado para Variáveis

**Arquivo:** `app/admin/mtf-diamante/hooks/useUnifiedVariables.ts`

- **Gerenciamento Centralizado:** Hook que gerencia o estado das variáveis unificadas
- **Inserção Inteligente:** Função `insertVariable` que insere variáveis no texto
- **Cache e Atualização:** Sistema de refresh automático das variáveis

### 3. Menu de Contexto Unificado

**Arquivo:** `app/admin/mtf-diamante/components/shared/VariableContextMenu.tsx`

- **Interface Unificada:** Menu que mostra tanto variáveis normais quanto lotes
- **Busca e Filtros:** Sistema de busca e filtros por tipo (normal/lote)
- **Visualização Rica:** Exibe informações detalhadas de cada variável/lote
- **Inserção por Clique:** Clique para inserir variável no texto

### 4. Editor de Texto Atualizado

**Arquivo:** `app/admin/mtf-diamante/components/shared/WhatsAppTextEditor.tsx`

- **Menu de Contexto:** Integração com o menu de variáveis (clique direito + botão)
- **Suporte a AccountId:** Parâmetro para identificar o contexto das variáveis
- **Inserção Posicional:** Inserção de variáveis na posição do cursor

### 5. Processamento no Worker

**Arquivo:** `lib/mtf-diamante/variables-resolver.ts`

- **Processamento Unificado:** Sistema que processa tanto variáveis normais quanto lotes
- **Formatação Humanizada:** Lotes são formatados automaticamente para o cliente
- **Cache Redis:** Sistema de cache para performance
- **Compatibilidade:** Mantém compatibilidade com variáveis antigas

### 6. Componente de Criação de Mensagens

**Arquivo:** `app/admin/mtf-diamante/components/interactive-message-creator/UnifiedEditingStep.tsx`

- **Integração Completa:** Todos os editores de texto agora suportam o menu de variáveis
- **AccountId Configurado:** Parâmetro `accountId="mtf-diamante"` configurado

## Como Funciona

### 1. Criação de Lotes
- Lotes são criados normalmente via API `/api/admin/mtf-diamante/lotes`
- Cada lote é armazenado na variável interna `lotes_oab`

### 2. Exibição Unificada
- API `/api/admin/mtf-diamante/variaveis` retorna:
  - Variáveis normais (chave_pix, nome_do_escritorio_rodape, etc.)
  - Lotes formatados (lote_1, lote_2, etc.)

### 3. Inserção em Mensagens
- Usuário clica com botão direito no texto OU clica no botão de variáveis
- Menu mostra todas as variáveis disponíveis
- Clique insere `{{chave_variavel}}` no texto

### 4. Processamento no Worker
- Worker detecta `{{lote_1}}` na mensagem
- Busca o lote correspondente
- Substitui pela versão humanizada:
  ```
  Lote 1
  Valor: R$ 287,90
  Período: 06/08/2025 15:00 às 07/08/2025 16:00
  ```

## Exemplo de Uso

### 1. Criação de Lote
```javascript
POST /api/admin/mtf-diamante/lotes
{
  "numero": 1,
  "nome": "Lote Especial",
  "valor": "R$ 287,90",
  "dataInicio": "2025-08-06T15:00:00Z",
  "dataFim": "2025-08-07T16:00:00Z"
}
```

### 2. Busca de Variáveis
```javascript
GET /api/admin/mtf-diamante/variaveis
// Retorna variáveis normais + lotes formatados
```

### 3. Criação de Mensagem Interativa
- Usuário digita texto
- Clica com botão direito
- Seleciona "Lote 1" do menu
- Texto fica: "Confira nosso {{lote_1}}"

### 4. Envio pelo Worker
- Worker processa: "Confira nosso {{lote_1}}"
- Substitui por: "Confira nosso Lote Especial\nValor: R$ 287,90\nPeríodo: 06/08/2025 15:00 às 07/08/2025 16:00"

## Benefícios

1. **API Unificada:** Uma única API para todas as variáveis
2. **Interface Consistente:** Menu único para inserir qualquer tipo de variável
3. **Formatação Automática:** Lotes são formatados automaticamente para o cliente
4. **Compatibilidade:** Sistema mantém compatibilidade com código existente
5. **Performance:** Cache Redis para otimização
6. **Flexibilidade:** Suporte a novos tipos de variáveis no futuro

## Arquivos Modificados

1. `app/api/admin/mtf-diamante/variaveis/route.ts` - API unificada
2. `app/admin/mtf-diamante/hooks/useUnifiedVariables.ts` - Hook personalizado (novo)
3. `app/admin/mtf-diamante/components/shared/VariableContextMenu.tsx` - Menu de contexto (novo)
4. `app/admin/mtf-diamante/components/shared/WhatsAppTextEditor.tsx` - Editor atualizado
5. `lib/mtf-diamante/variables-resolver.ts` - Processamento unificado
6. `app/admin/mtf-diamante/components/interactive-message-creator/UnifiedEditingStep.tsx` - Integração

## Status

✅ **Implementação Completa**
- Sistema unificado funcionando
- Menu de contexto integrado
- Processamento no worker atualizado
- Compatibilidade mantida

O sistema agora permite que o usuário use uma única interface para inserir tanto variáveis normais quanto lotes, com formatação automática e processamento inteligente no backend.