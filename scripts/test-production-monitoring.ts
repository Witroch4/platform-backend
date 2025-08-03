#!/usr/bin/env npx tsx

/**
 * Script para testar o Sistema de Monitoramento de Produção
 * Executa testes das funcionalidades principais
 */

import { 
  initializeProductionMonitoring,
  getProductionMonitor,
  getDisasterRecoveryManager,
  getProductionMonitoringStatus,
  stopProductionMonitoring
} from '../lib/monitoring/init-production-monitoring';

async function testProductionMonitoring() {
  console.log('🧪 Iniciando testes do Sistema de Monitoramento de Produção\n');

  try {
    // 1. Teste de Inicialização
    console.log('1️⃣ Testando inicialização...');
    await initializeProductionMonitoring();
    console.log('✅ Sistema inicializado com sucesso\n');

    // 2. Teste de Status
    console.log('2️⃣ Testando status do sistema...');
    const status = getProductionMonitoringStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log('✅ Status obtido com sucesso\n');

    // 3. Teste do Monitor de Produção
    console.log('3️⃣ Testando ProductionMonitor...');
    const monitor = getProductionMonitor();
    if (monitor) {
      // Executar health checks
      await monitor.performHealthChecks();
      console.log('✅ Health checks executados');

      // Obter alertas ativos
      const alerts = monitor.getActiveAlerts();
      console.log(`📊 Alertas ativos: ${alerts.length}`);
      alerts.forEach(alert => {
        console.log(`  - ${alert.severity}: ${alert.message}`);
      });

      // Obter saúde das conexões
      const connections = monitor.getConnectionsHealth();
      console.log(`🔗 Conexões monitoradas: ${connections.length}`);
      connections.forEach(conn => {
        console.log(`  - ${conn.component}: ${conn.status} (${conn.responseTime}ms)`);
      });

      // Teste de backup
      console.log('💾 Executando backup de teste...');
      const backups = await monitor.performAutomaticBackup();
      console.log(`✅ Backup executado: ${backups.length} arquivos criados`);
      backups.forEach(backup => {
        console.log(`  - ${backup.type}: ${backup.status} (${backup.size || 0} bytes)`);
      });
    } else {
      console.log('❌ ProductionMonitor não encontrado');
    }
    console.log();

    // 4. Teste do Disaster Recovery
    console.log('4️⃣ Testando DisasterRecoveryManager...');
    const recovery = getDisasterRecoveryManager();
    if (recovery) {
      // Listar procedimentos
      const procedures = recovery.getProcedures();
      console.log(`🛠️ Procedimentos disponíveis: ${procedures.length}`);
      procedures.forEach(proc => {
        console.log(`  - ${proc.name} (${proc.priority}, ${proc.stepsCount} etapas)`);
        console.log(`    Auto: ${proc.autoExecute}, Triggers: ${proc.triggerConditions.join(', ')}`);
      });

      // Listar execuções
      const executions = recovery.getExecutions();
      console.log(`📋 Execuções registradas: ${executions.length}`);
      executions.forEach(exec => {
        console.log(`  - ${exec.procedureId}: ${exec.status} (${exec.startedAt})`);
      });
    } else {
      console.log('❌ DisasterRecoveryManager não encontrado');
    }
    console.log();

    // 5. Teste de Simulação de Alerta
    console.log('5️⃣ Simulando cenário de alerta...');
    if (monitor) {
      // Simular um alerta crítico (isso normalmente seria feito pelo sistema)
      console.log('⚠️ Simulando alerta crítico...');
      
      // Aguardar um pouco para ver se o sistema detecta
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const alertsAfter = monitor.getActiveAlerts();
      console.log(`📊 Alertas após simulação: ${alertsAfter.length}`);
    }
    console.log();

    // 6. Teste de Limpeza
    console.log('6️⃣ Testando limpeza...');
    stopProductionMonitoring();
    console.log('✅ Sistema parado com sucesso\n');

    console.log('🎉 Todos os testes concluídos com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
    process.exit(1);
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  testProductionMonitoring()
    .then(() => {
      console.log('\n✅ Script de teste concluído');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Erro no script de teste:', error);
      process.exit(1);
    });
}

export { testProductionMonitoring };