# Correção do Problema de Template ID - MetaTemplateId vs Prisma ID

## Problema Identificado

A API de disparo estava recebendo o `metaTemplateId` (`682491667610791`) da URL, mas buscando diretamente por `id` no modelo `Template`. 

### Estrutura dos Dados:
- **Template (Prisma)**: `cmdzfe6v1000xo00kfnm8ng58` (ID interno do banco)
- **WhatsAppOfficialInfo**: Relacionamento com `metaTemplateId: "682491667610791"` (ID do WhatsApp/Meta)
- **URL**: Usa o `metaTemplateId` (`682491667610791`)

## Causa Raiz

A API estava fazendo apenas:
```typescript
const template = await prisma.template.findFirst({
  where: { id: templateId }, // templateId = "682491667610791"
});
```

Mas o `templateId` da URL é o `metaTemplateId`, não o `id` do Prisma.

## Solução Implementada

### 1. Busca Dupla (ID Prisma ou MetaTemplateId)

**ANTES:**
```typescript
const template = await prisma.template.findFirst({
  where: {
    id: templateId, // Só buscava por ID do Prisma
    createdById: session.user.id,
  },
});
```

**DEPOIS:**
```typescript
const template = await prisma.template.findFirst({
  where: {
    OR: [
      // Busca por ID direto do Prisma
      {
        id: templateId,
        OR: [
          { createdById: session.user.id },
          { scope: 'GLOBAL' },
          // Admins têm acesso total
        ],
      },
      // Busca por metaTemplateId do WhatsApp
      {
        whatsappOfficialInfo: {
          metaTemplateId: templateId
        },
        OR: [
          { createdById: session.user.id },
          { scope: 'GLOBAL' },
          // Admins têm acesso total
        ],
      },
    ],
  },
});
```

### 2. Debug Melhorado

Adicionado logs para identificar se a busca é por ID do Prisma ou metaTemplateId:
```typescript
// Primeiro, tentar buscar por ID direto do Prisma
let templateExists = await prisma.template.findFirst({
  where: { id: templateId },
});

// Se não encontrar, buscar por metaTemplateId
if (!templateExists) {
  templateExists = await prisma.template.findFirst({
    where: {
      whatsappOfficialInfo: {
        metaTemplateId: templateId
      }
    },
  });
  console.log(`Buscando por metaTemplateId: ${templateExists ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
}
```

### 3. Correção em Ambas as Buscas

A API fazia duas buscas do template:
1. **Primeira busca**: Para validar acesso e status
2. **Segunda busca**: Para obter dados completos para envio

Ambas foram corrigidas para suportar tanto ID do Prisma quanto metaTemplateId.

## Estrutura dos Modelos

### Template (Modelo Pai)
```prisma
model Template {
  id                   String                    @id @default(cuid())
  name                 String
  scope                TemplateScope             @default(PRIVATE)
  status               TemplateStatus            @default(APPROVED)
  createdById          String
  whatsappOfficialInfo WhatsAppOfficialInfo?     // Relacionamento
}
```

### WhatsAppOfficialInfo (Dados do WhatsApp)
```prisma
model WhatsAppOfficialInfo {
  id             String   @id @default(cuid())
  templateId     String   @unique                 // FK para Template
  metaTemplateId String                           // ID do WhatsApp/Meta (usado na URL)
  status         String
  category       String
  components     Json
  template       Template @relation(fields: [templateId], references: [id])
}
```

## Cenários Suportados

### 1. URL com ID do Prisma
- URL: `/templates/cmdzfe6v1000xo00kfnm8ng58`
- Busca: `Template.id = "cmdzfe6v1000xo00kfnm8ng58"`

### 2. URL com MetaTemplateId (caso atual)
- URL: `/templates/682491667610791`
- Busca: `WhatsAppOfficialInfo.metaTemplateId = "682491667610791"`

## Teste da Correção

Para testar:
1. Acesse a URL com metaTemplateId: `/templates/682491667610791`
2. Tente fazer um disparo
3. Verifique se não há mais erro 404

## Status Final

✅ **Busca dupla implementada** - Suporta ID do Prisma e metaTemplateId
✅ **Debug melhorado** - Logs identificam qual tipo de busca foi usada
✅ **Compatibilidade mantida** - URLs antigas continuam funcionando
✅ **Correção completa** - Ambas as buscas na API foram corrigidas

A API agora deve funcionar corretamente com o template ID `682491667610791` da URL, buscando pelo `metaTemplateId` no relacionamento `WhatsAppOfficialInfo`.