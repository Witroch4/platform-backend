# Instagram Message Converter

A TypeScript library for converting WhatsApp interactive message templates to Instagram-compatible formats.

## Overview

This library provides functionality to convert WhatsApp Business API interactive messages into Instagram Messenger templates, supporting both Generic Template (≤80 characters) and Button Template (81-640 characters) formats.

## Features

- ✅ **Character Limit Validation**: Automatically determines template type based on message length
- ✅ **Generic Template Support**: For messages ≤80 characters with rich media and buttons
- ✅ **Button Template Support**: For messages 81-640 characters with text and buttons
- ✅ **Button Type Mapping**: Converts `web_url` and `postback` buttons
- ✅ **Header/Footer Handling**: Preserves media in Generic Templates, discards in Button Templates
- ✅ **Validation & Error Handling**: Comprehensive input validation with detailed error messages
- ✅ **Prisma Integration**: Direct conversion from Prisma template models
- ✅ **Batch Processing**: Convert multiple templates at once
- ✅ **Custom Rules**: Configurable conversion limits and rules

## Installation

The library is part of the main project. Import from:

```typescript
import { messageConverter, convertTemplateToInstagram } from '@/lib/instagram';
```

## Quick Start

### Basic Conversion

```typescript
import { messageConverter } from '@/lib/instagram';

const whatsappTemplate = {
  body: { text: 'Welcome to our store!' },
  header: { type: 'image', content: 'https://example.com/banner.jpg' },
  footer: { text: 'Best deals today!' },
  buttons: [
    { id: '1', title: 'Shop Now', type: 'web_url', url: 'https://store.com' },
    { id: '2', title: 'Contact', type: 'postback', payload: 'CONTACT' }
  ]
};

const result = messageConverter.convert(whatsappTemplate);

if (result.success) {
  console.log('Instagram Template:', result.instagramTemplate);
} else {
  console.error('Conversion failed:', result.error);
}
```

### Prisma Template Conversion

```typescript
import { convertTemplateToInstagram } from '@/lib/instagram';

// From database query
const prismaTemplate = await prisma.template.findUnique({
  where: { id: 'template_id' },
  include: {
    interactiveContent: {
      include: { header: true, body: true, footer: true, actionReplyButton: true }
    }
  }
});

const result = convertTemplateToInstagram(prismaTemplate);
```

## Template Types

### Generic Template (≤80 characters)

Used for short messages with rich media support:

```json
{
  "type": "generic",
  "payload": {
    "template_type": "generic",
    "elements": [{
      "title": "Welcome to our store!",
      "subtitle": "Best deals today!",
      "image_url": "https://example.com/banner.jpg",
      "buttons": [
        { "type": "web_url", "title": "Shop Now", "url": "https://store.com" },
        { "type": "postback", "title": "Contact", "payload": "CONTACT" }
      ]
    }]
  }
}
```

### Button Template (81-640 characters)

Used for longer messages with text and buttons:

```json
{
  "type": "button",
  "payload": {
    "template_type": "button",
    "text": "Thank you for your interest in our premium subscription...",
    "buttons": [
      { "type": "web_url", "title": "Upgrade", "url": "https://upgrade.com" },
      { "type": "postback", "title": "Learn More", "payload": "LEARN_MORE" }
    ]
  }
}
```

## Conversion Rules

| Rule | Generic Template | Button Template |
|------|------------------|-----------------|
| **Body Length** | ≤80 characters | 81-640 characters |
| **Title** | Body text (truncated to 80 chars) | N/A |
| **Subtitle** | Footer text (truncated to 80 chars) | N/A |
| **Text** | N/A | Full body text |
| **Image** | Header image URL | Discarded |
| **Header/Footer** | Preserved as subtitle | Discarded with warning |
| **Max Buttons** | 3 | 3 |

## Button Type Mapping

| WhatsApp Button Type | Instagram Button Type | Required Fields |
|---------------------|----------------------|-----------------|
| `web_url` | `web_url` | `title`, `url` |
| `postback` | `postback` | `title`, `payload` |

## API Reference

### MessageConverter

```typescript
class MessageConverter {
  constructor(rules?: MessageConversionRules)
  convert(template: WhatsAppTemplate): ConversionResult
}
```

### Conversion Functions

```typescript
// Convert Prisma template to Instagram
convertTemplateToInstagram(template: PrismaTemplate | CompleteMessageMapping): ConversionPipelineResult

// Convert multiple templates
convertMultipleTemplatesToInstagram(templates: PrismaTemplate[]): ConversionPipelineResult[]

// Get conversion statistics
getConversionStatistics(results: ConversionPipelineResult[]): ConversionStats
```

### Template Adapters

```typescript
// Convert Prisma model to WhatsApp format
convertPrismaTemplateToWhatsApp(template: PrismaTemplate): WhatsAppTemplate | null

// Check if template can be converted
canConvertToInstagram(template: WhatsAppTemplate): boolean
```

## Error Handling

The converter provides detailed error messages and warnings:

```typescript
const result = messageConverter.convert(template);

if (!result.success) {
  console.error('Error:', result.error);
} else if (result.warnings) {
  console.warn('Warnings:', result.warnings);
}
```

Common errors:
- `Template body text is required`
- `Message body exceeds Instagram limit of 640 characters`
- `Template body text cannot be empty`
- `web_url buttons must have a url`

Common warnings:
- `Header discarded in Button Template format`
- `Footer discarded in Button Template format`
- `Only first 3 buttons will be used (5 provided)`
- `Button "Title" could not be converted (unsupported type: custom)`

## Custom Rules

You can customize conversion behavior:

```typescript
import { MessageConverter } from '@/lib/instagram';

const customRules = {
  maxBodyLengthForGeneric: 50,    // Custom Generic Template limit
  maxBodyLengthForButton: 300,    // Custom Button Template limit
  maxSubtitleLength: 40,          // Custom subtitle limit
  maxTitleLength: 40,             // Custom title limit
  maxButtonsCount: 2,             // Custom button limit
};

const converter = new MessageConverter(customRules);
```

## Examples

See `lib/instagram/examples/conversion-examples.ts` for comprehensive examples including:

- Generic Template conversion
- Button Template conversion
- Prisma template conversion
- Error handling scenarios
- Custom rules usage

## Testing

The library includes comprehensive unit tests:

```bash
npm test -- lib/instagram/__tests__/
```

Test coverage includes:
- Message converter functionality
- Template adapter conversions
- Conversion pipeline
- Error handling
- Edge cases

## Requirements Mapping

This implementation satisfies the following requirements:

- **3.1**: Character limit validation (≤80 chars → Generic, 81-640 chars → Button)
- **3.2**: Generic Template conversion with title, subtitle, image, buttons
- **3.3**: Button Template conversion with text and buttons
- **3.4**: Header/footer handling (preserve in Generic, discard in Button)
- **3.5**: Button conversion with type mapping (web_url, postback)
- **4.1-4.5**: Input validation and error handling
- **7.1-7.5**: Comprehensive testing and documentation

## License

Part of the Chatwit Social project.