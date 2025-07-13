#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreBackup() {
  console.log('🔄 Iniciando restauração do backup...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));

    console.log(`📅 Backup de: ${backupData.metadata.created_at}`);
    console.log(`📊 Total de tabelas: ${Object.keys(backupData.data).length}`);

    // Restaurar dados em ordem de dependência
    const restoreOrder = [
      'users',
      'accounts', 
      'usuarioChatwit',
      'leadsChatwit',
      'arquivosLeadChatwit',
      'automacoes',
      'leads',
      'leadAutomacao',
      'pastas',
      'subscriptions',
      'notifications',
      'agendamentos',
      'midias',
      'chats',
      'messages',
      'whatsAppConfigs',
      'whatsAppTemplates',
      'espelhosBiblioteca',
      'espelhosPadrao',
      'mtfDiamanteConfigs',
      'mtfDiamanteLotes',
      'mtfDiamanteIntentMappings',
      'disparosMtfDiamante'
    ];

    let totalRestored = 0;

    for (const tableName of restoreOrder) {
      const tableData = backupData.data[tableName];
      if (!tableData || tableData.length === 0) {
        console.log(`⏭️  ${tableName}: 0 registros (pulando)`);
        continue;
      }

      console.log(`\n🔄 Restaurando ${tableName}: ${tableData.length} registros`);

      try {
        // Usar createMany para inserção em lote
        const result = await (prisma as any)[tableName].createMany({
          data: tableData,
          skipDuplicates: true
        });

        console.log(`✅ ${tableName}: ${result.count} registros restaurados`);
        totalRestored += result.count;

      } catch (error) {
        console.log(`⚠️  ${tableName}: Erro na restauração - ${error.message}`);
        
        // Tentar inserção individual para identificar problemas
        let individualCount = 0;
        for (const record of tableData.slice(0, 5)) { // Apenas os primeiros 5 para debug
          try {
            await (prisma as any)[tableName].create({
              data: record
            });
            individualCount++;
          } catch (individualError) {
            console.log(`  ❌ Erro no registro: ${individualError.message}`);
          }
        }
        console.log(`  📊 ${tableName}: ${individualCount} registros individuais restaurados`);
        totalRestored += individualCount;
      }
    }

    console.log(`\n🎉 Restauração concluída!`);
    console.log(`📊 Total de registros restaurados: ${totalRestored}`);

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  restoreBackup().catch(console.error);
}

export { restoreBackup }; 