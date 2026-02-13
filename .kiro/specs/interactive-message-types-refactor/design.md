# Design Document

## Overview

Esta refatoração adiciona um campo `type` ao modelo `ActionReplyButton` para distinguir explicitamente entre os diferentes tipos de mensagens interativas: `button`, `quick_replies`, `generic` e `button_template`. A solução mantém a estrutura existente, preservando compatibilidade, mas adiciona tipagem explícita e validações específicas por tipo.

## Architecture

### Current State
```
InteractiveContent
├── ActionReplyButton (todos os tipos de botões)
│   ├── buttons: Json
│   └── [sem distinção de tipo]
```

### Target State
```
InteractiveContent
├── ActionReplyButton (todos os tipos de botões)
│   ├── type: String (button|quick_replies|generic|button_template)
│   └── buttons: Json
```

## Components and Interfaces

### 1. Database Schema Changes

#### ActionReplyButton Model Update
```prisma
model ActionReplyButton {
  id                   String             @id @default(cuid())
  type                 String             // NOVO CAMPO
  buttons              Json
  interactiveContentId String             @unique
  interactiveContent   InteractiveContent @relation(fields: [interactiveContentId], references: [id], onDelete: Cascade)
}
```

#### Type Enum Definition
```typescript
export type ActionReplyButtonType = 
  | "button"
  | "quick_replies" 
  | "generic"
  | "button_template";
```

### 2. API Layer Changes

#### Request/Response Types
```typescript
interface ActionReplyButtonData {
  id: string;
  type: ActionReplyButtonType;
  buttons: ButtonData[];
  interactiveContentId: string;
}

interface CreateActionReplyButtonRequest {
  type: ActionReplyButtonType;
  buttons: ButtonData[];
}
```

#### Validation Schema
```typescript
const actionReplyButtonSchema = z.object({
  type: z.enum(["button", "quick_replies", "generic", "button_template"]),
  buttons: z.array(buttonSchema).refine((buttons, ctx) => {
    const { type } = ctx.parent;
    
    switch (type) {
      case "quick_replies":
        return buttons.length >= 4 && buttons.length <= 13;
      case "button_template":
        return buttons.length >= 1 && buttons.length <= 3;
      case "generic":
      case "button":
        return buttons.length >= 1;
      default:
        return false;
    }
  }, {
    message: "Número de botões inválido para o tipo especificado"
  })
});
```

### 3. Service Layer Changes

#### Type Detection Logic
```typescript
function detectActionReplyButtonType(
  buttons: ButtonData[], 
  hasImageHeader: boolean
): ActionReplyButtonType {
  if (hasImageHeader) {
    return "generic";
  }
  
  if (buttons.length > 3) {
    return "quick_replies";
  }
  
  if (buttons.length >= 1 && buttons.length <= 3) {
    return "button_template";
  }
  
  return "button";
}
```

#### Creation Service
```typescript
async function createActionReplyButton(data: {
  type: ActionReplyButtonType;
  buttons: ButtonData[];
  interactiveContentId: string;
}) {
  // Validar tipo vs estrutura
  await validateActionReplyButtonType(data.type, data.buttons);
  
  return prisma.actionReplyButton.create({
    data: {
      type: data.type,
      buttons: data.buttons,
      interactiveContentId: data.interactiveContentId
    }
  });
}
```

## Data Models

### ActionReplyButton Enhanced Model
```typescript
interface ActionReplyButton {
  id: string;
  type: ActionReplyButtonType;
  buttons: ButtonData[];
  interactiveContentId: string;
  interactiveContent: InteractiveContent;
}
```

### Button Data Structure (unchanged)
```typescript
interface ButtonData {
  id: string;
  type: "reply";
  title: string;
  payload: string;
  reply?: {
    id: string;
    title: string;
  };
}
```

### Type-Specific Validation Rules
```typescript
const TYPE_VALIDATION_RULES = {
  button: {
    minButtons: 1,
    maxButtons: Infinity,
    requiresImageHeader: false
  },
  quick_replies: {
    minButtons: 4,
    maxButtons: 13,
    requiresImageHeader: false
  },
  generic: {
    minButtons: 1,
    maxButtons: Infinity,
    requiresImageHeader: true
  },
  button_template: {
    minButtons: 1,
    maxButtons: 3,
    requiresImageHeader: false
  }
} as const;
```

## Error Handling

### Validation Errors
```typescript
class ActionReplyButtonValidationError extends Error {
  constructor(
    public type: ActionReplyButtonType,
    public violation: string,
    public expected: string,
    public received: string
  ) {
    super(`Validation failed for ${type}: ${violation}. Expected: ${expected}, Received: ${received}`);
  }
}
```

### Error Response Format
```typescript
interface ValidationErrorResponse {
  error: string;
  details: {
    field: string;
    type: ActionReplyButtonType;
    violation: string;
    expected: string;
    received: string;
  };
}
```

## Testing Strategy

### 1. Unit Tests

#### Type Detection Tests
```typescript
describe('detectActionReplyButtonType', () => {
  it('should return "generic" when has image header', () => {
    const result = detectActionReplyButtonType([mockButton], true);
    expect(result).toBe('generic');
  });

  it('should return "quick_replies" when has >3 buttons', () => {
    const buttons = Array(5).fill(mockButton);
    const result = detectActionReplyButtonType(buttons, false);
    expect(result).toBe('quick_replies');
  });

  it('should return "button_template" when has 1-3 buttons', () => {
    const buttons = Array(2).fill(mockButton);
    const result = detectActionReplyButtonType(buttons, false);
    expect(result).toBe('button_template');
  });
});
```

#### Validation Tests
```typescript
describe('ActionReplyButton Validation', () => {
  it('should reject quick_replies with <4 buttons', async () => {
    const data = { type: 'quick_replies', buttons: [mockButton] };
    await expect(validateActionReplyButtonType(data.type, data.buttons))
      .rejects.toThrow(ActionReplyButtonValidationError);
  });

  it('should reject generic without image header', async () => {
    const data = { type: 'generic', buttons: [mockButton] };
    await expect(validateActionReplyButtonType(data.type, data.buttons, false))
      .rejects.toThrow(ActionReplyButtonValidationError);
  });
});
```

### 2. Integration Tests

#### API Endpoint Tests
```typescript
describe('POST /api/admin/mtf-diamante/messages-with-reactions', () => {
  it('should create ActionReplyButton with correct type', async () => {
    const payload = {
      type: 'quick_replies',
      action: { buttons: Array(5).fill(mockButton) }
    };

    const response = await request(app)
      .post('/api/admin/mtf-diamante/messages-with-reactions')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message.content.action.type).toBe('quick_replies');
  });
});
```

### 3. Migration Tests

#### Data Migration Tests
```typescript
describe('ActionReplyButton Type Migration', () => {
  it('should migrate existing records with correct types', async () => {
    // Setup: criar registros sem type
    await setupLegacyActionReplyButtons();
    
    // Execute migration
    await migrateActionReplyButtonTypes();
    
    // Verify: todos os registros têm type correto
    const records = await prisma.actionReplyButton.findMany();
    expect(records.every(r => r.type)).toBe(true);
  });
});
```

## Migration Strategy

### 1. Database Migration
```sql
-- Add type column with default value
ALTER TABLE "ActionReplyButton" 
ADD COLUMN "type" TEXT DEFAULT 'button';

-- Update existing records based on button count and header presence
UPDATE "ActionReplyButton" 
SET "type" = CASE 
  WHEN (
    SELECT COUNT(*) > 3 
    FROM json_array_elements("buttons") 
  ) THEN 'quick_replies'
  WHEN (
    SELECT "Header"."type" = 'image' 
    FROM "InteractiveContent" ic 
    JOIN "Header" ON "Header"."interactiveContentId" = ic."id"
    WHERE ic."id" = "ActionReplyButton"."interactiveContentId"
  ) THEN 'generic'
  WHEN (
    SELECT COUNT(*) BETWEEN 1 AND 3 
    FROM json_array_elements("buttons")
  ) THEN 'button_template'
  ELSE 'button'
END;

-- Make type column required
ALTER TABLE "ActionReplyButton" 
ALTER COLUMN "type" SET NOT NULL;
```

### 2. Application Migration Script
```typescript
async function migrateActionReplyButtonTypes() {
  const records = await prisma.actionReplyButton.findMany({
    where: { type: null },
    include: {
      interactiveContent: {
        include: { header: true }
      }
    }
  });

  for (const record of records) {
    const buttons = Array.isArray(record.buttons) ? record.buttons : [];
    const hasImageHeader = record.interactiveContent?.header?.type === 'image';
    
    const type = detectActionReplyButtonType(buttons, hasImageHeader);
    
    await prisma.actionReplyButton.update({
      where: { id: record.id },
      data: { type }
    });
  }
}
```

## Rollback Strategy

### Database Rollback
```sql
-- Remove type column if needed
ALTER TABLE "ActionReplyButton" DROP COLUMN "type";
```

### Application Rollback
- Manter lógica de detecção de tipo baseada em heurística
- Remover validações específicas por tipo
- Reverter mudanças na API para não incluir campo `type`

## Performance Considerations

### Indexing
```sql
-- Add index for type-based queries
CREATE INDEX "ActionReplyButton_type_idx" ON "ActionReplyButton"("type");
```

### Query Optimization
- Queries por tipo específico serão mais eficientes
- Eliminação da lógica de detecção de tipo em runtime
- Cache de validações por tipo

## Security Considerations

### Input Validation
- Validação rigorosa do campo `type` contra enum permitido
- Validação cruzada entre `type` e estrutura dos `buttons`
- Sanitização de dados JSON nos botões

### Data Integrity
- Constraints de banco para garantir consistência
- Validação em múltiplas camadas (client, API, database)
- Logs de auditoria para mudanças de tipo