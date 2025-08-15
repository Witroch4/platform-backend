/**
 * Unit tests for WhatsApp interactive message formatting
 */

import {
  buildButtons,
  buildNumberedTextFallback,
  validateWhatsAppMessage,
  createButtonOptions,
  buildSimpleInteractiveMessage,
  type WhatsAppButtonOptions,
  type WhatsAppMessage,
  type WhatsAppInteractiveMessage,
  type WhatsAppTextMessage
} from '../whatsapp-formatter';

describe('buildButtons', () => {
  const validButtons: WhatsAppButtonOptions[] = [
    { title: 'Opção 1', payload: '@opcao_1' },
    { title: 'Opção 2', payload: '@opcao_2' },
    { title: 'Opção 3', payload: '@opcao_3' }
  ];

  test('should build valid interactive message', () => {
    const result = buildButtons('Escolha uma opção:', validButtons);

    expect(result.type).toBe('interactive');
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.type).toBe('button');
    expect(interactive.interactive.body.text).toBe('Escolha uma opção:');
    expect(interactive.interactive.action.buttons).toHaveLength(3);
    
    interactive.interactive.action.buttons.forEach((button, index) => {
      expect(button.type).toBe('reply');
      expect(button.reply.title).toBe(validButtons[index].title);
      expect(button.reply.id).toBe(validButtons[index].payload);
    });
  });

  test('should limit to maximum 3 buttons', () => {
    const manyButtons: WhatsAppButtonOptions[] = [
      { title: 'Button 1', payload: '@btn_1' },
      { title: 'Button 2', payload: '@btn_2' },
      { title: 'Button 3', payload: '@btn_3' },
      { title: 'Button 4', payload: '@btn_4' },
      { title: 'Button 5', payload: '@btn_5' }
    ];

    const result = buildButtons('Choose:', manyButtons);
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.action.buttons).toHaveLength(3);
  });

  test('should clamp long body text', () => {
    const longBody = 'a'.repeat(1500);
    const result = buildButtons(longBody, validButtons);
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.body.text.length).toBeLessThanOrEqual(1024);
  });

  test('should clamp long button titles', () => {
    const longTitleButtons: WhatsAppButtonOptions[] = [
      { title: 'This is a very long button title that exceeds the limit', payload: '@long_title' }
    ];

    const result = buildButtons('Choose:', longTitleButtons);
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });

  test('should clamp long button payloads', () => {
    const longPayloadButtons: WhatsAppButtonOptions[] = [
      { title: 'Button', payload: '@' + 'a'.repeat(300) }
    ];

    const result = buildButtons('Choose:', longPayloadButtons);
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.action.buttons[0].reply.id.length).toBeLessThanOrEqual(256);
  });

  test('should include header when provided', () => {
    const result = buildButtons('Body text', validButtons, { header: 'Header Text' });
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.header).toBeDefined();
    expect(interactive.interactive.header?.text).toBe('Header Text');
  });

  test('should include footer when provided', () => {
    const result = buildButtons('Body text', validButtons, { footer: 'Footer Text' });
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.footer).toBeDefined();
    expect(interactive.interactive.footer?.text).toBe('Footer Text');
  });

  test('should fall back to text when payload format is invalid', () => {
    const invalidButtons: WhatsAppButtonOptions[] = [
      { title: 'Valid', payload: '@valid' },
      { title: 'Invalid', payload: 'invalid_format' } // Missing @
    ];

    const result = buildButtons('Choose:', invalidButtons, { enableFallback: true });
    
    expect(result.type).toBe('text');
  });

  test('should fall back to text when button title is empty after clamping', () => {
    const emptyTitleButtons: WhatsAppButtonOptions[] = [
      { title: '', payload: '@empty' }
    ];

    const result = buildButtons('Choose:', emptyTitleButtons, { enableFallback: true });
    
    expect(result.type).toBe('text');
  });

  test('should throw error when fallback is disabled and validation fails', () => {
    const invalidButtons: WhatsAppButtonOptions[] = [
      { title: 'Button', payload: 'invalid_format' }
    ];

    expect(() => {
      buildButtons('Choose:', invalidButtons, { enableFallback: false });
    }).toThrow('Invalid payload format');
  });

  test('should throw error for empty body', () => {
    expect(() => {
      buildButtons('', validButtons);
    }).toThrow('Body text and buttons array are required');
  });

  test('should throw error for empty buttons array', () => {
    expect(() => {
      buildButtons('Body text', []);
    }).toThrow('Body text and buttons array are required');
  });
});

describe('buildNumberedTextFallback', () => {
  const buttons: WhatsAppButtonOptions[] = [
    { title: 'Primeira Opção', payload: '@opcao_1' },
    { title: 'Segunda Opção', payload: '@opcao_2' },
    { title: 'Terceira Opção', payload: '@opcao_3' }
  ];

  test('should build numbered text message', () => {
    const result = buildNumberedTextFallback('Escolha uma opção:', buttons);
    
    expect(result.type).toBe('text');
    expect(result.text.body).toContain('Escolha uma opção:');
    expect(result.text.body).toContain('1. Primeira Opção');
    expect(result.text.body).toContain('2. Segunda Opção');
    expect(result.text.body).toContain('3. Terceira Opção');
  });

  test('should include header in text format', () => {
    const result = buildNumberedTextFallback('Body text', buttons, { header: 'Header' });
    
    expect(result.text.body).toContain('*Header*');
  });

  test('should include footer in text format', () => {
    const result = buildNumberedTextFallback('Body text', buttons, { footer: 'Footer' });
    
    expect(result.text.body).toContain('_Footer_');
  });

  test('should limit to 9 numbered options', () => {
    const manyButtons: WhatsAppButtonOptions[] = Array.from({ length: 12 }, (_, i) => ({
      title: `Option ${i + 1}`,
      payload: `@option_${i + 1}`
    }));

    const result = buildNumberedTextFallback('Choose:', manyButtons);
    
    // Should only show options 1-9
    expect(result.text.body).toContain('9. Option 9');
    expect(result.text.body).not.toContain('10. Option 10');
  });

  test('should respect WhatsApp text limits', () => {
    const longBody = 'a'.repeat(2000);
    const result = buildNumberedTextFallback(longBody, buttons);
    
    expect(result.text.body.length).toBeLessThanOrEqual(1024);
  });
});

describe('validateWhatsAppMessage', () => {
  test('should validate correct interactive message', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose an option:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '@option_1', title: 'Option 1' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect missing body text', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '@option_1', title: 'Option 1' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('body text is required'))).toBe(true);
  });

  test('should detect body text exceeding limit', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'a'.repeat(1500) },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '@option_1', title: 'Option 1' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Body text exceeds 1024 characters'))).toBe(true);
  });

  test('should detect too many buttons', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '@opt_1', title: 'Option 1' } },
            { type: 'reply', reply: { id: '@opt_2', title: 'Option 2' } },
            { type: 'reply', reply: { id: '@opt_3', title: 'Option 3' } },
            { type: 'reply', reply: { id: '@opt_4', title: 'Option 4' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Too many buttons: 4 (max: 3)'))).toBe(true);
  });

  test('should detect button title exceeding limit', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '@opt_1', title: 'This is a very long button title that exceeds the limit' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 title exceeds 20 characters'))).toBe(true);
  });

  test('should detect button ID exceeding limit', () => {
    const longId = '@' + 'a'.repeat(300);
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: longId, title: 'Option 1' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 ID exceeds 256 characters'))).toBe(true);
  });

  test('should detect invalid button ID format', () => {
    const message: WhatsAppInteractiveMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'invalid_format', title: 'Option 1' } }
          ]
        }
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 ID format invalid'))).toBe(true);
  });

  test('should validate correct text message', () => {
    const message: WhatsAppTextMessage = {
      type: 'text',
      text: {
        body: 'This is a simple text message.'
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect text message exceeding limit', () => {
    const message: WhatsAppTextMessage = {
      type: 'text',
      text: {
        body: 'a'.repeat(5000)
      }
    };

    const result = validateWhatsAppMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Text message exceeds 4096 characters'))).toBe(true);
  });
});

describe('createButtonOptions', () => {
  test('should create button options with @ prefix', () => {
    const buttons = [
      { title: 'Option 1', intent: 'option_1' },
      { title: 'Option 2', intent: '@option_2' }
    ];

    const result = createButtonOptions(buttons);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: 'Option 1', payload: '@option_1' });
    expect(result[1]).toEqual({ title: 'Option 2', payload: '@option_2' });
  });
});

describe('buildSimpleInteractiveMessage', () => {
  test('should build simple interactive message', () => {
    const buttonData = [
      { title: 'Sim', intent: 'confirm' },
      { title: 'Não', intent: 'cancel' }
    ];

    const result = buildSimpleInteractiveMessage('Confirma a ação?', buttonData, 'Confirmação');
    
    expect(result.type).toBe('interactive');
    const interactive = result as WhatsAppInteractiveMessage;
    
    expect(interactive.interactive.body.text).toBe('Confirma a ação?');
    expect(interactive.interactive.header?.text).toBe('Confirmação');
    expect(interactive.interactive.action.buttons).toHaveLength(2);
    expect(interactive.interactive.action.buttons[0].reply.title).toBe('Sim');
    expect(interactive.interactive.action.buttons[0].reply.id).toBe('@confirm');
  });
});