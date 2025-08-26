


# Guia Completo - Estrutura de Mensagens Instagram API para Next.js

## 📋 Visão Geral

Este guia apresenta todas as estruturas de mensagens disponíveis na Instagram API, com foco em Next.js. Cada tipo de mensagem possui limites específicos e formatos obrigatórios.

## 🔧 Conf**Limites:**
- **Texto do prompt (campo text)**: 1000 caracteres - mesmo limite de mensagem de texto
- **Máximo de quick replies**: 13 por mensagem
- **Caracteres por botão**: 20 (truncado após este limite)
- **Suporte**: Apenas texto simples
- **Disponibilidade**: Não funciona em desktopão Base

### URL Base
```javascript
const BASE_URL = 'https://graph.instagram.com/v23.0';
```

### Headers Padrão
```javascript
const headers = {
  'Authorization': `Bearer ${INSTAGRAM_USER_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};
```

### Estrutura Base de Requisição
```javascript
const baseRequest = {
  recipient: {
    id: "<IGSID>" // Instagram-scoped ID do destinatário
  },
  message: {
    // Conteúdo específico do tipo de mensagem
  }
};
```

## 📝 Tipos de Mensagem e Estruturas

### 1. Mensagem de Texto Simples

**Limites:**
- **Texto**: Máximo 1000 bytes (UTF-8)
- **Links**: Devem ser URLs válidas e formatadas

```typescript
interface TextMessage {
  recipient: {
    id: string; // IGSID
  };
  message: {
    text: string; // Max: 1000 bytes UTF-8
  };
}

// Exemplo de estrutura
const textMessage: TextMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    text: "Olá! Esta é uma mensagem de texto."
  }
};
```

### 2. Mensagem com Imagem ou GIF

**Limites:**
- **Formatos suportados**: PNG, JPEG, GIF
- **Tamanho máximo**: 8MB
- **URL**: Deve ser acessível publicamente

```typescript
interface ImageMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'image';
      payload: {
        url: string; // URL da imagem/GIF
      };
    };
  };
}

// Exemplo de estrutura
const imageMessage: ImageMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "image",
      payload: {
        url: "https://exemplo.com/imagem.jpg"
      }
    }
  }
};
```

### 3. Mensagem de Áudio

**Limites:**
- **Formatos suportados**: AAC, M4A, WAV, MP4
- **Tamanho máximo**: 25MB

```typescript
interface AudioMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'audio';
      payload: {
        url: string;
      };
    };
  };
}

// Exemplo de estrutura
const audioMessage: AudioMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "audio",
      payload: {
        url: "https://exemplo.com/audio.m4a"
      }
    }
  }
};
```

### 4. Mensagem de Vídeo

**Limites:**
- **Formatos suportados**: MP4, OGG, AVI, MOV, WEBM
- **Tamanho máximo**: 25MB

```typescript
interface VideoMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'video';
      payload: {
        url: string;
      };
    };
  };
}

// Exemplo de estrutura
const videoMessage: VideoMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "video",
      payload: {
        url: "https://exemplo.com/video.mp4"
      }
    }
  }
};
```

### 5. Sticker (Coração)

**Limites:**
- **Tipo fixo**: Apenas "like_heart" disponível

```typescript
interface StickerMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'like_heart';
    };
  };
}

// Exemplo de estrutura
const stickerMessage: StickerMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "like_heart"
    }
  }
};
```

### 6. Reações em Mensagens

**Limites:**
- **Tipo de reação**: Apenas "love" disponível
- **Ação**: "react" ou "unreact"

```typescript
interface ReactionMessage {
  recipient: {
    id: string;
  };
  sender_action: 'react' | 'unreact';
  payload: {
    message_id: string;
    reaction?: 'love'; // Omitir para unreact
  };
}

// Exemplo para adicionar reação
const addReaction: ReactionMessage = {
  recipient: {
    id: "123456789"
  },
  sender_action: "react",
  payload: {
    message_id: "mid.1234567890",
    reaction: "love"
  }
};

// Exemplo para remover reação
const removeReaction = {
  recipient: {
    id: "123456789"
  },
  sender_action: "unreact",
  payload: {
    message_id: "mid.1234567890"
  }
};
```

### 7. Compartilhar Post do Instagram

**Limites:**
- **Requisito**: O post deve pertencer à conta profissional que está enviando
- **Tipo fixo**: "MEDIA_SHARE"

```typescript
interface MediaShareMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'MEDIA_SHARE';
      payload: {
        id: string; // ID do post
      };
    };
  };
}

// Exemplo de estrutura
const mediaShareMessage: MediaShareMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "MEDIA_SHARE",
      payload: {
        id: "17841405793087891" // ID do post do Instagram
      }
    }
  }
};
```

### 8. Quick Replies (Respostas Rápidas)
message_format: 'esse é o QUICK_REPLIES'

**Limites:**
- **Texto do prompt (campo text)**: 1000 Caracters - mesmo limite de mensagem de texto
- **Máximo de quick replies**: 13 por mensagem
- **Caracteres por botão**: 20 (truncado após este limite)
- **Suporte**: Apenas texto simples
- **Disponibilidade**: Não funciona em desktop

```typescript
interface QuickReplyMessage {
  recipient: {
    id: string;
  };
  messaging_type: 'RESPONSE';
  message: {
    text: string; // Texto do prompt - Max: 1000 bytes UTF-8
    quick_replies: Array<{
      content_type: 'text';
      title: string; // Max: 20 caracteres
      payload: string; // Dados customizados para webhook
    }>;
  };
}

// Exemplo de estrutura
const quickReplyMessage: QuickReplyMessage = {
  recipient: {
    id: "123456789"
  },
  messaging_type: "RESPONSE",
  message: {
    text: "Escolha uma opção:", // Max 1000 bytes UTF-8
    quick_replies: [
      {
        content_type: "text",
        title: "Opção 1", // Max 20 chars
        payload: "OPTION_1_SELECTED"
      },
      {
        content_type: "text",
        title: "Opção 2", // Max 20 chars
        payload: "OPTION_2_SELECTED"
      },
      {
        content_type: "text",
        title: "Opção 3", // Max 20 chars
        payload: "OPTION_3_SELECTED"
      }
    ]
  }
};
```

### 9. Template Genérico (Carrossel)
message_format: 'GENERIC_TEMPLATE'

**Limites:**
- **Máximo de elementos**: 10 por mensagem
- **Título**: 80 caracteres
- **Subtítulo**: 80 caracteres
- **Botões por elemento**: Máximo 3
- **Tipos de botão suportados**: web_url, postback
- **Disponibilidade**: Não funciona em desktop

```typescript
interface GenericTemplateMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'generic';
        elements: Array<{
          title: string; // Max: 80 caracteres
          subtitle?: string; // Max: 80 caracteres
          image_url?: string;
          default_action?: {
            type: 'web_url';
            url: string;
          };
          buttons?: Array<{
            type: 'web_url' | 'postback';
            title: string;
            url?: string; // Para web_url
            payload?: string; // Para postback
          }>;
        }>;
      };
    };
  };
}

// Exemplo de estrutura
const genericTemplateMessage: GenericTemplateMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [
          {
            title: "Produto 1", // Max 80 chars
            subtitle: "Descrição do produto", // Max 80 chars
            image_url: "https://exemplo.com/produto1.jpg",
            default_action: {
              type: "web_url",
              url: "https://exemplo.com/produto1"
            },
            buttons: [
              {
                type: "web_url",
                url: "https://exemplo.com/comprar",
                title: "Comprar Agora"
              },
              {
                type: "postback",
                title: "Mais Informações",
                payload: "INFO_PRODUTO_1"
              }
            ]
          },
          {
            title: "Produto 2",
            subtitle: "Outro produto incrível",
            image_url: "https://exemplo.com/produto2.jpg",
            buttons: [
              {
                type: "web_url",
                url: "https://exemplo.com/produto2",
                title: "Ver Detalhes"
              }
            ]
          }
        ]
      }
    }
  }
};
```

### 10. Template de Botões
message_format: 'BUTTON_TEMPLATE'

**Limites:**
- **Texto**: Máximo 640 caracteres (UTF-8)
- **Botões**: 1 a 3 botões
- **Tipos de botão**: web_url, postback

```typescript
interface ButtonTemplateMessage {
  recipient: {
    id: string;
  };
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'button';
        text: string; // Max: 640 caracteres UTF-8
        buttons: Array<{
          type: 'web_url' | 'postback';
          title: string;
          url?: string; // Para web_url
          payload?: string; // Para postback
        }>;
      };
    };
  };
}

// Exemplo de estrutura
const buttonTemplateMessage: ButtonTemplateMessage = {
  recipient: {
    id: "123456789"
  },
  message: {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: "Como podemos ajudar você hoje?", // Max 640 chars
        buttons: [
          {
            type: "web_url",
            url: "https://exemplo.com/suporte",
            title: "Visitar Suporte"
          },
          {
            type: "postback",
            title: "Falar com Atendente",
            payload: "CONTACT_SUPPORT"
          },
          {
            type: "postback",
            title: "Ver Status do Pedido",
            payload: "CHECK_ORDER_STATUS"
          }
        ]
      }
    }
  }
};
```

## 📊 Tabela Resumo de Limites

| Tipo de Conteúdo | Formato/Campo | Limite |
|-----------------|---------------|---------|
| **Texto** | UTF-8 | 1000 bytes |
| **Imagem** | PNG, JPEG, GIF | 8MB |
| **Áudio** | AAC, M4A, WAV, MP4 | 25MB |
| **Vídeo** | MP4, OGG, AVI, MOV, WEBM | 25MB |
| **Quick Replies** | Texto do prompt | 1000 bytes UTF-8 |
| **Quick Replies** | Quantidade de opções | 13 por mensagem |
| **Quick Replies** | Título de cada opção | 20 caracteres |
| **Template Genérico** | Elementos | 10 por mensagem |
| **Template Genérico** | Título | 80 caracteres |
| **Template Genérico** | Subtítulo | 80 caracteres |
| **Template Genérico** | Botões por elemento | 3 |
| **Template Botões** | Texto | 640 caracteres |
| **Template Botões** | Quantidade de botões | 1-3 |

## 🚀 Exemplo de Implementação em Next.js

```typescript
// types/instagram-messages.ts
export interface InstagramMessage {
  recipient: {
    id: string;
  };
  message?: any;
  sender_action?: 'react' | 'unreact';
  payload?: any;
  messaging_type?: 'RESPONSE';
}

// utils/instagram-message-builder.ts
export class InstagramMessageBuilder {
  private recipientId: string;
  
  constructor(recipientId: string) {
    this.recipientId = recipientId;
  }
  
  buildTextMessage(text: string): InstagramMessage {
    if (new TextEncoder().encode(text).length > 1000) {
      throw new Error('Texto excede o limite de 1000 bytes UTF-8');
    }
    
    return {
      recipient: { id: this.recipientId },
      message: { text }
    };
  }
  
  buildImageMessage(imageUrl: string): InstagramMessage {
    return {
      recipient: { id: this.recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl }
        }
      }
    };
  }
  
  buildQuickReply(
    promptText: string, 
    options: Array<{title: string; payload: string}>
  ): InstagramMessage {
    if (new TextEncoder().encode(promptText).length > 1000) {
      throw new Error('Texto do prompt excede o limite de 1000 bytes UTF-8');
    }
    
    if (options.length > 13) {
      throw new Error('Máximo de 13 quick replies permitido');
    }
    
    const quickReplies = options.map(option => {
      if (option.title.length > 20) {
        console.warn(`Título "${option.title}" será truncado para 20 caracteres`);
      }
      
      return {
        content_type: 'text' as const,
        title: option.title.substring(0, 20),
        payload: option.payload
      };
    });
    
    return {
      recipient: { id: this.recipientId },
      messaging_type: 'RESPONSE',
      message: {
        text: promptText,
        quick_replies: quickReplies
      }
    };
  }
  
  // Adicionar outros métodos para cada tipo de mensagem...
}

// Uso no componente
const messageBuilder = new InstagramMessageBuilder('123456789');
const textMsg = messageBuilder.buildTextMessage('Olá!');
const imageMsg = messageBuilder.buildImageMessage('https://exemplo.com/img.jpg');
```

## ⚠️ Considerações Importantes

1. **Janela de 24 horas**: Você só pode responder mensagens dentro de 24 horas após o usuário ter enviado uma mensagem
2. **Mensagens não solicitadas**: Não é possível enviar mensagens para usuários que não iniciaram a conversa
3. **Desktop**: Quick Replies e Templates não funcionam na versão desktop
4. **Propriedade de mídia**: Você deve ser proprietário de qualquer mídia ou post compartilhado
5. **Mensagens em grupo**: Não são suportadas
6. **Pasta Requests**: Mensagens inativas por 30+ dias não são retornadas pela API
7. **Human Agent Tag**: Permite enviar mensagens fora da janela de 24 horas quando há atendimento humano

## 📚 Recursos Adicionais

- Todas as URLs de mídia devem ser públicas e acessíveis
- O encoding UTF-8 é obrigatório para textos
- IDs devem ser Instagram-scoped IDs (IGSID) obtidos via webhook
- Para testes, os testadores devem ter role no app e na conta profissional