import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function testPrisma() {
  try {
    // Listar todos os modelos disponíveis
    console.log('Modelos disponíveis:', Object.keys(prisma).filter(key => !key.startsWith('_') && !key.startsWith('$')));
    
    // Verificar existência do modelo template
    console.log('template existe:', 'template' in prisma);
    
    // Testar acesso como any
    const prismaAny = prisma as any;
    
    // Tentar listar o primeiro template
    try {
      const template = await prismaAny.template.findFirst();
      console.log('Template encontrado:', template ? 'Sim' : 'Não');
      if (template) {
        console.log('Template:', template);
      }
    } catch (error) {
      console.error('Erro ao buscar template:', error);
    }
    
  } catch (error) {
    console.error('Erro geral:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPrisma(); 