import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { invalidateTemplateMappingCache } from '@/lib/cache/instagram-template-cache';

// DELETE: Exclui um mapeamento de intenção
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ caixaId: string; mappingId: string }> }) {
  const { mappingId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!mappingId) {
        return NextResponse.json({ error: 'ID do mapeamento é obrigatório' }, { status: 400 });
    }

    // Get mapping details before deletion for cache invalidation
    const existingMapping = await db.mapeamentoIntencao.findUnique({
      where: { id: mappingId },
      select: { intentName: true, inboxId: true }
    });

    await db.mapeamentoIntencao.delete({
      where: { id: mappingId },
    });

    // Invalidate Instagram template cache for the deleted mapping
    if (existingMapping) {
      try {
        // Find the ChatwitInbox to get the correct inboxId for cache invalidation
        const chatwitInbox = await db.chatwitInbox.findUnique({
          where: { id: existingMapping.inboxId },
          select: { inboxId: true, usuarioChatwitId: true }
        });
        
        if (chatwitInbox) {
          // Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
          console.log(`[API Cache Invalidation] [DEBUG] Preparing cache invalidation for mapping deletion:`, {
            operation: 'DELETE /mapeamentos/[caixaId]/[mappingId]',
            userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
            intentName: existingMapping.intentName,
            mappingId,
            internalInboxId: existingMapping.inboxId,
            externalInboxId: chatwitInbox.inboxId,
            cacheKeyFormat: `${existingMapping.intentName}:${chatwitInbox.usuarioChatwitId}:${chatwitInbox.inboxId}`
          });
          
          await invalidateTemplateMappingCache(existingMapping.intentName, chatwitInbox.usuarioChatwitId, chatwitInbox.inboxId);
          
          console.log(`[API Cache Invalidation] [SUCCESS] Instagram cache cleared for mapping deletion:`, {
            operation: 'DELETE /mapeamentos/[caixaId]/[mappingId]',
            userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
            intentName: existingMapping.intentName,
            mappingId,
            internalInboxId: existingMapping.inboxId,
            externalInboxId: chatwitInbox.inboxId,
            reason: 'Mapping deleted'
          });
        } else {
          console.warn(`[API Cache Invalidation] [ERROR] ChatwitInbox not found for cache invalidation:`, {
            operation: 'DELETE /mapeamentos/[caixaId]/[mappingId]',
            intentName: existingMapping.intentName,
            mappingId,
            internalInboxId: existingMapping.inboxId,
            error: 'ChatwitInbox not found',
            impact: 'Cache not invalidated - may serve stale data'
          });
        }
      } catch (cacheError) {
        console.error('[API Cache Invalidation] [ERROR] Error clearing Instagram cache:', {
          operation: 'DELETE /mapeamentos/[caixaId]/[mappingId]',
          intentName: existingMapping?.intentName,
          mappingId,
          internalInboxId: existingMapping?.inboxId,
          error: cacheError instanceof Error ? {
            message: cacheError.message,
            name: cacheError.name,
            stack: cacheError.stack
          } : cacheError,
          impact: 'Cache not invalidated - may serve stale data'
        });
        // Don't fail the request if cache invalidation fails
      }
    }

    return NextResponse.json({ message: 'Mapeamento excluído com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Erro ao excluir mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 