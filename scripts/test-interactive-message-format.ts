#!/usr/bin/env tsx

/**
 * Script para testar o formato da mensagem interativa
 */

// Simular o formato que vem do banco de dados
const internalFormat = {
  templateId: "cme04lfo1002wpd0kz9qfzh4m",
  bodyId: "cme04lfo2002ypd0k8ds4tnqh",
  createdAt: "2025-08-06T15:31:21.362Z",
  updatedAt: "2025-08-06T15:31:21.362Z",
  header: null,
  body: {
    id: "cme04lfo2002ypd0k8ds4tnqh",
    text: "ewewewewewwewewewew"
  },
  footer: {
    id: "cme04lfo2002zpd0kijmr59w9",
    text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™2",
    interactiveContentId: "cme04lfo2002xpd0kl8vjs2ks"
  },
  actionCtaUrl: null,
  actionReplyButton: {
    id: "cme04lfo20030pd0kyayq4jgn",
    buttons: [
      {
        id: "btn_1754494266102_q1dzj5xdy",
        type: "reply",
        reply: {
          id: "btn_1754494266102_q1dzj5xdy",
          title: "wewewewewewewewewe"
        },
        title: "wewewewewewewewewe",
        payload: "btn_1754494266102_q1dzj5xdy"
      }
    ],
    interactiveContentId: "cme04lfo2002xpd0kl8vjs2ks"
  },
  actionList: null,
  actionFlow: null,
  actionLocationRequest: null
};

// Formato esperado pela API da Meta
const expectedWhatsAppFormat = {
  type: "button",
  body: {
    text: "ewewewewewwewewewew"
  },
  footer: {
    text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™2"
  },
  action: {
    buttons: [
      {
        type: "reply",
        reply: {
          id: "btn_1754494266102_q1dzj5xdy",
          title: "wewewewewewewewewe"
        }
      }
    ]
  }
};

function convertToWhatsAppInteractiveFormat(data: any): any {
  const whatsappFormat: any = {
    type: "button", // Default to button type
  };

  // Convert body
  if (data.body?.text) {
    whatsappFormat.body = {
      text: data.body.text
    };
  }

  // Convert header
  if (data.header) {
    if (data.header.type === 'text' && data.header.content) {
      whatsappFormat.header = {
        type: "text",
        text: data.header.content
      };
    } else if (data.header.type === 'image' && data.header.content) {
      whatsappFormat.header = {
        type: "image",
        image: {
          link: data.header.content
        }
      };
    }
  }

  // Convert footer
  if (data.footer?.text) {
    whatsappFormat.footer = {
      text: data.footer.text
    };
  }

  // Convert action buttons
  if (data.actionReplyButton?.buttons && Array.isArray(data.actionReplyButton.buttons)) {
    whatsappFormat.action = {
      buttons: data.actionReplyButton.buttons.map((button: any) => ({
        type: "reply",
        reply: {
          id: button.reply?.id || button.id || `btn_${Date.now()}`,
          title: button.reply?.title || button.title || "Button"
        }
      }))
    };
  }

  // Convert action list (for list messages)
  if (data.actionList?.sections && Array.isArray(data.actionList.sections)) {
    whatsappFormat.type = "list";
    whatsappFormat.action = {
      button: data.actionList.button || "Ver opções",
      sections: data.actionList.sections.map((section: any) => ({
        title: section.title || "",
        rows: section.rows?.map((row: any) => ({
          id: row.id || `row_${Date.now()}`,
          title: row.title || "Option",
          description: row.description || ""
        })) || []
      }))
    };
  }

  return whatsappFormat;
}

function sanitizeInteractiveMessage(data: any): void {
  // Remove internal database fields that shouldn't be sent to WhatsApp API
  const invalidFields = [
    'templateId', 'bodyId', 'createdAt', 'updatedAt', 'id',
    'interactiveContentId', 'actionCtaUrl', 'actionReplyButton', 
    'actionList', 'actionFlow', 'actionLocationRequest'
  ];

  invalidFields.forEach(field => {
    if (data[field]) {
      console.warn(`Removing invalid field '${field}' from interactive message`);
      delete data[field];
    }
  });
}

console.log('🔍 Testando conversão de formato de mensagem interativa...\n');

console.log('📥 Formato interno (do banco de dados):');
console.log(JSON.stringify(internalFormat, null, 2));

console.log('\n🔄 Convertendo para formato da API da Meta...');
const converted = convertToWhatsAppInteractiveFormat(internalFormat);

console.log('\n📤 Formato convertido:');
console.log(JSON.stringify(converted, null, 2));

console.log('\n🧹 Sanitizando...');
sanitizeInteractiveMessage(converted);

console.log('\n✅ Formato final (sanitizado):');
console.log(JSON.stringify(converted, null, 2));

console.log('\n📋 Formato esperado pela API da Meta:');
console.log(JSON.stringify(expectedWhatsAppFormat, null, 2));

console.log('\n🎯 Comparação:');
console.log('- Tipo:', converted.type === expectedWhatsAppFormat.type ? '✅' : '❌');
console.log('- Body:', JSON.stringify(converted.body) === JSON.stringify(expectedWhatsAppFormat.body) ? '✅' : '❌');
console.log('- Footer:', JSON.stringify(converted.footer) === JSON.stringify(expectedWhatsAppFormat.footer) ? '✅' : '❌');
console.log('- Action:', JSON.stringify(converted.action) === JSON.stringify(expectedWhatsAppFormat.action) ? '✅' : '❌');

console.log('\n🎉 Teste concluído!');