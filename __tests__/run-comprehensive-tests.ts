/**
 * Comprehensive test runner for the sistema-refatoracao-prisma spec
 * Requirements: All requirements validation
 */

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

interface TestSuite {
  name: string;
  path: string;
  category: 'unit' | 'integration' | 'performance' | 'e2e';
  timeout: number;
  requirements: string[];
}

const testSuites: TestSuite[] = [
  // Unit Tests
  {
    name: 'Webhook Dispatcher Unit Tests',
    path: '__tests__/unit/webhook-dispatcher.test.ts',
    category: 'unit',
    timeout: 30000,
    requirements: ['1.1', '1.2', '1.3', '2.2', '2.3', '8.1', '8.2'],
  },
  {
    name: 'Queue Managers Unit Tests',
    path: '__tests__/unit/queue-managers.test.ts',
    category: 'unit',
    timeout: 30000,
    requirements: ['1.1', '1.2', '1.3', '2.2', '2.3', '8.1', '8.2'],
  },
  {
    name: 'Cache Manager Unit Tests',
    path: '__tests__/unit/cache-manager.test.ts',
    category: 'unit',
    timeout: 30000,
    requirements: ['1.1', '1.2', '1.3', '2.2', '2.3', '8.1', '8.2'],
  },
  {
    name: 'Credential Fallback Resolver Unit Tests',
    path: '__tests__/unit/credential-fallback-resolver.test.ts',
    category: 'unit',
    timeout: 30000,
    requirements: ['1.1', '1.2', '1.3', '2.2', '2.3', '8.1', '8.2'],
  },

  // Integration Tests
  {
    name: 'Webhook E2E Comprehensive Tests',
    path: '__tests__/integration/webhook-e2e-comprehensive.test.ts',
    category: 'integration',
    timeout: 60000,
    requirements: ['1.1', '1.4', '2.1', '2.4', '5.1', '5.4'],
  },
  {
    name: 'Job Processing Flow Tests',
    path: '__tests__/integration/job-processing-flow.test.ts',
    category: 'integration',
    timeout: 60000,
    requirements: ['1.1', '1.4', '2.1', '2.4', '5.1', '5.4'],
  },

  // Performance Tests
  {
    name: 'Webhook Load Tests',
    path: '__tests__/performance/webhook-load-tests.test.ts',
    category: 'performance',
    timeout: 120000,
    requirements: ['1.1', '1.3', '5.1', '5.2'],
  },
  {
    name: 'Worker Performance Tests',
    path: '__tests__/performance/worker-performance.test.ts',
    category: 'performance',
    timeout: 120000,
    requirements: ['1.1', '1.3', '5.1', '5.2'],
  },
  {
    name: 'Cache Performance Tests',
    path: '__tests__/performance/cache-performance.test.ts',
    category: 'performance',
    timeout: 120000,
    requirements: ['1.1', '1.3', '5.1', '5.2'],
  },
  {
    name: 'Database Query Performance Tests',
    path: '__tests__/performance/database-query-performance.test.ts',
    category: 'performance',
    timeout: 120000,
    requirements: ['1.1', '1.3', '5.1', '5.2'],
  },

  // E2E Tests
  {
    name: 'Complete User Workflows Tests',
    path: '__tests__/e2e/user-workflow-tests.test.ts',
    category: 'e2e',
    timeout: 180000,
    requirements: ['All requirements comprehensive validation'],
  },
];

interface TestResult {
  suite: TestSuite;
  passed: boolean;
  duration: number;
  error?: string;
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

class ComprehensiveTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite for sistema-refatoracao-prisma');
    console.log('=' .repeat(80));
    
    this.startTime = performance.now();

    // Run tests by category
    await this.runTestsByCategory('unit');
    await this.runTestsByCategory('integration');
    await this.runTestsByCategory('performance');
    await this.runTestsByCategory('e2e');

    this.generateReport();
  }

  private async runTestsByCategory(category: TestSuite['category']): Promise<void> {
    const categoryTests = testSuites.filter(suite => suite.category === category);
    
    console.log(`\n📋 Running ${category.toUpperCase()} Tests (${categoryTests.length} suites)`);
    console.log('-'.repeat(60));

    for (const suite of categoryTests) {
      await this.runTestSuite(suite);
    }
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`\n🧪 Running: ${suite.name}`);
    console.log(`   Path: ${suite.path}`);
    console.log(`   Requirements: ${suite.requirements.join(', ')}`);
    console.log(`   Timeout: ${suite.timeout}ms`);

    const startTime = performance.now();
    let result: TestResult;

    try {
      // Run the test suite using Jest
      const command = `npx jest "${suite.path}" --testTimeout=${suite.timeout} --verbose --coverage --coverageReporters=json-summary`;
      
      console.log(`   ⏳ Executing...`);
      
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: suite.timeout + 10000, // Add 10s buffer
        stdio: 'pipe',
      });

      const duration = performance.now() - startTime;

      // Parse coverage if available
      let coverage;
      try {
        const coverageData = JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8'));
        coverage = {
          statements: coverageData.total.statements.pct,
          branches: coverageData.total.branches.pct,
          functions: coverageData.total.functions.pct,
          lines: coverageData.total.lines.pct,
        };
      } catch {
        // Coverage not available
      }

      result = {
        suite,
        passed: true,
        duration,
        coverage,
      };

      console.log(`   ✅ PASSED (${duration.toFixed(2)}ms)`);
      if (coverage) {
        console.log(`   📊 Coverage: ${coverage.statements}% statements, ${coverage.lines}% lines`);
      }

    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      result = {
        suite,
        passed: false,
        duration,
        error: errorMessage,
      };

      console.log(`   ❌ FAILED (${duration.toFixed(2)}ms)`);
      console.log(`   💥 Error: ${errorMessage.split('\n')[0]}`);
    }

    this.results.push(result);
  }

  private generateReport(): void {
    const totalDuration = performance.now() - this.startTime;
    const passedTests = this.results.filter(r => r.passed);
    const failedTests = this.results.filter(r => !r.passed);

    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(80));

    // Summary
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total Test Suites: ${this.results.length}`);
    console.log(`   Passed: ${passedTests.length} ✅`);
    console.log(`   Failed: ${failedTests.length} ${failedTests.length > 0 ? '❌' : ''}`);
    console.log(`   Success Rate: ${((passedTests.length / this.results.length) * 100).toFixed(1)}%`);
    console.log(`   Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    // Results by category
    const categories = ['unit', 'integration', 'performance', 'e2e'] as const;
    
    categories.forEach(category => {
      const categoryResults = this.results.filter(r => r.suite.category === category);
      if (categoryResults.length === 0) return;

      const categoryPassed = categoryResults.filter(r => r.passed).length;
      const categoryDuration = categoryResults.reduce((sum, r) => sum + r.duration, 0);

      console.log(`\n📋 ${category.toUpperCase()} TESTS:`);
      console.log(`   Suites: ${categoryResults.length}`);
      console.log(`   Passed: ${categoryPassed}/${categoryResults.length}`);
      console.log(`   Duration: ${(categoryDuration / 1000).toFixed(2)}s`);

      categoryResults.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(2);
        console.log(`   ${status} ${result.suite.name} (${duration}s)`);
        
        if (!result.passed && result.error) {
          console.log(`      Error: ${result.error.split('\n')[0]}`);
        }
        
        if (result.coverage) {
          console.log(`      Coverage: ${result.coverage.statements}% statements`);
        }
      });
    });

    // Requirements coverage
    console.log(`\n📋 REQUIREMENTS COVERAGE:`);
    const allRequirements = new Set<string>();
    const coveredRequirements = new Set<string>();

    this.results.forEach(result => {
      result.suite.requirements.forEach(req => {
        allRequirements.add(req);
        if (result.passed) {
          coveredRequirements.add(req);
        }
      });
    });

    console.log(`   Total Requirements: ${allRequirements.size}`);
    console.log(`   Covered Requirements: ${coveredRequirements.size}`);
    console.log(`   Coverage: ${((coveredRequirements.size / allRequirements.size) * 100).toFixed(1)}%`);

    // Failed tests details
    if (failedTests.length > 0) {
      console.log(`\n❌ FAILED TESTS DETAILS:`);
      failedTests.forEach(result => {
        console.log(`\n   Suite: ${result.suite.name}`);
        console.log(`   Path: ${result.suite.path}`);
        console.log(`   Requirements: ${result.suite.requirements.join(', ')}`);
        console.log(`   Error: ${result.error}`);
      });
    }

    // Performance metrics
    const performanceResults = this.results.filter(r => r.suite.category === 'performance');
    if (performanceResults.length > 0) {
      console.log(`\n⚡ PERFORMANCE METRICS:`);
      performanceResults.forEach(result => {
        if (result.passed) {
          console.log(`   ✅ ${result.suite.name}: ${(result.duration / 1000).toFixed(2)}s`);
        }
      });
    }

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (failedTests.length > 0) {
      console.log(`   🔧 Fix ${failedTests.length} failing test suite(s)`);
    }
    
    const slowTests = this.results.filter(r => r.duration > 60000);
    if (slowTests.length > 0) {
      console.log(`   ⚡ Optimize ${slowTests.length} slow test suite(s) (>60s)`);
    }
    
    const lowCoverageTests = this.results.filter(r => 
      r.coverage && r.coverage.statements < 80
    );
    if (lowCoverageTests.length > 0) {
      console.log(`   📊 Improve coverage for ${lowCoverageTests.length} test suite(s) (<80%)`);
    }

    if (passedTests.length === this.results.length) {
      console.log(`   🎉 All tests passed! System is ready for production.`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('🏁 Test execution completed');
    console.log('='.repeat(80));
  }

  // Method to run specific test categories
  async runCategory(category: TestSuite['category']): Promise<void> {
    console.log(`🚀 Running ${category.toUpperCase()} Tests Only`);
    console.log('=' .repeat(50));
    
    this.startTime = performance.now();
    await this.runTestsByCategory(category);
    this.generateReport();
  }

  // Method to run tests for specific requirements
  async runByRequirements(requirements: string[]): Promise<void> {
    const matchingTests = testSuites.filter(suite =>
      suite.requirements.some(req => requirements.includes(req))
    );

    console.log(`🚀 Running Tests for Requirements: ${requirements.join(', ')}`);
    console.log(`Found ${matchingTests.length} matching test suites`);
    console.log('=' .repeat(50));
    
    this.startTime = performance.now();

    for (const suite of matchingTests) {
      await this.runTestSuite(suite);
    }

    this.generateReport();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const runner = new ComprehensiveTestRunner();

  if (args.length === 0) {
    // Run all tests
    await runner.runAllTests();
  } else if (args[0] === '--category') {
    // Run specific category
    const category = args[1] as TestSuite['category'];
    if (['unit', 'integration', 'performance', 'e2e'].includes(category)) {
      await runner.runCategory(category);
    } else {
      console.error('Invalid category. Use: unit, integration, performance, or e2e');
      process.exit(1);
    }
  } else if (args[0] === '--requirements') {
    // Run tests for specific requirements
    const requirements = args.slice(1);
    await runner.runByRequirements(requirements);
  } else {
    console.log('Usage:');
    console.log('  npm run test:comprehensive                    # Run all tests');
    console.log('  npm run test:comprehensive -- --category unit # Run unit tests only');
    console.log('  npm run test:comprehensive -- --requirements 1.1 1.2 # Run tests for specific requirements');
  }
}

// Export for programmatic use
export { ComprehensiveTestRunner, testSuites };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}