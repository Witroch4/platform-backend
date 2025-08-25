# Script para build e deploy da nova arquitetura unificada de workers
# PowerShell script para Windows

Write-Host "🚀 Iniciando build e deploy da arquitetura unificada de workers..." -ForegroundColor Green

# Verificar se estamos no diretório correto
if (!(Test-Path "package.json")) {
    Write-Error "❌ Execute este script no diretório raiz do projeto!"
    exit 1
}

# 1. Verificar TypeScript
Write-Host "📝 Verificando TypeScript..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Erros de TypeScript encontrados!"
    exit 1
}
Write-Host "✅ TypeScript OK" -ForegroundColor Green

# 2. Build da aplicação
Write-Host "🔨 Fazendo build da aplicação..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Erro no build!"
    exit 1
}
Write-Host "✅ Build concluído" -ForegroundColor Green

# 3. Build das imagens Docker
Write-Host "🐳 Fazendo build das imagens Docker..." -ForegroundColor Yellow
docker compose -f docker-compose-produção.yaml build
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Erro no build Docker!"
    exit 1
}
Write-Host "✅ Build Docker concluído" -ForegroundColor Green

# 4. Verificar se os serviços estão rodando
Write-Host "🔍 Verificando serviços em execução..." -ForegroundColor Yellow
$services = docker compose -f docker-compose-produção.yaml ps --services --filter "status=running"

if ($services -contains "worker_automacao" -or $services -contains "worker_webhook") {
    Write-Host "⚠️  Detectados workers antigos rodando. Parando serviços..." -ForegroundColor Yellow
    docker compose -f docker-compose-produção.yaml down
    Start-Sleep -Seconds 5
}

# 5. Iniciar os novos serviços
Write-Host "🎉 Iniciando arquitetura unificada de workers..." -ForegroundColor Green
docker compose -f docker-compose-produção.yaml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 ========================================" -ForegroundColor Green
    Write-Host "🎉 DEPLOY CONCLUÍDO COM SUCESSO!" -ForegroundColor Green  
    Write-Host "🎉 ========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Serviços ativos:" -ForegroundColor Cyan
    Write-Host "   - socialwise_app (aplicação principal)" -ForegroundColor White
    Write-Host "   - worker (TODOS os workers unificados)" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 Para monitorar os logs:" -ForegroundColor Cyan
    Write-Host "   docker compose -f docker-compose-produção.yaml logs -f worker" -ForegroundColor White
    Write-Host ""
    Write-Host "📈 Para verificar status:" -ForegroundColor Cyan
    Write-Host "   docker compose -f docker-compose-produção.yaml ps" -ForegroundColor White
} else {
    Write-Error "❌ Erro ao iniciar os serviços!"
    exit 1
}
