const { PrismaClient } = require('@prisma/client');

async function debugInboxes() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Verificando inboxes disponíveis...');
    
    // Buscar todos os inboxes
    const inboxes = await prisma.chatwitInbox.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        inboxId: true,
        channelType: true,
        usuarioChatwitId: true,
        createdAt: true
      }
    });
    
    console.log('📊 Total de inboxes encontrados:', inboxes.length);
    
    console.log('\n🎯 Inboxes disponíveis:');
    inboxes.forEach((inbox, index) => {
      console.log(`${index + 1}. ID: ${inbox.id}`);
      console.log(`   Nome: ${inbox.nome}`);
      console.log(`   Inbox ID: ${inbox.inboxId}`);
      console.log(`   Channel Type: ${inbox.channelType}`);
      console.log(`   Usuario Chatwit ID: ${inbox.usuarioChatwitId}`);
      console.log(`   Created: ${inbox.createdAt}`);
      console.log('   ---');
    });
    
    // Procurar especificamente pelo OAB Produção
    const oabInbox = inboxes.find(inbox => inbox.nome.includes('OAB'));
    if (oabInbox) {
      console.log('\n🎯 Inbox OAB encontrado:');
      console.log('ID:', oabInbox.id);
      console.log('Nome:', oabInbox.nome);
      
      // Verificar se tem mensagens interativas neste inbox
      const templates = await prisma.template.findMany({
        where: {
          inboxId: oabInbox.id,
          type: 'INTERACTIVE_MESSAGE'
        },
        select: {
          id: true,
          name: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      
      console.log('\n📝 Templates interativos no inbox OAB:');
      console.log('Total:', templates.length);
      templates.forEach((template, index) => {
        console.log(`${index + 1}. ID: ${template.id}`);
        console.log(`   Nome: ${template.name}`);
        console.log(`   Created: ${template.createdAt}`);
        console.log('   ---');
      });
    } else {
      console.log('\n❌ Inbox OAB não encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar inboxes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugInboxes();
