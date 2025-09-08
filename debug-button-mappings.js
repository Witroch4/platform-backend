const { PrismaClient } = require('@prisma/client');

async function debugButtonMappings() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Verificando mapeamentos de botão...');
    
    // Buscar todos os mapeamentos recentes
    const mappings = await prisma.mapeamentoBotao.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        inbox: {
          select: {
            id: true,
            nome: true,
            inboxId: true
          }
        }
      }
    });
    
    console.log('📊 Total de mapeamentos encontrados:', mappings.length);
    
    if (mappings.length > 0) {
      console.log('\n🎯 Últimos mapeamentos:');
      mappings.forEach((mapping, index) => {
        console.log(`${index + 1}. ID: ${mapping.id}`);
        console.log(`   Button ID: ${mapping.buttonId}`);
        console.log(`   Inbox ID: ${mapping.inboxId}`);
        console.log(`   Inbox Nome: ${mapping.inbox?.nome || 'N/A'}`);
        console.log(`   Action Type: ${mapping.actionType}`);
        console.log(`   Action Payload:`, mapping.actionPayload);
        console.log(`   Description: ${mapping.description || 'N/A'}`);
        console.log(`   Created: ${mapping.createdAt}`);
        console.log('   ---');
      });
    }
    
    // Verificar se tem mapeamentos para o botão específico mencionado
    const specificButton = await prisma.mapeamentoBotao.findMany({
      where: {
        buttonId: 'ig_btn_1756244604034_l8gvzln9j'
      },
      include: {
        inbox: {
          select: {
            id: true,
            nome: true,
            inboxId: true
          }
        }
      }
    });
    
    console.log('\n🎯 Mapeamentos para o botão específico ig_btn_1756244604034_l8gvzln9j:');
    console.log('Total encontrado:', specificButton.length);
    specificButton.forEach((mapping, index) => {
      console.log(`${index + 1}. ID: ${mapping.id}`);
      console.log(`   Inbox ID: ${mapping.inboxId}`);
      console.log(`   Inbox Nome: ${mapping.inbox?.nome || 'N/A'}`);
      console.log(`   Action Payload:`, mapping.actionPayload);
      console.log('   ---');
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar mapeamentos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugButtonMappings();
