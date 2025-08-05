/**
 * Contract test fixtures for Chatwit API responses
 * These fixtures represent expected API response formats
 */

export const whatsappInteractiveResponseFixture = {
  content: 'Como posso ajudar você hoje?',
  message_type: 'outgoing' as const,
  private: false,
  content_attributes: {
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: 'Atendimento',
      },
      body: {
        text: 'Como posso ajudar você hoje?',
      },
      footer: {
        text: 'SocialWise',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'intent:track_order',
              title: 'Rastrear Pedido',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'intent:cancel_order',
              title: 'Cancelar Pedido',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'human_handoff',
              title: 'Falar com Atendente',
            },
          },
        ],
      },
    },
  },
  additional_attributes: {
    provider: 'meta',
    channel: 'whatsapp',
    schema_version: '1.0.0',
    trace_id: 'trace-abc-123',
  },
};

export const whatsappSimpleTextResponseFixture = {
  content: 'Obrigado pela sua mensagem! Um atendente entrará em contato em breve.',
  message_type: 'outgoing' as const,
  private: false,
  additional_attributes: {
    provider: 'meta',
    channel: 'whatsapp',
    schema_version: '1.0.0',
    trace_id: 'trace-def-456',
  },
};

export const instagramQuickReplyResponseFixture = {
  content: 'Escolha uma das opções abaixo:',
  message_type: 'outgoing' as const,
  private: false,
  content_attributes: {
    ig: {
      messaging_type: 'RESPONSE',
      message: {
        text: 'Escolha uma das opções abaixo:',
        quick_replies: [
          {
            content_type: 'text',
            title: 'Rastrear',
            payload: 'intent:track_order',
          },
          {
            content_type: 'text',
            title: 'Cancelar',
            payload: 'intent:cancel_order',
          },
          {
            content_type: 'text',
            title: 'Suporte',
            payload: 'human_handoff',
          },
        ],
      },
    },
  },
  additional_attributes: {
    provider: 'meta',
    channel: 'instagram',
    schema_version: '1.0.0',
    trace_id: 'trace-ghi-789',
  },
};

export const instagramButtonTemplateResponseFixture = {
  content: 'Como posso ajudar você?',
  message_type: 'outgoing' as const,
  private: false,
  content_attributes: {
    ig: {
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Como posso ajudar você?',
            buttons: [
              {
                type: 'postback',
                title: 'Rastrear',
                payload: 'intent:track_order',
              },
              {
                type: 'web_url',
                title: 'Site',
                url: 'https://example.com',
              },
              {
                type: 'postback',
                title: 'Suporte',
                payload: 'human_handoff',
              },
            ],
          },
        },
      },
    },
  },
  additional_attributes: {
    provider: 'meta',
    channel: 'instagram',
    schema_version: '1.0.0',
    trace_id: 'trace-jkl-012',
  },
};

export const messengerButtonTemplateResponseFixture = {
  content: 'How can I help you?',
  message_type: 'outgoing' as const,
  private: false,
  content_attributes: {
    messenger: {
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'How can I help you?',
            buttons: [
              {
                type: 'postback',
                title: 'Track Order',
                payload: 'intent:track_order',
              },
              {
                type: 'web_url',
                title: 'Website',
                url: 'https://example.com',
              },
            ],
          },
        },
      },
    },
  },
  additional_attributes: {
    provider: 'meta',
    channel: 'messenger',
    schema_version: '1.0.0',
    trace_id: 'trace-mno-345',
  },
};

export const humanHandoffResponseFixture = {
  content: 'Acionei um atendente humano para ajudar você.',
  message_type: 'outgoing' as const,
  private: false,
  additional_attributes: {
    provider: 'meta',
    channel: 'whatsapp',
    schema_version: '1.0.0',
    trace_id: 'trace-pqr-678',
    handoff_reason: 'ai_failure',
    assign_to_team: 'support',
    conversation_tags: ['ai_handoff'],
    conversation_status: 'open',
  },
};

export const economicModeResponseFixture = {
  content: 'Como ajudar?',
  message_type: 'outgoing' as const,
  private: false,
  content_attributes: {
    interactive: {
      type: 'button',
      body: {
        text: 'Como ajudar?',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'help',
              title: 'Ajuda',
            },
          },
        ],
      },
    },
  },
  additional_attributes: {
    provider: 'meta',
    channel: 'whatsapp',
    schema_version: '1.0.0',
    trace_id: 'trace-stu-901',
    economic_mode: true,
  },
};

export const sanitizedResponseFixtures = {
  truncatedBody: {
    content: 'Esta é uma mensagem muito longa que foi truncada para caber nos limites do WhatsApp. O texto original era muito maior mas foi cortado preservando as palavras completas...',
    message_type: 'outgoing' as const,
    private: false,
    content_attributes: {
      interactive: {
        type: 'button',
        body: {
          text: 'Esta é uma mensagem muito longa que foi truncada para caber nos limites do WhatsApp. O texto original era muito maior mas foi cortado preservando as palavras completas...',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'continue',
                title: 'Continuar',
              },
            },
          ],
        },
      },
    },
    additional_attributes: {
      provider: 'meta',
      channel: 'whatsapp',
      schema_version: '1.0.0',
      trace_id: 'trace-truncated',
    },
  },
  uniqueButtonTitles: {
    content: 'Escolha uma opção:',
    message_type: 'outgoing' as const,
    private: false,
    content_attributes: {
      interactive: {
        type: 'button',
        body: {
          text: 'Escolha uma opção:',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'option1',
                title: 'Rastrear',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'option2',
                title: 'Cancelar',
              },
            },
            // Note: Duplicate "Rastrear" was removed during sanitization
          ],
        },
      },
    },
    additional_attributes: {
      provider: 'meta',
      channel: 'whatsapp',
      schema_version: '1.0.0',
      trace_id: 'trace-unique-titles',
    },
  },
  fallbackButton: {
    content: 'Não consegui processar sua solicitação.',
    message_type: 'outgoing' as const,
    private: false,
    content_attributes: {
      interactive: {
        type: 'button',
        body: {
          text: 'Não consegui processar sua solicitação.',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'human_handoff',
                title: 'Falar com atendente',
              },
            },
          ],
        },
      },
    },
    additional_attributes: {
      provider: 'meta',
      channel: 'whatsapp',
      schema_version: '1.0.0',
      trace_id: 'trace-fallback',
    },
  },
};

export const errorResponseFixtures = {
  invalidPayload: {
    error: 'Invalid request format',
    code: 'VALIDATION_ERROR',
    details: {
      field: 'content_attributes',
      message: 'Interactive content validation failed',
    },
  },
  authenticationError: {
    error: 'Invalid access token',
    code: 'AUTHENTICATION_ERROR',
  },
  rateLimitError: {
    error: 'Rate limit exceeded',
    code: 'RATE_LIMIT_EXCEEDED',
    retry_after: 60,
  },
  serverError: {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  },
  conversationNotFound: {
    error: 'Conversation not found',
    code: 'RESOURCE_NOT_FOUND',
    resource: 'conversation',
    id: 456,
  },
};