# scripts/fix-prisma-migration.ps1
# Script PowerShell para resolver problemas de migração no Prisma

Write-Host "🔧 Resolvendo problemas de migração do Prisma..." -ForegroundColor Yellow
Write-Host "🕒 $(Get-Date)" -ForegroundColor Gray
Write-Host "=================================="

# Verificar se DATABASE_URL está configurado
if (-not $env:DATABASE_URL) {
    Write-Host "❌ DATABASE_URL não está configurado!" -ForegroundColor Red
    Write-Host "Configure a variável de ambiente DATABASE_URL primeiro." -ForegroundColor Yellow
    exit 1
}

Write-Host "📊 Status atual das migrações:" -ForegroundColor Cyan
try {
    npx prisma migrate status
} catch {
    Write-Host "⚠️ Erro ao verificar status das migrações: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔧 Tentando resolver migração falha..." -ForegroundColor Yellow

Write-Host "📋 Opções disponíveis:" -ForegroundColor Cyan
Write-Host "1. Marcar migração como resolvida (se já foi aplicada)" -ForegroundColor Gray
Write-Host "2. Reverter e reaplicar migração" -ForegroundColor Gray
Write-Host "3. Reset completo do banco (CUIDADO!)" -ForegroundColor Gray

# Por padrão, vamos tentar resolver marcando como aplicada
Write-Host "🔄 Tentando marcar migração como resolvida..." -ForegroundColor Yellow
try {
    npx prisma migrate resolve --applied 20250825155851_init
    Write-Host "✅ Migração marcada como resolvida" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao marcar migração como resolvida: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "🔄 Tentando aplicar migrações pendentes..." -ForegroundColor Yellow
try {
    npx prisma migrate deploy
    Write-Host "✅ Migrações aplicadas com sucesso" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao aplicar migrações: $_" -ForegroundColor Red
    Write-Host "🔧 Tente executar 'npx prisma migrate reset' se necessário" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📊 Status final das migrações:" -ForegroundColor Cyan
try {
    npx prisma migrate status
} catch {
    Write-Host "⚠️ Erro ao verificar status final: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Script de correção concluído!" -ForegroundColor Green
Write-Host "=================================="
