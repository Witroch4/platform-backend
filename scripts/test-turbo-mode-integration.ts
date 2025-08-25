#!/usr/bin/env tsx
/**
 * TURBO Mode Integration Test Script
 * Comprehensive testing of TURBO mode system integration
 * Based on requirements 5.3, 5.5, 10.1
 */

import { runCompleteIntegrationTest, verifySystemIntegration, verifyBackwardCompatibility } from '@/lib/turbo-mode/system-integration'
import log from '@/lib/utils/logger'

async function main() {
  console.log('🚀 Starting TURBO Mode Integration Test')
  console.log('=====================================')

  try {
    // Test with a mock user ID and account ID
    const testUserId = 'test-user-integration'
    const testAccountId = 'test-account-integration'

    // Run complete integration test
    const testResult = await runCompleteIntegrationTest(testUserId, testAccountId)

    console.log('\n📊 Test Results Summary')
    console.log('=======================')
    console.log(`Overall Success: ${testResult.success ? '✅' : '❌'}`)
    console.log(`Summary: ${testResult.summary}`)

    // Detailed results
    console.log('\n🔧 System Integration')
    console.log('---------------------')
    const sysInteg = testResult.results.systemIntegration
    console.log(`Success: ${sysInteg.success ? '✅' : '❌'}`)
    console.log('Components:')
    Object.entries(sysInteg.components).forEach(([component, status]) => {
      console.log(`  ${component}: ${status ? '✅' : '❌'}`)
    })
    
    if (sysInteg.errors.length > 0) {
      console.log('Errors:')
      sysInteg.errors.forEach(error => console.log(`  ❌ ${error}`))
    }
    
    if (sysInteg.warnings.length > 0) {
      console.log('Warnings:')
      sysInteg.warnings.forEach(warning => console.log(`  ⚠️ ${warning}`))
    }

    console.log('\n🔄 Backward Compatibility')
    console.log('-------------------------')
    const backCompat = testResult.results.backwardCompatibility
    console.log(`Success: ${backCompat.success ? '✅' : '❌'}`)
    console.log('Checks:')
    Object.entries(backCompat.checks).forEach(([check, status]) => {
      console.log(`  ${check}: ${status ? '✅' : '❌'}`)
    })
    
    if (backCompat.errors.length > 0) {
      console.log('Errors:')
      backCompat.errors.forEach(error => console.log(`  ❌ ${error}`))
    }

    console.log('\n👤 User Initialization')
    console.log('----------------------')
    const userInit = testResult.results.userInitialization
    console.log(`Success: ${userInit.success ? '✅' : '❌'}`)
    if (userInit.error) {
      console.log(`Error: ${userInit.error}`)
    }
    if (userInit.eligibility) {
      console.log(`TURBO Mode Eligible: ${userInit.eligibility.eligible ? '✅' : '❌'}`)
      console.log(`Reason: ${userInit.eligibility.reason}`)
    }

    // Exit with appropriate code
    process.exit(testResult.success ? 0 : 1)

  } catch (error) {
    console.error('❌ Integration test failed with unexpected error:', error)
    log.error('Integration test script failed', { error })
    process.exit(1)
  }
}

// Run individual tests if specific arguments are provided
async function runIndividualTests() {
  const args = process.argv.slice(2)
  
  if (args.includes('--system-only')) {
    console.log('🔧 Running System Integration Test Only')
    const result = await verifySystemIntegration()
    console.log(`Result: ${result.success ? '✅' : '❌'}`)
    console.log('Components:', result.components)
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors)
    }
    process.exit(result.success ? 0 : 1)
  }
  
  if (args.includes('--backward-only')) {
    console.log('🔄 Running Backward Compatibility Test Only')
    const result = await verifyBackwardCompatibility()
    console.log(`Result: ${result.success ? '✅' : '❌'}`)
    console.log('Checks:', result.checks)
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors)
    }
    process.exit(result.success ? 0 : 1)
  }
}

// Check for individual test flags
if (process.argv.includes('--system-only') || process.argv.includes('--backward-only')) {
  runIndividualTests()
} else {
  main()
}