#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';

async function checkBackup() {
  console.log('🔍 Verificando conteúdo do backup...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));

    console.log(`📅 Backup de: ${backupData.metadata.created_at}`);
    console.log(`📊 Total de tabelas: ${Object.keys(backupData.data).length}`);

    // Listar todas as tabelas e suas contagens
    for (const [tableName, tableData] of Object.entries(backupData.data)) {
      const count = Array.isArray(tableData) ? tableData.length : 0;
      console.log(`  ${tableName}: ${count} registros`);
      
      // Mostrar alguns exemplos para tabelas importantes
      if (tableName === 'leadsChatwit' && count > 0) {
        console.log(`    Exemplo de lead: ${(tableData as any[])[0].name || 'Sem nome'} (usuarioId: ${(tableData as any[])[0].usuarioId})`);
      }
    }

  } catch (error) {
    console.error('❌ Erro ao verificar backup:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkBackup().catch(console.error);
}

export { checkBackup }; 