/**
 * WhatsApp interactive message formatting for SocialWise Flow
 * Limits + whitelist + dedupe + 4-word titles + graceful degradation
 * (+) Preserva header/footer no fallback
 * (+) Dedupe por payload (reply.id)
 * (+) Valida 4 palavras também no validate
 * (+) Helpers: createButtonOptions / buildSimpleInteractiveMessage
 */

import {
  clampTitle,
  clampBody,
  clampPayload,
  validatePayloadFormat,
} from './clamps';

function withinWordLimit(title: string, maxWords = 4): boolean {
  return (title.trim().split(/\s+/).length) <= maxWords;
}

export interface WhatsAppInteractiveMessage {
  type: 'interactive';
  interactive: {
    type: 'button';
    body: { text: string }; // ≤ 1024 chars
    header?: { type: 'text'; text: string };
    footer?: { text: string };
    action: { buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }> };
  };
}

export interface WhatsAppTextMessage {
  type: 'text';
  text: { body: string }; // WhatsApp permite 4096; clampamos a 1024 por consistência UX
}

export type WhatsAppMessage = WhatsAppInteractiveMessage | WhatsAppTextMessage;

export interface WhatsAppButtonOptions {
  title: string;
  payload: string;
}

export function buildButtons(
  body: string,
  buttons: WhatsAppButtonOptions[],
  options: {
    header?: string;
    footer?: string;
    enableFallback?: boolean;
    allowedPayloads?: string[];
    dropInvalidInsteadOfFallback?: boolean; // default true
  } = {}
): WhatsAppMessage {
  const {
    header,
    footer,
    enableFallback = true,
    allowedPayloads,
    dropInvalidInsteadOfFallback = true,
  } = options;

  if (!body || !Array.isArray(buttons) || buttons.length === 0) {
    throw new Error('Body text and buttons array are required');
  }

  const limitedButtons = buttons.slice(0, 3);

  try {
    const clampedBody = clampBody(body, 'whatsapp'); // 1024
    if (!clampedBody) throw new Error('Body text is empty after clamping');

    const processed: Array<{ type: 'reply'; reply: { id: string; title: string } }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < limitedButtons.length; i++) {
      const b = limitedButtons[i];
      const title = clampTitle(b.title);                   // ≤20
      const payload = clampPayload(b.payload, 'whatsapp'); // ≤256

      const formatOk = validatePayloadFormat(payload);     // ^@[a-z0-9_]+$
      const whiteOk  = !allowedPayloads || allowedPayloads.includes(payload);
      const wordsOk  = withinWordLimit(title, 4);

      // dedupe por ID (payload) – identificador relevante no WhatsApp
      const dedupKey = payload;

      if (!title || !formatOk || !whiteOk || !wordsOk || seen.has(dedupKey)) {
        if (dropInvalidInsteadOfFallback) continue;
        if (enableFallback) return buildNumberedTextFallback(body, buttons, { header, footer });
        throw new Error(`Invalid button at index ${i}`);
      }

      seen.add(dedupKey);
      processed.push({ type: 'reply', reply: { id: payload, title } });
    }

    if (processed.length === 0) {
      if (enableFallback) return buildNumberedTextFallback(body, buttons, { header, footer });
      throw new Error('No valid buttons left after filtering');
    }

    const interactive: WhatsAppInteractiveMessage['interactive'] = {
      type: 'button',
      body: { text: clampedBody },
      action: { buttons: processed },
    };

    if (header) {
      const h = clampTitle(header, 60);
      if (h) interactive.header = { type: 'text', text: h };
    }
    if (footer) {
      const f = clampTitle(footer, 60);
      if (f) interactive.footer = { text: f };
    }

    return { type: 'interactive', interactive };
  } catch (err) {
    if (enableFallback) return buildNumberedTextFallback(body, buttons, { header, footer });
    throw err;
  }
}

export function buildNumberedTextFallback(
  body: string,
  buttons: WhatsAppButtonOptions[],
  options: { header?: string; footer?: string } = {}
): WhatsAppTextMessage {
  const { header, footer } = options;
  let text = '';

  if (header) {
    const h = clampTitle(header, 60);
    if (h) text += `*${h}*\n\n`;
  }

  text += clampBody(body, 'whatsapp'); // 1024

  if (buttons.length > 0) {
    text += '\n\nEscolha uma opção:\n';
    buttons.slice(0, 9).forEach((b, i) => {
      const t = clampTitle(b.title, 50);
      if (t) text += `${i + 1}. ${t}\n`;
    });
  }

  if (footer) {
    const f = clampTitle(footer, 60);
    if (f) text += `\n_${f}_`;
  }

  const finalText = clampBody(text, 'whatsapp'); // garante ≤1024
  return { type: 'text', text: { body: finalText } };
}

export function validateWhatsAppMessage(message: WhatsAppMessage): {
  isValid: boolean; violations: string[];
} {
  const v: string[] = [];
  if (message.type === 'interactive') {
    const it = message.interactive;
    if (!it.body?.text) v.push('Interactive message body text is required');
    else if (it.body.text.length > 1024) v.push(`Body > 1024 (${it.body.text.length})`);
    if (!it.action?.buttons || !Array.isArray(it.action.buttons)) v.push('Buttons required');
    else {
      const bs = it.action.buttons;
      if (bs.length > 3) v.push(`Too many buttons: ${bs.length}`);
      bs.forEach((b, i) => {
        if (!b.reply?.title) v.push(`Button ${i+1} title required`);
        else if (b.reply.title.length > 20) v.push(`Button ${i+1} title > 20`);
        else if (b.reply.title.trim().split(/\s+/).length > 4) v.push(`Button ${i+1} title > 4 words`);
        if (!b.reply?.id) v.push(`Button ${i+1} id required`);
        else if (b.reply.id.length > 256) v.push(`Button ${i+1} id > 256`);
        else if (!validatePayloadFormat(b.reply.id)) v.push(`Button ${i+1} id invalid`);
      });
    }
    if (it.header?.text && it.header.text.length > 60) v.push('Header > 60');
    if (it.footer?.text && it.footer.text.length > 60) v.push('Footer > 60');
  } else if (message.type === 'text') {
    if (!message.text?.body) v.push('Text body required');
    else if (message.text.body.length > 4096) v.push(`Text > 4096`);
  } else v.push('Unknown message type');

  return { isValid: v.length === 0, violations: v };
}

/** Helpers (conveniência) */
export function createButtonOptions(
  buttons: Array<{ title: string; intent: string }>
): WhatsAppButtonOptions[] {
  return buttons.map(b => ({
    title: b.title,
    payload: b.intent.startsWith('@') ? b.intent : `@${b.intent}`,
  }));
}

export function buildSimpleInteractiveMessage(
  body: string,
  buttonData: Array<{ title: string; intent: string }>,
  header?: string,
  footer?: string
): WhatsAppMessage {
  const buttons = createButtonOptions(buttonData);
  return buildButtons(body, buttons, { header, footer });
}
