import type { InteractiveButton, CentralButtonReaction, LocalButtonReaction } from "./types";

// Conversion helpers between backend-stored buttons and UI InteractiveButton
export const convertBackendToInteractive = (button: any): InteractiveButton => {
  const detectedType = (button?.type as any) || (button?.reply ? 'reply' : 'reply');
  const id = button?.id || button?.reply?.id || `btn_${Math.random().toString(36).slice(2, 11)}`;
  const title = button?.title || button?.reply?.title || button?.text || '';
  if (detectedType === 'url') {
    return { id, text: title, type: 'url', url: button?.url };
  }
  if (detectedType === 'phone_number') {
    return { id, text: title, type: 'phone_number', phone_number: button?.phone_number };
  }
  return { id, text: title, type: 'reply' };
};

export const convertInteractiveToBackend = (button: InteractiveButton): any => {
  if (button.type === 'url') {
    return {
      id: button.id,
      type: 'url',
      title: button.text,
      url: button.url || '',
    };
  }
  if (button.type === 'phone_number') {
    return {
      id: button.id,
      type: 'phone_number',
      title: button.text,
      phone_number: button.phone_number || '',
    };
  }
  // reply default
  return {
    id: button.id,
    title: button.text,
    payload: button.id,
    type: 'reply',
    reply: {
      id: button.id,
      title: button.text,
    },
  };
};

// Conversion functions for ButtonReaction types
export const convertCentralToLocal = (
  reaction: CentralButtonReaction
): LocalButtonReaction => {
  // Preferir valores reais quando vierem do backend
  const value = reaction.type === 'emoji' 
    ? (reaction.emoji || (reaction as any).emoji || '') 
    : (reaction.textResponse || (reaction as any).textReaction || '');
  return {
    buttonId: reaction.buttonId,
    reaction:
      reaction.type === 'emoji' || reaction.type === 'text'
        ? {
            type: reaction.type,
            value: value,
          }
        : undefined,
  };
};

// Helper function to generate prefixed IDs
export const generatePrefixedId = (channelType: string | null, fallbackSuffix: string): string => {
  const prefix = channelType === 'Channel::Instagram' ? 'ig_' : '';
  return `${prefix}btn_${fallbackSuffix}`;
};

// Helper function to resolve variables in text
export const resolveVariables = (text: string, variables: Array<{ chave: string; valor: string; }>): string => {
  if (!text || !variables.length) return text;
  
  let resolvedText = text;
  variables.forEach(variable => {
    const regex = new RegExp(`\\{\\{${variable.chave}\\}\\}`, 'g');
    resolvedText = resolvedText.replace(regex, variable.valor);
  });
  
  return resolvedText;
};

// Instagram template type determination
export const getInstagramTemplateType = (bodyText: string, hasImage: boolean, validationLimits: any) => {
  const bodyLength = bodyText.length;

  if (bodyLength > 640) {
    const isOverQuickRepliesLimit =
      bodyLength > validationLimits.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH;
    return {
      type: "quick_replies",
      reason: `Quick Replies (${bodyLength} chars > 640)${isOverQuickRepliesLimit ? " - EXCEDE LIMITE INSTAGRAM" : ""}`,
      isOverLimit: isOverQuickRepliesLimit,
    };
  } else if (bodyLength <= 80) {
    return {
      type: "generic",
      reason: `Generic Template (${bodyLength} chars ≤ 80)`,
    };
  } else {
    return {
      type: "button",
      reason: `Button Template (${bodyLength} chars: 81-640)`,
    };
  }
};
