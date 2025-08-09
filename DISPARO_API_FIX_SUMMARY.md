# Correção da API de Disparo - Template Access

## Problema Identificado

A API `/api/admin/mtf-diamante/disparo` estava retornando 404 com a mensagem:
```
Template com ID 682491667610791 não encontrado para este usuário
```

## Causa Raiz

A API estava buscando templates apenas com `createdById: session.user.id`, mas não considerava:
1. **Templates com escopo GLOBAL** - Acessíveis por qualquer usuário
2. **Permissões de ADMIN/SUPERADMIN** - Podem acessar qualquer template
3. **Templates compartilhados** - Outros cenários de acesso

## Correções Aplicadas

### 1. Busca de Template com Escopo e Permissões

**ANTES:**
```typescript
const template = await getPrismaInstance().template.findFirst({
  where: {
    id: templateId,
    createdById: session.user.id, // Apenas templates do próprio usuário
  },
  select: { id: true, name: true, status: true },
});
```

**DEPOIS:**
```typescript
const template = await getPrismaInstance().template.findFirst({
  where: {
    id: templateId,
    OR: [
      { createdById: session.user.id }, // Templates criados pelo usuário
      { scope: 'GLOBAL' }, // Templates globais
      // Admins podem acessar qualquer template
      ...(session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN' 
        ? [{}] // Sem filtro adicional para admins
        : []
      ),
    ],
  },
  select: { id: true, name: true, status: true, scope: true, createdById: true },
});
```

### 2. Debug Melhorado

Adicionado logs de debug para identificar problemas:
```typescript
// Debug: Verificar se o template existe sem filtro de usuário
const templateExists = await getPrismaInstance().template.findFirst({
  where: { id: templateId },
  select: { id: true, name: true, status: true, createdById: true },
});

console.log(`[Disparo Debug] Template ${templateId} existe?`, templateExists ? 'SIM' : 'NÃO');
if (templateExists) {
  console.log(`[Disparo Debug] Template criado por: ${templateExists.createdById}, usuário atual: ${session.user.id}`);
}
```

### 3. Correção da Segunda Busca

A API fazia uma segunda busca do template para analisar variáveis. Essa busca também foi corrigida:
```typescript
const templateCompleto = await getPrismaInstance().template.findFirst({
  where: {
    id: templateId,
    OR: [
      { createdById: session.user.id },
      { scope: 'GLOBAL' },
      ...(session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN' ? [{}] : []),
    ],
  },
});
```

## Estrutura de Acesso a Templates

### Níveis de Acesso:
1. **Proprietário** - `createdById === session.user.id`
2. **Global** - `scope === 'GLOBAL'`
3. **Admin** - `role === 'ADMIN' || role === 'SUPERADMIN'`

### Enum TemplateScope:
```prisma
enum TemplateScope {
  GLOBAL   // Acessível por todos os usuários
  PRIVATE  // Apenas pelo criador (padrão)
}
```

## Cenários de Uso

### Template Privado (PRIVATE)
- ✅ Criador pode usar
- ❌ Outros usuários não podem usar
- ✅ Admins podem usar

### Template Global (GLOBAL)
- ✅ Qualquer usuário pode usar
- ✅ Criador pode usar
- ✅ Admins podem usar

### Usuário Admin/SuperAdmin
- ✅ Pode usar qualquer template
- ✅ Pode criar templates globais
- ✅ Acesso irrestrito

## Teste da Correção

Para testar a correção:
```bash
node test-template-access.js
```

Ou testar manualmente:
1. Acesse a funcionalidade de disparo no MTF Diamante
2. Selecione o template ID `682491667610791`
3. Verifique se não há mais erro 404

## Status Final

✅ **API de disparo corrigida** - Agora considera escopo e permissões
✅ **Debug melhorado** - Logs mais informativos para troubleshooting
✅ **Compatibilidade mantida** - Templates privados continuam funcionando
✅ **Suporte a templates globais** - Funcionalidade expandida

A API agora deve funcionar corretamente com o template ID `682491667610791`, considerando o escopo do template e as permissões do usuário.