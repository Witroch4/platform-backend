# Run tests with real Redis
param(
    [string]$TestPattern = "__tests__/integration/ai-integration/queues-integration.test.ts"
)

Write-Host "Running tests with real Redis..." -ForegroundColor Green

try {
    # Setup Redis
    Write-Host "Setting up test Redis..." -ForegroundColor Yellow
    & "$PSScriptRoot/setup-test-redis.ps1"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to setup Redis"
    }

    # Run tests
    Write-Host "Running tests..." -ForegroundColor Yellow
    $env:USE_TEST_REDIS = "true"
    npx jest $TestPattern --detectOpenHandles --forceExit --verbose
    
    $testExitCode = $LASTEXITCODE

} finally {
    # Cleanup Redis
    Write-Host "Cleaning up test Redis..." -ForegroundColor Yellow
    & "$PSScriptRoot/cleanup-test-redis.ps1"
    
    # Remove environment variable
    Remove-Item Env:USE_TEST_REDIS -ErrorAction SilentlyContinue
}

if ($testExitCode -ne 0) {
    Write-Host "Tests failed" -ForegroundColor Red
    exit $testExitCode
} else {
    Write-Host "All tests passed!" -ForegroundColor Green
}