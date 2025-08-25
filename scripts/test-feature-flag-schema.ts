#!/usr/bin/env tsx

/**
 * Test script to verify the feature flag schema extensions
 * Tests the new columns and relationships using lib/connections.ts singleton
 */

import { getPrismaInstance } from '../lib/connections';

async function testFeatureFlagSchemaExtensions() {
  console.log('🧪 Testing Feature Flag Schema Extensions...');
  
  const prisma = getPrismaInstance();
  
  try {
    // Test 1: Create a feature flag with new columns
    console.log('\n1. Testing FeatureFlag model with new columns...');
    
    const testFlag = await prisma.featureFlag.create({
      data: {
        name: 'BATCH_PROCESSING_TURBO_MODE_TEST',
        description: 'Test flag for TURBO mode batch processing',
        enabled: false,
        category: 'processing',
        userSpecific: true,
        systemCritical: false,
        metadata: {
          maxParallelLeads: 10,
          fallbackOnError: true,
          resourceThreshold: 0.8
        },
        createdBy: 'test-user-id'
      }
    });
    
    console.log('✅ Created test feature flag:', {
      id: testFlag.id,
      name: testFlag.name,
      category: testFlag.category,
      userSpecific: testFlag.userSpecific,
      systemCritical: testFlag.systemCritical,
      metadata: testFlag.metadata
    });
    
    // Test 2: Create a user feature flag override
    console.log('\n2. Testing UserFeatureFlagOverride model...');
    
    // First, we need to find or create a test user
    let testUser = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });
    
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User'
        }
      });
    }
    
    const userOverride = await prisma.userFeatureFlagOverride.create({
      data: {
        userId: testUser.id,
        flagId: testFlag.id,
        enabled: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        createdBy: testUser.id
      }
    });
    
    console.log('✅ Created user feature flag override:', {
      id: userOverride.id,
      userId: userOverride.userId,
      flagId: userOverride.flagId,
      enabled: userOverride.enabled,
      expiresAt: userOverride.expiresAt
    });
    
    // Test 3: Create feature flag metrics
    console.log('\n3. Testing FeatureFlagMetrics model...');
    
    const metrics = await prisma.featureFlagMetrics.create({
      data: {
        flagId: testFlag.id,
        evaluations: 100,
        enabledCount: 75,
        disabledCount: 25,
        lastEvaluatedAt: new Date(),
        averageLatencyMs: 12.5,
        date: new Date()
      }
    });
    
    console.log('✅ Created feature flag metrics:', {
      id: metrics.id,
      flagId: metrics.flagId,
      evaluations: metrics.evaluations,
      enabledCount: metrics.enabledCount,
      disabledCount: metrics.disabledCount,
      averageLatencyMs: metrics.averageLatencyMs
    });
    
    // Test 4: Test relationships
    console.log('\n4. Testing relationships...');
    
    const flagWithRelations = await prisma.featureFlag.findUnique({
      where: { id: testFlag.id },
      include: {
        userOverrides: true,
        metrics: true
      }
    });
    
    console.log('✅ Feature flag with relations:', {
      id: flagWithRelations?.id,
      name: flagWithRelations?.name,
      userOverridesCount: flagWithRelations?.userOverrides.length,
      metricsCount: flagWithRelations?.metrics.length
    });
    
    const userWithOverrides = await prisma.user.findUnique({
      where: { id: testUser.id },
      include: {
        featureFlagOverrides: true
      }
    });
    
    console.log('✅ User with feature flag overrides:', {
      id: userWithOverrides?.id,
      email: userWithOverrides?.email,
      overridesCount: userWithOverrides?.featureFlagOverrides.length
    });
    
    // Test 5: Test queries with new indexes
    console.log('\n5. Testing indexed queries...');
    
    const processingFlags = await prisma.featureFlag.findMany({
      where: { category: 'processing' }
    });
    
    const userSpecificFlags = await prisma.featureFlag.findMany({
      where: { userSpecific: true }
    });
    
    const systemCriticalFlags = await prisma.featureFlag.findMany({
      where: { systemCritical: true }
    });
    
    console.log('✅ Indexed queries results:', {
      processingFlags: processingFlags.length,
      userSpecificFlags: userSpecificFlags.length,
      systemCriticalFlags: systemCriticalFlags.length
    });
    
    // Cleanup test data
    console.log('\n6. Cleaning up test data...');
    
    await prisma.featureFlagMetrics.delete({
      where: { id: metrics.id }
    });
    
    await prisma.userFeatureFlagOverride.delete({
      where: { id: userOverride.id }
    });
    
    await prisma.featureFlag.delete({
      where: { id: testFlag.id }
    });
    
    // Only delete test user if we created it
    if (testUser.email === 'test@example.com') {
      await prisma.user.delete({
        where: { id: testUser.id }
      });
    }
    
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 All feature flag schema extension tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testFeatureFlagSchemaExtensions()
    .then(() => {
      console.log('\n✅ Feature flag schema extensions test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Feature flag schema extensions test failed:', error);
      process.exit(1);
    });
}

export { testFeatureFlagSchemaExtensions };