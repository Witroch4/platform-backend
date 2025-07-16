import { db } from "@/lib/db";

/**
 * Busca configuração do WhatsApp para uma caixa de entrada específica
 * Se não encontrar configuração específica, retorna a configuração padrão
 */
export async function getWhatsAppConfig(
  usuarioChatwitId: string,
  caixaEntradaId?: string
) {
  try {
    let config = null;

    // Se foi especificada uma caixa de entrada, buscar configuração específica
    if (caixaEntradaId) {
      config = await db.whatsAppConfig.findFirst({
        where: { 
          caixaEntradaId, 
          usuarioChatwitId,
          isActive: true
        }
      });
    }

    // Se não encontrou configuração específica, buscar a padrão
    if (!config) {
      config = await db.whatsAppConfig.findFirst({
        where: { 
          usuarioChatwitId, 
          caixaEntradaId: null,
          isActive: true
        }
      });
    }

    return config;
  } catch (error) {
    console.error("Erro ao buscar configuração do WhatsApp:", error);
    return null;
  }
}

/**
 * Busca todas as configurações do WhatsApp de um usuário
 */
export async function getAllWhatsAppConfigs(usuarioChatwitId: string) {
  try {
    const configs = await db.whatsAppConfig.findMany({
      where: { 
        usuarioChatwitId,
        isActive: true
      },
      include: {
        caixaEntrada: {
          select: {
            id: true,
            nome: true,
            inboxId: true,
            inboxName: true,
            channelType: true
          }
        }
      },
      orderBy: [
        { caixaEntradaId: 'asc' }, // Configurações específicas primeiro
        { createdAt: 'desc' }
      ]
    });

    return configs;
  } catch (error) {
    console.error("Erro ao buscar configurações do WhatsApp:", error);
    return [];
  }
}

/**
 * Verifica se uma configuração está ativa
 */
export function isConfigActive(config: any) {
  return config && config.isActive && 
         config.whatsappToken && 
         config.whatsappBusinessAccountId;
}

/**
 * Valida uma configuração do WhatsApp
 */
export function validateWhatsAppConfig(config: any) {
  const errors: string[] = [];

  if (!config.whatsappToken) {
    errors.push("Token do WhatsApp é obrigatório");
  }

  if (!config.whatsappBusinessAccountId) {
    errors.push("ID da conta Business do WhatsApp é obrigatório");
  }

  if (!config.fbGraphApiBase) {
    errors.push("URL base da API do Facebook é obrigatória");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
} 