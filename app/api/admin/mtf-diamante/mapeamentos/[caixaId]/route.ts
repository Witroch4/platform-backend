import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';
import { invalidateTemplateMappingCache } from '@/lib/cache/instagram-template-cache';

// GET: Lista todos os mapeamentos de uma caixa de entrada
export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const mapeamentos = await getPrismaInstance().mapeamentoIntencao.findMany({
      where: { inboxId: caixaId },
      include: {
        template: { select: { id: true, name: true } },
        inbox: { select: { id: true, nome: true } },
      },
      orderBy: { intentName: 'asc' },
    });

    return NextResponse.json(mapeamentos);
  } catch (error) {
    console.error('Erro ao buscar mapeamentos:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST: Cria ou atualiza um mapeamento
export async function POST(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    console.log("=== DEBUG API ===");
    console.log("Body recebido:", body);
    console.log("caixaId from params:", caixaId);
    
    const {
      id: mappingId,
      intentName,
      templateId,
      customVariables,
    } = body;
    
    console.log("Campos extraídos:");
    console.log("- mappingId:", mappingId);
    console.log("- intentName:", intentName);
    console.log("- templateId:", templateId);

    if (!intentName || !templateId) {
      console.log("Validação falhou:");
      console.log("- intentName existe:", !!intentName);
      console.log("- templateId existe:", !!templateId);
      return NextResponse.json({ error: 'Intenção e template são obrigatórios.' }, { status: 400 });
    }

    const normalizedCustom: Record<string, string> = {};
    if (customVariables && typeof customVariables === 'object') {
      try {
        const entries = Object.entries(customVariables as Record<string, any>);
        for (const [key, rawVal] of entries) {
          if (rawVal === undefined || rawVal === null) continue;
          normalizedCustom[key] = String(rawVal);
        }
        console.log('[Mapeamentos][Debug] Normalized customVariables:', normalizedCustom);
      } catch (error) {
        console.warn('[Mapeamentos][Warn] Failed to normalize customVariables:', error);
      }
    }

    const data = {
      intentName,
      inboxId: caixaId,
      templateId,
      customVariables: Object.keys(normalizedCustom).length > 0 ? normalizedCustom : null,
    };
    
    console.log("Data para salvar:", data);

    const savedMapping = await getPrismaInstance().mapeamentoIntencao.upsert({
      where: { id: mappingId || '' },
      update: data,
      create: data,
    });
    
    console.log("Mapeamento salvo:", savedMapping);

    // Invalidate Instagram template cache for this mapping
    try {
      // Find the ChatwitInbox to get the correct inboxId for cache invalidation
      const chatwitInbox = await getPrismaInstance().chatwitInbox.findUnique({
        where: { id: caixaId },
        select: { inboxId: true, usuarioChatwitId: true }
      });
      
      if (chatwitInbox) {
        // Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
        console.log(`[API Cache Invalidation] [DEBUG] Preparing cache invalidation for mapping creation:`, {
          operation: 'POST /mapeamentos/[caixaId]',
          userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
          intentName,
          templateId,
          internalCaixaId: caixaId,
          externalInboxId: chatwitInbox.inboxId,
          cacheKeyFormat: `${intentName}:${chatwitInbox.usuarioChatwitId}:${chatwitInbox.inboxId}`,
          mappingId: savedMapping.id
        });
        
        await invalidateTemplateMappingCache(intentName, chatwitInbox.usuarioChatwitId, chatwitInbox.inboxId);
        
        console.log(`[API Cache Invalidation] [SUCCESS] Instagram cache cleared for mapping creation:`, {
          operation: 'POST /mapeamentos/[caixaId]',
          userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
          intentName,
          templateId,
          internalCaixaId: caixaId,
          externalInboxId: chatwitInbox.inboxId,
          mappingId: savedMapping.id,
          reason: 'New mapping created or updated'
        });
      } else {
        console.warn(`[API Cache Invalidation] [ERROR] ChatwitInbox not found for cache invalidation:`, {
          operation: 'POST /mapeamentos/[caixaId]',
          intentName,
          templateId,
          internalCaixaId: caixaId,
          error: 'ChatwitInbox not found',
          impact: 'Cache not invalidated - may serve stale data'
        });
      }
    } catch (cacheError) {
      console.error('[API Cache Invalidation] [ERROR] Error clearing Instagram cache:', {
        operation: 'POST /mapeamentos/[caixaId]',
        intentName,
        templateId,
        internalCaixaId: caixaId,
        error: cacheError instanceof Error ? {
          message: cacheError.message,
          name: cacheError.name,
          stack: cacheError.stack
        } : cacheError,
        impact: 'Cache not invalidated - may serve stale data'
      });
      // Don't fail the request if cache invalidation fails
    }

    return NextResponse.json(savedMapping, { status: 201 });
  } catch (error) {
    console.error('Erro ao salvar mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 
