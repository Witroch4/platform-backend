#!/usr/bin/env tsx

/**
 * Script para registrar filas existentes no sistema de monitoramento
 * 
 * Uso:
 * npx tsx scripts/register-queues-for-monitoring.ts
 */

import { registerQueueForMonitoring } from '../lib/monitoring/queue-monitor';
import { initializeMonitoring } from '../lib/monitoring/init-monitoring';

// Importar as filas existentes do seu sistema
import { agendamentoQueue } from '../lib/queue/agendamento.queue';
import { instagramWebhookQueue, autoNotificationsQueue } from '../lib/queue/instagram-webhook.queue';
import { followUpQueue } from '../lib/queue/followUp.queue';
import { manuscritoQueue } from '../lib/queue/manuscrito.queue';
import { mtfDiamanteWebhookQueue, asyncWebhookQueue } from '../lib/queue/mtf-diamante-webhook.queue';

async function registerQueues() {
  console.log('🔧 Registrando filas no sistema de monitoramento...\n');

  try {
    // 1. Inicializar o sistema de monitoramento
    console.log('1️⃣ Inicializando sistema de monitoramento...');
    await initializeMonitoring();
    console.log('✅ Sistema de monitoramento inicializado\n');

    // 2. Registrar cada fila
    const queues = [
      { queue: agendamentoQueue, name: 'agendamento' },
      { queue: instagramWebhookQueue, name: 'instagram-webhook' },
      { queue: autoNotificationsQueue, name: 'auto-notifications' },
      { queue: followUpQueue, name: 'follow-up' },
      { queue: manuscritoQueue, name: 'manuscrito' },
      { queue: mtfDiamanteWebhookQueue, name: 'mtf-diamante-webhook' },
      { queue: asyncWebhookQueue, name: 'mtf-diamante-webhook-async' },
    ];

    console.log('2️⃣ Registrando filas...');
    
    for (const { queue, name } of queues) {
      try {
        registerQueueForMonitoring(queue, name);
        console.log(`✅ Fila "${name}" registrada com sucesso`);
      } catch (error) {
        console.error(`❌ Erro ao registrar fila "${name}":`, error);
      }
    }

    console.log('\n🎉 Processo de registro concluído!');
    console.log('');
    console.log('💡 Próximos passos:');
    console.log('  - Execute: npx tsx scripts/test-monitoring.ts --queues');
    console.log('  - Acesse: http://localhost:3000/api/admin/monitoring/queues');
    console.log('  - Configure alertas se necessário');

  } catch (error) {
    console.error('❌ Erro durante o registro das filas:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  registerQueues().catch(console.error);
} 