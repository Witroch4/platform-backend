# Design Document

## Overview

This design document outlines the refactoring of the WhatsApp functionality from the "atendimento" system to the "mtf-diamante" system. The refactoring addresses TypeScript compilation errors, updates API routes, aligns database model usage with the Prisma schema, and ensures consistent branding throughout the application.

The main issues identified are:
1. Incorrect Prisma model references (`configuracaoWhatsApp` vs `WhatsAppConfig`)
2. Inconsistent API route organization between old "atendimento" and new "mtf-diamante" systems
3. Frontend navigation and branding inconsistencies
4. Database relationship misalignments

## Architecture

### Current State Analysis

The current system has a mixed architecture where:
- Some functionality exists under `/api/admin/atendimento/` (deprecated)
- New functionality exists under `/api/admin/mtf-diamante/`
- The webhook at `/api/admin/leads-chatwit/whatsapp/webhook/` uses incorrect model names
- Database models use `WhatsAppConfig` but code references `configuracaoWhatsApp`

### Target Architecture

The refactored system will have:
- All WhatsApp functionality consolidated under `/api/admin/mtf-diamante/`
- Correct Prisma model usage throughout the codebase
- Consistent database relationships using the existing schema
- Updated frontend navigation and branding
- Proper fallback and configuration logic

## Components and Interfaces

### 1. Database Layer

**Current Issues:**
- Code uses `db.configuracaoWhatsApp` but schema defines `WhatsAppConfig`
- Relationship names don't match between code and schema

**Design Solution:**
- Update all database queries to use correct model names:
  - `WhatsAppConfig` instead of `configuracaoWhatsApp`
  - `CaixaEntrada` for inbox management
  - `MapeamentoIntencao` for intent mapping
  - `UsuarioChatwit` for user relationships

**Key Relationships:**
```typescript
// WhatsApp Configuration lookup
const config = await prisma.whatsAppConfig.findFirst({
  where: { phoneNumberId },
  include: { 
    usuarioChatwit: true,
    caixaEntrada: true 
  }
});

// Intent mapping lookup
const mapping = await prisma.mapeamentoIntencao.findUnique({
  where: { 
    intentName_caixaEntradaId: { 
      intentName, 
      caixaEntradaId 
    } 
  },
  include: { 
    template: true, 
    mensagemInterativa: { include: { botoes: true } } 
  }
});
```

### 2. API Layer Refactoring

**Webhook Route Migration:**
- Move webhook logic from `/api/admin/leads-chatwit/whatsapp/webhook/` to `/api/admin/mtf-diamante/webhook/`
- Update the existing webhook to use correct model names
- Maintain backward compatibility during transition

**Configuration Management:**
- Consolidate WhatsApp configuration under `/api/admin/mtf-diamante/whatsapp-config/`
- Ensure proper fallback logic for configurations
- Support both inbox-specific and default configurations

### 3. Frontend Integration

**Navigation Updates:**
- Update admin layout navigation to point to MTF Diamante routes
- Replace "atendimento" references with "MTF Diamante" branding
- Ensure consistent URL structure

**Component Updates:**
- Update WhatsApp configuration components to use new API endpoints
- Maintain existing functionality while using new routes
- Update error handling and success messages

## Data Models

### WhatsApp Configuration Model Usage

```typescript
// Correct model usage based on Prisma schema
interface WhatsAppConfigQuery {
  id: string;
  phoneNumberId: string;
  token: string;
  usuarioChatwitId: string;
  caixaEntradaId?: string;
  usuarioChatwit: UsuarioChatwit;
  caixaEntrada?: CaixaEntrada;
}
```

### Intent Mapping Model

```typescript
interface MapeamentoIntencaoQuery {
  intentName: string;
  caixaEntradaId: string;
  template?: WhatsAppTemplate;
  mensagemInterativa?: MensagemInterativa & {
    botoes: BotaoInterativo[];
  };
}
```

### Fallback Configuration Logic

```typescript
// Primary configuration lookup
let config = await prisma.whatsAppConfig.findFirst({
  where: { phoneNumberId },
  include: { caixaEntrada: true }
});

// Fallback to default configuration
if (!config) {
  config = await prisma.whatsAppConfig.findFirst({
    where: { caixaEntradaId: null },
    include: { caixaEntrada: true }
  });
}
```

## Error Handling

### TypeScript Compilation Errors

**Current Error:**
```
Property 'configuracaoWhatsApp' does not exist on type 'PrismaClient'
```

**Solution:**
- Replace all instances of `configuracaoWhatsApp` with `whatsAppConfig`
- Update relationship references to match Prisma schema
- Ensure proper typing throughout the codebase

### Runtime Error Handling

- Implement proper error handling for missing configurations
- Add logging for debugging webhook processing
- Provide meaningful error messages for configuration issues

## Testing Strategy

### Unit Testing

- Test database model queries with correct names
- Verify webhook processing with various intent types
- Test configuration fallback logic
- Validate template and interactive message sending

### Integration Testing

- Test end-to-end webhook flow from Dialogflow to WhatsApp
- Verify configuration management through API endpoints
- Test frontend navigation and component updates
- Validate database relationship integrity

### Migration Testing

- Test backward compatibility during transition
- Verify that existing configurations continue to work
- Test fallback scenarios for missing configurations
- Validate that no data is lost during refactoring

## Implementation Phases

### Phase 1: Database Model Fixes
- Update all Prisma model references
- Fix TypeScript compilation errors
- Test database queries

### Phase 2: API Route Consolidation
- Update webhook route to use correct models
- Ensure configuration management works properly
- Test webhook processing with real Dialogflow requests

### Phase 3: Frontend Updates
- Update navigation and branding
- Modify components to use new API endpoints
- Test user interface functionality

### Phase 4: Cleanup and Documentation
- Remove deprecated routes
- Update documentation
- Perform final testing and validation