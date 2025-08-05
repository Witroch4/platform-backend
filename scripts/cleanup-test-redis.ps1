# Cleanup Redis test environment
Write-Host "🧹 Cleaning up Redis test environment..." -ForegroundColor Yellow

# Stop and remove test containers
docker-compose -f docker-compose.test.yml down -v

Write-Host "✅ Redis test environment cleaned up" -ForegroundColor Green