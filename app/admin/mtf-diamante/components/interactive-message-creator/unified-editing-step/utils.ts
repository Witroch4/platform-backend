import type { InteractiveButton, CentralButtonReaction, LocalButtonReaction } from "./types";
import { MESSAGE_LIMITS, type InstagramTemplateTypeResult } from "@/types/interactive-messages";

// ✅ FIX: Função robusta para gerar IDs únicos combinando timestamp + counter + random + performance
let idCounter = 0;
const generateUniqueButtonId = (): string => {
  const timestamp = Date.now();
  const counter = (++idCounter) % 10000; // Aumentar limite para 10000
  const random = Math.random().toString(36).slice(2, 10); // 8 caracteres aleatórios ao invés de 6
  const performance_id = Math.floor(performance.now() * 1000) % 100000; // Usar performance para maior precisão
  return `btn_${timestamp}_${counter}_${performance_id}_${random}`;
};

// Conversion helpers between backend-stored buttons and UI InteractiveButton
export const convertBackendToInteractive = (button: any): InteractiveButton => {
  // ✅ FIX: SEMPRE preservar ID existente se disponível
  const existingId = button?.id || button?.payload || button?.reply?.id;
  
  // Debug em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    console.log('🔄 [convertBackendToInteractive] Converting button:', {
      input: button,
      existingId,
      hasUrl: !!button?.url,
      hasPhoneNumber: !!button?.phone_number,
      detectedType: button?.type
    });
  }
  
  // Handle Instagram quick_replies format (content_type indicates it's a quick reply)
  if (button?.content_type === 'text') {
    return { 
      id: existingId || generateUniqueButtonId(), // Só gera novo ID se NÃO existir
      text: button.title || '', 
      type: 'reply' 
    };
  }
  
  // ✅ FIX: Detectar tipo do botão de forma mais robusta
  // Prioridade: 1) button.type explícito, 2) presença de url/phone_number, 3) fallback para reply
  let detectedType: 'reply' | 'url' | 'phone_number' = 'reply';
  
  if (button?.type === 'url' || (button?.url && button?.url !== '')) {
    detectedType = 'url';
  } else if (button?.type === 'phone_number' || (button?.phone_number && button?.phone_number !== '')) {
    detectedType = 'phone_number';
  } else if (button?.type === 'reply' || button?.reply) {
    detectedType = 'reply';
  }
  
  const id = existingId || generateUniqueButtonId(); // Só gera novo ID se NÃO existir
  const title = button?.title || button?.reply?.title || button?.text || '';
  
  // ✅ FIX: Sempre preservar url e phone_number quando existirem
  if (detectedType === 'url') {
    const result = { id, text: title, type: 'url' as const, url: button?.url || '' };
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ [convertBackendToInteractive] URL button:', result);
    }
    return result;
  }
  if (detectedType === 'phone_number') {
    const result = { id, text: title, type: 'phone_number' as const, phone_number: button?.phone_number || '' };
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ [convertBackendToInteractive] Phone button:', result);
    }
    return result;
  }
  
  const result = { id, text: title, type: 'reply' as const };
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ [convertBackendToInteractive] Reply button:', result);
  }
  return result;
};

export const convertInteractiveToBackend = (button: InteractiveButton): any => {
  // ✅ FIX: SEMPRE incluir o campo 'type' explicitamente para garantir persistência correta
  if (button.type === 'url') {
    const result = {
      id: button.id,
      type: 'url', // ✅ IMPORTANTE: Incluir tipo explicitamente
      title: button.text,
      url: button.url || '',
    };
    if (process.env.NODE_ENV === 'development') {
      console.log('💾 [convertInteractiveToBackend] URL button to save:', result);
    }
    return result;
  }
  if (button.type === 'phone_number') {
    const result = {
      id: button.id,
      type: 'phone_number', // ✅ IMPORTANTE: Incluir tipo explicitamente
      title: button.text,
      phone_number: button.phone_number || '',
    };
    if (process.env.NODE_ENV === 'development') {
      console.log('💾 [convertInteractiveToBackend] Phone button to save:', result);
    }
    return result;
  }
  // reply default
  const result = {
    id: button.id,
    title: button.text,
    payload: button.id,
    type: 'reply', // ✅ IMPORTANTE: Incluir tipo explicitamente
    reply: {
      id: button.id,
      title: button.text,
    },
  };
  if (process.env.NODE_ENV === 'development') {
    console.log('💾 [convertInteractiveToBackend] Reply button to save:', result);
  }
  return result;
};

// Conversion functions for ButtonReaction types
export const convertCentralToLocal = (
  reaction: CentralButtonReaction
): LocalButtonReaction => {
  // Preferir valores reais quando vierem do backend
  let value = '';
  if (reaction.type === 'emoji') {
    value = reaction.emoji || (reaction as any).emoji || '';
  } else if (reaction.type === 'text') {
    value = reaction.textResponse || (reaction as any).textReaction || '';
  } else if (reaction.type === 'action') {
    value = reaction.action || (reaction as any).action || '';
  }

  console.log('🔄 [convertCentralToLocal] Converting reaction:', {
    input: reaction,
    type: reaction.type,
    emoji: reaction.emoji,
    textResponse: reaction.textResponse,
    textReaction: (reaction as any).textReaction,
    finalValue: value,
    output: {
      buttonId: reaction.buttonId,
      reaction: (reaction.type === 'emoji' || reaction.type === 'text' || reaction.type === 'action')
        ? { type: reaction.type as any, value }
        : undefined,
    }
  });

  return {
    buttonId: reaction.buttonId,
    reaction: (reaction.type === 'emoji' || reaction.type === 'text' || reaction.type === 'action')
      ? {
          type: reaction.type as any,
          value,
        }
      : undefined,
  };
};

// Helper function to generate prefixed IDs
export const generatePrefixedId = (channelType: string | null, fallbackSuffix: string): string => {
  let prefix = '';
  if (channelType === 'Channel::Instagram') prefix = 'ig_';
  else if (channelType === 'Channel::FacebookPage') prefix = 'fb_';
  
  // ✅ FIX: Se o fallbackSuffix parece ser um ID longo e único, use-o diretamente
  // Senão, gere um ID único com timestamp + counter + performance + random
  const uniqueSuffix = fallbackSuffix.includes('_') && fallbackSuffix.length > 15 
    ? fallbackSuffix 
    : (() => {
        const timestamp = Date.now();
        const counter = (++idCounter) % 10000;
        const performance_id = Math.floor(performance.now() * 1000) % 100000;
        const random = Math.random().toString(36).slice(2, 8);
        return `${timestamp}_${counter}_${performance_id}_${random}_${fallbackSuffix}`;
      })();
    
  const generatedId = `${prefix}btn_${uniqueSuffix}`;
  
  // Debug temporário para identificar duplicações
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [generatePrefixedId] Generated: ${generatedId} from fallback: ${fallbackSuffix}`);
  }
    
  return generatedId;
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

// Instagram template type determination - Updated with proper limits
export const getInstagramTemplateType = (
  bodyText: string, 
  hasImage: boolean, 
  selectedType?: string
): InstagramTemplateTypeResult => {
  const bodyLength = bodyText.length;

  // PRIORIDADE 1: Se o usuário selecionou explicitamente um tipo, SEMPRE respeitá-lo
  // Independente do comprimento do texto, apenas validar os limites
  if (selectedType === "button" || selectedType === "button_template") {
    // Template de Botões: 1-640 caracteres (conforme guia Instagram linha 434+)
    if (bodyLength > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH) {
      return {
        type: "button_template",
        reason: `Template de Botões (${bodyLength} chars > ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH}) - EXCEDE LIMITE`,
        isOverLimit: true,
      };
    }
    return {
      type: "button_template",
      reason: `Template de Botões (${bodyLength} chars ≤ ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH})`,
    };
  }

  if (selectedType === "quick_replies") {
    // SEMPRE respeitar a escolha do usuário por quick_replies
    const isOverQuickRepliesLimit = bodyLength > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH;
    return {
      type: "quick_replies",
      reason: `Respostas Rápidas (${bodyLength} chars)${isOverQuickRepliesLimit ? " - EXCEDE LIMITE INSTAGRAM" : ""}`,
      isOverLimit: isOverQuickRepliesLimit,
    };
  }

  if (selectedType === "generic") {
    // Para carrossel, validar contra o limite de título (80 chars)
    const isOverGenericLimit = bodyLength > MESSAGE_LIMITS.INSTAGRAM_GENERIC_TITLE_MAX_LENGTH;
    return {
      type: "generic",
      reason: `Template Genérico/Carrossel (${bodyLength} chars)${isOverGenericLimit ? " - EXCEDE LIMITE DE TÍTULO" : ""}`,
      isOverLimit: isOverGenericLimit,
    };
  }

  // COMPORTAMENTO LEGADO REMOVIDO:
  // A lógica de seleção automática baseada apenas no comprimento foi removida
  // pois agora existe um seletor manual de tipos de template.
  // Se chegou aqui sem selectedType definido, retorna um padrão simples.
  return {
    type: "quick_replies",
    reason: `Respostas Rápidas (padrão - ${bodyLength} chars)`,
    isOverLimit: bodyLength > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH,
  };
};

// Helper to determine appropriate Instagram message format
export const getInstagramMessageFormat = (
  messageType: string,
  bodyText: string,
  hasImage: boolean,
  selectedType?: string
): string => {
  switch (messageType) {
    case 'quick_replies':
      return 'QUICK_REPLIES';
    case 'generic':
      return 'GENERIC_TEMPLATE';
    case 'button_template':
      return 'BUTTON_TEMPLATE';
    default:
      // Auto-determine based on content
      const templateType = getInstagramTemplateType(bodyText, hasImage, selectedType);
      return templateType.type.toUpperCase();
  }
};

// Helper to validate Instagram message limits
export const validateInstagramMessage = (
  messageType: string,
  content: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  switch (messageType) {
    case 'quick_replies':
      if (content.text?.length > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH) {
        errors.push(`Texto excede ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH} caracteres`);
      }
      if (content.quick_replies?.length > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT) {
        errors.push(`Máximo ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_COUNT} quick replies permitido`);
      }
      content.quick_replies?.forEach((reply: any, index: number) => {
        if (reply.title?.length > MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLY_TITLE_MAX_LENGTH) {
          errors.push(`Quick reply ${index + 1}: título excede ${MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLY_TITLE_MAX_LENGTH} caracteres`);
        }
      });
      break;

    case 'generic':
      if (content.elements?.length > MESSAGE_LIMITS.INSTAGRAM_GENERIC_MAX_ELEMENTS) {
        errors.push(`Máximo ${MESSAGE_LIMITS.INSTAGRAM_GENERIC_MAX_ELEMENTS} elementos permitido`);
      }
      content.elements?.forEach((element: any, index: number) => {
        if (element.title?.length > MESSAGE_LIMITS.INSTAGRAM_GENERIC_TITLE_MAX_LENGTH) {
          errors.push(`Elemento ${index + 1}: título excede ${MESSAGE_LIMITS.INSTAGRAM_GENERIC_TITLE_MAX_LENGTH} caracteres`);
        }
        if (element.subtitle?.length > MESSAGE_LIMITS.INSTAGRAM_GENERIC_SUBTITLE_MAX_LENGTH) {
          errors.push(`Elemento ${index + 1}: subtítulo excede ${MESSAGE_LIMITS.INSTAGRAM_GENERIC_SUBTITLE_MAX_LENGTH} caracteres`);
        }
        if (element.buttons?.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS) {
          errors.push(`Elemento ${index + 1}: máximo ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS} botões permitido`);
        }
      });
      break;

    case 'button_template':
      if (content.text?.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH) {
        errors.push(`Texto excede ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH} caracteres`);
      }
      if (content.buttons?.length > MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS) {
        errors.push(`Máximo ${MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_MAX_BUTTONS} botões permitido`);
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
