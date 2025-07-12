#!/usr/bin/env tsx

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  metadata?: {
    created_at: string;
    database: string;
    version: string;
    backup_type?: string;
  };
  totalRecords?: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function listBackups(): BackupInfo[] {
  const backupDir = join(process.cwd(), 'backups');
  
  if (!existsSync(backupDir)) {
    console.log('📁 Diretório de backups não encontrado');
    return [];
  }

  const files = readdirSync(backupDir);
  const backups: BackupInfo[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = join(backupDir, file);
      const stats = statSync(filePath);
      
      let metadata;
      let totalRecords;
      
      try {
        const content = readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        metadata = data.metadata;
        
        if (data.data) {
          totalRecords = Object.values(data.data).reduce((sum: number, table: any) => sum + table.length, 0);
        }
      } catch (error) {
        // Arquivo corrompido ou formato inválido
      }

      backups.push({
        filename: file,
        path: filePath,
        size: stats.size,
        created: stats.mtime,
        metadata,
        totalRecords
      });
    }
  }

  return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
}

function showBackupsList() {
  console.log('📋 Lista de Backups Disponíveis\n');
  
  const backups = listBackups();
  
  if (backups.length === 0) {
    console.log('❌ Nenhum backup encontrado');
    return;
  }

  console.log(`Total: ${backups.length} backup(s) encontrado(s)\n`);
  
  for (const backup of backups) {
    console.log(`📄 ${backup.filename}`);
    console.log(`   Data: ${format(backup.created, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}`);
    console.log(`   Tamanho: ${formatSize(backup.size)}`);
    
    if (backup.metadata) {
      console.log(`   Banco: ${backup.metadata.database || 'desconhecido'}`);
      console.log(`   Tipo: ${backup.metadata.backup_type || 'completo'}`);
      console.log(`   Versão: ${backup.metadata.version || 'desconhecida'}`);
    }
    
    if (backup.totalRecords) {
      console.log(`   Registros: ${backup.totalRecords.toLocaleString()}`);
    }
    
    console.log(`   Caminho: ${backup.path}`);
    console.log('');
  }
}

function showBackupInfo(filename: string) {
  const backupDir = join(process.cwd(), 'backups');
  const filePath = join(backupDir, filename);
  
  if (!existsSync(filePath)) {
    console.log(`❌ Backup não encontrado: ${filename}`);
    return;
  }

  console.log(`🔍 Informações Detalhadas: ${filename}\n`);
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const stats = statSync(filePath);
    
    console.log(`📄 Arquivo: ${filename}`);
    console.log(`📅 Data de Criação: ${format(stats.mtime, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}`);
    console.log(`💾 Tamanho: ${formatSize(stats.size)}`);
    console.log(`📍 Caminho: ${filePath}`);
    
    if (data.metadata) {
      console.log(`\n📊 Metadados:`);
      console.log(`   Banco: ${data.metadata.database || 'desconhecido'}`);
      console.log(`   Tipo: ${data.metadata.backup_type || 'completo'}`);
      console.log(`   Versão: ${data.metadata.version || 'desconhecida'}`);
      console.log(`   Backup criado em: ${format(new Date(data.metadata.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}`);
    }
    
    if (data.data) {
      console.log(`\n🗄️  Tabelas (${Object.keys(data.data).length}):`);
      
      let totalRecords = 0;
      for (const [table, records] of Object.entries(data.data)) {
        const recordCount = (records as any[]).length;
        totalRecords += recordCount;
        
        if (recordCount > 0) {
          console.log(`   ${table}: ${recordCount.toLocaleString()} registros`);
        }
      }
      
      console.log(`\n📈 Total de Registros: ${totalRecords.toLocaleString()}`);
    }
    
  } catch (error: any) {
    console.log(`❌ Erro ao ler backup: ${error.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'list':
      showBackupsList();
      break;
      
    case 'info':
      const filename = args[1];
      if (!filename) {
        console.log('❌ Uso: npm run backup:info <nome-do-arquivo>');
        process.exit(1);
      }
      showBackupInfo(filename);
      break;
      
    default:
      console.log(`
🛠️  Utilitários de Backup

Comandos disponíveis:
  list    - Listar todos os backups disponíveis
  info    - Mostrar informações detalhadas de um backup

Uso:
  npm run backup:list
  npm run backup:info <nome-do-arquivo>

Exemplos:
  npm run backup:list
  npm run backup:info backup_simple_2024-01-01_12-00-00.json
      `);
  }
}

if (require.main === module) {
  main();
}

export { listBackups, showBackupsList, showBackupInfo };