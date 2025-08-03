# Script para resetar e popular o banco de dados de produção
# Autor: Witalo Rocha
# Data: 2025-08-02

Write-Host "🚀 Iniciando reset e seed do banco de dados de PRODUÇÃO..." -ForegroundColor Green
Write-Host ""

# Configurar a variável de ambiente para o banco de produção
$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"

Write-Host "📊 Configuração do banco:" -ForegroundColor Yellow
Write-Host "   Host: 188.245.200.61:5432" -ForegroundColor Gray
Write-Host "   Database: socialwise" -ForegroundColor Gray
Write-Host "   User: postgres" -ForegroundColor Gray
Write-Host ""

# Confirmar com o usuário
Write-Host "⚠️  ATENÇÃO: Este comando irá APAGAR TODOS os dados do banco de PRODUÇÃO!" -ForegroundColor Red
Write-Host "   Todos os dados existentes serão perdidos permanentemente." -ForegroundColor Red
Write-Host ""

$confirmation = Read-Host "🤔 Tem certeza que deseja continuar? (digite 'SIM' para confirmar)"

if ($confirmation -ne "SIM") {
    Write-Host "❌ Operação cancelada pelo usuário." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Iniciando reset do banco de dados..." -ForegroundColor Yellow

try {
    # Executar o reset do Prisma
    Write-Host "   Executando: npx prisma migrate reset --force" -ForegroundColor Gray
    npx prisma migrate reset --force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Reset do banco de dados concluído com sucesso!" -ForegroundColor Green
        Write-Host "✅ Seed automático executado!" -ForegroundColor Green
        Write-Host "✅ Dados restaurados do backup!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Banco de dados de produção está pronto para uso!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Erro durante o reset do banco de dados." -ForegroundColor Red
        Write-Host "   Verifique a conexão e tente novamente." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Erro inesperado:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Resumo da operação:" -ForegroundColor Cyan
Write-Host "   ✅ Banco resetado" -ForegroundColor Green
Write-Host "   ✅ Migrações aplicadas" -ForegroundColor Green
Write-Host "   ✅ Seed executado" -ForegroundColor Green
Write-Host "   ✅ Dados restaurados" -ForegroundColor Green
Write-Host ""
Write-Host "🏁 Script concluído!" -ForegroundColor Green 