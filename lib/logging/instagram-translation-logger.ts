import { logger, LOG_CATEGORIES } from './interactive-message-logger'

export interface TranslationLogContext {
  usuarioChatwitId: string
  contextData?: Record<string, any>
}

/**
 * Registra o evento de tradução de template do Instagram.
 */
export function logInstagramTranslation(
  message: string,
  { usuarioChatwitId, contextData = {} }: TranslationLogContext
): void {
  try {
    logger.info(
      message,
      LOG_CATEGORIES.SYSTEM,
      { userId: usuarioChatwitId },
      contextData
    )
  } catch (error: any) {
    console.error(
      `[logInstagramTranslation] Erro ao registrar tradução para o usuário ${usuarioChatwitId}: ${error.message}`
    )
  }
}
