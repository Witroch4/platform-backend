# Sistema de Lote Ativo Único - MTF Diamante

## Resumo da Implementação

Implementei o sistema de lote ativo único conforme solicitado. Agora existe apenas **UMA** variável de lote no menu de contexto que representa dinamicamente o lote ativo no momento.

## Principais Mudanças

### 1. Variável Única `{{lote_ativo}}`

**Antes:** Múltiplas variáveis de lote (lote_1, lote_2, lote_3, etc.)
**Agora:** Uma única variável `{{lote_ativo}}` que muda dinamicamente

### 2. Lógica de Lote Ativo

- **Apenas um lote pode estar ativo por vez**
- Quando o usuário ativa um lote, os outros são automaticamente desativados
- A variável `{{lote_ativo}}` sempre reflete o lote atualmente ativo
- Se não há lote ativo, mostra mensagem informativa

### 3. Arquivos Modificados

#### `lib/mtf-diamante/variables-resolver.ts`
```typescript
// Antes: Múltiplas variáveis de lote
for (const lote of lotes) {
  variaveis.push({
    chave: `lote_${lote.numero}`,
    valor: valorHumanizado,
    tipo: 'lote'
  });
}

// Agora: Uma única variável do lote ativo
const loteAtivo = lotes.find(lote => lote.isActive === true);
if (loteAtivo) {
  variaveis.push({
    chave: 'lote_ativo',
    valor: valorHumanizado,
    tipo: 'lote',
    descricao: `Lote Ativo - ${loteAtivo.nome} (${loteAtivo.numero})`
  });
}
```

#### `app/api/admin/mtf-diamante/variaveis/route.ts`
- Retorna apenas o lote ativo como variável
- Se não há lote ativo, retorna variável com mensagem informativa

#### `app/admin/mtf-diamante/components/shared/VariableContextMenu.tsx`
- Menu mostra apenas uma variável de lote: "Lote Ativo"
- Exibe informações do lote ativo ou mensagem quando não há lote ativo

## Como Funciona

### 1. Estado dos Lotes
```
Lote 1 - OAB 287 (ATIVO)    ✅
Lote 2 - Direito Normal (INATIVO) ❌  
Lote 3 - OAB 300 (INATIVO) ❌
```

### 2. Variável no Menu
```
Menu de Contexto:
├── Variáveis do Sistema
│   ├── chave_pix
│   ├── nome_do_escritorio_rodape
│   └── valor_analise
├── ─────────────────────
└── Lote MTF Diamante
    └── Lote Ativo (lote_ativo) ✅
```

### 3. Uso na Mensagem
```
Usuário digita: "Confira nosso {{lote_ativo}}"

Worker processa e envia:
"Confira nosso Lote 1 - OAB 287
Valor: R$ 287,90
Período: 06/08/2025 15:00 às 07/08/2025 16:00"
```

### 4. Mudança Dinâmica
```
Usuário ativa Lote 2:
- Lote 1 fica INATIVO
- Lote 2 fica ATIVO
- Cache é invalidado
- Próxima mensagem usa dados do Lote 2 automaticamente
```

## Benefícios

1. **Simplicidade:** Apenas uma variável de lote para o usuário gerenciar
2. **Dinâmico:** Muda automaticamente quando lote ativo é alterado
3. **Intuitivo:** Usuário não precisa lembrar números de lotes específicos
4. **Consistente:** Sempre usa o lote atualmente ativo
5. **Cache Inteligente:** Sistema invalida cache quando lote é alterado

## Fluxo de Uso

1. **Configurar Lotes:** Usuário cria lotes na interface
2. **Ativar Lote:** Usuário ativa o lote desejado (outros ficam inativos)
3. **Criar Mensagem:** Usuário clica com botão direito e seleciona "Lote Ativo"
4. **Texto Inserido:** `{{lote_ativo}}` é inserido na mensagem
5. **Envio:** Worker substitui pela informação humanizada do lote ativo
6. **Mudança:** Se usuário ativar outro lote, próximas mensagens usarão o novo lote

## Exemplo Prático

### Cenário 1: Lote 1 Ativo
```
Mensagem: "Participe do {{lote_ativo}}"
Cliente recebe: "Participe do Lote 1 - OAB 287
Valor: R$ 287,90
Período: 06/08/2025 15:00 às 07/08/2025 16:00"
```

### Cenário 2: Usuário Ativa Lote 2
```
Cache invalidado automaticamente
Próxima mensagem: "Participe do {{lote_ativo}}"
Cliente recebe: "Participe do Lote 2 - Direito Normal
Valor: R$ 350,00
Período: 07/08/2025 10:00 às 08/08/2025 18:00"
```

## Status

✅ **Implementação Completa**
- Uma única variável `{{lote_ativo}}`
- Mudança dinâmica baseada no lote ativo
- Cache invalidado automaticamente
- Interface simplificada
- TypeScript sem erros

O sistema agora funciona exatamente como solicitado: uma única variável de lote que muda dinamicamente conforme o lote ativo! 🎉