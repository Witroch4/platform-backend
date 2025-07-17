# Implementation Plan

- [x] 1. Fix TypeScript compilation errors in webhook route





  - Update database model references from `configuracaoWhatsApp` to `whatsAppConfig`
  - Fix relationship references to match Prisma schema
  - Ensure proper typing throughout the webhook code
  - _Requirements: 1.1, 1.3_

- [x] 2. Update webhook route database queries






  - Replace `db.configuracaoWhatsApp.findFirst()` with `db.whatsAppConfig.findFirst()`
  - Update include statements to use correct relationship names
  - Fix fallback configuration logic to use proper model names
  - Test database queries to ensure they work correctly
  - _Requirements: 1.1, 4.1, 4.2_

- [x] 3. Align webhook route with MTF Diamante models

















  - Update intent mapping queries to use `mapeamentoIntencao` model correctly
  - Ensure `CaixaEntrada` relationships work properly
  - Fix `UsuarioChatwit` relationship usage in configuration lookups
  - Validate that all database relationships match the Prisma schema
  - _Requirements: 1.2, 4.3, 4.4_

- [ ] 4. Update MTF Diamante configuration routes









  - Fix any remaining `configuracaoWhatsApp` references in `/api/admin/mtf-diamante/configuracoes/`
  - Ensure WhatsApp configuration management uses correct model names
  - Update include statements in configuration queries
  - Test configuration CRUD operations
  - _Requirements: 2.3, 4.1_

- [x] 5. Verify webhook functionality with corrected models







  - Test webhook processing with sample Dialogflow requests
  - Verify that template sending works with corrected database queries
  - Test interactive message sending functionality
  - Ensure fallback logic works correctly with proper model names
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Update frontend navigation for MTF Diamante branding





  - Locate admin layout navigation components
  - Replace "atendimento" links with "mtf-diamante" routes
  - Update navigation labels to reflect MTF Diamante branding
  - Ensure all navigation links point to correct MTF Diamante endpoints
  - _Requirements: 3.1, 3.3_

- [x] 7. Update frontend components for MTF Diamante routes





  - Update WhatsApp configuration components to use MTF Diamante API endpoints
  - Modify any components that reference old atendimento routes
  - Update component props and API calls to use new route structure
  - Test component functionality with updated routes
  - _Requirements: 3.2, 3.4_

- [ ] 8. Run TypeScript compilation check




  - Execute `npx tsc --noEmit` to verify no compilation errors
  - Fix any remaining TypeScript issues
  - Ensure all imports and model references are correct
  - Validate that the codebase compiles successfully
  - _Requirements: 1.3_

- [x] 9. Test end-to-end webhook functionality






  - Send test webhook requests to verify processing works
  - Test various intent types and their corresponding actions
  - Verify that WhatsApp messages are sent correctly
  - Ensure configuration fallback logic works as expected
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
- [ ] 10. Clean up deprecated atendimento references




















- [ ] 10. Clean up deprecated atendimento references

  - Search for any remaining references to old atendimento system
  - Update or remove deprecated code and comments
  - Ensure consistent MTF Diamante branding throughout the codebase
  - Document any breaking changes or migration notes
  - _Requirements: 2.2, 3.3_