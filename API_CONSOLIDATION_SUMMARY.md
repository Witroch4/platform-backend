# Consolidação das APIs de Leads

## Problema Identificado
Existiam duas APIs fazendo essencialmente a mesma coisa:
- `/api/admin/leads-chatwit/leads` - API completa com CRUD
- `/api/admin/leads-chatwit/marketing-leads` - API simplificada apenas para marketing

## Solução Implementada
Consolidei ambas as funcionalidades na API principal `/api/admin/leads-chatwit/leads` adicionando parâmetros opcionais para o modo marketing.

### Novos Parâmetros Suportados:
- `marketing=true` - Ativa o modo marketing com dados simplificados
- `fezRecurso=true` - Filtra apenas leads que fizeram recurso
- `onlyWithPhone=true` - Filtra apenas leads com telefone válido

### Exemplos de Uso:

#### Modo Normal (existente):
```
GET /api/admin/leads-chatwit/leads?page=1&limit=10
```

#### Modo Marketing (substitui a API removida):
```
GET /api/admin/leads-chatwit/leads?marketing=true&page=1&limit=10000
```

#### Filtros Específicos:
```
GET /api/admin/leads-chatwit/leads?marketing=true&fezRecurso=true&onlyWithPhone=true
```

### Diferenças no Retorno:

#### Modo Normal:
- Dados completos do lead
- Inclui arquivos, análises, manuscritos, etc.
- Formato otimizado para gestão de leads

#### Modo Marketing:
- Dados simplificados
- Inclui campo `leadData` para compatibilidade
- Foco em informações de contato
- Flag `success: true` no response

### Melhorias Implementadas:

1. **Eliminação de Duplicação**: Uma única API para ambos os casos
2. **Tratamento de Dados**: Correção do problema `nomeReal: 'undefined'`
3. **Flexibilidade**: Parâmetros opcionais permitem diferentes usos
4. **Compatibilidade**: Mantém compatibilidade com código existente
5. **Manutenibilidade**: Menos código para manter

### Arquivos Afetados:
- ✅ `app/api/admin/leads-chatwit/leads/route.ts` - Consolidado
- ❌ `app/api/admin/leads-chatwit/marketing-leads/route.ts` - Removido

### Migração Necessária:
Se houver código chamando a API antiga `/marketing-leads`, deve ser atualizado para:
```javascript
// Antes:
fetch('/api/admin/leads-chatwit/marketing-leads?page=1&limit=10000')

// Depois:
fetch('/api/admin/leads-chatwit/leads?marketing=true&page=1&limit=10000')
```

### Benefícios:
- ✅ Menos duplicação de código
- ✅ Manutenção mais fácil
- ✅ Funcionalidade unificada
- ✅ Melhor tratamento de dados
- ✅ Flexibilidade para novos casos de uso

A consolidação mantém toda a funcionalidade existente enquanto elimina a duplicação desnecessária.