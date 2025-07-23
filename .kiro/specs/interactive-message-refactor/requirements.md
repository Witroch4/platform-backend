# Requirements Document

## Introduction

This feature involves refactoring the interactive message creation interface into a streamlined 3-step workflow with unified editing, real-time preview, and automatic reaction configuration. The system will allow users to create WhatsApp interactive messages with buttons that can trigger automatic emoji or text reactions when clicked by recipients.

## Requirements

### Requirement 1

**User Story:** As a user creating interactive messages, I want to navigate through a clear 3-step workflow, so that I can efficiently create and configure my messages without confusion.

#### Acceptance Criteria

1. WHEN the user starts creating an interactive message THEN the system SHALL present a 3-step workflow: "Configure Model", "Edit Model", and "Review & Save"
2. WHEN the user completes Step 1 THEN the system SHALL automatically advance to Step 2
3. WHEN the user completes Step 2 THEN the system SHALL advance to Step 3 for final review
4. WHEN the user is in any step THEN the system SHALL display clear progress indicators showing current step and completion status

### Requirement 2

**User Story:** As a user in the editing phase, I want to see a unified interface with real-time preview, so that I can configure my message content and see exactly how it will appear to recipients.

#### Acceptance Criteria

1. WHEN the user enters Step 2 (Edit Model) THEN the system SHALL display a dual-panel layout with configuration form on the left and preview on the right
2. WHEN the user modifies any field (name, header, body, footer, buttons) THEN the preview SHALL update in real-time without delay
3. WHEN the user adds or removes buttons THEN the preview SHALL immediately reflect these changes
4. WHEN the user configures header media (image, document, etc.) THEN the preview SHALL display the media correctly formatted as it would appear in WhatsApp

### Requirement 3

**User Story:** As a user configuring message buttons, I want to set up automatic reactions for each button, so that recipients receive immediate feedback when they click buttons.

#### Acceptance Criteria

1. WHEN the user adds a button in Step 2 THEN the system SHALL provide an option to "Add Automatic Reaction" for that button
2. WHEN the user chooses to add a reaction THEN the system SHALL allow selection between "React with Emoji" or "React with Text"
3. WHEN the user selects "React with Emoji" THEN the system SHALL display an emoji picker interface
4. WHEN the user selects "React with Text" THEN the system SHALL provide a text input with formatting options
5. WHEN a button has a configured reaction THEN the preview SHALL display a visual indicator (⚡️ icon) next to that button

### Requirement 4

**User Story:** As a user completing message configuration, I want to review all settings before saving, so that I can ensure everything is correct before the message becomes active.

#### Acceptance Criteria

1. WHEN the user enters Step 3 (Review & Save) THEN the system SHALL display a non-editable summary of the complete message configuration
2. WHEN displaying the summary THEN the system SHALL show the final message preview and list all configured automatic reactions
3. WHEN the user clicks "Save" or "Send for Analysis" THEN the system SHALL persist both the message data and all reaction mappings via API calls
4. WHEN saving is successful THEN the system SHALL provide confirmation and redirect to the appropriate management interface

### Requirement 5

**User Story:** As a recipient clicking on interactive message buttons, I want to receive immediate automatic reactions, so that I get instant feedback on my interactions.

#### Acceptance Criteria

1. WHEN a recipient clicks a Quick Reply button with configured emoji reaction THEN the system SHALL automatically send the specified emoji as a WhatsApp reaction (associated with the original message) using the WhatsApp reactions API
2. WHEN a recipient clicks a Quick Reply button with configured text reaction THEN the system SHALL automatically send the specified text as a WhatsApp reply message (referencing the original message) using the WhatsApp messaging API
3. WHEN processing button clicks THEN the system SHALL distinguish between reaction types and use the appropriate WhatsApp API endpoint (reactions vs messages)
4. WHEN processing button clicks THEN the system SHALL use the existing webhook infrastructure to handle the reaction logic
5. WHEN no reaction is configured for a button THEN the system SHALL process the button click normally without sending automatic reactions
6. WHEN the system supports Call-to-Action buttons THEN automatic reactions SHALL only apply to Quick Reply buttons, not Call-to-Action buttons

### Requirement 6

**User Story:** As a system administrator, I want the reaction system to integrate seamlessly with existing backend infrastructure, so that no existing functionality is disrupted.

#### Acceptance Criteria

1. WHEN storing reaction mappings THEN the system SHALL use the existing button-reactions API endpoint
2. WHEN processing webhook events THEN the system SHALL utilize the existing mtf-diamante webhook processing pipeline
3. WHEN sending reactions THEN the system SHALL use the existing WhatsApp API integration and queue system
4. WHEN managing reaction data THEN the system SHALL support full CRUD operations (Create, Read, Update, Delete) for reaction mappings

### Requirement 7

**User Story:** As a user editing existing interactive messages, I want to load and modify previously configured reactions, so that I can update my message configurations as needed.

#### Acceptance Criteria

1. WHEN loading an existing interactive message THEN the system SHALL retrieve and display all previously configured reaction mappings
2. WHEN modifying button configurations THEN the system SHALL allow updating, adding, or removing reaction mappings
3. WHEN deleting a button THEN the system SHALL automatically remove any associated reaction mappings
4. WHEN saving changes THEN the system SHALL update both message content and reaction mappings atomically
5. IF message update succeeds BUT reaction mapping update fails THEN the system SHALL revert the message update to prevent data inconsistency
6. IF reaction mapping update succeeds BUT message update fails THEN the system SHALL revert the reaction mapping changes to maintain data integrity