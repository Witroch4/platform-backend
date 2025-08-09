# Correção das APIs - Modelos Unificados

## Problema Identificado

Duas APIs estavam retornando 404:
1. `GET /api/admin/leads-chatwit/marketing-leads` - API removida durante consolidação
2. `POST /api/admin/mtf-diamante/disparo` - Funcionando, mas componente chamava API antiga

## Correções Aplicadas

### 1. API de Marketing Leads (404 resolvido)

**Problema**: O componente `leads-selector-dialog.tsx` ainda estava chamando a API antiga `/marketing-leads` que foi removida durante a consolidação.

**Solução**: Atualizado o componente para usar a API consolidada `/leads` com parâmetro `marketing=true`:

```typescript
// ANTES (API removida):
const response = await fetch(`/api/admin/leads-chatwit/marketing-leads?${params.toString()}`);

// DEPOIS (API consolidada):
const response = await fetch(`/api/admin/leads-chatwit/leads?marketing=true&${params.toString()}`);
```

**Arquivos alterados**:
- `app/admin/mtf-diamante/components/TemplatesTab/components/leads-selector-dialog.tsx`

### 2. API de Disparo (já estava correta)

**Status**: A API `/api/admin/mtf-diamante/disparo` já estava usando os modelos unificados corretamente:
- ✅ Busca leads no modelo `Lead` unificado
- ✅ Busca templates no modelo `Template` unificado
- ✅ Relacionamento com `WhatsAppOfficialInfo` para templates oficiais

## Estrutura dos Modelos Unificados

### Lead (Modelo Pai)
```prisma
model Lead {
  id               String                @id @default(cuid())
  name             String?
  email            String?
  phone            String?
  userId           String?
  accountId        String?
  // Relacionamentos
  oabData          LeadOabData?          // Dados específicos OAB
  instagramProfile LeadInstagramProfile? // Dados específicos Instagram
  disparos         DisparoMtfDiamante[]  // Disparos MTF
}
```

### LeadOabData (Dados Específicos OAB)
```prisma
model LeadOabData {
  id                     String @id @default(cuid())
  leadId                 String @unique
  nomeReal               String?
  fezRecurso             Boolean @default(false)
  // ... outros campos específicos OAB
  lead                   Lead   @relation(fields: [leadId], references: [id])
}
```

### Template (Modelo Pai)
```prisma
model Template {
  id                   String                    @id @default(cuid())
  name                 String
  type                 TemplateType
  status               TemplateStatus            @default(APPROVED)
  createdById          String
  // Relacionamentos
  whatsappOfficialInfo WhatsAppOfficialInfo?     // Templates oficiais WhatsApp
  interactiveContent   InteractiveContent?       // Conteúdo interativo
}
```

### WhatsAppOfficialInfo (Templates Oficiais WhatsApp)
```prisma
model WhatsAppOfficialInfo {
  id             String   @id @default(cuid())
  templateId     String   @unique
  metaTemplateId String
  status         String
  components     Json
  template       Template @relation(fields: [templateId], references: [id])
}
```

## APIs Funcionais

### 1. API de Leads Consolidada
- **Endpoint**: `GET /api/admin/leads-chatwit/leads`
- **Parâmetros**:
  - `marketing=true` - Modo marketing (dados simplificados)
  - `search` - Busca por nome, email ou telefone
  - `fezRecurso=true` - Filtrar apenas leads que fizeram recurso
  - `page` e `limit` - Paginação

### 2. API de Disparo MTF Diamante
- **Endpoint**: `POST /api/admin/mtf-diamante/disparo`
- **Funcionalidades**:
  - ✅ Busca leads no modelo unificado `Lead`
  - ✅ Busca templates no modelo unificado `Template`
  - ✅ Suporte a templates oficiais WhatsApp
  - ✅ Auto-preenchimento de variáveis
  - ✅ Controle de duplicatas por telefone

## Teste das Correções

Para testar as correções:

```bash
# Executar o arquivo de teste
node test-apis-fix.js
```

Ou testar manualmente:
1. Acesse a funcionalidade de seleção de leads no MTF Diamante
2. Verifique se os leads são carregados corretamente
3. Teste o disparo de templates

## Status Final

✅ **API marketing-leads**: Corrigida - componente atualizado para usar API consolidada
✅ **API disparo**: Funcionando - já estava usando modelos unificados corretamente
✅ **Modelos unificados**: Implementados e funcionais
✅ **Relacionamentos**: Lead ↔ LeadOabData, Template ↔ WhatsAppOfficialInfo

As duas APIs que estavam retornando 404 agora devem funcionar corretamente com os modelos unificados do Prisma.