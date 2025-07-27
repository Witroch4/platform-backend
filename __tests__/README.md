# Comprehensive Testing Suite - Sistema Refatoração Prisma

This directory contains a comprehensive testing suite for the sistema-refatoracao-prisma specification, covering all requirements with unit tests, integration tests, performance tests, and end-to-end tests.

## Test Structure

```
__tests__/
├── unit/                           # Unit tests for core components
│   ├── webhook-dispatcher.test.ts  # Webhook dispatcher with correlation ID tracking
│   ├── queue-managers.test.ts      # Queue managers and job processing logic
│   ├── cache-manager.test.ts       # Cache manager with various scenarios
│   └── credential-fallback-resolver.test.ts # Credential fallback with loop detection
├── integration/                    # Integration tests for complete flows
│   ├── webhook-e2e-comprehensive.test.ts # End-to-end webhook processing
│   └── job-processing-flow.test.ts # Complete job processing through both queues
├── performance/                    # Performance tests for SLA requirements
│   ├── webhook-load-tests.test.ts  # Webhook endpoint load testing (100ms requirement)
│   ├── worker-performance.test.ts  # Worker job processing SLA tests
│   ├── cache-performance.test.ts   # Cache credential lookup performance
│   └── database-query-performance.test.ts # Database query optimization tests
├── e2e/                           # End-to-end user workflow tests
│   └── user-workflow-tests.test.ts # Complete user interaction workflows
└── run-comprehensive-tests.ts     # Test runner with reporting
```

## Requirements Coverage

### Unit Tests (8.1)
- **Requirements**: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2
- **Components Tested**:
  - Webhook dispatcher with correlation ID tracking
  - Queue managers for high/low priority processing
  - Cache manager with Redis operations
  - Credential fallback resolver with loop detection

### Integration Tests (8.2)
- **Requirements**: 1.1, 1.4, 2.1, 2.4, 5.1, 5.4
- **Flows Tested**:
  - Complete webhook to WhatsApp response flow
  - Job processing through both priority queues
  - Database updates and cache synchronization
  - Credential fallback chain scenarios

### Performance Tests (8.3)
- **Requirements**: 1.1, 1.3, 5.1, 5.2
- **Metrics Tested**:
  - Webhook response time <100ms
  - Worker job processing SLAs
  - Cache lookup performance
  - Database query optimization

### End-to-End Tests (8.4)
- **Requirements**: All requirements comprehensive validation
- **Workflows Tested**:
  - Complete lead creation and update lifecycle
  - Template management and usage workflows
  - Credential configuration and fallback scenarios
  - Error recovery and resilience workflows
  - Performance and scalability under load

## Running Tests

### Run All Tests
```bash
npm run test:comprehensive
```

### Run by Category
```bash
# Unit tests only
npm run test:comprehensive -- --category unit

# Integration tests only
npm run test:comprehensive -- --category integration

# Performance tests only
npm run test:comprehensive -- --category performance

# E2E tests only
npm run test:comprehensive -- --category e2e
```

### Run by Requirements
```bash
# Test specific requirements
npm run test:comprehensive -- --requirements 1.1 1.2 1.3

# Test performance requirements
npm run test:comprehensive -- --requirements 5.1 5.2
```

### Run Individual Test Files
```bash
# Run specific test file
npx jest __tests__/unit/webhook-dispatcher.test.ts --verbose

# Run with coverage
npx jest __tests__/unit/webhook-dispatcher.test.ts --coverage

# Run with specific timeout
npx jest __tests__/performance/webhook-load-tests.test.ts --testTimeout=120000
```

## Test Configuration

### Jest Configuration
The tests use Jest with the following key configurations:
- TypeScript support via ts-jest
- Module path mapping for imports
- Coverage reporting
- Custom timeouts for performance tests

### Mock Strategy
- **Redis**: Mocked for consistent performance testing
- **Prisma**: Mocked with realistic response times
- **WhatsApp API**: Mocked to simulate various scenarios
- **Queue Systems**: Mocked for deterministic testing

### Environment Setup
Tests run in an isolated environment with:
- Mocked external dependencies
- Controlled timing for async operations
- Deterministic data for reproducible results

## Performance Benchmarks

### Webhook Response Times
- **Target**: <100ms for simple requests
- **Target**: <150ms for complex requests
- **Load Test**: 50 concurrent requests

### Worker Processing Times
- **High Priority**: <2 seconds per job
- **Low Priority**: <5 seconds per job
- **Batch Operations**: <10 seconds for 50 items

### Cache Performance
- **Get Operations**: <10ms
- **Set Operations**: <15ms
- **Batch Operations**: <50ms for 100 items

### Database Query Performance
- **Simple Queries**: <50ms
- **Complex Queries**: <200ms
- **Batch Updates**: <300ms for 20 items

## Test Reports

The comprehensive test runner generates detailed reports including:
- **Summary**: Pass/fail rates, total duration
- **Category Breakdown**: Results by test category
- **Requirements Coverage**: Which requirements are validated
- **Performance Metrics**: Timing and throughput data
- **Failure Details**: Detailed error information
- **Recommendations**: Suggestions for improvements

## Continuous Integration

### Pre-commit Hooks
```bash
# Run unit tests before commit
npm run test:unit

# Run performance tests before push
npm run test:performance
```

### CI Pipeline Integration
```yaml
# Example GitHub Actions workflow
- name: Run Comprehensive Tests
  run: |
    npm run test:comprehensive
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

## Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   - **Fixed**: Tests now use port 6379 instead of 6380
   - Redis mocks are used when Redis is not available
   - Run `npm run test:pre-check` to verify Redis connection

2. **Frontend Test Environment Issues**
   - **Fixed**: Added jsdom configuration for React components
   - NextAuth and Next.js router are properly mocked
   - Use separate Jest project for frontend tests

3. **Timeout Errors**
   - **Fixed**: Adjusted timeouts by test type (unit: 10s, integration: 30s, performance: 60s, e2e: 120s)
   - Added `--detectOpenHandles` and `--forceExit` flags
   - Check for infinite loops in async operations

4. **Database Connection Issues**
   - **Fixed**: Prisma is fully mocked in tests
   - Test database configuration in `.env.test`
   - No real database connections needed for tests

5. **Memory Issues**
   - **Fixed**: Added proper cleanup in afterEach hooks
   - Centralized mocks prevent memory leaks
   - Use `--detectOpenHandles` to identify open handles

### Debug Mode
```bash
# Run tests in debug mode
npx jest --detectOpenHandles --forceExit __tests__/unit/webhook-dispatcher.test.ts

# Run with verbose logging
DEBUG=* npm run test:comprehensive
```

## Contributing

When adding new tests:

1. **Follow the naming convention**: `component-name.test.ts`
2. **Add requirement mappings**: Document which requirements are tested
3. **Include performance assertions**: Add timing expectations
4. **Update the test runner**: Add new test suites to the configuration
5. **Document test scenarios**: Explain what each test validates

### Test Template
```typescript
/**
 * Unit tests for [Component Name]
 * Requirements: [List of requirements tested]
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('[Component Name]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mocks
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('[Feature Group]', () => {
    test('should [expected behavior]', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Maintenance

### Regular Tasks
- **Weekly**: Run full test suite and review performance metrics
- **Monthly**: Update performance benchmarks based on system changes
- **Quarterly**: Review test coverage and add tests for new features

### Performance Monitoring
- Track test execution times to identify performance regressions
- Monitor memory usage during test runs
- Update benchmarks when system requirements change

---

For questions or issues with the testing suite, please refer to the sistema-refatoracao-prisma specification or contact the development team.