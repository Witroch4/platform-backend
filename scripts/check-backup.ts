#!/usr/bin/env tsx

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function checkBackup(backupFileName: string) {
  console.log(`🔍 Verificando backup: ${backupFileName}\n`);

  const backupPath = join(process.cwd(), 'backups', backupFileName);
  
  if (!existsSync(backupPath)) {
    console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
    return;
  }

  try {
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    console.log('📊 Estrutura do backup:');
    console.log('============================================');
    
    Object.keys(backupData).forEach((modelName, index) => {
      const data = backupData[modelName];
      const count = Array.isArray(data) ? data.length : 0;
      console.log(`${index + 1}. ${modelName}: ${count} registros`);
      
      // Mostrar alguns exemplos para modelos importantes
      if (modelName === 'Lead' && count > 0) {
        console.log(`   📝 Exemplo de Lead:`, data[0]);
      }
      if (modelName === 'LeadOabData' && count > 0) {
        console.log(`   📝 Exemplo de LeadOabData:`, data[0]);
      }
      if (modelName === 'User' && count > 0) {
        console.log(`   📝 Exemplo de User:`, data[0]);
      }
    });
    
    console.log('============================================');
    console.log(`📈 Total de modelos: ${Object.keys(backupData).length}`);
    
    const totalRecords = Object.values(backupData).reduce((total: number, data: any) => {
      return total + (Array.isArray(data) ? data.length : 0);
    }, 0);
    
    console.log(`📊 Total de registros: ${totalRecords}`);
    
  } catch (error) {
    console.error('❌ Erro ao ler backup:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const backupFile = process.argv[2] || 'backup-2025-07-28T23-37-41-851Z.json';
  checkBackup(backupFile);
}

export { checkBackup };