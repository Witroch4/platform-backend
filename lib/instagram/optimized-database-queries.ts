export interface TemplateMapping {
  usuarioChatwitId: string
  instagramTemplateId: string
  internalTemplateId: string
  contextData?: Record<string, any>
}

const templateMappings = new Map<string, TemplateMapping>()

/**
 * Salva ou atualiza o mapeamento entre um template do Instagram e um template interno.
 */
export async function saveTemplateMapping(mapping: TemplateMapping): Promise<void> {
  const { usuarioChatwitId, instagramTemplateId } = mapping
  try {
    templateMappings.set(`${usuarioChatwitId}-${instagramTemplateId}`, mapping)
  } catch (error: any) {
    console.error(
      `[saveTemplateMapping] Falha ao salvar mapeamento para o usuário ${usuarioChatwitId}: ${error.message}`
    )
    throw error
  }
}

export function getTemplateMapping(
  usuarioChatwitId: string,
  instagramTemplateId: string
): TemplateMapping | undefined {
  return templateMappings.get(`${usuarioChatwitId}-${instagramTemplateId}`)
}
