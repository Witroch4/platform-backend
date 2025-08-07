const Redis = require('ioredis');

async function setFeatureFlags() {
  const client = new Redis({
    host: 'localhost',
    port: 6379
  });

  try {
    console.log('Connected to Redis');

    const flags = [
      { name: 'NEW_WEBHOOK_PROCESSING', enabled: true, rollout: 100 },
      { name: 'HIGH_PRIORITY_QUEUE', enabled: true, rollout: 100 },
      { name: 'LOW_PRIORITY_QUEUE', enabled: true, rollout: 100 },
      { name: 'UNIFIED_PAYLOAD_EXTRACTION', enabled: true, rollout: 100 }
    ];

    for (const flag of flags) {
      const key = `feature_flag:${flag.name}`;
      const value = JSON.stringify({
        enabled: flag.enabled,
        rollout: flag.rollout
      });
      
      await client.set(key, value);
      console.log(`Set ${key} = ${value}`);
    }

    console.log('All feature flags set successfully');
  } catch (error) {
    console.error('Error setting feature flags:', error);
  } finally {
    client.disconnect();
  }
}

setFeatureFlags();