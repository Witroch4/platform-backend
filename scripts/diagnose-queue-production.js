#!/usr/bin/env node

/**
 * Script para diagnosticar problemas de fila em produção
 * Verifica Redis, jobs pendentes, workers ativos e recursos
 */

const { getRedisInstance } = require('../lib/connections');
const { Queue } = require('bullmq');

async function diagnoseQueueProduction() {
  console.log('🔍 Diagnóstico de Filas em Produção');
  console.log('=====================================\n');

  try {
    // 1. Verificar conexão Redis
    console.log('1. 📡 Verificando conexão Redis...');
    const redis = getRedisInstance();
    const redisInfo = await redis.info('memory');
    const redisStats = await redis.info('stats');
    
    console.log('   ✅ Redis conectado');
    console.log(`   📊 Memória usada: ${extractRedisValue(redisInfo, 'used_memory_human')}`);
    console.log(`   📊 Conexões: ${extractRedisValue(redisStats, 'connected_clients')}`);
    console.log(`   📊 Comandos processados: ${extractRedisValue(redisStats, 'total_commands_processed')}\n`);

    // 2. Verificar fila de leads-chatwit
    console.log('2. 📋 Verificando fila leads-chatwit...');
    const leadsQueue = new Queue('filaLeadsChatwit', { connection: redis });
    
    const waiting = await leadsQueue.getWaiting();
    const active = await leadsQueue.getActive();
    const completed = await leadsQueue.getCompleted();
    const failed = await leadsQueue.getFailed();
    
    console.log(`   📊 Jobs aguardando: ${waiting.length}`);
    console.log(`   📊 Jobs ativos: ${active.length}`);
    console.log(`   📊 Jobs concluídos: ${completed.length}`);
    console.log(`   📊 Jobs falhados: ${failed.length}`);
    
    // 3. Verificar jobs específicos não processados
    if (waiting.length > 0) {
      console.log('\n   🔍 Jobs aguardando processamento:');
      waiting.slice(0, 5).forEach(job => {
        console.log(`      - Job ${job.id}: ${job.data.payload?.origemLead?.source_id || 'N/A'}`);
      });
    }
    
    if (active.length > 0) {
      console.log('\n   ⚙️ Jobs sendo processados:');
      active.forEach(job => {
        console.log(`      - Job ${job.id}: ${job.data.payload?.origemLead?.source_id || 'N/A'}`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\n   ❌ Jobs falhados (últimos 3):');
      failed.slice(-3).forEach(job => {
        console.log(`      - Job ${job.id}: ${job.failedReason}`);
      });
    }

    // 4. Verificar configurações do worker
    console.log('\n3. ⚙️ Configurações do ambiente:');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   REDIS_HOST: ${process.env.REDIS_HOST}`);
    console.log(`   LEADS_CHATWIT_CONCURRENCY: ${process.env.LEADS_CHATWIT_CONCURRENCY || '10 (padrão)'}`);
    
    // 5. Verificar recursos do sistema
    console.log('\n4. 💻 Recursos do sistema:');
    const memUsage = process.memoryUsage();
    console.log(`   Memória heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`   Memória externa: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
    console.log(`   Uptime: ${Math.round(process.uptime())}s`);

    // 6. Recomendações
    console.log('\n5. 💡 Recomendações:');
    
    if (waiting.length > active.length * 2) {
      console.log('   ⚠️ Muitos jobs aguardando vs ativos - considere aumentar concorrência');
    }
    
    if (failed.length > completed.length * 0.1) {
      console.log('   ⚠️ Taxa de falha alta - verifique logs de erro');
    }
    
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsageMB > 800) {
      console.log('   ⚠️ Uso de memória alto - considere aumentar limite do container');
    }
    
    if (waiting.length === 0 && active.length === 0 && completed.length > 0) {
      console.log('   ✅ Fila processando normalmente');
    }

    console.log('\n✅ Diagnóstico concluído');
    
  } catch (error) {
    console.error('❌ Erro durante diagnóstico:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

function extractRedisValue(info, key) {
  const lines = info.split('\r\n');
  const line = lines.find(l => l.startsWith(key + ':'));
  return line ? line.split(':')[1] : 'N/A';
}

// Executar se chamado diretamente
if (require.main === module) {
  diagnoseQueueProduction();
}

module.exports = { diagnoseQueueProduction };