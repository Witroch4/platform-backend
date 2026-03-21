# Exemplo de Uso do Editor Estruturado

## Situação Exemplo

Imagine que você tem um espelho de correção com o seguinte conteúdo:

```markdown
## AVALIAÇÃO DA PEÇA PROFISSIONAL (Apelação)

**Pontuação Máxima:** 5,00
**Pontuação Obtida:** 0

### Critérios de Avaliação

| Item de Avaliação | Pontuação Máxima | Nota Obtida |
|-------------------|------------------|-------------|
| Endereçamento ao Juízo de Primeiro Grau | 0,10 | 0,1 |
| Nomes e qualificação das partes | 0,20 | 0 |
| Fundamentação jurídica | 1,50 | 0,8 |
| Pedido claro | 0,50 | 0,3 |

### Observações

- A peça precisa de melhorias na fundamentação
- O pedido não está suficientemente claro
- Recomenda-se revisão completa
```

## Como Funciona Agora

### 1. **Modo Visualização**
- O usuário vê o conteúdo renderizado normalmente
- Botões "Editar" e "Só Visualizar" disponíveis

### 2. **Modo Edição Visual**
Quando clicar em "Editar", o usuário verá:

#### Título Principal
```
[Título (H2)]
[AVALIAÇÃO DA PEÇA PROFISSIONAL (Apelação)]
```

#### Texto em Negrito
```
[Texto em Negrito]
[Pontuação Máxima]

[Texto em Negrito]
[Pontuação Obtida]
```

#### Subtítulo
```
[Título (H3)]
[Critérios de Avaliação]
```

#### Tabela Visual
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Tabela                                                                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ Item de Avaliação          │ Pontuação Máxima │ Nota Obtida │ Ações                │
│ [Endereçamento ao Juízo...] │ [0,10]           │ [0,1]       │ [🗑️]                │
│ [Nomes e qualificação...] │ [0,20]           │ [0]         │ [🗑️]                │
│ [Fundamentação jurídica]   │ [1,50]           │ [0,8]       │ [🗑️]                │
│ [Pedido claro]            │ [0,50]           │ [0,3]       │ [🗑️]                │
│                                                                                     │
│ [+ Adicionar Linha]                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Lista de Observações
```
[Lista (Com Marcadores)]
• [A peça precisa de melhorias na fundamentação]
• [O pedido não está suficientemente claro]
• [Recomenda-se revisão completa]
```

## Ações Disponíveis

### Para Tabelas
- ✅ **Editar Célula**: Clique em qualquer célula para editá-la
- ✅ **Adicionar Linha**: Clique em "+ Adicionar Linha" para adicionar nova linha
- ✅ **Excluir Linha**: Clique no ícone 🗑️ para excluir uma linha
- ✅ **Estrutura Mantida**: Cabeçalho da tabela permanece intacto

### Para Texto
- ✅ **Editar Títulos**: Campos específicos para cada nível de título
- ✅ **Editar Parágrafos**: Áreas de texto redimensionáveis
- ✅ **Editar Listas**: Campos individuais para cada item
- ✅ **Editar Formatação**: Campos específicos para negrito, itálico, etc.

## Resultado Final

Quando o usuário salva:
1. O sistema converte automaticamente de volta para markdown
2. Mantém toda a formatação original
3. Salva no banco de dados
4. Usuário nunca vê o código markdown

## Vantagens

1. **Facilidade de Uso**: Interface visual intuitiva
2. **Sem Erros de Sintaxe**: Impossível quebrar a formatação
3. **Foco no Conteúdo**: Usuário se concentra no que importa
4. **Tabelas Dinâmicas**: Adição/remoção de linhas sem complicações
5. **Preservação da Estrutura**: Formatação original mantida 