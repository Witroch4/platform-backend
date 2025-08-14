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
export async function buildWhatsAppByIntentRaw(intentRaw: string, inboxId: string, wamid?: string) {
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
  await builder.setVariablesFromInboxId(inboxId, { wamid });

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
export async function buildWhatsAppByGlobalIntent(intentRaw: string, inboxId: string, wamid?: string) {
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
  await builder.setVariablesFromInboxId(inboxId, { wamid });

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


