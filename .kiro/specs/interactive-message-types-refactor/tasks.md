# Implementation Plan

- [ ] 1. Update database schema and create migration



  - Add `type` field to `ActionReplyButton` model in Prisma schema
  - Create database migration script to add the column with default value
  - Add database index for type-based queries
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Create TypeScript types and validation schemas
  - Define `ActionReplyButtonType` enum with all valid types
  - Create Zod validation schema with type-specific button count rules
  - Update existing TypeScript interfaces to include the type field
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 3. Implement type detection utility function
  - Create function to detect type based on button count and header presence
  - Add validation function for type-specific rules (button count, header requirements)
  - Write unit tests for type detection logic
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 4. Update API route for message creation
  - Modify POST `/api/admin/mtf-diamante/messages-with-reactions` to handle explicit type
  - Add type field to ActionReplyButton creation logic
  - Implement type-specific validation in the API layer
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 5. Update API route for message retrieval
  - Modify GET logic to return the type field from ActionReplyButton
  - Update response mapping to include type in the action data
  - Ensure backward compatibility with existing response format
  - _Requirements: 3.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 6. Create data migration script
  - Write migration script to populate type field for existing ActionReplyButton records
  - Implement logic to detect type based on button count and header presence
  - Add rollback functionality for the migration
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Update validation logic throughout the application
  - Modify existing validation functions to use explicit type field
  - Remove heuristic-based type detection from runtime code
  - Update error messages to be type-specific
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 8. Write comprehensive tests
  - Create unit tests for type detection and validation functions
  - Write integration tests for API endpoints with new type field
  - Add tests for data migration script
  - Create tests for type-specific validation rules
  - _Requirements: All requirements_

- [ ] 9. Update frontend components (if needed)
  - Review frontend code that handles ActionReplyButton data
  - Update any components that rely on type detection logic
  - Ensure UI correctly displays type-specific information
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Run migration and verify data integrity
  - Execute database migration in development environment
  - Run data migration script to populate type field
  - Verify all existing records have correct type assigned
  - Test API endpoints with migrated data
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
