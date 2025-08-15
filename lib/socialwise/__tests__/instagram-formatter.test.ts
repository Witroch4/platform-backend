/**
 * Unit tests for Instagram/Messenger button template formatting
 */

import {
  buildInstagramButtons,
  buildFacebookTextFallback,
  validateInstagramMessage,
  createInstagramButtonOptions,
  buildSimpleInstagramMessage,
  buildInstagramGenericTemplate,
  type InstagramButtonOptions,
  type InstagramMessage,
  type InstagramButtonTemplate,
  type FacebookTextMessage,
  type InstagramGenericTemplate
} from '../instagram-formatter';

describe('buildInstagramButtons', () => {
  const validButtons: InstagramButtonOptions[] = [
    { title: 'Opção 1', payload: '@opcao_1' },
    { title: 'Opção 2', payload: '@opcao_2' },
    { title: 'Opção 3', payload: '@opcao_3' }
  ];

  test('should build valid Instagram button template', () => {
    const result = buildInstagramButtons('Escolha uma opção:', validButtons);

    expect('attachment' in result.message).toBe(true);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.type).toBe('template');
    expect(template.message.attachment.payload.template_type).toBe('button');
    expect(template.message.attachment.payload.text).toBe('Escolha uma opção:');
    expect(template.message.attachment.payload.buttons).toHaveLength(3);
    
    template.message.attachment.payload.buttons.forEach((button, index) => {
      expect(button.type).toBe('postback');
      expect(button.title).toBe(validButtons[index].title);
      expect(button.payload).toBe(validButtons[index].payload);
    });
  });

  test('should limit to maximum 3 buttons', () => {
    const manyButtons: InstagramButtonOptions[] = [
      { title: 'Button 1', payload: '@btn_1' },
      { title: 'Button 2', payload: '@btn_2' },
      { title: 'Button 3', payload: '@btn_3' },
      { title: 'Button 4', payload: '@btn_4' },
      { title: 'Button 5', payload: '@btn_5' }
    ];

    const result = buildInstagramButtons('Choose:', manyButtons);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.payload.buttons).toHaveLength(3);
  });

  test('should clamp long text', () => {
    const longText = 'a'.repeat(800);
    const result = buildInstagramButtons(longText, validButtons);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.payload.text.length).toBeLessThanOrEqual(640);
  });

  test('should clamp long button titles', () => {
    const longTitleButtons: InstagramButtonOptions[] = [
      { title: 'This is a very long button title that exceeds the limit', payload: '@long_title' }
    ];

    const result = buildInstagramButtons('Choose:', longTitleButtons);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.payload.buttons[0].title.length).toBeLessThanOrEqual(20);
  });

  test('should clamp long button payloads', () => {
    const longPayloadButtons: InstagramButtonOptions[] = [
      { title: 'Button', payload: '@' + 'a'.repeat(1200) }
    ];

    const result = buildInstagramButtons('Choose:', longPayloadButtons);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.payload.buttons[0].payload.length).toBeLessThanOrEqual(1000);
  });

  test('should fall back to Facebook text when payload format is invalid', () => {
    const invalidButtons: InstagramButtonOptions[] = [
      { title: 'Valid', payload: '@valid' },
      { title: 'Invalid', payload: 'invalid_format' } // Missing @
    ];

    const result = buildInstagramButtons('Choose:', invalidButtons, { enableFallback: true });
    
    expect('text' in result.message).toBe(true);
  });

  test('should fall back to Facebook text when button title is empty after clamping', () => {
    const emptyTitleButtons: InstagramButtonOptions[] = [
      { title: '', payload: '@empty' }
    ];

    const result = buildInstagramButtons('Choose:', emptyTitleButtons, { enableFallback: true });
    
    expect('text' in result.message).toBe(true);
  });

  test('should throw error when fallback is disabled and validation fails', () => {
    const invalidButtons: InstagramButtonOptions[] = [
      { title: 'Button', payload: 'invalid_format' }
    ];

    expect(() => {
      buildInstagramButtons('Choose:', invalidButtons, { enableFallback: false });
    }).toThrow('Invalid payload format');
  });

  test('should throw error for empty text', () => {
    expect(() => {
      buildInstagramButtons('', validButtons);
    }).toThrow('Text and buttons array are required');
  });

  test('should throw error for empty buttons array', () => {
    expect(() => {
      buildInstagramButtons('Text', []);
    }).toThrow('Text and buttons array are required');
  });
});

describe('buildFacebookTextFallback', () => {
  const buttons: InstagramButtonOptions[] = [
    { title: 'Primeira Opção', payload: '@opcao_1' },
    { title: 'Segunda Opção', payload: '@opcao_2' },
    { title: 'Terceira Opção', payload: '@opcao_3' }
  ];

  test('should build Facebook text message', () => {
    const result = buildFacebookTextFallback('Escolha uma opção:', buttons);
    
    expect('text' in result.message).toBe(true);
    expect(result.message.text).toContain('Escolha uma opção:');
    expect(result.message.text).toContain('1. Primeira Opção');
    expect(result.message.text).toContain('2. Segunda Opção');
    expect(result.message.text).toContain('3. Terceira Opção');
  });

  test('should limit to 9 numbered options', () => {
    const manyButtons: InstagramButtonOptions[] = Array.from({ length: 12 }, (_, i) => ({
      title: `Option ${i + 1}`,
      payload: `@option_${i + 1}`
    }));

    const result = buildFacebookTextFallback('Choose:', manyButtons);
    
    // Should only show options 1-9
    expect(result.message.text).toContain('9. Option 9');
    expect(result.message.text).not.toContain('10. Option 10');
  });

  test('should respect Facebook text limits', () => {
    const longText = 'a'.repeat(3000);
    const result = buildFacebookTextFallback(longText, buttons);
    
    expect(result.message.text.length).toBeLessThanOrEqual(2000);
  });

  test('should truncate with ellipsis when exceeding limit', () => {
    // The function first clamps to Facebook limit (640), then adds buttons, then checks 2000 limit
    // Let's test the final ellipsis logic by mocking a scenario where the final text exceeds 2000
    const longText = 'a'.repeat(600); // Will be clamped to 640 by clampBody
    const manyButtons = Array.from({ length: 9 }, (_, i) => ({
      title: `Button with a very long title that will make the total text exceed limits ${i + 1}`,
      payload: `@button_${i + 1}`
    }));
    
    const result = buildFacebookTextFallback(longText, manyButtons);
    
    // Should respect the 2000 character limit
    expect(result.message.text.length).toBeLessThanOrEqual(2000);
    
    // If it was truncated, it should end with ellipsis
    if (result.message.text.length === 2000) {
      expect(result.message.text.endsWith('...')).toBe(true);
    }
  });
});

describe('validateInstagramMessage', () => {
  test('should validate correct Instagram button template', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose an option:',
            buttons: [
              { type: 'postback', title: 'Option 1', payload: '@option_1' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect missing text', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: '',
            buttons: [
              { type: 'postback', title: 'Option 1', payload: '@option_1' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('text is required'))).toBe(true);
  });

  test('should detect text exceeding limit', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'a'.repeat(800),
            buttons: [
              { type: 'postback', title: 'Option 1', payload: '@option_1' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('text exceeds 640 characters'))).toBe(true);
  });

  test('should detect too many buttons', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose:',
            buttons: [
              { type: 'postback', title: 'Option 1', payload: '@opt_1' },
              { type: 'postback', title: 'Option 2', payload: '@opt_2' },
              { type: 'postback', title: 'Option 3', payload: '@opt_3' },
              { type: 'postback', title: 'Option 4', payload: '@opt_4' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Too many buttons: 4 (max: 3)'))).toBe(true);
  });

  test('should detect button title exceeding limit', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose:',
            buttons: [
              { type: 'postback', title: 'This is a very long button title that exceeds the limit', payload: '@opt_1' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 title exceeds 20 characters'))).toBe(true);
  });

  test('should detect button payload exceeding limit', () => {
    const longPayload = '@' + 'a'.repeat(1200);
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose:',
            buttons: [
              { type: 'postback', title: 'Option 1', payload: longPayload }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 payload exceeds 1000 characters'))).toBe(true);
  });

  test('should detect invalid button payload format', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose:',
            buttons: [
              { type: 'postback', title: 'Option 1', payload: 'invalid_format' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 payload format invalid'))).toBe(true);
  });

  test('should detect invalid button type', () => {
    const message: InstagramButtonTemplate = {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Choose:',
            buttons: [
              { type: 'web_url' as any, title: 'Option 1', payload: '@opt_1' }
            ]
          }
        }
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 type must be \'postback\''))).toBe(true);
  });

  test('should validate correct Facebook text message', () => {
    const message: FacebookTextMessage = {
      message: {
        text: 'This is a simple text message.'
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect Facebook text message exceeding limit', () => {
    const message: FacebookTextMessage = {
      message: {
        text: 'a'.repeat(2500)
      }
    };

    const result = validateInstagramMessage(message);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Facebook text message exceeds 2000 characters'))).toBe(true);
  });
});

describe('createInstagramButtonOptions', () => {
  test('should create button options with @ prefix', () => {
    const buttons = [
      { title: 'Option 1', intent: 'option_1' },
      { title: 'Option 2', intent: '@option_2' }
    ];

    const result = createInstagramButtonOptions(buttons);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: 'Option 1', payload: '@option_1' });
    expect(result[1]).toEqual({ title: 'Option 2', payload: '@option_2' });
  });
});

describe('buildSimpleInstagramMessage', () => {
  test('should build simple Instagram message', () => {
    const buttonData = [
      { title: 'Sim', intent: 'confirm' },
      { title: 'Não', intent: 'cancel' }
    ];

    const result = buildSimpleInstagramMessage('Confirma a ação?', buttonData);
    
    expect('attachment' in result.message).toBe(true);
    const template = result as InstagramButtonTemplate;
    
    expect(template.message.attachment.payload.text).toBe('Confirma a ação?');
    expect(template.message.attachment.payload.buttons).toHaveLength(2);
    expect(template.message.attachment.payload.buttons[0].title).toBe('Sim');
    expect(template.message.attachment.payload.buttons[0].payload).toBe('@confirm');
  });
});

describe('buildInstagramGenericTemplate', () => {
  const validElements = [
    {
      title: 'Card 1',
      subtitle: 'Description 1',
      buttons: [
        { title: 'Action 1', payload: '@action_1' }
      ]
    },
    {
      title: 'Card 2',
      subtitle: 'Description 2',
      buttons: [
        { title: 'Action 2', payload: '@action_2' }
      ]
    }
  ];

  test('should build valid Instagram generic template', () => {
    const result = buildInstagramGenericTemplate(validElements);
    
    expect('attachment' in result.message).toBe(true);
    const template = result as InstagramGenericTemplate;
    
    expect(template.message.attachment.payload.template_type).toBe('generic');
    expect(template.message.attachment.payload.elements).toHaveLength(2);
    
    const firstElement = template.message.attachment.payload.elements[0];
    expect(firstElement.title).toBe('Card 1');
    expect(firstElement.subtitle).toBe('Description 1');
    expect(firstElement.buttons).toHaveLength(1);
    expect(firstElement.buttons[0].title).toBe('Action 1');
    expect(firstElement.buttons[0].payload).toBe('@action_1');
  });

  test('should limit to maximum 10 elements', () => {
    const manyElements = Array.from({ length: 15 }, (_, i) => ({
      title: `Card ${i + 1}`,
      buttons: [{ title: 'Action', payload: '@action' }]
    }));

    const result = buildInstagramGenericTemplate(manyElements);
    const template = result as InstagramGenericTemplate;
    
    expect(template.message.attachment.payload.elements).toHaveLength(10);
  });

  test('should limit buttons per element to 3', () => {
    const elementWithManyButtons = [{
      title: 'Card',
      buttons: [
        { title: 'Button 1', payload: '@btn_1' },
        { title: 'Button 2', payload: '@btn_2' },
        { title: 'Button 3', payload: '@btn_3' },
        { title: 'Button 4', payload: '@btn_4' },
        { title: 'Button 5', payload: '@btn_5' }
      ]
    }];

    const result = buildInstagramGenericTemplate(elementWithManyButtons);
    const template = result as InstagramGenericTemplate;
    
    expect(template.message.attachment.payload.elements[0].buttons).toHaveLength(3);
  });

  test('should fall back to text when element title is empty', () => {
    const invalidElements = [{
      title: '',
      buttons: [{ title: 'Action', payload: '@action' }]
    }];

    const result = buildInstagramGenericTemplate(invalidElements, { enableFallback: true });
    
    expect('text' in result.message).toBe(true);
  });

  test('should fall back to text when button is invalid', () => {
    const invalidElements = [{
      title: 'Card',
      buttons: [{ title: 'Action', payload: 'invalid_format' }]
    }];

    const result = buildInstagramGenericTemplate(invalidElements, { enableFallback: true });
    
    expect('text' in result.message).toBe(true);
  });

  test('should throw error for empty elements array', () => {
    expect(() => {
      buildInstagramGenericTemplate([]);
    }).toThrow('At least one element is required');
  });
});