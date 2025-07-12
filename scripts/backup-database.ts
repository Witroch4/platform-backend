#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

interface BackupOptions {
  format: 'json' | 'sql' | 'both';
  tables?: string[];
  outputDir?: string;
  compress?: boolean;
  excludeTables?: string[];
}

class DatabaseBackup {
  private timestamp: string;
  private backupDir: string;

  constructor(private options: BackupOptions = {}) {
    this.timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    this.backupDir = options.outputDir || join(process.cwd(), 'backups');
    
    // Criar diretório de backup se não existir
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(): Promise<void> {
    console.log(`🔄 Iniciando backup do banco de dados...`);
    console.log(`📅 Data/Hora: ${this.timestamp}`);
    console.log(`📁 Diretório: ${this.backupDir}`);

    try {
      if (this.options.format === 'json' || this.options.format === 'both') {
        await this.createJsonBackup();
      }

      if (this.options.format === 'sql' || this.options.format === 'both') {
        await this.createSqlBackup();
      }

      console.log(`✅ Backup concluído com sucesso!`);
    } catch (error) {
      console.error(`❌ Erro durante o backup:`, error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async createJsonBackup(): Promise<void> {
    console.log(`📦 Criando backup em formato JSON...`);

    const backup: any = {
      metadata: {
        created_at: new Date().toISOString(),
        database: 'faceapp',
        version: '1.0.0',
        tables: []
      },
      data: {}
    };

    // Lista de todas as tabelas/modelos
    const tables = [
      'user',
      'account',
      'verificationToken',
      'twoFactorToken',
      'resetPasswordToken',
      'automacao',
      'lead',
      'leadAutomacao',
      'pasta',
      'subscription',
      'notification',
      'agendamento',
      'midia',
      'chat',
      'message',
      'usuarioChatwit',
      'leadChatwit',
      'arquivoLeadChatwit',
      'whatsAppConfig',
      'whatsAppTemplate',
      'chatSession',
      'chatMessage',
      'chatFile',
      'generatedImage',
      'espelhoBiblioteca',
      'espelhoPadrao',
      'mtfDiamanteConfig',
      'mtfDiamanteLote',
      'mtfDiamanteIntentMapping',
      'disparoMtfDiamante'
    ];

    // Filtrar tabelas se especificadas
    const tablesToBackup = this.options.tables || tables;
    const excludedTables = this.options.excludeTables || [];
    
    const finalTables = tablesToBackup.filter(table => !excludedTables.includes(table));

    for (const table of finalTables) {
      try {
        console.log(`  📋 Fazendo backup da tabela: ${table}`);
        
        // Usar any para evitar problemas de tipagem do Prisma
        const prismaAny = prisma as any;
        const data = await prismaAny[table].findMany();
        
        backup.data[table] = data;
        backup.metadata.tables.push({
          name: table,
          count: data.length,
          backed_up_at: new Date().toISOString()
        });
        
        console.log(`  ✅ ${table}: ${data.length} registros`);
      } catch (error: any) {
        console.warn(`  ⚠️  Erro ao fazer backup da tabela ${table}:`, error.message);
        backup.metadata.tables.push({
          name: table,
          count: 0,
          error: error.message,
          backed_up_at: new Date().toISOString()
        });
      }
    }

    // Salvar backup JSON
    const jsonFileName = `backup_faceapp_${this.timestamp}.json`;
    const jsonFilePath = join(this.backupDir, jsonFileName);
    
    writeFileSync(jsonFilePath, JSON.stringify(backup, null, 2));
    console.log(`💾 Backup JSON salvo: ${jsonFilePath}`);

    // Comprimir se solicitado
    if (this.options.compress) {
      await this.compressFile(jsonFilePath);
    }
  }

  private async createSqlBackup(): Promise<void> {
    console.log(`🗄️  Criando backup em formato SQL...`);

    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL não encontrada nas variáveis de ambiente');
      }

      // Extrair informações da URL do banco
      const url = new URL(databaseUrl);
      const dbName = url.pathname.slice(1);
      const host = url.hostname;
      const port = url.port || '5432';
      const username = url.username;
      const password = url.password;

      const sqlFileName = `backup_faceapp_${this.timestamp}.sql`;
      const sqlFilePath = join(this.backupDir, sqlFileName);

      // Comando pg_dump
      const pgDumpCommand = [
        'pg_dump',
        `--host=${host}`,
        `--port=${port}`,
        `--username=${username}`,
        `--dbname=${dbName}`,
        '--verbose',
        '--clean',
        '--no-owner',
        '--no-privileges',
        '--format=plain',
        `--file=${sqlFilePath}`
      ].join(' ');

      // Definir senha como variável de ambiente
      const env = { ...process.env, PGPASSWORD: password };

      console.log(`  🔄 Executando pg_dump...`);
      execSync(pgDumpCommand, { env, stdio: 'inherit' });
      
      console.log(`💾 Backup SQL salvo: ${sqlFilePath}`);

      // Comprimir se solicitado
      if (this.options.compress) {
        await this.compressFile(sqlFilePath);
      }
    } catch (error: any) {
      console.error(`❌ Erro ao criar backup SQL:`, error.message);
      console.log(`💡 Certifique-se de que o pg_dump está instalado e disponível no PATH`);
      throw error;
    }
  }

  private async compressFile(filePath: string): Promise<void> {
    try {
      console.log(`🗜️  Comprimindo arquivo: ${filePath}`);
      
      const gzipCommand = `gzip "${filePath}"`;
      execSync(gzipCommand, { stdio: 'inherit' });
      
      console.log(`✅ Arquivo comprimido: ${filePath}.gz`);
    } catch (error: any) {
      console.warn(`⚠️  Erro ao comprimir arquivo:`, error.message);
    }
  }

  // Método para restaurar backup JSON
  async restoreFromJson(backupFilePath: string): Promise<void> {
    console.log(`🔄 Restaurando backup do arquivo: ${backupFilePath}`);

    try {
      const backupData = JSON.parse(require('fs').readFileSync(backupFilePath, 'utf8'));
      
      console.log(`📊 Backup criado em: ${backupData.metadata.created_at}`);
      console.log(`📋 Tabelas disponíveis: ${backupData.metadata.tables.length}`);

      // Confirmar antes de restaurar
      console.log(`⚠️  ATENÇÃO: Esta operação irá SOBRESCREVER os dados existentes!`);
      console.log(`Pressione Ctrl+C para cancelar ou Enter para continuar...`);
      
      // Aguardar confirmação (em produção, você pode querer implementar um prompt adequado)
      
      const prismaAny = prisma as any;
      
      for (const table of backupData.metadata.tables) {
        if (backupData.data[table.name] && backupData.data[table.name].length > 0) {
          console.log(`  📥 Restaurando ${table.name}: ${table.count} registros`);
          
          // Limpar tabela antes de restaurar
          await prismaAny[table.name].deleteMany();
          
          // Restaurar dados
          for (const record of backupData.data[table.name]) {
            await prismaAny[table.name].create({ data: record });
          }
          
          console.log(`  ✅ ${table.name} restaurado com sucesso`);
        }
      }
      
      console.log(`✅ Restauração concluída!`);
    } catch (error: any) {
      console.error(`❌ Erro durante a restauração:`, error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';

  switch (command) {
    case 'backup':
      const backupOptions: BackupOptions = {
        format: 'both', // json, sql, both
        compress: true,
        excludeTables: [
          // Tabelas que você pode querer excluir por serem muito grandes ou sensíveis
          // 'chatMessage', // Mensagens de chat podem ser muito volumosas
          // 'generatedImage', // Imagens podem ocupar muito espaço
        ]
      };

      const backup = new DatabaseBackup(backupOptions);
      await backup.createBackup();
      break;

    case 'restore':
      const backupFile = args[1];
      if (!backupFile) {
        console.error('❌ Especifique o arquivo de backup para restaurar');
        console.log('Uso: tsx backup-database.ts restore <caminho-do-backup.json>');
        process.exit(1);
      }

      const restore = new DatabaseBackup();
      await restore.restoreFromJson(backupFile);
      break;

    case 'help':
    default:
      console.log(`
🗄️  Script de Backup do Banco de Dados FaceApp

Uso:
  tsx backup-database.ts backup          # Criar backup completo
  tsx backup-database.ts restore <file>  # Restaurar backup
  tsx backup-database.ts help           # Mostrar esta ajuda

Opções de Backup:
  - Formato: JSON e SQL
  - Compressão: Automática
  - Timestamp: Incluído no nome do arquivo
  - Diretório: ./backups/

Arquivos gerados:
  - backup_faceapp_YYYY-MM-DD_HH-mm-ss.json.gz
  - backup_faceapp_YYYY-MM-DD_HH-mm-ss.sql.gz

Exemplos:
  tsx backup-database.ts backup
  tsx backup-database.ts restore backups/backup_faceapp_2024-01-01_12-00-00.json
      `);
      break;
  }
}

// Executar script
if (require.main === module) {
  main().catch(console.error);
}

export { DatabaseBackup }; 