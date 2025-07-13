#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixUsuarioChatwit() {
  console.log('🔄 Verificando registros de UsuarioChatwit...');

  try {
    // Buscar todos os usuários do sistema
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    console.log(`📊 Encontrados ${users.length} usuários no sistema`);

    // Buscar todos os UsuarioChatwit existentes
    const usuariosChatwit = await prisma.usuarioChatwit.findMany();
    console.log(`📊 Encontrados ${usuariosChatwit.length} UsuarioChatwit no sistema`);

    if (usuariosChatwit.length === 0) {
      console.log('✅ Nenhum UsuarioChatwit encontrado. Pode prosseguir com segurança.');
      return;
    }

    // Para cada UsuarioChatwit, associar com um User
    for (const usuarioChatwit of usuariosChatwit) {
      console.log(`\n🔍 Processando: ${usuarioChatwit.name}`);
      
      // Tentar encontrar um user pelo email ou nome
      let targetUser = users.find(user => 
        user.email?.includes(usuarioChatwit.name.toLowerCase()) ||
        user.name?.toLowerCase().includes(usuarioChatwit.name.toLowerCase())
      );

      // Se não encontrar, usar o primeiro user disponível
      if (!targetUser && users.length > 0) {
        targetUser = users[0];
        console.log(`⚠️  Usando primeiro usuário disponível: ${targetUser.name || targetUser.email}`);
      }

      if (targetUser) {
        // Atualizar o UsuarioChatwit com o appUserId
        await prisma.usuarioChatwit.update({
          where: { id: usuarioChatwit.id },
          data: { 
            appUserId: targetUser.id,
            externalUserId: usuarioChatwit.userId // Mover o userId antigo para externalUserId
          }
        });

        console.log(`✅ Associado com: ${targetUser.name || targetUser.email}`);
      } else {
        console.log(`❌ Nenhum usuário encontrado para associar`);
      }
    }

    console.log('\n🎉 Processo concluído! Agora você pode executar "npx prisma db push"');

  } catch (error) {
    console.error('❌ Erro durante o processo:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  fixUsuarioChatwit().catch(console.error);
}

export { fixUsuarioChatwit }; 