# Script para iniciar serviços de desenvolvimento
# Verifica se os containers estão rodando e inicia se necessário

Write-Host "🚀 Iniciando serviços de desenvolvimento..." -ForegroundColor Green

# Função para verificar se um container está rodando
function Test-ContainerRunning {
    param([string]$ContainerName)
    
    $container = docker ps --filter "name=$ContainerName" --format "{{.Names}}" 2>$null
    return $container -eq $ContainerName
}

# Função para verificar se um container existe (rodando ou parado)
function Test-ContainerExists {
    param([string]$ContainerName)
    
    $container = docker ps -a --filter "name=$ContainerName" --format "{{.Names}}" 2>$null
    return $container -eq $ContainerName
}

# Verificar e iniciar PostgreSQL
Write-Host "📊 Verificando PostgreSQL..." -ForegroundColor Yellow
if (Test-ContainerRunning "chatwit_postgres_dev") {
    Write-Host "✅ PostgreSQL já está rodando" -ForegroundColor Green
} elseif (Test-ContainerExists "chatwit_postgres_dev") {
    Write-Host "🔄 Iniciando PostgreSQL..." -ForegroundColor Yellow
    docker start chatwit_postgres_dev
} else {
    Write-Host "🏗️ Criando e iniciando PostgreSQL..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml up -d postgres
}

# Verificar e iniciar Redis
Write-Host "🔴 Verificando Redis..." -ForegroundColor Yellow
if (Test-ContainerRunning "chatwit_redis_dev") {
    Write-Host "✅ Redis já está rodando" -ForegroundColor Green
} elseif (Test-ContainerExists "chatwit_redis_dev") {
    Write-Host "🔄 Iniciando Redis..." -ForegroundColor Yellow
    docker start chatwit_redis_dev
} else {
    Write-Host "🏗️ Criando e iniciando Redis..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml up -d redis
}

# Aguardar serviços ficarem prontos
Write-Host "⏳ Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verificar status dos serviços
Write-Host "`n📋 Status dos serviços:" -ForegroundColor Cyan
docker ps --filter "name=chatwit_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Verificar conectividade do PostgreSQL
Write-Host "`n🔍 Testando conectividade do PostgreSQL..." -ForegroundColor Yellow
try {
    $testConnection = docker exec chatwit_postgres_dev pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL está pronto para conexões" -ForegroundColor Green
    } else {
        Write-Host "⚠️ PostgreSQL ainda não está pronto, aguarde alguns segundos..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Erro ao testar PostgreSQL: $($_.Exception.Message)" -ForegroundColor Red
}

# Verificar conectividade do Redis
Write-Host "🔍 Testando conectividade do Redis..." -ForegroundColor Yellow
try {
    $testRedis = docker exec chatwit_redis_dev redis-cli ping 2>$null
    if ($testRedis -eq "PONG") {
        Write-Host "✅ Redis está pronto para conexões" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Redis ainda não está pronto, aguarde alguns segundos..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Erro ao testar Redis: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Serviços de desenvolvimento iniciados!" -ForegroundColor Green
Write-Host "💡 Para parar os serviços, execute: docker-compose -f docker-compose.dev.yml down" -ForegroundColor Cyan
Write-Host "💡 Para ver logs, execute: docker-compose -f docker-compose.dev.yml logs -f" -ForegroundColor Cyan 