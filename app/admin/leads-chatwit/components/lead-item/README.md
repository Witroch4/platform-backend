# Estrutura Refatorada do LeadItem

## 📁 Estrutura de Arquivos

```
app/admin/leads-chatwit/components/lead-item/
│
├─ lead-item.tsx                    # ← Arquivo original (2508 linhas)
├─ lead-item-refactored.tsx         # ← Nova versão refatorada (~50 linhas)
│
└─ componentes-lead-item/           # ← Componentes modulares
   │
   ├─ types.ts                      # ← Interfaces e tipos
   ├─ utils.ts                      # ← Funções utilitárias puras
   ├─ dialogs.tsx                   # ← Centraliza todos os diálogos
   │
   ├─ hooks/                        # ← Lógica de estado e handlers
   │  ├─ index.ts
   │  ├─ useLeadState.ts           # ← Estados do lead
   │  ├─ useDialogState.ts         # ← Estados dos diálogos
   │  └─ useLeadHandlers.ts        # ← Handlers e lógica de negócio
   │
   └─ cells/                        # ← Componentes de células
      ├─ index.ts
      ├─ SelectCell.tsx             # ← Checkbox de seleção
      ├─ InfoCell.tsx               # ← Avatar, nome, telefone, data
      ├─ UserCell.tsx               # ← Informações do usuário
      ├─ FilesCell.tsx              # ← Lista de arquivos
      ├─ PdfCell.tsx                # ← PDF unificado
      ├─ ImagesCell.tsx             # ← Imagens convertidas
      ├─ ManuscritoCell.tsx         # ← Botão manuscrito
      ├─ EspelhoCell.tsx            # ← Botão espelho
      ├─ AnaliseCell.tsx            # ← Botão análise
      └─ ConsultoriaCell.tsx        # ← Switch consultoria
```

## 🏗️ Arquitetura

### 1. **Componente Principal (lead-item-refactored.tsx)**
- **Responsabilidade**: Orquestração e composição
- **Tamanho**: ~50 linhas
- **Função**: Conecta hooks, células e diálogos

### 2. **Hooks de Estado**
- **useLeadState**: Gerencia estados derivados do lead
- **useDialogState**: Controla abertura/fechamento de diálogos  
- **useLeadHandlers**: Concentra toda a lógica de negócio

### 3. **Células Modulares**
- Cada célula da tabela é um componente isolado
- Props bem definidas e tipadas
- Responsabilidade única e clara

### 4. **Diálogos Centralizados**
- Todos os diálogos em um único arquivo
- Evita duplicação de lógica de controle
- Facilita manutenção

### 5. **Utilitários e Tipos**
- Funções puras reutilizáveis
- Tipos bem definidos para maior segurança
- Separação clara entre dados e apresentação

## 🎯 Benefícios da Refatoração

### ✅ **Manutenibilidade**
- Cada componente tem responsabilidade única
- Fácil localização de bugs e alterações
- Estrutura previsível e organizada

### ✅ **Reutilização**
- Células podem ser reutilizadas em outros contextos
- Hooks podem ser compartilhados
- Utilitários são funções puras

### ✅ **Testabilidade**
- Componentes pequenos são mais fáceis de testar
- Lógica isolada em hooks facilita testes unitários
- Funções puras são determinísticas

### ✅ **Performance**
- Re-renderizações mais precisas
- Componentes menores otimizam melhor
- Estados localizados reduzem cascata de updates

### ✅ **Developer Experience**
- Código mais legível e compreensível
- Autocompletar melhorado com tipos
- Debugging mais eficiente

## 🔄 Migração

### Para migrar do arquivo original:

1. **Substitua a importação**:
```tsx
// Antes
import { LeadItem } from "./lead-item";

// Depois  
import { LeadItem } from "./lead-item-refactored";
```

2. **A interface permanece a mesma**:
```tsx
// Não há mudanças na API pública
<LeadItem
  lead={lead}
  isSelected={isSelected}
  onSelect={onSelect}
  // ... demais props
/>
```

## 🚀 Próximos Passos

1. **Completar handlers TODO**:
   - Implementar funções de diálogo faltantes
   - Migrar lógica restante do arquivo original

2. **Testes**:
   - Criar testes unitários para cada célula
   - Testar hooks isoladamente
   - Testes de integração para o componente completo

3. **Otimizações**:
   - Implementar React.memo onde necessário
   - Otimizar re-renderizações
   - Lazy loading de diálogos pesados

4. **Documentação**:
   - Documentar cada hook e sua responsabilidade
   - Exemplos de uso dos componentes
   - Guias de contribuição

## 📖 Exemplo de Uso

```tsx
import { LeadItem } from "./lead-item-refactored";

function LeadsTable() {
  return (
    <Table>
      <TableBody>
        {leads.map((lead) => (
          <LeadItem
            key={lead.id}
            lead={lead}
            isSelected={selectedIds.includes(lead.id)}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onUnificar={handleUnificar}
            onConverter={handleConverter}
            onDigitarManuscrito={handleDigitarManuscrito}
            isUnifying={unifyingIds.includes(lead.id)}
            isConverting={convertingId}
          />
        ))}
      </TableBody>
    </Table>
  );
}
``` 