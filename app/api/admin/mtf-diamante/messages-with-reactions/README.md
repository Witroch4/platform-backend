# Messages with Reactions API Endpoint

This API endpoint provides atomic operations for creating, updating, and retrieving interactive messages with their associated button reactions in a single transaction.

## Overview

The `/api/admin/mtf-diamante/messages-with-reactions` endpoint implements the unified save functionality required by the interactive message refactor specification. It ensures data consistency by performing all database operations within a single transaction.

## Features

- ✅ **Atomic Operations**: Message and reaction saves are performed in a single database transaction
- ✅ **Comprehensive Validation**: Input validation using Zod schemas
- ✅ **Error Handling**: Proper error responses with rollback mechanisms
- ✅ **Authentication**: Session-based authentication with user access control
- ✅ **Type Safety**: Full TypeScript support with proper type definitions
- ✅ **Backward Compatibility**: Compatible with existing database schema

## API Endpoints

### POST `/api/admin/mtf-diamante/messages-with-reactions`

Creates a new interactive message with associated button reactions.

#### Request Body

```typescript
{
  caixaId: string;           // ID of the caixa (inbox)
  message: {
    name: string;            // Message name (1-255 chars)
    type: MessageType;       // Message type (button, list, etc.)
    body: {
      text: string;          // Message body (1-1024 chars)
    };
    header?: {               // Optional header
      type: HeaderType;      // text, image, video, document
      text?: string;         // Header text
      media_url?: string;    // Media URL
      filename?: string;     // File name
    };
    footer?: {               // Optional footer
      text: string;          // Footer text (max 60 chars)
    };
    action?: any;            // Action data (buttons, lists, etc.)
    // Location fields (optional)
    latitude?: number;
    longitude?: number;
    locationName?: string;
    locationAddress?: string;
    // Reaction fields (optional)
    reactionEmoji?: string;
    targetMessageId?: string;
    // Sticker fields (optional)
    stickerMediaId?: string;
    stickerUrl?: string;
  };
  reactions: Array<{
    buttonId: string;        // Button ID to associate reaction with
    reaction?: {             // Optional reaction configuration
      type: 'emoji' | 'text';
      value: string;         // Emoji or text response
    };
  }>;
}
```

#### Response

```typescript
{
  success: boolean;
  messageId: string;         // Created message ID
  reactionIds: string[];     // Created reaction IDs
  message: FormattedMessage; // Formatted message object
  reactions: FormattedReaction[]; // Formatted reaction objects
}
```

#### Example

```bash
curl -X POST /api/admin/mtf-diamante/messages-with-reactions \
  -H "Content-Type: application/json" \
  -d '{
    "caixaId": "caixa123",
    "message": {
      "name": "Welcome Message",
      "type": "button",
      "body": { "text": "Welcome! How can we help you?" },
      "action": {
        "buttons": [
          { "id": "btn_info", "title": "Get Info" },
          { "id": "btn_support", "title": "Support" }
        ]
      }
    },
    "reactions": [
      {
        "buttonId": "btn_info",
        "reaction": { "type": "emoji", "value": "ℹ️" }
      },
      {
        "buttonId": "btn_support",
        "reaction": { "type": "text", "value": "Thank you! Our support team will contact you soon." }
      }
    ]
  }'
```

### PUT `/api/admin/mtf-diamante/messages-with-reactions`

Updates an existing interactive message and its reactions.

#### Request Body

```typescript
{
  messageId: string;         // ID of message to update
  message: Partial<Message>; // Partial message updates
  reactions: Array<{         // New reaction configuration
    buttonId: string;
    reaction?: {
      type: 'emoji' | 'text';
      value: string;
    };
  }>;
}
```

#### Response

Same as POST response with updated data.

### GET `/api/admin/mtf-diamante/messages-with-reactions`

Retrieves messages with their reactions.

#### Query Parameters

- `messageId`: Get specific message with reactions
- `caixaId`: Get all messages for a caixa with reactions

#### Response

For single message:
```typescript
{
  success: boolean;
  message: FormattedMessage;
  reactions: FormattedReaction[];
}
```

For multiple messages:
```typescript
{
  success: boolean;
  messages: Array<{
    ...FormattedMessage;
    reactions: FormattedReaction[];
  }>;
}
```

## Data Types

### Message Types

```typescript
type MessageType = 
  | "button"           // Quick reply buttons
  | "list"             // List picker
  | "cta_url"          // Call-to-action URL
  | "flow"             // WhatsApp Flow
  | "location"         // Location message
  | "location_request" // Request user location
  | "reaction"         // Reaction message
  | "sticker";         // Sticker message
```

### Header Types

```typescript
type HeaderType = "text" | "image" | "video" | "document";
```

### Reaction Types

```typescript
type ReactionType = "emoji" | "text";
```

## Validation Rules

### Message Validation

- **Name**: 1-255 characters, required
- **Type**: Must be valid MessageType
- **Body Text**: 1-1024 characters, required
- **Footer Text**: Max 60 characters, optional
- **Header**: Type-specific validation

### Reaction Validation

- **Button ID**: Non-empty string, required
- **Reaction Type**: Must be "emoji" or "text"
- **Reaction Value**: Non-empty string when reaction is provided

## Error Handling

### HTTP Status Codes

- `200`: Success
- `400`: Validation error or bad request
- `401`: Unauthorized (no valid session)
- `404`: Resource not found (caixa or message)
- `409`: Conflict (duplicate button ID)
- `500`: Internal server error

### Error Response Format

```typescript
{
  error: string;           // Error message
  details?: any[];         // Validation details (for 400 errors)
}
```

### Common Errors

1. **Validation Failed (400)**
   ```json
   {
     "error": "Validation failed",
     "details": [
       {
         "code": "too_small",
         "minimum": 1,
         "type": "string",
         "inclusive": true,
         "exact": false,
         "message": "String must contain at least 1 character(s)",
         "path": ["message", "name"]
       }
     ]
   }
   ```

2. **Unauthorized (401)**
   ```json
   {
     "error": "Unauthorized"
   }
   ```

3. **Caixa Not Found (404)**
   ```json
   {
     "error": "Caixa not found or access denied"
   }
   ```

4. **Duplicate Button ID (409)**
   ```json
   {
     "error": "Duplicate button ID detected"
   }
   ```

## Database Schema Mapping

The API works with the existing database schema:

### InteractiveMessage Table
- Maps to `interactiveMessage` table
- Stores message content and metadata
- Links to `caixaEntrada` via `caixaId`

### ButtonReactionMapping Table
- Maps to `buttonReactionMapping` table
- Stores reaction configurations per button
- Links to `interactiveMessage` via `messageId`

### Field Mapping

Due to schema constraints, the API uses the following field mapping:

- **Emoji Reactions**: Stored in `emoji` field
- **Text Reactions**: Stored in `emoji` field with `description` field for type identification
- **Reaction Type**: Determined by presence of `description` field

## Transaction Behavior

All operations are wrapped in database transactions to ensure atomicity:

1. **Create Operation**:
   - Create interactive message
   - Create all button reactions
   - Rollback everything if any step fails

2. **Update Operation**:
   - Update interactive message
   - Delete existing reactions
   - Create new reactions
   - Rollback everything if any step fails

## Security

- **Authentication**: Requires valid user session
- **Authorization**: Users can only access their own caixas
- **Input Validation**: All inputs validated with Zod schemas
- **SQL Injection**: Protected by Prisma ORM
- **XSS Prevention**: Input sanitization for text fields

## Performance Considerations

- **Database Connections**: Uses connection pooling
- **Transaction Scope**: Minimized transaction duration
- **Query Optimization**: Indexed queries for lookups
- **Batch Operations**: Efficient bulk reaction creation

## Testing

The endpoint includes comprehensive test coverage:

- **Unit Tests**: Validation logic and helper functions
- **Integration Tests**: Full API workflow testing
- **Error Scenarios**: All error conditions tested
- **Edge Cases**: Boundary condition testing

### Running Tests

```bash
# Run unit tests
npm test -- app/api/admin/mtf-diamante/messages-with-reactions/__tests__/api-logic.test.ts

# Run integration tests (requires running server)
node test-messages-with-reactions-api.js
```

## Usage Examples

### Creating a Simple Button Message

```javascript
const response = await fetch('/api/admin/mtf-diamante/messages-with-reactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caixaId: 'your-caixa-id',
    message: {
      name: 'Simple Question',
      type: 'button',
      body: { text: 'Do you like our service?' },
      action: {
        buttons: [
          { id: 'yes', title: 'Yes' },
          { id: 'no', title: 'No' }
        ]
      }
    },
    reactions: [
      { buttonId: 'yes', reaction: { type: 'emoji', value: '😊' } },
      { buttonId: 'no', reaction: { type: 'text', value: 'Thank you for your feedback!' } }
    ]
  })
});
```

### Creating a Complex Message with Header and Footer

```javascript
const response = await fetch('/api/admin/mtf-diamante/messages-with-reactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caixaId: 'your-caixa-id',
    message: {
      name: 'Product Announcement',
      type: 'button',
      header: {
        type: 'image',
        media_url: 'https://example.com/product.jpg'
      },
      body: { text: 'Check out our new product! What do you think?' },
      footer: { text: 'Limited time offer' },
      action: {
        buttons: [
          { id: 'interested', title: 'Interested' },
          { id: 'more_info', title: 'More Info' },
          { id: 'not_now', title: 'Not Now' }
        ]
      }
    },
    reactions: [
      { buttonId: 'interested', reaction: { type: 'emoji', value: '🎉' } },
      { buttonId: 'more_info', reaction: { type: 'text', value: 'Great! Here\'s more information...' } },
      { buttonId: 'not_now', reaction: { type: 'emoji', value: '👍' } }
    ]
  })
});
```

## Migration from Existing APIs

If migrating from separate message and reaction APIs:

### Before (Separate Calls)
```javascript
// Create message
const messageResponse = await fetch('/api/admin/mtf-diamante/interactive-messages', {
  method: 'POST',
  body: JSON.stringify({ caixaId, message })
});

// Create reactions
const reactionResponse = await fetch('/api/admin/mtf-diamante/button-reactions', {
  method: 'POST',
  body: JSON.stringify({ messageId: messageResponse.messageId, reactions })
});
```

### After (Atomic Call)
```javascript
// Create message with reactions atomically
const response = await fetch('/api/admin/mtf-diamante/messages-with-reactions', {
  method: 'POST',
  body: JSON.stringify({ caixaId, message, reactions })
});
```

## Benefits

1. **Atomicity**: No partial saves or inconsistent state
2. **Performance**: Single API call instead of multiple
3. **Reliability**: Automatic rollback on errors
4. **Simplicity**: Unified interface for message + reaction operations
5. **Type Safety**: Full TypeScript support
6. **Validation**: Comprehensive input validation
7. **Error Handling**: Detailed error responses

## Future Enhancements

- [ ] Bulk operations for multiple messages
- [ ] Message templates and cloning
- [ ] Reaction analytics and metrics
- [ ] Webhook notifications for message events
- [ ] Message scheduling capabilities
- [ ] Advanced validation rules
- [ ] Rate limiting and throttling
- [ ] Audit logging for all operations