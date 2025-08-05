import { getPrismaInstance } from "@/lib/connections";
import { cleanupExpiredLogs, getLogsStatistics } from '../lib/ai-integration/jobs/cleanup-expired-logs';

const prisma = getPrismaInstance();

/**
 * Script para configurar a limpeza automática de logs
 * Tenta usar pg_cron se disponível, senão configura job alternativo
 */
async function setupLogCleanup() {
  console.log('🧹 Setting up automatic log cleanup...');
  
  try {
    // Verificar se pg_cron está disponível
    const pgCronAvailable = await checkPgCronAvailability();
    
    if (pgCronAvailable) {
      await setupPgCronCleanup();
    } else {
      console.log('⚠️ pg_cron not available, using application-level scheduling');
      await setupAppLevelCleanup();
    }
    
    // Mostrar estatísticas atuais
    await showCurrentStatistics();
    
  } catch (error) {
    console.error('❌ Error setting up log cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Verifica se pg_cron está disponível no banco
 */
async function checkPgCronAvailability(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT cron.schedule('test-check', '0 0 * * *', 'SELECT 1');`;
    await prisma.$queryRaw`SELECT cron.unschedule('test-check');`;
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Configura limpeza usando pg_cron (executa a cada 6 horas)
 */
async function setupPgCronCleanup() {
  console.log('📅 Setting up pg_cron cleanup job...');
  
  try {
    // Remove job existente se houver
    await prisma.$queryRaw`
      SELECT cron.unschedule('ai-logs-cleanup') 
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'ai-logs-cleanup'
      );
    `;
    
    // Cria novo job que executa a cada 6 horas
    await prisma.$queryRaw`
      SELECT cron.schedule(
        'ai-logs-cleanup',
        '0 */6 * * *',
        $$
        DELETE FROM "LlmAudit" WHERE "expiresAt" < NOW();
        DELETE FROM "IntentHitLog" WHERE "expiresAt" < NOW();
        $$
      );
    `;
    
    console.log('✅ pg_cron cleanup job scheduled successfully');
    console.log('   - Job name: ai-logs-cleanup');
    console.log('   - Schedule: Every 6 hours (0 */6 * * *)');
    console.log('   - Action: Delete expired LlmAudit and IntentHitLog records');
    
  } catch (error) {
    console.error('❌ Error setting up pg_cron job:', error);
    throw error;
  }
}

/**
 * Configura limpeza no nível da aplicação
 */
async function setupAppLevelCleanup() {
  console.log('🔧 Setting up application-level cleanup...');
  
  // Criar configuração no SystemConfig para controlar o cleanup
  await prisma.systemConfig.upsert({
    where: { key: 'ai_logs_cleanup_enabled' },
    update: { 
      value: true,
      description: 'Enable automatic cleanup of expired AI logs',
      category: 'ai_integration'
    },
    create: {
      key: 'ai_logs_cleanup_enabled',
      value: true,
      description: 'Enable automatic cleanup of expired AI logs',
      category: 'ai_integration'
    }
  });
  
  await prisma.systemConfig.upsert({
    where: { key: 'ai_logs_cleanup_interval_hours' },
    update: { 
      value: 6,
      description: 'Interval in hours between cleanup runs',
      category: 'ai_integration'
    },
    create: {
      key: 'ai_logs_cleanup_interval_hours',
      value: 6,
      description: 'Interval in hours between cleanup runs',
      category: 'ai_integration'
    }
  });
  
  console.log('✅ Application-level cleanup configuration saved');
  console.log('   - Add the following to your application startup:');
  console.log('   - import { schedulePeriodicCleanup } from "./lib/ai-integration/jobs/cleanup-expired-logs"');
  console.log('   - schedulePeriodicCleanup(6); // 6 hours interval');
}

/**
 * Mostra estatísticas atuais dos logs
 */
async function showCurrentStatistics() {
  console.log('\n📊 Current logs statistics:');
  
  try {
    const stats = await getLogsStatistics();
    
    console.log('\n  LlmAudit:');
    console.log(`    - Total records: ${stats.llmAudit.total}`);
    console.log(`    - Expiring in 24h: ${stats.llmAudit.expiringSoon}`);
    if (stats.llmAudit.oldestRecord) {
      console.log(`    - Oldest record: ${stats.llmAudit.oldestRecord.toISOString()}`);
    }
    
    console.log('\n  IntentHitLog:');
    console.log(`    - Total records: ${stats.intentHitLog.total}`);
    console.log(`    - Expiring in 24h: ${stats.intentHitLog.expiringSoon}`);
    if (stats.intentHitLog.oldestRecord) {
      console.log(`    - Oldest record: ${stats.intentHitLog.oldestRecord.toISOString()}`);
    }
    
  } catch (error) {
    console.error('⚠️ Error getting statistics:', error);
  }
}

/**
 * Executa limpeza manual para teste
 */
async function runManualCleanup() {
  console.log('\n🧹 Running manual cleanup for testing...');
  
  try {
    const result = await cleanupExpiredLogs();
    console.log(`✅ Manual cleanup completed:`);
    console.log(`   - LlmAudit deleted: ${result.llmAuditDeleted}`);
    console.log(`   - IntentHitLog deleted: ${result.intentHitLogDeleted}`);
    console.log(`   - Total deleted: ${result.totalDeleted}`);
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error);
  }
}

// Executar setup se chamado diretamente
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'manual') {
    runManualCleanup().then(() => process.exit(0));
  } else {
    setupLogCleanup().then(() => process.exit(0));
  }
}

export { setupLogCleanup, runManualCleanup };