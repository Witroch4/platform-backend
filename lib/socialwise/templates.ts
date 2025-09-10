import { getPrismaInstance } from '@/lib/connections';
import { WhatsAppPayloadBuilder } from '@/lib/whatsapp/whatsapp-payload-builder';

function slugify(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function normalizeIntentRaw(raw: string): {
  original: string;
  plain: string; // sem prefixo @ ou intent:
  slug: string;
} {
  const original = String(raw || '').trim();
  let plain = original;
  if (plain.startsWith('intent:')) plain = plain.slice('intent:'.length).trim();
  if (plain.startsWith('@')) plain = plain.slice(1).trim();
  // Normalizar espaços internos
  plain = plain.replace(/\s+/g, ' ');
  return { original, plain, slug: slugify(plain) };
}

/**
 * Constrói o bloco de canal a partir de um intent mapeado para WhatsApp.
 * Retorna { whatsapp: {...} } ou { text: '...' } ou null.
 */
export async function buildWhatsAppByIntentRaw(intentRaw: string, inboxId: string, wamid?: string, contactContext?: { contactName?: string; contactPhone?: string }) {
  const intentName = String(intentRaw || '').trim();
  if (!intentName || !inboxId) return null;
  const prisma = getPrismaInstance();
  const norm = normalizeIntentRaw(intentName);

  // 1) Tentativas diretas por igualdade de nome
  let mapping = await prisma.mapeamentoIntencao.findFirst({
    where: {
      inbox: { inboxId },
      OR: [
        { intentName: norm.original },
        { intentName: norm.plain },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  // 2) Fallback por slug (case-insensitive)
  if (!mapping) {
    const candidates = await prisma.mapeamentoIntencao.findMany({
      where: { inbox: { inboxId } },
      include: {
        template: {
          include: {
            interactiveContent: {
              include: {
                header: true,
                body: true,
                footer: true,
                actionCtaUrl: true,
                actionReplyButton: true,
                actionList: true,
                actionFlow: true,
                actionLocationRequest: true,
              },
            },
            whatsappOfficialInfo: true,
          },
        },
      },
    });
    mapping = candidates.find((m: any) => slugify(m.intentName) === norm.slug) || null as any;
  }

  if (!mapping || !mapping.template) return null;

  const builder = new WhatsAppPayloadBuilder();
  const variablesContext = { 
    wamid,
    contactPhone: contactContext?.contactPhone,
    personName: contactContext?.contactName // personName tem prioridade no resolver
  };
  await builder.setVariablesFromInboxId(inboxId, variablesContext);

  if (mapping.template.type === 'WHATSAPP_OFFICIAL' && mapping.template.whatsappOfficialInfo) {
    const wi: any = mapping.template.whatsappOfficialInfo as any;
    const language: string = (wi && typeof wi.language === 'string') ? wi.language : 'pt_BR';
    const components: any[] = Array.isArray(wi?.components) ? wi.components : [];
    const metaTemplateId: string | undefined = typeof wi?.metaTemplateId === 'string' ? wi.metaTemplateId : undefined;
    const content = await builder.buildTemplatePayload(
      mapping.template.name || 'default',
      language,
      components,
      metaTemplateId
    );
    return { whatsapp: content };
  }

  if (mapping.template.type === 'INTERACTIVE_MESSAGE' && mapping.template.interactiveContent) {
    const interactive = await builder.buildInteractiveMessagePayload(mapping.template.interactiveContent);
    return { whatsapp: { type: 'interactive', interactive } };
  }

  if (mapping.template.type === 'AUTOMATION_REPLY' && mapping.template.simpleReplyText) {
    return { text: mapping.template.simpleReplyText };
  }

  return null;
}


/**
 * Constrói o bloco WhatsApp a partir de uma Intent global (modelo Intent → Template).
 * Busca o ChatwitInbox pelo inboxId externo e usa o userId dono para filtrar as intents.
 */
export async function buildWhatsAppByGlobalIntent(intentRaw: string, inboxId: string, wamid?: string, contactContext?: { contactName?: string; contactPhone?: string }) {
  const prisma = getPrismaInstance();
  const nameRaw = String(intentRaw || '').trim();
  if (!nameRaw || !inboxId) return null;

  // Normalizar entrada (remove '@' e 'intent:')
  const norm = normalizeIntentRaw(nameRaw);
  const slug = norm.slug;

  // Encontrar a inbox para obter o userId (appUserId)
  const inbox = await prisma.chatwitInbox.findFirst({
    where: { inboxId },
    include: { usuarioChatwit: true },
  });
  const userId = (inbox as any)?.usuarioChatwit?.appUserId as string | undefined;
  if (!userId) return null;

  // Buscar Intent do usuário pelo nome ou slug
  const intent = await prisma.intent.findFirst({
    where: {
      createdById: userId,
      isActive: true,
      OR: [
        { name: nameRaw },
        { name: norm.plain },
        { slug },
        { slug: slugify(nameRaw) },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  if (!intent || !intent.template) return null;

  const builder = new WhatsAppPayloadBuilder();
  const variablesContext = { 
    wamid,
    contactPhone: contactContext?.contactPhone,
    personName: contactContext?.contactName // personName tem prioridade no resolver
  };
  await builder.setVariablesFromInboxId(inboxId, variablesContext);

  const t = intent.template;
  if (t.type === 'WHATSAPP_OFFICIAL' && t.whatsappOfficialInfo) {
    const wi: any = t.whatsappOfficialInfo as any;
    const language: string = (wi && typeof wi.language === 'string') ? wi.language : 'pt_BR';
    const components: any[] = Array.isArray(wi?.components) ? wi.components : [];
    const metaTemplateId: string | undefined = typeof wi?.metaTemplateId === 'string' ? wi.metaTemplateId : undefined;
    const content = await builder.buildTemplatePayload(
      t.name || 'default',
      language,
      components,
      metaTemplateId
    );
    return { whatsapp: content };
  }

  if (t.type === 'INTERACTIVE_MESSAGE' && t.interactiveContent) {
    const interactive = await builder.buildInteractiveMessagePayload(t.interactiveContent);
    return { whatsapp: { type: 'interactive', interactive } };
  }

  if (t.type === 'AUTOMATION_REPLY' && t.simpleReplyText) {
    return { text: t.simpleReplyText };
  }

  return null;
}

/**
 * Instagram Template Converter - Converte templates WhatsApp para Instagram
 * Segue o padrão: GENERIC_TEMPLATE, BUTTON_TEMPLATE, QUICK_REPLIES
 */
class InstagramTemplateConverter {
  /**
   * Converte template interativo para Instagram respeitando limites
   * Recebe o payload WhatsApp já processado ou dados brutos do Prisma
   */
  static convertInteractiveToInstagram(interactiveContent: any, inboxId: string): any {
    console.log('[Instagram Converter] Entry point - received data:', JSON.stringify(interactiveContent, null, 2));
    
    // Verificar se é payload WhatsApp processado ou dados brutos do Prisma
    if (interactiveContent?.action?.buttons || interactiveContent?.type === 'button') {
      console.log('[Instagram Converter] Detected WhatsApp processed payload');
      // É payload WhatsApp processado - converter para Instagram
      return InstagramTemplateConverter.convertWhatsAppPayloadToInstagram(interactiveContent);
    } else {
      console.log('[Instagram Converter] Detected Prisma raw data');
      // São dados brutos do Prisma - processar normalmente
      return InstagramTemplateConverter.convertPrismaDataToInstagram(interactiveContent, inboxId);
    }
  }

  /**
   * Converte payload WhatsApp processado para Instagram
   */
  static convertWhatsAppPayloadToInstagram(whatsappPayload: any): any {
    console.log('[Instagram Converter] Converting WhatsApp payload to Instagram:', JSON.stringify(whatsappPayload, null, 2));
    
    const bodyText = whatsappPayload?.body?.text || '';
    const footerText = whatsappPayload?.footer?.text || '';
    const headerText = whatsappPayload?.header?.text || '';
    const hasImage = whatsappPayload?.header?.type === 'image';
    
    // Extrair URL da imagem corretamente do payload WhatsApp processado
    let imageUrl = undefined;
    if (hasImage) {
      // Formato processado: header.image.link
      imageUrl = whatsappPayload.header?.image?.link 
                || whatsappPayload.header?.content 
                || whatsappPayload.header?.image?.url;
    }
    
    console.log('[Instagram Converter] Image extraction:', { 
      hasImage, 
      imageUrl, 
      headerType: whatsappPayload?.header?.type,
      headerStructure: whatsappPayload?.header ? Object.keys(whatsappPayload.header) : 'no header'
    });
    
    // Extrair botões do payload WhatsApp
    const whatsappButtons = whatsappPayload?.action?.buttons || [];
    const instagramButtons = whatsappButtons.map((btn: any) => ({
      text: btn.reply?.title || btn.title || '',
      id: btn.reply?.id || btn.id || '',
      payload: btn.reply?.id || btn.id || '',
      // Preservar URL e tipo original do botão
      url: btn.url,
      originalType: btn.originalType || btn.type
    }));
    
    console.log('[Instagram Converter] Extracted buttons:', JSON.stringify(instagramButtons, null, 2));
    
    // Combinar header, body e footer
    let fullText = '';
    
    // Se há imagem, não incluir header text no título (a imagem já representa o header)
    if (hasImage) {
      fullText = bodyText;
    } else {
      // Sem imagem, combinar header e body se diferentes
      if (headerText && headerText !== bodyText) {
        fullText = headerText;
        if (bodyText && bodyText !== headerText) {
          fullText += `\n\n${bodyText}`;
        }
      } else {
        fullText = bodyText;
      }
    }
    
    if (footerText) {
      fullText += `\n\n${footerText}`;
    }
    
    console.log('[Instagram Converter] Full text assembled:', fullText);
    
    // Determinar tipo de template
    const templateType = InstagramTemplateConverter.determineInstagramTemplateType(fullText, hasImage, instagramButtons.length);
    console.log('[Instagram Converter] Template type determined:', templateType);
    
    let result;
    switch (templateType) {
      case 'GENERIC_TEMPLATE':
        result = InstagramTemplateConverter.buildGenericTemplate(fullText, imageUrl, instagramButtons, undefined, '');
        break;
      
      case 'BUTTON_TEMPLATE':
        result = InstagramTemplateConverter.buildButtonTemplate(fullText, imageUrl, instagramButtons, undefined, '');
        break;
      
      case 'QUICK_REPLIES':
      default:
        result = InstagramTemplateConverter.buildQuickReplies(fullText, instagramButtons, '');
        break;
    }
    
    console.log('[Instagram Converter] Final result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Converte dados brutos do Prisma para Instagram (método original)
   */
  static convertPrismaDataToInstagram(interactiveContent: any, inboxId: string): any {
    const bodyText = interactiveContent?.body?.text || '';
    const hasImage = interactiveContent?.header?.type === 'image';
    const imageUrl = hasImage ? interactiveContent.header?.content : undefined;
    const footerText = interactiveContent?.footer?.text;
    
    // Coletar botões de reply
    const replyButtons = interactiveContent?.actionReplyButton?.buttons || [];
    const ctaUrl = interactiveContent?.actionCtaUrl;
    
    // Determinar tipo de template baseado no conteúdo
    const templateType = InstagramTemplateConverter.determineInstagramTemplateType(bodyText, hasImage, replyButtons.length);
    
    switch (templateType) {
      case 'GENERIC_TEMPLATE':
        return InstagramTemplateConverter.buildGenericTemplate(bodyText, imageUrl, replyButtons, ctaUrl, footerText);
      
      case 'BUTTON_TEMPLATE':
        return InstagramTemplateConverter.buildButtonTemplate(bodyText, imageUrl, replyButtons, ctaUrl, footerText);
      
      case 'QUICK_REPLIES':
      default:
        return InstagramTemplateConverter.buildQuickReplies(bodyText, replyButtons, footerText);
    }
  }

  /**
   * Determina o tipo de template Instagram baseado no conteúdo
   */
  static determineInstagramTemplateType(
    bodyText: string, 
    hasImage: boolean, 
    buttonCount: number
  ): 'GENERIC_TEMPLATE' | 'BUTTON_TEMPLATE' | 'QUICK_REPLIES' {
    
    // GENERIC_TEMPLATE: Para carrosséis ou conteúdo rico
    if (hasImage && buttonCount > 2) {
      return 'GENERIC_TEMPLATE';
    }
    
    // BUTTON_TEMPLATE: Para botões com URLs ou até 3 botões
    if (buttonCount > 0 && buttonCount <= 3) {
      return 'BUTTON_TEMPLATE';
    }
    
    // QUICK_REPLIES: Para texto simples com opções rápidas
    return 'QUICK_REPLIES';
  }

  /**
   * Constrói GENERIC_TEMPLATE para Instagram (formato socialwiseResponse)
   */
  static buildGenericTemplate(
    bodyText: string, 
    imageUrl?: string, 
    buttons: any[] = [], 
    ctaUrl?: any,
    footerText?: string
  ): any {
    const element: any = {
      title: InstagramTemplateConverter.truncateText(bodyText, 80),
      buttons: InstagramTemplateConverter.convertButtonsForInstagram(buttons, ctaUrl).slice(0, 3)
    };
    
    // Adicionar subtitle se fornecido
    if (footerText) {
      element.subtitle = InstagramTemplateConverter.truncateText(footerText, 80);
    }
    
    // Adicionar image_url se fornecido
    if (imageUrl) {
      element.image_url = imageUrl;
      console.log('[Instagram Converter] Adding image_url to Generic Template:', imageUrl);
    }
    
    const elements = [element];

    const template = {
      template_type: 'generic',
      elements
    };

    return {
      instagram: {
        message_format: 'GENERIC_TEMPLATE',
        ...template
      }
    };
  }

  /**
   * Constrói BUTTON_TEMPLATE para Instagram (formato socialwiseResponse)
   */
  static buildButtonTemplate(
    bodyText: string, 
    imageUrl?: string, 
    buttons: any[] = [], 
    ctaUrl?: any,
    footerText?: string
  ): any {
    const fullText = footerText ? `${bodyText}\n\n${footerText}` : bodyText;
    
    const template = {
      template_type: 'button',
      text: InstagramTemplateConverter.truncateText(fullText, 640),
      buttons: InstagramTemplateConverter.convertButtonsForInstagram(buttons, ctaUrl).slice(0, 3)
    };

    return {
      instagram: {
        message_format: 'BUTTON_TEMPLATE',
        ...template
      }
    };
  }

  /**
   * Constrói QUICK_REPLIES para Instagram (formato socialwiseResponse)
   */
  static buildQuickReplies(
    bodyText: string, 
    buttons: any[] = [], 
    footerText?: string
  ): any {
    const fullText = footerText ? `${bodyText}\n\n${footerText}` : bodyText;
    
    const quickReplies = buttons.slice(0, 11).map((btn: any) => ({
      content_type: 'text',
      title: InstagramTemplateConverter.truncateText(btn.text || btn.title || '', 20),
      payload: btn.id || btn.payload || btn.text || ''
    }));

    const template = {
      text: InstagramTemplateConverter.truncateText(fullText, 2000),
      quick_replies: quickReplies.length > 0 ? quickReplies : []
    };

    return {
      instagram: {
        message_format: 'QUICK_REPLIES',
        ...template
      }
    };
  }

  /**
   * Converte botões WhatsApp para formato Instagram
   */
  static convertButtonsForInstagram(buttons: any[] = [], ctaUrl?: any): any[] {
    const instagramButtons: any[] = [];
    
    // Processar cada botão individualmente respeitando o tipo original
    buttons.slice(0, 3).forEach((btn: any) => {
      // Se o botão tem URL e é do tipo URL, criar botão web_url
      if ((btn.url || btn.originalType === 'url') && btn.url) {
        instagramButtons.push({
          type: 'web_url',
          title: InstagramTemplateConverter.truncateText(btn.text || btn.title || '', 20),
          url: btn.url
        });
      } else {
        // Caso contrário, criar botão postback
        instagramButtons.push({
          type: 'postback',
          title: InstagramTemplateConverter.truncateText(btn.text || btn.title || '', 20),
          payload: btn.id || btn.payload || btn.text || ''
        });
      }
    });
    
    // Adicionar CTA URL se disponível e ainda há espaço
    if (ctaUrl?.url && instagramButtons.length < 3) {
      instagramButtons.push({
        type: 'web_url',
        title: InstagramTemplateConverter.truncateText(ctaUrl.displayText || 'Ver mais', 20),
        url: ctaUrl.url
      });
    }
    
    return instagramButtons;
  }

  /**
   * Trunca texto respeitando limites do Instagram
   */
  static truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  }
}

/**
 * Constrói o bloco de canal Instagram a partir de um intent mapeado.
 * Retorna { instagram: {...} } ou { text: '...' } ou null.
 * EXATAMENTE O MESMO PADRÃO DO WHATSAPP mas para Instagram
 */
export async function buildInstagramByIntentRaw(intentRaw: string, inboxId: string): Promise<any> {
  const intentName = String(intentRaw || '').trim();
  if (!intentName || !inboxId) return null;
  
  const prisma = getPrismaInstance();
  const norm = normalizeIntentRaw(intentName);

  // 1) Tentativas diretas por igualdade de nome (MESMO PADRÃO DO WHATSAPP)
  let mapping = await prisma.mapeamentoIntencao.findFirst({
    where: {
      inbox: { inboxId },
      OR: [
        { intentName: norm.original },
        { intentName: norm.plain },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  // 2) Fallback por slug (case-insensitive) - MESMO PADRÃO DO WHATSAPP
  if (!mapping) {
    const candidates = await prisma.mapeamentoIntencao.findMany({
      where: { inbox: { inboxId } },
      include: {
        template: {
          include: {
            interactiveContent: {
              include: {
                header: true,
                body: true,
                footer: true,
                actionCtaUrl: true,
                actionReplyButton: true,
                actionList: true,
                actionFlow: true,
                actionLocationRequest: true,
              },
            },
            whatsappOfficialInfo: true,
          },
        },
      },
    });
    mapping = candidates.find((m: any) => slugify(m.intentName) === norm.slug) || null as any;
  }

  if (!mapping || !mapping.template) return null;

  // Aplicar variáveis do inbox (aproveitar lógica existente)
  const builder = new WhatsAppPayloadBuilder();
  builder.setChannelType('Channel::Instagram'); // Configurar como Instagram
  await builder.setVariablesFromInboxId(inboxId);

  // Processar diferentes tipos de template
  if (mapping.template.type === 'INTERACTIVE_MESSAGE' && mapping.template.interactiveContent) {
    // Aplicar variáveis no template antes da conversão (usa o método público do builder)
    const interactive = await builder.buildInteractiveMessagePayload(mapping.template.interactiveContent);
    
    // Converter para Instagram usando os 3 padrões (extrair apenas o interactive)
    return InstagramTemplateConverter.convertInteractiveToInstagram(interactive, inboxId);
  }

  if (mapping.template.type === 'AUTOMATION_REPLY' && mapping.template.simpleReplyText) {
    // Usar a lógica existente do builder para texto simples
    const textPayload = await builder.buildSimpleTextPayload(mapping.template.simpleReplyText);
    const processedText = textPayload.text?.body || mapping.template.simpleReplyText;
    
    return {
      instagram: {
        message_format: 'TEXT',
        text: InstagramTemplateConverter.truncateText(processedText, 2000)
      }
    };
  }

  if (mapping.template.type === 'WHATSAPP_OFFICIAL' && mapping.template.whatsappOfficialInfo) {
    // Para templates oficiais, converter para texto simples para Instagram
    const templateName = mapping.template.name || 'Template oficial';
    return {
      instagram: {
        message_format: 'TEXT',
        text: `📋 ${templateName}\n\nEm breve enviaremos mais detalhes sobre sua solicitação.`
      }
    };
  }

  return null;
}

/**
 * Constrói o bloco Instagram a partir de uma Intent global.
 * EXATAMENTE O MESMO PADRÃO DO WHATSAPP mas para Instagram
 */
export async function buildInstagramByGlobalIntent(intentRaw: string, inboxId: string): Promise<any> {
  const prisma = getPrismaInstance();
  const nameRaw = String(intentRaw || '').trim();
  if (!nameRaw || !inboxId) return null;

  // Normalizar entrada (remove '@' e 'intent:') - MESMO PADRÃO DO WHATSAPP
  const norm = normalizeIntentRaw(nameRaw);
  const slug = norm.slug;

  // Encontrar a inbox para obter o userId (appUserId) - MESMO PADRÃO DO WHATSAPP
  const inbox = await prisma.chatwitInbox.findFirst({
    where: { inboxId },
    include: { usuarioChatwit: true },
  });
  const userId = (inbox as any)?.usuarioChatwit?.appUserId as string | undefined;
  if (!userId) return null;

  // Buscar Intent do usuário pelo nome ou slug - MESMO PADRÃO DO WHATSAPP
  const intent = await prisma.intent.findFirst({
    where: {
      createdById: userId,
      isActive: true,
      OR: [
        { name: nameRaw },
        { name: norm.plain },
        { slug },
        { slug: slugify(nameRaw) },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  if (!intent || !intent.template) return null;

  // Aplicar variáveis do inbox
  const builder = new WhatsAppPayloadBuilder();
  builder.setChannelType('Channel::Instagram'); // Configurar como Instagram
  await builder.setVariablesFromInboxId(inboxId);

  const t = intent.template;
  
  if (t.type === 'INTERACTIVE_MESSAGE' && t.interactiveContent) {
    // Aplicar variáveis no template antes da conversão (usa o método público do builder)
    const interactive = await builder.buildInteractiveMessagePayload(t.interactiveContent);
    
    // Converter para Instagram usando os 3 padrões (extrair apenas o interactive)
    return InstagramTemplateConverter.convertInteractiveToInstagram(interactive, inboxId);
  }

  if (t.type === 'AUTOMATION_REPLY' && t.simpleReplyText) {
    // Usar a lógica existente do builder para texto simples
    const textPayload = await builder.buildSimpleTextPayload(t.simpleReplyText);
    const processedText = textPayload.text?.body || t.simpleReplyText;
    
    return {
      instagram: {
        message_format: 'TEXT',
        text: InstagramTemplateConverter.truncateText(processedText, 2000)
      }
    };
  }

  if (t.type === 'WHATSAPP_OFFICIAL' && t.whatsappOfficialInfo) {
    // Para templates oficiais, converter para texto simples para Instagram
    const templateName = t.name || 'Template oficial';
    return {
      instagram: {
        message_format: 'TEXT',
        text: `📋 ${templateName}\n\nEm breve enviaremos mais detalhes sobre sua solicitação.`
      }
    };
  }

  return null;
}

/**
 * Constrói o bloco Facebook Page a partir de uma Intent específica do inbox.
 * EXATAMENTE O MESMO PADRÃO DO INSTAGRAM - Facebook Page segue as mesmas regras
 */
export async function buildFacebookPageByIntentRaw(intentRaw: string, inboxId: string): Promise<any> {
  const intentName = String(intentRaw || '').trim();
  if (!intentName || !inboxId) return null;
  
  const prisma = getPrismaInstance();
  const norm = normalizeIntentRaw(intentName);

  // 1) Tentativas diretas por igualdade de nome (MESMO PADRÃO DO INSTAGRAM)
  let mapping = await prisma.mapeamentoIntencao.findFirst({
    where: {
      inbox: { inboxId },
      OR: [
        { intentName: norm.original },
        { intentName: norm.plain },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  // 2) Fallback por slug (case-insensitive) - MESMO PADRÃO DO INSTAGRAM
  if (!mapping) {
    const candidates = await prisma.mapeamentoIntencao.findMany({
      where: { inbox: { inboxId } },
      include: {
        template: {
          include: {
            interactiveContent: {
              include: {
                header: true,
                body: true,
                footer: true,
                actionCtaUrl: true,
                actionReplyButton: true,
                actionList: true,
                actionFlow: true,
                actionLocationRequest: true,
              },
            },
            whatsappOfficialInfo: true,
          },
        },
      },
    });
    mapping = candidates.find((m: any) => slugify(m.intentName) === norm.slug) || null as any;
  }

  if (!mapping || !mapping.template) return null;

  // Aplicar variáveis do inbox (configurar como Facebook Page)
  const builder = new WhatsAppPayloadBuilder();
  builder.setChannelType('Channel::FacebookPage'); // Configurar como Facebook Page
  await builder.setVariablesFromInboxId(inboxId);

  // Processar diferentes tipos de template (MESMA LÓGICA DO INSTAGRAM)
  if (mapping.template.type === 'INTERACTIVE_MESSAGE' && mapping.template.interactiveContent) {
    // Aplicar variáveis no template antes da conversão
    const interactive = await builder.buildInteractiveMessagePayload(mapping.template.interactiveContent);
    
    // Converter para Facebook Page usando os MESMOS 3 padrões do Instagram
    return InstagramTemplateConverter.convertInteractiveToInstagram(interactive, inboxId);
  }

  if (mapping.template.type === 'WHATSAPP_OFFICIAL' && mapping.template.whatsappOfficialInfo) {
    // Para templates oficiais, converter para texto simples
    const templateName = mapping.template.name || 'Template oficial';
    return {
      facebook: {
        message_format: 'TEXT',
        text: `📋 ${templateName}\n\nEm breve enviaremos mais detalhes sobre sua solicitação.`
      }
    };
  }

  return null;
}

/**
 * Constrói o bloco Facebook Page a partir de uma Intent global.
 * EXATAMENTE O MESMO PADRÃO DO INSTAGRAM - Facebook Page segue as mesmas regras
 */
export async function buildFacebookPageByGlobalIntent(intentRaw: string, inboxId: string): Promise<any> {
  const prisma = getPrismaInstance();
  const nameRaw = String(intentRaw || '').trim();
  if (!nameRaw || !inboxId) return null;

  // Normalizar entrada (remove '@' e 'intent:') - MESMO PADRÃO DO INSTAGRAM
  const norm = normalizeIntentRaw(nameRaw);

  // Encontrar a inbox para obter o userId (appUserId) - MESMO PADRÃO DO INSTAGRAM
  const inbox = await prisma.chatwitInbox.findFirst({
    where: { inboxId },
    include: { usuarioChatwit: true },
  });
  const userId = (inbox as any)?.usuarioChatwit?.appUserId as string | undefined;
  if (!userId) return null;

  // Buscar Intent do usuário pelo nome - MESMO PADRÃO DO INSTAGRAM
  const intent = await prisma.intent.findFirst({
    where: {
      createdById: userId,
      isActive: true,
      OR: [
        { name: norm.original },
        { name: norm.plain },
      ],
    },
    include: {
      template: {
        include: {
          interactiveContent: {
            include: {
              header: true,
              body: true,
              footer: true,
              actionCtaUrl: true,
              actionReplyButton: true,
              actionList: true,
              actionFlow: true,
              actionLocationRequest: true,
            },
          },
          whatsappOfficialInfo: true,
        },
      },
    },
  });

  if (!intent || !intent.template) return null;

  // Aplicar variáveis do inbox (configurar como Facebook Page)
  const builder = new WhatsAppPayloadBuilder();
  builder.setChannelType('Channel::FacebookPage'); // Configurar como Facebook Page
  await builder.setVariablesFromInboxId(inboxId);

  const t = intent.template;
  
  if (t.type === 'INTERACTIVE_MESSAGE' && t.interactiveContent) {
    // Aplicar variáveis no template antes da conversão
    const interactive = await builder.buildInteractiveMessagePayload(t.interactiveContent);
    
    // Converter para Facebook Page usando os MESMOS 3 padrões do Instagram
    return InstagramTemplateConverter.convertInteractiveToInstagram(interactive, inboxId);
  }

  if (t.type === 'WHATSAPP_OFFICIAL' && t.whatsappOfficialInfo) {
    // Para templates oficiais, converter para texto simples
    const templateName = t.name || 'Template oficial';
    return {
      facebook: {
        message_format: 'TEXT',
        text: `📋 ${templateName}\n\nEm breve enviaremos mais detalhes sobre sua solicitação.`
      }
    };
  }

  return null;
}


