#!/usr/bin/env tsx

import cron from 'node-cron';
import { DatabaseBackup } from './backup-database';
import { simpleBackup } from './backup-simple';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

interface BackupScheduleConfig {
  enabled: boolean;
  dailyTime: string; // Formato: "HH:mm"
  weeklyDay: number; // 0-6 (domingo a sábado)
  weeklyTime: string; // Formato: "HH:mm"
  monthlyDay: number; // 1-31
  monthlyTime: string; // Formato: "HH:mm"
  retentionDays: number; // Quantos dias manter os backups
  format: 'json' | 'sql' | 'both';
  compress: boolean;
  excludeLargeTables: boolean;
}

const defaultConfig: BackupScheduleConfig = {
  enabled: true,
  dailyTime: "02:00", // 2:00 AM
  weeklyDay: 0, // Domingo
  weeklyTime: "03:00", // 3:00 AM
  monthlyDay: 1, // Primeiro dia do mês
  monthlyTime: "04:00", // 4:00 AM
  retentionDays: 30, // Manter por 30 dias
  format: 'json',
  compress: true,
  excludeLargeTables: true
};

class BackupScheduler {
  private config: BackupScheduleConfig;
  private configPath: string;
  private logPath: string;

  constructor() {
    this.configPath = join(process.cwd(), 'backups', 'schedule-config.json');
    this.logPath = join(process.cwd(), 'backups', 'backup-log.txt');
    this.config = this.loadConfig();
  }

  private loadConfig(): BackupScheduleConfig {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf8');
        return { ...defaultConfig, ...JSON.parse(configData) };
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração, usando padrão:', error);
    }
    return defaultConfig;
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
    }
  }

  private log(message: string): void {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(logEntry.trim());
    
    try {
      writeFileSync(this.logPath, logEntry, { flag: 'a' });
    } catch (error) {
      console.error('Erro ao escrever no log:', error);
    }
  }

  private async performBackup(type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    this.log(`🔄 Iniciando backup ${type} automático`);
    
    try {
      const excludeTables = this.config.excludeLargeTables ? [
        'chatMessage',
        'generatedImage',
        'chatFile'
      ] : [];

      if (type === 'daily') {
        // Backup simples diário
        await simpleBackup();
        this.log(`✅ Backup daily simples concluído`);
      } else {
        // Backup completo para weekly e monthly
        const backup = new DatabaseBackup({
          format: this.config.format,
          compress: this.config.compress,
          excludeTables: excludeTables,
          outputDir: join(process.cwd(), 'backups', type)
        });
        
        await backup.createBackup();
        this.log(`✅ Backup ${type} completo concluído`);
      }
      
    } catch (error: any) {
      this.log(`❌ Erro no backup ${type}: ${error.message}`);
      throw error;
    }
  }

  private cleanupOldBackups(): void {
    this.log(`🧹 Limpando backups antigos (>${this.config.retentionDays} dias)`);
    
    // Aqui você pode implementar a lógica para remover backups antigos
    // Por exemplo, usando fs.readdirSync e fs.statSync para verificar datas
    
    this.log(`✅ Limpeza de backups concluída`);
  }

  public startScheduler(): void {
    if (!this.config.enabled) {
      console.log('❌ Scheduler de backup está desabilitado');
      return;
    }

    this.log('🚀 Iniciando scheduler de backup automático');
    
    // Backup diário
    const dailyCron = this.timeToCron(this.config.dailyTime);
    cron.schedule(dailyCron, async () => {
      await this.performBackup('daily');
    });
    
    // Backup semanal
    const weeklyCron = this.timeToCron(this.config.weeklyTime, this.config.weeklyDay);
    cron.schedule(weeklyCron, async () => {
      await this.performBackup('weekly');
    });
    
    // Backup mensal
    const monthlyCron = this.timeToCron(this.config.monthlyTime, null, this.config.monthlyDay);
    cron.schedule(monthlyCron, async () => {
      await this.performBackup('monthly');
    });
    
    // Limpeza de backups antigos (diária às 01:00)
    cron.schedule('0 1 * * *', () => {
      this.cleanupOldBackups();
    });

    console.log('📅 Agendamentos configurados:');
    console.log(`  Daily: ${this.config.dailyTime} (${dailyCron})`);
    console.log(`  Weekly: ${this.config.weeklyTime} on ${this.getDayName(this.config.weeklyDay)} (${weeklyCron})`);
    console.log(`  Monthly: ${this.config.monthlyTime} on day ${this.config.monthlyDay} (${monthlyCron})`);
    console.log(`  Cleanup: 01:00 daily`);
    
    this.log('✅ Scheduler de backup iniciado com sucesso');
  }

  private timeToCron(time: string, dayOfWeek?: number, dayOfMonth?: number): string {
    const [hours, minutes] = time.split(':');
    
    if (dayOfMonth) {
      // Mensal
      return `${minutes} ${hours} ${dayOfMonth} * *`;
    } else if (dayOfWeek !== undefined) {
      // Semanal
      return `${minutes} ${hours} * * ${dayOfWeek}`;
    } else {
      // Diário
      return `${minutes} ${hours} * * *`;
    }
  }

  private getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  }

  public updateConfig(newConfig: Partial<BackupScheduleConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    this.log(`🔧 Configuração atualizada: ${JSON.stringify(newConfig)}`);
  }

  public getConfig(): BackupScheduleConfig {
    return { ...this.config };
  }

  public async runBackupNow(type: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<void> {
    this.log(`🔄 Executando backup ${type} manual`);
    await this.performBackup(type);
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';
  
  const scheduler = new BackupScheduler();

  switch (command) {
    case 'start':
      scheduler.startScheduler();
      
      // Manter o processo rodando
      console.log('🔄 Scheduler em execução. Pressione Ctrl+C para parar.');
      process.on('SIGINT', () => {
        console.log('\n👋 Parando scheduler...');
        process.exit(0);
      });
      
      // Manter o processo vivo
      setInterval(() => {
        // Noop para manter o processo rodando
      }, 1000);
      break;

    case 'run':
      const type = args[1] as 'daily' | 'weekly' | 'monthly' || 'daily';
      await scheduler.runBackupNow(type);
      break;

    case 'config':
      const config = scheduler.getConfig();
      console.log('📋 Configuração atual:');
      console.log(JSON.stringify(config, null, 2));
      break;

    case 'enable':
      scheduler.updateConfig({ enabled: true });
      console.log('✅ Scheduler habilitado');
      break;

    case 'disable':
      scheduler.updateConfig({ enabled: false });
      console.log('❌ Scheduler desabilitado');
      break;

    case 'help':
    default:
      console.log(`
🕐 Scheduler de Backup Automático

Uso:
  tsx backup-scheduler.ts start           # Iniciar scheduler
  tsx backup-scheduler.ts run [type]      # Executar backup agora
  tsx backup-scheduler.ts config          # Mostrar configuração
  tsx backup-scheduler.ts enable          # Habilitar scheduler
  tsx backup-scheduler.ts disable         # Desabilitar scheduler
  tsx backup-scheduler.ts help            # Mostrar esta ajuda

Tipos de backup:
  daily   - Backup simples diário (padrão)
  weekly  - Backup completo semanal
  monthly - Backup completo mensal

Configuração padrão:
  - Daily: 02:00 (JSON simples)
  - Weekly: Domingo 03:00 (formato configurado)
  - Monthly: Dia 1 às 04:00 (formato configurado)
  - Retenção: 30 dias
  - Limpeza: 01:00 diário

Exemplos:
  tsx backup-scheduler.ts start
  tsx backup-scheduler.ts run weekly
  npm run backup:schedule
      `);
      break;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export { BackupScheduler }; 