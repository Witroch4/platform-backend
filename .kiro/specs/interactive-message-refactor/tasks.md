# Implementation Plan

- [x] 1. Set up core type definitions and interfaces
  - Create type-safe ButtonReaction interface with discriminated union for reactions
  - Define InteractiveMessage and MessageWithReactions interfaces
  - Implement validation schemas for all data structures
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement unified API endpoint for atomic saves
  - Create POST /api/admin/mtf-diamante/messages-with-reactions endpoint
  - Implement database transaction logic for atomic message and reaction saves
  - Add comprehensive error handling and rollback mechanisms
  - Write unit tests for API endpoint functionality
  - _Requirements: 4.3, 6.4, 7.4, 7.5, 7.6_

- [x] 3. Create WhatsAppTextEditor component
  - Implement text editor with WhatsApp-specific formatting support
  - Add variable insertion capabilities
  - Include character counting and validation
  - Write component tests for text editing functionality
  - _Requirements: 2.2, 3.4_

- [x] 4. Build EmojiPicker component
  - Create emoji selection interface with categories
  - Implement search functionality for emojis
  - Add recently used emoji tracking
  - Write tests for emoji selection and search
  - _Requirements: 3.3_

- [x] 5. Implement InteractivePreview component with real-time updates
  - Create WhatsApp-style message preview rendering
  - Add support for all message types (text, image, document, video)

  - Implement real-time update mechanism with debouncing
  - Add reaction indicators (⚡️ icon) for buttons with configured reactions
  - Write tests for preview rendering and real-time updates
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5_

- [x] 6. Create ButtonManager component for button configuration
  - Implement add/remove/edit button functionality

  - Add button type selection (reply, url, phone)
  - Include button validation and error handling
  - Write tests for button management operations
  - _Requirements: 2.3, 3.1_

- [x] 7. Build ReactionConfigManager component (no test need)
  - Create reaction configuration modal interface
  - Implement reaction type selection (emoji vs text)
  - Integrate EmojiPicker and WhatsAppTextEditor components
  - Add reaction preview and validation
  - Write tests for reaction configuration workflow
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 8. Implement Step 1: TypeSelectionStep component
  - Create interactive message type selection interface
  - Add template previews for each message type
  - Implement navigation to Step 2 on selection
  - Write tests for type selection and navigation
  - _Requirements: 1.1, 1.2_

- [x] 9. Implement Step 2: UnifiedEditingStep component
  - Create dual-panel layout (configuration + preview)
  - Integrate all configuration components (name, header, body, footer, buttons)
  - Implement real-time preview updates with proper state management
  - Add form validation and error handling
  - Write tests for unified editing interface
  - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4_

- [x] 10. Implement Step 3: ReviewStep component
  - Create non-editable message summary display
  - Add reaction configuration summary table
  - Implement save functionality with loading states
  - Add success/error feedback mechanisms
  - Write tests for review and save functionality
  - _Requirements: 1.3, 4.1, 4.2, 4.3, 4.4_

- [x] 11. Create main InteractiveMessageCreator orchestrator component
  - Implement 3-step workflow navigation
  - Add progress indicators and step management
  - Integrate all step components with proper state flow
  - Implement data persistence and loading for existing messages
  - Write integration tests for complete workflow
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2_

- [x] 12. Enhance webhook processing for automatic reactions





  - Update mtf-diamante webhook handler to process button clicks
  - Implement reaction type detection (emoji vs text)
  - Add WhatsApp API calls for sending reactions and reply messages
  - Integrate with existing queue system for reliable processing
  - Write tests for webhook reaction processing
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3_

-

- [x] 13. Implement CRUD operations for reaction management
  - Create API endpoints for managing existing reaction mappings
  - Add database queries for loading reaction configurations
  - Implement update and delete operations for reactions
  - Add cascade delete logic for button removal
  - Write tests for all CRUD operations
  - _Requirements: 6.4, 7.1, 7.2, 7.3_

- [x] 14. Add comprehensive error handling and validation

- [ ] 14. Add comprehensive error handling and validation
  - Implement client-side validation for all form inputs
  - Add server-side validation for API requests
  - Create user-friendly error messages and recovery options
  - Add logging for debugging and monitoring
  - Write tests for error scenarios and validation
  - _Requirements: 4.3, 6.4, 7.5, 7.6_
-

- [x] 15. Create integration tests for complete user workflows

  - Write end-to-end tests for 3-step message creation workflow
  - Test reaction configuration and webhook processing integration
  - Add tests for loading and editing existing messages
  - Test atomic save operations and rollback scenarios
  - Verify WhatsApp API integration for reaction delivery
  - _Requirements: All requirements integration testing_
