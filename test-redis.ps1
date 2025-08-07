#!/usr/bin/env pwsh

# Redis Connection Test Script
# Tests Redis connection stability and timeout handling

Write-Host "🔍 Testing Redis Connection..." -ForegroundColor Cyan

# Check if Docker containers are running
Write-Host "Checking Docker containers..." -ForegroundColor Yellow
docker-compose ps

# Run the Redis connection test
Write-Host "`n🧪 Running Redis connection tests..." -ForegroundColor Cyan
npx tsx scripts/test-redis-connection.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Redis connection tests completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Redis connection tests failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n📊 Current Redis configuration:" -ForegroundColor Yellow
Write-Host "REDIS_HOST: $env:REDIS_HOST"
Write-Host "REDIS_PORT: $env:REDIS_PORT"
Write-Host "REDIS_CONNECT_TIMEOUT: $env:REDIS_CONNECT_TIMEOUT"
Write-Host "REDIS_COMMAND_TIMEOUT: $env:REDIS_COMMAND_TIMEOUT"
Write-Host "REDIS_KEEP_ALIVE: $env:REDIS_KEEP_ALIVE"

Write-Host "`n🔧 To restart Redis container if needed:" -ForegroundColor Cyan
Write-Host "docker-compose restart redis"

Write-Host "`n📝 To monitor Redis logs:" -ForegroundColor Cyan
Write-Host "docker-compose logs -f redis"