# Requirements Document

## Introduction

This feature involves refactoring the WhatsApp functionality from the "atendimento" system to the "mtf-diamante" system. The change is driven by marketing requirements where "atendimento" was considered too simple, and "mtf-diamante" (Método Fênix Diamante) provides a more professional brand identity. This refactoring includes fixing TypeScript compilation errors, updating API routes, frontend components, and ensuring database model compatibility.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the WhatsApp webhook functionality to work with the MTF Diamante system instead of the old atendimento system, so that the branding is consistent and the system functions correctly.

#### Acceptance Criteria

1. WHEN the webhook receives a Dialogflow request THEN the system SHALL use the correct Prisma model names (WhatsAppConfig instead of configuracaoWhatsApp)
2. WHEN processing WhatsApp configurations THEN the system SHALL reference the MTF Diamante models and relationships
3. WHEN the TypeScript compiler runs THEN there SHALL be no compilation errors related to non-existent Prisma models
4. WHEN the webhook processes intents THEN it SHALL use the MTF Diamante configuration and mapping system

### Requirement 2

**User Story:** As a developer, I want all API routes to be consistently organized under the mtf-diamante namespace, so that the codebase is maintainable and follows the new naming convention.

#### Acceptance Criteria

1. WHEN accessing WhatsApp webhook functionality THEN the system SHALL use routes under /api/admin/mtf-diamante/
2. WHEN the old atendimento routes are accessed THEN they SHALL either redirect to mtf-diamante routes or be deprecated
3. WHEN new API endpoints are created THEN they SHALL follow the mtf-diamante naming convention
4. WHEN existing functionality is moved THEN all references SHALL be updated to point to the new locations

### Requirement 3

**User Story:** As a frontend user, I want the admin interface to reflect the MTF Diamante branding and functionality, so that the user experience is consistent with the new system.

#### Acceptance Criteria

1. WHEN accessing the admin layout THEN navigation links SHALL point to mtf-diamante routes instead of atendimento
2. WHEN viewing WhatsApp configuration pages THEN they SHALL be branded as MTF Diamante
3. WHEN interacting with the interface THEN all references to "atendimento" SHALL be replaced with "MTF Diamante"
4. WHEN navigating between pages THEN the URL structure SHALL reflect the mtf-diamante organization

### Requirement 4

**User Story:** As a system integrator, I want the database models to be properly aligned with the WhatsApp functionality, so that data integrity is maintained and relationships work correctly.

#### Acceptance Criteria

1. WHEN the system queries WhatsApp configurations THEN it SHALL use the correct model relationships from the Prisma schema
2. WHEN processing webhook data THEN the system SHALL properly map to CaixaEntrada, MapeamentoIntencao, and related models
3. WHEN fallback logic is executed THEN it SHALL work with the existing database structure
4. WHEN configuration lookups occur THEN they SHALL use the UsuarioChatwit relationship correctly

### Requirement 5

**User Story:** As a quality assurance engineer, I want the refactored system to maintain all existing functionality while using the new structure, so that no features are lost during the transition.

#### Acceptance Criteria

1. WHEN webhook requests are processed THEN all existing intent mapping functionality SHALL continue to work
2. WHEN WhatsApp templates are sent THEN the message delivery SHALL function identically to the previous system
3. WHEN interactive messages are sent THEN the button and response handling SHALL work as before
4. WHEN fallback configurations are used THEN the logic SHALL operate correctly with the new model structure