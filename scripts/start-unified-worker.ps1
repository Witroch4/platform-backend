# scripts/start-unified-worker.ps1
# Script PowerShell para iniciar o worker unificado em desenvolvimento Windows

Write-Host "🚀 Iniciando Worker Unificado do SocialWise..." -ForegroundColor Green
Write-Host "🕒 $(Get-Date)" -ForegroundColor Gray
Write-Host "🏗️ Ambiente: $($env:NODE_ENV)" -ForegroundColor Gray
Write-Host "📂 Diretório: $(Get-Location)" -ForegroundColor Gray

# Verificar se estamos no diretório correto
if (-not (Test-Path "worker/init.ts")) {
    Write-Host "❌ Erro: Arquivo worker/init.ts não encontrado!" -ForegroundColor Red
    Write-Host "🔧 Certifique-se de estar no diretório raiz do projeto" -ForegroundColor Yellow
    exit 1
}

# Verificar se o Node.js está instalado
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js detectado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado! Instale o Node.js primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se tsx está disponível
try {
    pnpm exec tsx --version | Out-Null
    Write-Host "✅ tsx disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ tsx não encontrado! Execute: pnpm install" -ForegroundColor Red
    exit 1
}

# Configurar variáveis de ambiente para desenvolvimento
$env:WORKER_TYPE = "unified"
$env:WORKER_NAME = "socialwise-unified-worker-dev"

# Verificar configurações
Write-Host "🔄 Verificando configurações..." -ForegroundColor Yellow

if ($env:REDIS_URL) {
    Write-Host "✅ Redis configurado: $($env:REDIS_URL)" -ForegroundColor Green
} else {
    Write-Host "⚠️ REDIS_URL não configurado" -ForegroundColor Yellow
}

if ($env:DATABASE_URL) {
    Write-Host "✅ PostgreSQL configurado" -ForegroundColor Green
} else {
    Write-Host "❌ DATABASE_URL não configurado" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎯 Iniciando worker unificado em modo desenvolvimento..." -ForegroundColor Cyan
Write-Host "📊 Configurações:" -ForegroundColor Gray
Write-Host "   - LEADS_CHATWIT_CONCURRENCY: $($env:LEADS_CHATWIT_CONCURRENCY ?? '5')" -ForegroundColor Gray
Write-Host "   - LEADS_CHATWIT_LOCK_DURATION: $($env:LEADS_CHATWIT_LOCK_DURATION ?? '60000')" -ForegroundColor Gray
Write-Host "   - WEBHOOK_DIRECT_PROCESSING: $($env:WEBHOOK_DIRECT_PROCESSING ?? 'true')" -ForegroundColor Gray

Write-Host ""
Write-Host "📋 Workers inclusos:" -ForegroundColor Cyan
Write-Host "   - Parent Worker (High & Low Priority)" -ForegroundColor Gray
Write-Host "   - Instagram Automation Worker" -ForegroundColor Gray
Write-Host "   - AI Integration Workers" -ForegroundColor Gray
Write-Host "   - Manuscrito Worker" -ForegroundColor Gray
Write-Host "   - Leads Chatwit Worker" -ForegroundColor Gray
Write-Host "   - Instagram Translation Worker" -ForegroundColor Gray

Write-Host ""
Write-Host "⚠️ Para parar o worker, pressione Ctrl+C" -ForegroundColor Yellow
Write-Host "=================================="

# Função de cleanup
$cleanup = {
    Write-Host ""
    Write-Host "🛑 Encerrando worker unificado..." -ForegroundColor Yellow
    Write-Host "✅ Worker encerrado" -ForegroundColor Green
}

# Registrar cleanup para Ctrl+C
Register-EngineEvent PowerShell.Exiting -Action $cleanup

try {
    # Iniciar o worker usando tsx
    pnpm exec tsx --tsconfig tsconfig.worker.json worker/init.ts
} catch {
    Write-Host "❌ Erro ao iniciar worker: $_" -ForegroundColor Red
    exit 1
} finally {
    Write-Host "🏁 Worker unificado encerrado" -ForegroundColor Gray
}
