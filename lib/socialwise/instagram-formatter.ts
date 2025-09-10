/**
 * Instagram Quick Replies formatting for SocialWise Flow
 * Limits + whitelist + dedupe (por payload) + graceful degradation
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

export interface InstagramQuickReplyItem {
  content_type: 'text';
  title: string; // ≤ 20 chars (no word limit enforcement)
  payload: string; // @slug or empty (≤1000)
}

export interface InstagramQuickRepliesMessage {
  message_format: 'QUICK_REPLIES';
  text: string; // ≤ 1000 chars
  quick_replies: InstagramQuickReplyItem[]; // 1–13 items
}

export interface InstagramTextMessage {
  message: { text: string }; // texto simples no limite do Instagram (640)
}

export type InstagramMessage = InstagramQuickRepliesMessage | InstagramTextMessage;

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

  // Quick Replies allow up to 13
  const limitedButtons = buttons.slice(0, 13);

  try {
    const clampedText = clampBody(text, 'instagram'); // now 1000
    if (!clampedText) throw new Error('Text is empty after clamping');

    const processed: InstagramQuickReplyItem[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < limitedButtons.length; i++) {
      const b = limitedButtons[i];
      // For Quick Replies, enforce 20 chars but do not restrict word count
      const title = clampTitle(b.title, 20, 99);
      const payload = clampPayload(b.payload, 'instagram');  // ≤1000

      const formatOk = validatePayloadFormat(payload);       // ^@[a-z0-9_]+$
      const whiteOk  = !allowedPayloads || allowedPayloads.includes(payload);
      // dedupe por ID (payload) – identificador relevante no Instagram
      const dedupKey = payload;

      if (!title || !formatOk || !whiteOk || seen.has(dedupKey)) {
        if (dropInvalidInsteadOfFallback) continue;
        if (enableFallback) return buildInstagramTextFallback(text, buttons);
        throw new Error(`Invalid button at index ${i}`);
      }

      seen.add(dedupKey);
      processed.push({ content_type: 'text', title, payload });
    }

    if (processed.length === 0) {
      if (enableFallback) return buildInstagramTextFallback(text, buttons);
      throw new Error('No valid buttons left after filtering');
    }

    return {
      message_format: 'QUICK_REPLIES',
      text: clampedText,
      quick_replies: processed,
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
  if ('message_format' in message) {
    // Validação para QUICK_REPLIES
    if (!message.text) v.push('Template text required');
    else if (message.text.length > 1000) v.push(`Template text > 1000 (${message.text.length})`);
    if (!('quick_replies' in message) || !Array.isArray((message as any).quick_replies)) v.push('Quick replies required');
    else {
      const list = (message as any).quick_replies as InstagramQuickReplyItem[];
      if (list.length > 13) v.push(`Too many quick replies: ${list.length}`);
      list.forEach((b: any, i: number) => {
        if (!b.title) v.push(`Quick reply ${i+1} title required`);
        else if (b.title.length > 20) v.push(`Quick reply ${i+1} title > 20`);
        if (!b.payload) v.push(`Quick reply ${i+1} payload required`);
        else if (b.payload.length > 1000) v.push(`Quick reply ${i+1} payload > 1000`);
        else if (!validatePayloadFormat(b.payload)) v.push(`Quick reply ${i+1} payload invalid`);
        if (b.content_type !== 'text') v.push(`Quick reply ${i+1} content_type must be 'text'`);
      });
    }
  } else if ('message' in message && 'text' in (message as any).message) {
    const textMsg = message as InstagramTextMessage;
    if (!textMsg.message.text) v.push('Text body required');
    else if (textMsg.message.text.length > 1000) v.push(`Text > 1000`);
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
