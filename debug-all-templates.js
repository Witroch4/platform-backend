// Script para listar todos os templates no banco
const { PrismaClient } = require('@prisma/client');

const debugAllTemplates = async () => {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Listando todos os templates no banco...\n');
    
    const amandaUserId = 'cmdzdrscq0000lm6sc08o2m6r';
    
    // 1. Contar total de templates
    const totalTemplates = await prisma.template.count();
    console.log(`📊 Total de templates no banco: ${totalTemplates}\n`);
    
    if (totalTemplates === 0) {
      console.log('❌ Nenhum template encontrado no banco de dados');
      console.log('💡 Isso indica que os templates não foram sincronizados da API do WhatsApp');
      return;
    }
    
    // 2. Listar templates da Amanda
    console.log('1. Templates criados pela Amanda:');
    const amandaTemplates = await prisma.template.findMany({
      where: { createdById: amandaUserId },
      select: {
        id: true,
        name: true,
        status: true,
        scope: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    if (amandaTemplates.length > 0) {
      amandaTemplates.forEach((template, index) => {
        console.log(`   ${index + 1}. ${template.name} (ID: ${template.id})`);
        console.log(`      Status: ${template.status}, Escopo: ${template.scope}, Tipo: ${template.type}`);
      });
    } else {
      console.log('   ❌ Amanda não criou nenhum template');
    }
    
    // 3. Listar templates globais
    console.log('\n2. Templates globais (acessíveis por todos):');
    const globalTemplates = await prisma.template.findMany({
      where: { scope: 'GLOBAL' },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        createdBy: {
          select: {
            name: true,
          }
        }
      },
      take: 10
    });
    
    if (globalTemplates.length > 0) {
      globalTemplates.forEach((template, index) => {
        console.log(`   ${index + 1}. ${template.name} (ID: ${template.id})`);
        console.log(`      Status: ${template.status}, Criado por: ${template.createdBy?.name}`);
      });
    } else {
      console.log('   ❌ Nenhum template global encontrado');
    }
    
    // 4. Listar todos os templates (primeiros 10)
    console.log('\n3. Todos os templates (primeiros 10):');
    const allTemplates = await prisma.template.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        scope: true,
        type: true,
        createdBy: {
          select: {
            name: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    allTemplates.forEach((template, index) => {
      console.log(`   ${index + 1}. ${template.name} (ID: ${template.id})`);
      console.log(`      Status: ${template.status}, Escopo: ${template.scope}, Criado por: ${template.createdBy?.name}`);
    });
    
    // 5. Verificar se há templates com IDs similares
    console.log('\n4. Procurando templates com IDs similares a 682491667610791:');
    const similarTemplates = await prisma.template.findMany({
      where: {
        OR: [
          { id: { contains: '682491' } },
          { id: { contains: '667610' } },
          { id: { contains: '610791' } },
        ]
      },
      select: {
        id: true,
        name: true,
        status: true,
      }
    });
    
    if (similarTemplates.length > 0) {
      console.log('   ✅ Templates com IDs similares encontrados:');
      similarTemplates.forEach((template, index) => {
        console.log(`   ${index + 1}. ${template.name} (ID: ${template.id})`);
      });
    } else {
      console.log('   ❌ Nenhum template com ID similar encontrado');
    }
    
    // 6. Verificar WhatsAppOfficialInfo
    console.log('\n5. Templates com informações do WhatsApp:');
    const whatsappTemplates = await prisma.template.findMany({
      where: {
        whatsappOfficialInfo: {
          isNot: null
        }
      },
      select: {
        id: true,
        name: true,
        whatsappOfficialInfo: {
          select: {
            metaTemplateId: true,
            status: true,
          }
        }
      },
      take: 5
    });
    
    if (whatsappTemplates.length > 0) {
      whatsappTemplates.forEach((template, index) => {
        console.log(`   ${index + 1}. ${template.name} (ID: ${template.id})`);
        console.log(`      Meta ID: ${template.whatsappOfficialInfo?.metaTemplateId}`);
      });
    } else {
      console.log('   ❌ Nenhum template com informações do WhatsApp encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a investigação:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Executar apenas se chamado diretamente
if (require.main === module) {
  debugAllTemplates();
}

module.exports = { debugAllTemplates };