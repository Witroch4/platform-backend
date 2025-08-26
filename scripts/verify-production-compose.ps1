# scripts/verify-production-compose.ps1
# Script para verificar se o docker-compose-produção.yaml está correto

Write-Host "🔍 Verificando docker-compose-produção.yaml..." -ForegroundColor Cyan
Write-Host "🕒 $(Get-Date)" -ForegroundColor Gray
Write-Host "=================================="

$ErrorCount = 0

# Verificar se o arquivo existe
if (-not (Test-Path "docker-compose-produção.yaml")) {
    Write-Host "❌ docker-compose-produção.yaml não encontrado!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ docker-compose-produção.yaml encontrado" -ForegroundColor Green

# Verificar se o Docker está rodando
try {
    docker version | Out-Null
    Write-Host "✅ Docker está rodando" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não está rodando!" -ForegroundColor Red
    $ErrorCount++
}

# Verificar sintaxe do docker-compose
Write-Host ""
Write-Host "🔍 Verificando sintaxe do docker-compose..." -ForegroundColor Yellow

try {
    $composeCheck = docker compose -f docker-compose-produção.yaml config
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Sintaxe do docker-compose está correta" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro na sintaxe do docker-compose" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "❌ Erro ao verificar sintaxe: $_" -ForegroundColor Red
    $ErrorCount++
}

# Verificar se os arquivos necessários existem
Write-Host ""
Write-Host "🔍 Verificando arquivos necessários..." -ForegroundColor Yellow

$requiredFiles = @(
    "server.js",
    "Dockerfile.prod", 
    "package.json",
    "worker/init.ts",
    "scripts/start-unified-worker.sh"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file existe" -ForegroundColor Green
    } else {
        Write-Host "❌ $file não encontrado" -ForegroundColor Red
        $ErrorCount++
    }
}

# Verificar porta no server.js
Write-Host ""
Write-Host "🔍 Verificando configuração de porta..." -ForegroundColor Yellow

if (Test-Path "server.js") {
    $serverContent = Get-Content "server.js" -Raw
    if ($serverContent -match "server\.listen\(3002") {
        Write-Host "✅ Server.js configurado para porta 3002" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Server.js pode não estar na porta 3002" -ForegroundColor Yellow
    }
}

# Verificar se o Dockerfile.prod expõe a porta correta
if (Test-Path "Dockerfile.prod") {
    $dockerContent = Get-Content "Dockerfile.prod" -Raw
    if ($dockerContent -match "EXPOSE 3002") {
        Write-Host "✅ Dockerfile.prod expõe porta 3002" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Dockerfile.prod pode não expor porta 3002" -ForegroundColor Yellow
    }
}

# Verificar labels do Traefik no docker-compose
$composeContent = Get-Content "docker-compose-produção.yaml" -Raw
if ($composeContent -match "server\.port=3002") {
    Write-Host "✅ Traefik configurado para porta 3002" -ForegroundColor Green
} else {
    Write-Host "⚠️ Traefik pode não estar configurado para porta 3002" -ForegroundColor Yellow
}

# Verificar worker unificado
Write-Host ""
Write-Host "🔍 Verificando configuração do worker unificado..." -ForegroundColor Yellow

if ($composeContent -match "node /app/dist/worker/init\.js") {
    Write-Host "✅ Worker unificado configurado corretamente" -ForegroundColor Green
} else {
    Write-Host "❌ Worker unificado não configurado" -ForegroundColor Red
    $ErrorCount++
}

# Verificar recursos do worker
if ($composeContent -match 'cpus: "3\.0"' -and $composeContent -match 'memory: 6G') {
    Write-Host "✅ Recursos do worker configurados (3 CPUs, 6GB RAM)" -ForegroundColor Green
} else {
    Write-Host "⚠️ Recursos do worker podem não estar otimizados" -ForegroundColor Yellow
}

# Verificar se há Redis e Database URLs
if ($composeContent -match "REDIS_URL:" -and $composeContent -match "DATABASE_URL:") {
    Write-Host "✅ URLs de Redis e Database configuradas" -ForegroundColor Green
} else {
    Write-Host "❌ URLs de Redis ou Database não configuradas" -ForegroundColor Red
    $ErrorCount++
}

# Verificar volumes e networks externos
if ($composeContent -match "external: true") {
    Write-Host "✅ Volumes e networks externos configurados" -ForegroundColor Green
} else {
    Write-Host "⚠️ Volumes ou networks podem não estar configurados como externos" -ForegroundColor Yellow
}

# Verificar se há configurações do Portainer (labels para deploy)
if ($composeContent -match "deploy:" -and $composeContent -match "placement:") {
    Write-Host "✅ Configurações do Portainer/Docker Swarm presentes" -ForegroundColor Green
} else {
    Write-Host "⚠️ Configurações do Portainer podem estar incompletas" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=================================="

if ($ErrorCount -eq 0) {
    Write-Host "🎉 Verificação concluída com sucesso!" -ForegroundColor Green
    Write-Host "✅ docker-compose-produção.yaml está pronto para o Portainer" -ForegroundColor Green
} else {
    Write-Host "⚠️ Verificação concluída com $ErrorCount erro(s)" -ForegroundColor Yellow
    Write-Host "🔧 Corrija os erros antes de usar no Portainer" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Próximos passos para o Portainer:"
Write-Host "1. Crie o volume externo: docker volume create chatwit_temp"
Write-Host "2. Crie a rede externa: docker network create minha_rede"
Write-Host "3. Configure as variáveis de ambiente no Portainer"
Write-Host "4. Execute: docker stack deploy -c docker-compose-produção.yaml socialwise"

exit $ErrorCount
