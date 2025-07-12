# Editor Estruturado para Espelhos de Correção

## Visão Geral

O novo editor estruturado permite que você edite o conteúdo dos espelhos de correção sem precisar lidar com a sintaxe Markdown diretamente. Em vez de um campo de texto simples, você agora tem uma interface visual que:

## Funcionalidades Principais

### 1. **Edição Visual de Tabelas**
- ✅ Adicionar linhas nas tabelas
- ✅ Excluir linhas das tabelas
- ✅ Editar células individuais
- ✅ Mantém a estrutura da tabela intacta

### 2. **Edição de Diferentes Tipos de Conteúdo**
- **Títulos (H1, H2, H3, etc.)**: Campos de input específicos
- **Parágrafos**: Áreas de texto redimensionáveis
- **Listas**: Edição item por item
- **Texto em negrito**: Campos específicos
- **Texto em itálico**: Campos específicos
- **Citações**: Áreas de texto estilizadas
- **Código**: Campos com fonte monoespaçada

### 3. **Processo de Funcionamento**

1. **Visualização**: O conteúdo é exibido em formato markdown renderizado
2. **Modo de Edição**: Quando você clica em "Editar", o sistema:
   - Converte o markdown em uma árvore de dados (AST)
   - Renderiza componentes editáveis para cada elemento
   - Permite edição visual sem exposição ao markdown
3. **Salvamento**: Quando você salva:
   - O sistema converte a árvore de dados de volta para markdown
   - Mantém toda a formatação original
   - Salva no banco de dados

## Exemplo de Uso

### Antes (Editor Antigo)
```
## AVALIAÇÃO DA PEÇA PROFISSIONAL (Apelação)

**Pontuação Máxima:** 5,00
**Pontuação Obtida:** 0

| Item de Avaliação | Pontuação Máxima | Nota Obtida |
|-------------------|------------------|-------------|
| Endereçamento ao Juízo | 0,10 | 0,1 |
| Nomes e qualificação | 0,20 | 0 |
```

### Agora (Editor Visual)
- **Título**: Campo de input para "AVALIAÇÃO DA PEÇA PROFISSIONAL (Apelação)"
- **Texto em Negrito**: Campos separados para "Pontuação Máxima" e "Pontuação Obtida"
- **Tabela**: Interface visual com:
  - Células editáveis
  - Botão "Adicionar Linha"
  - Botão "Excluir Linha" em cada linha

## Vantagens

1. **Sem Necessidade de Conhecer Markdown**: Usuários não precisam saber a sintaxe
2. **Edição Intuitiva**: Interface familiar e fácil de usar
3. **Prevenção de Erros**: Não é possível quebrar a formatação acidentalmente
4. **Foco no Conteúdo**: Usuários se concentram no conteúdo, não na formatação
5. **Tabelas Dinâmicas**: Adição e remoção de linhas de forma visual

## Arquivos Envolvidos

- `EditableTable.tsx`: Componente para edição visual de tabelas
- `StructuredEditor.tsx`: Editor principal que renderiza diferentes tipos de conteúdo
- `espelho-dialog.tsx`: Diálogo principal modificado para usar o novo editor

## Tecnologias Utilizadas

- **unified**: Processamento de markdown
- **remark-parse**: Conversão de markdown para AST
- **remark-stringify**: Conversão de AST para markdown
- **remark-gfm**: Suporte para tabelas e outros elementos do GitHub Flavored Markdown
- **immer**: Atualizações imutáveis do estado
- **React**: Componentes interativos

## Como Funciona Internamente

1. **Parsing**: `remark-parse` converte o markdown em uma árvore de dados
2. **Renderização**: `StructuredEditor` percorre a árvore e renderiza componentes editáveis
3. **Edição**: Usuário edita através da interface visual
4. **Atualização**: `immer` garante atualizações imutáveis da árvore
5. **Serialização**: `remark-stringify` converte a árvore de volta para markdown 