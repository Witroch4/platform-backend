#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreWithDraAmanda() {
  console.log('🔄 Iniciando restauração com Dra Amanda...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));

    console.log(`📅 Backup de: ${backupData.metadata.created_at}`);

    // 1. Primeiro, criar o UsuarioChatwit "Dra Amanda"
    console.log(`\n🔄 Criando UsuarioChatwit "Dra Amanda"...`);
    
    // Buscar o primeiro usuário do sistema para associar
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!firstUser) {
      throw new Error('Nenhum usuário encontrado no sistema');
    }

    console.log(`📊 Usando usuário: ${firstUser.name || firstUser.email}`);

    // Criar o UsuarioChatwit "Dra Amanda"
    const draAmanda = await prisma.usuarioChatwit.create({
      data: {
        name: "Dra Amanda",
        availableName: "Dra Amanda",
        accountId: 1,
        accountName: "Chatwit Account",
        channel: "Whatsapp",
        appUserId: firstUser.id,
        externalUserId: 1
      }
    });

    console.log(`✅ UsuarioChatwit criado: ${draAmanda.name} (ID: ${draAmanda.id})`);

    // 2. Agora restaurar LeadChatwit associando todos ao Dra Amanda
    const leadsChatwitData = backupData.data.leadsChatwit;
    if (leadsChatwitData && leadsChatwitData.length > 0) {
      console.log(`\n🔄 Restaurando ${leadsChatwitData.length} LeadChatwit...`);
      
      let restoredCount = 0;
      let errorCount = 0;

      for (const leadData of leadsChatwitData) {
        try {
          // Remover campos que não existem mais no schema atual
          const { chatwitAccessToken, ...cleanLeadData } = leadData;
          
          await prisma.leadChatwit.create({
            data: {
              ...cleanLeadData,
              usuarioId: draAmanda.id // Associar todos ao Dra Amanda
            }
          });
          
          restoredCount++;
          if (restoredCount % 10 === 0) {
            console.log(`📊 Progresso: ${restoredCount}/${leadsChatwitData.length} leads restaurados`);
          }
        } catch (error) {
          errorCount++;
          console.log(`❌ Erro no lead ${leadData.name || leadData.sourceId}: ${error.message}`);
          
          if (errorCount > 10) {
            console.log(`⚠️  Muitos erros, parando para evitar spam...`);
            break;
          }
        }
      }

      console.log(`\n✅ LeadChatwit restaurados: ${restoredCount}`);
      console.log(`❌ Erros: ${errorCount}`);
    }

    // 3. Restaurar ArquivoLeadChatwit
    const arquivosData = backupData.data.arquivosLeadChatwit;
    if (arquivosData && arquivosData.length > 0) {
      console.log(`\n🔄 Restaurando ${arquivosData.length} ArquivoLeadChatwit...`);
      
      let restoredCount = 0;
      let errorCount = 0;

      for (const arquivoData of arquivosData) {
        try {
          await prisma.arquivoLeadChatwit.create({
            data: arquivoData
          });
          
          restoredCount++;
          if (restoredCount % 50 === 0) {
            console.log(`📊 Progresso: ${restoredCount}/${arquivosData.length} arquivos restaurados`);
          }
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            console.log(`❌ Erro no arquivo ${arquivoData.id}: ${error.message}`);
          }
        }
      }

      console.log(`\n✅ ArquivoLeadChatwit restaurados: ${restoredCount}`);
      console.log(`❌ Erros: ${errorCount}`);
    }

    console.log(`\n🎉 Restauração concluída!`);

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  restoreWithDraAmanda().catch(console.error);
}

export { restoreWithDraAmanda }; 