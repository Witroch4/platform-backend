/**
 * Global Test Setup for Targeted Tests
 * Sets up test environment for backend and frontend testing
 */

const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🔧 Setting up global test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.NEXTAUTH_SECRET = 'test-secret';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  
  // Database and Redis test configuration
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
  
  // WhatsApp API test configuration
  process.env.WHATSAPP_API_KEY = 'test-api-key';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  process.env.WHATSAPP_BUSINESS_ID = 'test-business-id';
  
  // Disable external API calls in tests
  process.env.DISABLE_EXTERNAL_APIS = 'true';
  
  console.log('✅ Global test environment setup complete');
};