#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { FeatureFlagManager } from '../lib/feature-flags/feature-flag-manager';
import { RollbackManager } from '../lib/feature-flags/rollback-manager';
import { ABTestingManager, createWebhookPerformanceTest } from '../lib/feature-flags/ab-testing-manager';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

class RolloutManager {
  private featureFlagManager: FeatureFlagManager;
  private rollbackManager: RollbackManager;
  private abTestManager: ABTestingManager;

  constructor() {
    this.featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    this.rollbackManager = RollbackManager.getInstance(prisma, redis);
    this.abTestManager = ABTestingManager.getInstance(prisma, redis);
  }

  async initializeFeatureFlags(): Promise<void> {
    console.log('🚀 Initializing feature flags for gradual rollout...');
    
    const flags = [
      { name: 'NEW_WEBHOOK_PROCESSING', enabled: false, rollout: 0, description: 'New optimized webhook processing' },
      { name: 'HIGH_PRIORITY_QUEUE', enabled: true, rollout: 100, description: 'High priority queue for user responses' },
      { name: 'LOW_PRIORITY_QUEUE', enabled: true, rollout: 100, description: 'Low priority queue for data persistence' },
      { name: 'UNIFIED_LEAD_MODEL', enabled: true, rollout: 100, description: 'Unified lead model' },
      { name: 'INTELLIGENT_CACHING', enabled: true, rollout: 100, description: 'Intelligent credential caching' },
      { name: 'APPLICATION_MONITORING', enabled: true, rollout: 100, description: 'Application performance monitoring' },
      { name: 'GRADUAL_ROLLOUT_ENABLED', enabled: true, rollout: 100, description: 'Gradual rollout system' },
      { name: 'AB_TESTING_ENABLED', enabled: true, rollout: 100, description: 'A/B testing system' },
      { name: 'FEEDBACK_COLLECTION', enabled: true, rollout: 100, description: 'User feedback collection' },
      { name: 'MONITORING_DASHBOARD', enabled: true, rollout: 100, description: 'SUPERADMIN monitoring dashboard' },
    ];

    for (const flag of flags) {
      await this.featureFlagManager.setFeatureFlag(
        flag.name,
        flag.enabled,
        flag.rollout,
        { description: flag.description },
        'rollout-manager'
      );
      console.log(`✅ Initialized flag: ${flag.name} (${flag.enabled ? 'enabled' : 'disabled'}, ${flag.rollout}%)`);
    }

    console.log('🎉 Feature flags initialized successfully!');
  }

  async showStatus(): Promise<void> {
    console.log('📊 Current Feature Flag Status:');
    console.log('================================');
    
    const flags = await this.featureFlagManager.getAllFlags();
    
    for (const flag of flags) {
      const metrics = await this.featureFlagManager.getFeatureFlagMetrics(flag.name);
      const status = flag.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
      const rollout = flag.rolloutPercentage === 100 ? 'FULL' : `${flag.rolloutPercentage}%`;
      
      console.log(`${status} ${flag.name} (${rollout})`);
      console.log(`  Evaluations: ${metrics.evaluations}, Enabled: ${metrics.enabled}, Disabled: ${metrics.disabled}`);
      console.log('');
    }
  }

  async rolloutPhase1(): Promise<void> {
    console.log('🚀 Starting Phase 1: Infrastructure and Monitoring');
    console.log('==================================================');
    
    // Enable monitoring and infrastructure flags
    const phase1Flags = [
      'APPLICATION_MONITORING',
      'INTELLIGENT_CACHING',
      'GRADUAL_ROLLOUT_ENABLED',
      'AB_TESTING_ENABLED',
      'FEEDBACK_COLLECTION',
      'MONITORING_DASHBOARD',
    ];

    for (const flagName of phase1Flags) {
      await this.featureFlagManager.setFeatureFlag(flagName, true, 100, {}, 'phase1-rollout');
      console.log(`✅ Enabled: ${flagName}`);
    }

    console.log('🎉 Phase 1 completed successfully!');
  }

  async rolloutPhase2(): Promise<void> {
    console.log('🚀 Starting Phase 2: Queue System');
    console.log('=================================');
    
    // Enable queue system flags
    const phase2Flags = [
      'HIGH_PRIORITY_QUEUE',
      'LOW_PRIORITY_QUEUE',
    ];

    for (const flagName of phase2Flags) {
      await this.featureFlagManager.setFeatureFlag(flagName, true, 100, {}, 'phase2-rollout');
      console.log(`✅ Enabled: ${flagName}`);
    }

    console.log('🎉 Phase 2 completed successfully!');
  }

  async rolloutPhase3(): Promise<void> {
    console.log('🚀 Starting Phase 3: Unified Models');
    console.log('===================================');
    
    // Enable unified model flags
    const phase3Flags = [
      'UNIFIED_LEAD_MODEL',
    ];

    for (const flagName of phase3Flags) {
      await this.featureFlagManager.setFeatureFlag(flagName, true, 100, {}, 'phase3-rollout');
      console.log(`✅ Enabled: ${flagName}`);
    }

    console.log('🎉 Phase 3 completed successfully!');
  }

  async rolloutPhase4(): Promise<void> {
    console.log('🚀 Starting Phase 4: New Webhook Processing (GRADUAL)');
    console.log('=====================================================');
    
    // Start gradual rollout of new webhook processing
    console.log('Starting gradual rollout of NEW_WEBHOOK_PROCESSING...');
    
    // Enable flag but start with 0% rollout
    await this.featureFlagManager.setFeatureFlag(
      'NEW_WEBHOOK_PROCESSING',
      true,
      0,
      { phase: 'gradual-rollout' },
      'phase4-rollout'
    );

    // Start gradual rollout to 100% over 2 hours (10% every 12 minutes)
    await this.featureFlagManager.gradualRollout(
      'NEW_WEBHOOK_PROCESSING',
      100,
      10,
      12
    );

    console.log('🎉 Phase 4 gradual rollout started!');
  }

  async rolloutPhase5(): Promise<void> {
    console.log('🚀 Starting Phase 5: Advanced Features');
    console.log('======================================');
    
    // All advanced features should already be enabled
    console.log('✅ All advanced features are already enabled');
    console.log('🎉 Phase 5 completed successfully!');
  }

  async emergencyRollback(): Promise<void> {
    console.log('🚨 EMERGENCY ROLLBACK INITIATED');
    console.log('===============================');
    
    const criticalFlags = [
      'NEW_WEBHOOK_PROCESSING',
      'HIGH_PRIORITY_QUEUE',
      'LOW_PRIORITY_QUEUE',
    ];

    await this.rollbackManager.emergencyRollback(
      criticalFlags,
      'Emergency rollback via rollout manager',
      'rollout-manager-emergency'
    );

    console.log('🚨 Emergency rollback completed!');
  }

  async createWebhookABTest(): Promise<void> {
    console.log('🧪 Creating Webhook Performance A/B Test');
    console.log('========================================');
    
    const testId = await createWebhookPerformanceTest();
    console.log(`✅ A/B test created: ${testId}`);
    
    // Start the test
    await this.abTestManager.startABTest(testId, 'rollout-manager');
    console.log('🚀 A/B test started!');
  }

  async showRollbackHistory(): Promise<void> {
    console.log('📜 Rollback History:');
    console.log('===================');
    
    const executions = await this.rollbackManager.getRollbackExecutions(10);
    
    if (executions.length === 0) {
      console.log('No rollback executions found.');
      return;
    }

    for (const execution of executions) {
      const status = execution.success ? '✅ SUCCESS' : '❌ FAILED';
      console.log(`${status} ${execution.executedAt} by ${execution.executedBy}`);
      console.log(`  Duration: ${execution.duration}ms`);
      if (execution.errors) {
        console.log(`  Errors: ${execution.errors.join(', ')}`);
      }
      console.log('');
    }
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const rolloutManager = new RolloutManager();

  try {
    switch (command) {
      case 'init':
        await rolloutManager.initializeFeatureFlags();
        break;
      
      case 'status':
        await rolloutManager.showStatus();
        break;
      
      case 'phase1':
        await rolloutManager.rolloutPhase1();
        break;
      
      case 'phase2':
        await rolloutManager.rolloutPhase2();
        break;
      
      case 'phase3':
        await rolloutManager.rolloutPhase3();
        break;
      
      case 'phase4':
        await rolloutManager.rolloutPhase4();
        break;
      
      case 'phase5':
        await rolloutManager.rolloutPhase5();
        break;
      
      case 'rollback':
        await rolloutManager.emergencyRollback();
        break;
      
      case 'ab-test':
        await rolloutManager.createWebhookABTest();
        break;
      
      case 'history':
        await rolloutManager.showRollbackHistory();
        break;
      
      default:
        console.log('🚀 ChatWit Rollout Management Tool');
        console.log('==================================');
        console.log('');
        console.log('Available commands:');
        console.log('  init      - Initialize feature flags');
        console.log('  status    - Show current flag status');
        console.log('  phase1    - Rollout Phase 1 (Infrastructure)');
        console.log('  phase2    - Rollout Phase 2 (Queues)');
        console.log('  phase3    - Rollout Phase 3 (Unified Models)');
        console.log('  phase4    - Rollout Phase 4 (New Webhook - Gradual)');
        console.log('  phase5    - Rollout Phase 5 (Advanced Features)');
        console.log('  rollback  - Emergency rollback');
        console.log('  ab-test   - Create webhook performance A/B test');
        console.log('  history   - Show rollback history');
        console.log('');
        console.log('Usage: npm run rollout <command>');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

if (require.main === module) {
  main();
}

export { RolloutManager };