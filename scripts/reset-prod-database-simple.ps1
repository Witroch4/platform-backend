# Script simples para resetar banco de produção
# Uso: .\scripts\reset-prod-database-simple.ps1

$env:DATABASE_URL = "postgresql://postgres:WITrdN6835yt8roch4WITrdNwit2357ytwqw466tgroch4696WIT@188.245.200.61:5432/socialwise"

Write-Host "🚀 Resetando banco de produção..." -ForegroundColor Green
npx prisma migrate reset --force 