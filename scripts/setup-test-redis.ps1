# Setup Redis for Testing
Write-Host "🚀 Starting Redis for tests..." -ForegroundColor Green

# Start Redis test container
docker-compose -f docker-compose.test.yml up -d redis-test

# Wait for Redis to be ready
Write-Host "⏳ Waiting for Redis to be ready..." -ForegroundColor Yellow
$timeout = 30
$elapsed = 0

do {
    $result = docker exec chatwit_redis_test redis-cli ping 2>$null
    if ($result -eq "PONG") {
        Write-Host "✅ Redis is ready!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $elapsed++
    if ($elapsed -ge $timeout) {
        Write-Host "❌ Timeout waiting for Redis" -ForegroundColor Red
        exit 1
    }
} while ($true)

Write-Host "🎯 Redis test environment ready on port 6380" -ForegroundColor Green