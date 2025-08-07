#!/usr/bin/env tsx

/**
 * Script para gerenciar Flash Intent via linha de comando
 * 
 * Uso:
 * npm run flash-intent -- status
 * npm run flash-intent -- enable-global
 * npm run flash-intent -- disable-global
 * npm run flash-intent -- enable-user user-id
 * npm run flash-intent -- disable-user user-id
 * npm run flash-intent -- stats
 */

import { getPrismaInstance, getRedisInstance } from '../lib/connections';
import { FeatureFlagManager } from '../lib/feature-flags/feature-flag-manager';
import { FlashIntentChecker } from '../lib/resposta-rapida/flash-intent-checker';

const prisma = getPrismaInstance();
const redis = getRedisInstance();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Flash Intent Management CLI

Comandos disponíveis:
  status                    - Mostra status global da Flash Intent
  enable-global            - Ativa Flash Intent globalmente
  disable-global           - Desativa Flash Intent globalmente
  enable-user <userId>     - Ativa Flash Intent para usuário específico
  disable-user <userId>    - Desativa Flash Intent para usuário específico
  stats                    - Mostra estatísticas de uso
  list-users               - Lista usuários com Flash Intent ativa
  health-check             - Verifica saúde do sistema

Exemplos:
  npm run flash-intent -- status
  npm run flash-intent -- enable-global
  npm run flash-intent -- enable-user clp123abc
  npm run flash-intent -- stats
    `);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;
      case 'enable-global':
        await enableGlobal();
        break;
      case 'disable-global':
        await disableGlobal();
        break;
      case 'enable-user':
        if (!args[1]) {
          console.error('❌ Erro: userId é obrigatório');
          process.exit(1);
        }
        await enableUser(args[1]);
        break;
      case 'disable-user':
        if (!args[1]) {
          console.error('❌ Erro: userId é obrigatório');
          process.exit(1);
        }
        await disableUser(args[1]);
        break;
      case 'stats':
        await showStats();
        break;
      case 'list-users':
        await listUsers();
        break;
      case 'health-check':
        await healthCheck();
        break;
      default:
        console.error(`❌ Comando desconhecido: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

async function showStatus() {
  console.log('🔍 Verificando status da Flash Intent...\n');
  
  const checker = FlashIntentChecker.getInstance();
  const flagManager = FeatureFlagManager.getInstance(prisma, redis);

  // Status global
  const globalEnabled = await checker.isFlashIntentEnabledGlobally();
  
  // Componentes individuais
  const [
    newWebhookProcessing,
    highPriorityQueue,
    lowPriorityQueue,
    unifiedLeadModel,
    intelligentCaching,
    applicationMonitoring,
  ] = await Promise.all([
    flagManager.isEnabled("NEW_WEBHOOK_PROCESSING"),
    flagManager.isEnabled("HIGH_PRIORITY_QUEUE"),
    flagManager.isEnabled("LOW_PRIORITY_QUEUE"),
    flagManager.isEnabled("UNIFIED_LEAD_MODEL"),
    flagManager.isEnabled("INTELLIGENT_CACHING"),
    flagManager.isEnabled("APPLICATION_MONITORING"),
  ]);

  console.log(`🌐 Status Global: ${globalEnabled ? '✅ ATIVA' : '❌ INATIVA'}\n`);
  
  console.log('📊 Componentes:');
  console.log(`  • Webhook Processing:     ${newWebhookProcessing ? '✅' : '❌'}`);
  console.log(`  • High Priority Queue:    ${highPriorityQueue ? '✅' : '❌'}`);
  console.log(`  • Low Priority Queue:     ${lowPriorityQueue ? '✅' : '❌'}`);
  console.log(`  • Unified Lead Model:     ${unifiedLeadModel ? '✅' : '❌'}`);
  console.log(`  • Intelligent Caching:    ${intelligentCaching ? '✅' : '❌'}`);
  console.log(`  • Application Monitoring: ${applicationMonitoring ? '✅' : '❌'}`);
}

async function enableGlobal() {
  console.log('🚀 Ativando Flash Intent globalmente...\n');
  
  const flagManager = FeatureFlagManager.getInstance(prisma, redis);
  
  const flags = [
    "NEW_WEBHOOK_PROCESSING",
    "HIGH_PRIORITY_QUEUE", 
    "LOW_PRIORITY_QUEUE",
    "UNIFIED_LEAD_MODEL",
    "INTELLIGENT_CACHING",
    "APPLICATION_MONITORING",
    "UNIFIED_PAYLOAD_EXTRACTION",
    "FLASH_INTENT_GLOBAL",
  ];

  for (const flagName of flags) {
    await flagManager.setFeatureFlag(flagName, true, 100, {}, 'cli-script');
    console.log(`✅ ${flagName} ativada`);
  }

  console.log('\n🎉 Flash Intent ativada globalmente com sucesso!');
  console.log('⚡ Todas as respostas rápidas estão agora funcionando');
}

async function disableGlobal() {
  console.log('🛑 Desativando Flash Intent globalmente...\n');
  
  const flagManager = FeatureFlagManager.getInstance(prisma, redis);
  
  const flags = [
    "NEW_WEBHOOK_PROCESSING",
    "HIGH_PRIORITY_QUEUE", 
    "LOW_PRIORITY_QUEUE",
    "UNIFIED_LEAD_MODEL",
    "INTELLIGENT_CACHING",
    "APPLICATION_MONITORING",
    "UNIFIED_PAYLOAD_EXTRACTION",
    "FLASH_INTENT_GLOBAL",
  ];

  for (const flagName of flags) {
    await flagManager.setFeatureFlag(flagName, false, 0, {}, 'cli-script');
    console.log(`❌ ${flagName} desativada`);
  }

  console.log('\n✅ Flash Intent desativada globalmente');
  console.log('🐌 Sistema voltou ao modo padrão');
}

async function enableUser(userId: string) {
  console.log(`🚀 Ativando Flash Intent para usuário ${userId}...\n`);
  
  // Verificar se usuário existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(`❌ Usuário ${userId} não encontrado`);
    process.exit(1);
  }

  const flagManager = FeatureFlagManager.getInstance(prisma, redis);
  const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
  
  const userFlags = [
    `${userFlagPrefix}_WEBHOOK`,
    `${userFlagPrefix}_HIGH_PRIORITY_QUEUE`,
    `${userFlagPrefix}_LOW_PRIORITY_QUEUE`,
    `${userFlagPrefix}_UNIFIED_MODEL`,
    `${userFlagPrefix}_CACHING`,
  ];

  for (const flagName of userFlags) {
    await flagManager.setFeatureFlag(flagName, true, 100, { userId }, 'cli-script');
  }

  console.log(`✅ Flash Intent ativada para ${user.name || user.email}`);
  console.log(`⚡ Usuário ${userId} agora tem acesso às respostas rápidas`);
}

async function disableUser(userId: string) {
  console.log(`🛑 Desativando Flash Intent para usuário ${userId}...\n`);
  
  // Verificar se usuário existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(`❌ Usuário ${userId} não encontrado`);
    process.exit(1);
  }

  const flagManager = FeatureFlagManager.getInstance(prisma, redis);
  const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
  
  const userFlags = [
    `${userFlagPrefix}_WEBHOOK`,
    `${userFlagPrefix}_HIGH_PRIORITY_QUEUE`,
    `${userFlagPrefix}_LOW_PRIORITY_QUEUE`,
    `${userFlagPrefix}_UNIFIED_MODEL`,
    `${userFlagPrefix}_CACHING`,
  ];

  for (const flagName of userFlags) {
    await flagManager.setFeatureFlag(flagName, false, 0, { userId }, 'cli-script');
  }

  console.log(`❌ Flash Intent desativada para ${user.name || user.email}`);
  console.log(`🐌 Usuário ${userId} voltou ao modo padrão`);
}

async function showStats() {
  console.log('📊 Estatísticas da Flash Intent...\n');
  
  const checker = FlashIntentChecker.getInstance();
  
  // Contar usuários
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
  });

  let usersWithFlashIntent = 0;
  const userDetails = [];

  for (const user of allUsers) {
    const hasFlashIntent = await checker.isFlashIntentEnabledForUser(user.id);
    if (hasFlashIntent) {
      usersWithFlashIntent++;
      userDetails.push({
        id: user.id,
        name: user.name || 'Sem nome',
        email: user.email,
        role: user.role,
      });
    }
  }

  const globalEnabled = await checker.isFlashIntentEnabledGlobally();

  console.log(`🌐 Status Global: ${globalEnabled ? '✅ ATIVA' : '❌ INATIVA'}`);
  console.log(`👥 Total de Usuários: ${allUsers.length}`);
  console.log(`⚡ Usuários com Flash Intent: ${usersWithFlashIntent}`);
  console.log(`📈 Percentual de Adoção: ${((usersWithFlashIntent / allUsers.length) * 100).toFixed(1)}%\n`);

  if (userDetails.length > 0) {
    console.log('👤 Usuários com Flash Intent ativa:');
    userDetails.forEach(user => {
      console.log(`  • ${user.name} (${user.email}) - ${user.role}`);
    });
  }
}

async function listUsers() {
  console.log('👥 Listando usuários com Flash Intent...\n');
  
  const checker = FlashIntentChecker.getInstance();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total de usuários: ${users.length}\n`);

  for (const user of users) {
    const hasFlashIntent = await checker.isFlashIntentEnabledForUser(user.id);
    const status = hasFlashIntent ? '⚡ ATIVA' : '🐌 INATIVA';
    
    console.log(`${status} | ${user.name || 'Sem nome'} | ${user.email} | ${user.role}`);
  }
}

async function healthCheck() {
  console.log('🏥 Verificando saúde do sistema...\n');
  
  try {
    // Verificar conexão com banco
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Banco de dados: Conectado');
  } catch (error) {
    console.log('❌ Banco de dados: Erro de conexão');
  }

  try {
    // Verificar conexão com Redis
    await redis.ping();
    console.log('✅ Redis: Conectado');
  } catch (error) {
    console.log('❌ Redis: Erro de conexão');
  }

  try {
    // Verificar filas usando as funções de health check
    const { getQueueHealth: getRespostaRapidaHealth } = await import('../lib/queue/resposta-rapida.queue');
    const { getQueueHealth: getPersistenciaHealth } = await import('../lib/queue/persistencia-credenciais.queue');
    
    const [respostaRapidaHealth, persistenciaHealth] = await Promise.all([
      getRespostaRapidaHealth().catch(() => null),
      getPersistenciaHealth().catch(() => null),
    ]);
    
    const respostaRapidaActive = respostaRapidaHealth !== null;
    const persistenciaActive = persistenciaHealth !== null;
    
    console.log(`${respostaRapidaActive ? '✅' : '❌'} Fila Resposta Rápida: ${respostaRapidaActive ? 'Ativa' : 'Inativa'}`);
    if (respostaRapidaHealth) {
      console.log(`    • Aguardando: ${respostaRapidaHealth.waiting}, Ativo: ${respostaRapidaHealth.active}, Falhou: ${respostaRapidaHealth.failed}`);
    }
    
    console.log(`${persistenciaActive ? '✅' : '❌'} Fila Persistência: ${persistenciaActive ? 'Ativa' : 'Inativa'}`);
    if (persistenciaHealth) {
      console.log(`    • Aguardando: ${persistenciaHealth.waiting}, Ativo: ${persistenciaHealth.active}, Falhou: ${persistenciaHealth.failed}`);
    }
  } catch (error) {
    console.log('❌ Erro ao verificar filas:', error);
  }

  // Verificar feature flags
  const flagManager = FeatureFlagManager.getInstance(prisma, redis);
  const flags = await flagManager.getAllFlags();
  
  console.log(`\n📊 Feature Flags: ${flags.length} configuradas`);
  
  const activeFlags = flags.filter(flag => flag.enabled);
  console.log(`⚡ Flags Ativas: ${activeFlags.length}`);
  
  if (activeFlags.length > 0) {
    console.log('\nFlags ativas:');
    activeFlags.forEach(flag => {
      console.log(`  • ${flag.name} (${flag.rolloutPercentage}%)`);
    });
  }
}

// Executar script
main().catch(console.error);