# Script para configurar banco de dados de produção
# Autor: Witalo Rocha
# Data: 2025-08-02

Write-Host "Configurando banco de dados de PRODUCAO..." -ForegroundColor Green
Write-Host ""

# Configurar a variável de ambiente para o banco de produção
$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"

Write-Host "Configuracao do banco:" -ForegroundColor Yellow
Write-Host "   Host: 188.245.200.61:5432" -ForegroundColor Gray
Write-Host "   Database: socialwise" -ForegroundColor Gray
Write-Host "   User: postgres" -ForegroundColor Gray
Write-Host ""

# Confirmar com o usuário
Write-Host "ATENCAO: Este comando ira configurar o banco de PRODUCAO!" -ForegroundColor Yellow
Write-Host "   - Criar banco de dados (se nao existir)" -ForegroundColor Yellow
Write-Host "   - Aplicar migracoes" -ForegroundColor Yellow
Write-Host "   - Restaurar dados do backup" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Tem certeza que deseja continuar? (digite 'SIM' para confirmar)"

if ($confirmation -ne "SIM") {
    Write-Host "Operacao cancelada pelo usuario." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Passo 1: Criando banco de dados..." -ForegroundColor Yellow

try {
    # Primeiro, conectar sem especificar o banco para criar o banco
    $env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/postgres"
    
    Write-Host "   Conectando ao servidor PostgreSQL..." -ForegroundColor Gray
    Write-Host "   Criando banco 'socialwise'..." -ForegroundColor Gray
    
    # Usar psql para criar o banco (se disponível) ou usar Prisma
    npx prisma db push --accept-data-loss
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Banco de dados criado/verificado com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "   Erro ao criar banco de dados." -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "   Erro ao criar banco de dados:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Passo 2: Aplicando migracoes..." -ForegroundColor Yellow

try {
    # Voltar para a URL do banco socialwise
    $env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"
    
    Write-Host "   Aplicando migracoes..." -ForegroundColor Gray
    npx prisma migrate deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Migracoes aplicadas com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "   Erro ao aplicar migracoes." -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "   Erro ao aplicar migracoes:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Passo 3: Restaurando dados..." -ForegroundColor Yellow

try {
    Write-Host "   Executando seed e restore..." -ForegroundColor Gray
    npx tsx prisma/seed.ts
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Dados restaurados com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "   Erro ao restaurar dados." -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "   Erro ao restaurar dados:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Resumo da operacao:" -ForegroundColor Cyan
Write-Host "   Banco de dados criado" -ForegroundColor Green
Write-Host "   Migracoes aplicadas" -ForegroundColor Green
Write-Host "   Dados restaurados" -ForegroundColor Green
Write-Host ""
Write-Host "Banco de dados de producao configurado com sucesso!" -ForegroundColor Green 