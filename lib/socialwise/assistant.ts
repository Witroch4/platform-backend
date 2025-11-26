import { getPrismaInstance } from '@/lib/connections';

type AssistantLite = {
  id: string;
  model: string | null;
  instructions: string | null;
  embedipreview: boolean;
};

/**
 * Resolve o Capitão (assistente) associado a uma inbox do Chatwit.
 * Estratégia atual: localizar a `ChatwitInbox` por `inboxId` e usar
 * o `usuarioChatwit.appUserId` para buscar o `AiAssistant` mais recente do usuário.
 */
export async function getAssistantForInbox(inboxId: string, chatwitAccountId?: string): Promise<AssistantLite | null> {
  if (!inboxId) return null;
  const prisma = getPrismaInstance();

  // 1) Tentar achar um assistente explicitamente associado à inbox
  const inbox = await prisma.chatwitInbox.findFirst({
    where: {
      inboxId,
      ...(chatwitAccountId
        ? { usuarioChatwit: { chatwitAccountId: chatwitAccountId.toString() } }
        : {}),
    } as any,
    include: {
      usuarioChatwit: true,
      aiAssistantLinks: {
        where: {
          isActive: true,
        },
        include: {
          assistant: { select: { id: true, model: true, instructions: true, embedipreview: true, updatedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const linked = (inbox as any)?.aiAssistantLinks as any[] | undefined;
  if (linked && linked.length > 0 && linked[0]?.assistant) {
    const a = linked[0].assistant;
    return { id: a.id, model: a.model, instructions: a.instructions, embedipreview: a.embedipreview } as AssistantLite;
  }

  // 2) Fallback: último Capitão do usuário dono da inbox
  const userId = (inbox as any)?.usuarioChatwit?.appUserId || null;
  if (!userId) return null;
  const fallback = await (prisma as any).aiAssistant.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, model: true, instructions: true, embedipreview: true },
  });
  return fallback as AssistantLite | null;
}


