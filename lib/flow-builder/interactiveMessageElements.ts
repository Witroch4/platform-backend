import type {
  InteractiveMessageElement,
  InteractiveMessageElementType,
  InteractiveMessageNodeData,
} from '@/types/flow-builder';

/**
 * Prefixo para botões do Flow Builder.
 * Usado para identificar botões que fazem parte de um flow visual
 * e devem ser processados pelo FlowOrchestrator em vez do button-processor legado.
 */
export const FLOW_BUTTON_PREFIX = 'flow_';

function safeId(prefix: string) {
  // Botões do Flow Builder recebem prefixo 'flow_' para priorização no webhook
  const finalPrefix = prefix === 'button' ? `${FLOW_BUTTON_PREFIX}${prefix}` : prefix;
  return `${finalPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createInteractiveMessageElement(
  type: InteractiveMessageElementType
): InteractiveMessageElement {
  switch (type) {
    case 'header_text':
      return { id: safeId('header_text'), type: 'header_text', text: '' };
    case 'header_image':
      return { id: safeId('header_image'), type: 'header_image', url: '', caption: '' };
    case 'body':
      return { id: safeId('body'), type: 'body', text: '' };
    case 'footer':
      return { id: safeId('footer'), type: 'footer', text: '' };
    case 'button':
      return { id: safeId('button'), type: 'button', title: 'Novo botão', description: '' };
  }
}

export function elementsToLegacyFields(elements: InteractiveMessageElement[]): {
  header?: string;
  body?: string;
  footer?: string;
  buttons?: Array<{ id: string; title: string; description?: string }>;
} {
  const header = elements.find((e) => e.type === 'header_text');
  const body = elements.find((e) => e.type === 'body');
  const footer = elements.find((e) => e.type === 'footer');
  const buttons = elements
    .filter((e) => e.type === 'button')
    .map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description || undefined,
    }));

  return {
    header: header && 'text' in header ? header.text || undefined : undefined,
    body: body && 'text' in body ? body.text || undefined : undefined,
    footer: footer && 'text' in footer ? footer.text || undefined : undefined,
    buttons: buttons.length ? buttons : undefined,
  };
}

export function getInteractiveMessageElements(
  data: InteractiveMessageNodeData
): InteractiveMessageElement[] {
  if (Array.isArray(data.elements) && data.elements.length > 0) return data.elements;

  // 1) From linked message
  if (data.message) {
    const elements: InteractiveMessageElement[] = [];

    const headerText = (data.message.header as { text?: string } | undefined)?.text;
    const bodyText = (data.message.body as { text?: string } | undefined)?.text;
    const footerText = (data.message.footer as { text?: string } | undefined)?.text;

    if (headerText) elements.push({ id: safeId('header_text'), type: 'header_text', text: headerText });
    if (bodyText) elements.push({ id: safeId('body'), type: 'body', text: bodyText });
    if (footerText) elements.push({ id: safeId('footer'), type: 'footer', text: footerText });

    const action = data.message.action as
      | {
          buttons?: Array<{ id: string; title: string; description?: string }>;
          sections?: Array<{ rows?: Array<{ id: string; title: string; description?: string }> }>;
        }
      | undefined;

    const buttonLike =
      action?.buttons?.length
        ? action.buttons
        : action?.sections?.length
          ? action.sections.flatMap((s) => s.rows ?? [])
          : [];

    for (const btn of buttonLike) {
      elements.push({
        id: btn.id || safeId('button'),
        type: 'button',
        title: btn.title,
        description: btn.description,
      });
    }

    return elements;
  }

  // 2) From legacy inline fields
  const legacyElements: InteractiveMessageElement[] = [];
  if (data.header) legacyElements.push({ id: safeId('header_text'), type: 'header_text', text: data.header });
  if (data.body) legacyElements.push({ id: safeId('body'), type: 'body', text: data.body });
  if (data.footer) legacyElements.push({ id: safeId('footer'), type: 'footer', text: data.footer });
  for (const b of data.buttons ?? []) {
    legacyElements.push({
      id: b.id || safeId('button'),
      type: 'button',
      title: b.title,
      description: b.description,
    });
  }

  return legacyElements;
}

export function getInteractiveMessageButtonElements(
  elements: InteractiveMessageElement[]
) {
  return elements.filter((e) => e.type === 'button');
}

export function hasConfiguredBody(elements: InteractiveMessageElement[]): boolean {
  const body = elements.find((e) => e.type === 'body');
  return !!(body && 'text' in body && body.text.trim().length > 0);
}
