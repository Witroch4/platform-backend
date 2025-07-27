#!/usr/bin/env node

/**
 * Test execution script for sistema-refatoracao-prisma
 * Executes all test suites with proper configuration
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testSuites = [
  {
    name: 'Unit Tests',
    pattern: '__tests__/unit/**/*.test.ts',
    timeout: 30000,
  },
  {
    name: 'Integration Tests', 
    pattern: '__tests__/integration/**/*.test.ts',
    timeout: 60000,
  },
  {
    name: 'Performance Tests',
    pattern: '__tests__/performance/**/*.test.ts', 
    timeout: 120000,
  },
  {
    name: 'E2E Tests',
    pattern: '__tests__/e2e/**/*.test.ts',
    timeout: 180000,
  },
];

function runTestSuite(suite) {
  console.log(`\n🧪 Running ${suite.name}...`);
  console.log(`Pattern: ${suite.pattern}`);
  console.log(`Timeout: ${suite.timeout}ms`);
  
  try {
    const command = `npx jest "${suite.pattern}" --config=jest.config.sistema-refatoracao.js --testTimeout=${suite.timeout} --verbose --passWithNoTests --detectOpenHandles --forceExit`;
    
    const startTime = Date.now();
    execSync(command, { 
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REDIS_URL: 'redis://localhost:6379/15',
      },
    });
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${suite.name} completed in ${duration}ms`);
    return { name: suite.name, passed: true, duration };
    
  } catch (error) {
    console.log(`❌ ${suite.name} failed`);
    return { name: suite.name, passed: false, duration: 0, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting Sistema Refatoração Prisma Test Suite');
  console.log('=' .repeat(60));
  
  // Run pre-test checks
  try {
    const { runPreTestCheck } = require('./pre-test-check');
    await runPreTestCheck();
  } catch (error) {
    console.log('⚠️  Pre-test check failed, continuing with mocked dependencies...');
  }
  
  const results = [];
  const startTime = Date.now();
  
  for (const suite of testSuites) {
    const result = runTestSuite(suite);
    results.push(result);
  }
  
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Suites: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Suites:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runTestSuite, testSuites };