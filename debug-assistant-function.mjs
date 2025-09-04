// Debug script para verificar a função getAssistantForInbox
import { PrismaClient } from '@prisma/client';

async function debugGetAssistantForInbox() {
  const prisma = new PrismaClient();
  const inboxId = '4';
  
  console.log('🔍 Debug: getAssistantForInbox para inbox', inboxId);
  
  // 1) Primeiro step: buscar a inbox com links
  const inbox = await prisma.chatwitInbox.findFirst({
    where: { inboxId },
    include: {
      usuarioChatwit: true,
      aiAssistantLinks: {
        include: {
          assistant: { select: { id: true, model: true, instructions: true, updatedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  
  console.log('📦 Inbox encontrada:', {
    id: inbox?.id,
    nome: inbox?.nome,
    inboxId: inbox?.inboxId,
    usuarioChatwitId: inbox?.usuarioChatwitId,
    aiAssistantLinksCount: inbox?.aiAssistantLinks?.length || 0,
  });
  
  if (inbox?.aiAssistantLinks) {
    console.log('🔗 Links encontrados:', inbox.aiAssistantLinks.map(link => ({
      linkId: link.id,
      assistantId: link.assistantId,
      inboxDbId: link.inboxDbId,
      assistant: link.assistant,
    })));
  }
  
  const linked = inbox?.aiAssistantLinks;
  if (linked && linked.length > 0 && linked[0]?.assistant) {
    const a = linked[0].assistant;
    console.log('✅ Assistant linkado encontrado:', { id: a.id, model: a.model, instructions: a.instructions });
    return { id: a.id, model: a.model, instructions: a.instructions };
  }
  
  // 2) Fallback
  const userId = inbox?.usuarioChatwit?.appUserId || null;
  console.log('🆔 UserId para fallback:', userId);
  
  if (!userId) {
    console.log('❌ Sem userId, retornando null');
    return null;
  }
  
  const fallback = await prisma.aiAssistant.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, model: true, instructions: true },
  });
  
  console.log('🔄 Fallback assistant:', fallback);
  return fallback;
}

debugGetAssistantForInbox()
  .then(result => {
    console.log('🎯 Resultado final:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
