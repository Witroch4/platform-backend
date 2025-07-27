#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function initializeMonitoring() {
  try {
    console.log('🚀 Inicializando sistema de monitoramento...');

    // Criar algumas feature flags de exemplo
    const sampleFlags = [
      {
        name: 'NEW_WEBHOOK_PROCESSING',
        description: 'Novo sistema de processamento de webhook',
        enabled: false,
        rolloutPercentage: 0,
        createdBy: 'system-init',
      },
      {
        name: 'MONITORING_DASHBOARD',
        description: 'Dashboard de monitoramento para SUPERADMIN',
        enabled: true,
        rolloutPercentage: 100,
        createdBy: 'system-init',
      },
      {
        name: 'FEEDBACK_COLLECTION',
        description: 'Sistema de coleta de feedback dos usuários',
        enabled: true,
        rolloutPercentage: 100,
        createdBy: 'system-init',
      },
    ];

    for (const flag of sampleFlags) {
      await prisma.featureFlag.upsert({
        where: { name: flag.name },
        update: {
          description: flag.description,
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          updatedAt: new Date(),
        },
        create: flag,
      });
      console.log(`✅ Feature flag criada/atualizada: ${flag.name}`);
    }

    // Criar alguns feedbacks de exemplo
    const sampleFeedbacks = [
      {
        userId: 'system-test',
        type: 'FEATURE_REQUEST',
        category: 'dashboard',
        title: 'Melhorar visualização de métricas',
        description: 'Seria útil ter gráficos mais detalhados no dashboard',
        severity: 'MEDIUM',
        systemContext: {
          userAgent: 'System Init',
          url: '/admin/monitoring/dashboard',
          timestamp: new Date(),
        },
      },
      {
        userId: 'system-test',
        type: 'BUG_REPORT',
        category: 'performance',
        title: 'Dashboard carrega lentamente',
        description: 'O dashboard demora para carregar quando há muitos dados',
        severity: 'LOW',
        systemContext: {
          userAgent: 'System Init',
          url: '/admin/monitoring/dashboard',
          timestamp: new Date(),
        },
      },
    ];

    for (const feedback of sampleFeedbacks) {
      await prisma.userFeedback.create({
        data: {
          ...feedback,
          id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
      });
      console.log(`✅ Feedback de exemplo criado: ${feedback.title}`);
    }

    console.log('🎉 Sistema de monitoramento inicializado com sucesso!');
    console.log('');
    console.log('📊 Acesse o dashboard em:');
    console.log('   - Teste: http://localhost:3000/admin/monitoring/test');
    console.log('   - Completo: http://localhost:3000/admin/monitoring/dashboard');
    console.log('');
    console.log('⚠️  Nota: Certifique-se de ter role SUPERADMIN para acessar');

  } catch (error) {
    console.error('❌ Erro ao inicializar sistema de monitoramento:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  initializeMonitoring();
}

export { initializeMonitoring };