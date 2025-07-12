#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import readline from 'readline';

const prisma = new PrismaClient();

interface RestoreOptions {
  backupFile: string;
  tables?: string[];
  excludeTables?: string[];
  skipConfirmation?: boolean;
  createBackupBefore?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

interface BackupData {
  metadata: {
    created_at: string;
    database: string;
    version: string;
    backup_type?: string;
    tables?: any[];
  };
  data: Record<string, any[]>;
}

class DatabaseRestorer {
  private options: RestoreOptions;
  private rl: readline.Interface;
  private logPath: string;

  constructor(options: RestoreOptions) {
    this.options = options;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.logPath = join(process.cwd(), 'backups', `restore-log-${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.txt`);
  }

  private log(message: string): void {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const logEntry = `[${timestamp}] ${message}`;
    
    if (this.options.verbose) {
      console.log(logEntry);
    }
    
    try {
      writeFileSync(this.logPath, `${logEntry}\n`, { flag: 'a' });
    } catch (error) {
      console.error('Erro ao escrever no log:', error);
    }
  }

  private async confirmAction(message: string): Promise<boolean> {
    if (this.options.skipConfirmation) {
      return true;
    }

    return new Promise((resolve) => {
      this.rl.question(`${message} (s/N): `, (answer) => {
        resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim');
      });
    });
  }

  private async loadBackupData(): Promise<BackupData> {
    console.log(`📂 Carregando backup: ${this.options.backupFile}`);
    
    if (!existsSync(this.options.backupFile)) {
      throw new Error(`Arquivo de backup não encontrado: ${this.options.backupFile}`);
    }

    try {
      const fileContent = readFileSync(this.options.backupFile, 'utf8');
      const backupData: BackupData = JSON.parse(fileContent);
      
      this.log(`Backup carregado: ${this.options.backupFile}`);
      this.log(`Data do backup: ${backupData.metadata.created_at}`);
      this.log(`Banco de origem: ${backupData.metadata.database}`);
      
      return backupData;
    } catch (error: any) {
      throw new Error(`Erro ao ler arquivo de backup: ${error.message}`);
    }
  }

  private validateBackupData(backupData: BackupData): void {
    console.log(`🔍 Validando dados do backup...`);
    
    if (!backupData.metadata || !backupData.data) {
      throw new Error('Formato de backup inválido: metadata ou data ausentes');
    }

    if (!backupData.metadata.created_at) {
      throw new Error('Backup sem data de criação');
    }

    // Verificar se há dados para restaurar
    const totalRecords = Object.values(backupData.data).reduce((sum, table) => sum + table.length, 0);
    if (totalRecords === 0) {
      throw new Error('Backup não contém dados para restaurar');
    }

    console.log(`✅ Backup válido: ${totalRecords} registros em ${Object.keys(backupData.data).length} tabelas`);
    this.log(`Validação concluída: ${totalRecords} registros`);
  }

  private async createBackupBefore(): Promise<void> {
    if (!this.options.createBackupBefore) {
      return;
    }

    console.log(`💾 Criando backup de segurança antes da restauração...`);
    
    try {
      const { simpleBackup } = await import('./backup-simple');
      await simpleBackup();
      console.log(`✅ Backup de segurança criado`);
      this.log('Backup de segurança criado com sucesso');
    } catch (error: any) {
      console.warn(`⚠️  Falha ao criar backup de segurança: ${error.message}`);
      this.log(`Erro no backup de segurança: ${error.message}`);
      
      const proceed = await this.confirmAction('Continuar sem backup de segurança?');
      if (!proceed) {
        throw new Error('Restauração cancelada pelo usuário');
      }
    }
  }

  private getTableMappings(): Record<string, string> {
    // Mapeamento de nomes de tabelas do backup para modelos do Prisma
    return {
      'users': 'user',
      'accounts': 'account',
      'automacoes': 'automacao',
      'leads': 'lead',
      'leadAutomacao': 'leadAutomacao',
      'pastas': 'pasta',
      'usuariosChatwit': 'usuarioChatwit',
      'leadsChatwit': 'leadChatwit',
      'arquivosLeadChatwit': 'arquivoLeadChatwit',
      'whatsAppConfigs': 'whatsAppConfig',
      'whatsAppTemplates': 'whatsAppTemplate',
      'espelhosBiblioteca': 'espelhoBiblioteca',
      'espelhosPadrao': 'espelhoPadrao',
      'mtfDiamanteConfigs': 'mtfDiamanteConfig',
      'mtfDiamanteLotes': 'mtfDiamanteLote',
      'mtfDiamanteIntentMappings': 'mtfDiamanteIntentMapping',
      'disparosMtfDiamante': 'disparoMtfDiamante',
      'subscriptions': 'subscription',
      'notifications': 'notification',
      'agendamentos': 'agendamento',
      'midias': 'midia',
      'chats': 'chat',
      'messages': 'message',
      'verificationTokens': 'verificationToken',
      'twoFactorTokens': 'twoFactorToken',
      'resetPasswordTokens': 'resetPasswordToken',
      'chatSessions': 'chatSession',
      'chatMessages': 'chatMessage',
      'chatFiles': 'chatFile',
      'generatedImages': 'generatedImage'
    };
  }

  private getRestoreOrder(): string[] {
    // Ordem de restauração respeitando dependências
    return [
      'user',
      'account',
      'verificationToken',
      'twoFactorToken',
      'resetPasswordToken',
      'subscription',
      'notification',
      'pasta',
      'automacao',
      'lead',
      'leadAutomacao',
      'chat',
      'message',
      'agendamento',
      'midia',
      'usuarioChatwit',
      'leadChatwit',
      'arquivoLeadChatwit',
      'whatsAppConfig',
      'whatsAppTemplate',
      'espelhoBiblioteca',
      'espelhoPadrao',
      'mtfDiamanteConfig',
      'mtfDiamanteLote',
      'mtfDiamanteIntentMapping',
      'disparoMtfDiamante',
      'chatSession',
      'chatMessage',
      'chatFile',
      'generatedImage'
    ];
  }

  private async clearTable(tableName: string): Promise<void> {
    const prismaAny = prisma as any;
    
    if (prismaAny[tableName]) {
      try {
        const result = await prismaAny[tableName].deleteMany();
        this.log(`Tabela ${tableName} limpa: ${result.count || 0} registros removidos`);
      } catch (error: any) {
        console.warn(`⚠️  Erro ao limpar tabela ${tableName}: ${error.message}`);
        this.log(`Erro ao limpar ${tableName}: ${error.message}`);
      }
    }
  }

  private async restoreTable(tableName: string, data: any[]): Promise<number> {
    if (!data || data.length === 0) {
      return 0;
    }

    const prismaAny = prisma as any;
    
    if (!prismaAny[tableName]) {
      console.warn(`⚠️  Tabela ${tableName} não encontrada no modelo Prisma`);
      this.log(`Tabela ${tableName} não existe no modelo`);
      return 0;
    }

    let restoredCount = 0;
    const batchSize = 100; // Processar em lotes para melhor performance

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      try {
        for (const record of batch) {
          // Limpar campos que podem causar problemas
          const cleanRecord = this.cleanRecord(record);
          
          if (this.options.dryRun) {
            console.log(`[DRY RUN] Restauraria registro em ${tableName}:`, cleanRecord.id || 'sem ID');
          } else {
            await prismaAny[tableName].create({ data: cleanRecord });
          }
          restoredCount++;
        }
      } catch (error: any) {
        console.error(`❌ Erro ao restaurar lote em ${tableName}:`, error.message);
        this.log(`Erro no lote ${i}-${i + batchSize} de ${tableName}: ${error.message}`);
        
        // Tentar restaurar registro por registro se o lote falhar
        for (const record of batch) {
          try {
            const cleanRecord = this.cleanRecord(record);
            
            if (!this.options.dryRun) {
              await prismaAny[tableName].create({ data: cleanRecord });
            }
            restoredCount++;
          } catch (recordError: any) {
            console.error(`❌ Erro ao restaurar registro individual:`, recordError.message);
            this.log(`Erro em registro individual de ${tableName}: ${recordError.message}`);
          }
        }
      }
    }

    return restoredCount;
  }

  private cleanRecord(record: any): any {
    const cleaned = { ...record };
    
    // Converter strings de data para objetos Date se necessário
    const dateFields = ['createdAt', 'updatedAt', 'emailVerified', 'twoFactorAuthVerified', 'expires', 'lastMessage'];
    
    for (const field of dateFields) {
      if (cleaned[field] && typeof cleaned[field] === 'string') {
        try {
          cleaned[field] = new Date(cleaned[field]);
        } catch (error) {
          // Se não conseguir converter, manter o valor original
        }
      }
    }

    // Remover campos que podem causar problemas na restauração
    const problematicFields = ['_count', '__typename'];
    for (const field of problematicFields) {
      delete cleaned[field];
    }

    return cleaned;
  }

  private async showRestorePreview(backupData: BackupData): Promise<void> {
    console.log(`\n📋 Prévia da Restauração:`);
    console.log(`Data do backup: ${format(new Date(backupData.metadata.created_at), 'dd/MM/yyyy HH:mm:ss')}`);
    console.log(`Banco de origem: ${backupData.metadata.database || 'desconhecido'}`);
    console.log(`Tipo de backup: ${backupData.metadata.backup_type || 'completo'}`);
    
    const tableMappings = this.getTableMappings();
    const tablesToRestore = this.options.tables || Object.keys(backupData.data);
    const excludeTables = this.options.excludeTables || [];
    
    console.log(`\n📊 Tabelas a serem restauradas:`);
    
    let totalRecords = 0;
    for (const [backupTableName, records] of Object.entries(backupData.data)) {
      const prismaTableName = tableMappings[backupTableName] || backupTableName;
      
      // Verificar se deve incluir esta tabela
      const shouldInclude = tablesToRestore.includes(backupTableName) || tablesToRestore.includes(prismaTableName);
      const shouldExclude = excludeTables.includes(backupTableName) || excludeTables.includes(prismaTableName);
      
      if (shouldInclude && !shouldExclude && records.length > 0) {
        console.log(`  ${prismaTableName}: ${records.length} registros`);
        totalRecords += records.length;
      }
    }
    
    console.log(`\n📈 Total: ${totalRecords} registros`);
    
    if (this.options.dryRun) {
      console.log(`\n🔍 Modo DRY RUN: Nenhuma alteração será feita no banco de dados`);
    }
  }

  async restore(): Promise<void> {
    console.log(`🔄 Iniciando restauração do banco de dados...`);
    this.log(`Início da restauração: ${this.options.backupFile}`);

    try {
      // 1. Carregar e validar backup
      const backupData = await this.loadBackupData();
      this.validateBackupData(backupData);

      // 2. Mostrar prévia
      await this.showRestorePreview(backupData);

      // 3. Confirmar ação
      if (!this.options.dryRun) {
        const confirmed = await this.confirmAction(
          '\n⚠️  ATENÇÃO: Esta operação irá SOBRESCREVER todos os dados existentes!\nDeseja continuar?'
        );
        
        if (!confirmed) {
          console.log('❌ Restauração cancelada pelo usuário');
          this.log('Restauração cancelada pelo usuário');
          return;
        }
      }

      // 4. Criar backup de segurança
      await this.createBackupBefore();

      // 5. Executar restauração
      await this.executeRestore(backupData);

      console.log(`✅ Restauração concluída com sucesso!`);
      this.log('Restauração concluída com sucesso');

    } catch (error: any) {
      console.error(`❌ Erro durante a restauração:`, error.message);
      this.log(`Erro na restauração: ${error.message}`);
      throw error;
    } finally {
      this.rl.close();
      await prisma.$disconnect();
    }
  }

  private async executeRestore(backupData: BackupData): Promise<void> {
    const tableMappings = this.getTableMappings();
    const restoreOrder = this.getRestoreOrder();
    const tablesToRestore = this.options.tables || Object.keys(backupData.data);
    const excludeTables = this.options.excludeTables || [];

    console.log(`\n🗄️  ${this.options.dryRun ? 'Simulando' : 'Executando'} restauração...`);

    let totalRestored = 0;

    // Primeiro, limpar tabelas na ordem reversa
    if (!this.options.dryRun) {
      console.log(`🧹 Limpando tabelas existentes...`);
      const reversedOrder = [...restoreOrder].reverse();
      
      for (const prismaTableName of reversedOrder) {
        const backupTableName = Object.keys(tableMappings).find(
          key => tableMappings[key] === prismaTableName
        ) || prismaTableName;
        
        const shouldInclude = tablesToRestore.includes(backupTableName) || tablesToRestore.includes(prismaTableName);
        const shouldExclude = excludeTables.includes(backupTableName) || excludeTables.includes(prismaTableName);
        
        if (shouldInclude && !shouldExclude && backupData.data[backupTableName]) {
          await this.clearTable(prismaTableName);
        }
      }
    }

    // Restaurar na ordem correta
    for (const prismaTableName of restoreOrder) {
      const backupTableName = Object.keys(tableMappings).find(
        key => tableMappings[key] === prismaTableName
      ) || prismaTableName;
      
      const shouldInclude = tablesToRestore.includes(backupTableName) || tablesToRestore.includes(prismaTableName);
      const shouldExclude = excludeTables.includes(backupTableName) || excludeTables.includes(prismaTableName);
      
      if (shouldInclude && !shouldExclude && backupData.data[backupTableName]) {
        const data = backupData.data[backupTableName];
        
        if (data && data.length > 0) {
          console.log(`  📥 ${this.options.dryRun ? 'Simulando' : 'Restaurando'} ${prismaTableName}: ${data.length} registros`);
          
          const restored = await this.restoreTable(prismaTableName, data);
          totalRestored += restored;
          
          console.log(`  ✅ ${restored} registros ${this.options.dryRun ? 'simulados' : 'restaurados'}`);
          this.log(`${prismaTableName}: ${restored} registros restaurados`);
        }
      }
    }

    console.log(`\n📊 Total: ${totalRestored} registros ${this.options.dryRun ? 'simulados' : 'restaurados'}`);
    this.log(`Total de registros restaurados: ${totalRestored}`);
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
🔄 Restaurador de Banco de Dados FaceApp

Uso:
  tsx restore-database.ts <arquivo-backup> [opções]

Opções:
  --tables table1,table2       Restaurar apenas tabelas específicas
  --exclude table1,table2      Excluir tabelas específicas
  --skip-confirmation          Pular confirmações (cuidado!)
  --no-backup                  Não criar backup antes da restauração
  --dry-run                    Simular restauração sem alterar dados
  --verbose                    Logs detalhados
  --help                       Mostrar esta ajuda

Exemplos:
  # Restauração completa
  tsx restore-database.ts backups/backup_simple_2024-01-01_12-00-00.json

  # Restaurar apenas usuários e contas
  tsx restore-database.ts backup.json --tables users,accounts

  # Simular restauração
  tsx restore-database.ts backup.json --dry-run

  # Restauração sem backup de segurança
  tsx restore-database.ts backup.json --no-backup --skip-confirmation

  # Excluir tabelas grandes
  tsx restore-database.ts backup.json --exclude chatMessages,generatedImages
    `);
    return;
  }

  const backupFile = command;
  
  // Processar argumentos
  const options: RestoreOptions = {
    backupFile,
    skipConfirmation: args.includes('--skip-confirmation'),
    createBackupBefore: !args.includes('--no-backup'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose')
  };

  // Processar tabelas específicas
  const tablesIndex = args.indexOf('--tables');
  if (tablesIndex !== -1 && args[tablesIndex + 1]) {
    options.tables = args[tablesIndex + 1].split(',').map(t => t.trim());
  }

  // Processar exclusões
  const excludeIndex = args.indexOf('--exclude');
  if (excludeIndex !== -1 && args[excludeIndex + 1]) {
    options.excludeTables = args[excludeIndex + 1].split(',').map(t => t.trim());
  }

  // Executar restauração
  const restorer = new DatabaseRestorer(options);
  await restorer.restore();
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

export { DatabaseRestorer }; 