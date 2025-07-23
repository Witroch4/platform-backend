#!/usr/bin/env tsx

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

interface TestSuite {
  name: string
  path: string
  description: string
  timeout?: number
}

const testSuites: TestSuite[] = [
  {
    name: 'Interactive Message Creator Integration',
    path: 'app/admin/mtf-diamante/components/interactive-message-creator/__tests__/integration.test.tsx',
    description: 'Complete 3-step workflow, state management, and user interactions',
    timeout: 30000
  },
  {
    name: 'Webhook Processing Integration',
    path: 'worker/WebhookWorkerTasks/__tests__/webhook-integration.test.ts',
    description: 'Button click processing, automatic reactions, and webhook handling',
    timeout: 20000
  },
  {
    name: 'API Atomic Operations Integration',
    path: 'app/api/admin/mtf-diamante/messages-with-reactions/__tests__/integration.test.ts',
    description: 'Atomic save operations, rollback scenarios, and CRUD operations',
    timeout: 15000
  },
  {
    name: 'WhatsApp Reaction Delivery E2E',
    path: '__tests__/e2e/whatsapp-reaction-delivery.test.ts',
    description: 'End-to-end WhatsApp API integration and reaction delivery',
    timeout: 25000
  }
]

interface TestResult {
  suite: string
  passed: boolean
  duration: number
  output: string
  error?: string
}

class IntegrationTestRunner {
  private results: TestResult[] = []
  private startTime: number = 0

  constructor() {
    this.startTime = Date.now()
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Interactive Message Integration Tests')
    console.log('=' .repeat(60))
    console.log()

    // Verify test files exist
    this.verifyTestFiles()

    // Run each test suite
    for (const suite of testSuites) {
      await this.runTestSuite(suite)
    }

    // Generate summary report
    this.generateSummaryReport()
  }

  private verifyTestFiles(): void {
    console.log('📋 Verifying test files...')
    
    const missingFiles: string[] = []
    
    for (const suite of testSuites) {
      if (!existsSync(suite.path)) {
        missingFiles.push(suite.path)
      }
    }

    if (missingFiles.length > 0) {
      console.error('❌ Missing test files:')
      missingFiles.forEach(file => console.error(`   - ${file}`))
      process.exit(1)
    }

    console.log('✅ All test files found')
    console.log()
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`🧪 Running: ${suite.name}`)
    console.log(`📝 ${suite.description}`)
    console.log(`📁 ${suite.path}`)
    
    const startTime = Date.now()
    
    try {
      const command = this.buildJestCommand(suite)
      console.log(`⚡ Command: ${command}`)
      console.log()

      const output = execSync(command, {
        encoding: 'utf8',
        timeout: suite.timeout || 30000,
        stdio: 'pipe'
      })

      const duration = Date.now() - startTime
      
      this.results.push({
        suite: suite.name,
        passed: true,
        duration,
        output
      })

      console.log('✅ PASSED')
      console.log(`⏱️  Duration: ${duration}ms`)
      console.log()

    } catch (error: any) {
      const duration = Date.now() - startTime
      
      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        output: error.stdout || '',
        error: error.stderr || error.message
      })

      console.log('❌ FAILED')
      console.log(`⏱️  Duration: ${duration}ms`)
      console.log(`💥 Error: ${error.message}`)
      
      if (error.stdout) {
        console.log('📤 Output:')
        console.log(error.stdout)
      }
      
      if (error.stderr) {
        console.log('📥 Error Details:')
        console.log(error.stderr)
      }
      
      console.log()
    }
  }

  private buildJestCommand(suite: TestSuite): string {
    const jestConfig = existsSync('jest.config.js') ? '--config jest.config.js' : ''
    const timeout = suite.timeout ? `--testTimeout=${suite.timeout}` : ''
    
    return [
      'npx jest',
      `"${suite.path}"`,
      '--verbose',
      '--no-cache',
      '--runInBand', // Run tests serially to avoid conflicts
      '--detectOpenHandles',
      '--forceExit',
      jestConfig,
      timeout
    ].filter(Boolean).join(' ')
  }

  private generateSummaryReport(): void {
    const totalDuration = Date.now() - this.startTime
    const passedTests = this.results.filter(r => r.passed)
    const failedTests = this.results.filter(r => !r.passed)

    console.log('=' .repeat(60))
    console.log('📊 INTEGRATION TEST SUMMARY')
    console.log('=' .repeat(60))
    console.log()

    // Overall stats
    console.log(`📈 Total Suites: ${this.results.length}`)
    console.log(`✅ Passed: ${passedTests.length}`)
    console.log(`❌ Failed: ${failedTests.length}`)
    console.log(`⏱️  Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`)
    console.log()

    // Detailed results
    if (passedTests.length > 0) {
      console.log('✅ PASSED TESTS:')
      passedTests.forEach(result => {
        console.log(`   ✓ ${result.suite} (${result.duration}ms)`)
      })
      console.log()
    }

    if (failedTests.length > 0) {
      console.log('❌ FAILED TESTS:')
      failedTests.forEach(result => {
        console.log(`   ✗ ${result.suite} (${result.duration}ms)`)
        if (result.error) {
          console.log(`     Error: ${result.error.split('\n')[0]}`)
        }
      })
      console.log()
    }

    // Performance analysis
    console.log('⚡ PERFORMANCE ANALYSIS:')
    const sortedByDuration = [...this.results].sort((a, b) => b.duration - a.duration)
    sortedByDuration.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌'
      console.log(`   ${index + 1}. ${status} ${result.suite}: ${result.duration}ms`)
    })
    console.log()

    // Coverage analysis
    this.analyzeCoverage()

    // Recommendations
    this.generateRecommendations()

    // Exit with appropriate code
    if (failedTests.length > 0) {
      console.log('💥 Some tests failed. Please review the errors above.')
      process.exit(1)
    } else {
      console.log('🎉 All integration tests passed successfully!')
      process.exit(0)
    }
  }

  private analyzeCoverage(): void {
    console.log('📋 COVERAGE ANALYSIS:')
    
    const coverageAreas = [
      {
        area: '3-Step Workflow Navigation',
        covered: this.results.some(r => r.suite.includes('Interactive Message Creator')),
        critical: true
      },
      {
        area: 'Atomic Save Operations',
        covered: this.results.some(r => r.suite.includes('API Atomic Operations')),
        critical: true
      },
      {
        area: 'Webhook Button Processing',
        covered: this.results.some(r => r.suite.includes('Webhook Processing')),
        critical: true
      },
      {
        area: 'WhatsApp API Integration',
        covered: this.results.some(r => r.suite.includes('WhatsApp Reaction Delivery')),
        critical: true
      },
      {
        area: 'Real-time Preview Updates',
        covered: this.results.some(r => r.suite.includes('Interactive Message Creator')),
        critical: false
      },
      {
        area: 'Error Handling & Rollback',
        covered: this.results.some(r => r.suite.includes('API Atomic Operations')),
        critical: true
      },
      {
        area: 'Reaction Configuration',
        covered: this.results.some(r => r.suite.includes('Interactive Message Creator')),
        critical: false
      },
      {
        area: 'Performance & Scalability',
        covered: this.results.some(r => r.suite.includes('WhatsApp Reaction Delivery')),
        critical: false
      }
    ]

    coverageAreas.forEach(area => {
      const status = area.covered ? '✅' : '❌'
      const priority = area.critical ? '🔴 CRITICAL' : '🟡 IMPORTANT'
      console.log(`   ${status} ${area.area} (${priority})`)
    })

    const criticalCovered = coverageAreas.filter(a => a.critical && a.covered).length
    const totalCritical = coverageAreas.filter(a => a.critical).length
    const coveragePercentage = (criticalCovered / totalCritical) * 100

    console.log()
    console.log(`📊 Critical Coverage: ${criticalCovered}/${totalCritical} (${coveragePercentage.toFixed(1)}%)`)
    console.log()
  }

  private generateRecommendations(): void {
    console.log('💡 RECOMMENDATIONS:')

    const failedTests = this.results.filter(r => !r.passed)
    const slowTests = this.results.filter(r => r.duration > 10000) // > 10 seconds

    if (failedTests.length === 0) {
      console.log('   ✅ All tests are passing - great job!')
    } else {
      console.log('   🔧 Fix failing tests before deploying to production')
      console.log('   📝 Review error messages and stack traces above')
    }

    if (slowTests.length > 0) {
      console.log('   ⚡ Consider optimizing slow tests:')
      slowTests.forEach(test => {
        console.log(`      - ${test.suite}: ${test.duration}ms`)
      })
    }

    console.log('   📈 Consider adding more edge case tests')
    console.log('   🔍 Monitor test performance over time')
    console.log('   🚀 Run these tests in CI/CD pipeline')
    console.log()
  }
}

// Main execution
async function main() {
  const runner = new IntegrationTestRunner()
  await runner.runAllTests()
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error)
  process.exit(1)
})

// Run the tests
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test runner failed:', error)
    process.exit(1)
  })
}

export { IntegrationTestRunner }