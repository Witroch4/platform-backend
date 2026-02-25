# Script para resetar banco de dados (dev ou produção)
# Autor: Witalo Rocha
# Data: 2025-08-02

Write-Host "🗄️  Script de Reset de Banco de Dados" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Escolha o ambiente:" -ForegroundColor Yellow
Write-Host "1. Desenvolvimento (localhost)" -ForegroundColor White
Write-Host "2. Produção (188.245.200.61)" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Digite 1 ou 2"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "🖥️  Modo: DESENVOLVIMENTO" -ForegroundColor Green
    Write-Host "   Banco: localhost:5432/socialwise" -ForegroundColor Gray
    
    # Usar o .env local (desenvolvimento)
    if (Test-Path ".env") {
        Write-Host "   Usando configuração do .env local" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Arquivo .env não encontrado" -ForegroundColor Yellow
    }
    
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "🌐 Modo: PRODUÇÃO" -ForegroundColor Red
    Write-Host "   Banco: 188.245.200.61:5432/socialwise" -ForegroundColor Gray
    
    # Configurar para produção
    $env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"
    
    Write-Host "   ⚠️  ATENÇÃO: Você está prestes a resetar o banco de PRODUÇÃO!" -ForegroundColor Red
    Write-Host "   Todos os dados serão perdidos!" -ForegroundColor Red
    Write-Host ""
    
    $confirmation = Read-Host "Digite 'SIM' para confirmar que quer resetar o banco de PRODUÇÃO"
    
    if ($confirmation -ne "SIM") {
        Write-Host "❌ Operação cancelada." -ForegroundColor Red
        exit 1
    }
    
} else {
    Write-Host "❌ Opção inválida. Use 1 ou 2." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Executando reset do banco de dados..." -ForegroundColor Yellow

try {
    npx prisma migrate reset --force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Reset concluído com sucesso!" -ForegroundColor Green
        Write-Host "✅ Seed executado!" -ForegroundColor Green
        Write-Host "✅ Dados restaurados!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Erro durante o reset." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Erro inesperado:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Operação concluída!" -ForegroundColor Green 