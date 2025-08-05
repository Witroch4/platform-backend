/**
 * Contract test fixtures for Chatwit webhook payloads
 * These fixtures represent real webhook payloads from Chatwit
 */

export const whatsappIncomingTextFixture = {
  account_id: 123,
  channel: 'whatsapp' as const,
  conversation: {
    id: 456,
    inbox_id: 789,
    status: 'open' as const,
  },
  message: {
    id: 101112,
    message_type: 'incoming' as const,
    content_type: 'text',
    content: 'Olá, preciso de ajuda com meu pedido',
    created_at: 1704067200,
    source_id: 'wamid.HBgNNTU1MTk4NzY1NDMyNRUCABIYIDdBNzA5QzI4RjA4NzRBNzY5QjQyNzI4RjA4NzRBNzY5',
    sender: {
      type: 'contact' as const,
      id: 999,
      name: 'João Silva',
    },
  },
};

export const whatsappButtonReplyFixture = {
  account_id: 123,
  channel: 'whatsapp' as const,
  conversation: {
    id: 456,
    inbox_id: 789,
    status: 'open' as const,
  },
  message: {
    id: 101113,
    message_type: 'incoming' as const,
    content_type: 'interactive',
    content: null,
    content_attributes: {
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'intent:track_order',
          title: 'Rastrear Pedido',
        },
      },
    },
    created_at: 1704067260,
    source_id: 'wamid.HBgNNTU1MTk4NzY1NDMyNRUCABIYIDdBNzA5QzI4RjA4NzRBNzY5QjQyNzI4RjA4NzRBNzY5',
    sender: {
      type: 'contact' as const,
      id: 999,
      name: 'João Silva',
    },
  },
};

export const instagramIncomingTextFixture = {
  account_id: 123,
  channel: 'instagram' as const,
  conversation: {
    id: 457,
    inbox_id: 790,
    status: 'open' as const,
  },
  message: {
    id: 101114,
    message_type: 'incoming' as const,
    content_type: 'text',
    content: 'Oi! Quero saber sobre meus pedidos',
    created_at: 1704067300,
    source_id: 'mid.YW1lc3NhZ2VfaWQ',
    sender: {
      type: 'contact' as const,
      id: 1000,
      name: 'Maria Santos',
    },
  },
};

export const instagramQuickReplyFixture = {
  account_id: 123,
  channel: 'instagram' as const,
  conversation: {
    id: 457,
    inbox_id: 790,
    status: 'open' as const,
  },
  message: {
    id: 101115,
    message_type: 'incoming' as const,
    content_type: 'interactive',
    content: null,
    content_attributes: {
      quick_reply: {
        payload: 'intent:cancel_order',
      },
    },
    created_at: 1704067360,
    source_id: 'mid.YW1lc3NhZ2VfaWQ',
    sender: {
      type: 'contact' as const,
      id: 1000,
      name: 'Maria Santos',
    },
  },
};

export const instagramPostbackFixture = {
  account_id: 123,
  channel: 'instagram' as const,
  conversation: {
    id: 457,
    inbox_id: 790,
    status: 'open' as const,
  },
  message: {
    id: 101116,
    message_type: 'incoming' as const,
    content_type: 'interactive',
    content: null,
    content_attributes: {
      postback: {
        payload: 'flow:get_started',
        title: 'Começar',
      },
    },
    created_at: 1704067420,
    source_id: 'mid.YW1lc3NhZ2VfaWQ',
    sender: {
      type: 'contact' as const,
      id: 1000,
      name: 'Maria Santos',
    },
  },
};

export const messengerIncomingTextFixture = {
  account_id: 123,
  channel: 'messenger' as const,
  conversation: {
    id: 458,
    inbox_id: 791,
    status: 'open' as const,
  },
  message: {
    id: 101117,
    message_type: 'incoming' as const,
    content_type: 'text',
    content: 'Hello, I need help with my order',
    created_at: 1704067480,
    source_id: 'mid.messenger_id_123',
    sender: {
      type: 'contact' as const,
      id: 1001,
      name: 'John Doe',
    },
  },
};

export const outgoingMessageFixture = {
  account_id: 123,
  channel: 'whatsapp' as const,
  conversation: {
    id: 456,
    inbox_id: 789,
    status: 'open' as const,
  },
  message: {
    id: 101118,
    message_type: 'outgoing' as const,
    content_type: 'text',
    content: 'Olá! Como posso ajudar você hoje?',
    created_at: 1704067540,
    source_id: null,
    sender: {
      type: 'agent' as const,
      id: 1,
      name: 'Bot Assistant',
    },
  },
};

export const invalidPayloadFixtures = {
  missingAccountId: {
    // account_id missing
    channel: 'whatsapp',
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open',
    },
    message: {
      id: 101112,
      message_type: 'incoming',
      content: 'Test',
      created_at: 1704067200,
    },
  },
  invalidChannel: {
    account_id: 123,
    channel: 'invalid_channel',
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open',
    },
    message: {
      id: 101112,
      message_type: 'incoming',
      content: 'Test',
      created_at: 1704067200,
    },
  },
  missingMessageContent: {
    account_id: 123,
    channel: 'whatsapp',
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open',
    },
    message: {
      id: 101112,
      message_type: 'incoming',
      // Both content and content_attributes missing
      created_at: 1704067200,
    },
  },
  invalidTimestamp: {
    account_id: 123,
    channel: 'whatsapp',
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open',
    },
    message: {
      id: 101112,
      message_type: 'incoming',
      content: 'Test',
      created_at: 'invalid_timestamp',
    },
  },
};

export const edgeCaseFixtures = {
  veryLongContent: {
    account_id: 123,
    channel: 'whatsapp' as const,
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open' as const,
    },
    message: {
      id: 101119,
      message_type: 'incoming' as const,
      content_type: 'text',
      content: 'A'.repeat(4096), // Very long message
      created_at: 1704067600,
      source_id: 'wamid.long_message',
      sender: {
        type: 'contact' as const,
        id: 999,
        name: 'Test User',
      },
    },
  },
  specialCharacters: {
    account_id: 123,
    channel: 'whatsapp' as const,
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open' as const,
    },
    message: {
      id: 101120,
      message_type: 'incoming' as const,
      content_type: 'text',
      content: '🎉 Olá! @#$%^&*()_+-=[]{}|;:,.<>? "Teste" \'aspas\' \n\t\r',
      created_at: 1704067660,
      source_id: 'wamid.special_chars',
      sender: {
        type: 'contact' as const,
        id: 999,
        name: 'Test User',
      },
    },
  },
  nullValues: {
    account_id: 123,
    channel: 'whatsapp' as const,
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open' as const,
    },
    message: {
      id: 101121,
      message_type: 'incoming' as const,
      content_type: null,
      content: 'Test message',
      created_at: 1704067720,
      source_id: null,
      sender: null,
    },
  },
  largeIds: {
    account_id: 999999999999,
    channel: 'whatsapp' as const,
    conversation: {
      id: 888888888888,
      inbox_id: 777777777777,
      status: 'open' as const,
    },
    message: {
      id: 666666666666,
      message_type: 'incoming' as const,
      content_type: 'text',
      content: 'Test with large IDs',
      created_at: 1704067780,
      source_id: 'wamid.large_ids',
      sender: {
        type: 'contact' as const,
        id: 555555555555,
        name: 'Test User',
      },
    },
  },
};