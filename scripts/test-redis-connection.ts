/**
 * Test Redis connection
 */

import { getRedisInstance } from '../lib/connections';

async function testRedis() {
  try {
    console.log('🔍 Testing Redis connection...');
    
    const redis = getRedisInstance();
    
    // Test basic operations
    await redis.set('test:key', 'test:value');
    const value = await redis.get('test:key');
    
    console.log('✅ Redis connection successful');
    console.log('📊 Test result:', { key: 'test:key', value });
    
    // Clean up
    await redis.del('test:key');
    
    console.log('✅ Redis test completed successfully');
  } catch (error) {
    console.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testRedis();
}