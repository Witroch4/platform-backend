# Fix Instagram Template Selection Implementation

## Problem
O sistema de tradução Instagram está funcionando apenas para o Caso 1 (mensagens ≤80 caracteres com Generic Template). Para mensagens maiores, está cortando o texto em vez de usar o Button Template correto.

## Current Behavior
- ✅ Caso 1: ≤80 chars → Generic Template (funcionando)
- ❌ Caso 2: 81-640 chars → Cortando texto em vez de usar Button Template
- ❌ Caso 3: >640 chars → Não implementado

## Expected Behavior
- Caso 1: ≤80 chars → Generic Template (`"template_type":"generic"`)
- Caso 2: 81-640 chars → Button Template (`"template_type":"button"`)
- Caso 3: >640 chars → Error message (incompatível)

## Implementation Tasks

### Backend Fix
- [ ] Fix message converter logic in `lib/instagram/message-converter.ts`
  - Implement proper character count logic for template selection
  - Ensure Button Template uses `text` field instead of `title`
  - Remove image and footer for Button Template (81-640 chars)
  - Add proper error handling for >640 chars

### Frontend Fix  
- [ ] Update `app/admin/mtf-diamante/components/interactive-message-creator/UnifiedEditingStep.tsx`
  - Add Instagram template preview logic
  - Show warnings for different character limits
  - Display template type selection based on body length
  - Add character counter with Instagram limits

### Webhook Route Fix
- [ ] Update `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`
  - Ensure proper template type is passed to Dialogflow
  - Fix payload structure for Button Template
  - Add proper error responses for incompatible messages

## Expected Output Format

### Generic Template (≤80 chars)
```json
{
  "fulfillmentMessages": [{
    "payload": {
      "socialwiseResponse": [{
        "instagram": {
          "template_type": "generic",
          "elements": [{
            "title": "Body text (≤80 chars)",
            "subtitle": "Footer text",
            "image_url": "https://...",
            "buttons": [...]
          }]
        }
      }]
    }
  }]
}
```

### Button Template (81-640 chars)
```json
{
  "fulfillmentMessages": [{
    "payload": {
      "socialwiseResponse": [{
        "instagram": {
          "template_type": "button",
          "text": "Body text (81-640 chars)",
          "buttons": [...]
        }
      }]
    }
  }]
}
```

## Files to Modify
1. `lib/instagram/message-converter.ts` - Core conversion logic
2. `lib/instagram/payload-builder.ts` - Payload formatting
3. `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts` - Response handling
4. `app/admin/mtf-diamante/components/interactive-message-creator/UnifiedEditingStep.tsx` - Frontend preview

## Success Criteria
- Messages 81-640 chars use Button Template with correct structure
- No text truncation occurs
- Proper template_type is set in response
- Frontend shows correct preview for each template type
- Error handling for >640 char messages