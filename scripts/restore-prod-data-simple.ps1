# Script simples para restaurar dados no banco de produção
# Uso: .\scripts\restore-prod-data-simple.ps1

$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"

Write-Host "Restaurando dados no banco de producao..." -ForegroundColor Green
npx tsx prisma/seed.ts 