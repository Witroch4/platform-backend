const { PrismaClient } = require('@prisma/client');

async function limparConfigsDuplicadas() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Buscando configurações duplicadas...');
    
    // Buscar todas as configurações agrupadas por usuário
    const configs = await prisma.mtfDiamanteConfig.findMany({
      orderBy: [
        { userId: 'asc' },
        { createdAt: 'desc' }
      ],
      include: {
        lotes: true,
        intentMappings: true
      }
    });
    
    console.log(`📊 Total de configurações encontradas: ${configs.length}`);
    
    // Agrupar por usuário e manter apenas a mais recente
    const configsPorUsuario = {};
    const configsParaRemover = [];
    
    configs.forEach(config => {
      if (!configsPorUsuario[config.userId]) {
        // Primeira configuração deste usuário (mais recente)
        configsPorUsuario[config.userId] = config;
      } else {
        // Configuração mais antiga - marcar para remoção
        configsParaRemover.push(config);
      }
    });
    
    console.log(`🗑️  Configurações para remover: ${configsParaRemover.length}`);
    
    if (configsParaRemover.length === 0) {
      console.log('✅ Nenhuma configuração duplicada encontrada!');
      return;
    }
    
    // Remover configurações antigas
    for (const config of configsParaRemover) {
      await prisma.$transaction(async (tx) => {
        console.log(`🗑️  Removendo configuração ${config.id} do usuário ${config.userId}`);
        
        // Remover lotes relacionados
        await tx.mtfDiamanteLote.deleteMany({
          where: { configId: config.id }
        });
        
        // Remover mapeamentos relacionados
        await tx.mtfDiamanteIntentMapping.deleteMany({
          where: { configId: config.id }
        });
        
        // Remover configuração
        await tx.mtfDiamanteConfig.delete({
          where: { id: config.id }
        });
      });
    }
    
    // Garantir que as configurações restantes estejam ativas
    await prisma.mtfDiamanteConfig.updateMany({
      data: { isActive: true }
    });
    
    console.log('✅ Limpeza concluída com sucesso!');
    console.log(`📈 Configurações restantes: ${Object.keys(configsPorUsuario).length}`);
    
  } catch (error) {
    console.error('❌ Erro ao limpar configurações:', error);
  } finally {
    await prisma.$disconnect();
  }
}

limparConfigsDuplicadas(); 