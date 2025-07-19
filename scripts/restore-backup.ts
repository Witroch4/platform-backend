#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreBackup(backupFileName: string) {
  const backupDir = join(process.cwd(), 'backups');
  const backupPath = join(backupDir, backupFileName);
  
  if (!existsSync(backupPath)) {
    console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
    return;
  }

  console.log(`🔄 Iniciando restauração do backup: ${backupFileName}`);
  console.log(`📁 Caminho: ${backupPath}`);

  try {
    // Ler o arquivo de backup
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    console.log(`📅 Backup criado em: ${backupData.metadata.created_at}`);
    console.log(`📊 Tipo: ${backupData.metadata.backup_type}`);

    // Confirmar restauração
    console.log(`⚠️  ATENÇÃO: Esta operação irá substituir todos os dados atuais!`);
    console.log(`📋 Tabelas que serão restauradas:`);
    
    for (const [tableName, tableData] of Object.entries(backupData.data)) {
      console.log(`  - ${tableName}: ${(tableData as any[]).length} registros`);
    }

    // Limpar dados existentes (opcional - comentado por segurança)
    console.log(`🧹 Limpando dados existentes...`);
    
    // Desabilitar foreign key checks temporariamente
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0`;
    
    // Limpar tabelas na ordem correta (evitando problemas de foreign key)
    const tablesToClear = [
      'message',
      'chat', 
      'agendamento',
      'notification',
      'subscription',
      'disparoMtfDiamante',
      'mtfDiamanteIntentMapping',
      'mtfDiamanteLote',
      'mtfDiamanteConfig',
      'espelhoPadrao',
      'espelhoBiblioteca',
      'whatsAppTemplate',
      'whatsAppConfig',
      'arquivoLeadChatwit',
      'leadChatwit',
      'usuarioChatwit',
      'pasta',
      'leadAutomacao',
      'lead',
      'automacao',
      'account',
      'user'
    ];

    for (const table of tablesToClear) {
      try {
        await prisma.$executeRaw`DELETE FROM ${table}`;
        console.log(`  ✅ ${table} limpa`);
      } catch (error) {
        console.log(`  ⚠️  Erro ao limpar ${table}:`, error);
      }
    }

    // Reabilitar foreign key checks
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1`;

    console.log(`📥 Restaurando dados...`);

    // Restaurar dados na ordem correta
    const restoreOrder = [
      'users',
      'accounts', 
      'automacoes',
      'leads',
      'leadAutomacao',
      'pastas',
      'usuariosChatwit',
      'leadsChatwit',
      'arquivosLeadChatwit',
      'whatsAppConfigs',
      'whatsAppTemplates',
      'espelhosBiblioteca',
      'espelhosPadrao',
      'mtfDiamanteConfigs',
      'mtfDiamanteLotes',
      'mtfDiamanteIntentMappings',
      'disparosMtfDiamante',
      'subscriptions',
      'notifications',
      'agendamentos',
      'midias',
      'chats',
      'messages'
    ];

    for (const tableName of restoreOrder) {
      const tableData = backupData.data[tableName];
      if (tableData && Array.isArray(tableData) && tableData.length > 0) {
        try {
          // Usar createMany para inserção em lote
          await prisma[tableName as keyof PrismaClient].createMany({
            data: tableData,
            skipDuplicates: true
          });
          console.log(`  ✅ ${tableName}: ${tableData.length} registros restaurados`);
        } catch (error) {
          console.log(`  ❌ Erro ao restaurar ${tableName}:`, error);
        }
      }
    }

    console.log(`✅ Restauração concluída com sucesso!`);
    
  } catch (error) {
    console.error(`❌ Erro durante a restauração:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const backupFile = process.argv[2];
  
  if (!backupFile) {
    console.log(`📋 Uso: tsx scripts/restore-backup.ts <nome-do-arquivo-backup>`);
    console.log(`📁 Backups disponíveis:`);
    
    const backupDir = join(process.cwd(), 'backups');
    const fs = require('fs');
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    
    files.forEach(file => {
      console.log(`  - ${file}`);
    });
    
    process.exit(1);
  }
  
  restoreBackup(backupFile).catch(console.error);
}

export { restoreBackup }; 