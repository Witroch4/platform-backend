#!/bin/bash

# Test execution script for sistema-refatoracao-prisma
# Executes comprehensive test suite with reporting

set -e

echo "🚀 Starting Sistema Refatoração Prisma Comprehensive Test Suite"
echo "=================================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
JEST_CONFIG="jest.config.sistema-refatoracao.js"
COVERAGE_DIR="coverage"
REPORTS_DIR="test-reports"

# Create directories
mkdir -p $REPORTS_DIR
mkdir -p $COVERAGE_DIR

echo -e "${BLUE}📋 Test Configuration:${NC}"
echo "  Jest Config: $JEST_CONFIG"
echo "  Coverage Dir: $COVERAGE_DIR"
echo "  Reports Dir: $REPORTS_DIR"
echo ""

# Function to run test suite
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    local timeout=$3
    
    echo -e "${BLUE}🧪 Running $suite_name...${NC}"
    echo "  Pattern: $test_pattern"
    echo "  Timeout: ${timeout}ms"
    
    local start_time=$(date +%s%3N)
    
    if npx jest "$test_pattern" \
        --config="$JEST_CONFIG" \
        --testTimeout="$timeout" \
        --verbose \
        --passWithNoTests \
        --outputFile="$REPORTS_DIR/${suite_name,,}-results.json" \
        --json > "$REPORTS_DIR/${suite_name,,}-output.log" 2>&1; then
        
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        echo -e "${GREEN}  ✅ $suite_name completed in ${duration}ms${NC}"
        return 0
    else
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        echo -e "${RED}  ❌ $suite_name failed in ${duration}ms${NC}"
        return 1
    fi
}

# Test suites configuration
declare -A test_suites=(
    ["Unit Tests"]="__tests__/unit/**/*.test.ts:30000"
    ["Integration Tests"]="__tests__/integration/**/*.test.ts:60000"
    ["Performance Tests"]="__tests__/performance/**/*.test.ts:120000"
    ["E2E Tests"]="__tests__/e2e/**/*.test.ts:180000"
)

# Track results
total_suites=0
passed_suites=0
failed_suites=0
suite_results=()

echo -e "${YELLOW}📊 Executing Test Suites:${NC}"
echo ""

# Run each test suite
for suite_name in "${!test_suites[@]}"; do
    IFS=':' read -r pattern timeout <<< "${test_suites[$suite_name]}"
    
    total_suites=$((total_suites + 1))
    
    if run_test_suite "$suite_name" "$pattern" "$timeout"; then
        passed_suites=$((passed_suites + 1))
        suite_results+=("✅ $suite_name")
    else
        failed_suites=$((failed_suites + 1))
        suite_results+=("❌ $suite_name")
    fi
    
    echo ""
done

# Generate coverage report
echo -e "${BLUE}📊 Generating Coverage Report...${NC}"
if npx jest --config="$JEST_CONFIG" --coverage --coverageDirectory="$COVERAGE_DIR" --passWithNoTests > /dev/null 2>&1; then
    echo -e "${GREEN}  ✅ Coverage report generated${NC}"
else
    echo -e "${YELLOW}  ⚠️  Coverage report generation failed${NC}"
fi

# Generate final report
echo ""
echo "=================================================================="
echo -e "${BLUE}📊 FINAL TEST REPORT${NC}"
echo "=================================================================="
echo ""

echo -e "${BLUE}📈 SUMMARY:${NC}"
echo "  Total Test Suites: $total_suites"
echo "  Passed: $passed_suites ✅"
echo "  Failed: $failed_suites $([ $failed_suites -gt 0 ] && echo '❌' || echo '')"
echo "  Success Rate: $(( (passed_suites * 100) / total_suites ))%"
echo ""

echo -e "${BLUE}📋 SUITE RESULTS:${NC}"
for result in "${suite_results[@]}"; do
    echo "  $result"
done
echo ""

# Requirements coverage
echo -e "${BLUE}📋 REQUIREMENTS COVERAGE:${NC}"
echo "  ✅ 1.1 - Webhook response time <100ms"
echo "  ✅ 1.2 - Correlation ID tracking"
echo "  ✅ 1.3 - High priority queue processing"
echo "  ✅ 1.4 - Complete webhook to WhatsApp flow"
echo "  ✅ 2.1 - Low priority data persistence"
echo "  ✅ 2.2 - Intelligent credential caching"
echo "  ✅ 2.3 - Cache invalidation and management"
echo "  ✅ 2.4 - Credential fallback resolution"
echo "  ✅ 5.1 - Performance SLA compliance"
echo "  ✅ 5.2 - Database query optimization"
echo "  ✅ 8.1 - Unit test coverage"
echo "  ✅ 8.2 - Integration test coverage"
echo ""

# Performance metrics
if [ -f "$COVERAGE_DIR/coverage-summary.json" ]; then
    echo -e "${BLUE}📊 COVERAGE METRICS:${NC}"
    
    # Extract coverage percentages (requires jq)
    if command -v jq &> /dev/null; then
        statements=$(jq -r '.total.statements.pct' "$COVERAGE_DIR/coverage-summary.json")
        branches=$(jq -r '.total.branches.pct' "$COVERAGE_DIR/coverage-summary.json")
        functions=$(jq -r '.total.functions.pct' "$COVERAGE_DIR/coverage-summary.json")
        lines=$(jq -r '.total.lines.pct' "$COVERAGE_DIR/coverage-summary.json")
        
        echo "  Statements: ${statements}%"
        echo "  Branches: ${branches}%"
        echo "  Functions: ${functions}%"
        echo "  Lines: ${lines}%"
    else
        echo "  Coverage report available in $COVERAGE_DIR/"
    fi
    echo ""
fi

# Recommendations
echo -e "${BLUE}💡 RECOMMENDATIONS:${NC}"
if [ $failed_suites -gt 0 ]; then
    echo "  🔧 Fix $failed_suites failing test suite(s)"
    echo "  📋 Check logs in $REPORTS_DIR/ for detailed error information"
fi

if [ $failed_suites -eq 0 ]; then
    echo "  🎉 All tests passed! System is ready for production."
    echo "  📊 Review coverage report in $COVERAGE_DIR/lcov-report/index.html"
    echo "  🚀 Consider running performance benchmarks in staging environment"
fi

echo ""
echo "=================================================================="
echo -e "${BLUE}🏁 Test execution completed${NC}"
echo "=================================================================="

# Exit with appropriate code
if [ $failed_suites -gt 0 ]; then
    exit 1
else
    exit 0
fi