/**
 * Instagram button template formatting for SocialWise Flow
 * Limits + whitelist + dedupe (por payload) + 4-word titles + graceful degradation
 * (+) Valida 4 palavras também no validate
 * (+) Helpers: createInstagramButtonOptions / buildSimpleInstagramMessage
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

export interface InstagramButtonTemplate {
  message: {
    attachment: {
      type: 'template';
      payload: {
        template_type: 'button';
        text: string; // ≤ 640 chars
        buttons: Array<{ type: 'postback'; title: string; payload: string }>;
      };
    };
  };
}

export interface InstagramTextMessage {
  message: { text: string }; // texto simples no limite do Instagram (640)
}

export type InstagramMessage = InstagramButtonTemplate | InstagramTextMessage;

export interface InstagramButtonOptions {
  title: string;
  payload: string;
}

export function buildInstagramButtons(
  text: string,
  buttons: InstagramButtonOptions[],
  options: {
    enableFallback?: boolean;
    allowedPayloads?: string[];
    dropInvalidInsteadOfFallback?: boolean; // default true
  } = {}
): InstagramMessage {
  const {
    enableFallback = true,
    allowedPayloads,
    dropInvalidInsteadOfFallback = true,
  } = options;

  if (!text || !Array.isArray(buttons) || buttons.length === 0) {
    throw new Error('Text and buttons array are required');
  }

  const limitedButtons = buttons.slice(0, 3);

  try {
    const clampedText = clampBody(text, 'instagram'); // 640
    if (!clampedText) throw new Error('Text is empty after clamping');

    const processed: Array<{ type: 'postback'; title: string; payload: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < limitedButtons.length; i++) {
      const b = limitedButtons[i];
      const title = clampTitle(b.title);                     // ≤20
      const payload = clampPayload(b.payload, 'instagram');  // ≤1000

      const formatOk = validatePayloadFormat(payload);       // ^@[a-z0-9_]+$
      const whiteOk  = !allowedPayloads || allowedPayloads.includes(payload);
      const wordsOk  = withinWordLimit(title, 4);

      // dedupe por ID (payload) – identificador relevante no Instagram
      const dedupKey = payload;

      if (!title || !formatOk || !whiteOk || !wordsOk || seen.has(dedupKey)) {
        if (dropInvalidInsteadOfFallback) continue;
        if (enableFallback) return buildInstagramTextFallback(text, buttons);
        throw new Error(`Invalid button at index ${i}`);
      }

      seen.add(dedupKey);
      processed.push({ type: 'postback', title, payload });
    }

    if (processed.length === 0) {
      if (enableFallback) return buildInstagramTextFallback(text, buttons);
      throw new Error('No valid buttons left after filtering');
    }

    return {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: clampedText,
            buttons: processed,
          },
        },
      },
    };
  } catch (err) {
    if (enableFallback) return buildInstagramTextFallback(text, buttons);
    throw err;
  }
}

export function buildInstagramTextFallback(
  text: string,
  buttons: InstagramButtonOptions[]
): InstagramTextMessage {
  let msg = clampBody(text, 'instagram'); // 640
  if (buttons.length > 0) {
    msg += '\n\nEscolha uma opção:\n';
    buttons.slice(0, 9).forEach((b, i) => {
      const t = clampTitle(b.title, 50);
      if (t) msg += `${i + 1}. ${t}\n`;
    });
  }
  // clamp final (mantém ≤640)
  msg = clampBody(msg, 'instagram');
  return { message: { text: msg } };
}

export function validateInstagramMessage(message: InstagramMessage): {
  isValid: boolean; violations: string[];
} {
  const v: string[] = [];
  if ('attachment' in message.message) {
    const tpl = message.message.attachment.payload;
    if (!tpl.text) v.push('Template text required');
    else if (tpl.text.length > 640) v.push(`Template text > 640 (${tpl.text.length})`);
    if (!tpl.buttons || !Array.isArray(tpl.buttons)) v.push('Buttons required');
    else {
      if (tpl.buttons.length > 3) v.push(`Too many buttons: ${tpl.buttons.length}`);
      tpl.buttons.forEach((b, i) => {
        if (!b.title) v.push(`Button ${i+1} title required`);
        else if (b.title.length > 20) v.push(`Button ${i+1} title > 20`);
        else if (b.title.trim().split(/\s+/).length > 4) v.push(`Button ${i+1} title > 4 words`);
        if (!b.payload) v.push(`Button ${i+1} payload required`);
        else if (b.payload.length > 1000) v.push(`Button ${i+1} payload > 1000`);
        else if (!validatePayloadFormat(b.payload)) v.push(`Button ${i+1} payload invalid`);
        if (b.type !== 'postback') v.push(`Button ${i+1} type must be 'postback'`);
      });
    }
    if (message.message.attachment.payload.template_type !== 'button') {
      v.push('Template type must be "button"');
    }
  } else if ('text' in message.message) {
    if (!message.message.text) v.push('Text body required');
    else if (message.message.text.length > 640) v.push(`Text > 640`);
  } else v.push('Unknown message format');
  return { isValid: v.length === 0, violations: v };
}

/** Helpers (conveniência) */
export function createInstagramButtonOptions(
  buttons: Array<{ title: string; intent: string }>
): InstagramButtonOptions[] {
  return buttons.map(b => ({
    title: b.title,
    payload: b.intent.startsWith('@') ? b.intent : `@${b.intent}`,
  }));
}

export function buildSimpleInstagramMessage(
  text: string,
  buttonData: Array<{ title: string; intent: string }>
): InstagramMessage {
  const buttons = createInstagramButtonOptions(buttonData);
  return buildInstagramButtons(text, buttons);
}
