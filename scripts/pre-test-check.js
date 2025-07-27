#!/usr/bin/env node

/**
 * Pre-test check script
 * Verifies that all dependencies are available before running tests
 */

const { execSync } = require('child_process');
const net = require('net');

// Colors for output
const colors = {
  red: '\033[0;31m',
  green: '\033[0;32m',
  yellow: '\033[1;33m',
  blue: '\033[0;34m',
  reset: '\033[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Check if port is available
function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// Check Redis connection
async function checkRedis() {
  log('🔍 Checking Redis connection...', 'blue');
  
  const isRedisRunning = await checkPort('localhost', 6379);
  
  if (isRedisRunning) {
    log('✅ Redis is running on port 6379', 'green');
    return true;
  } else {
    log('⚠️  Redis is not running on port 6379', 'yellow');
    log('   Tests will use mocked Redis connection', 'yellow');
    return false;
  }
}

// Check Node.js version
function checkNodeVersion() {
  log('🔍 Checking Node.js version...', 'blue');
  
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion >= 18) {
    log(`✅ Node.js version ${nodeVersion} is supported`, 'green');
    return true;
  } else {
    log(`❌ Node.js version ${nodeVersion} is not supported (requires >= 18)`, 'red');
    return false;
  }
}

// Check required packages
function checkPackages() {
  log('🔍 Checking required packages...', 'blue');
  
  const requiredPackages = [
    'jest',
    'ts-jest',
    '@jest/globals',
    'jest-environment-jsdom',
  ];
  
  let allPackagesAvailable = true;
  
  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
      log(`✅ ${pkg} is available`, 'green');
    } catch (error) {
      log(`❌ ${pkg} is not available`, 'red');
      allPackagesAvailable = false;
    }
  }
  
  return allPackagesAvailable;
}

// Check test files
function checkTestFiles() {
  log('🔍 Checking test files...', 'blue');
  
  const fs = require('fs');
  const path = require('path');
  
  const testDirs = [
    '__tests__/unit',
    '__tests__/integration', 
    '__tests__/performance',
    '__tests__/e2e',
    '__tests__/setup',
  ];
  
  let allDirsExist = true;
  
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));
      log(`✅ ${dir} exists with ${files.length} test files`, 'green');
    } else {
      log(`❌ ${dir} does not exist`, 'red');
      allDirsExist = false;
    }
  }
  
  return allDirsExist;
}

// Main check function
async function runPreTestCheck() {
  log('🚀 Running pre-test checks...', 'blue');
  log('='.repeat(50), 'blue');
  
  const checks = [
    { name: 'Node.js Version', fn: checkNodeVersion },
    { name: 'Required Packages', fn: checkPackages },
    { name: 'Test Files', fn: checkTestFiles },
    { name: 'Redis Connection', fn: checkRedis },
  ];
  
  let allChecksPassed = true;
  
  for (const check of checks) {
    const result = await check.fn();
    if (!result) {
      allChecksPassed = false;
    }
  }
  
  log('\n' + '='.repeat(50), 'blue');
  
  if (allChecksPassed) {
    log('🎉 All pre-test checks passed! Ready to run tests.', 'green');
    process.exit(0);
  } else {
    log('⚠️  Some checks failed, but tests can still run with mocked dependencies.', 'yellow');
    log('💡 To fix issues:', 'blue');
    log('   - Install missing packages: npm install', 'blue');
    log('   - Start Redis: redis-server (optional, will use mocks)', 'blue');
    process.exit(0); // Don't fail, just warn
  }
}

// Run if called directly
if (require.main === module) {
  runPreTestCheck().catch(error => {
    log(`❌ Pre-test check failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { runPreTestCheck };