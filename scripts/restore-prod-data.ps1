# Script para restaurar dados do backup no banco de produção
# Autor: Witalo Rocha
# Data: 2025-08-02

Write-Host "Iniciando restauracao de dados no banco de PRODUCAO..." -ForegroundColor Green
Write-Host ""

# Configurar a variável de ambiente para o banco de produção
$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"

Write-Host "Configuracao do banco:" -ForegroundColor Yellow
Write-Host "   Host: 188.245.200.61:5432" -ForegroundColor Gray
Write-Host "   Database: socialwise" -ForegroundColor Gray
Write-Host "   User: postgres" -ForegroundColor Gray
Write-Host ""

# Confirmar com o usuário
Write-Host "ATENCAO: Este comando ira RESTAURAR dados do backup no banco de PRODUCAO!" -ForegroundColor Yellow
Write-Host "   Os dados existentes podem ser sobrescritos." -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Tem certeza que deseja continuar? (digite 'SIM' para confirmar)"

if ($confirmation -ne "SIM") {
    Write-Host "Operacao cancelada pelo usuario." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Iniciando restauracao de dados..." -ForegroundColor Yellow

try {
    # Executar apenas o seed (que inclui a restauração do backup)
    Write-Host "   Executando: npx tsx prisma/seed.ts" -ForegroundColor Gray
    npx tsx prisma/seed.ts
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Restauracao de dados concluida com sucesso!" -ForegroundColor Green
        Write-Host "Seed executado!" -ForegroundColor Green
        Write-Host "Dados do backup restaurados!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Banco de dados de producao atualizado!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Erro durante a restauracao de dados." -ForegroundColor Red
        Write-Host "   Verifique a conexao e tente novamente." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Erro inesperado:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Resumo da operacao:" -ForegroundColor Cyan
Write-Host "   Dados restaurados do backup" -ForegroundColor Green
Write-Host "   Seed executado" -ForegroundColor Green
Write-Host "   Banco atualizado" -ForegroundColor Green
Write-Host ""
Write-Host "Script concluido!" -ForegroundColor Green 