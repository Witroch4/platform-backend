/**
 * Custom Test Results Processor
 * Processes and formats test results for targeted tests
 */

const fs = require('fs');
const path = require('path');

module.exports = (results) => {
  // Create detailed test report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.numTotalTests,
      passed: results.numPassedTests,
      failed: results.numFailedTests,
      skipped: results.numPendingTests,
      duration: results.testResults.reduce((sum, result) => sum + result.perfStats.end - result.perfStats.start, 0),
    },
    coverage: results.coverageMap ? {
      statements: results.coverageMap.getCoverageSummary().statements.pct,
      branches: results.coverageMap.getCoverageSummary().branches.pct,
      functions: results.coverageMap.getCoverageSummary().functions.pct,
      lines: results.coverageMap.getCoverageSummary().lines.pct,
    } : null,
    testSuites: results.testResults.map(result => ({
      name: path.basename(result.testFilePath),
      path: result.testFilePath,
      passed: result.numPassingTests,
      failed: result.numFailingTests,
      skipped: result.numPendingTests,
      duration: result.perfStats.end - result.perfStats.start,
      tests: result.testResults.map(test => ({
        name: test.fullName,
        status: test.status,
        duration: test.duration,
        error: test.failureMessages.length > 0 ? test.failureMessages[0] : null,
      })),
    })),
  };

  // Write detailed report to file
  const reportPath = path.join(process.cwd(), 'coverage', 'targeted', 'detailed-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Log summary to console
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total Tests: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Skipped: ${report.summary.skipped}`);
  console.log(`Duration: ${report.summary.duration}ms`);
  
  if (report.coverage) {
    console.log('\n📈 COVERAGE SUMMARY');
    console.log('-' .repeat(30));
    console.log(`Statements: ${report.coverage.statements.toFixed(2)}%`);
    console.log(`Branches: ${report.coverage.branches.toFixed(2)}%`);
    console.log(`Functions: ${report.coverage.functions.toFixed(2)}%`);
    console.log(`Lines: ${report.coverage.lines.toFixed(2)}%`);
  }

  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  return results;
};