const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixButtonReaction() {
  try {
    // Atualizar a reação com o buttonId correto
    const updated = await prisma.mapeamentoBotao.update({
      where: {
        buttonId: 'ig_btn_1756633784179_hzvsf8lbs'
      },
      data: {
        buttonId: 'btn_1757347980857_e8fvdtda9'
      }
    });
    
    console.log('Reação atualizada com sucesso:');
    console.log('- Novo Button ID:', updated.buttonId);
    console.log('- Action Type:', updated.actionType);
    console.log('- Action Payload:', JSON.stringify(updated.actionPayload, null, 2));
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixButtonReaction();
