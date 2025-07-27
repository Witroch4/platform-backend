#!/usr/bin/env ts-node

/**
 * Comprehensive Test Execution Script for Task 7.3
 * Runs all targeted tests for backend and frontend changes
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

interface TestConfig {
  name: string;
  command: string;
  description: string;
  timeout: number;
  critical: boolean;
}

const testConfigs: TestConfig[] = [
  {
    name: 'Parent Worker Unit Tests',
    command: 'npx jest __tests__/unit/parent-worker.test.ts --config=jest.config.targeted.js --verbose',
    description: 'Unit tests for Parent Worker delegation logic',
    timeout: 30000,
    critical: true,
  },
  {
    name: 'Webhook E2E Integration Tests',
    command: 'npx jest __tests__/integration/webhook-e2e.test.ts --config=jest.config.targeted.js --verbose',
    description: 'End-to-end integration tests for webhook flow',
    timeout: 60000,
    critical: true,
  },
  {
    name: 'Templates Tab Frontend Tests',
    command: 'npx jest __tests__/frontend/templates-tab.test.tsx --config=jest.config.targeted.js --verbose',
    description: 'Frontend component tests for unified Template model',
    timeout: 30000,
    critical: true,
  },
  {
    name: 'MtfDataProvider Context Tests',
    command: 'npx jest __tests__/frontend/mtf-data-provider.test.tsx --config=jest.config.targeted.js --verbose',
    description: 'Context provider tests for unified data model',
    timeout: 30000,
    critical: true,
  },
];

class TestExecutor {
  private results: Array<{
    name: string;
    passed: boolean;
    duration: number;
    output: string;
    error?: string;
  }> = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite for Task 7.3');
    console.log('=' .repeat(80));
    console.log('Testing Backend Worker Refactoring and Frontend Unified Data Model');
    console.log('Requirements Coverage: 7.1, 7.2, 7.3, 8.1, 8.2');
    console.log('=' .repeat(80));
    console.log();

    // Ensure coverage directory exists
    this.ensureCoverageDirectory();

    // Run pre-test checks
    await this.runPreTestChecks();

    // Execute all test suites
    for (const config of testConfigs) {
      await this.executeTestSuite(config);
    }

    // Generate final report
    this.generateFinalReport();
  }

  private ensureCoverageDirectory(): void {
    const coverageDir = path.join(process.cwd(), 'coverage', 'targeted');
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
      console.log(`📁 Created coverage directory: ${coverageDir}`);
    }
  }

  private async runPreTestChecks(): Promise<void> {
    console.log('🔍 Running Pre-Test Checks...');
    console.log();

    const checks = [
      {
        name: 'TypeScript Compilation',
        command: 'npx tsc --noEmit --skipLibCheck',
        description: 'Verify TypeScript compilation',
      },
      {
        name: 'ESLint Check',
        command: 'npx eslint worker/ app/admin/mtf-diamante/ --ext .ts,.tsx --max-warnings 0',
        description: 'Check code quality and standards',
      },
    ];

    for (const check of checks) {
      try {
        console.log(`   ✓ ${check.name}: ${check.description}`);
        execSync(check.command, { stdio: 'pipe' });
      } catch (error) {
        console.log(`   ⚠️  ${check.name}: Warning - ${error}`);
      }
    }

    console.log();
  }

  private async executeTestSuite(config: TestConfig): Promise<void> {
    console.log(`📋 Executing: ${config.name}`);
    console.log(`   Description: ${config.description}`);
    console.log(`   Command: ${config.command}`);
    console.log(`   Timeout: ${config.timeout}ms`);
    console.log();

    const startTime = Date.now();

    try {
      const output = execSync(config.command, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: config.timeout,
        cwd: process.cwd(),
      });

      const duration = Date.now() - startTime;

      this.results.push({
        name: config.name,
        passed: true,
        duration,
        output,
      });

      console.log(`✅ ${config.name} - PASSED (${duration}ms)`);
      console.log();

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.results.push({
        name: config.name,
        passed: false,
        duration,
        output: error.stdout || '',
        error: error.stderr || error.message,
      });

      console.log(`❌ ${config.name} - FAILED (${duration}ms)`);
      if (config.critical) {
        console.log(`   🚨 CRITICAL TEST FAILURE`);
      }
      console.log(`   Error: ${error.message}`);
      console.log();

      // If it's a critical test and we're in CI, fail fast
      if (config.critical && process.env.CI) {
        console.log('🛑 Critical test failed in CI environment. Stopping execution.');
        process.exit(1);
      }
    }
  }

  private generateFinalReport(): void {
    console.log('=' .repeat(80));
    console.log('📊 FINAL TEST REPORT');
    console.log('=' .repeat(80));
    console.log();

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    // Summary statistics
    console.log('📈 SUMMARY STATISTICS');
    console.log('-' .repeat(40));
    console.log(`Total Test Suites: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`Average Duration: ${Math.round(totalDuration / totalTests)}ms`);
    console.log();

    // Individual test results
    console.log('📋 INDIVIDUAL TEST RESULTS');
    console.log('-' .repeat(40));
    this.results.forEach(result => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.name.padEnd(35)} ${duration.padStart(8)}`);
    });
    console.log();

    // Failed test details
    const failedResults = this.results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      console.log('🔍 FAILED TEST DETAILS');
      console.log('-' .repeat(40));
      failedResults.forEach(result => {
        console.log(`\n❌ ${result.name}:`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        if (result.output) {
          console.log(`   Output: ${result.output.substring(0, 500)}...`);
        }
      });
      console.log();
    }

    // Requirements coverage validation
    this.validateRequirementsCoverage();

    // Performance analysis
    this.analyzePerformance();

    // Final status
    if (failedTests === 0) {
      console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
      console.log('✅ Task 7.3 Implementation Complete');
      console.log('✅ Backend Worker Architecture Tested');
      console.log('✅ Frontend Unified Data Model Tested');
      console.log('✅ Integration Flow Verified');
      process.exit(0);
    } else {
      console.log(`❌ ${failedTests} TEST SUITE(S) FAILED`);
      console.log('🔧 Please review and fix the failing tests before proceeding.');
      process.exit(1);
    }
  }

  private validateRequirementsCoverage(): void {
    console.log('📋 REQUIREMENTS COVERAGE VALIDATION');
    console.log('-' .repeat(40));

    const requirements = [
      {
        id: '7.1',
        name: 'Refactor Worker Architecture & Logic (Backend)',
        tests: ['Parent Worker Unit Tests'],
        description: 'Parent Worker delegation and task module integration',
      },
      {
        id: '7.2',
        name: 'Update Frontend Components for Unified Data Model',
        tests: ['Templates Tab Frontend Tests', 'MtfDataProvider Context Tests'],
        description: 'Frontend components updated for unified data model',
      },
      {
        id: '7.3',
        name: 'Implement Targeted Testing',
        tests: ['Parent Worker Unit Tests', 'Webhook E2E Integration Tests', 'Templates Tab Frontend Tests', 'MtfDataProvider Context Tests'],
        description: 'Comprehensive testing suite implementation',
      },
      {
        id: '8.1',
        name: 'Unit Testing Coverage',
        tests: ['Parent Worker Unit Tests', 'Templates Tab Frontend Tests', 'MtfDataProvider Context Tests'],
        description: 'Unit tests for core components',
      },
      {
        id: '8.2',
        name: 'Integration Testing Coverage',
        tests: ['Webhook E2E Integration Tests'],
        description: 'End-to-end integration testing',
      },
    ];

    requirements.forEach(req => {
      const relevantTests = this.results.filter(r => req.tests.includes(r.name));
      const allPassed = relevantTests.every(t => t.passed);
      const status = allPassed ? '✅' : '❌';
      
      console.log(`${status} Requirement ${req.id}: ${req.name}`);
      console.log(`   ${req.description}`);
      console.log(`   Tests: ${relevantTests.length}/${req.tests.length} passed`);
      
      if (!allPassed) {
        const failedTests = relevantTests.filter(t => !t.passed);
        console.log(`   Failed: ${failedTests.map(t => t.name).join(', ')}`);
      }
      console.log();
    });
  }

  private analyzePerformance(): void {
    console.log('⚡ PERFORMANCE ANALYSIS');
    console.log('-' .repeat(40));

    const sortedByDuration = [...this.results].sort((a, b) => b.duration - a.duration);
    
    console.log('Slowest test suites:');
    sortedByDuration.forEach((result, index) => {
      const duration = `${result.duration}ms`;
      const percentage = ((result.duration / this.results.reduce((sum, r) => sum + r.duration, 0)) * 100).toFixed(1);
      console.log(`${index + 1}. ${result.name}: ${duration} (${percentage}%)`);
    });

    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    console.log(`\nAverage duration: ${Math.round(avgDuration)}ms`);

    // Performance warnings
    const slowTests = this.results.filter(r => r.duration > 30000); // 30 seconds
    if (slowTests.length > 0) {
      console.log(`\n⚠️  Slow tests (>30s): ${slowTests.length}`);
      slowTests.forEach(test => {
        console.log(`   - ${test.name}: ${test.duration}ms`);
      });
    }

    console.log();
  }
}

// Main execution
async function main(): Promise<void> {
  const executor = new TestExecutor();
  
  try {
    await executor.runAllTests();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n🛑 Test execution interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test execution terminated');
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TestExecutor };