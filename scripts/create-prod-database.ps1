# Script simples para criar banco de dados de produção
# Uso: .\scripts\create-prod-database.ps1

Write-Host "Criando banco de dados de producao..." -ForegroundColor Green

# Conectar ao banco postgres para criar o socialwise
$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/postgres"

Write-Host "Aplicando schema ao banco..." -ForegroundColor Yellow
npx prisma db push --accept-data-loss

if ($LASTEXITCODE -eq 0) {
    Write-Host "Banco de dados criado com sucesso!" -ForegroundColor Green
    Write-Host "Agora voce pode executar o script de restauracao." -ForegroundColor Yellow
} else {
    Write-Host "Erro ao criar banco de dados." -ForegroundColor Red
} 