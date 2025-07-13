#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateChatwitTokens() {
  console.log('🔄 Iniciando migração de tokens do Chatwit...');

  try {
    // Buscar todos os leads que têm chatwitAccessToken
    const leadsWithTokens = await prisma.leadChatwit.findMany({
      where: {
        chatwitAccessToken: {
          not: null
        }
      },
      include: {
        usuario: true
      }
    });

    console.log(`📊 Encontrados ${leadsWithTokens.length} leads com tokens`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const lead of leadsWithTokens) {
      if (!lead.chatwitAccessToken) continue;

      // Verificar se o usuário já tem um token
      if (lead.usuario.chatwitAccessToken) {
        console.log(`⚠️  Usuário ${lead.usuario.name} já tem token, pulando...`);
        skippedCount++;
        continue;
      }

      // Migrar o token para o usuário
      await prisma.usuarioChatwit.update({
        where: { id: lead.usuarioId },
        data: { chatwitAccessToken: lead.chatwitAccessToken }
      });

      console.log(`✅ Token migrado para usuário ${lead.usuario.name}`);
      migratedCount++;
    }

    console.log(`\n📈 Resumo da migração:`);
    console.log(`  ✅ Migrados: ${migratedCount}`);
    console.log(`  ⚠️  Pulados: ${skippedCount}`);
    console.log(`  📊 Total processados: ${leadsWithTokens.length}`);

    if (migratedCount > 0) {
      console.log(`\n🎉 Migração concluída! Agora você pode executar 'npx prisma db push' com segurança.`);
    } else {
      console.log(`\n⚠️  Nenhum token foi migrado. Verifique se há conflitos.`);
    }

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  migrateChatwitTokens().catch(console.error);
}

export { migrateChatwitTokens }; 