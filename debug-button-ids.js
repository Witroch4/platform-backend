const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkButtonIds() {
  try {
    // Buscar a mensagem 2222222 com seus botões
    const message = await prisma.template.findFirst({
      where: {
        name: '2222222',
        type: 'INTERACTIVE_MESSAGE'
      },
      include: {
        interactiveContent: {
          include: {
            actionReplyButton: true
          }
        }
      }
    });
    
    if (message?.interactiveContent?.actionReplyButton) {
      console.log('Buttons na actionReplyButton:');
      console.log(JSON.stringify(message.interactiveContent.actionReplyButton.buttons, null, 2));
    }
    
    // Buscar reações para esta inbox
    const reactions = await prisma.mapeamentoBotao.findMany({
      where: {
        inboxId: message.inboxId
      }
    });
    
    console.log('\nReações salvas:');
    reactions.forEach(reaction => {
      console.log('Button ID na reação:', reaction.buttonId);
    });
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkButtonIds();
