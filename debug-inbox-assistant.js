const { getPrismaInstance } = require('./lib/connections');

async function checkInboxAssistant() {
  try {
    const prisma = getPrismaInstance();
    
    console.log('🔍 Verificando configuração do inbox 4...');
    
    // Verificar se o inbox existe
    const inbox = await prisma.chatwitInbox.findFirst({
      where: { inboxId: "4" },
      include: {
        usuarioChatwit: {
          select: {
            appUserId: true,
            chatwitAccountId: true
          }
        },
        aiAssistantLinks: {
          include: {
            assistant: {
              select: {
                id: true,
                model: true,
                instructions: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    if (!inbox) {
      console.log('❌ Inbox 4 não encontrado');
      return;
    }

    console.log('✅ Inbox encontrado:', {
      inboxId: inbox.inboxId,
      nome: inbox.nome,
      userId: inbox.usuarioChatwit?.appUserId,
      accountId: inbox.usuarioChatwit?.chatwitAccountId
    });

    // Verificar assistants linkados
    console.log('\n🤖 Assistants linkados:', inbox.aiAssistantLinks.length);
    inbox.aiAssistantLinks.forEach((link, idx) => {
      console.log(`  ${idx + 1}. ${link.assistant.id} - ${link.assistant.model} (ativo: ${link.assistant.isActive})`);
    });

    // Verificar assistants do usuário (fallback)
    if (inbox.usuarioChatwit?.appUserId) {
      const userAssistants = await prisma.aiAssistant.findMany({
        where: {
          userId: inbox.usuarioChatwit.appUserId,
          isActive: true
        },
        select: {
          id: true,
          model: true,
          instructions: true,
          isActive: true
        },
        orderBy: { updatedAt: 'desc' }
      });

      console.log('\n🎯 Assistants do usuário (fallback):', userAssistants.length);
      userAssistants.forEach((assistant, idx) => {
        console.log(`  ${idx + 1}. ${assistant.id} - ${assistant.model}`);
      });

      if (userAssistants.length === 0) {
        console.log('\n❌ PROBLEMA ENCONTRADO: Não há assistants ativos para este usuário!');
        console.log('💡 Solução: Criar um assistant ou ativar um existente');
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    process.exit(0);
  }
}

checkInboxAssistant();
