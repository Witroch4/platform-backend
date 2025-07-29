/**
 * Instagram Message Conversion Examples
 * 
 * Demonstrates how to use the Instagram message converter with real-world examples.
 */

import { 
  convertTemplateToInstagram,
  messageConverter,
  type PrismaTemplate,
  type WhatsAppTemplate 
} from '../index';

// Example 1: Generic Template (Short Message ≤80 chars)
export const genericTemplateExample = (): void => {
  console.log('=== Generic Template Example ===');
  
  const whatsappTemplate: WhatsAppTemplate = {
    body: {
      text: 'Welcome to our store! Check out our latest products.',
    },
    header: {
      type: 'image',
      content: 'https://example.com/store-banner.jpg',
    },
    footer: {
      text: 'Best deals today!',
    },
    buttons: [
      {
        id: 'view_products',
        title: 'View Products',
        type: 'web_url',
        url: 'https://store.example.com/products',
      },
      {
        id: 'contact_us',
        title: 'Contact Us',
        type: 'postback',
        payload: 'CONTACT_SUPPORT',
      },
    ],
  };

  const result = messageConverter.convert(whatsappTemplate);
  
  if (result.success && result.instagramTemplate) {
    console.log('✅ Conversion successful!');
    console.log('Template Type:', result.instagramTemplate.type);
    console.log('Instagram Payload:', JSON.stringify(result.instagramTemplate.payload, null, 2));
    
    if (result.warnings) {
      console.log('⚠️ Warnings:', result.warnings);
    }
  } else {
    console.log('❌ Conversion failed:', result.error);
  }
  
  console.log('\n');
};

// Example 2: Button Template (Long Message 81-640 chars)
export const buttonTemplateExample = (): void => {
  console.log('=== Button Template Example ===');
  
  const longMessage = `
Thank you for your interest in our premium subscription service! 
Our premium plan includes unlimited access to all features, priority customer support, 
advanced analytics, custom integrations, and much more. 
Join thousands of satisfied customers who have already upgraded their experience.
  `.trim();

  const whatsappTemplate: WhatsAppTemplate = {
    body: {
      text: longMessage, // 387 chars - will be Button Template
    },
    header: {
      type: 'text',
      content: 'Premium Subscription', // Will be discarded
    },
    footer: {
      text: 'Limited time offer!', // Will be discarded
    },
    buttons: [
      {
        id: 'upgrade_now',
        title: 'Upgrade Now',
        type: 'web_url',
        url: 'https://example.com/upgrade',
      },
      {
        id: 'learn_more',
        title: 'Learn More',
        type: 'postback',
        payload: 'LEARN_MORE_PREMIUM',
      },
      {
        id: 'contact_sales',
        title: 'Contact Sales',
        type: 'postback',
        payload: 'CONTACT_SALES',
      },
    ],
  };

  const result = messageConverter.convert(whatsappTemplate);
  
  if (result.success && result.instagramTemplate) {
    console.log('✅ Conversion successful!');
    console.log('Template Type:', result.instagramTemplate.type);
    console.log('Instagram Payload:', JSON.stringify(result.instagramTemplate.payload, null, 2));
    
    if (result.warnings) {
      console.log('⚠️ Warnings:', result.warnings);
    }
  } else {
    console.log('❌ Conversion failed:', result.error);
  }
  
  console.log('\n');
};

// Example 3: Prisma Template Conversion
export const prismaTemplateExample = (): void => {
  console.log('=== Prisma Template Conversion Example ===');
  
  const prismaTemplate: PrismaTemplate = {
    id: 'template_123',
    name: 'Product Announcement',
    type: 'INTERACTIVE_MESSAGE',
    interactiveContent: {
      id: 'content_456',
      header: {
        type: 'image',
        content: 'https://example.com/product-image.jpg',
      },
      body: {
        text: 'New product launch! Limited stock available.',
      },
      footer: {
        text: 'Act fast!',
      },
      actionReplyButton: {
        buttons: JSON.stringify([
          {
            id: 'buy_now',
            title: 'Buy Now',
            type: 'web_url',
            url: 'https://example.com/buy',
          },
          {
            id: 'notify_me',
            title: 'Notify Me',
            type: 'postback',
            payload: 'NOTIFY_RESTOCK',
          },
        ]),
      },
    },
  };

  const result = convertTemplateToInstagram(prismaTemplate);
  
  if (result.success && result.instagramTemplate) {
    console.log('✅ Conversion successful!');
    console.log('Template Type:', result.instagramTemplate.type);
    console.log('Instagram Payload:', JSON.stringify(result.instagramTemplate.payload, null, 2));
    
    if (result.warnings) {
      console.log('⚠️ Warnings:', result.warnings);
    }
  } else if (result.skipped) {
    console.log('⏭️ Conversion skipped:', result.skipReason);
  } else {
    console.log('❌ Conversion failed:', result.error);
  }
  
  console.log('\n');
};

// Example 4: Error Handling
export const errorHandlingExample = (): void => {
  console.log('=== Error Handling Examples ===');
  
  // Example 4a: Message too long
  const tooLongTemplate: WhatsAppTemplate = {
    body: {
      text: 'A'.repeat(700), // 700 chars - exceeds Instagram limit
    },
  };

  console.log('4a. Message too long:');
  const result1 = messageConverter.convert(tooLongTemplate);
  console.log(result1.success ? '✅ Success' : '❌ Failed:', result1.error);
  
  // Example 4b: Empty message
  const emptyTemplate: WhatsAppTemplate = {
    body: {
      text: '',
    },
  };

  console.log('4b. Empty message:');
  const result2 = messageConverter.convert(emptyTemplate);
  console.log(result2.success ? '✅ Success' : '❌ Failed:', result2.error);
  
  // Example 4c: Invalid button type
  const invalidButtonTemplate: WhatsAppTemplate = {
    body: {
      text: 'Choose an option',
    },
    buttons: [
      {
        id: 'valid_button',
        title: 'Valid',
        type: 'postback',
        payload: 'VALID',
      },
      {
        id: 'invalid_button',
        title: 'Invalid',
        type: 'unsupported_type' as any,
      },
    ],
  };

  console.log('4c. Invalid button type:');
  const result3 = messageConverter.convert(invalidButtonTemplate);
  if (result3.success) {
    console.log('✅ Success with warnings:', result3.warnings);
  } else {
    console.log('❌ Failed:', result3.error);
  }
  
  console.log('\n');
};

// Example 5: Custom Conversion Rules
export const customRulesExample = (): void => {
  console.log('=== Custom Conversion Rules Example ===');
  
  const customRules = {
    maxBodyLengthForGeneric: 50,  // Shorter limit for Generic
    maxBodyLengthForButton: 300,  // Shorter limit for Button
    maxSubtitleLength: 40,        // Shorter subtitle limit
    maxTitleLength: 40,           // Shorter title limit
    maxButtonsCount: 2,           // Only 2 buttons allowed
  };

  const customConverter = new (require('../message-converter').MessageConverter)(customRules);
  
  const template: WhatsAppTemplate = {
    body: {
      text: 'This message has 60 characters and will be Button Template', // 60 chars
    },
    buttons: [
      { id: '1', title: 'Button 1', type: 'postback', payload: 'btn1' },
      { id: '2', title: 'Button 2', type: 'postback', payload: 'btn2' },
      { id: '3', title: 'Button 3', type: 'postback', payload: 'btn3' }, // Will be dropped
    ],
  };

  const result = customConverter.convert(template);
  
  if (result.success && result.instagramTemplate) {
    console.log('✅ Conversion successful with custom rules!');
    console.log('Template Type:', result.instagramTemplate.type);
    console.log('Warnings:', result.warnings);
    
    const payload = result.instagramTemplate.payload as any;
    if (result.instagramTemplate.type === 'button') {
      console.log('Button count:', payload.buttons.length);
    }
  } else {
    console.log('❌ Conversion failed:', result.error);
  }
  
  console.log('\n');
};

// Run all examples
export const runAllExamples = (): void => {
  console.log('🚀 Instagram Message Converter Examples\n');
  
  genericTemplateExample();
  buttonTemplateExample();
  prismaTemplateExample();
  errorHandlingExample();
  customRulesExample();
  
  console.log('✨ All examples completed!');
};

// Export for individual use
export {
  genericTemplateExample,
  buttonTemplateExample,
  prismaTemplateExample,
  errorHandlingExample,
  customRulesExample,
};